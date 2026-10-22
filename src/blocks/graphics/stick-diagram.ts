// "Stick and shadow": the measuring stick, its ground line, the right-angle
// marker, a shadow triangle whose sun sweeps from morning to noon, a real
// protractor with ticks, a zoom onto it and a counting angle read-out.
import { clamp, ease, lerp } from '../helpers';
import { defineBlock } from '../render';
import type { DrawContext } from '../types';
import {
  N,
  S,
  applyFade,
  arrowHead,
  col,
  curve,
  fadeParams,
  label,
  num,
  pop,
  prog,
  strokePartial,
  type Pt,
} from './ink';

const rad = Math.PI / 180;

function protractor(
  ctx: DrawContext,
  cx: number,
  cy: number,
  R: number,
  a: number,
): void {
  // Centre (cx, cy) = stick top. 0 deg points down along the stick, angles
  // grow through the left side to 180 deg straight up.
  if (a <= 0) return;
  const at = (deg: number, r: number): Pt => [
    cx - Math.sin(deg * rad) * r,
    cy + Math.cos(deg * rad) * r,
  ];
  ctx.save();
  ctx.globalAlpha *= a;
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(cx, cy + R);
    for (let d = 0; d <= 180; d += 3) {
      const q = at(d, R);
      ctx.lineTo(q[0], q[1]);
    }
    ctx.lineTo(cx, cy - R);
    ctx.closePath();
  };
  const g = ctx.createLinearGradient(cx - R, cy, cx, cy);
  g.addColorStop(0, 'rgba(225,235,245,0.78)');
  g.addColorStop(1, 'rgba(240,246,252,0.55)');
  ctx.fillStyle = g;
  body();
  ctx.fill();
  ctx.strokeStyle = 'rgba(95,110,125,0.95)';
  ctx.lineWidth = Math.max(1, R * 0.012);
  body();
  ctx.stroke();
  // Inner arc and scale.
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.72, Math.PI / 2, Math.PI * 1.5, false);
  ctx.stroke();
  for (let d = 0; d <= 180; d++) {
    const long = d % 10 === 0 ? 0.14 : d % 5 === 0 ? 0.095 : 0.055;
    const o = at(d, R * 0.985),
      i = at(d, R * (0.985 - long));
    ctx.beginPath();
    ctx.moveTo(o[0], o[1]);
    ctx.lineTo(i[0], i[1]);
    ctx.stroke();
    if (d % 20 === 0 && d > 0 && d < 180) {
      const q = at(d, R * 0.8);
      label(ctx, String(d), q[0], q[1], R * 0.075, {
        color: '#4a5560',
        weight: 500,
      });
    }
  }
  ctx.restore();
}

