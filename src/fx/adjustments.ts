import { effect, numberParam, n, defaults } from './definition';
import { curve, lut, matrix, saturationMatrix } from './color';
const amount = numberParam('amount', 'Amount', -1, 1, 0);
export const adjustments = [
  effect(
    'adjust.exposure',
    'Exposure',
    'Adjust colors',
    (s, d, p) =>
      lut(
        s,
        d,
        curve((v) => v * 2 ** (2 * n(p, 'amount'))),
      ),
    [amount],
    'preserve',
    'adjustment',
  ),
  effect(
    'adjust.contrast',
    'Contrast',
    'Adjust colors',
    (s, d, p) =>
      lut(
        s,
        d,
        curve((v) => (v - 0.5) * 2 ** (2 * n(p, 'amount')) + 0.5),
      ),
    [amount],
    'preserve',
    'adjustment',
  ),
  effect(
    'adjust.saturation',
    'Saturation',
    'Adjust colors',
    (s, d, p) => matrix(s, d, saturationMatrix(1 + n(p, 'amount'))),
    [amount],
    'preserve',
    'adjustment',
  ),
  effect(
    'adjust.temperature',
    'Temperature',
    'Adjust colors',
    (s, d, p) => {
      const v = n(p, 'amount');
      matrix(s, d, [1, 0, 0, 32 * v, 0, 1, 0, 6 * v, 0, 0, 1, -32 * v]);
    },
    [amount],
    'preserve',
    'adjustment',
  ),
  effect(
    'adjust.transparency',
    'Transparency',
    'Adjust colors',
    (s, d, p) => {
      d.data.set(s.data);
      const v = n(p, 'amount');
      for (let i = 3; i < s.data.length; i += 4) {
        const a = s.data[i]!;
        d.data[i] = v < 0 ? a * (1 + v) : a > 0 ? a + (255 - a) * v : 0;
      }
    },
    [amount],
    'modify',
    'adjustment',
  ),
] as const;
export const adjustmentDefaults = adjustments.map((d) => ({
  id: d.id,
  params: defaults(d),
}));
export const blendModes = [
  ['normal', 'Normal', 'source-over'],
  ['darken', 'Darken', 'darken'],
  ['multiply', 'Multiply', 'multiply'],
  ['colour-burn', 'Colour burn', 'color-burn'],
  ['lighten', 'Lighten', 'lighten'],
  ['screen', 'Screen', 'screen'],
  ['colour-dodge', 'Colour dodge', 'color-dodge'],
  ['overlay', 'Overlay', 'overlay'],
  ['soft-light', 'Soft light', 'soft-light'],
  ['hard-light', 'Hard light', 'hard-light'],
  ['difference', 'Difference', 'difference'],
  ['exclusion', 'Exclusion', 'exclusion'],
  ['hue', 'Hue', 'hue'],
  ['saturation', 'Saturation', 'saturation'],
  ['colour', 'Colour', 'color'],
  ['luminosity', 'Luminosity', 'luminosity'],
].map(([id, name, operation]) => ({
  id: 'blend.' + id!,
  name: name!,
  operation: operation!,
}));
export function fadeAlpha(
  t: number,
  duration: number,
  fadeIn: number,
  fadeOut: number,
): number {
  if (![t, duration, fadeIn, fadeOut].every(Number.isFinite))
    throw new RangeError('Fade arguments must be finite');
  if (duration <= 0 || t < 0 || t > duration) return 0;
  const a = Math.min(duration / 2, Math.max(0, fadeIn)),
    b = Math.min(duration / 2, Math.max(0, fadeOut));
  return Math.min(a > 0 ? t / a : 1, b > 0 ? (duration - t) / b : 1, 1);
}
