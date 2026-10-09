import type {
  Context,
  Definition,
  Param,
  Params,
  Surface,
  Transition,
} from './types';
import { clamp, context, mixPixel, pair } from './surface';
export const numberParam = (
  name: string,
  label: string,
  min: number,
  max: number,
  value: number,
): Param => ({ name, label, type: 'number', min, max, default: value });
export const intensity = numberParam('intensity', 'Intensity', 0, 1, 1);
export const booleanParam = (
  name: string,
  label: string,
  value: boolean,
): Param => ({ name, label, type: 'boolean', min: 0, max: 1, default: value });
export const selectParam = (
  name: string,
  label: string,
  options: readonly string[],
  value: string,
): Param => ({
  name,
  label,
  type: 'select',
  min: 0,
  max: options.length - 1,
  default: value,
  options,
});
export function defaults(def: {
  params: readonly Param[];
}): Record<string, number | boolean | string> {
  return Object.fromEntries(def.params.map((p) => [p.name, p.default]));
}
export function sanitize(spec: readonly Param[], raw: Params): Params {
  const out: Record<string, number | boolean | string> = {};
  for (const p of spec) {
    const v = raw[p.name];
    out[p.name] =
      p.type === 'number'
        ? typeof v === 'number' && Number.isFinite(v)
          ? clamp(v, p.min, p.max)
          : p.default
        : p.type === 'boolean'
          ? typeof v === 'boolean'
            ? v
            : p.default
          : p.type === 'color'
            ? typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
              ? v
              : p.default
            : typeof v === 'string' && p.options?.includes(v)
              ? v
              : p.default;
  }
  return out;
}
export const n = (p: Params, key: string): number => p[key] as number;
export function effect(
  id: string,
  name: string,
  category: string,
  run: Definition['apply'],
  params: readonly Param[] = [],
  alpha: Definition['alpha'] = 'preserve',
  kind: Definition['kind'] = 'effect',
): Definition {
  const spec = [intensity, ...params];
  return {
    id,
    name,
    category,
    kind,
    params: spec,
    alpha,
    apply(src, dst, raw, ctx) {
      pair(src, dst);
      context(src, ctx);
      const p = sanitize(spec, raw),
        amount = n(p, 'intensity');
      if (amount === 0) {
        dst.data.set(src.data);
        return;
      }
      run(src, dst, p, ctx);
      if (alpha === 'preserve') {
        for (let i = 3; i < dst.data.length; i += 4) dst.data[i] = src.data[i]!;
      }
      if (amount !== 1) {
        for (let i = 0; i < dst.data.length; i += 4) {
          if (alpha === 'preserve') {
            for (let c = 0; c < 3; c++)
              dst.data[i + c] =
                src.data[i + c]! +
                (dst.data[i + c]! - src.data[i + c]!) * amount;
          } else mixPixel(src, dst, dst, i, amount);
        }
      }
    },
  };
}
export function transition(
  id: string,
  name: string,
  category: string,
  run: (
    a: Surface,
    b: Surface,
    d: Surface,
    t: number,
    p: Params,
    c: Context,
  ) => void,
  params: readonly Param[] = [],
): Transition {
  return {
    id,
    name,
    category,
    kind: 'transition',
    params,
    alpha: 'mix',
    apply(a, b, d, t, raw, c) {
      pair(a, d);
      pair(b, d);
      context(a, c);
      if (!Number.isFinite(t)) throw new RangeError('Progress must be finite');
      t = clamp(t);
      if (t === 0) {
        d.data.set(a.data);
        return;
      }
      if (t === 1) {
        d.data.set(b.data);
        return;
      }
      run(a, b, d, t, sanitize(params, raw), c);
    },
  };
}
