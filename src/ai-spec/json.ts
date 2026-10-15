import { LIMITS } from './schema';
export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
/** Reject non-JSON objects/accessors before Zod reads them. Never invoke getters. */
export function assertBoundedJson(input: unknown): asserts input is Json {
  const seen = new Set<object>();
  let nodes = 0,
    characters = 0;
  const visit = (v: unknown, depth: number): void => {
    if (++nodes > LIMITS.nodes || depth > LIMITS.depth)
      throw Error('Document exceeds node/depth limit');
    if (typeof v === 'string') {
      characters += v.length;
      if (characters > LIMITS.bytes) throw Error('Document exceeds size limit');
      return;
    }
    if (v === null || typeof v === 'boolean') return;
    if (typeof v === 'number' && Number.isFinite(v)) return;
    if (!v || typeof v !== 'object')
      throw Error('Only finite plain JSON values are allowed');
    if (seen.has(v)) throw Error('Cyclic object references are not JSON');
    seen.add(v);
    if (
      !Array.isArray(v) &&
      Object.getPrototypeOf(v) !== Object.prototype &&
      Object.getPrototypeOf(v) !== null
    )
      throw Error('Only plain JSON objects are allowed');
    if (Object.getOwnPropertySymbols(v).length)
      throw Error('Symbol keys are not JSON');
    const descriptors = Object.getOwnPropertyDescriptors(v);
    if (Array.isArray(v) && v.length > LIMITS.nodes)
      throw Error('Array exceeds node limit');
    for (const [key, entry] of Object.entries(descriptors)) {
      if (Array.isArray(v) && key === 'length') continue;
      if (
        Array.isArray(v) &&
        (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= v.length)
      )
        throw Error('Array properties are not JSON');
      if (!entry.enumerable || !('value' in entry))
        throw Error('Accessors and hidden fields are not JSON');
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        throw Error('Reserved JSON key: ' + key);
      characters += key.length;
      if (characters > LIMITS.bytes) throw Error('Document exceeds size limit');
      visit(entry.value, depth + 1);
    }
    if (Array.isArray(v) && Object.keys(v).length !== v.length)
      throw Error('Sparse arrays are not JSON');
    seen.delete(v);
  };
  visit(input, 0);
  if (new TextEncoder().encode(JSON.stringify(input)).length > LIMITS.bytes)
    throw Error('Document exceeds 1 MiB UTF-8 limit');
}
export function canonicalJson(value: unknown): string {
  assertBoundedJson(value);
  const sort = (v: Json): Json =>
    Array.isArray(v)
      ? v.map(sort)
      : v !== null && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort(v[k]!)]),
          )
        : v;
  return JSON.stringify(sort(value));
}
export function frozen<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) frozen(v);
    Object.freeze(value);
  }
  return value;
}
