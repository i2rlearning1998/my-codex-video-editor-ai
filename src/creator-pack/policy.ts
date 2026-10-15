import { compileBlock } from '../blocks/sandbox/compile';
import type { CreatorItem } from './schemas';
export interface PolicyResult {
  errors: string[];
  warnings: string[];
  needsRuntimeCheck: boolean;
}
const network =
  /\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|sendBeacon|Worker|SharedWorker|localStorage|sessionStorage|indexedDB|eval|Function)\b|\bimport\s*(?:\(|[{'"*])/;
const url =
  /(?:https?|ftp|file|blob|javascript|wss?):\s*|(?:^|[\s"'(=])\/\/[^\s/]|\bwww\./i;
export function checkPolicy(value: unknown): PolicyResult {
  const result: PolicyResult = {
    errors: [],
    warnings: [],
    needsRuntimeCheck: false,
  };
  function walk(v: unknown, path: string, code = false): void {
    if (typeof v === 'string') {
      if (!v.startsWith('data:') && url.test(v))
        result.errors.push(
          `${path}: external URLs are forbidden; use inline data: assets.`,
        );
      if (code) {
        result.needsRuntimeCheck = true;
        if (new TextEncoder().encode(v).length > 1048576)
          result.errors.push(`${path}: source exceeds 1 MiB.`);
        const found = network.exec(v);
        if (found)
          result.errors.push(
            `${path}, line ${v.slice(0, found.index).split('\n').length}: ${found[0]} is forbidden in pack code.`,
          );
        if (/\bwhile\s*\(\s*(?:true|1)\s*\)|\bfor\s*\(\s*;\s*;/.test(v))
          result.errors.push(
            `${path}: obvious infinite loop; use a bounded loop.`,
          );
      }
    } else if (Array.isArray(v))
      v.forEach((x, i) => walk(x, `${path}/${i}`, code));
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.en === 'string' && (!o.hi || o.hi === o.en))
        result.warnings.push(
          `${path}/hi: supply a distinct Hindi name; English fallback used.`,
        );
      for (const [k, x] of Object.entries(o))
        walk(x, `${path}/${k}`, k === 'source');
    }
  }
  walk(value, '');
  return result;
}
export function checkMotion(
  item: Extract<CreatorItem, { type: 'motion' }>,
): void {
  if (item.data.tier === 'C') {
    if (
      !/\binit\s*\(/.test(item.data.source) ||
      !/\brenderFrame\s*\(/.test(item.data.source)
    )
      throw Error(
        'Tier C source must declare init and renderFrame; runtime validation is still required.',
      );
    if (item.data.meta.duration === undefined)
      throw Error('Tier C meta.duration is required.');
    return;
  }
  const result = compileBlock(item.data.source);
  if (!result.ok) throw Error(result.error);
  const info = result.value.info,
    meta = item.data.meta;
  if (meta.defaultDuration === undefined)
    throw Error('Tier B meta.defaultDuration is required.');
  const projected = meta.params.map((p) => {
    const {
      group: _group,
      help: _help,
      unit: _unit,
      ...rest
    } = p as typeof p & { unit?: string };
    return { ...rest, label: p.label.en };
  });
  const same = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object')
      return false;
    const x = a as Record<string, unknown>,
      y = b as Record<string, unknown>;
    return (
      Object.keys(x).length === Object.keys(y).length &&
      Object.keys(x).every((k) => Object.hasOwn(y, k) && same(x[k], y[k]))
    );
  };
  if (
    info.id !== meta.id ||
    info.version !== meta.version ||
    info.name !== (typeof meta.name === 'string' ? meta.name : meta.name.en) ||
    info.category !== meta.category ||
    info.defaultDuration !== meta.defaultDuration ||
    !same(info.params, projected)
  )
    throw Error(
      'Tier B source metadata differs from data.meta; keep both declarations identical (English labels in source).',
    );
}
export function checkFxCode(source: string): void {
  for (const field of ['apply', 'id', 'name', 'category', 'params', 'alpha'])
    if (!new RegExp('\\b' + field + '\\b').test(source))
      throw Error(`FX code contract: missing ${field}.`);
  if (/\b(document|window|HTMLElement|OffscreenCanvas)\b/.test(source))
    throw Error(
      'FX pixel code cannot use DOM/canvas globals; operate on supplied RGBA arrays.',
    );
}
