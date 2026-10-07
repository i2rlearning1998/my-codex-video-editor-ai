export const clamp = (x: number, a = 0, b = 1): number =>
  Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;
export function map(
  x: number,
  a: number,
  b: number,
  c: number,
  d: number,
): number {
  if (a === b) throw new RangeError('Cannot map a zero range');
  return lerp(c, d, (x - a) / (b - a));
}
/** Indexed random sample: no mutable generator state, order independent. */
export function rngFor(seed: number, index: number): number {
  let x = Math.imul((seed | 0) ^ (index | 0), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
export const easingNames = [
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'hold',
] as const;
export type EaseName = (typeof easingNames)[number];
/** CSS named cubic curves, aligned with core/animation without importing it. */
export function ease(name: string, t: number): number {
  const x = clamp(t);
  if (name === 'hold') return x === 1 ? 1 : 0;
  if (name === 'linear') return x;
  const points =
    name === 'ease-in'
      ? [0.42, 0, 1, 1]
      : name === 'ease-out'
        ? [0, 0, 0.58, 1]
        : name === 'ease-in-out'
          ? [0.42, 0, 0.58, 1]
          : null;
  if (!points) throw new RangeError('Unknown easing');
  let lo = 0,
    hi = 1,
    s = x;
  const at = (a: number, b: number, v: number) =>
    3 * a * v * (1 - v) ** 2 + 3 * b * v * v * (1 - v) + v ** 3;
  for (let i = 0; i < 48; i++) {
    s = (lo + hi) / 2;
    if (at(points[0]!, points[2]!, s) < x) lo = s;
    else hi = s;
  }
  return x === 0 || x === 1 ? x : at(points[1]!, points[3]!, s);
}
/** Unit-mass underdamped step response from rest, evaluated directly in seconds. */
export function spring(t: number, frequency = 2.4, damping = 0.62): number {
  if (
    ![t, frequency, damping].every(Number.isFinite) ||
    frequency <= 0 ||
    frequency > 100 ||
    damping <= 0 ||
    damping >= 1
  )
    throw new RangeError('Spring needs frequency (0,100], damping (0,1)');
  if (t <= 0) return 0;
  const w = 2 * Math.PI * frequency,
    d = w * Math.sqrt(1 - damping * damping);
  return (
    1 -
    Math.exp(-damping * w * t) *
      (Math.cos(d * t) + ((damping * w) / d) * Math.sin(d * t))
  );
}
export const helpers = Object.freeze({
  clamp,
  lerp,
  map,
  rngFor,
  ease,
  spring,
});
