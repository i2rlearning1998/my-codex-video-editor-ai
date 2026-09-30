// SHP-018/SHP-019 freehand drawings: a `shape` layer whose string `path`
// property holds local points (D-068). Pure helpers shared by the renderer and
// the Draw tool; everything read from a layer is validated defensively.
// G4: four brushes that draw differently, and paths made of several
// sub-strokes (separated by `;`) so an area eraser can cut a stroke in parts
// while it stays one layer.
import type { Point2 } from '../core';
import type { SceneLayer } from './adapter';

export const BRUSHES = ['pen', 'marker', 'highlighter', 'glow'] as const;
export type Brush = (typeof BRUSHES)[number];
/** The Draw panel's tools: the brushes and the Eraser. */
export const DRAW_MODES = [...BRUSHES, 'eraser'] as const;
export type DrawMode = (typeof DRAW_MODES)[number];
export const DEFAULT_DRAW_COLOR = '#ff4fa3';
/** Each brush starts with its own size, colour and opacity (G4). */
export const BRUSH_DEFAULTS: Readonly<
  Record<Brush, { size: number; opacity: number; color: string }>
> = {
  pen: { size: 4, opacity: 1, color: DEFAULT_DRAW_COLOR },
  marker: { size: 12, opacity: 1, color: DEFAULT_DRAW_COLOR },
  highlighter: { size: 24, opacity: 0.4, color: DEFAULT_DRAW_COLOR },
  glow: { size: 8, opacity: 1, color: '#35d7ff' },
};
export const MIN_BRUSH = 1;
export const MAX_BRUSH = 200;
/** Points closer than this (composition units) to the last one are skipped. */
export const MIN_POINT_GAP = 0.75;
const MAX_POINTS = 5000;

export interface DrawingPath {
  /** One or more sub-strokes, each of at least two points. */
  readonly strokes: readonly (readonly Point2[])[];
  readonly width: number;
  readonly color: string;
  readonly brush: Brush;
}
/** How a brush's stroke ends: the highlighter's chisel is flat. */
export const brushCap = (brush: Brush): 'round' | 'butt' =>
  brush === 'highlighter' ? 'butt' : 'round';

export const isBrush = (value: unknown): value is Brush =>
  typeof value === 'string' && (BRUSHES as readonly string[]).includes(value);

export function formatPath(points: readonly Point2[]): string {
  return points.map(([x, y]) => `${x} ${y}`).join(' ');
}
/** G4: sub-strokes joined by `;` (a single stroke has none). */
export function formatStrokes(strokes: readonly (readonly Point2[])[]): string {
  return strokes.map(formatPath).join(' ; ');
}
/** Null unless the text is an even list of at least two finite points. */
export function parsePath(text: string): Point2[] | null {
  const values = text.trim().split(/\s+/).map(Number);
  if (
    values.length < 4 ||
    values.length % 2 ||
    values.length > MAX_POINTS * 2 ||
    !values.every(Number.isFinite)
  )
    return null;
  const points: Point2[] = [];
  for (let index = 0; index < values.length; index += 2)
    points.push([values[index]!, values[index + 1]!]);
  return points;
}
/** Null unless every `;`-separated part is a valid path (5000 points total). */
export function parseStrokes(text: string): Point2[][] | null {
  const strokes = text.split(';').map(parsePath);
  if (!strokes.every((stroke): stroke is Point2[] => !!stroke)) return null;
  return strokes.reduce((sum, stroke) => sum + stroke.length, 0) > MAX_POINTS
    ? null
    : strokes;
}

/** Adds a point unless it is too close to the last one; keeps at most 5000. */
export function addPoint(points: Point2[], point: Point2): boolean {
  const last = points.at(-1);
  if (
    points.length >= MAX_POINTS ||
    !point.every(Number.isFinite) ||
    (last && Math.hypot(point[0] - last[0], point[1] - last[1]) < MIN_POINT_GAP)
  )
    return false;
  points.push(point);
  return true;
}

/**
 * G4 smoothing: a centred moving average over `radius` neighbours, twice,
 * keeping the first and last points where the pointer was.
 */
export function smoothStroke(points: readonly Point2[], radius = 2): Point2[] {
  let current = [...points];
  if (current.length < 5) return current;
  for (let pass = 0; pass < 2; pass++)
    current = current.map((point, index, all): Point2 => {
      if (index === 0 || index === all.length - 1) return point;
      const from = Math.max(0, index - radius);
      const to = Math.min(all.length - 1, index + radius);
      let x = 0,
        y = 0;
      for (let i = from; i <= to; i++) {
        x += all[i]![0];
        y += all[i]![1];
      }
      const count = to - from + 1;
      return [x / count, y / count];
    });
  return current;
}

