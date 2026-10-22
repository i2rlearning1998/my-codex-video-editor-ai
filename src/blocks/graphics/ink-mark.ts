// "Ink mark": a hand-drawn tick, cross, question mark, circle, arrow or
// underline that draws itself on. One small block for every "draw attention"
// moment in an explainer.
import { clamp } from '../helpers';
import { defineBlock } from '../render';
import {
  N,
  S,
  arrowHead,
  col,
  curve,
  dots,
  along,
  label,
  num,
  pick,
  pop,
  prog,
  strokePartial,
  wobble,
  type Pt,
} from './ink';

export const MARK_KINDS = [
  'check',
  'cross',
  'question',
  'circle',
  'dotted-circle',
  'curved-arrow',
  'arrow',
  'double-arrow',
  'underline',
  'right-angle',
] as const;

export const inkMark = defineBlock(
  {
    id: 'ink-mark',
    version: '1.0.0',
    name: 'Ink mark',
    category: 'Education',
    defaultDuration: 3,
    fps: 15,
    thumbnailTime: 1.2,
    params: [
      pick('kind', 'Mark', MARK_KINDS, 'check'),
      num('x', 'Centre x %', -50, 150, 1, 50),
      num('y', 'Centre y %', -50, 150, 1, 50),
      num('size', 'Size % of width', 1, 200, 1, 20),
      num('aspect', 'Width / height', 0.2, 6, 0.05, 1),
      num('rotation', 'Rotation', -360, 360, 1, 0),
      col('color', 'Colour', '#2f9e44'),
      num('lineWidth', 'Line width % of size', 1, 30, 0.5, 7),
      num('start', 'Draws at (s)', 0, 600, 0.1, 0),
      num('drawTime', 'Takes (s)', 0.1, 20, 0.1, 0.7),
      num('wobble', 'Hand wobble', 0, 10, 0.1, 1.2),
      num('fadeOutAt', 'Fades out at (s, 0 never)', 0, 600, 0.1, 0),
    ],
  },
  (ctx, t, size, p, seed) => {
    const w = size.width,
      h = size.height,
      s = (N(p, 'size') / 100) * w,
      kind = S(p, 'kind'),
      draw = prog(t, N(p, 'start'), N(p, 'drawTime'), 'ease-in-out'),
      out =
        N(p, 'fadeOutAt') > 0
          ? 1 - prog(t, N(p, 'fadeOutAt'), 0.35, 'ease-in')
          : 1,
      aspect = N(p, 'aspect'),
      lw = Math.max(1.5, (s * N(p, 'lineWidth')) / 100),
      wob = (s * N(p, 'wobble')) / 100;
    if (draw <= 0 || out <= 0) return;
    ctx.save();
    ctx.globalAlpha *= out;
    ctx.translate((N(p, 'x') / 100) * w, (N(p, 'y') / 100) * h);
    ctx.rotate((N(p, 'rotation') * Math.PI) / 180);
    ctx.strokeStyle = S(p, 'color');
    ctx.fillStyle = S(p, 'color');
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const sx = (v: number) => v * s * aspect,
      sy = (v: number) => v * s;
    const P = (pts: readonly (readonly [number, number])[]): Pt[] =>
      wobble(
        pts.map((q) => [sx(q[0]), sy(q[1])] as Pt),
        wob,
        seed + 3,
      );
    switch (kind) {
      case 'check':
        strokePartial(
          ctx,
          P([
            [-0.4, 0.02],
            [-0.14, 0.3],
            [0.42, -0.36],
          ]),
          draw,
        );
        break;
      case 'cross': {
        const a = prog(t, N(p, 'start'), N(p, 'drawTime') * 0.5),
          b = prog(
            t,
            N(p, 'start') + N(p, 'drawTime') * 0.5,
            N(p, 'drawTime') * 0.5,
          );
        strokePartial(
          ctx,
          P([
            [-0.33, -0.33],
            [0.33, 0.33],
          ]),
          a,
        );
        strokePartial(
          ctx,
          P([
            [0.33, -0.33],
            [-0.33, 0.33],
          ]),
          b,
        );
        break;
      }
      case 'question': {
        const k = pop(t, N(p, 'start')),
          sway = Math.sin((t - N(p, 'start')) * 5) * 0.05;
        ctx.rotate(sway);
        label(ctx, '?', 0, 0, s * 1.4, {
          color: S(p, 'color'),
          weight: 800,
          scale: k,
        });
        break;
      }
      case 'circle':
      case 'dotted-circle': {
        const turns = 1.06,
          pts: Pt[] = [];
        for (let i = 0; i <= 90; i++) {
          const u = i / 90,
            a = -Math.PI / 2 - 0.25 + u * Math.PI * 2 * turns,
            grow = 1 + (u - 0.5) * 0.04;
          pts.push([Math.cos(a) * 0.5 * grow, Math.sin(a) * 0.5 * grow]);
        }
        if (kind === 'dotted-circle') dots(ctx, lw, 2);
        strokePartial(ctx, P(pts), draw);
        break;
      }
      case 'curved-arrow':
      case 'arrow':
      case 'double-arrow': {
        const base: Pt[] =
          kind === 'curved-arrow'
            ? curve([-0.5, -0.3], [0.05, -0.62], [0.46, 0.3], 36)
            : [
                [-0.5, 0],
                [0.5, 0],
              ];
        const pts = P(base.map((q) => [q[0], q[1]] as Pt));
        // Wobble moved the ends too; keep them clean so heads sit right.
        pts[0] = [sx(base[0]![0]), sy(base[0]![1])];
        pts[pts.length - 1] = [
          sx(base[base.length - 1]![0]),
          sy(base[base.length - 1]![1]),
        ];
        strokePartial(ctx, pts, draw);
        const head = along(pts, draw);
        if (draw > 0.12) arrowHead(ctx, head.x, head.y, head.a, lw * 3.4);
        if (kind === 'double-arrow') {
          const tail = along(pts, 0);
          arrowHead(ctx, tail.x, tail.y, Math.PI + head.a * 0, lw * 3.4);
        }
        break;
      }
      case 'underline': {
        const pts: Pt[] = [];
        for (let i = 0; i <= 30; i++)
          pts.push([-0.5 + i / 30, Math.sin(i * 0.9) * 0.03]);
        strokePartial(ctx, P(pts), draw);
        break;
      }
      case 'right-angle': {
        const k = pop(t, N(p, 'start'));
        ctx.scale(clamp(k, 0, 1.1), clamp(k, 0, 1.1));
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        ctx.moveTo(sx(-0.5), sy(0));
        ctx.lineTo(sx(-0.5), sy(-0.5));
        ctx.lineTo(sx(0), sy(-0.5));
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  },
);
