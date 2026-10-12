import { rngFor } from '../blocks/helpers';
export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  /** Camera angle in degrees; the scene rotates by its inverse. */
  readonly rotation: number;
  readonly shake: {
    readonly amplitude: number;
    readonly frequency: number;
    readonly seed: number;
  };
}
export interface Viewport {
  readonly width: number;
  readonly height: number;
}
export type Matrix = readonly [number, number, number, number, number, number];
export const defaultCamera: Camera = Object.freeze({
  x: 0,
  y: 0,
  zoom: 1,
  rotation: 0,
  shake: Object.freeze({ amplitude: 0, frequency: 4, seed: 0 }),
});
function noise(seed: number, position: number, axis: number): number {
  const index = Math.floor(position),
    fraction = position - index,
    smooth = fraction * fraction * (3 - 2 * fraction);
  const a = rngFor(seed, index * 2 + axis) * 2 - 1,
    b = rngFor(seed, (index + 1) * 2 + axis) * 2 - 1;
  return a + (b - a) * smooth;
}
/** Canvas affine matrix. x/y are camera offsets from the default viewport centre.
 * depth=0 gives identity; depth=1 gives the full camera. Intermediate zoom is
 * geometric, rotation/translation/shake linear in depth. No DOMMatrix dependency.
 */
export function cameraMatrix(
  camera: Camera,
  t: number,
  viewport: Viewport,
  depth = 1,
): Matrix {
  const { x, y, zoom, rotation, shake } = camera,
    { width, height } = viewport;
  if (
    ![
      x,
      y,
      zoom,
      rotation,
      shake.amplitude,
      shake.frequency,
      t,
      width,
      height,
      depth,
    ].every(Number.isFinite) ||
    zoom <= 0 ||
    width <= 0 ||
    height <= 0 ||
    depth < 0 ||
    depth > 1 ||
    shake.amplitude < 0 ||
    shake.frequency < 0 ||
    shake.frequency > 1000 ||
    Math.abs(t) > 86400 ||
    !Number.isSafeInteger(shake.seed)
  )
    throw new Error('Invalid camera, time, depth or viewport');
  if (depth === 0) return [1, 0, 0, 1, 0, 0];
  const scale = Math.pow(zoom, depth),
    angle = (-rotation * depth * Math.PI) / 180;
  const a = scale * Math.cos(angle),
    b = scale * Math.sin(angle),
    c = -b,
    d = a;
  const position = t * shake.frequency;
  const shakeX =
    shake.frequency === 0
      ? 0
      : noise(shake.seed, position, 0) * shake.amplitude;
  const shakeY =
    shake.frequency === 0
      ? 0
      : noise(shake.seed, position, 1) * shake.amplitude;
  const cx = width / 2,
    cy = height / 2,
    tx = (x + shakeX) * depth,
    ty = (y + shakeY) * depth;
  const matrix: Matrix = [
    a,
    b,
    c,
    d,
    cx - a * (cx + tx) - c * (cy + ty),
    cy - b * (cx + tx) - d * (cy + ty),
  ];
  if (!matrix.every(Number.isFinite)) throw new Error('Camera matrix overflow');
  // Normalize negative zero for stable serialized identity matrices.
  return matrix.map((value) => (value === 0 ? 0 : value)) as unknown as Matrix;
}
/** Multiplies the caller's current transform; caller owns save/restore. The
 * optional fifth argument supplies deterministic shake time (defaults to zero).
 */
export function applyCamera(
  ctx: Pick<CanvasRenderingContext2D, 'transform'>,
  camera: Camera,
  viewport: Viewport,
  depth: number,
  t = 0,
): void {
  ctx.transform(...cameraMatrix(camera, t, viewport, depth));
}
