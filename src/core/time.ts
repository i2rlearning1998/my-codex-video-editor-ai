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
 * U6: a scene's playback and export range, resolved to its current length:
 * at least one frame long, inside the scene, the whole scene by default.
 */
export function playRangeOf(composition: {
  readonly duration: number;
  readonly fps: number;
  readonly playRange?:
    { readonly start: number; readonly end: number | null } | undefined;
}): { start: number; end: number; full: boolean } {
  const { duration, fps } = composition;
  const range = composition.playRange;
  const frame = 1 / fps;
  const start = Math.min(
    Math.max(0, range?.start ?? 0),
    Math.max(0, duration - frame),
  );
  const stored = range?.end ?? null;
  const end =
    stored === null
      ? duration
      : Math.min(duration, Math.max(start + frame, stored));
  return { start, end, full: start <= 0 && end >= duration - 1e-9 };
}
