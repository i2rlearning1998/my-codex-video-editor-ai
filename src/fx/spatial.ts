import type { Surface } from './types';
import { clamp, sample } from './surface';
/** Separable box blur of premultiplied colour. RGB unpremultiplied only at output. */
export function blur(
  src: Surface,
  dst: Surface,
  radius: number,
  preserveAlpha = true,
): void {
  const w = src.width,
    h = src.height,
    r = Math.min(64, Math.max(0, Math.round(radius)));
  if (!r) {
    dst.data.set(src.data);
    return;
  }
  const tmp = new Float32Array(src.data.length),
    a = src.data,
    o = dst.data,
    k = 2 * r + 1;
  for (let y = 0; y < h; y++)
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let x = -r; x <= r; x++) {
        const i = (y * w + clamp(x, 0, w - 1)) * 4;
        sum += c === 3 ? a[i + 3]! : (a[i + c]! * a[i + 3]!) / 255;
      }
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 4 + c] = sum / k;
        const old = (y * w + clamp(x - r, 0, w - 1)) * 4,
          next = (y * w + clamp(x + r + 1, 0, w - 1)) * 4;
        sum +=
          (c === 3 ? a[next + 3]! : (a[next + c]! * a[next + 3]!) / 255) -
          (c === 3 ? a[old + 3]! : (a[old + c]! * a[old + 3]!) / 255);
      }
    }
  const sums = new Float64Array(w * 4);
  for (let y = -r; y <= r; y++) {
    const row = clamp(y, 0, h - 1) * w * 4;
    for (let x = 0; x < w * 4; x++) sums[x] = sums[x]! + tmp[row + x]!;
  }
  for (let y = 0; y < h; y++) {
    const old = clamp(y - r, 0, h - 1) * w * 4,
      next = clamp(y + r + 1, 0, h - 1) * w * 4;
    for (let x = 0; x < w; x++) {
      const j = x * 4,
        i = (y * w + x) * 4,
        alpha = sums[j + 3]! / k;
      for (let c = 0; c < 3; c++)
        o[i + c] = alpha > 1e-6 ? ((sums[j + c]! / k) * 255) / alpha : 0;
      o[i + 3] = preserveAlpha ? a[i + 3]! : alpha;
      for (let c = 0; c < 4; c++)
        sums[j + c] = sums[j + c]! + tmp[next + j + c]! - tmp[old + j + c]!;
    }
  }
}
export function transform(
  src: Surface,
  dst: Surface,
  angle: number,
  zoom = 1,
  dx = 0,
  dy = 0,
  edge: 'clamp' | 'clear' = 'clear',
): void {
  const cx = (src.width - 1) / 2,
    cy = (src.height - 1) / 2,
    cos = Math.cos(angle) / zoom,
    sin = Math.sin(angle) / zoom;
  for (let y = 0; y < src.height; y++) {
    let sx = (-cx - dx) * cos + (y - cy - dy) * sin + cx,
      sy = -(-cx - dx) * sin + (y - cy - dy) * cos + cy;
    for (let x = 0; x < src.width; x++, sx += cos, sy -= sin)
      sample(src, dst, (y * src.width + x) * 4, sx, sy, edge);
  }
}
export function vignette(src: Surface, dst: Surface, strength: number): void {
  const w = src.width,
    h = src.height;
  const xs = new Float32Array(w);
  for (let x = 0; x < w; x++) xs[x] = ((2 * (x + 0.5)) / w - 1) ** 2;
  for (let y = 0; y < h; y++) {
    const yy = ((2 * (y + 0.5)) / h - 1) ** 2;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4,
        f = 1 - strength * clamp((xs[x]! + yy) * 0.6);
      for (let c = 0; c < 3; c++) dst.data[i + c] = src.data[i + c]! * f;
      dst.data[i + 3] = src.data[i + 3]!;
    }
  }
}
