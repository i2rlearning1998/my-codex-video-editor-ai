import { transitionsB } from './transitions-b';
import type { Surface } from './types';
import { numberParam, selectParam, n, transition } from './definition';
import { clamp, hash, mixPixel, mixIndexed, sample, surface } from './surface';
import { blur, transform } from './spatial';
const softness = numberParam('softness', 'Softness', 0.001, 0.5, 0.12);
const direction = selectParam(
  'direction',
  'Direction',
  ['left', 'right', 'up', 'down'],
  'left',
);
function mix(a: Surface, b: Surface, d: Surface, t: number): void {
  for (let i = 0; i < a.data.length; i += 4) mixPixel(a, b, d, i, t);
}
export const transitions = [
  transition(
    'transition.cross-blur',
    'Cross blur',
    'Fades and blurs',
    (a, b, d, t, p) => {
      const mixed = surface(a.width, a.height),
        r = (n(p, 'radius') * Math.sin(Math.PI * t) * a.height) / 720;
      mix(a, b, mixed, t);
      blur(mixed, d, r, false);
    },
    [numberParam('radius', 'Blur radius', 1, 32, 20)],
  ),
  transition('transition.burn', 'Burn', 'Fades and blurs', (a, b, d, t) => {
    const src = t < 0.5 ? a : b,
      level = Math.abs(t * 2 - 1),
      heat = Math.sin(level * Math.PI) * 30;
    for (let i = 0; i < a.data.length; i += 4) {
      d.data[i] = src.data[i]! * level + heat;
      d.data[i + 1] = src.data[i + 1]! * level + heat * 0.25;
      d.data[i + 2] = src.data[i + 2]! * level;
      d.data[i + 3] = a.data[i + 3]! * (1 - t) + b.data[i + 3]! * t;
    }
  }),
  transition(
    'transition.horizontal-banding',
    'Horizontal banding',
    'Fades and blurs',
    (a, b, d, t, p) => {
      const bands = Math.round(n(p, 'bands'));
      for (let y = 0; y < a.height; y++) {
        const band = Math.floor((y / a.height) * bands);
        for (let x = 0; x < a.width; x++) {
          const q = band % 2 ? (x + 0.5) / a.width : 1 - (x + 0.5) / a.width;
          mixPixel(
            a,
            b,
            d,
            (y * a.width + x) * 4,
            clamp((t * 1.12 - q) / 0.12),
          );
        }
      }
    },
    [numberParam('bands', 'Bands', 2, 32, 10)],
  ),
  transition(
    'transition.tiles',
    'Tiles',
    'Fades and blurs',
    (a, b, d, t, p, c) => {
      const count = Math.round(n(p, 'tiles'));
      for (let y = 0; y < a.height; y++)
        for (let x = 0; x < a.width; x++) {
          const tile =
              Math.floor((y / a.height) * count) * count +
              Math.floor((x / a.width) * count),
            start = hash(tile, c.seed) * 0.7;
          mixPixel(a, b, d, (y * a.width + x) * 4, clamp((t - start) / 0.3));
        }
    },
    [numberParam('tiles', 'Tiles per axis', 2, 20, 8)],
  ),
];
for (const dir of ['up', 'down', 'left', 'right', 'diagonal', 'iris']) {
  const variants = dir === 'up' || dir === 'down' ? ['hard', 'soft'] : ['soft'];
  for (const variant of variants) {
    const hard = variant === 'hard';
    const name =
      dir === 'iris'
        ? 'Circle / iris wipe'
        : dir === 'diagonal'
          ? 'Diagonal soft wipe'
          : (hard ? 'Hard' : 'Soft') + ' wipe ' + dir;
    transitions.push(
      transition(
        'transition.' +
          (dir === 'iris'
            ? 'iris-wipe'
            : dir === 'diagonal'
              ? 'diagonal-soft-wipe'
              : variant + '-wipe-' + dir),
        name,
        'Wipes',
        (a, b, d, t, p) => {
          const s = hard ? 0 : n(p, 'softness');
          const norm = Math.sqrt(a.width * a.width + a.height * a.height) / 2;
          for (let y = 0; y < a.height; y++)
            for (let x = 0; x < a.width; x++) {
              const u = (x + 0.5) / a.width,
                v = (y + 0.5) / a.height;
              let q =
                dir === 'left'
                  ? 1 - u
                  : dir === 'right'
                    ? u
                    : dir === 'up'
                      ? 1 - v
                      : dir === 'down'
                        ? v
                        : dir === 'diagonal'
                          ? (u + v) / 2
                          : Math.sqrt(
                              ((u - 0.5) * a.width) ** 2 +
                                ((v - 0.5) * a.height) ** 2,
                            ) / norm;
              if (p['direction'] === 'reverse') q = 1 - q;
              const m = hard ? (q <= t ? 1 : 0) : clamp((t * (1 + s) - q) / s);
              mixPixel(a, b, d, (y * a.width + x) * 4, m);
            }
        },
        hard
          ? []
          : [
              softness,
              ...(dir === 'iris' || dir === 'diagonal'
                ? [
                    selectParam(
                      'direction',
                      'Direction',
                      ['forward', 'reverse'],
                      'forward',
                    ),
                  ]
                : []),
            ],
      ),
    );
  }
}
transitions.push(
  transition(
    'transition.spin',
    'Spin',
    'Motion transitions',
    (a, b, d, t, p) => {
      const sign = p['direction'] === 'clockwise' ? 1 : -1,
        x = surface(a.width, a.height),
        y = surface(a.width, a.height);
      transform(a, x, t * Math.PI * sign, 1 + t);
      transform(b, y, (t - 1) * Math.PI * sign, 2 - t);
      mix(x, y, d, t);
    },
    [
      selectParam(
        'direction',
        'Direction',
        ['clockwise', 'counterclockwise'],
        'clockwise',
      ),
    ],
  ),
  transition('transition.zoom', 'Zoom', 'Motion transitions', (a, b, d, t) => {
    const x = surface(a.width, a.height),
      y = surface(a.width, a.height);
    transform(a, x, 0, 1 + 3 * t);
    transform(b, y, 0, 0.25 + 0.75 * t);
    mix(x, y, d, t);
  }),
  transition(
    'transition.swirl',
    'Swirl',
    'Motion transitions',
    (a, b, d, t, p) => {
      const cx = (a.width - 1) / 2,
        cy = (a.height - 1) / 2,
        max = Math.hypot(cx, cy) || 1,
        power = Math.sin(t * Math.PI) * n(p, 'turns') * Math.PI * 2;
      const cosTable = new Float32Array(2049),
        sinTable = new Float32Array(2049);
      for (let j = 0; j <= 2048; j++) {
        const angle = power * (1 - j / 2048);
        cosTable[j] = Math.cos(angle);
        sinTable[j] = Math.sin(angle);
      }
      for (let yy = 0; yy < a.height; yy++)
        for (let xx = 0; xx < a.width; xx++) {
          const dx = xx - cx,
            dy = yy - cy,
            r = Math.sqrt(dx * dx + dy * dy),
            position = Math.min(2047.999999, (r / max) * 2048),
            at = Math.floor(position),
            fraction = position - at,
            cs = cosTable[at]! + (cosTable[at + 1]! - cosTable[at]!) * fraction,
            sn = sinTable[at]! + (sinTable[at + 1]! - sinTable[at]!) * fraction,
            i = (yy * a.width + xx) * 4;
          const ax = Math.max(
              0,
              Math.min(a.width - 1, Math.round(cx + dx * cs - dy * sn)),
            ),
            ay = Math.max(
              0,
              Math.min(a.height - 1, Math.round(cy + dx * sn + dy * cs)),
            ),
            bx = Math.max(
              0,
              Math.min(a.width - 1, Math.round(cx + dx * cs + dy * sn)),
            ),
            by = Math.max(
              0,
              Math.min(a.height - 1, Math.round(cy - dx * sn + dy * cs)),
            );
          mixIndexed(
            a,
            b,
            d,
            i,
            (ay * a.width + ax) * 4,
            (by * a.width + bx) * 4,
            t,
          );
        }
    },
    [numberParam('turns', 'Turns', 0.1, 2, 0.5)],
  ),
  transition(
    'transition.push',
    'Push',
    'Motion transitions',
    (a, b, d, t, p) => {
      const dir = p['direction'],
        horizontal = dir === 'left' || dir === 'right',
        sign = dir === 'left' || dir === 'up' ? 1 : -1,
        size = horizontal ? a.width : a.height,
        shift = Math.round(t * size);
      for (let y = 0; y < a.height; y++)
        for (let x = 0; x < a.width; x++) {
          const coordinate = horizontal ? x : y,
            old = coordinate + sign * shift,
            inside = old >= 0 && old < size,
            from = inside ? a : b,
            source = inside ? old : old - sign * size;
          sample(
            from,
            d,
            (y * a.width + x) * 4,
            horizontal ? source : x,
            horizontal ? y : source,
          );
        }
    },
    [direction],
  ),
);

transitions.push(...transitionsB);
