// "Story map": a flat land-and-sea map that pans and zooms between two views,
// with city dots, labels and a dotted route that draws itself.
import { lerp } from '../helpers';
import { defineBlock } from '../render';
import { flatLandPath, flatPoint, type FlatView } from './geo';
import { ALEXANDRIA, SYENE } from './earth-globe';
import {
  N,
  S,
  applyFade,
  cityDot,
  col,
  dots,
  fadeParams,
  label,
  num,
  prog,
  strokePartial,
  txt,
  type Pt,
} from './ink';

const named: Record<string, { lon: number; lat: number }> = {
  Alexandria: ALEXANDRIA,
  Syene: SYENE,
};

export const flatMap = defineBlock(
  {
    id: 'story-map',
    version: '1.0.0',
    name: 'Story map',
    category: 'Education',
    defaultDuration: 8,
    thumbnailTime: 4,
    params: [
      num('lon0', 'Start longitude', -180, 180, 0.1, 20),
      num('lat0', 'Start latitude', -80, 80, 0.1, 20),
      num('span0', 'Start width (degrees)', 2, 360, 0.5, 90),
      num('lon1', 'End longitude', -180, 180, 0.1, 31),
      num('lat1', 'End latitude', -80, 80, 0.1, 28),
      num('span1', 'End width (degrees)', 2, 360, 0.5, 18),
      num('moveAt', 'Pan/zoom starts (s)', 0, 600, 0.1, 0),
      num('moveDur', 'Pan/zoom takes (s)', 0.1, 600, 0.1, 3),
      col('sea', 'Sea', '#3b7387'),
      col('land', 'Land', '#c8a981'),
      col('ink', 'Label colour', '#b4473a'),
      txt('from', 'City A', 'Alexandria', 30),
      txt('to', 'City B', 'Syene', 30),
      num('dotsAt', 'City dots at (s, -1 off)', -1, 600, 0.1, -1),
      num('routeAt', 'Dotted route at (s, -1 off)', -1, 600, 0.1, -1),
      num('routeDur', 'Route takes (s)', 0.2, 60, 0.1, 2),
      num('routeBend', 'Route wiggle', 0, 4, 0.1, 1),
      num('fadeInAt', 'Fades in at (s)', 0, 600, 0.1, 0),
      num('fadeInDur', 'Fade in takes (s)', 0.01, 20, 0.1, 0.4),
      num('labelSize', 'Label size % of width', 1, 20, 0.1, 4.4),
      ...fadeParams,
    ],
  },
  (ctx, t, size, p) => {
    const { width: w, height: h } = size,
      e = prog(t, N(p, 'moveAt'), N(p, 'moveDur'), 'ease-in-out'),
      view: FlatView = {
        lon: lerp(N(p, 'lon0'), N(p, 'lon1'), e),
        lat: lerp(N(p, 'lat0'), N(p, 'lat1'), e),
        // Zoom in the log domain so it feels even.
        span: Math.exp(
          lerp(Math.log(N(p, 'span0')), Math.log(N(p, 'span1')), e),
        ),
      },
      a = prog(t, N(p, 'fadeInAt'), N(p, 'fadeInDur'), 'linear');
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.fillStyle = S(p, 'sea');
    ctx.fillRect(0, 0, w, h);
    ctx.beginPath();
    flatLandPath(ctx, view, w, h);
    ctx.fillStyle = S(p, 'land');
    ctx.fill('nonzero');
    const A = flatPoint(
        (named[S(p, 'from')] ?? ALEXANDRIA).lon,
        (named[S(p, 'from')] ?? ALEXANDRIA).lat,
        view,
        w,
        h,
      ),
      B = flatPoint(
        (named[S(p, 'to')] ?? SYENE).lon,
        (named[S(p, 'to')] ?? SYENE).lat,
        view,
        w,
        h,
      ),
      lw = Math.max(2, w * 0.006);
    if (N(p, 'routeAt') >= 0) {
      const bend = N(p, 'routeBend'),
        pts: Pt[] = [];
      const len = Math.hypot(B.x - A.x, B.y - A.y);
      const nx = -(B.y - A.y) / (len || 1),
        ny = (B.x - A.x) / (len || 1);
      for (let i = 0; i <= 40; i++) {
        const u = i / 40,
          off = Math.sin(u * Math.PI * 3.2) * len * 0.035 * bend;
        pts.push([lerp(A.x, B.x, u) + nx * off, lerp(A.y, B.y, u) + ny * off]);
      }
      ctx.save();
      ctx.strokeStyle = '#5a2b1a';
      ctx.lineWidth = lw;
      dots(ctx, lw, 1.9);
      strokePartial(
        ctx,
        pts,
        prog(t, N(p, 'routeAt'), N(p, 'routeDur'), 'ease-in-out'),
      );
      ctx.restore();
    }
    if (N(p, 'dotsAt') >= 0) {
      const d = Math.max(3, w * 0.012),
        sz = (N(p, 'labelSize') / 100) * w,
        k1 = prog(t, N(p, 'dotsAt'), 0.4, 'ease-out'),
        k2 = prog(t, N(p, 'dotsAt') + 0.5, 0.4, 'ease-out');
      cityDot(ctx, A.x, A.y, d, k1);
      label(ctx, S(p, 'from'), A.x - d * 1.8, A.y - d * 0.4, sz, {
        color: S(p, 'ink'),
        weight: 600,
        align: 'right',
        alpha: k1,
      });
      cityDot(ctx, B.x, B.y, d, k2);
      label(ctx, S(p, 'to'), B.x - d * 1.8, B.y + d * 2.2, sz, {
        color: S(p, 'ink'),
        weight: 600,
        align: 'right',
        alpha: k2,
      });
    }
    ctx.restore();
    applyFade(ctx, w, h, p);
  },
);
