import type { BlockInfo, Params, ParamSpec, Value } from './types';
const safe = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const reserved = new Set(['constructor', 'prototype', '__proto__']);
export function validateSpecs(specs: readonly ParamSpec[]): void {
  if (!Array.isArray(specs) || specs.length > 32)
    throw new RangeError('At most 32 parameters');
  const seen = new Set<string>();
  for (const p of specs) {
    if (
      !p ||
      !safe.test(p.name) ||
      reserved.has(p.name) ||
      seen.has(p.name) ||
      typeof p.label !== 'string' ||
      p.label.length < 1 ||
      p.label.length > 100
    )
      throw new Error('Invalid or duplicate parameter');
    seen.add(p.name);
    if (p.type === 'number') {
      if (
        ![p.min, p.max, p.step, p.default].every(Number.isFinite) ||
        p.min > p.max ||
        p.step <= 0 ||
        Math.abs(p.min) > 1e9 ||
        Math.abs(p.max) > 1e9
      )
        throw new Error('Invalid numeric bounds');
    } else if (p.type === 'select') {
      if (
        !Array.isArray(p.options) ||
        !p.options.length ||
        p.options.length > 32 ||
        p.options.some(
          (v: unknown) => typeof v !== 'string' || v.length > 100,
        ) ||
        new Set(p.options).size !== p.options.length
      )
        throw new Error('Invalid select options');
    } else if (p.type === 'text') {
      if (
        p.maxLength !== undefined &&
        (!Number.isInteger(p.maxLength) ||
          p.maxLength < 1 ||
          p.maxLength > 1000)
      )
        throw new Error('Invalid text limit');
    } else if (!['color', 'bool'].includes(p.type))
      throw new Error('Unknown parameter type');
    validateValue(p, p.default);
  }
}
function validateValue(p: ParamSpec, v: unknown): Value {
  switch (p.type) {
    case 'number':
      if (
        typeof v === 'number' &&
        Number.isFinite(v) &&
        v >= p.min &&
        v <= p.max
      )
        return v;
      break;
    case 'color':
      if (typeof v === 'string' && /^#[\da-f]{6}([\da-f]{2})?$/i.test(v))
        return v;
      break;
    case 'text':
      if (typeof v === 'string' && v.length <= (p.maxLength ?? 200)) return v;
      break;
    case 'bool':
      if (typeof v === 'boolean') return v;
      break;
    case 'select':
      if (typeof v === 'string' && p.options.includes(v)) return v;
      break;
  }
  throw new Error('Invalid parameter: ' + p.name);
}
/** Missing values get defaults; bad or unknown values are errors, never silently coerced. */
export function validateParams(
  specs: readonly ParamSpec[],
  raw: unknown = {},
): Params {
  validateSpecs(specs);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Expected parameter object');
  const input = raw as Record<string, unknown>,
    out: Record<string, Value> = Object.create(null);
  for (const key of Object.keys(input))
    if (!specs.some((p) => p.name === key))
      throw new Error('Unknown parameter: ' + key);
  for (const p of specs)
    out[p.name] = validateValue(
      p,
      Object.hasOwn(input, p.name) ? input[p.name] : p.default,
    );
  return Object.freeze(out);
}
export const defaults = (info: Pick<BlockInfo, 'params'>): Params =>
  validateParams(info.params);
export function validateInfo(info: BlockInfo): void {
  if (
    !safe.test(info.id) ||
    typeof info.version !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(info.version) ||
    typeof info.name !== 'string' ||
    !info.name ||
    info.name.length > 100 ||
    typeof info.category !== 'string' ||
    !info.category ||
    info.category.length > 100 ||
    !Number.isFinite(info.defaultDuration) ||
    info.defaultDuration < 0.1 ||
    info.defaultDuration > 600
  )
    throw new Error('Invalid block metadata');
  validateSpecs(info.params);
  if (
    info.thumbnailTime !== undefined &&
    (!Number.isFinite(info.thumbnailTime) ||
      info.thumbnailTime < 0 ||
      info.thumbnailTime > info.defaultDuration)
  )
    throw new Error('Invalid thumbnail time');
}
