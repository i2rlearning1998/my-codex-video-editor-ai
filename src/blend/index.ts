export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];
export const BLEND_OPTIONS = BLEND_MODES.map((id, index) => ({
  id,
  name: id
    .split('-')
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' '),
  category:
    index === 0
      ? 'normal'
      : index <= 1 || index === 4 || index === 7
        ? 'darken'
        : index === 2 || index === 5 || index === 6
          ? 'lighten'
          : index === 3 || index === 8 || index === 9
            ? 'contrast'
            : index <= 11
              ? 'comparison'
              : 'component',
}));
export interface BlendWarning {
  code: 'UNSUPPORTED_BLEND_MODE';
  requested: string;
  message: string;
}
export function resolveBlendMode(
  value: unknown,
  onWarning?: (warning: BlendWarning) => void,
): BlendMode {
  if (value === undefined) return 'normal';
  if (
    typeof value === 'string' &&
    (BLEND_MODES as readonly string[]).includes(value)
  )
    return value as BlendMode;
  onWarning?.({
    code: 'UNSUPPORTED_BLEND_MODE',
    requested: String(value),
    message: `Unsupported blend mode ${String(value)}; using normal.`,
  });
  return 'normal';
}
export function applyBlendMode(
  context: { globalCompositeOperation: GlobalCompositeOperation },
  mode: unknown,
  onWarning?: (warning: BlendWarning) => void,
): BlendMode {
  const selected = resolveBlendMode(mode, onWarning),
    operation = selected === 'normal' ? 'source-over' : selected;
  context.globalCompositeOperation = 'source-over';
  context.globalCompositeOperation = operation;
  if (context.globalCompositeOperation !== operation) {
    context.globalCompositeOperation = 'source-over';
    onWarning?.({
      code: 'UNSUPPORTED_BLEND_MODE',
      requested: selected,
      message: `Canvas does not support ${selected}; using normal.`,
    });
    return 'normal';
  }
  return selected;
}
const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
type RGB = [number, number, number];
const lum = (c: RGB) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const sat = (c: RGB) => Math.max(...c) - Math.min(...c);
function setLum(c: RGB, l: number): RGB {
  const d = l - lum(c);
  let out = c.map((v) => v + d) as RGB;
  const lo = Math.min(...out),
    hi = Math.max(...out);
  if (lo < 0) out = out.map((v) => l + ((v - l) * l) / (l - lo)) as RGB;
  if (hi > 1) out = out.map((v) => l + ((v - l) * (1 - l)) / (hi - l)) as RGB;
  return out;
}
function setSat(c: RGB, s: number): RGB {
  const lo = Math.min(...c),
    span = sat(c);
  return c.map((v) => (span ? ((v - lo) * s) / span : 0)) as RGB;
}
/** W3C compositing reference, unpremultiplied RGBA bytes. Canvas remains runtime. */
export function blendPixel(
  back: readonly number[],
  source: readonly number[],
  mode: BlendMode,
): [number, number, number, number] {
  if (
    back.length !== 4 ||
    source.length !== 4 ||
    [...back, ...source].some((v) => !Number.isFinite(v) || v < 0 || v > 255)
  )
    throw new RangeError('Invalid RGBA pixel');
  const b = back.slice(0, 3).map((v) => v / 255) as RGB,
    s = source.slice(0, 3).map((v) => v / 255) as RGB,
    ab = back[3]! / 255,
    as = source[3]! / 255;
  const channel = (b: number, s: number) => {
    switch (mode) {
      case 'multiply':
        return b * s;
      case 'screen':
        return b + s - b * s;
      case 'overlay':
        return b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
      case 'darken':
        return Math.min(b, s);
      case 'lighten':
        return Math.max(b, s);
      case 'color-dodge':
        return b === 0 ? 0 : s === 1 ? 1 : Math.min(1, b / (1 - s));
      case 'color-burn':
        return b === 1 ? 1 : s === 0 ? 0 : 1 - Math.min(1, (1 - b) / s);
      case 'hard-light':
        return s <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
      case 'soft-light':
        return s <= 0.5
          ? b - (1 - 2 * s) * b * (1 - b)
          : b +
              (2 * s - 1) *
                ((b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)) - b);
      case 'difference':
        return Math.abs(b - s);
      case 'exclusion':
        return b + s - 2 * b * s;
      default:
        return s;
    }
  };
  const mixed =
    mode === 'hue'
      ? setLum(setSat(s, sat(b)), lum(b))
      : mode === 'saturation'
        ? setLum(setSat(b, sat(s)), lum(b))
        : mode === 'color'
          ? setLum(s, lum(b))
          : mode === 'luminosity'
            ? setLum(b, lum(s))
            : (b.map((v, i) => channel(v, s[i]!)) as RGB);
  const a = as + ab * (1 - as);
  return [
    ...b.map((v, i) =>
      byte(
        255 *
          (a
            ? ((1 - as) * ab * v +
                (1 - ab) * as * s[i]! +
                as * ab * mixed[i]!) /
              a
            : 0),
      ),
    ),
    byte(255 * a),
  ] as [number, number, number, number];
}

export { setLayerBlendMode, registerLayerBlend } from './commands';
