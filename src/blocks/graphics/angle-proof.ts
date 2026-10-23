// "Two sticks on a curved Earth": the whole argument of Eratosthenes in one
// picture. Sun rays fall parallel. At Syene the stick points straight at the
// Sun (no shadow); at Alexandria the Earth has curved away, so the stick leans
// and throws a shadow. The lean is the angle at the stick tip; because the rays
// are parallel it equals the angle at the Earth's centre between the two cities'
// vertical lines (corresponding angles), and that angle cuts out the 800 km arc.
// Every step switches on at its own time (-1 keeps it off).
import { clamp } from '../helpers';
import { defineBlock } from '../render';
import type { DrawContext } from '../types';
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

export const angleProof = defineBlock(
  {
    id: 'angle-proof',
    version: '1.0.0',
    name: 'Two sticks on a curved Earth',
    category: 'Education',
    defaultDuration: 14,
    thumbnailTime: 11,
    params: [
      num('cx', 'Earth centre x %', 0, 100, 0.5, 50),
      num('cy', 'Earth centre y %', -50, 150, 0.5, 37),
      num('radius', 'Earth radius % of width', 8, 60, 0.5, 33),
      num('dTheta', 'Drawn angle between cities (deg)', 3, 40, 0.1, 16),
      num('stickLen', 'Stick length % of width', 4, 40, 0.5, 13),
      num('raysAt', 'Sun rays at (s, -1 off)', -1, 600, 0.1, 0.3),
      num('sticksAt', 'Sticks at (s, -1 off)', -1, 600, 0.1, 1.2),
      num('shadowAt', 'Shadow at (s, -1 off)', -1, 600, 0.1, 2.6),
      num('tipAt', 'Angle at the stick tip at (s, -1 off)', -1, 600, 0.1, 4.2),
      num(
        'normalsAt',
        'Vertical lines to the centre at (s, -1 off)',
        -1,
        600,
        0.1,
        6,
      ),
      num('centreAt', 'Angle at the centre at (s, -1 off)', -1, 600, 0.1, 8),
      num('equalAt', 'Equal-angles note at (s, -1 off)', -1, 600, 0.1, 9.4),
      num('arcAt', 'Arc between cities at (s, -1 off)', -1, 600, 0.1, 11),
      txt('cityA', 'City with the shadow', 'Alexandria', 20),
      txt('cityB', 'City with no shadow', 'Syene', 20),
      txt('angleText', 'Angle text', '7.2°', 8),
      txt('kmText', 'Distance text', '800 km', 12),
      txt('note', 'Equal-angles note', 'Corresponding angles', 40),
      txt('scaleNote', 'Scale note (empty hides it)', 'angle drawn bigger', 30),
      col('ground', 'Earth colour', '#f2e4c9'),
      col('rim', 'Earth rim', '#6b4a2b'),
      col('red', 'Distance colour', '#c0262d'),
      ...fadeParams,
    ],
  },
  (ctx, t, size, p) => {
    const { width: w, height: h } = size,
      C = { x: (N(p, 'cx') / 100) * w, y: (N(p, 'cy') / 100) * h },
      R = (N(p, 'radius') / 100) * w,
      th = N(p, 'dTheta') * rad,
      L = (N(p, 'stickLen') / 100) * w,
      lw = Math.max(2, w * 0.0045),
      at = (a: number, r: number): Pt => [
        C.x + Math.sin(a) * r,
        C.y - Math.cos(a) * r,
      ],
      // Alexandria leans away to the left, Syene stands on top.
      aA = -th,
      aS = 0,
      baseA = at(aA, R),
      baseS = at(aS, R),
      tipA = at(aA, R + L),
      tipS = at(aS, R + L),
      on = (k: string) => N(p, k) >= 0 && t >= N(p, k),
      since = (k: string, d: number, e = 'ease-in-out') =>
        prog(t, N(p, k), d, e);

    // Earth, cut open: ocean-and-land crust, glowing mantle, bright core.
    ctx.save();
    const mantle = ctx.createRadialGradient(C.x, C.y, R * 0.05, C.x, C.y, R);
    mantle.addColorStop(0, '#fff3a6');
    mantle.addColorStop(0.22, '#ffd35a');
    mantle.addColorStop(0.24, '#f59a3c');
    mantle.addColorStop(0.9, '#d9622b');
    mantle.addColorStop(1, '#b84a1f');
    ctx.fillStyle = mantle;
    ctx.beginPath();
    ctx.arc(C.x, C.y, R, 0, Math.PI * 2);
    ctx.fill();
    // Crust: a teal ring with green land patches along it.
    ctx.strokeStyle = '#2b7a99';
    ctx.lineWidth = R * 0.075;
    ctx.beginPath();
    ctx.arc(C.x, C.y, R * 0.965, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#6fae55';
    ctx.lineWidth = R * 0.075;
    ctx.lineCap = 'round';
    for (const [a0, a1] of [
      [-0.9, -0.05],
      [0.25, 0.85],
      [1.5, 2.3],
      [2.8, 3.6],
      [4.1, 4.9],
      [5.3, 5.8],
    ] as const) {
      ctx.beginPath();
      ctx.arc(C.x, C.y, R * 0.965, a0 - Math.PI / 2, a1 - Math.PI / 2);
      ctx.stroke();
    }
    ctx.strokeStyle = S(p, 'rim');
    ctx.lineWidth = lw * 1.2;
    ctx.beginPath();
    ctx.arc(C.x, C.y, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Sun rays: parallel beams falling straight down, with a soft glow.
    if (on('raysAt')) {
      const pr = since('raysAt', 1.4, 'ease-out'),
        gap = w * 0.062,
        top = h * 0.085;
      ctx.save();
      ctx.lineCap = 'round';
      for (let k = -9; k <= 9; k++) {
        const x = C.x + k * gap;
        if (Math.abs(x - C.x) > R * 1.02) continue;
        const ground = C.y - Math.sqrt(Math.max(0, R * R - (x - C.x) ** 2)),
          // The beam over Syene stops at its stick tip; the beam over the
          // leaning stick stops at its tip too.
          nearA = Math.abs(x - tipA[0]) < gap * 0.45 && on('sticksAt'),
          end = k === 0 && on('sticksAt') ? tipS[1] : ground;
        if (nearA) continue;
        const y1 = top + (end - top) * pr;
        ctx.strokeStyle = 'rgba(255,190,70,0.22)';
        ctx.lineWidth = lw * 4.2;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, y1);
        ctx.stroke();
        ctx.strokeStyle = '#f4a43d';
        ctx.lineWidth = lw * 1.1;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, y1);
        ctx.stroke();
      }
      // The beam that just grazes the tip of the leaning stick.
      if (on('sticksAt')) {
        const y1 = top + (tipA[1] - top) * pr;
        ctx.strokeStyle = 'rgba(255,190,70,0.28)';
        ctx.lineWidth = lw * 4.2;
        ctx.beginPath();
        ctx.moveTo(tipA[0], top);
        ctx.lineTo(tipA[0], y1);
        ctx.stroke();
        ctx.strokeStyle = '#f08a1c';
        ctx.lineWidth = lw * 1.4;
        ctx.beginPath();
        ctx.moveTo(tipA[0], top);
        ctx.lineTo(tipA[0], y1);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Shadow of the leaning stick on the ground (it falls away from the Sun's
    // overhead point). Where the beam through the tip meets the Earth.
    if (on('shadowAt')) {
      const sinPsi = clamp((tipA[0] - C.x) / R, -1, 1),
        psi = Math.asin(sinPsi),
        a1 = aA + (psi - aA) * since('shadowAt', 1.1, 'ease-out');
      ctx.save();
      ctx.strokeStyle = 'rgba(46,32,20,0.62)';
      ctx.lineWidth = lw * 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(
        C.x,
        C.y,
        R + lw * 0.6,
        aA - Math.PI / 2,
        a1 - Math.PI / 2,
        a1 < aA,
      );
      ctx.stroke();
      ctx.restore();
      label(
        ctx,
        'shadow',
        at(a1, R)[0] - w * 0.02,
        at(a1, R)[1] + h * 0.022,
        w * 0.03,
        {
          color: '#3a2a1a',
          weight: 600,
          align: 'right',
          alpha: since('shadowAt', 0.6, 'linear') * 0.9,
        },
      );
    }

    // The sticks themselves.
    if (on('sticksAt')) {
      const k = pop(t, N(p, 'sticksAt'));
      const stick = (a: Pt, b: Pt) => {
        const bx = a[0],
          by = a[1],
          tx = bx + (b[0] - bx) * Math.min(1, k),
          ty = by + (b[1] - by) * Math.min(1, k);
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#3d2610';
        ctx.lineWidth = w * 0.017;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.strokeStyle = '#a8773f';
        ctx.lineWidth = w * 0.0105;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.restore();
      };
      stick(baseA, tipA);
      stick(baseS, tipS);
      const sa = since('sticksAt', 0.5, 'ease-out');
      label(
        ctx,
        S(p, 'cityA'),
        tipA[0] - w * 0.03,
        tipA[1] - h * 0.012,
        w * 0.041,
        {
          color: '#b8372f',
          weight: 700,
          align: 'right',
          alpha: sa,
        },
      );
      label(
        ctx,
        S(p, 'cityB'),
        tipS[0] + w * 0.03,
        tipS[1] - h * 0.012,
        w * 0.041,
        {
          color: '#b8372f',
          weight: 700,
          align: 'left',
          alpha: sa,
        },
      );
      if (!on('shadowAt'))
        label(
          ctx,
          'no shadow',
          tipS[0] + w * 0.03,
          tipS[1] + h * 0.018,
          w * 0.028,
          {
            color: '#7a5f4b',
            weight: 600,
            align: 'left',
            alpha: since('sticksAt', 1.2, 'linear') * 0.9,
          },
        );
    }

    // Angle at the stick tip: between the beam (up) and the stick (continued up).
    if (on('tipAt')) {
      const pr = since('tipAt', 0.7),
        ext = L * 0.9;
      ctx.save();
      // The stick continued upwards, dotted.
      ctx.strokeStyle = '#3d2610';
      ctx.lineWidth = lw;
      dots(ctx, lw, 2.4);
      strokePartial(
        ctx,
        [tipA, [tipA[0] + Math.sin(aA) * ext, tipA[1] - Math.cos(aA) * ext]],
        pr,
      );
      ctx.setLineDash([]);
      ctx.strokeStyle = '#d98a1c';
      ctx.lineWidth = lw * 1.8;
      const rr = L * 0.85;
      ctx.beginPath();
      ctx.arc(
        tipA[0],
        tipA[1],
        rr,
        -Math.PI / 2 + aA,
        -Math.PI / 2 + aA + (0 - aA) * pr,
        false,
      );
      ctx.stroke();
      ctx.restore();
      label(
        ctx,
        S(p, 'angleText'),
        tipA[0] + w * 0.04,
        tipA[1] - rr * 0.95,
        w * 0.056,
        {
          color: '#7a3d00',
          weight: 700,
          align: 'left',
          scale: pop(t, N(p, 'tipAt') + 0.35),
        },
      );
    }

    // The two vertical lines carried down to the centre.
    if (on('normalsAt')) {
      const pr = since('normalsAt', 1.4);
      ctx.save();
      ctx.strokeStyle = '#2b2b2b';
      ctx.lineWidth = lw * 1.1;
      dots(ctx, lw * 1.1, 2.3);
      strokePartial(ctx, [baseS, [C.x, C.y]], pr);
      strokePartial(ctx, [baseA, [C.x, C.y]], pr);
      ctx.restore();
      // Centre mark.
      ctx.save();
      ctx.globalAlpha *= pr;
      ctx.fillStyle = '#2b2b2b';
      ctx.beginPath();
      ctx.arc(C.x, C.y, lw * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Parallel tick marks (>>) on the Syene line and on the grazing beam.
      const chev = (x: number, y: number, a: number) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.strokeStyle = '#1b1b1b';
        ctx.lineWidth = lw * 1.1;
        for (const d of [0, lw * 4.2]) {
          ctx.beginPath();
          ctx.moveTo(-lw * 3 + d, -lw * 3);
          ctx.lineTo(d, 0);
          ctx.lineTo(-lw * 3 + d, lw * 3);
          ctx.stroke();
        }
        ctx.restore();
      };
      if (pr > 0.9) {
        ctx.save();
        ctx.globalAlpha *= clamp((pr - 0.9) * 10);
        chev(C.x, C.y + R * 0.45, -Math.PI / 2);
        chev(tipA[0], tipA[1] - L * 1.25, -Math.PI / 2);
        ctx.restore();
      }
    }

    // Angle at the centre.
    if (on('centreAt')) {
      const pr = since('centreAt', 0.7),
        rr = R * 0.34;
      ctx.save();
      ctx.strokeStyle = '#d98a1c';
      ctx.lineWidth = lw * 1.8;
      ctx.beginPath();
      ctx.arc(
        C.x,
        C.y,
        rr,
        -Math.PI / 2 + aA,
        -Math.PI / 2 + aA + (0 - aA) * pr,
        false,
      );
      ctx.stroke();
      ctx.restore();
      label(
        ctx,
        S(p, 'angleText'),
        C.x - w * 0.05,
        C.y - rr - h * 0.026,
        w * 0.052,
        {
          color: '#7a3d00',
          weight: 700,
          scale: pop(t, N(p, 'centreAt') + 0.35),
        },
      );
    }

    // "Equal angles" note and the small scale note.
    if (on('equalAt')) {
      label(ctx, S(p, 'note'), C.x, C.y + R + h * 0.03, w * 0.05, {
        color: '#1b1b1b',
        weight: 700,
        strip: 'rgba(255,255,255,0.88)',
        alpha: since('equalAt', 0.5, 'ease-out'),
        scale: 0.85 + 0.15 * pop(t, N(p, 'equalAt')),
      });
    }
    if (S(p, 'scaleNote') && on('tipAt'))
      label(ctx, S(p, 'scaleNote'), C.x, C.y + R + h * 0.06, w * 0.026, {
        color: '#8a7a68',
        weight: 500,
        alpha: since('tipAt', 0.8, 'linear') * 0.9,
      });

    // The arc between the cities: the 800 km.
    if (on('arcAt')) {
      const pr = since('arcAt', 1.0);
      ctx.save();
      ctx.strokeStyle = S(p, 'red');
      ctx.lineWidth = lw * 3.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(
        C.x,
        C.y,
        R,
        aA - Math.PI / 2,
        aA + (0 - aA) * pr - Math.PI / 2,
        false,
      );
      ctx.stroke();
      ctx.restore();
      const mid = at(aA / 2, R);
      ctx.save();
      ctx.globalAlpha *= since('arcAt', 0.5, 'linear');
      ctx.strokeStyle = S(p, 'red');
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(mid[0], mid[1] + lw * 2);
      ctx.lineTo(mid[0] + w * 0.07, mid[1] + h * 0.045);
      ctx.stroke();
      ctx.restore();
      label(
        ctx,
        S(p, 'kmText'),
        mid[0] + w * 0.075,
        mid[1] + h * 0.05,
        w * 0.052,
        {
          color: S(p, 'red'),
          weight: 700,
          align: 'left',
          scale: pop(t, N(p, 'arcAt') + 0.6),
        },
      );
    }
    applyFade(ctx, w, h, p);
  },
);

export type { DrawContext };
