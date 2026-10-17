export interface OrientedSample {
  displayWidth: number;
  displayHeight: number;
  draw(
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    x: number,
    y: number,
    width?: number,
    height?: number,
  ): void;
}
/** Materialize immediately: raw VideoFrames can close at the next microtask. */
export function rasterizeOrientedSample(
  sample: OrientedSample,
  makeCanvas = (w: number, h: number) => new OffscreenCanvas(w, h),
): OffscreenCanvas {
  const { displayWidth: width, displayHeight: height } = sample;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > 33554432
  )
    throw new RangeError('Invalid decoded display dimensions');
  const canvas = makeCanvas(width, height),
    ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas2D unavailable');
  sample.draw(ctx, 0, 0, width, height);
  return canvas;
}
export function rotatedDimensions(
  width: number,
  height: number,
  rotation: number,
) {
  if (
    ![width, height, rotation].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    rotation % 90 !== 0
  )
    throw new RangeError('Invalid rotation dimensions');
  return Math.abs(rotation % 180) === 90
    ? { width: height, height: width }
    : { width, height };
}
