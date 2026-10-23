// "Teaching globe": a flat-vector Earth drawn from real coastlines that spins,
// pops in, gets a pin, city dots, axes, rings, sun rays, meridians and zooms to
// the limb. Every extra switches on at its own time (-1 keeps it off).
import { clamp, lerp } from '../helpers';
import { defineBlock } from '../render';
import type { DrawContext, Params } from '../types';
import { globeLandPath, globePoint, type View } from './geo';
import {
  N,
  S,
  applyFade,
  arrowHead,
  cityDot,
  col,
  dots,
  fadeParams,
  label,
  num,
  pick,
  pin,
  pop,
  prog,
  strokePartial,
  txt,
  type Pt,
} from './ink';

export interface Palette {
  sea: string;
  land: string;
  seaNight: string;
  landNight: string;
  edge: string;
}
export const PALETTES: Record<string, Palette> = {
  'olive-teal': {
    sea: '#3d9c97',
    land: '#c8c072',
    seaNight: '#17675f',
    landNight: '#8d8b3e',
    edge: '#1f3a39',
  },
  'tan-blue': {
    sea: '#4b8ba2',
    land: '#e8c99c',
    seaNight: '#2b6075',
    landNight: '#b99668',
    edge: '#25444f',
  },
  ice: {
    sea: 'rgba(255,255,255,0)',
    land: '#cfe4ee',
    seaNight: 'rgba(255,255,255,0)',
    landNight: '#cfe4ee',
    edge: '#202020',
  },
};

export const ALEXANDRIA = { lon: 29.92, lat: 31.2 };
export const SYENE = { lon: 32.9, lat: 24.09 };

export interface GlobeOpts {
  cx: number;
  cy: number;
  r: number;
  view: View;
  palette: Palette;
  shade: boolean;
  edgeWidth?: number;
}

/** The sphere itself: sea disc, land, optional night side, rim. */
export function drawGlobe(ctx: DrawContext, o: GlobeOpts): void {
  const { cx, cy, r, view, palette } = o;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = palette.sea;
  ctx.fill();
  ctx.clip();
  ctx.beginPath();
  globeLandPath(ctx, view, cx, cy, r);
  ctx.fillStyle = palette.land;
  ctx.fill('nonzero');
  if (o.shade) {
    // Night crescent on the right: sea and land both go darker.
    const night = () => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false);
      ctx.ellipse(cx, cy, r * 0.6, r, 0, Math.PI / 2, -Math.PI / 2, true);
      ctx.closePath();
    };
    ctx.save();
    night();
    ctx.clip();
    ctx.fillStyle = palette.seaNight;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.beginPath();
    globeLandPath(ctx, view, cx, cy, r);
    ctx.fillStyle = palette.landNight;
    ctx.fill('nonzero');
    ctx.restore();
  }
  ctx.restore();
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = o.edgeWidth ?? Math.max(1.5, r * 0.018);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

/** Parallel sun rays (orange) sliding in; angle 0 = from the right. */
export function drawRays(
  ctx: DrawContext,
  w: number,
  h: number,
  angleDeg: number,
  p: number,
  width: number,
  gap: number,
): void {
  if (p <= 0) return;
  const a = (angleDeg * Math.PI) / 180,
    dx = -Math.cos(a),
    dy = Math.sin(a), // direction the light travels
    nx = -dy,
    ny = dx,
    reach = Math.hypot(w, h);
  ctx.save();
  ctx.strokeStyle = '#f4a43d';
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  const count = Math.ceil(reach / gap);
  for (let i = -count; i <= count; i++) {
    // Start far up-wind of the canvas centre and travel p of the way in.
    const ox = w / 2 + nx * i * gap,
      oy = h / 2 + ny * i * gap,
      x0 = ox - dx * reach,
      y0 = oy - dy * reach,
      x1 = ox + dx * reach,
      y1 = oy + dy * reach;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(lerp(x0, x1, p), lerp(y0, y1, p));
    ctx.stroke();
  }
  ctx.restore();
}

