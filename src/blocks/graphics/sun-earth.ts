// "Sun and Earth": a small Earth and a glowing sun with a dotted line drawn
// between them and the distance written underneath.
import { lerp } from '../helpers';
import { defineBlock } from '../render';
import { PALETTES, drawGlobe } from './earth-globe';
import {
  N,
  S,
  applyFade,
  dots,
  fadeParams,
  label,
  num,
  pop,
  prog,
  strokePartial,
  txt,
} from './ink';

export const sunEarth = defineBlock(
  {
    id: 'sun-earth',
    version: '1.0.0',
    name: 'Sun and Earth distance',
    category: 'Education',
    defaultDuration: 6,
    thumbnailTime: 4,
    params: [
      num('y', 'Row y %', 5, 95, 0.5, 30),
      num('earthX', 'Earth x %', 2, 98, 0.5, 14),
      num('sunX', 'Sun x %', 2, 98, 0.5, 86),
      num('earthSize', 'Earth size % of width', 2, 30, 0.5, 12),
      num('sunSize', 'Sun size % of width', 2, 30, 0.5, 11),
      num('earthAt', 'Earth at (s)', 0, 600, 0.1, 0),
      num('sunAt', 'Sun at (s)', 0, 600, 0.1, 0.4),
      num('lineAt', 'Dotted line at (s)', 0, 600, 0.1, 1),
      num('lineDur', 'Line takes (s)', 0.1, 30, 0.1, 1.4),
      txt('title', 'Title', 'Avg. Distance', 40),
      txt('value', 'Value', '~ 149,597,871 km', 40),
      num('textAt', 'Text at (s)', 0, 600, 0.1, 1.6),
      num('lon', 'Earth longitude', -180, 180, 1, 75),
      num('lat', 'Earth latitude', -80, 80, 1, 5),
      ...fadeParams,
    ],
  },
  (ctx, t, size, p) => {
    const { width: w, height: h } = size,
      y = (N(p, 'y') / 100) * h,
      ex = (N(p, 'earthX') / 100) * w,
      sx = (N(p, 'sunX') / 100) * w,
      er = (N(p, 'earthSize') / 200) * w,
      sr = (N(p, 'sunSize') / 200) * w;
    // Dotted line first so the bodies sit on top of its ends.
    const pr = prog(t, N(p, 'lineAt'), N(p, 'lineDur'), 'ease-in-out');
    if (pr > 0) {
      ctx.save();
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = Math.max(2, w * 0.004);
      dots(ctx, ctx.lineWidth, 1.8);
      strokePartial(
        ctx,
        [
          [ex + er, y],
          [sx - sr * 1.25, y],
        ],
        pr,
      );
      ctx.restore();
    }
    const ek = pop(t, N(p, 'earthAt'));
    if (ek > 0) {
      ctx.save();
      ctx.translate(ex, y);
      ctx.scale(ek, ek);
      drawGlobe(ctx, {
        cx: 0,
        cy: 0,
        r: er,
        view: { lon: N(p, 'lon'), lat: N(p, 'lat') },
        palette: PALETTES['tan-blue']!,
        shade: true,
      });
      ctx.restore();
    }
    const sk = pop(t, N(p, 'sunAt'));
    if (sk > 0) {
      ctx.save();
      ctx.translate(sx, y);
      ctx.scale(sk, sk);
      // Slowly turning rays and a soft glow: the sun is alive.
      const glow = ctx.createRadialGradient(0, 0, sr * 0.6, 0, 0, sr * 2.4);
      glow.addColorStop(0, 'rgba(255,190,60,0.5)');
      glow.addColorStop(1, 'rgba(255,190,60,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, sr * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate(t * 0.35);
      ctx.fillStyle = '#f59a1e';
      const spikes = 14;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const a = (i / (spikes * 2)) * Math.PI * 2,
          rr =
            i % 2
              ? sr * 1.02
              : sr * lerp(1.38, 1.5, (Math.sin(t * 3 + i) + 1) / 2);
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.rotate(-t * 0.35);
      ctx.fillStyle = '#ffc531';
      ctx.beginPath();
      ctx.arc(0, 0, sr * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const a = prog(t, N(p, 'textAt'), 0.5, 'linear');
    label(ctx, S(p, 'title'), w / 2, y + w * 0.1, w * 0.036, {
      color: '#333',
      weight: 500,
      alpha: a,
    });
    label(ctx, S(p, 'value'), w / 2, y + w * 0.1 + w * 0.052, w * 0.04, {
      color: '#222',
      weight: 600,
      alpha: a,
    });
    applyFade(ctx, w, h, p);
  },
);
