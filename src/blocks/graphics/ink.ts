// Hand-drawn-feeling drawing helpers shared by the teaching graphics.
// Everything is a pure function of its arguments (no clock, no random state).
import { clamp, ease, rngFor, spring } from '../helpers';
import type { DrawContext, ParamSpec, Params } from '../types';

export type Pt = readonly [number, number];

export const num = (
  name: string,
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
): ParamSpec => ({
  name,
  label,
  type: 'number',
  min,
  max,
  step,
  default: value,
});
export const col = (name: string, label: string, value: string): ParamSpec => ({
  name,
  label,
  type: 'color',
  default: value,
});
export const txt = (
  name: string,
  label: string,
  value: string,
  maxLength = 60,
): ParamSpec => ({ name, label, type: 'text', default: value, maxLength });
export const flag = (
  name: string,
  label: string,
  value: boolean,
): ParamSpec => ({
  name,
  label,
  type: 'bool',
  default: value,
});
export const pick = (
  name: string,
  label: string,
  options: readonly string[],
  value: string,
): ParamSpec => ({ name, label, type: 'select', options, default: value });
export const N = (p: Params, k: string) => p[k] as number;
export const S = (p: Params, k: string) => String(p[k]);
export const B = (p: Params, k: string) => p[k] === true;

/** Progress 0..1 of something that starts at `at` and takes `dur` seconds. */
export const prog = (t: number, at: number, dur: number, e = 'ease-in-out') =>
  ease(e, clamp((t - at) / Math.max(1e-6, dur)));
/** Pop-in scale with a little overshoot; 0 before `at`. */
export const pop = (t: number, at: number) =>
  t < at ? 0 : Math.min(1.15, spring(t - at, 3.2, 0.55));

/** Strokes the first `p` (0..1) of a polyline by length. */
export function strokePartial(
  ctx: DrawContext,
  pts: readonly Pt[],
  p: number,
  close = false,
): void {
  if (p <= 0 || pts.length < 2) return;
  const all = close ? [...pts, pts[0]!] : pts;
  let total = 0;
  for (let i = 1; i < all.length; i++)
    total += Math.hypot(
      all[i]![0] - all[i - 1]![0],
      all[i]![1] - all[i - 1]![1],
    );
  let left = total * Math.min(1, p);
  ctx.beginPath();
  ctx.moveTo(all[0]![0], all[0]![1]);
  for (let i = 1; i < all.length && left > 0; i++) {
    const a = all[i - 1]!,
      b = all[i]!,
      seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (seg <= left) {
      ctx.lineTo(b[0], b[1]);
      left -= seg;
    } else {
      const f = left / seg;
      ctx.lineTo(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f);
      left = 0;
    }
  }
  ctx.stroke();
}

/** Point at fraction p along a polyline, and its direction. */
export function along(
  pts: readonly Pt[],
  p: number,
): { x: number; y: number; a: number } {
  let total = 0;
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot(
      pts[i]![0] - pts[i - 1]![0],
      pts[i]![1] - pts[i - 1]![1],
    );
  let left = total * clamp(p),
    ang = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!,
      b = pts[i]!,
      seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    if (seg >= left || i === pts.length - 1) {
      const f = seg === 0 ? 0 : Math.min(1, left / seg);
      return {
        x: a[0] + (b[0] - a[0]) * f,
        y: a[1] + (b[1] - a[1]) * f,
        a: ang,
      };
    }
    left -= seg;
  }
  return { x: pts[0]![0], y: pts[0]![1], a: ang };
}

/** Quadratic curve sampled to a polyline. */
export function curve(a: Pt, c: Pt, b: Pt, n = 40): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n,
      v = 1 - u;
    out.push([
      v * v * a[0] + 2 * v * u * c[0] + u * u * b[0],
      v * v * a[1] + 2 * v * u * c[1] + u * u * b[1],
    ]);
  }
  return out;
}

