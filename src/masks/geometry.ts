import { easeProgress } from '../core/animation';
import type { Mask } from './types';
export type Point = readonly [number, number];
export interface ReadMask {
  readonly id: string;
  readonly type: Mask['type'];
  readonly geometry: readonly Point[];
  readonly feather?: number | undefined;
  readonly expansion?: number | undefined;
  readonly opacity?: number | undefined;
  readonly invert?: boolean | undefined;
  readonly mode?: Mask['mode'];
  readonly keyframes?:
    | readonly {
        readonly time: number;
        readonly value: readonly Point[];
        readonly easing?:
          | import('../core/model').DeepReadonly<import('../core/model').Easing>
          | undefined;
      }[]
    | undefined;
}
export function evaluateMask(mask: ReadMask, time: number): ReadMask {
  const keys = mask.keyframes;
  if (!keys?.length) return mask;
  let points = keys[0]!.value;
  if (time >= keys[keys.length - 1]!.time)
    points = keys[keys.length - 1]!.value;
  else
    for (let i = 1; i < keys.length; i++) {
      const b = keys[i]!,
        a = keys[i - 1]!;
      if (time < b.time) {
        const t = easeProgress(
          a.easing,
          (Math.max(time, a.time) - a.time) / (b.time - a.time),
        );
        points = a.value.map(
          (p, j) =>
            [
              p[0] + (b.value[j]![0] - p[0]) * t,
              p[1] + (b.value[j]![1] - p[1]) * t,
            ] as const,
        );
        break;
      }
    }
  return { ...mask, geometry: points };
}
export function getMaskHandles(mask: ReadMask) {
  return mask.geometry.map((position, index) => ({
    id: index,
    position: [...position] as [number, number],
    kind:
      mask.type === 'path' && index % 3 !== 0
        ? ('control' as const)
        : ('vertex' as const),
  }));
}
export function moveHandle(
  mask: ReadMask,
  index: number,
  point: Point,
): ReadMask {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= mask.geometry.length ||
    !point.every(Number.isFinite)
  )
    throw new RangeError('Invalid mask handle');
  return {
    ...mask,
    geometry: mask.geometry.map((p, i) =>
      i === index ? ([...point] as Point) : p,
    ),
  };
}
function polygon(mask: ReadMask): readonly Point[] {
  if (mask.type !== 'path') return mask.geometry;
  const out: Point[] = [mask.geometry[0]!];
  for (let i = 1; i < mask.geometry.length; i += 3) {
    const a = mask.geometry[i - 1]!,
      b = mask.geometry[i]!,
      c = mask.geometry[i + 1]!,
      d = mask.geometry[i + 2]!;
    for (let j = 1; j <= 24; j++) {
      const t = j / 24,
        u = 1 - t;
      out.push([
        u * u * u * a[0] +
          3 * u * u * t * b[0] +
          3 * u * t * t * c[0] +
          t * t * t * d[0],
        u * u * u * a[1] +
          3 * u * u * t * b[1] +
          3 * u * t * t * c[1] +
          t * t * t * d[1],
      ]);
    }
  }
  return out;
}
function segment(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    n = dx * dx + dy * dy,
    t = n
      ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / n))
      : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
export function signedDistance(mask: ReadMask, p: Point): number {
  if (mask.type === 'rect' || mask.type === 'ellipse') {
    const a = mask.geometry[0]!,
      b = mask.geometry[1]!,
      cx = (a[0] + b[0]) / 2,
      cy = (a[1] + b[1]) / 2,
      rx = Math.abs(b[0] - a[0]) / 2,
      ry = Math.abs(b[1] - a[1]) / 2;
    if (!rx || !ry) return -Infinity;
    if (mask.type === 'ellipse')
      return (
        (1 - Math.hypot((p[0] - cx) / rx, (p[1] - cy) / ry)) * Math.min(rx, ry)
      );
    const x = Math.abs(p[0] - cx) - rx,
      y = Math.abs(p[1] - cy) - ry;
    return -(
      Math.hypot(Math.max(x, 0), Math.max(y, 0)) + Math.min(Math.max(x, y), 0)
    );
  }
  const points = polygon(mask);
  let inside = false,
    d = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!,
      b = points[j]!;
    d = Math.min(d, segment(p, a, b));
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside ? d : -d;
}
export const hitTestMask = (mask: ReadMask, p: Point) =>
  signedDistance(mask, p) + (mask.expansion ?? 0) >= 0;
export function maskAlpha(mask: ReadMask, p: Point): number {
  const d = signedDistance(mask, p) + (mask.expansion ?? 0),
    f = mask.feather ?? 0;
  let a = f ? Math.max(0, Math.min(1, 0.5 + d / f)) : d >= 0 ? 1 : 0;
  if (mask.invert) a = 1 - a;
  return a * (mask.opacity ?? 1);
}
export function stackAlpha(masks: readonly ReadMask[], p: Point): number {
  if (!masks.length) return 1;
  let alpha =
    masks[0]!.mode === 'subtract' || masks[0]!.mode === 'intersect' ? 1 : 0;
  for (const m of masks) {
    const a = maskAlpha(m, p);
    alpha =
      m.mode === 'subtract'
        ? alpha * (1 - a)
        : m.mode === 'intersect'
          ? alpha * a
          : alpha + a * (1 - alpha);
  }
  return alpha;
}
export function matteAlpha(
  r: number,
  g: number,
  b: number,
  a: number,
  type: 'alpha' | 'luma',
  invert = false,
) {
  const v =
    (a / 255) *
    (type === 'luma' ? (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 : 1);
  return invert ? 1 - v : v;
}
