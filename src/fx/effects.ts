import { effectsB } from './effects-b';
import type { Context, Params, Surface } from './types';
import { effect, numberParam, booleanParam, n } from './definition';
import { clamp, copy, hash, sample, surface } from './surface';
import { blur, transform, vignette } from './spatial';
import { matrix } from './color';
const speed = numberParam('speed', 'Speed', 0.1, 5, 1),
  loop = booleanParam('loop', 'Loop', false),
  radius = numberParam('radius', 'Radius (at 720px height)', 0, 32, 6);
const motion = [speed, loop];
function phase(p: Params, c: Context): number {
  const t = (Math.max(0, c.time) * n(p, 'speed')) / Math.max(c.duration, 0.001);
  return p['loop'] ? t % 1 : clamp(t);
}
const timed = (p: Params, c: Context) => Math.max(0, c.time) * n(p, 'speed');
function rgbShift(s: Surface, d: Surface, dx: number): void {
  const w = s.width;
  for (let y = 0; y < s.height; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4,
        left = (y * w + clamp(x - dx, 0, w - 1)) * 4,
        right = (y * w + clamp(x + dx, 0, w - 1)) * 4;
      d.data[i] = s.data[left]!;
      d.data[i + 1] = s.data[i + 1]!;
      d.data[i + 2] = s.data[right + 2]!;
      d.data[i + 3] = s.data[i + 3]!;
    }
}
function videoNoise(
  s: Surface,
  d: Surface,
  p: Params,
  c: Context,
  vapor = false,
): void {
  const frame = Math.floor(timed(p, c) * 24),
    w = s.width,
    noise = n(p, 'noise');
  for (let y = 0; y < s.height; y++) {
    const shift = Math.round(
        Math.sin(y * 0.06 + frame * 0.3) * w * 0.004 +
          (hash(y >> 3, c.seed ^ frame) - 0.5) * w * 0.012,
      ),
      scan = y % 3 === 0 ? 0.82 : 1;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4,
        j = (y * w + clamp(x + shift, 0, w - 1)) * 4,
        z = (hash(i, c.seed ^ frame) - 0.5) * noise;
      d.data[i] = (s.data[j]! + (vapor ? 30 : 4)) * scan + z;
      d.data[i + 1] = (s.data[j + 1]! - (vapor ? 18 : 0)) * scan + z;
      d.data[i + 2] = (s.data[j + 2]! + (vapor ? 38 : 2)) * scan + z;
      d.data[i + 3] = s.data[i + 3]!;
    }
  }
}
export const effects = [
  effect(
    'effect.flash',
    'Flash',
    'Light',
    (s, d, p, c) => {
      const t = phase(p, c),
        f = Math.exp(-(((t - 0.5) / 0.12) ** 2));
      for (let i = 0; i < s.data.length; i += 4)
        for (let k = 0; k < 3; k++)
          d.data[i + k] = s.data[i + k]! + (255 - s.data[i + k]!) * f;
    },
    motion,
  ),
  effect(
    'effect.pulse',
    'Pulse',
    'Light',
    (s, d, p, c) => {
      const f = 1 + 0.35 * (0.5 + 0.5 * Math.sin(timed(p, c) * Math.PI * 2));
      for (let i = 0; i < s.data.length; i += 4)
        for (let k = 0; k < 3; k++) d.data[i + k] = s.data[i + k]! * f;
    },
    [speed],
  ),
  effect(
    'effect.spin',
    'Spin',
    'Motion',
    (s, d, p, c) => transform(s, d, phase(p, c) * Math.PI * 2),
    motion,
    'spatial',
  ),
  effect(
    'effect.rotate',
    'Rotate',
    'Motion',
    (s, d, p) => transform(s, d, (n(p, 'angle') * Math.PI) / 180),
    [numberParam('angle', 'Angle', -180, 180, 15)],
    'spatial',
  ),
  effect(
    'effect.crash-zoom',
    'Crash zoom',
    'Motion',
    (s, d, p, c) => transform(s, d, 0, 1 + 3 * phase(p, c) ** 6),
    motion,
    'spatial',
  ),
  effect(
    'effect.slow-zoom',
    'Slow zoom',
    'Motion',
    (s, d, p, c) => transform(s, d, 0, 1 + 0.25 * phase(p, c)),
    motion,
    'spatial',
  ),
  effect(
    'effect.slow-zoom-random',
    'Slow zoom random',
    'Motion',
    (s, d, p, c) => {
      const t = phase(p, c);
      transform(
        s,
        d,
        0,
        1 + 0.3 * t,
        (hash(1, c.seed) - 0.5) * s.width * 0.1 * t,
        (hash(2, c.seed) - 0.5) * s.height * 0.1 * t,
      );
    },
    motion,
    'spatial',
  ),
  effect(
    'effect.blur',
    'Blur',
    'Optical',
    (s, d, p) => blur(s, d, (n(p, 'radius') * s.height) / 720),
    [radius],
  ),
  effect(
    'effect.blur-fill',
    'Blur fill',
    'Optical',
    (s, d, p) => {
      const back = surface(s.width, s.height);
      transform(s, back, 0, 1.25, 0, 0, 'clamp');
      blur(back, d, (n(p, 'radius') * s.height) / 720, false);
      const scale = n(p, 'scale'),
        w = s.width,
        h = s.height;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const sx = (x - (w - 1) / 2) / scale + (w - 1) / 2,
            sy = (y - (h - 1) / 2) / scale + (h - 1) / 2;
          if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) continue;
          const i = (y * w + x) * 4,
            j = (Math.round(sy) * w + Math.round(sx)) * 4,
            a = s.data[j + 3]! / 255,
            ba = (d.data[i + 3]! / 255) * (1 - a),
            out = a + ba;
          for (let k = 0; k < 3; k++)
            d.data[i + k] = out
              ? (s.data[j + k]! * a + d.data[i + k]! * ba) / out
              : 0;
          d.data[i + 3] = out * 255;
        }
    },
    [
      numberParam('radius', 'Background blur', 1, 32, 16),
      numberParam('scale', 'Foreground scale', 0.25, 1, 0.72),
    ],
    'modify',
  ),
  effect(
    'effect.vhs',
    'VHS',
    'Texture',
    (s, d, p, c) => videoNoise(s, d, p, c),
    [speed, numberParam('noise', 'Noise', 0, 50, 12)],
  ),
  effect(
    'effect.vaporwave',
    'Vaporwave',
    'Texture',
    (s, d, p, c) => videoNoise(s, d, p, c, true),
    [speed, numberParam('noise', 'Noise', 0, 50, 6)],
  ),
  effect(
    'effect.chromatic-aberration',
    'Chromatic aberration',
    'Optical',
    (s, d, p) => rgbShift(s, d, Math.round((n(p, 'amount') * s.width) / 1280)),
    [numberParam('amount', 'Channel offset', 0, 40, 8)],
  ),
  effect(
    'effect.glitch',
    'Glitch',
    'Texture',
    (s, d, p, c) => {
      const frame = Math.floor(timed(p, c) * 12),
        w = s.width;
      for (let y = 0; y < s.height; y++) {
        const block = Math.floor(y / Math.max(1, s.height / 18)),
          r = hash(block, c.seed ^ frame),
          shift = r > 0.6 ? Math.round((r - 0.8) * w * 0.4) : 0;
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          sample(s, d, i, (((x + shift) % w) + w) % w, y);
          d.data[i + 3] = s.data[i + 3]!;
          if (r > 0.8) d.data[i] = 255 - d.data[i]!;
        }
      }
    },
    [speed],
  ),
  effect(
    'effect.filmic',
    'Filmic',
    'Texture',
    (s, d, p, c) => {
      const frame = Math.floor(timed(p, c) * 24);
      transform(
        s,
        d,
        0,
        1.015,
        (hash(frame, c.seed) - 0.5) * s.width * 0.006,
        (hash(frame + 1, c.seed) - 0.5) * s.height * 0.006,
        'clamp',
      );
      vignette(d, d, 0.3);
      for (let i = 0; i < d.data.length; i += 4) {
        const grain = (hash(i, c.seed ^ frame) - 0.5) * n(p, 'grain');
        for (let k = 0; k < 3; k++) d.data[i + k] = d.data[i + k]! + grain;
      }
    },
    [speed, numberParam('grain', 'Grain', 0, 40, 14)],
    'spatial',
  ),
  effect(
    'effect.color-shift',
    'Color shift',
    'Color',
    (s, d, p, c) => {
      const a = (timed(p, c) * Math.PI) / 2,
        cs = Math.cos(a),
        sn = Math.sin(a);
      matrix(s, d, [
        0.213 + 0.787 * cs - 0.213 * sn,
        0.715 - 0.715 * cs - 0.715 * sn,
        0.072 - 0.072 * cs + 0.928 * sn,
        0,
        0.213 - 0.213 * cs + 0.143 * sn,
        0.715 + 0.285 * cs + 0.14 * sn,
        0.072 - 0.072 * cs - 0.283 * sn,
        0,
        0.213 - 0.213 * cs - 0.787 * sn,
        0.715 - 0.715 * cs + 0.715 * sn,
        0.072 + 0.928 * cs + 0.072 * sn,
        0,
      ]);
    },
    [speed],
  ),
  effect(
    'effect.pixelation',
    'Pixelation',
    'Texture',
    (s, d, p) => {
      const size = Math.max(1, Math.round((n(p, 'size') * s.height) / 720)),
        palette = p['palette16'];
      for (let y = 0; y < s.height; y++)
        for (let x = 0; x < s.width; x++) {
          const i = (y * s.width + x) * 4;
          sample(
            s,
            d,
            i,
            Math.min(
              s.width - 1,
              Math.floor(x / size) * size + Math.floor(size / 2),
            ),
            Math.min(
              s.height - 1,
              Math.floor(y / size) * size + Math.floor(size / 2),
            ),
          );
          if (palette) {
            d.data[i] = (Math.round((d.data[i]! / 255) * 31) / 31) * 255;
            d.data[i + 1] =
              (Math.round((d.data[i + 1]! / 255) * 63) / 63) * 255;
            d.data[i + 2] =
              (Math.round((d.data[i + 2]! / 255) * 31) / 31) * 255;
          }
        }
    },
    [
      numberParam('size', 'Block size (at 720px height)', 1, 80, 18),
      booleanParam('palette16', '16-bit RGB565 palette', false),
    ],
    'spatial',
  ),
  effect(
    'effect.glow',
    'Glow',
    'Light',
    (s, d, p) => {
      const bright = copy(s);
      for (let i = 0; i < bright.data.length; i += 4)
        for (let k = 0; k < 3; k++)
          bright.data[i + k] = Math.max(0, s.data[i + k]! - 140) * 2;
      const soft = surface(s.width, s.height);
      blur(bright, soft, (n(p, 'radius') * s.height) / 720);
      for (let i = 0; i < s.data.length; i += 4)
        for (let k = 0; k < 3; k++)
          d.data[i + k] =
            255 - ((255 - s.data[i + k]!) * (255 - soft.data[i + k]!)) / 255;
    },
    [radius],
  ),
  effect(
    'effect.diffusion',
    'Diffusion',
    'Optical',
    (s, d, p) => {
      blur(s, d, (n(p, 'radius') * s.height) / 720);
      for (let i = 0; i < s.data.length; i += 4)
        for (let k = 0; k < 3; k++)
          d.data[i + k] = s.data[i + k]! * 0.6 + d.data[i + k]! * 0.4 + 6;
    },
    [radius],
  ),
];

effects.push(...effectsB);
