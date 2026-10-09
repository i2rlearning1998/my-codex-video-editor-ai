import type { Context, Surface } from './types';
import { clamp, hash } from './surface';
import { curve } from './color';
export interface Grade {
  contrast?: number;
  saturation?: number;
  exposure?: number;
  gamma?: number;
  lift?: number;
  warm?: number;
  tint?: number;
  shadows?: readonly number[];
  highlights?: readonly number[];
  tone?: number;
  vignette?: number;
  grain?: number;
}
/** Curves and split-tone tables are compiled once per definition, not per pixel. */
export function compileGrade(
  g: Grade,
): (s: Surface, d: Surface, c: Context) => void {
  const gain = 2 ** (g.exposure ?? 0),
    contrast = g.contrast ?? 1,
    lift = g.lift ?? 0,
    gamma = g.gamma ?? 1;
  const base = (v: number) =>
    ((v * gain) ** (1 / gamma) - 0.5) * contrast + 0.5;
  const r = curve(
      (v) =>
        base(v) * (1 - lift) +
        lift +
        (g.warm ?? 0) * 0.055 +
        (g.tint ?? 0) * 0.025,
    ),
    green = curve((v) => base(v) * (1 - lift) + lift - (g.tint ?? 0) * 0.03),
    b = curve((v) => base(v) * (1 - lift) + lift - (g.warm ?? 0) * 0.055);
  const sat = g.saturation ?? 1,
    tone = g.tone ?? 0.15,
    shadow = g.shadows ?? [0, 0, 0],
    high = g.highlights ?? [0, 0, 0];
  const split = new Float32Array(256 * 3);
  for (let y = 0; y < 256; y++) {
    const t = y / 255;
    for (let c = 0; c < 3; c++)
      split[y * 3 + c] = tone * (shadow[c]! * (1 - t) ** 2 + high[c]! * t * t);
  }
  return (s, d, ctx) => {
    const a = s.data,
      o = d.data,
      w = s.width,
      h = s.height,
      grain = g.grain ?? 0,
      v = g.vignette ?? 0,
      seed = ctx.seed ^ Math.floor(ctx.time * 24);
    if (!v && !grain) {
      for (let i = 0; i < a.length; i += 4) {
        const rr = r[a[i]!]!,
          gg = green[a[i + 1]!]!,
          bb = b[a[i + 2]!]!,
          l = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb,
          k = Math.round(l) * 3;
        o[i] = l + (rr - l) * sat + split[k]!;
        o[i + 1] = l + (gg - l) * sat + split[k + 1]!;
        o[i + 2] = l + (bb - l) * sat + split[k + 2]!;
      }
      return;
    }
    const xs = new Float32Array(w);
    for (let x = 0; x < w; x++) xs[x] = ((2 * (x + 0.5)) / w - 1) ** 2;
    for (let y = 0; y < h; y++) {
      const yy = ((2 * (y + 0.5)) / h - 1) ** 2;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4,
          rr = r[a[i]!]!,
          gg = green[a[i + 1]!]!,
          bb = b[a[i + 2]!]!,
          l = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb,
          k = Math.round(l) * 3,
          f = 1 - v * clamp((xs[x]! + yy) * 0.65),
          noise = grain ? (hash(i, seed) - 0.5) * grain : 0;
        o[i] = (l + (rr - l) * sat + split[k]!) * f + noise;
        o[i + 1] = (l + (gg - l) * sat + split[k + 1]!) * f + noise;
        o[i + 2] = (l + (bb - l) * sat + split[k + 2]!) * f + noise;
        o[i + 3] = a[i + 3]!;
      }
    }
  };
}
