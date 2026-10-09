import type { Surface } from './types';
import { clamp } from './surface';
export type Matrix = readonly number[];
/** A row-major 3x4 RGB matrix, offsets in byte units. */
export function matrix(src: Surface, dst: Surface, m: Matrix): void {
  for (let i = 0; i < src.data.length; i += 4) {
    const r = src.data[i]!,
      g = src.data[i + 1]!,
      b = src.data[i + 2]!;
    dst.data[i] = m[0]! * r + m[1]! * g + m[2]! * b + m[3]!;
    dst.data[i + 1] = m[4]! * r + m[5]! * g + m[6]! * b + m[7]!;
    dst.data[i + 2] = m[8]! * r + m[9]! * g + m[10]! * b + m[11]!;
    dst.data[i + 3] = src.data[i + 3]!;
  }
}
export function lut(
  src: Surface,
  dst: Surface,
  r: Uint8ClampedArray,
  g = r,
  b = r,
): void {
  for (let i = 0; i < src.data.length; i += 4) {
    dst.data[i] = r[src.data[i]!]!;
    dst.data[i + 1] = g[src.data[i + 1]!]!;
    dst.data[i + 2] = b[src.data[i + 2]!]!;
    dst.data[i + 3] = src.data[i + 3]!;
  }
}
export function curve(fn: (value: number) => number): Uint8ClampedArray {
  const table = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) table[i] = clamp(fn(i / 255)) * 255;
  return table;
}
export function saturationMatrix(s: number): Matrix {
  const r = 0.2126 * (1 - s),
    g = 0.7152 * (1 - s),
    b = 0.0722 * (1 - s);
  return [r + s, g, b, 0, r, g + s, b, 0, r, g, b + s, 0];
}
