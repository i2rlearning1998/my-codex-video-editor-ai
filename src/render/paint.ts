// H5 gradient fills (2 to 4 stops). A shape stores its gradient as the
// string property `fillGradient` (JSON, schema unchanged, D-081 pattern);
// it is read defensively here and drawn the same in the preview and export.
export interface GradientStop {
  readonly offset: number;
  readonly color: string;
}
export interface Gradient {
  readonly type: 'linear' | 'radial';
  /** Degrees: 0 runs left to right, 90 top to bottom (linear only). */
  readonly angle: number;
  readonly stops: readonly GradientStop[];
}
const HEX = /^#[0-9a-fA-F]{6}$/;

/** A valid gradient, or null (empty, malformed or out of range). */
export function parseGradient(text: string | undefined): Gradient | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Partial<Gradient>;
    if (value.type !== 'linear' && value.type !== 'radial') return null;
    const angle = Number(value.angle ?? 0);
    if (!Number.isFinite(angle)) return null;
    const stops = Array.isArray(value.stops) ? value.stops : [];
    if (stops.length < 2 || stops.length > 4) return null;
    if (
      !stops.every(
        (stop) =>
          stop &&
          typeof stop.offset === 'number' &&
          stop.offset >= 0 &&
          stop.offset <= 1 &&
          typeof stop.color === 'string' &&
          HEX.test(stop.color),
      )
    )
      return null;
    return {
      type: value.type,
      angle: ((angle % 360) + 360) % 360,
      stops: [...stops]
        .map((stop) => ({ offset: stop.offset, color: stop.color }))
        .sort((a, b) => a.offset - b.offset),
    };
  } catch {
    return null;
  }
}
export const formatGradient = (gradient: Gradient) =>
  JSON.stringify({
    type: gradient.type,
    angle: Math.round(gradient.angle * 100) / 100,
    stops: gradient.stops.map((stop) => ({
      offset: Math.round(stop.offset * 1000) / 1000,
      color: stop.color.toLowerCase(),
    })),
  });

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/**
 * A canvas gradient over a width × height box. Linear gradients run through
 * the box's centre at `angle` and reach its corners (CSS-like); radial ones
 * spread from the centre to the farthest corner.
 */
export function canvasGradient(
  context: Context,
  gradient: Gradient,
  width: number,
  height: number,
): CanvasGradient {
  const cx = width / 2,
    cy = height / 2;
  let result: CanvasGradient;
  if (gradient.type === 'radial')
    result = context.createRadialGradient(
      cx,
      cy,
      0,
      cx,
      cy,
      Math.hypot(width, height) / 2,
    );
  else {
    const radians = (gradient.angle * Math.PI) / 180;
    const dx = Math.cos(radians),
      dy = Math.sin(radians);
    const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
    result = context.createLinearGradient(
      cx - dx * half,
      cy - dy * half,
      cx + dx * half,
      cy + dy * half,
    );
  }
  for (const stop of gradient.stops)
    result.addColorStop(stop.offset, stop.color);
  return result;
}
