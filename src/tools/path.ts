// ROUND-C1 C1.1: plain path expressions into JSON (no code). `a.b[0].c`,
// with `|` separating alternatives (the first non-empty value wins).
const SEGMENT = /^([A-Za-z0-9_$-]+)((?:\[\d{1,3}\])*)$/;

function one(value: unknown, path: string): unknown {
  let node: unknown = value;
  for (const part of path.split('.')) {
    const m = SEGMENT.exec(part);
    if (!m) return undefined;
    if (!node || typeof node !== 'object') return undefined;
    const key = m[1]!;
    if (key === '__proto__' || key === 'constructor' || key === 'prototype')
      return undefined;
    node = Object.hasOwn(node, key)
      ? (node as Record<string, unknown>)[key]
      : undefined;
    for (const index of m[2]!.match(/\d+/g) ?? []) {
      if (!Array.isArray(node)) return undefined;
      node = node[Number(index)];
    }
  }
  return node;
}

/** The value at `expr`, or undefined. */
export function readPath(value: unknown, expr: string | undefined): unknown {
  if (!expr) return undefined;
  for (const alt of expr.split('|')) {
    const got = one(value, alt.trim());
    if (got !== undefined && got !== null && got !== '') return got;
  }
  return undefined;
}
export const readString = (
  value: unknown,
  expr: string | undefined,
  max = 500,
): string => {
  const got = readPath(value, expr);
  if (typeof got === 'string') return got.slice(0, max);
  if (typeof got === 'number' && Number.isFinite(got)) return String(got);
  if (Array.isArray(got))
    return got
      .filter((x) => typeof x === 'string')
      .join(', ')
      .slice(0, max);
  return '';
};
export const readNumber = (
  value: unknown,
  expr: string | undefined,
): number => {
  const got = readPath(value, expr);
  const n = typeof got === 'string' ? Number(got) : got;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0;
};
