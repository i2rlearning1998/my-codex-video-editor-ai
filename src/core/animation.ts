// W5-B keyframe evaluation (ANI-002, ANI-003). Pure and shared by preview,
// interaction and export: the value of an animated property at a composition
// time, and a composition whose animated values are evaluated at that time.
// The spatial contract then applies to these values unchanged.
import type { DeepReadonly, Easing, Property } from './model';

type ReadonlyProperty = DeepReadonly<Property>;
type Keyframe = ReadonlyProperty['keyframes'][number];
/** Any stored or evaluated property record (shallow type, no deep expansion). */
export interface AnimatableValue {
  readonly type: string;
  readonly value: unknown;
  readonly animated: boolean;
  readonly keyframes: readonly {
    readonly time: number;
    readonly value: unknown;
    readonly easing?: unknown;
  }[];
}

/** CSS-equivalent control points for the named eases. */
export const EASING_CURVES = {
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
} as const;

/** y for x on a cubic-bezier from (0,0) to (1,1); x is solved, then y. */
export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number,
): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const sample = (a: number, b: number, s: number) =>
    3 * a * s * (1 - s) * (1 - s) + 3 * b * s * s * (1 - s) + s * s * s;
  const slope = (a: number, b: number, s: number) =>
    3 * a * (1 - s) * (1 - s) + 6 * (b - a) * s * (1 - s) + 3 * (1 - b) * s * s;
  let s = x;
  for (let index = 0; index < 8; index++) {
    const error = sample(x1, x2, s) - x;
    if (Math.abs(error) < 1e-12) return sample(y1, y2, s);
    const d = slope(x1, x2, s);
    if (Math.abs(d) < 1e-9) break;
    s -= error / d;
  }
  // Bisection fallback: x(s) is monotonic because x1 and x2 are in [0, 1].
  let low = 0,
    high = 1;
  s = x;
  for (let index = 0; index < 60; index++) {
    const value = sample(x1, x2, s);
    if (Math.abs(value - x) < 1e-12) break;
    if (value < x) low = s;
    else high = s;
    s = (low + high) / 2;
  }
  return sample(y1, y2, s);
}

/** Eased progress for linear progress p in [0, 1). Hold stays at 0. */
export function easeProgress(
  easing: DeepReadonly<Easing> | undefined,
  p: number,
): number {
  if (!easing || easing === 'linear') return p;
  if (easing === 'hold') return 0;
  if (typeof easing === 'string') {
    const [x1, y1, x2, y2] = EASING_CURVES[easing];
    return cubicBezier(x1, y1, x2, y2, p);
  }
  return cubicBezier(easing.x1, easing.y1, easing.x2, easing.y2, p);
}

const hex = (value: string) => {
  const digits = value.slice(1);
  const channels = [0, 2, 4, 6]
    .filter((index) => index < digits.length)
    .map((index) => parseInt(digits.slice(index, index + 2), 16));
  return channels.length === 3 ? [...channels, 255] : channels;
};
const toHex = (channels: number[], alpha: boolean) =>
  `#${channels
    .slice(0, alpha ? 4 : 3)
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

function interpolate(
  type: ReadonlyProperty['type'],
  a: Keyframe['value'],
  b: Keyframe['value'],
  p: number,
): Keyframe['value'] {
  if (p === 0) return a;
  switch (type) {
    case 'number':
      return (a as number) + ((b as number) - (a as number)) * p;
    case 'vector2': {
      const [ax, ay] = a as readonly [number, number];
      const [bx, by] = b as readonly [number, number];
      return [ax + (bx - ax) * p, ay + (by - ay) * p];
    }
    case 'color': {
      const from = hex(a as string),
        to = hex(b as string);
      const alpha = (a as string).length > 7 || (b as string).length > 7;
      return toHex(
        from.map((channel, index) => channel + (to[index]! - channel) * p),
        alpha,
      );
    }
    default:
      // Strings and booleans hold until the next keyframe.
      return a;
  }
}

/** The value of a property at a composition time. */
export function evaluateProperty(
  input: AnimatableValue,
  time: number,
): ReadonlyProperty['value'] {
  const property = input as unknown as ReadonlyProperty;
  const frames = property.keyframes;
  if (!property.animated || !frames.length) return property.value;
  if (time <= frames[0]!.time) return frames[0]!.value;
  const last = frames[frames.length - 1]!;
  if (time >= last.time) return last.value;
  let index = 0;
  while (frames[index + 1]!.time <= time) index++;
  const from = frames[index]!,
    to = frames[index + 1]!;
  const p = (time - from.time) / (to.time - from.time);
  return interpolate(
    property.type,
    from.value,
    to.value,
    easeProgress(from.easing, p),
  );
}

const isAnimated = (property: ReadonlyProperty) =>
  property.animated && property.keyframes.length > 0;
/** The parts of a layer that animation reads (avoids deep type recursion). */
interface AnimatedNode {
  readonly transform: object;
  readonly properties: object;
  readonly children: readonly AnimatedNode[];
}
const values = (record: object) =>
  Object.values(record) as readonly ReadonlyProperty[];
/** True when any property of the layer or its descendants has keyframes. */
export function hasAnimation(layer: AnimatedNode): boolean {
  return (
    values(layer.transform).some(isAnimated) ||
    values(layer.properties).some(isAnimated) ||
    layer.children.some(hasAnimation)
  );
}

function layerAt<L extends AnimatedNode>(layer: L, time: number): L {
  if (!hasAnimation(layer)) return layer;
  const at = (property: ReadonlyProperty) =>
    isAnimated(property)
      ? Object.freeze({
          ...(property as object),
          value: evaluateProperty(property, time) as unknown,
        })
      : property;
  const map = (record: object) =>
    Object.freeze(
      Object.fromEntries(
        Object.entries(record as Record<string, ReadonlyProperty>).map(
          ([key, value]) => [key, at(value)],
        ),
      ),
    );
  return Object.freeze({
    ...layer,
    transform: map(layer.transform),
    properties: map(layer.properties),
    children: Object.freeze(
      layer.children.map((child) => layerAt(child, time)),
    ),
  });
}

const cache = new WeakMap<object, Map<number, unknown>>();
/**
 * The composition with every animated property's value evaluated at `time`
 * (keyframes kept). Returns the same object when nothing is animated.
 */
export function compositionAt<C extends { readonly layers: readonly object[] }>(
  composition: C,
  time: number,
): C {
  const layers = composition.layers as readonly AnimatedNode[];
  if (!layers.some(hasAnimation)) return composition;
  let byTime = cache.get(composition);
  if (!byTime) cache.set(composition, (byTime = new Map()));
  const hit = byTime.get(time);
  if (hit) return hit as C;
  const result = Object.freeze({
    ...composition,
    layers: Object.freeze(layers.map((layer) => layerAt(layer, time))),
  }) as C;
  if (byTime.size > 16) byTime.clear();
  byTime.set(time, result);
  return result;
}