/** A drawing layer's path, or null when the layer is not a (valid) drawing. */
export function drawingOf(layer: SceneLayer): DrawingPath | 'invalid' | null {
  const { path, brush, stroke, strokeWidth } = layer.properties;
  if (layer.type !== 'shape' || !path) return null;
  const strokes = path.type === 'string' ? parseStrokes(path.value) : null;
  const width =
    strokeWidth?.type === 'number' &&
    strokeWidth.value >= MIN_BRUSH &&
    strokeWidth.value <= MAX_BRUSH
      ? strokeWidth.value
      : null;
  if (!strokes || width === null) return 'invalid';
  return {
    strokes,
    width,
    color: stroke?.type === 'color' ? stroke.value : DEFAULT_DRAW_COLOR,
    brush:
      brush?.type === 'string' && isBrush(brush.value) ? brush.value : 'pen',
  };
}

/**
 * Local points and padded box for composition-space stroke points: the layer's
 * position is the box corner, and points sit half a brush width inside it.
 */
export function strokeGeometry(points: readonly Point2[], size: number) {
  const box = strokesGeometry([points], size);
  return { ...box, points: box.strokes[0]! };
}
/** The same for several sub-strokes (G4). */
export function strokesGeometry(
  strokes: readonly (readonly Point2[])[],
  size: number,
) {
  const pad = size / 2;
  const all = strokes.flat();
  const xs = all.map((point) => point[0]),
    ys = all.map((point) => point[1]);
  const x = Math.min(...xs) - pad,
    y = Math.min(...ys) - pad;
  return {
    position: [x, y] as Point2,
    strokes: strokes.map((stroke) =>
      stroke.map(([px, py]): Point2 => [px - x, py - y]),
    ),
    width: Math.max(...xs) - Math.min(...xs) + size,
    height: Math.max(...ys) - Math.min(...ys) + size,
  };
}

/** Re-pads a drawing for a new brush size, keeping its points in place. */
export function resizeBrush(
  strokes: readonly (readonly Point2[])[],
  oldSize: number,
  newSize: number,
) {
  const shift = (newSize - oldSize) / 2;
  const moved = strokes.map((stroke) =>
    stroke.map(([x, y]): Point2 => [x + shift, y + shift]),
  );
  const all = moved.flat();
  const xs = all.map((point) => point[0]),
    ys = all.map((point) => point[1]);
  return {
    shift,
    strokes: moved,
    width: Math.max(...xs) - Math.min(...xs) + newSize,
    height: Math.max(...ys) - Math.min(...ys) + newSize,
  };
}

/**
 * G4 area eraser: the parts of the strokes (local units) that stay once an
 * eraser of `radius` has passed through `samples` (local units too). Each
 * stroke is resampled finely; the ink whose centre line lies under the eraser
 * (within its radius plus a quarter of the brush width) is removed, and what
 * remains is split into separate sub-strokes of at least two points.
 */
export function eraseStrokes(
  strokes: readonly (readonly Point2[])[],
  width: number,
  samples: readonly Point2[],
  radius: number,
): Point2[][] {
  const reach = radius + width / 4;
  const step = Math.max(0.5, Math.min(radius, width) / 3);
  const erased = (point: Point2) =>
    samples.some(
      (sample) =>
        Math.hypot(point[0] - sample[0], point[1] - sample[1]) <= reach,
    );
  const pieces: Point2[][] = [];
  for (const stroke of strokes) {
    if (!stroke.some(erased) && !touches(stroke, samples, reach)) {
      pieces.push([...stroke]);
      continue;
    }
    let piece: Point2[] = [];
    const flush = () => {
      if (piece.length >= 2) pieces.push(piece);
      piece = [];
    };
    stroke.forEach((point, index) => {
      const next = stroke[index + 1];
      const length = next
        ? Math.hypot(next[0] - point[0], next[1] - point[1])
        : 0;
      const count = next ? Math.max(1, Math.ceil(length / step)) : 1;
      for (let i = 0; i < count; i++) {
        const t = next ? i / count : 0;
        const sample: Point2 = next
          ? [
              point[0] + (next[0] - point[0]) * t,
              point[1] + (next[1] - point[1]) * t,
            ]
          : point;
        if (erased(sample)) flush();
        else piece.push(sample);
      }
    });
    flush();
  }
  // Stay within the stored point limit by dropping every other point.
  let total = pieces.reduce((sum, piece) => sum + piece.length, 0);
  while (total > MAX_POINTS) {
    for (const piece of pieces)
      piece.splice(
        0,
        piece.length,
        ...piece.filter((_, i) => i % 2 === 0 || i === piece.length - 1),
      );
    total = pieces.reduce((sum, piece) => sum + piece.length, 0);
  }
  return pieces;
}
/** Whether a segment of the stroke passes within `reach` of a sample. */
function touches(
  stroke: readonly Point2[],
  samples: readonly Point2[],
  reach: number,
): boolean {
  return stroke.some((a, index) => {
    const b = stroke[index + 1];
    if (!b) return false;
    return samples.some((point) => segmentDistance(point, a, b) <= reach);
  });
}
export function segmentDistance(point: Point2, a: Point2, b: Point2): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length
    ? Math.max(
        0,
        Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length),
      )
    : 0;
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
}
