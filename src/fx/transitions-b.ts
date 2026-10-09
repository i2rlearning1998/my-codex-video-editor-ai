import { transition, numberParam, n } from './definition';
import { clamp, hash, mixPixel, sample, surface } from './surface';
export const transitionsB = [
  transition(
    'transition.glitch',
    'Glitch',
    'Stylized transitions',
    (a, b, d, t, p, c) => {
      const frame = Math.floor(t * 30),
        w = a.width,
        amount = Math.sin(t * Math.PI) * n(p, 'amount'),
        aa = surface(w, a.height),
        bb = surface(w, a.height);
      for (let y = 0; y < a.height; y++) {
        const shift = Math.round(
          (hash(Math.floor(y / 8), c.seed ^ frame) - 0.5) * w * amount,
        );
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          sample(a, aa, i, (((x + shift) % w) + w) % w, y);
          sample(b, bb, i, (((x - shift) % w) + w) % w, y);
          mixPixel(aa, bb, d, i, t);
          if (y % 4 === 0) {
            d.data[i] = d.data[i]! * 0.75;
            d.data[i + 1] = d.data[i + 1]! * 0.75;
            d.data[i + 2] = d.data[i + 2]! * 0.75;
          }
        }
      }
    },
    [numberParam('amount', 'Displacement', 0, 0.4, 0.12)],
  ),
  transition(
    'transition.glitch-reveal',
    'Glitch reveal',
    'Stylized transitions',
    (a, b, d, t, _p, c) => {
      for (let y = 0; y < a.height; y++) {
        const threshold = hash(
          Math.floor(y / Math.max(1, a.height / 30)),
          c.seed,
        );
        for (let x = 0; x < a.width; x++) {
          const q = 0.75 * threshold + (0.25 * (x + 0.5)) / a.width;
          mixPixel(a, b, d, (y * a.width + x) * 4, clamp((t * 1.1 - q) / 0.1));
        }
      }
    },
  ),
  transition(
    'transition.bloom',
    'Bloom',
    'Stylized transitions',
    (a, b, d, t) => {
      const light = Math.sin(Math.PI * t) ** 4;
      for (let i = 0; i < a.data.length; i += 4) {
        mixPixel(a, b, d, i, t);
        for (let k = 0; k < 3; k++)
          d.data[i + k] = d.data[i + k]! + (255 - d.data[i + k]!) * light;
      }
    },
  ),
  transition(
    'transition.page-turn',
    'Page turn',
    'Stylized transitions',
    (a, b, d, t, p) => {
      const w = a.width,
        h = a.height,
        edge = (1 - t) * w,
        curl = Math.sin(t * Math.PI) * w * n(p, 'curl');
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4,
            bend = edge + (y / h - 0.5) ** 2 * curl * 0.6;
          if (x < bend - curl) sample(a, d, i, x, y);
          else if (x < bend) {
            const f = (bend - x) / Math.max(curl, 0.001);
            sample(a, d, i, clamp(bend - curl + f * curl, 0, w - 1), y);
            const shade = 0.65 + 0.35 * Math.sin(f * Math.PI);
            for (let k = 0; k < 3; k++)
              d.data[i + k] = (d.data[i + k]! * 0.2 + 204) * shade;
          } else {
            sample(b, d, i, x, y);
            const shadow =
              1 - 0.35 * Math.exp(-(x - bend) / Math.max(1, curl * 0.16));
            for (let k = 0; k < 3; k++) d.data[i + k] = d.data[i + k]! * shadow;
          }
        }
    },
    [numberParam('curl', 'Curl width', 0.02, 0.5, 0.16)],
  ),
  transition(
    'transition.cube-flip',
    'Cube / 3D flip',
    'Stylized transitions',
    (a, b, d, t) => {
      const cs = Math.cos((t * Math.PI) / 2),
        sn = Math.sin((t * Math.PI) / 2),
        split = cs / (cs + sn),
        w = a.width,
        h = a.height;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const u = (x + 0.5) / w,
            old = u < split,
            face = old ? a : b,
            local = old
              ? u / Math.max(split, 0.000001)
              : (u - split) / Math.max(1 - split, 0.000001),
            depth = old ? 1 - 0.35 * sn * local : 1 - 0.35 * cs * (1 - local),
            sy = (y - (h - 1) / 2) / depth + (h - 1) / 2,
            i = (y * w + x) * 4;
          sample(face, d, i, local * (w - 1), sy, 'clear');
          const shade = 0.55 + 0.45 * (old ? cs : sn);
          for (let k = 0; k < 3; k++) d.data[i + k] = d.data[i + k]! * shade;
        }
    },
  ),
];
