import type { Context, Surface } from './types';
export const clamp = (n: number, lo = 0, hi = 1): number =>
  Math.max(lo, Math.min(hi, n));
export function surface(width: number, height: number): Surface {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 33554432
  )
    throw new RangeError(
      'Surface must be 1..33554432 pixels with integer dimensions',
    );
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}
export function validate(src: Surface): void {
  if (
    !Number.isSafeInteger(src.width) ||
    !Number.isSafeInteger(src.height) ||
    src.width < 1 ||
    src.height < 1 ||
    src.width * src.height > 33554432 ||
    !(src.data instanceof Uint8ClampedArray) ||
    src.data.length !== src.width * src.height * 4
  )
    throw new RangeError('Invalid RGBA surface');
}
export function pair(src: Surface, dst: Surface): void {
  validate(src);
  validate(dst);
  if (src.width !== dst.width || src.height !== dst.height)
    throw new RangeError('Surface dimensions must match');
  if (
    src.data.buffer === dst.data.buffer &&
    src.data.byteOffset < dst.data.byteOffset + dst.data.byteLength &&
    dst.data.byteOffset < src.data.byteOffset + src.data.byteLength
  )
    throw new RangeError('Input and output must not overlap');
}
export function context(src: Surface, ctx: Context): void {
  if (
    ![ctx.time, ctx.duration, ctx.seed].every(Number.isFinite) ||
    !Number.isInteger(ctx.seed) ||
    ctx.duration < 0 ||
    ctx.width !== src.width ||
    ctx.height !== src.height
  )
    throw new RangeError('Invalid effect context');
}
export function copy(src: Surface): Surface {
  validate(src);
  const out = surface(src.width, src.height);
  out.data.set(src.data);
  return out;
}
export function random(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash(x: number, seed: number): number {
  let s = Math.imul(x ^ seed, 0x45d9f3b);
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
  return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
}
// Nearest-neighbour resampling copies straight RGBA together; no hidden-colour halos.
export function sample(
  src: Surface,
  dst: Surface,
  i: number,
  x: number,
  y: number,
  edge: 'clamp' | 'clear' = 'clamp',
): void {
  if (
    edge === 'clear' &&
    (x < 0 || y < 0 || x > src.width - 1 || y > src.height - 1)
  ) {
    dst.data.fill(0, i, i + 4);
    return;
  }
  const j =
    (Math.round(clamp(y, 0, src.height - 1)) * src.width +
      Math.round(clamp(x, 0, src.width - 1))) *
    4;
  for (let c = 0; c < 4; c++) dst.data[i + c] = src.data[j + c]!;
}
export function resize(src: Surface, width: number, height: number): Surface {
  validate(src);
  const dst = surface(width, height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      sample(
        src,
        dst,
        (y * width + x) * 4,
        ((x + 0.5) * src.width) / width - 0.5,
        ((y + 0.5) * src.height) / height - 0.5,
      );
  return dst;
}
// Premultiplied mixing is essential for transitions involving transparent pixels.
export function mixPixel(
  a: Surface,
  b: Surface,
  dst: Surface,
  i: number,
  t: number,
): void {
  const aa = a.data[i + 3]! * (1 - t),
    ba = b.data[i + 3]! * t,
    alpha = aa + ba;
  for (let c = 0; c < 3; c++)
    dst.data[i + c] = alpha
      ? (a.data[i + c]! * aa + b.data[i + c]! * ba) / alpha
      : 0;
  dst.data[i + 3] = alpha;
}
