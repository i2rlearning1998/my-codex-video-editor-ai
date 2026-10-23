// "Noon sun in the well": a shaft of sunlight comes straight down and, at the
// moment the Sun is right overhead, reaches the water: a warm glow blooms,
// ripples spread and sparkles flicker. It lights up a picture of a well seen
// from above (draw it over that picture).
import { clamp } from '../helpers';
import { defineBlock } from '../render';
import { N, applyFade, fadeParams, num, prog } from './ink';

export const wellBeam = defineBlock(
  {
    id: 'well-beam',
    version: '1.0.0',
    name: 'Sunbeam into the well',
    category: 'Education',
    defaultDuration: 6,
    thumbnailTime: 4,
    params: [
      num('cx', 'Well centre x %', 0, 100, 0.5, 50),
      num('cy', 'Well centre y %', -50, 150, 0.5, 20),
      num('radius', 'Water radius % of width', 2, 40, 0.5, 11),
      num('sunY', 'Sun height % of frame', -20, 100, 0.5, 6),
      num('sunAt', 'Sun and beam at (s, -1 off)', -1, 600, 0.1, 0.2),
      num('glowAt', 'Water glows at (s, -1 off)', -1, 600, 0.1, 1.8),
      num('rippleAt', 'Ripples at (s, -1 off)', -1, 600, 0.1, 2.4),
      ...fadeParams,
    ],
  },
  (ctx, t, size, p) => {
    const { width: w, height: h } = size,
      x = (N(p, 'cx') / 100) * w,
      y = (N(p, 'cy') / 100) * h,
      r = (N(p, 'radius') / 100) * w,
      sy = (N(p, 'sunY') / 100) * h,
      on = (k: string) => N(p, k) >= 0 && t >= N(p, k);

    if (on('sunAt')) {
      const k = prog(t, N(p, 'sunAt'), 0.9, 'ease-out'),
        pulse = 1 + 0.06 * Math.sin(t * 3);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Light shaft: a soft vertical trapezoid from the Sun to the water.
      const g = ctx.createLinearGradient(0, sy, 0, y);
      g.addColorStop(0, 'rgba(255,214,110,0.55)');
      g.addColorStop(1, 'rgba(255,214,110,0.12)');
      ctx.fillStyle = g;
      const top = r * 0.35 * k,
        bottom = r * 0.95 * k;
      ctx.beginPath();
      ctx.moveTo(x - top, sy);
      ctx.lineTo(x + top, sy);
      ctx.lineTo(x + bottom, y);
      ctx.lineTo(x - bottom, y);
      ctx.closePath();
      ctx.fill();
      // Sun with a halo.
      const halo = ctx.createRadialGradient(x, sy, 0, x, sy, r * 1.6 * pulse);
      halo.addColorStop(0, 'rgba(255,230,140,0.95)');
      halo.addColorStop(0.35, 'rgba(255,190,60,0.45)');
      halo.addColorStop(1, 'rgba(255,170,40,0)');
      ctx.fillStyle = halo;
      ctx.globalAlpha *= k;
      ctx.beginPath();
      ctx.arc(x, sy, r * 1.6 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= k;
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath();
      ctx.arc(x, sy, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Water glow and sparkles.
    if (on('glowAt')) {
      const k = prog(t, N(p, 'glowAt'), 0.8, 'ease-out'),
        flick = 0.85 + 0.15 * Math.sin(t * 7);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.05);
      g.addColorStop(0, `rgba(255,236,150,${0.95 * k * flick})`);
      g.addColorStop(0.5, `rgba(255,200,70,${0.5 * k})`);
      g.addColorStop(1, 'rgba(255,180,50,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Four-point sparkles that blink at different times.
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + 0.4,
          d = r * (0.25 + 0.5 * ((i * 0.37) % 1)),
          blink = clamp(Math.sin(t * 4.2 + i * 1.7) * 1.4) * k;
        if (blink <= 0.02) continue;
        const sx = x + Math.cos(a) * d,
          sy2 = y + Math.sin(a) * d * 0.7,
          s = r * 0.22 * blink;
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.moveTo(sx, sy2 - s);
        ctx.quadraticCurveTo(sx, sy2, sx + s, sy2);
        ctx.quadraticCurveTo(sx, sy2, sx, sy2 + s);
        ctx.quadraticCurveTo(sx, sy2, sx - s, sy2);
        ctx.quadraticCurveTo(sx, sy2, sx, sy2 - s);
        ctx.fill();
        ctx.restore();
      }
    }

    // Ripples spreading from the middle.
    if (on('rippleAt')) {
      for (let i = 0; i < 3; i++) {
        const age = (t - N(p, 'rippleAt') - i * 0.55) % 1.65;
        if (age < 0) continue;
        const u = age / 1.65;
        ctx.save();
        ctx.strokeStyle = `rgba(255,255,255,${0.75 * (1 - u)})`;
        ctx.lineWidth = Math.max(1.5, w * 0.003);
        ctx.beginPath();
        ctx.ellipse(x, y, r * 0.95 * u, r * 0.95 * u * 0.72, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    applyFade(ctx, w, h, p);
  },
);
