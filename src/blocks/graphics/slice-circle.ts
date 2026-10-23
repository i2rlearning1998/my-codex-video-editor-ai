// "Fifty slices": the 7.2 degree wedge is one fiftieth of a full turn. One
// wedge lights up, then copies of it fill the circle one by one while a counter
// and a running total (n x 800 km) tick up; the circle closes at 50 slices,
// 360 / 7.2 = 50, 50 x 800 km = 40,000 km, and the true value is shown beside it.
import { clamp } from '../helpers';
import { defineBlock } from '../render';
import {
  N,
  S,
  applyFade,
  col,
  fadeParams,
  label,
  num,
  pop,
  prog,
  txt,
} from './ink';

const rad = Math.PI / 180;

export const sliceCircle = defineBlock(
  {
    id: 'slice-circle',
    version: '1.0.0',
    name: 'Fifty slices of the Earth',
    category: 'Education',
    defaultDuration: 16,
    thumbnailTime: 11,
    params: [
      num('cx', 'Centre x %', 0, 100, 0.5, 50),
      num('cy', 'Centre y %', -50, 150, 0.5, 30),
      num('radius', 'Radius % of width', 5, 50, 0.5, 26),
      num('sliceDeg', 'Slice angle (deg)', 1, 90, 0.1, 7.2),
      num('perSlice', 'Distance per slice (km)', 1, 5000, 1, 800),
      num('sliceAt', 'First slice at (s, -1 off)', -1, 600, 0.1, 0.4),
      num('fillAt', 'Copies start at (s, -1 off)', -1, 600, 0.1, 2.4),
      num('fillDur', 'Copies take (s)', 1, 60, 0.1, 6.5),
      num('eqAt', '360 / 7.2 line at (s, -1 off)', -1, 600, 0.1, 9.6),
      num('totalAt', 'Total line at (s, -1 off)', -1, 600, 0.1, 11.2),
      num('actualAt', 'True value at (s, -1 off)', -1, 600, 0.1, 13.4),
      txt('actualText', 'True value text', 'Actual: 40,075 km', 30),
      txt('errText', 'Error text', 'only 0.2% off!', 30),
      col('a', 'Slice colour A', '#f4a43d'),
      col('b', 'Slice colour B', '#e8742a'),
      ...fadeParams,
    ],
  },
  (ctx, t, size, p) => {
    const { width: w, height: h } = size,
      C = { x: (N(p, 'cx') / 100) * w, y: (N(p, 'cy') / 100) * h },
      R = (N(p, 'radius') / 100) * w,
      step = N(p, 'sliceDeg') * rad,
      total = Math.max(1, Math.round(360 / N(p, 'sliceDeg'))),
      lw = Math.max(2, w * 0.004),
      on = (k: string) => N(p, k) >= 0 && t >= N(p, k),
      start = -Math.PI / 2 - step / 2;

    // The disc.
    ctx.save();
    ctx.fillStyle = '#f7ecd6';
    ctx.beginPath();
    ctx.arc(C.x, C.y, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const wedge = (i: number, alpha: number, colr: string, lift = 0) => {
      const a0 = start + i * step,
        mid = a0 + step / 2,
        ox = Math.cos(mid) * lift,
        oy = Math.sin(mid) * lift;
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.fillStyle = colr;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = lw * 0.8;
      ctx.beginPath();
      ctx.moveTo(C.x + ox, C.y + oy);
      ctx.arc(C.x + ox, C.y + oy, R, a0, a0 + step);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    // One wedge, pulled out of the circle.
    let n = 0;
    if (on('sliceAt')) {
      const k = prog(t, N(p, 'sliceAt'), 0.6, 'ease-out'),
        copying = on('fillAt');
      n = copying ? 1 : 0;
      wedge(0, k, S(p, 'a'), copying ? 0 : R * 0.12 * k);
      if (!copying)
        label(ctx, `${N(p, 'sliceDeg')}°`, C.x, C.y - R * 1.28, w * 0.07, {
          color: '#7a3d00',
          weight: 800,
          scale: pop(t, N(p, 'sliceAt') + 0.3),
        });
    }

    // Copies fill the circle one by one.
    if (on('fillAt')) {
      const u = clamp((t - N(p, 'fillAt')) / N(p, 'fillDur')),
        shown = Math.min(total, 1 + Math.floor(u * (total - 1) + 1e-6));
      n = shown;
      for (let i = 1; i < shown; i++) {
        const born = N(p, 'fillAt') + ((i - 1) / (total - 1)) * N(p, 'fillDur'),
          k = prog(t, born, 0.22, 'ease-out');
        wedge(i, k, i % 2 ? S(p, 'b') : S(p, 'a'), (1 - k) * R * 0.1);
      }
      wedge(0, 1, S(p, 'a'));
    }
    if (n > 0) {
      // Rim, and the counter in the middle.
      ctx.save();
      ctx.strokeStyle = '#6b4a2b';
      ctx.lineWidth = lw * 1.4;
      ctx.beginPath();
      ctx.arc(C.x, C.y, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (on('fillAt')) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(C.x, C.y, R * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      label(ctx, String(n), C.x, C.y - R * 0.04, w * 0.1, {
        color: '#7a3d00',
        weight: 800,
      });
      label(ctx, n === 1 ? 'slice' : 'slices', C.x, C.y + R * 0.2, w * 0.03, {
        color: '#7a3d00',
        weight: 600,
      });
      // Running total below the circle until the lines take over.
      if (!on('eqAt'))
        label(
          ctx,
          `${n} × ${N(p, 'perSlice')} km = ${(n * N(p, 'perSlice')).toLocaleString('en-US')} km`,
          C.x,
          C.y + R + h * 0.05,
          w * 0.05,
          { color: '#1b1b1b', weight: 700 },
        );
    }

    // The arithmetic.
    let y = C.y + R + h * 0.05;
    const line = (text: string, at: number, size: number, bold = 700) => {
      label(ctx, text, C.x, y, size, {
        color: '#1b1b1b',
        weight: bold,
        alpha: prog(t, at, 0.4, 'ease-out'),
        scale: 0.9 + 0.1 * pop(t, at),
      });
      y += size * 1.45;
    };
    if (on('eqAt'))
      line(`360° ÷ ${N(p, 'sliceDeg')}° = ${total}`, N(p, 'eqAt'), w * 0.055);
    if (on('totalAt'))
      line(
        `${total} × ${N(p, 'perSlice')} km = ${(total * N(p, 'perSlice')).toLocaleString('en-US')} km`,
        N(p, 'totalAt'),
        w * 0.06,
        800,
      );
    if (on('actualAt')) {
      const k = prog(t, N(p, 'actualAt'), 0.5, 'ease-out');
      label(ctx, S(p, 'actualText'), C.x, y, w * 0.05, {
        color: '#1f7a3a',
        weight: 700,
        strip: 'rgba(255,255,255,0.9)',
        alpha: k,
        scale: 0.9 + 0.1 * pop(t, N(p, 'actualAt')),
      });
      label(ctx, S(p, 'errText'), C.x, y + w * 0.07, w * 0.05, {
        color: '#c0262d',
        weight: 800,
        alpha: prog(t, N(p, 'actualAt') + 0.5, 0.4, 'ease-out'),
        scale: pop(t, N(p, 'actualAt') + 0.5),
      });
    }
    applyFade(ctx, w, h, p);
  },
);
