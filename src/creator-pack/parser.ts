export const PACK_BYTES = 4 * 1024 * 1024,
  SOURCE_BYTES = 1024 * 1024;
const bytes = (s: string) => new TextEncoder().encode(s).length;
/** Clone a bounded JSON value without invoking getters or toJSON. */
export function jsonCopy(input: unknown): unknown {
  let nodes = 0;
  const active = new Set<object>();
  function visit(v: unknown, depth: number): unknown {
    if (++nodes > 100000 || depth > 32)
      throw Error('Pack nesting/node limit exceeded.');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v !== 'object' || !v)
      throw Error('Use finite numbers and plain JSON values only.');
    if (active.has(v)) throw Error('Cyclic pack objects are not JSON.');
    if (
      !Array.isArray(v) &&
      Object.getPrototypeOf(v) !== Object.prototype &&
      Object.getPrototypeOf(v) !== null
    )
      throw Error('Use plain JSON objects.');
    active.add(v);
    const out: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(v)) {
      if (Array.isArray(v) && key === 'length') continue;
      if (
        typeof key !== 'string' ||
        ['__proto__', 'constructor', 'prototype'].includes(key)
      )
        throw Error('Unsafe JSON key.');
      const d = Object.getOwnPropertyDescriptor(v, key)!;
      if (!('value' in d) || !d.enumerable)
        throw Error('Accessors/non-enumerable values are not JSON.');
      out[key] = visit(d.value, depth + 1);
    }
    active.delete(v);
    if (Array.isArray(v)) {
      if (
        Object.keys(out).length !== v.length ||
        Object.keys(out).some((k) => !/^\d+$/.test(k) || Number(k) >= v.length)
      )
        throw Error('Use dense JSON arrays.');
      return Array.from({ length: v.length }, (_, i) => out[String(i)]);
    }
    return out;
  }
  const value = visit(input, 0);
  if (bytes(JSON.stringify(value)) > PACK_BYTES)
    throw Error('Pack exceeds 4 MiB UTF-8.');
  return value;
}
export function parsePack(input: unknown): unknown {
  if (typeof input !== 'string') return jsonCopy(input);
  if (bytes(input) > PACK_BYTES) throw Error('Pack exceeds 4 MiB UTF-8.');
  const text = input.replace(/^\uFEFF/, '');
  if (!text.trimStart().startsWith('=== PACK ==='))
    return jsonCopy(JSON.parse(text));
  const lines = text.split(/\r?\n/),
    sections = new Map<string, string[]>();
  const manifest: string[] = [];
  let name: string | undefined,
    started = false,
    ended = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!started && !line.trim()) continue;
    if (!started && line === '=== PACK ===') {
      started = true;
      continue;
    }
    if (ended) {
      if (line.trim()) throw Error(`Line ${i + 1}: content after END.`);
      continue;
    }
    if (line === '=== END ===') {
      ended = true;
      continue;
    }
    const m = /^=== SOURCE ([a-zA-Z][\w-]{0,63}) ===$/.exec(line);
    if (m) {
      name = m[1]!;
      if (sections.has(name))
        throw Error(`Line ${i + 1}: duplicate source ${name}.`);
      sections.set(name, []);
      continue;
    }
    if (line.startsWith('==='))
      throw Error(`Line ${i + 1}: unknown section marker.`);
    (name ? sections.get(name)! : manifest).push(line);
  }
  if (!ended) throw Error('Missing === END ===.');
  const sources = new Map<string, string>();
  for (const [key, rows] of sections) {
    const source = rows.join('\n');
    if (bytes(source) > SOURCE_BYTES)
      throw Error(`Source ${key} exceeds 1 MiB UTF-8.`);
    sources.set(key, source);
  }
  const used = new Set<string>();
  function expand(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(expand);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if ('$ref' in o) {
        if (Object.keys(o).length !== 1 || typeof o.$ref !== 'string')
          throw Error('Use an exact {"$ref":"name"} reference.');
        if (!sources.has(o.$ref)) throw Error(`Unknown source ${o.$ref}.`);
        used.add(o.$ref);
        return sources.get(o.$ref)!;
      }
      return Object.fromEntries(
        Object.entries(o).map(([k, x]) => [k, expand(x)]),
      );
    }
    return v;
  }
  const value = expand(jsonCopy(JSON.parse(manifest.join('\n'))));
  for (const key of sources.keys())
    if (!used.has(key)) throw Error(`Unused source ${key}.`);
  return jsonCopy(value);
}
