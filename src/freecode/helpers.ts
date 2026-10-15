import { clamp, lerp, map, rngFor, ease, spring } from '../blocks/helpers';
export interface Vector {
  x: number;
  y: number;
}
export function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function valueNoise(seed: number, x: number, y: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    smooth = (t: number) => t * t * (3 - 2 * t);
  const hash = (a: number, b: number) =>
    rngFor(seed, Math.imul(a, 374761393) ^ Math.imul(b, 668265263)) * 2 - 1;
  return lerp(
    lerp(hash(ix, iy), hash(ix + 1, iy), smooth(x - ix)),
    lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), smooth(x - ix)),
    smooth(y - iy),
  );
}
/** Seeded 2D simplex lattice with eight deterministic gradient directions. */
function simplexNoise(seed: number, x: number, y: number): number {
  const f = (Math.sqrt(3) - 1) / 2,
    g = (3 - Math.sqrt(3)) / 6,
    s = (x + y) * f;
  const i = Math.floor(x + s),
    j = Math.floor(y + s),
    u = (i + j) * g,
    x0 = x - (i - u),
    y0 = y - (j - u),
    a = x0 > y0 ? 1 : 0,
    b = 1 - a;
  const corner = (dx: number, dy: number, ix: number, iy: number) => {
    const t = 0.5 - dx * dx - dy * dy;
    if (t <= 0) return 0;
    const angle =
      (Math.floor(
        rngFor(seed, Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263)) * 8,
      ) *
        Math.PI) /
      4;
    return t ** 4 * (Math.cos(angle) * dx + Math.sin(angle) * dy);
  };
  return (
    70 *
    (corner(x0, y0, i, j) +
      corner(x0 - a + g, y0 - b + g, i + a, j + b) +
      corner(x0 - 1 + 2 * g, y0 - 1 + 2 * g, i + 1, j + 1))
  );
}
export interface Particle extends Vector {
  vx: number;
  vy: number;
  age: number;
  life: number;
}
function emitter(
  seed: number,
  count: number,
  origin: Vector,
  speed = 1,
): Particle[] {
  if (!Number.isInteger(count) || count < 0 || count > 10000)
    throw Error('Emitter count must be 0–10000.');
  const random = rng(seed);
  return Array.from({ length: count }, () => {
    const angle = random() * Math.PI * 2,
      v = speed * (0.3 + random() * 0.7);
    return {
      ...origin,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      age: 0,
      life: 1 + random() * 4,
    };
  });
}
function splitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  mode: 'character' | 'word' = 'character',
) {
  let x = 0;
  return (mode === 'word' ? text.split(/(\s+)/) : Array.from(text)).map(
    (value) => {
      const width = ctx.measureText(value).width,
        result = { text: value, x, width };
      x += width;
      return result;
    },
  );
}
function pathLength(path: string): number {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  node.setAttribute('d', path);
  return node.getTotalLength();
}
function drawPath(
  ctx: CanvasRenderingContext2D,
  path: string,
  progress: number,
): void {
  const length = pathLength(path);
  ctx.save();
  ctx.setLineDash([length, length]);
  ctx.lineDashOffset = length * (1 - clamp(progress));
  ctx.stroke(new Path2D(path));
  ctx.restore();
}
function hex(value: string): { r: number; g: number; b: number; a: number } {
  if (!/^#[\da-f]{6}([\da-f]{2})?$/i.test(value))
    throw Error('Use #RRGGBB or #RRGGBBAA.');
  return {
    r: parseInt(value.slice(1, 3), 16),
    g: parseInt(value.slice(3, 5), 16),
    b: parseInt(value.slice(5, 7), 16),
    a: value.length === 9 ? parseInt(value.slice(7, 9), 16) / 255 : 1,
  };
}
function gradient(
  ctx: CanvasRenderingContext2D,
  from: Vector,
  to: Vector,
  stops: readonly (readonly [number, string])[],
): CanvasGradient {
  const result = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
  for (const [t, color] of stops) result.addColorStop(clamp(t), color);
  return result;
}
export const helpers = Object.freeze({
  clamp,
  lerp,
  map,
  rngFor,
  ease,
  spring,
  rng,
  valueNoise,
  simplexNoise,
  emitter,
  splitText,
  pathLength,
  drawPath,
  hex,
  gradient,
  hsl: (h: number, s: number, l: number, a = 1) =>
    `hsla(${h},${clamp(s, 0, 100)}%,${clamp(l, 0, 100)}%,${clamp(a)})`,
  vec: Object.freeze({
    add: (a: Vector, b: Vector) => ({ x: a.x + b.x, y: a.y + b.y }),
    scale: (a: Vector, s: number) => ({ x: a.x * s, y: a.y * s }),
    length: (a: Vector) => Math.hypot(a.x, a.y),
    normalize: (a: Vector) => {
      const n = Math.hypot(a.x, a.y) || 1;
      return { x: a.x / n, y: a.y / n };
    },
  }),
  rendererOptions: (canvas: HTMLCanvasElement) => ({
    canvas,
    view: canvas,
    width: canvas.width,
    height: canvas.height,
    alpha: true,
    backgroundAlpha: 0,
    antialias: true,
    preserveDrawingBuffer: true,
    autoStart: false,
  }),
});