/** An arrow head at (x, y) pointing along angle `a`. */
export function arrowHead(
  ctx: DrawContext,
  x: number,
  y: number,
  a: number,
  size: number,
  open = true,
): void {
  const s = size,
    spread = 0.5;
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(a - spread) * s, y - Math.sin(a - spread) * s);
  ctx.lineTo(x, y);
  ctx.lineTo(x - Math.cos(a + spread) * s, y - Math.sin(a + spread) * s);
  if (!open) ctx.closePath();
  open ? ctx.stroke() : ctx.fill();
}

/** A slightly wobbly copy of a polyline, steady for a given seed. */
export function wobble(pts: readonly Pt[], amount: number, seed: number): Pt[] {
  return pts.map((p, i) => [
    p[0] + (rngFor(seed, i * 2) - 0.5) * amount,
    p[1] + (rngFor(seed, i * 2 + 1) - 0.5) * amount,
  ]);
}

/** Dots along a stroke: call before stroking. */
export function dots(ctx: DrawContext, width: number, gap = 2.6): void {
  ctx.lineCap = 'round';
  ctx.setLineDash([0.01, width * gap]);
}

/** Text with a soft rounded strip behind it (like the white label boxes). */
export function label(
  ctx: DrawContext,
  text: string,
  x: number,
  y: number,
  size: number,
  opts: {
    color?: string;
    weight?: number;
    strip?: string;
    align?: CanvasTextAlign;
    alpha?: number;
    family?: string;
    scale?: number;
  } = {},
): void {
  const {
    color = '#222',
    weight = 700,
    strip,
    align = 'center',
    alpha = 1,
    family = 'Poppins, Inter, "Noto Sans Devanagari", Arial, sans-serif',
    scale = 1,
  } = opts;
  if (alpha <= 0 || scale <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (strip) {
    const w = ctx.measureText(text).width,
      pad = size * 0.28,
      left = align === 'center' ? -w / 2 : align === 'left' ? 0 : -w;
    ctx.fillStyle = strip;
    ctx.beginPath();
    ctx.roundRect(
      left - pad,
      -size * 0.62,
      w + pad * 2,
      size * 1.24,
      size * 0.3,
    );
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Fades the bottom of the frame away (diagram above, picture below). */
export function fadeBottom(
  ctx: DrawContext,
  w: number,
  h: number,
  fromPct: number,
  toPct: number,
): void {
  if (toPct <= fromPct) return;
  const g = ctx.createLinearGradient(
    0,
    (h * fromPct) / 100,
    0,
    (h * toPct) / 100,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = g;
  ctx.fillRect(0, (h * fromPct) / 100, w, h - (h * fromPct) / 100);
  ctx.restore();
}

/** Shared "fade the bottom" parameters for diagram blocks. */
export const fadeParams: ParamSpec[] = [
  num('fadeFrom', 'Fade bottom from %', 0, 100, 1, 0),
  num('fadeTo', 'Fade bottom to %', 0, 100, 1, 0),
];
export const applyFade = (ctx: DrawContext, w: number, h: number, p: Params) =>
  fadeBottom(ctx, w, h, N(p, 'fadeFrom'), N(p, 'fadeTo'));

/** Orange map pin (teardrop) with its tip at (x, y). */
export function pin(
  ctx: DrawContext,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(
    -size * 0.55,
    -size * 0.55,
    -size * 0.55,
    -size * 1.35,
    0,
    -size * 1.35,
  );
  ctx.bezierCurveTo(size * 0.55, -size * 1.35, size * 0.55, -size * 0.55, 0, 0);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(0, -size * 0.82, size * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Round red dot with a dark rim (city marker). */
export function cityDot(
  ctx: DrawContext,
  x: number,
  y: number,
  r: number,
  a = 1,
): void {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.fillStyle = '#d2412f';
  ctx.strokeStyle = '#4a1511';
  ctx.lineWidth = Math.max(1, r * 0.35);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
