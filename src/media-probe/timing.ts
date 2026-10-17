/** Keep seconds on the media clock; never substitute frame number / nominal FPS. */
export function mediaSeekTime(
  time: number,
  options: { end?: number; reverse?: boolean; nudge?: number } = {},
): number {
  if (
    !Number.isFinite(time) ||
    (options.end !== undefined &&
      (Number.isNaN(options.end) || options.end < 0))
  )
    throw new RangeError('Invalid media time');
  const nudge = options.nudge ?? 0.001;
  if (!Number.isFinite(nudge) || nudge < 0)
    throw new RangeError('Invalid seek nudge');
  return Math.max(
    0,
    Math.min(
      options.end ?? Infinity,
      time + (options.reverse ? -nudge : nudge),
    ),
  );
}
export function normalizeTimestamps(timestamps: readonly number[]): number[] {
  if (timestamps.some((t) => !Number.isFinite(t) || t < 0))
    throw new RangeError('Invalid frame timestamps');
  return [...new Set(timestamps)].sort((a, b) => a - b);
}
/** CFR output frame -> held VFR presentation timestamp. Absolute time stays intact. */
export function mapFrameTimestamp(
  timestamps: readonly number[],
  time: number,
): number | null {
  if (!Number.isFinite(time) || time < 0)
    throw new RangeError('Invalid timeline time');
  const sorted = normalizeTimestamps(timestamps);
  let low = 0,
    high = sorted.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (sorted[mid]! <= time) low = mid + 1;
    else high = mid;
  }
  return low ? sorted[low - 1]! : null;
}
export function detectVariableFrameRate(
  timestamps: readonly number[],
  tolerance = 0.001,
): boolean | null {
  if (!Number.isFinite(tolerance) || tolerance < 0)
    throw new RangeError('Invalid tolerance');
  const sorted = normalizeTimestamps(timestamps);
  if (sorted.length < 3) return null;
  const intervals = sorted.slice(1).map((v, i) => v - sorted[i]!);
  return Math.max(...intervals) - Math.min(...intervals) > tolerance;
}