export const stickDiagram = defineBlock(
  {
    id: 'stick-diagram',
    version: '1.0.0',
    name: 'Stick, shadow and protractor',
    category: 'Education',
    defaultDuration: 14,
    thumbnailTime: 8,
    params: [
      num('stickX', 'Stick x %', 5, 95, 0.5, 58),
      num('groundY', 'Ground y %', 5, 95, 0.5, 42),
      num('stickH', 'Stick height % of height', 5, 80, 0.5, 22),
      num('angle', 'Final sun angle (deg)', 2, 60, 0.1, 26),
      num('sweepFrom', 'Sun starts at (deg)', 2, 80, 0.5, 52),
      num('stickAt', 'Stick at (s)', 0, 600, 0.1, 0),
      num('groundAt', 'Ground line at (s, -1 off)', -1, 600, 0.1, 0.8),
      num('rightAt', 'Right angle at (s, -1 off)', -1, 600, 0.1, 1.8),
      num('shadowAt', 'Shadow at (s, -1 off)', -1, 600, 0.1, 2.6),
      num('sweepDur', 'Sun sweep takes (s)', 0.1, 60, 0.1, 2.2),
      num('arcAt', 'Angle arc at (s, -1 off)', -1, 600, 0.1, 5.2),
      num('protAt', 'Protractor at (s, -1 off)', -1, 600, 0.1, 6),
      num('zoomAt', 'Zoom at (s, -1 off)', -1, 600, 0.1, 7.5),
      num('zoomDur', 'Zoom takes (s)', 0.1, 60, 0.1, 1.2),
      num('zoomOutAt', 'Zoom back out at (s, -1 off)', -1, 600, 0.1, -1),
      num('zoomScale', 'Zoom factor', 1, 8, 0.1, 2.4),
      num('zoomY', 'Zoom target y %', 5, 95, 0.5, 40),
      num('arrowAt', 'Red arrow at (s, -1 off)', -1, 600, 0.1, 8.5),
      num('countFrom', 'Number from', 0, 360, 0.1, 15.4),
      num('countTo', 'Number to', 0, 360, 0.1, 7.2),
      num('countAt', 'Number counts at (s, -1 off)', -1, 600, 0.1, 8.7),
      num('countDur', 'Count takes (s)', 0.1, 60, 0.1, 1.6),
      num('minAt', 'Min. angle note at (s, -1 off)', -1, 600, 0.1, -1),
      col('ink', 'Red', '#b8372f'),
      col('wood', 'Stick', '#a8773f'),
      ...fadeParams,
    ],
  },
  (ctx, t, size, p) => {
    const { width: w, height: h } = size,
      sx = (N(p, 'stickX') / 100) * w,
      gy = (N(p, 'groundY') / 100) * h,
      sh = (N(p, 'stickH') / 100) * h,
      sw = w * 0.028,
      top = gy - sh,
      lw = Math.max(2, w * 0.0045);

    // Camera: scales about the stick top toward the chosen screen spot.
    const zAt = N(p, 'zoomAt'),
      zo = N(p, 'zoomOutAt'),
      z =
        zAt < 0
          ? 0
          : prog(t, zAt, N(p, 'zoomDur'), 'ease-in-out') *
            (zo < 0 ? 1 : 1 - prog(t, zo, N(p, 'zoomDur'), 'ease-in-out')),
      s = lerp(1, N(p, 'zoomScale'), z),
      tgt = { x: w * 0.42, y: (N(p, 'zoomY') / 100) * h };
    ctx.save();
    ctx.translate(lerp(0, tgt.x - s * sx, z), lerp(0, tgt.y - s * top, z));
    ctx.scale(s, s);
    ctx.lineJoin = 'round';

    // Ground line.
    const gAt = N(p, 'groundAt');
    if (gAt >= 0) {
      ctx.strokeStyle = '#161616';
      ctx.lineWidth = lw * 0.7;
      ctx.lineCap = 'butt';
      strokePartial(
        ctx,
        [
          [w * 0.04 - (s - 1) * w, gy],
          [w * 0.96 + (s - 1) * w, gy],
        ],
        prog(t, gAt, 0.9, 'ease-out'),
      );
    }

    // Shadow triangle: the sun sweeps from morning (long shadow) to the final
    // angle, so the shadow visibly shortens.
    const shAt = N(p, 'shadowAt');
    const angleNow =
      shAt < 0
        ? N(p, 'angle')
        : lerp(
            N(p, 'sweepFrom'),
            N(p, 'angle'),
            ease('ease-in-out', clamp((t - shAt - 0.4) / N(p, 'sweepDur'))),
          );
    if (shAt >= 0) {
      const a = prog(t, shAt, 0.4, 'linear');
      const len = Math.tan(angleNow * rad) * sh;
      if (a > 0) {
        ctx.save();
        ctx.globalAlpha *= a;
        ctx.beginPath();
        ctx.moveTo(sx, top);
        ctx.lineTo(sx - len, gy);
        ctx.lineTo(sx, gy);
        ctx.closePath();
        ctx.fillStyle = 'rgba(214,170,140,0.9)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,80,60,0.9)';
        ctx.lineWidth = lw * 0.55;
        ctx.stroke();
        ctx.restore();
      }
    }

    // The stick: rises from the ground with a springy pop.
    const k =
      N(p, 'stickAt') <= t ? Math.min(1.06, pop(t, N(p, 'stickAt')) * 1) : 0;
    if (k > 0) {
      const hh = sh * Math.min(k, 1.04);
      ctx.fillStyle = S(p, 'wood');
      ctx.strokeStyle = '#3d2610';
      ctx.lineWidth = lw * 0.8;
      ctx.beginPath();
      ctx.roundRect(sx - sw / 2, gy - hh, sw, hh, sw * 0.12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(
        sx - sw / 2 + sw * 0.12,
        gy - hh + sw * 0.15,
        sw * 0.18,
        hh - sw * 0.3,
      );
    }

    // Right-angle marker at the foot, on the shadow side.
    const rAt = N(p, 'rightAt');
    if (rAt >= 0 && t >= rAt) {
      const m = Math.min(1.1, pop(t, rAt)),
        q = sw * 0.9 * m;
      ctx.strokeStyle = S(p, 'ink');
      ctx.lineWidth = lw * 0.9;
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      ctx.moveTo(sx - sw / 2 - q, gy);
      ctx.lineTo(sx - sw / 2 - q, gy - q);
      ctx.lineTo(sx - sw / 2, gy - q);
      ctx.stroke();
    }

    // Angle arc at the top between the stick and the shadow's slope.
    const cAt = N(p, 'arcAt');
    if (cAt >= 0) {
      ctx.strokeStyle = '#161616';
      ctx.lineWidth = lw * 0.8;
      ctx.lineCap = 'round';
      const rr = sh * 0.46,
        a0 = Math.PI / 2,
        a1 = Math.PI / 2 + angleNow * rad;
      ctx.beginPath();
      ctx.arc(sx, top, rr, a0, a0 + (a1 - a0) * prog(t, cAt, 0.5), false);
      ctx.stroke();
    }

    // Protractor with centre at the stick top.
    const pAt = N(p, 'protAt');
    if (pAt >= 0)
      protractor(ctx, sx, top, sh * 0.62, prog(t, pAt, 0.6, 'ease-out'));

    // Red arrow + counting number.
    const arAt = N(p, 'arrowAt');
    if (arAt >= 0) {
      const R = sh * 0.62,
        hit: Pt = [
          sx - Math.sin(angleNow * rad) * R * 0.72,
          top + Math.cos(angleNow * rad) * R * 0.72,
        ],
        start: Pt = [sx + sw * 2.8, top + R * 0.6];
      const path = curve(start, [sx + sw * 1.8, top + R * 0.92], hit, 24);
      ctx.strokeStyle = S(p, 'ink');
      ctx.fillStyle = S(p, 'ink');
      ctx.lineWidth = lw * 1.1;
      ctx.lineCap = 'round';
      const pr = prog(t, arAt, 0.55, 'ease-out');
      strokePartial(ctx, path, pr);
      if (pr > 0.9) {
        const a = Math.atan2(
          hit[1] - path[path.length - 2]![1],
          hit[0] - path[path.length - 2]![0],
        );
        arrowHead(ctx, hit[0], hit[1], a, lw * 4);
      }
    }
    const cnt = N(p, 'countAt');
    if (cnt >= 0 && t >= cnt) {
      const v = lerp(
          N(p, 'countFrom'),
          N(p, 'countTo'),
          prog(t, cnt, N(p, 'countDur'), 'ease-out'),
        ),
        k2 = Math.min(1.1, pop(t, cnt));
      label(ctx, v.toFixed(1) + '°', sx + sw * 3.2, top + sh * 0.44, sh * 0.2, {
        color: S(p, 'ink'),
        weight: 600,
        align: 'left',
        scale: k2,
      });
    }
    ctx.restore();

    const mAt = N(p, 'minAt');
    if (mAt >= 0 && t >= mAt) {
      const a = prog(t, mAt, 0.4, 'linear');
      label(ctx, 'Min. Angle', sx + sw * 3.2, top - sh * 0.04, w * 0.036, {
        color: '#111',
        weight: 600,
        align: 'left',
        alpha: a,
      });
      label(
        ctx,
        N(p, 'countTo').toFixed(1) + '°',
        sx + sw * 3.2,
        top + sh * 0.12,
        w * 0.048,
        {
          color: S(p, 'ink'),
          weight: 600,
          align: 'left',
          alpha: a,
        },
      );
    }
    applyFade(ctx, w, h, p);
  },
);