const num2 = (
  name: string,
  label_: string,
  min: number,
  max: number,
  value: number,
  step = 1,
) => num(name, label_, min, max, step, value);

export const earthGlobe = defineBlock(
  {
    id: 'earth-globe',
    version: '1.0.0',
    name: 'Teaching globe',
    category: 'Education',
    defaultDuration: 8,
    thumbnailTime: 3,
    params: [
      num2('cx', 'Centre x %', -50, 150, 50),
      num2('cy', 'Centre y %', -50, 150, 30),
      num2('radius', 'Radius % of width', 2, 150, 20),
      num2('lon0', 'Start longitude', -720, 720, 80),
      num2('lat0', 'Start latitude', -85, 85, 10),
      num2('lon1', 'End longitude', -720, 720, 80),
      num2('lat1', 'End latitude', -85, 85, 10),
      num2('spinAt', 'Spin starts (s)', 0, 600, 0, 0.1),
      num2('spinDur', 'Spin takes (s)', 0.1, 600, 3, 0.1),
      pick('palette', 'Colours', Object.keys(PALETTES), 'olive-teal'),
      { name: 'shade', label: 'Night side', type: 'bool', default: true },
      num2('appearAt', 'Pops in at (s)', 0, 600, 0, 0.1),
      num2('pinAt', 'Pin drops at (s, -1 off)', -1, 600, -1, 0.1),
      num2('dotsAt', 'City dots at (s, -1 off)', -1, 600, -1, 0.1),
      num2('axesAt', 'Axes draw at (s, -1 off)', -1, 600, -1, 0.1),
      num2('ringAt', 'Red ring at (s, -1 off)', -1, 600, -1, 0.1),
      num2('dotRingAt', 'Dotted ring at (s, -1 off)', -1, 600, -1, 0.1),
      num2('meridianAt', 'Meridians at (s, -1 off)', -1, 600, -1, 0.1),
      num2('gapAt', 'Longitude gap bar at (s, -1 off)', -1, 600, -1, 0.1),
      num2('raysAt', 'Sun rays at (s, -1 off)', -1, 600, -1, 0.1),
      num2('rayAngle', 'Ray angle (0 = from right)', -90, 90, 45),
      num2('zoomAt', 'Zoom to limb at (s, -1 off)', -1, 600, -1, 0.1),
      num2('zoomDur', 'Zoom takes (s)', 0.1, 60, 1.5, 0.1),
      num2('zoomScale', 'Zoom factor', 1, 40, 5, 0.1),
      num2('zoomX', 'Zoom target x %', 0, 100, 50),
      num2('zoomY', 'Zoom target y %', 0, 100, 40),
      txt('centerText', 'Text on the globe', ''),
      num2('textAt', 'Text at (s)', 0, 600, 0, 0.1),
      col('ink', 'Label colour', '#c4503a'),
      ...fadeParams,
    ],
  },
  (ctx, t, size, p) => {
    const { width: w, height: h } = size,
      palette = PALETTES[S(p, 'palette')]!,
      r0 = (N(p, 'radius') / 100) * w,
      c0 = { x: (N(p, 'cx') / 100) * w, y: (N(p, 'cy') / 100) * h };
    const spin = prog(t, N(p, 'spinAt'), N(p, 'spinDur')),
      view: View = {
        lon: lerp(N(p, 'lon0'), N(p, 'lon1'), spin),
        lat: lerp(N(p, 'lat0'), N(p, 'lat1'), spin),
      };
    const end: View = { lon: N(p, 'lon1'), lat: N(p, 'lat1') };
    // Zoom: the middle of the two cities glides to the chosen screen spot
    // while the globe grows, so the curve of the Earth sweeps through frame.
    const mid = {
      lon: (ALEXANDRIA.lon + SYENE.lon) / 2,
      lat: (ALEXANDRIA.lat + SYENE.lat) / 2,
    };
    const zAt = N(p, 'zoomAt'),
      z = zAt < 0 ? 0 : prog(t, zAt, N(p, 'zoomDur'), 'ease-in-out'),
      scale = lerp(1, N(p, 'zoomScale'), z);
    const m0 = globePoint(mid.lon, mid.lat, end, c0.x, c0.y, r0),
      target = { x: (N(p, 'zoomX') / 100) * w, y: (N(p, 'zoomY') / 100) * h },
      tNow = { x: lerp(m0.x, target.x, z), y: lerp(m0.y, target.y, z) },
      c = {
        x: tNow.x - (m0.x - c0.x) * scale,
        y: tNow.y - (m0.y - c0.y) * scale,
      },
      r = r0 * scale;

    // Sun rays sit behind the globe.
    if (N(p, 'raysAt') >= 0)
      drawRays(
        ctx,
        w,
        h,
        N(p, 'rayAngle'),
        prog(t, N(p, 'raysAt'), 1.2, 'ease-out'),
        Math.max(2, w * 0.004),
        w * 0.075,
      );

    const grow = pop(t, N(p, 'appearAt'));
    if (grow > 0) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(grow, grow);
      ctx.translate(-c.x, -c.y);
      drawGlobe(ctx, {
        cx: c.x,
        cy: c.y,
        r,
        view,
        palette,
        shade: p.shade === true && z < 0.2,
      });

      // Cities, pin, labels (follow the globe as it turns and zooms).
      const at = (g: { lon: number; lat: number }) =>
        globePoint(g.lon, g.lat, view, c.x, c.y, r);
      const dotSize = Math.max(3, r0 * 0.035 * Math.sqrt(scale));
      if (N(p, 'meridianAt') >= 0) {
        const mp = prog(t, N(p, 'meridianAt'), 1.4, 'ease-out');
        ctx.strokeStyle = '#3a1f1a';
        ctx.lineWidth = Math.max(1.5, dotSize * 0.5);
        for (const g of [ALEXANDRIA, SYENE]) {
          const north: Pt[] = [],
            south: Pt[] = [];
          for (let la = g.lat; la <= 84; la += 3) {
            const q = globePoint(g.lon, la, view, c.x, c.y, r);
            if (q.z > 0) north.push([q.x, q.y]);
          }
          for (let la = g.lat; la >= -84; la -= 3) {
            const q = globePoint(g.lon, la, view, c.x, c.y, r);
            if (q.z > 0) south.push([q.x, q.y]);
          }
          ctx.save();
          dots(ctx, ctx.lineWidth, 2.2);
          strokePartial(ctx, north, mp);
          strokePartial(ctx, south, mp);
          ctx.restore();
        }
      }
      if (N(p, 'gapAt') >= 0) {
        // A red bar between the two meridians with its size in degrees, so the
        // small gap (and how they meet at the pole) is read at a glance.
        const gk = prog(t, N(p, 'gapAt'), 0.8, 'ease-out'),
          la = 42,
          g1 = globePoint(ALEXANDRIA.lon, la, view, c.x, c.y, r),
          g2 = globePoint(SYENE.lon, la, view, c.x, c.y, r);
        if (g1.z > 0 && g2.z > 0 && gk > 0) {
          const mx = (g1.x + g2.x) / 2,
            my = (g1.y + g2.y) / 2;
          ctx.save();
          ctx.globalAlpha *= gk;
          ctx.strokeStyle = '#c0392b';
          ctx.lineWidth = Math.max(2.5, dotSize * 0.7);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(g1.x, g1.y);
          ctx.lineTo(g2.x, g2.y);
          ctx.stroke();
          ctx.restore();
          label(ctx, '≈ 3°', mx, my - dotSize * 3.2, dotSize * 3.4, {
            color: '#c0392b',
            strip: 'rgba(255,255,255,0.9)',
            alpha: gk,
          });
        }
      }
      if (N(p, 'dotsAt') >= 0) {
        const a = prog(t, N(p, 'dotsAt'), 0.4, 'ease-out'),
          s2 = prog(t, N(p, 'dotsAt') + 0.5, 0.4, 'ease-out');
        const A = at(ALEXANDRIA),
          Sy = at(SYENE);
        if (A.z > 0) {
          cityDot(ctx, A.x, A.y, dotSize, a);
          label(
            ctx,
            'Alexandria',
            A.x - dotSize * 2.2,
            A.y - dotSize * 1.9,
            dotSize * 2.7,
            {
              color: S(p, 'ink'),
              weight: 600,
              align: 'right',
              alpha: a,
            },
          );
        }
        if (Sy.z > 0) {
          cityDot(ctx, Sy.x, Sy.y, dotSize, s2);
          label(
            ctx,
            'Syene',
            Sy.x + dotSize * 1.6,
            Sy.y + dotSize * 2.4,
            dotSize * 2.7,
            {
              color: S(p, 'ink'),
              weight: 600,
              align: 'left',
              alpha: s2,
            },
          );
        }
      }
      if (N(p, 'pinAt') >= 0) {
        const A = at(ALEXANDRIA),
          age = t - N(p, 'pinAt');
        if (age >= 0 && A.z > 0) {
          const drop = Math.max(0, 1 - Math.min(1, age / 0.45)) ** 2 * r * 0.5;
          ctx.save();
          ctx.globalAlpha *= clamp(age / 0.15);
          pin(ctx, A.x, A.y - drop, r * 0.17, '#f2845a');
          ctx.restore();
        }
      }

      // Axes: pole-to-pole then equator, each drawn with arrow heads.
      if (N(p, 'axesAt') >= 0) {
        const lw = Math.max(2, r * 0.028);
        ctx.strokeStyle = '#111';
        ctx.fillStyle = '#111';
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        const v = prog(t, N(p, 'axesAt'), 0.7),
          hz = prog(t, N(p, 'axesAt') + 0.9, 0.7);
        const spans: { from: Pt; to: Pt; pr: number; ang: number }[] = [
          {
            from: [c.x, c.y - r * 0.96],
            to: [c.x, c.y + r * 0.96],
            pr: v,
            ang: Math.PI / 2,
          },
          {
            from: [c.x - r * 0.96, c.y],
            to: [c.x + r * 0.96, c.y],
            pr: hz,
            ang: 0,
          },
        ];
        for (const { from, to, pr, ang } of spans) {
          if (pr <= 0) continue;
          const mx = (from[0] + to[0]) / 2,
            my = (from[1] + to[1]) / 2,
            half = (pr * Math.hypot(to[0] - from[0], to[1] - from[1])) / 2,
            ux = Math.cos(ang),
            uy = Math.sin(ang);
          ctx.beginPath();
          ctx.moveTo(mx - ux * half, my - uy * half);
          ctx.lineTo(mx + ux * half, my + uy * half);
          ctx.stroke();
          arrowHead(ctx, mx + ux * half, my + uy * half, ang, lw * 3.2);
          arrowHead(
            ctx,
            mx - ux * half,
            my - uy * half,
            ang + Math.PI,
            lw * 3.2,
          );
        }
      }
      ctx.restore();

      // Rings go round the outside of the globe.
      const ring = (
        at_: number,
        colour: string,
        dotted: boolean,
        gapR: number,
      ) => {
        if (at_ < 0) return;
        const pr = prog(t, at_, 1, 'ease-in-out');
        if (pr <= 0) return;
        ctx.save();
        ctx.strokeStyle = colour;
        ctx.lineWidth = Math.max(2, r * (dotted ? 0.022 : 0.04));
        if (dotted) dots(ctx, ctx.lineWidth, 2);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(
          c.x,
          c.y,
          r * gapR,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * pr,
        );
        ctx.stroke();
        ctx.restore();
      };
      ring(N(p, 'ringAt'), '#b3322f', false, 1.045);
      ring(N(p, 'dotRingAt'), '#1c1c1c', true, 1.095);

      const text = S(p, 'centerText');
      if (text) {
        const k = pop(t, N(p, 'textAt'));
        label(ctx, text, c.x, c.y, r * 0.17, {
          color: '#111',
          weight: 700,
          scale: k,
        });
      }
    }
    applyFade(ctx, w, h, p);
  },
);

export type GlobeParams = Params;
