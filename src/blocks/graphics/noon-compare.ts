// "Two cities, one Sun": at the same moment the Sun's parallel rays hit a stick
// in Syene (no shadow) and a stick in Alexandria (a short shadow). Draw it in
// the top part of the frame, over a picture or a plain wash. All motion is a
// closed-form function of time, so scrubbing is exact.
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

export const noonCompare = defineBlock(
  {
    id: 'noon-compare',
    version: '1.0.0',
    name: 'Two cities, one Sun',
    category: 'Education',
    defaultDuration: 8,
    fps: 24,
    thumbnailTime: 6,
    params: [
      num('cy', 'Middle of the diagram, y %', 5, 95, 0.5, 30),
      num('stickLen', 'Stick length % of height', 3, 30, 0.5, 12),
      num('angle', 'Shadow angle drawn (deg)', 2, 30, 0.1, 17),
      num('sunAt', 'Sun and "12:00" at (s, -1 off)', -1, 600, 0.1, 0.2),
      num('raysAt', 'Rays fall at (s, -1 off)', -1, 600, 0.1, 1.0),
      num('stickAt', 'Sticks stand at (s, -1 off)', -1, 600, 0.1, 2.2),
      num('shadowAt', 'Shadows appear at (s, -1 off)', -1, 600, 0.1, 3.6),
      num('angleAt', 'Angle mark at (s, -1 off)', -1, 600, 0.1, 5.0),
      txt('leftName', 'Left city', 'Syene', 24),
      txt('rightName', 'Right city', 'Alexandria', 24),
      txt('leftNote', 'Left note', 'no shadow', 30),
      txt('rightNote', 'Right note', 'shadow', 30),
      txt('angleText', 'Angle text', '7.2°', 12),
      col('ray', 'Ray colour', '#f0a03c'),
      col('ink', 'Ink colour', '#2b2b2b'),
      col('stick', 'Stick colour', '#a8773f'),
      col('accent', 'Accent colour', '#b8372f'),
      ...fadeParams,
    ],
  },
  (ctx, t, size, p) => {
    const { width: w, height: h } = size,
      cy = (N(p, 'cy') / 100) * h,
      len = (N(p, 'stickLen') / 100) * h,
      ang = (N(p, 'angle') * Math.PI) / 180,
      ground = cy + len * 0.62,
      top = cy - len * 1.75,
      xl = w * 0.27,
      xr = w * 0.73,
      on = (k: string) => N(p, k) >= 0 && t >= N(p, k),
      ink = S(p, 'ink'),
      lw = Math.max(3, w * 0.006);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Ground line with two small tufts of sand.
    const gk = prog(t, 0, 0.7, 'ease-out');
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(w * 0.06, ground);
    ctx.lineTo(w * 0.06 + w * 0.88 * gk, ground);
    ctx.stroke();

    // The Sun, far above, with a "12:00" chip.
    if (on('sunAt')) {
      const k = pop(t, N(p, 'sunAt')),
        sx = w * 0.5,
        sy = top - len * 0.32,
        r = w * 0.052 * k,
        pulse = 1 + 0.05 * Math.sin(t * 3);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3.2 * pulse);
      g.addColorStop(0, 'rgba(255,225,130,0.9)');
      g.addColorStop(0.4, 'rgba(255,185,60,0.35)');
      g.addColorStop(1, 'rgba(255,170,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, r * 3.2 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffd24a';
      ctx.strokeStyle = ink;
      ctx.lineWidth = lw * 0.8;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      label(ctx, '12:00', sx + w * 0.2, sy, w * 0.05, {
        color: '#222',
        strip: 'rgba(255,255,255,0.9)',
        alpha: clamp(k),
        scale: clamp(k),
      });
    }

    // Parallel rays: dashed arrows that keep sliding down toward the ground.
    if (on('raysAt')) {
      const k = prog(t, N(p, 'raysAt'), 1.0, 'ease-out'),
        y0 = top - len * 0.1,
        y1 = y0 + (ground - y0) * k;
      ctx.save();
      ctx.strokeStyle = S(p, 'ray');
      ctx.lineWidth = lw * 1.1;
      ctx.setLineDash([w * 0.03, w * 0.022]);
      ctx.lineDashOffset = -t * w * 0.09;
      for (const cx of [xl, xr])
        for (const dx of [-w * 0.13, -w * 0.065, 0, w * 0.065, w * 0.13]) {
          ctx.globalAlpha = 0.85 * (Math.abs(dx) < 1 ? 1 : 0.55);
          ctx.beginPath();
          ctx.moveTo(cx + dx, y0);
          ctx.lineTo(cx + dx, y1);
          ctx.stroke();
        }
      ctx.restore();
    }

    // Sticks and their shadows.
    const stickK = on('stickAt')
        ? prog(t, N(p, 'stickAt'), 0.6, 'ease-out')
        : 0,
      shK = on('shadowAt') ? prog(t, N(p, 'shadowAt'), 1.4, 'ease-out') : 0,
      shLen = Math.tan(ang) * len;
    if (stickK > 0) {
      for (const [cx, shadow] of [
        [xl, 0],
        [xr, shLen * shK],
      ] as const) {
        // Shadow first, so the stick is drawn over it.
        if (shadow > 1) {
          ctx.strokeStyle = 'rgba(40,30,20,0.5)';
          ctx.lineWidth = lw * 3.2;
          ctx.beginPath();
          ctx.moveTo(cx, ground + lw * 0.2);
          ctx.lineTo(cx - shadow, ground + lw * 0.2);
          ctx.stroke();
        }
        const sh = len * stickK;
        ctx.strokeStyle = ink;
        ctx.lineWidth = w * 0.03;
        ctx.beginPath();
        ctx.moveTo(cx, ground);
        ctx.lineTo(cx, ground - sh);
        ctx.stroke();
        ctx.strokeStyle = S(p, 'stick');
        ctx.lineWidth = w * 0.03 - lw * 1.3;
        ctx.beginPath();
        ctx.moveTo(cx, ground);
        ctx.lineTo(cx, ground - sh);
        ctx.stroke();
        // Right-angle mark at the foot.
        if (stickK > 0.95) {
          const m = w * 0.028;
          ctx.strokeStyle = S(p, 'accent');
          ctx.lineWidth = lw * 0.8;
          ctx.beginPath();
          ctx.moveTo(cx + m, ground);
          ctx.lineTo(cx + m, ground - m);
          ctx.lineTo(cx, ground - m);
          ctx.stroke();
        }
      }
      // Syene: a tiny dot of shadow right under the stick (the Sun is overhead).
      if (on('shadowAt')) {
        ctx.fillStyle = 'rgba(40,30,20,0.55)';
        ctx.beginPath();
        ctx.ellipse(
          xl,
          ground + lw * 0.3,
          w * 0.02,
          lw * 0.9,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }

    // Angle between the stick's top and the shadow's tip, at Alexandria.
    if (on('angleAt') && stickK > 0.9) {
      const k = prog(t, N(p, 'angleAt'), 0.9, 'ease-out'),
        topY = ground - len,
        tipX = xr - shLen,
        r = len * 0.46;
      ctx.save();
      ctx.strokeStyle = S(p, 'accent');
      ctx.lineWidth = lw * 0.9;
      ctx.setLineDash([w * 0.012, w * 0.014]);
      ctx.beginPath();
      ctx.moveTo(xr, topY);
      ctx.lineTo(tipX, ground);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = lw * 1.2;
      ctx.beginPath();
      ctx.arc(xr, topY, r, Math.PI / 2, Math.PI / 2 + ang * k);
      ctx.stroke();
      ctx.restore();
      label(
        ctx,
        S(p, 'angleText'),
        xr - len * 0.62,
        topY + len * 0.5,
        w * 0.062,
        {
          color: S(p, 'accent'),
          alpha: clamp(k * 1.4),
          scale: pop(t, N(p, 'angleAt') + 0.3) || 0.001,
          strip: 'rgba(255,255,255,0.88)',
        },
      );
    }

    // City names and notes.
    const nk = prog(t, 0.4, 0.6, 'ease-out');
    label(ctx, S(p, 'leftName'), xl, ground + len * 0.24, w * 0.056, {
      color: S(p, 'accent'),
      alpha: nk,
      strip: 'rgba(255,255,255,0.85)',
    });
    label(ctx, S(p, 'rightName'), xr, ground + len * 0.24, w * 0.056, {
      color: S(p, 'accent'),
      alpha: nk,
      strip: 'rgba(255,255,255,0.85)',
    });
    if (on('shadowAt')) {
      const k = prog(t, N(p, 'shadowAt') + 0.4, 0.6);
      label(ctx, S(p, 'leftNote'), xl, ground + len * 0.5, w * 0.044, {
        color: '#222',
        alpha: k,
        strip: 'rgba(255,255,255,0.85)',
      });
      label(ctx, S(p, 'rightNote'), xr, ground + len * 0.5, w * 0.044, {
        color: '#222',
        alpha: k,
        strip: 'rgba(255,255,255,0.85)',
      });
    }
    applyFade(ctx, w, h, p);
  },
);
