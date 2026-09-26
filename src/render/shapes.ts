// W5-D shapes (SHP-001, SHP-003, SHP-005, SHP-006, SHP-015): a shape layer's
// kind, fill, stroke and corner radius live in its property record (schema
// unchanged, D-033 pattern) and are read defensively here. The preview and
// the export worker draw shapes with `drawShape`; boolean operations use
// `shapePolygons` in world space.
import { transformPoint, type AffineMatrix, type Point2 } from '../core';
import type { SceneLayer } from './adapter';

export const SHAPE_KINDS = [
  'rectangle',
  'ellipse',
  'line',
  'arrow',
  'path',
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];
export const STROKE_DASHES = ['solid', 'dash', 'dot'] as const;
export const STROKE_CAPS = ['butt', 'round', 'square'] as const;
export const STROKE_JOINS = ['miter', 'round', 'bevel'] as const;
export type StrokeDash = (typeof STROKE_DASHES)[number];
export const MAX_STROKE = 200;
export const MAX_RADIUS = 10000;
/** Boolean results are capped so a stored outline stays small. */
export const MAX_POLYGON_POINTS = 20000;

/** A polygon ring, a polygon (outer ring then holes) and a set of polygons. */
export type Ring = Point2[];
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

export interface ShapeStyle {
  readonly kind: ShapeKind;
  /** The fill color, or null for no fill (lines never fill). */
  readonly fill: string | null;
  readonly fillOpacity: number;
  /** The stroke color, or null when the stroke width is 0. */
  readonly stroke: string | null;
  readonly strokeWidth: number;
  readonly dash: StrokeDash;
  readonly cap: CanvasLineCap;
  readonly join: CanvasLineJoin;
  readonly radius: number;
  /** Local outline of a boolean result (kind `path`). */
  readonly polygons?: MultiPolygon;
}

const COLOR = /^#[0-9a-fA-F]{6}$/;
/** Lines and arrows are open: they have a stroke and no area. */
export const isClosedKind = (kind: ShapeKind) =>
  kind === 'rectangle' || kind === 'ellipse' || kind === 'path';

export function parsePolygons(text: string): MultiPolygon | null {
  try {
    const value: unknown = JSON.parse(text);
    let points = 0;
    const point = (item: unknown): item is Point2 =>
      Array.isArray(item) &&
      item.length === 2 &&
      item.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
      ++points <= MAX_POLYGON_POINTS;
    const ring = (item: unknown) =>
      Array.isArray(item) && item.length >= 3 && item.every(point);
    const polygon = (item: unknown) =>
      Array.isArray(item) && item.length >= 1 && item.every(ring);
    return Array.isArray(value) && value.length >= 1 && value.every(polygon)
      ? (value as MultiPolygon)
      : null;
  } catch {
    return null;
  }
}

export const formatPolygons = (polygons: MultiPolygon) =>
  JSON.stringify(
    polygons.map((polygon) =>
      polygon.map((ring) =>
        ring.map(([x, y]) => [
          Math.round(x * 1000) / 1000,
          Math.round(y * 1000) / 1000,
        ]),
      ),
    ),
  );

/** A shape layer's style, or null for drawings and other layer types. */
export function shapeOf(layer: SceneLayer): ShapeStyle | null {
  const p = layer.properties;
  if (layer.type !== 'shape' || p.path) return null;
  const string = (key: string) =>
    p[key]?.type === 'string' ? (p[key]!.value as string) : undefined;
  const numeric = (key: string) =>
    p[key]?.type === 'number' ? (p[key]!.value as number) : undefined;
  const color = (key: string) => {
    const value = p[key];
    return value?.type === 'color' && COLOR.test(value.value.slice(0, 7))
      ? value.value.slice(0, 7)
      : undefined;
  };
  const oneOf = <T extends string>(
    list: readonly T[],
    value: string | undefined,
    fallback: T,
  ) =>
    (list as readonly string[]).includes(value ?? '') ? (value as T) : fallback;
  const kindValue = oneOf(SHAPE_KINDS, string('shapeKind'), 'rectangle');
  const polygons =
    kindValue === 'path' ? parsePolygons(string('polygon') ?? '') : null;
  const kind: ShapeKind =
    kindValue === 'path' && !polygons ? 'rectangle' : kindValue;
  const open = !isClosedKind(kind);
  const width = numeric('strokeWidth');
  const strokeWidth =
    width !== undefined && width >= 0 && width <= MAX_STROKE
      ? width
      : open
        ? 6
        : 0;
  const opacity = numeric('fillOpacity');
  const radius = numeric('cornerRadius');
  const enabled = p.fillEnabled;
  return {
    kind,
    fill:
      open || (enabled?.type === 'boolean' && !enabled.value)
        ? null
        : (color('fill') ?? '#b1a0ed'),
    fillOpacity:
      opacity !== undefined && opacity >= 0 && opacity <= 1 ? opacity : 1,
    stroke: strokeWidth > 0 ? (color('stroke') ?? '#272b29') : null,
    strokeWidth,
    dash: oneOf(STROKE_DASHES, string('strokeDash'), 'solid'),
    cap: oneOf(STROKE_CAPS, string('strokeCap'), open ? 'round' : 'butt'),
    join: oneOf(STROKE_JOINS, string('strokeJoin'), 'miter'),
    radius:
      kind === 'rectangle' &&
      radius !== undefined &&
      radius >= 0 &&
      radius <= MAX_RADIUS
        ? radius
        : 0,
    ...(polygons ? { polygons } : {}),
  };
}

