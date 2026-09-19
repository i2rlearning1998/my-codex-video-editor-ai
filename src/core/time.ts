/** Shared logical time conversions. Pixels are CSS pixels, time is composition seconds. */
function finite(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Invalid time coordinate');
  return value;
}
function positive(value: number): number {
  if (finite(value) <= 0) throw new RangeError('Invalid time scale');
  return value;
}
export const timeToPixel = (time: number, pixelsPerSecond: number): number =>
  finite(finite(time) * positive(pixelsPerSecond));
export const pixelToTime = (pixel: number, pixelsPerSecond: number): number =>
  finite(finite(pixel) / positive(pixelsPerSecond));
export const timeToFrame = (time: number, fps: number): number =>
  Math.round(finite(finite(time) * positive(fps)));
export const frameToTime = (frame: number, fps: number): number =>
  finite(finite(frame) / positive(fps));
export const clampTime = (time: number, duration: number): number =>
  Math.max(0, Math.min(positive(duration), finite(time)));
export interface Timing {
  readonly startTime: number;
  readonly duration: number;
}
export const activeAtTime = (timing: Timing, time: number): boolean =>
  time >= timing.startTime && time < timing.startTime + timing.duration;
