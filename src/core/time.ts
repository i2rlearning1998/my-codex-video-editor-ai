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

/**
 * A scene's playback range. V7 (spec 11.1): without a stored range the scene
 * is in Auto mode (0 to its content end, `manual` false). A stored range is
 * Manual mode: Start and End are the user's and never follow the content
 * (End may lie past the last clip; a legacy null End follows the content's
 * end). At least one frame long.
 */
export function playRangeOf(composition: {
  readonly duration: number;
  readonly fps: number;
  readonly playRange?:
    { readonly start: number; readonly end: number | null } | undefined;
}): { start: number; end: number; full: boolean; manual: boolean } {
  const { duration, fps } = composition;
  const range = composition.playRange;
  const frame = 1 / fps;
  if (!range) return { start: 0, end: duration, full: true, manual: false };
  const start = Math.max(0, range.start);
  const end = Math.max(start + frame, range.end ?? duration);
  return { start, end, full: false, manual: true };
}
