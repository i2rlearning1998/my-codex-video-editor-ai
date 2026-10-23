// "Why the rays are parallel": a Sun close to the Earth sends rays that fan out
// (every place gets a different angle); the Sun is then pushed away until it
// is 150 million km off and the rays have straightened into parallel lines.
import { lerp } from '../helpers';
import { defineBlock } from '../render';
import { N, S, applyFade, fadeParams, label, num, pop, prog, txt } from './ink';

export const sunScale = defineBlock(
  {
    id: 'sun-scale',
    version: '1.0.0',
    name: 'Sun far away: rays turn parallel',
    category: 'Education',
    defaultDuration: 9,
    thumbnailTime: 6,
    params: [
      num('earthX', 'Earth x %', 0, 100, 0.5, 18),
      num('y', 'Row y %', -20, 120, 0.5, 26),
      num('earthR', 'Earth radius % of width', 2, 30, 0.5, 9),
      num('pushAt', 'Sun moves away at (s)', 0, 600, 0.1, 2.6),
      num('pushDur', 'Move takes (s)', 0.5, 60, 0.1, 3.4),
      num('textAt', 'Distance text at (s, -1 off)', -1, 600, 0.1, 6.2),
      txt('nearText', 'Caption while close', 'Sun close: rays spread out', 40),
      txt('farText', 'Caption when far', 'Sun far away: rays are parallel', 44),
      txt('distText', 'Distance text', '149,597,871 km', 24),
      ...fadeParams,
    ],
  },
  (ctx, t, size, p) => {
    const { width: w, height: h } = size,
      ex = (N(p, 'earthX') / 100) * w,
      y = (N(p, 'y') / 100) * h,
      R = (N(p, 'earthR') / 100) * w,
      lw = Math.max(2, w * 0.004),
      e = prog(t, N(p, 'pushAt'), N(p, 'pushDur'), 'ease-in-out'),
      near = w * 0.52,
      // Distance from the Earth's centre to the Sun, pushed out on a log scale.
      dist = Math.exp(lerp(Math.log(near - ex), Math.log(w * 60), e)),
      sx = ex + dist,
      appear = prog(t, 0, 0.7, 'ease-out');

    // Rays: from the Sun to points on the sunward half of the Earth.
    ctx.save();
    ctx.globalAlpha *= appear;
    ctx.lineCap = 'round';
    for (let k = -3; k <= 3; k++) {
      const a = (k / 3) * (Math.PI / 2.6),
        px = ex + Math.cos(a) * R,
        py = y + Math.sin(a) * R,
        // The ray comes from the Sun's centre; stop at the canvas edge.
        dx = sx - px,
        dy = y - py,
        len = Math.hypot(dx, dy),
        reach = Math.min(len, w * 1.2),
        ux = dx / len,
        uy = dy / len;
      ctx.strokeStyle = 'rgba(255,190,70,0.28)';
      ctx.lineWidth = lw * 3.4;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + ux * reach, py + uy * reach);
      ctx.stroke();
      ctx.strokeStyle = '#f4a43d';
      ctx.lineWidth = lw * 1.1;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + ux * reach, py + uy * reach);
      ctx.stroke();
    }
    ctx.restore();

    // The Earth: a small blue-green ball with a night side.
    ctx.save();
    ctx.globalAlpha *= appear;
    const g = ctx.createRadialGradient(
      ex + R * 0.35,
      y - R * 0.2,
      R * 0.1,
      ex,
      y,
      R,
    );
    g.addColorStop(0, '#6fc3d6');
    g.addColorStop(1, '#2b6f86');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ex, y, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7fb36a';
    for (const [dx, dy, rr] of [
      [-0.2, -0.2, 0.32],
      [0.25, 0.25, 0.26],
      [-0.35, 0.35, 0.15],
    ] as const) {
      ctx.beginPath();
      ctx.arc(ex + dx * R, y + dy * R, rr * R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // The Sun, while it is still in the picture.
    if (sx < w * 1.12) {
      const sr = w * 0.07 * (1 - 0.45 * e);
      ctx.save();
      ctx.globalAlpha *= appear;
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(sx, y, 0, sx, y, sr * 2.4);
      halo.addColorStop(0, 'rgba(255,225,120,0.9)');
      halo.addColorStop(1, 'rgba(255,170,40,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(sx, y, sr * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= appear;
      ctx.fillStyle = '#ffc93a';
      ctx.beginPath();
      ctx.arc(sx, y, sr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Captions.
    label(
      ctx,
      e < 0.5 ? S(p, 'nearText') : S(p, 'farText'),
      w / 2,
      y + R * 2.6,
      w * 0.046,
      {
        color: '#1b1b1b',
        weight: 700,
        alpha:
          appear *
          (e < 0.5
            ? 1
            : prog(t, N(p, 'pushAt') + N(p, 'pushDur') * 0.5, 0.4, 'ease-out')),
        scale:
          e < 0.5
            ? 1
            : 0.9 + 0.1 * pop(t, N(p, 'pushAt') + N(p, 'pushDur') * 0.5),
      },
    );
    if (N(p, 'textAt') >= 0 && t >= N(p, 'textAt')) {
      label(ctx, S(p, 'distText'), w / 2, y + R * 2.6 + w * 0.075, w * 0.052, {
        color: '#7a3d00',
        weight: 800,
        strip: 'rgba(255,255,255,0.9)',
        alpha: prog(t, N(p, 'textAt'), 0.4, 'ease-out'),
        scale: pop(t, N(p, 'textAt')),
      });
    }
    applyFade(ctx, w, h, p);
  },
);
