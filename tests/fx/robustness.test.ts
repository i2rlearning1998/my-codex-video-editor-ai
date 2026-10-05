import { expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  adjustments,
  effects,
  filters,
  transitions,
  surface,
  random,
  renderStack,
} from '../../src/fx';
import type { Surface } from '../../src/fx';
// Typed arrays silently coerce NaN to 0. Trap numerical writes BEFORE conversion.
function guarded(w: number, h: number): Surface {
  const d = surface(w, h);
  const data = new Proxy(d.data, {
    get(t, k) {
      const v = Reflect.get(t, k, t);
      return typeof v === 'function' ? v.bind(t) : v;
    },
    set(t, k, v) {
      if (typeof k === 'string' && /^\d+$/.test(k))
        expect(
          Number.isFinite(v),
          'non-finite channel before Uint8 conversion',
        ).toBe(true);
      return Reflect.set(t, k, v, t);
    },
  });
  return { width: w, height: h, data };
}
for (const def of [...adjustments, ...effects, ...filters, ...transitions])
  it(
    'F5 ' +
      def.id +
      ' finite internal writes at parameter limits and tiny dimensions',
    () => {
      for (const [w, h] of [
        [1, 1],
        [1, 7],
        [8, 1],
        [8, 7],
      ]) {
        const a = surface(w!, h!),
          b = surface(w!, h!),
          rng = random(99),
          ctx = { time: 1.7, duration: 0, seed: -7, width: w!, height: h! };
        for (let i = 0; i < a.data.length; i++) {
          a.data[i] = rng() * 256;
          b.data[i] = rng() * 256;
        }
        const before = a.data.slice(),
          bb = b.data.slice();
        for (const extreme of ['min', 'max', 'invalid'] as const) {
          const params: Record<string, number | boolean | string> = {};
          for (const p of def.params)
            params[p.name] =
              p.type === 'number'
                ? extreme === 'invalid'
                  ? NaN
                  : p[extreme]
                : p.default;
          if (def.kind !== 'transition') params['intensity'] = 1;
          const d = guarded(w!, h!);
          if (def.kind === 'transition') def.apply(a, b, d, 0.5, params, ctx);
          else def.apply(a, d, params, ctx);
          expect(a.data).toEqual(before);
          expect(b.data).toEqual(bb);
        }
      }
    },
  );
it('F5 buffer overlap and invalid contexts are rejected, stack order is real', () => {
  const array = new Uint8ClampedArray(12),
    a = { width: 2, height: 1, data: array.subarray(0, 8) },
    d = { width: 2, height: 1, data: array.subarray(4, 12) },
    ctx = { width: 2, height: 1, time: 1, duration: 4, seed: 1 };
  expect(() => filters[0]!.apply(a, d, {}, ctx)).toThrow(/overlap/);
  const s = surface(2, 1),
    out = surface(2, 1);
  expect(() => filters[0]!.apply(s, out, {}, { ...ctx, seed: 0.2 })).toThrow();
  expect(() =>
    filters[0]!.apply(s, out, {}, { ...ctx, time: 1e308 }),
  ).toThrow();
  s.data.set([50, 100, 150, 255, 100, 120, 180, 255]);
  const x = { id: 'adjust.exposure', params: { amount: 0.5 } },
    y = { id: 'filter.overlay-black', params: {} };
  const first = renderStack(s, [x, y], ctx),
    second = renderStack(s, [y, x], ctx);
  expect(first.data).not.toEqual(second.data);
});
it('F5 source boundary is self contained with no runtime randomness or browser globals', () => {
  function visit(dir: string) {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, f.name);
      if (f.isDirectory()) visit(p);
      else if (p.endsWith('.ts')) {
        const text = readFileSync(p, 'utf8');
        expect(text).not.toMatch(
          /\b(?:Math\.random|Date|document|window|ImageData|OffscreenCanvas)\b/,
        );
        for (const m of text.matchAll(/from\s+['"]([^'"]+)/g))
          expect(m[1]).toMatch(/^\.\//);
      }
    }
  }
  visit('src/fx');
});
