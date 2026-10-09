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
  const a = src.data,
    o = dst.data,
    k = 2 * r + 1;
  let opaque = true;
  for (let i = 3; i < a.length; i += 4)
    if (a[i] !== 255) {
      opaque = false;
      break;
    }
  if (opaque) {
    blurOpaque(src, dst, r);
    return;
  }
  const tmp = new Float32Array(src.data.length);
  const oldX = new Int32Array(w),
    nextX = new Int32Array(w);
  for (let x = 0; x < w; x++) {
    oldX[x] = Math.max(0, x - r) * 4;
    nextX[x] = Math.min(w - 1, x + r + 1) * 4;
  }
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    let rr = 0,
      gg = 0,
      bb = 0,
      aa = 0;
    for (let x = -r; x <= r; x++) {
      const j = row + Math.max(0, Math.min(w - 1, x)) * 4,
        alpha = opaque ? 1 : a[j + 3]!;
      rr += a[j]! * alpha;
      gg += a[j + 1]! * alpha;
      bb += a[j + 2]! * alpha;
      aa += a[j + 3]!;
    }
    for (let x = 0; x < w; x++) {
      const i = row + x * 4;
      tmp[i] = rr / k;
      tmp[i + 1] = gg / k;
      tmp[i + 2] = bb / k;
      tmp[i + 3] = aa / k;
      const old = row + oldX[x]!,
        next = row + nextX[x]!,
        oa = opaque ? 1 : a[old + 3]!,
        na = opaque ? 1 : a[next + 3]!;
      rr += a[next]! * na - a[old]! * oa;
      gg += a[next + 1]! * na - a[old + 1]! * oa;
      bb += a[next + 2]! * na - a[old + 2]! * oa;
      aa += a[next + 3]! - a[old + 3]!;
    }
  }
  const sums = new Float64Array(w * 4);
  for (let y = -r; y <= r; y++) {
    const row = Math.max(0, Math.min(h - 1, y)) * w * 4;
    for (let j = 0; j < w * 4; j++) sums[j] = sums[j]! + tmp[row + j]!;
  }
  for (let y = 0; y < h; y++) {
    const old = Math.max(0, y - r) * w * 4,
      next = Math.min(h - 1, y + r + 1) * w * 4,
      row = y * w * 4;
    for (let j = 0; j < w * 4; j += 4) {
      const i = row + j,
        alpha = sums[j + 3]! / k,
        f = opaque ? 1 / k : alpha > 1e-6 ? 1 / (alpha * k) : 0;
      o[i] = sums[j]! * f;
      o[i + 1] = sums[j + 1]! * f;
      o[i + 2] = sums[j + 2]! * f;
      o[i + 3] = preserveAlpha ? a[i + 3]! : alpha;
      sums[j] = sums[j]! + tmp[next + j]! - tmp[old + j]!;
      sums[j + 1] = sums[j + 1]! + tmp[next + j + 1]! - tmp[old + j + 1]!;
      sums[j + 2] = sums[j + 2]! + tmp[next + j + 2]! - tmp[old + j + 2]!;
      sums[j + 3] = sums[j + 3]! + tmp[next + j + 3]! - tmp[old + j + 3]!;
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
  const w = src.width,
    h = src.height,
    cx = (w - 1) / 2,
    cy = (h - 1) / 2,
    cos = Math.cos(angle) / zoom,
    sin = Math.sin(angle) / zoom;
  const packed = src.data.byteOffset % 4 === 0 && dst.data.byteOffset % 4 === 0;
  const a = packed
      ? new Uint32Array(src.data.buffer, src.data.byteOffset, w * h)
      : null,
    b = packed
      ? new Uint32Array(dst.data.buffer, dst.data.byteOffset, w * h)
      : null;
  for (let y = 0; y < h; y++) {
    let sx = (-cx - dx) * cos + (y - cy - dy) * sin + cx,
      sy = -(-cx - dx) * sin + (y - cy - dy) * cos + cy;
    for (let x = 0; x < w; x++, sx += cos, sy -= sin) {
      const i = y * w + x;
      if (a && b) {
        if (
          edge === 'clear' &&
          (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1)
        ) {
          b[i] = 0;
          continue;
        }
        const ix = Math.max(0, Math.min(w - 1, Math.round(sx))),
          iy = Math.max(0, Math.min(h - 1, Math.round(sy)));
        b[i] = a[iy * w + ix]!;
      } else sample(src, dst, i * 4, sx, sy, edge);
    }
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

/** Opaque videos need no premultiplication or alpha accumulation. */
function blurOpaque(src: Surface, dst: Surface, r: number): void {
  const w = src.width,
    h = src.height,
    k = 2 * r + 1,
    a = src.data,
    o = dst.data,
    tmp = new Float32Array(w * h * 3),
    sums = new Float64Array(w * 3);
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    let rr = 0,
      gg = 0,
      bb = 0;
    for (let x = -r; x <= r; x++) {
      const i = row + Math.max(0, Math.min(w - 1, x)) * 4;
      rr += a[i]!;
      gg += a[i + 1]!;
      bb += a[i + 2]!;
    }
    for (let x = 0; x < w; x++) {
      const j = (y * w + x) * 3;
      tmp[j] = rr / k;
      tmp[j + 1] = gg / k;
      tmp[j + 2] = bb / k;
      const old = row + Math.max(0, x - r) * 4,
        next = row + Math.min(w - 1, x + r + 1) * 4;
      rr += a[next]! - a[old]!;
      gg += a[next + 1]! - a[old + 1]!;
      bb += a[next + 2]! - a[old + 2]!;
    }
  }
  for (let y = -r; y <= r; y++) {
    const row = Math.max(0, Math.min(h - 1, y)) * w * 3;
    for (let j = 0; j < w * 3; j++) sums[j] = sums[j]! + tmp[row + j]!;
  }
  for (let y = 0; y < h; y++) {
    const old = Math.max(0, y - r) * w * 3,
      next = Math.min(h - 1, y + r + 1) * w * 3;
    for (let x = 0; x < w; x++) {
      const j = x * 3,
        i = (y * w + x) * 4;
      o[i] = sums[j]! / k;
      o[i + 1] = sums[j + 1]! / k;
      o[i + 2] = sums[j + 2]! / k;
      o[i + 3] = 255;
      sums[j] = sums[j]! + tmp[next + j]! - tmp[old + j]!;
      sums[j + 1] = sums[j + 1]! + tmp[next + j + 1]! - tmp[old + j + 1]!;
      sums[j + 2] = sums[j + 2]! + tmp[next + j + 2]! - tmp[old + j + 2]!;
    }
  }
}
