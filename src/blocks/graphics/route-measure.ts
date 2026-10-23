// "Distance versus displacement" on a map: a camel walks the winding road
// between two cities while an odometer counts the DISTANCE walked (possible);
// then the straight line between the cities, the DISPLACEMENT, is drawn - first
// marked as impossible to walk, then measured as the estimate. It draws over a
// `story-map` block that uses the same view numbers.
import { lerp } from '../helpers';
import { defineBlock } from '../render';
import type { DrawContext } from '../types';
import { ALEXANDRIA, SYENE } from './earth-globe';
import { flatPoint, type FlatView } from './geo';
import {
  N,
  S,
  applyFade,
  arrowHead,
  along,
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

/** A winding road down the Nile valley, as lon/lat. */
const ROAD: readonly (readonly [number, number])[] = [
  [ALEXANDRIA.lon, ALEXANDRIA.lat],
  [30.4, 30.75],
  [30.9, 30.35],
  [31.25, 30.0],
  [31.05, 29.4],
  [31.2, 28.7],
  [30.85, 28.0],
  [31.2, 27.2],
  [31.8, 26.4],
  [32.45, 25.7],
  [32.7, 24.9],
  [SYENE.lon, SYENE.lat],
];

function camel(
  ctx: DrawContext,
  x: number,
  y: number,
  s: number,
  phase: number,
  dir: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * dir, s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#4a2c12';
  ctx.fillStyle = '#b07a3c';
  ctx.lineWidth = 0.09;
  // Legs (swing opposite in pairs).
  const sw = Math.sin(phase) * 0.18;
  for (const [lx, k] of [
    [-0.55, 1],
    [-0.3, -1],
    [0.3, -1],
    [0.55, 1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(lx, 0.1);
    ctx.lineTo(lx + sw * k, 0.62);
    ctx.stroke();
  }
  // Body, hump, neck and head.
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.78, 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-0.1, -0.36, 0.26, 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0.55, -0.08);
  ctx.quadraticCurveTo(0.95, -0.5, 1.02, -0.78);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(1.1, -0.82, 0.2, 0.12, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export const routeMeasure = defineBlock(
  {
    id: 'route-measure',
    version: '1.0.0',
    name: 'Distance vs displacement',
    category: 'Education',
    defaultDuration: 12,
    thumbnailTime: 9,
    params: [
      num('lon', 'View longitude', -180, 180, 0.1, 31),
      num('lat', 'View latitude', -80, 80, 0.1, 28.5),
      num('span', 'View width (degrees)', 2, 360, 0.5, 17),
      num('cy', 'View centre y % of height', -50, 150, 0.5, 50),
      num('dotsAt', 'City dots at (s, -1 off)', -1, 600, 0.1, 0),
      num('walkAt', 'Camel walks at (s, -1 off)', -1, 600, 0.1, 0.8),
      num('walkDur', 'Walk takes (s)', 0.5, 60, 0.1, 3.6),
      num('lineAt', 'Straight line at (s, -1 off)', -1, 600, 0.1, 5.8),
      num('crossAt', 'Cross at (s, -1 off)', -1, 600, 0.1, 7.2),
      num('flipAt', 'Cross turns into tick at (s, -1 off)', -1, 600, 0.1, 9.2),
      num('roadKm', 'Road distance (km)', 100, 5000, 10, 1050),
      txt('distText', 'Distance word', 'Distance', 16),
      txt('dispText', 'Displacement word', 'Displacement', 20),
      txt('kmText', 'Estimate text', '≈ 800 km', 14),
      txt('from', 'City A', 'Alexandria', 20),
      txt('to', 'City B', 'Syene', 20),
      col('road', 'Road colour', '#5a2b1a'),
      col('line', 'Line colour', '#c0262d'),
      ...fadeParams,
    ],
  },
  (ctx, t, size, p) => {
    const { width: w, height: h } = size,
      view: FlatView = {
        lon: N(p, 'lon'),
        lat: N(p, 'lat'),
        span: N(p, 'span'),
      },
      shift = (N(p, 'cy') / 100) * h - h / 2,
      xy = (lon: number, lat: number): Pt => {
        const q = flatPoint(lon, lat, view, w, h);
        return [q.x, q.y + shift];
      },
      road: Pt[] = ROAD.map(([lo, la]) => xy(lo, la)),
      A = road[0]!,
      B = road[road.length - 1]!,
      lw = Math.max(3, w * 0.006),
      sz = w * 0.044,
      on = (k: string) => N(p, k) >= 0 && t >= N(p, k);

    // City dots and names.
    if (on('dotsAt')) {
      const k = prog(t, N(p, 'dotsAt'), 0.4, 'ease-out');
      for (const [pt, name, dy] of [
        [A, S(p, 'from'), -w * 0.032],
        [B, S(p, 'to'), w * 0.04],
      ] as const) {
        ctx.save();
        ctx.globalAlpha *= k;
        ctx.fillStyle = '#d2412f';
        ctx.strokeStyle = '#4a1511';
        ctx.lineWidth = lw * 0.9;
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], w * 0.0125, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        label(ctx, name, pt[0] - w * 0.03, pt[1] + dy, sz, {
          color: '#b4473a',
          weight: 600,
          align: 'right',
          alpha: k,
        });
      }
    }

    // The camel walks the winding road; the odometer counts the distance.
    if (on('walkAt')) {
      const u = prog(t, N(p, 'walkAt'), N(p, 'walkDur'), 'ease-in-out');
      ctx.save();
      ctx.strokeStyle = S(p, 'road');
      ctx.lineWidth = lw;
      dots(ctx, lw, 1.9);
      strokePartial(ctx, road, u);
      ctx.restore();
      const me = along(road, u);
      const walking = u < 1;
      camel(
        ctx,
        me.x,
        me.y - w * 0.025,
        w * 0.085,
        t * 9,
        Math.cos(me.a) >= 0 ? 1 : -1,
      );
      // Odometer pill.
      const km = Math.round(N(p, 'roadKm') * u),
        done = u >= 1;
      label(
        ctx,
        `${S(p, 'distText')}  ${km.toLocaleString('en-US')} km`,
        w * 0.5,
        h * 0.13,
        sz * 1.05,
        {
          color: '#1b1b1b',
          weight: 700,
          strip: 'rgba(255,255,255,0.9)',
          scale: Math.min(1, 0.6 + pop(t, N(p, 'walkAt')) * 0.4),
        },
      );
      if (done || !walking) {
        // Green tick next to the odometer once the road is done.
        const k = prog(t, N(p, 'walkAt') + N(p, 'walkDur'), 0.5, 'ease-out');
        ctx.save();
        ctx.strokeStyle = '#2f9e44';
        ctx.lineWidth = lw * 1.6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const x0 = w * 0.5 + sz * 8.2,
          y0 = h * 0.13;
        strokePartial(
          ctx,
          [
            [x0 - sz * 0.5, y0],
            [x0 - sz * 0.15, y0 + sz * 0.4],
            [x0 + sz * 0.55, y0 - sz * 0.5],
          ],
          k,
        );
        ctx.restore();
      }
    }

    // The straight line: displacement.
    if (on('lineAt')) {
      const k = prog(t, N(p, 'lineAt'), 1.0, 'ease-out');
      ctx.save();
      ctx.strokeStyle = S(p, 'line');
      ctx.fillStyle = S(p, 'line');
      ctx.lineWidth = lw * 1.4;
      ctx.setLineDash([lw * 3, lw * 2]);
      strokePartial(ctx, [A, B], k);
      ctx.setLineDash([]);
      if (k > 0.98) {
        const a = Math.atan2(B[1] - A[1], B[0] - A[0]);
        arrowHead(ctx, B[0], B[1], a, w * 0.03);
        arrowHead(ctx, A[0], A[1], a + Math.PI, w * 0.03);
      }
      ctx.restore();
      const mid: Pt = [lerp(A[0], B[0], 0.5), lerp(A[1], B[1], 0.5)];
      label(ctx, S(p, 'dispText'), mid[0] + w * 0.04, mid[1] - w * 0.02, sz, {
        color: S(p, 'line'),
        weight: 700,
        strip: 'rgba(255,255,255,0.9)',
        align: 'left',
        alpha: prog(t, N(p, 'lineAt') + 0.3, 0.4, 'ease-out'),
      });
      // Cross (impossible), then a tick and the estimate.
      const flipped = on('flipAt'),
        cx0 = mid[0] - w * 0.1,
        cy0 = mid[1] + w * 0.02,
        s = w * 0.035;
      if (on('crossAt') && !flipped) {
        const c1 = prog(t, N(p, 'crossAt'), 0.25, 'ease-out'),
          c2 = prog(t, N(p, 'crossAt') + 0.25, 0.25, 'ease-out');
        ctx.save();
        ctx.strokeStyle = '#d62828';
        ctx.lineWidth = lw * 2;
        ctx.lineCap = 'round';
        strokePartial(
          ctx,
          [
            [cx0 - s, cy0 - s],
            [cx0 + s, cy0 + s],
          ],
          c1,
        );
        strokePartial(
          ctx,
          [
            [cx0 + s, cy0 - s],
            [cx0 - s, cy0 + s],
          ],
          c2,
        );
        ctx.restore();
      }
      if (flipped) {
        const k2 = prog(t, N(p, 'flipAt'), 0.45, 'ease-out');
        ctx.save();
        ctx.strokeStyle = '#2f9e44';
        ctx.lineWidth = lw * 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        strokePartial(
          ctx,
          [
            [cx0 - s, cy0],
            [cx0 - s * 0.25, cy0 + s * 0.8],
            [cx0 + s, cy0 - s * 0.9],
          ],
          k2,
        );
        ctx.restore();
        label(
          ctx,
          S(p, 'kmText'),
          mid[0] + w * 0.04,
          mid[1] + w * 0.045,
          sz * 1.15,
          {
            color: '#1b1b1b',
            weight: 800,
            strip: 'rgba(255,255,255,0.92)',
            align: 'left',
            scale: pop(t, N(p, 'flipAt') + 0.25),
          },
        );
      }
    }
    applyFade(ctx, w, h, p);
  },
);
