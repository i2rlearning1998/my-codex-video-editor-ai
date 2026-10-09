import { effect, numberParam, selectParam, n } from './definition';
import { clamp, hash, sample } from './surface';
const speed = numberParam('speed', 'Speed', 0.1, 5, 1);
function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    u = x - ix,
    v = y - iy,
    xx = u * u * (3 - 2 * u),
    yy = v * v * (3 - 2 * v),
    a = hash(ix + iy * 8191, seed),
    b = hash(ix + 1 + iy * 8191, seed),
    c = hash(ix + (iy + 1) * 8191, seed),
    d = hash(ix + 1 + (iy + 1) * 8191, seed);
  return (a + (b - a) * xx) * (1 - yy) + (c + (d - c) * xx) * yy;
}
let kaleidoKey = '';
let kaleidoMap = new Uint32Array(0);
export function clearEffectCaches(): void {
  kaleidoKey = '';
  kaleidoMap = new Uint32Array(0);
}
export const effectsB = [
  effect(
    'effect.disco',
    'Disco',
    'Stylized',
    (s, d, p, c) => {
      const t = c.time * n(p, 'speed'),
        rr = 1 + 0.5 * Math.sin(t * 3),
        gg = 1 + 0.5 * Math.sin(t * 3 + 2.1),
        bb = 1 + 0.5 * Math.sin(t * 3 + 4.2);
      for (let y = 0; y < s.height; y++)
        for (let x = 0; x < s.width; x++) {
          const i = (y * s.width + x) * 4,
            light =
              0.75 +
              0.25 * Math.sin((x / s.width) * 24 + (y / s.height) * 12 - t * 4);
          d.data[i] = s.data[i]! * rr * light;
          d.data[i + 1] = s.data[i + 1]! * gg * light;
          d.data[i + 2] = s.data[i + 2]! * bb * light;
        }
    },
    [speed],
  ),
  effect(
    'effect.glass',
    'Glass',
    'Stylized',
    (s, d, p, c) => {
      const t = c.time * n(p, 'speed'),
        size = Math.max(2, (n(p, 'size') * s.height) / 720),
        amount = (n(p, 'amount') * s.height) / 720;
      for (let y = 0; y < s.height; y++)
        for (let x = 0; x < s.width; x++)
          sample(
            s,
            d,
            (y * s.width + x) * 4,
            x + Math.sin((y / size) * Math.PI * 2 + t) * amount,
            y + Math.sin((x / size) * Math.PI * 2 + t) * amount,
          );
    },
    [
      speed,
      numberParam('size', 'Glass cell size', 8, 160, 48),
      numberParam('amount', 'Refraction', 0, 30, 8),
    ],
    'spatial',
  ),
  effect(
    'effect.comic',
    'Comic',
    'Stylized',
    (s, d, p) => {
      const levels = Math.round(n(p, 'levels')),
        threshold = n(p, 'edge');
      const lumas = new Float32Array(s.width * s.height);
      for (let j = 0; j < lumas.length; j++) {
        const i = j * 4;
        lumas[j] =
          0.2126 * s.data[i]! +
          0.7152 * s.data[i + 1]! +
          0.0722 * s.data[i + 2]!;
      }
      for (let y = 0; y < s.height; y++)
        for (let x = 0; x < s.width; x++) {
          const i = (y * s.width + x) * 4,
            edge =
              Math.abs(
                lumas[y * s.width + Math.min(s.width - 1, x + 1)]! -
                  lumas[y * s.width + Math.max(0, x - 1)]!,
              ) +
              Math.abs(
                lumas[Math.min(s.height - 1, y + 1) * s.width + x]! -
                  lumas[Math.max(0, y - 1) * s.width + x]!,
              );
          for (let k = 0; k < 3; k++)
            d.data[i + k] =
              edge > threshold
                ? 12
                : (Math.round((s.data[i + k]! / 255) * (levels - 1)) /
                    (levels - 1)) *
                  255;
        }
    },
    [
      numberParam('levels', 'Colour levels', 2, 12, 5),
      numberParam('edge', 'Ink threshold', 10, 200, 65),
    ],
  ),
  effect(
    'effect.retro-graphics',
    'Retro graphics',
    'Stylized',
    (s, d, p) => {
      const size = Math.max(2, (n(p, 'size') * s.height) / 720);
      for (let y = 0; y < s.height; y++)
        for (let x = 0; x < s.width; x++) {
          const i = (y * s.width + x) * 4,
            xx = (x % size) / size - 0.5,
            yy = (y % size) / size - 0.5,
            l = (s.data[i]! + s.data[i + 1]! + s.data[i + 2]!) / 765,
            dot = xx * xx + yy * yy < (1 - l) * 0.42;
          for (let k = 0; k < 3; k++)
            d.data[i + k] = dot ? 32 : Math.round(s.data[i + k]! / 85) * 85;
        }
    },
    [numberParam('size', 'Halftone cell', 3, 40, 8)],
  ),
  effect(
    'effect.vertical',
    'Vertical',
    'Stylized',
    (s, d, p, c) => {
      const amount = n(p, 'amount') * s.height,
        t = c.time * n(p, 'speed');
      for (let x = 0; x < s.width; x++) {
        const offset = Math.sin((x / s.width) * Math.PI * 8 + t) * amount;
        for (let y = 0; y < s.height; y++)
          sample(s, d, (y * s.width + x) * 4, x, y + offset);
      }
    },
    [speed, numberParam('amount', 'Vertical wave', 0, 0.3, 0.08)],
    'spatial',
  ),
  effect(
    'effect.radial',
    'Radial',
    'Optical',
    (s, d, p) => {
      const w = s.width,
        h = s.height,
        cx = (w - 1) / 2,
        cy = (h - 1) / 2,
        amount = n(p, 'amount'),
        xs = new Int32Array(w * 6),
        ys = new Int32Array(h * 6);
      for (let x = 0; x < w; x++)
        for (let k = 0; k < 6; k++)
          xs[x * 6 + k] =
            Math.round(cx + (x - cx) * (1 - (amount * k) / 5)) * 4;
      for (let y = 0; y < h; y++)
        for (let k = 0; k < 6; k++)
          ys[y * 6 + k] =
            Math.round(cy + (y - cy) * (1 - (amount * k) / 5)) * w * 4;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          let r = 0,
            g = 0,
            b = 0,
            a = 0;
          for (let k = 0; k < 6; k++) {
            const j = ys[y * 6 + k]! + xs[x * 6 + k]!,
              alpha = s.data[j + 3]!;
            r += s.data[j]! * alpha;
            g += s.data[j + 1]! * alpha;
            b += s.data[j + 2]! * alpha;
            a += alpha;
          }
          const i = (y * w + x) * 4;
          d.data[i] = a ? r / a : 0;
          d.data[i + 1] = a ? g / a : 0;
          d.data[i + 2] = a ? b / a : 0;
          d.data[i + 3] = a / 6;
        }
    },
    [numberParam('amount', 'Radial streak', 0, 0.4, 0.12)],
    'spatial',
  ),
  effect(
    'effect.smoke',
    'Smoke',
    'Stylized',
    (s, d, p, c) => {
      const t = c.time * n(p, 'speed');
      for (let y = 0; y < s.height; y++)
        for (let x = 0; x < s.width; x++) {
          const i = (y * s.width + x) * 4,
            u = (x / s.width) * 5,
            v = (y / s.height) * 5 - t * 0.25,
            f = clamp(
              (noise(u + t * 0.1, v, c.seed) * 0.7 +
                noise(u * 2, v * 2, c.seed + 1) * 0.3 -
                0.35) *
                0.65,
            );
          for (let k = 0; k < 3; k++)
            d.data[i + k] = s.data[i + k]! + (210 - s.data[i + k]!) * f;
        }
    },
    [speed],
  ),
  effect(
    'effect.kaleidoscope',
    'Kaleidoscope',
    'Stylized',
    (s, d, p) => {
      const segments = Math.round(n(p, 'segments')),
        w = s.width,
        h = s.height,
        key = w + ':' + h + ':' + segments;
      // One bounded coordinate map, never an image or clip state. Scrubbing reuses static geometry.
      if (kaleidoKey !== key) {
        const map = new Uint32Array(w * h),
          sector = (Math.PI * 2) / segments,
          cx = (w - 1) / 2,
          cy = (h - 1) / 2;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const dx = x - cx,
              dy = y - cy,
              r = Math.sqrt(dx * dx + dy * dy);
            let a = ((Math.atan2(dy, dx) % sector) + sector) % sector;
            if (a > sector / 2) a = sector - a;
            const sx = Math.max(
                0,
                Math.min(w - 1, Math.round(cx + r * Math.cos(a))),
              ),
              sy = Math.max(
                0,
                Math.min(h - 1, Math.round(cy + r * Math.sin(a))),
              );
            map[y * w + x] = (sy * w + sx) * 4;
          }
        kaleidoMap = map;
        kaleidoKey = key;
      }
      const map = kaleidoMap;
      for (let i = 0; i < map.length; i++) {
        const j = map[i]!,
          o = i * 4;
        d.data[o] = s.data[j]!;
        d.data[o + 1] = s.data[j + 1]!;
        d.data[o + 2] = s.data[j + 2]!;
        d.data[o + 3] = s.data[j + 3]!;
      }
      if (map.length > 2097152) clearEffectCaches();
    },
    [numberParam('segments', 'Segments', 2, 24, 6)],
    'spatial',
  ),
  effect(
    'effect.black-white-removal',
    'Black / white removal',
    'Keying',
    (s, d, p) => {
      d.data.set(s.data);
      const white = p['color'] === 'white',
        threshold = n(p, 'threshold') * 255,
        soft = n(p, 'softness') * 255;
      for (let i = 0; i < s.data.length; i += 4) {
        const distance = white
          ? 255 - Math.min(s.data[i]!, s.data[i + 1]!, s.data[i + 2]!)
          : Math.max(s.data[i]!, s.data[i + 1]!, s.data[i + 2]!);
        d.data[i + 3] = s.data[i + 3]! * clamp((distance - threshold) / soft);
      }
    },
    [
      selectParam('color', 'Remove', ['black', 'white'], 'black'),
      numberParam('threshold', 'Threshold', 0, 0.8, 0.1),
      numberParam('softness', 'Soft edge', 0.001, 0.5, 0.1),
    ],
    'modify',
  ),
  effect(
    'effect.green-screen',
    'Green screen',
    'Keying',
    (s, d, p) => {
      d.data.set(s.data);
      const color = p['screen'] as string,
        r = parseInt(color.slice(1, 3), 16),
        g = parseInt(color.slice(3, 5), 16),
        b = parseInt(color.slice(5, 7), 16),
        threshold = n(p, 'threshold'),
        soft = n(p, 'softness');
      for (let i = 0; i < s.data.length; i += 4) {
        const distance =
          Math.hypot(s.data[i]! - r, s.data[i + 1]! - g, s.data[i + 2]! - b) /
          441.67295593;
        d.data[i + 3] = s.data[i + 3]! * clamp((distance - threshold) / soft);
      }
    },
    [
      {
        name: 'screen',
        label: 'Screen colour',
        type: 'color',
        min: 0,
        max: 0xffffff,
        default: '#00ff00',
      },
      numberParam('threshold', 'Threshold', 0, 0.8, 0.2),
      numberParam('softness', 'Soft edge', 0.001, 0.5, 0.1),
    ],
    'modify',
  ),
];
