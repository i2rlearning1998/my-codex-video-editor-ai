// SHP-018/SHP-019 freehand drawings: a `shape` layer whose string `path`
// property holds local points (D-068). Pure helpers shared by the renderer and
// the Draw tool; everything read from a layer is validated defensively.
import type { Point2 } from '../core';
import type { SceneLayer } from './adapter';

export const BRUSHES = ['pen', 'marker', 'highlighter'] as const;
export type Brush = (typeof BRUSHES)[number];
export const BRUSH_DEFAULTS: Readonly<
  Record<Brush, { size: number; opacity: number }>
> = {
  pen: { size: 4, opacity: 1 },
  marker: { size: 12, opacity: 1 },
  highlighter: { size: 24, opacity: 0.4 },
};
export const DEFAULT_DRAW_COLOR = '#ff4fa3';
export const MIN_BRUSH = 1;
export const MAX_BRUSH = 200;
/** Points closer than this (composition units) to the last one are skipped. */
export const MIN_POINT_GAP = 0.75;
const MAX_POINTS = 5000;

export interface DrawingPath {
  readonly points: readonly Point2[];
  readonly width: number;
  readonly color: string;
  readonly cap: 'round' | 'butt';
}

export const isBrush = (value: unknown): value is Brush =>
  typeof value === 'string' && (BRUSHES as readonly string[]).includes(value);

export function formatPath(points: readonly Point2[]): string {
  return points.map(([x, y]) => `${x} ${y}`).join(' ');
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

/** A drawing layer's path, or null when the layer is not a (valid) drawing. */
export function drawingOf(layer: SceneLayer): DrawingPath | 'invalid' | null {
  const { path, brush, stroke, strokeWidth } = layer.properties;
  if (layer.type !== 'shape' || !path) return null;
  const points = path.type === 'string' ? parsePath(path.value) : null;
  const width =
    strokeWidth?.type === 'number' &&
    strokeWidth.value >= MIN_BRUSH &&
    strokeWidth.value <= MAX_BRUSH
      ? strokeWidth.value
      : null;
  if (!points || width === null) return 'invalid';
  return {
    points,
    width,
    color: stroke?.type === 'color' ? stroke.value : DEFAULT_DRAW_COLOR,
    cap:
      brush?.type === 'string' && brush.value === 'highlighter'
        ? 'butt'
        : 'round',
  };
}

/**
 * Local points and padded box for composition-space stroke points: the layer's
 * position is the box corner, and points sit half a brush width inside it.
 */
export function strokeGeometry(points: readonly Point2[], size: number) {
  const pad = size / 2;
  const xs = points.map((point) => point[0]),
    ys = points.map((point) => point[1]);
  const x = Math.min(...xs) - pad,
    y = Math.min(...ys) - pad;
  return {
    position: [x, y] as Point2,
    points: points.map(([px, py]): Point2 => [px - x, py - y]),
    width: Math.max(...xs) - Math.min(...xs) + size,
    height: Math.max(...ys) - Math.min(...ys) + size,
  };
}

/** Re-pads a drawing for a new brush size, keeping its points in place. */
export function resizeBrush(
  points: readonly Point2[],
  oldSize: number,
  newSize: number,
) {
  const shift = (newSize - oldSize) / 2;
  const moved = points.map(([x, y]): Point2 => [x + shift, y + shift]);
  const xs = moved.map((point) => point[0]),
    ys = moved.map((point) => point[1]);
  return {
    shift,
    points: moved,
    width: Math.max(...xs) - Math.min(...xs) + newSize,
    height: Math.max(...ys) - Math.min(...ys) + newSize,
  };
}
