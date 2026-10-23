// "Dust in the light": slow golden specks that drift and twinkle over a
// picture, so a still illustration breathes. Each speck is a closed-form
// function of time, so scrubbing is exact.
import { rngFor } from '../helpers';
import { defineBlock } from '../render';
import { N, S, col, num } from './ink';

export const dust = defineBlock(
  {
    id: 'dust',
    version: '1.0.0',
    name: 'Floating dust',
    category: 'Education',
    defaultDuration: 8,
    fps: 15,
    thumbnailTime: 2,
    params: [
      num('count', 'Specks', 5, 150, 1, 55),
      num('speed', 'Drift speed', 0, 5, 0.05, 1),
      num('size', 'Speck size % of width', 0.1, 3, 0.05, 0.55),
      num('angle', 'Drift direction (deg, 0 = right)', -180, 180, 1, -25),
      num('opacity', 'Opacity', 0, 1, 0.01, 0.7),
      col('color', 'Colour', '#fff1c4'),
    ],
  },
  (ctx, t, size, p, seed) => {
    const { width: w, height: h } = size,
      n = Math.round(N(p, 'count')),
      a = (N(p, 'angle') * Math.PI) / 180,
      vx = Math.cos(a),
      vy = Math.sin(a);
    ctx.fillStyle = S(p, 'color');
    for (let i = 0; i < n; i++) {
      const r1 = rngFor(seed, i * 7 + 1),
        r2 = rngFor(seed, i * 7 + 2),
        r3 = rngFor(seed, i * 7 + 3),
        r4 = rngFor(seed, i * 7 + 4),
        sp = (0.012 + 0.03 * r3) * N(p, 'speed'),
        x =
          (((r1 + t * sp * vx + Math.sin(t * 0.6 + r4 * 6) * 0.006) % 1) + 1) %
          1,
        y =
          (((r2 + t * sp * vy + Math.cos(t * 0.5 + r4 * 6) * 0.006) % 1) + 1) %
          1,
        tw =
          0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (1 + r3 * 1.6) + r4 * 6.28)),
        rad = (N(p, 'size') / 100) * w * (0.5 + r4 * 1.1);
      ctx.globalAlpha = N(p, 'opacity') * tw * 0.35;
      ctx.beginPath();
      ctx.arc(x * w, y * h, rad * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = N(p, 'opacity') * tw;
      ctx.beginPath();
      ctx.arc(x * w, y * h, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  },
);