const ARROW_HEAD = (width: number) => Math.max(12, width * 3);

/** The rounded-rectangle radius that fits a box. */
const fitRadius = (radius: number, width: number, height: number) =>
  Math.max(0, Math.min(radius, width / 2, height / 2));

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function tracePath(context: Context, polygons: MultiPolygon) {
  for (const polygon of polygons)
    for (const ring of polygon) {
      ring.forEach(([x, y], index) =>
        index ? context.lineTo(x, y) : context.moveTo(x, y),
      );
      context.closePath();
    }
}

/**
 * Draws a shape in its local box. Closed shapes keep their stroke inside the
 * box (the path is inset by half the width); boolean paths stroke centered.
 */
export function drawShape(
  context: Context,
  shape: ShapeStyle,
  width: number,
  height: number,
) {
  // A plain filled rectangle draws exactly as before shapes existed.
  if (shape.kind === 'rectangle' && !shape.radius && !shape.stroke) {
    if (!shape.fill) return;
    const alpha = context.globalAlpha;
    context.globalAlpha = alpha * shape.fillOpacity;
    context.fillStyle = shape.fill;
    context.fillRect(0, 0, width, height);
    context.globalAlpha = alpha;
    return;
  }
  const w = shape.strokeWidth;
  context.lineWidth = w;
  context.lineCap = shape.cap;
  context.lineJoin = shape.join;
  context.setLineDash(
    shape.dash === 'dash'
      ? [w * 3, w * 2]
      : shape.dash === 'dot'
        ? [w, w * 1.5]
        : [],
  );
  if (shape.stroke) context.strokeStyle = shape.stroke;
  if (shape.kind === 'line' || shape.kind === 'arrow') {
    const y = height / 2;
    const head =
      shape.kind === 'arrow' ? Math.min(ARROW_HEAD(w), width / 2) : 0;
    const end = width - (shape.kind === 'arrow' ? head * 0.8 : 0);
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(end, y);
    if (shape.stroke) context.stroke();
    if (shape.kind === 'arrow' && shape.stroke) {
      context.setLineDash([]);
      context.fillStyle = shape.stroke;
      context.beginPath();
      context.moveTo(width, y);
      context.lineTo(width - head, y - head / 2);
      context.lineTo(width - head, y + head / 2);
      context.closePath();
      context.fill();
    }
    return;
  }
  const inset = shape.kind === 'path' ? 0 : w / 2;
  context.beginPath();
  if (shape.kind === 'ellipse')
    context.ellipse(
      width / 2,
      height / 2,
      Math.max(0, width / 2 - inset),
      Math.max(0, height / 2 - inset),
      0,
      0,
      Math.PI * 2,
    );
  else if (shape.kind === 'path') tracePath(context, shape.polygons!);
  else {
    const innerWidth = Math.max(0, width - 2 * inset),
      innerHeight = Math.max(0, height - 2 * inset);
    context.roundRect(
      inset,
      inset,
      innerWidth,
      innerHeight,
      fitRadius(Math.max(0, shape.radius - inset), innerWidth, innerHeight),
    );
  }
  if (shape.fill) {
    const alpha = context.globalAlpha;
    context.globalAlpha = alpha * shape.fillOpacity;
    context.fillStyle = shape.fill;
    context.fill('evenodd');
    context.globalAlpha = alpha;
  }
  if (shape.stroke) context.stroke();
}

/** A closed shape's outline in world space, for boolean operations. */
export function shapePolygons(
  shape: ShapeStyle,
  width: number,
  height: number,
  matrix: AffineMatrix,
): MultiPolygon | null {
  if (!isClosedKind(shape.kind)) return null;
  const local: MultiPolygon =
    shape.kind === 'path'
      ? shape.polygons!
      : [
          [
            shape.kind === 'ellipse'
              ? ellipseRing(width, height)
              : roundRectRing(width, height, shape.radius),
          ],
        ];
  return local.map((polygon) =>
    polygon.map((ring) => ring.map((point) => transformPoint(matrix, point))),
  );
}

function ellipseRing(width: number, height: number): Ring {
  return Array.from({ length: 64 }, (_, index): Point2 => {
    const angle = (index / 64) * Math.PI * 2;
    return [
      width / 2 + (width / 2) * Math.cos(angle),
      height / 2 + (height / 2) * Math.sin(angle),
    ];
  });
}

function roundRectRing(width: number, height: number, radius: number): Ring {
  const r = fitRadius(radius, width, height);
  if (!r)
    return [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ];
  const corners: [number, number, number][] = [
    [width - r, r, -Math.PI / 2],
    [width - r, height - r, 0],
    [r, height - r, Math.PI / 2],
    [r, r, Math.PI],
  ];
  return corners.flatMap(([cx, cy, start]) =>
    Array.from({ length: 9 }, (_, index): Point2 => {
      const angle = start + (index / 8) * (Math.PI / 2);
      return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
    }),
  );
}
