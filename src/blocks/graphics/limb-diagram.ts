// "Earth cross-section": a big circle with horizontal sun rays, two radii
// through the cities, the angle between them, the arc between the cities
// (the 800 km) and a zoom-out that closes the whole circle (360 degrees).
import { lerp } from '../helpers';
import { defineBlock } from '../render';
import { PALETTES, drawGlobe, drawRays } from './earth-globe';
import {
  N,
  S,
  applyFade,
  col,
  dots,
  fadeParams,
  label,
  num,
  pop,
  prog,
  strokePartial,
  txt,
  type Pt,
} from './ink';

const rad = Math.PI / 180;

export const limbDiagram = defineBlock(
  {
    id: 'earth-arc',
    version: '1.0.0',
    name: 'Earth cross-section (angle and arc)',
    category: 'Education',
    defaultDuration: 20,
    thumbnailTime: 8,
    params: [
      num('cx', 'Centre x %', -150, 250, 1, 30),
      num('cy', 'Centre y %', -50, 150, 1, 30),
      num('radius', 'Radius % of width', 10, 400, 1, 110),
      num('lon', 'Land longitude', -180, 180, 1, -35),
      num('lat', 'Land latitude', -80, 80, 1, 5),
      num('thetaA', 'Alexandria direction (deg, 0 = right)', -90, 90, 0.5, -3),
      num('dTheta', 'Angle between cities (deg)', 1, 40, 0.1, 9),
      num('raysAt', 'Sun rays at (s, -1 off)', -1, 600, 0.1, 0.5),
      num('linesAt', 'Radii at (s, -1 off)', -1, 600, 0.1, 2),
      num('angleAt', 'Angle label at (s, -1 off)', -1, 600, 0.1, 3.5),
      num('tickAt', 'Arc tick at (s, -1 off)', -1, 600, 0.1, 6),
      num('kmAt', 'Distance label at (s, -1 off)', -1, 600, 0.1, 8),
      num('outAt', 'Zoom out at (s, -1 off)', -1, 600, 0.1, 10),
      num('outDur', 'Zoom out takes (s)', 0.1, 60, 0.1, 1.6),
      num('outX', 'Final centre x %', 0, 100, 1, 50),
      num('outY', 'Final centre y %', 0, 100, 1, 32),
      num('outRadius', 'Final radius % of width', 5, 100, 1, 30),
      num('innerAt', 'Inner circle at (s, -1 off)', -1, 600, 0.1, 12),
      num('redAt', 'Red circle at (s, -1 off)', -1, 600, 0.1, 13.5),
      txt('angleText', 'Angle text', '7.2°', 12),
      txt('kmText', 'Distance text', '800 km', 16),
      txt('fullText', 'Full-turn text', '360°', 12),
      txt('note', 'Note', '', 40),
      num('noteAt', 'Note at (s)', 0, 600, 0.1, 5),
      col('red', 'Red', '#b3202a'),
      ...fadeParams,
    ],
  },
  (ctx, t, size, p) => {
    const { width: w, height: h } = size,
      oAt = N(p, 'outAt'),
      o = oAt < 0 ? 0 : prog(t, oAt, N(p, 'outDur'), 'ease-in-out'),
      c0 = { x: (N(p, 'cx') / 100) * w, y: (N(p, 'cy') / 100) * h },
      c1 = { x: (N(p, 'outX') / 100) * w, y: (N(p, 'outY') / 100) * h },
      R0 = (N(p, 'radius') / 100) * w,
      R1 = (N(p, 'outRadius') / 100) * w,
      // Log-domain radius so the zoom-out feels even.
      R = Math.exp(lerp(Math.log(R0), Math.log(R1), o)),
      c = { x: lerp(c0.x, c1.x, o), y: lerp(c0.y, c1.y, o) },
      k = R / R0,
      A = N(p, 'thetaA') * rad,
      B = A + N(p, 'dTheta') * rad,
      pt = (a: number, f: number): Pt => [
        c.x + Math.cos(a) * R * f,
        c.y + Math.sin(a) * R * f,
      ],
      lw = Math.max(1.5, w * 0.003);

    if (N(p, 'raysAt') >= 0) {
      const pr = prog(t, N(p, 'raysAt'), 1.2, 'ease-out') * (1 - o);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
      ctx.clip('evenodd');
      drawRays(ctx, w, h, 0, pr, Math.max(1.5, w * 0.0025), w * 0.05);
      ctx.restore();
    }
    drawGlobe(ctx, {
      cx: c.x,
      cy: c.y,
      r: R,
      view: { lon: N(p, 'lon'), lat: N(p, 'lat') },
      palette: PALETTES['ice']!,
      shade: false,
      edgeWidth: Math.max(1.5, w * 0.0028),
    });

    // Radii through Alexandria and Syene, dotted, reaching past the limb.
    const lAt = N(p, 'linesAt');
    if (lAt >= 0 && o < 1) {
      ctx.save();
      ctx.strokeStyle = '#222';
      ctx.lineWidth = lw;
      dots(ctx, lw, 2);
      const pr = prog(t, lAt, 1.2, 'ease-out');
      for (const a of [A, B]) strokePartial(ctx, [[c.x, c.y], pt(a, 1.25)], pr);
      ctx.restore();
    }
    // The angle at the centre.
    const gAt = N(p, 'angleAt');
    if (gAt >= 0 && o < 1) {
      ctx.save();
      ctx.globalAlpha *= 1 - o;
      ctx.strokeStyle = '#d98a1c';
      ctx.lineWidth = lw * 1.6;
      ctx.beginPath();
      ctx.arc(c.x, c.y, R * 0.28, A, A + (B - A) * prog(t, gAt, 0.6), false);
      ctx.stroke();
      const tp = pt((A + B) / 2 + 0.0, 0.5);
      label(
        ctx,
        S(p, 'angleText'),
        tp[0] - R * 0.08,
        tp[1] + R * 0.12,
        w * 0.052,
        {
          color: '#111',
          weight: 600,
          scale: pop(t, gAt + 0.4),
        },
      );
      ctx.restore();
    }
    // Arc between the cities: black tick, then the red stretch with its label.
    const tAt = N(p, 'tickAt');
    if (tAt >= 0) {
      ctx.save();
      ctx.lineCap = 'butt';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = lw * 2.6;
      for (const a of [A, B]) {
        const q = prog(t, tAt, 0.3, 'linear');
        if (q > 0) strokePartial(ctx, [pt(a, 0.985), pt(a, 1.03)], q);
      }
      ctx.restore();
    }
    const kAt = N(p, 'kmAt');
    if (kAt >= 0) {
      ctx.save();
      ctx.strokeStyle = S(p, 'red');
      ctx.lineWidth = lw * 2.4;
      ctx.beginPath();
      ctx.arc(c.x, c.y, R * 1.0, A, A + (B - A) * prog(t, kAt, 0.6), false);
      ctx.stroke();
      const q = pt(B, 1.0);
      label(
        ctx,
        S(p, 'kmText'),
        q[0] + w * 0.02,
        q[1] - R * 0.02,
        w * 0.036 * Math.max(0.6, k),
        {
          color: '#111',
          weight: 600,
          align: 'left',
          alpha: prog(t, kAt + 0.5, 0.3, 'linear') * (1 - o),
        },
      );
      ctx.restore();
    }
    // Zoomed out: the loop that closes the circle.
    const iAt = N(p, 'innerAt');
    if (iAt >= 0 && o > 0.5) {
      ctx.save();
      ctx.strokeStyle = '#111';
      ctx.lineWidth = lw * 1.7;
      ctx.lineCap = 'round';
      const rr = R * 0.4,
        pr = prog(t, iAt, 1.3, 'ease-in-out');
      ctx.beginPath();
      ctx.arc(
        c.x,
        c.y,
        rr,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * pr,
        false,
      );
      ctx.stroke();
      label(ctx, S(p, 'fullText'), c.x, c.y + rr * 0.3, w * 0.03, {
        color: '#111',
        weight: 600,
        alpha: prog(t, iAt + 0.8, 0.4, 'linear'),
      });
      ctx.restore();
    }
    const rdAt = N(p, 'redAt');
    if (rdAt >= 0 && o > 0.5) {
      ctx.save();
      ctx.strokeStyle = S(p, 'red');
      ctx.lineWidth = lw * 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(
        c.x,
        c.y,
        R * 1.045,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * prog(t, rdAt, 1.4, 'ease-in-out'),
        false,
      );
      ctx.stroke();
      ctx.restore();
    }
    const note = S(p, 'note');
    if (note)
      label(ctx, note, w / 2, h * 0.43, w * 0.044, {
        color: '#111',
        weight: 600,
        alpha: prog(t, N(p, 'noteAt'), 0.4, 'linear'),
      });
    applyFade(ctx, w, h, p);
  },
);
