import { describe, expect, it } from 'vitest';
import {
  adjustments,
  effects,
  filters,
  transitions,
  surface,
  renderStack,
  renderThumbnail,
  random,
} from '../../src/fx';
export function fixture(w = 19, h = 13) {
  const s = surface(w, h),
    rng = random(33);
  for (let i = 0; i < s.data.length; i++) s.data[i] = rng() * 256;
  return s;
}
const ctx = { time: 1.3, duration: 4, seed: 23, width: 19, height: 13 };
describe('FX library item contract', () => {
  for (const def of [...adjustments, ...effects, ...filters, ...transitions]) {
    it(
      def.id +
        ' identity, deterministic bytes, alpha, dimensions and immutable input',
      () => {
        const a = fixture(),
          b = fixture(),
          before = a.data.slice(),
          bb = b.data.slice(),
          d = surface(19, 13),
          e = surface(19, 13);
        if (def.kind === 'transition') {
          def.apply(a, b, d, 0, {}, ctx);
          expect(d.data).toEqual(a.data);
          def.apply(a, b, d, 1, {}, ctx);
          expect(d.data).toEqual(b.data);
          def.apply(a, b, d, 0.43, {}, ctx);
          def.apply(a, b, e, 0.43, {}, ctx);
        } else {
          def.apply(a, d, { intensity: 0 }, ctx);
          expect(d.data).toEqual(a.data);
          def.apply(a, d, {}, ctx);
          def.apply(a, e, {}, ctx);
          if (def.alpha === 'preserve')
            for (let i = 3; i < d.data.length; i += 4)
              expect(d.data[i]).toBe(a.data[i]);
        }
        expect(d.data).toEqual(e.data);
        expect(d.data.every(Number.isFinite)).toBe(true);
        expect(d.data.length).toBe(a.data.length);
        expect(a.data).toEqual(before);
        expect(b.data).toEqual(bb);
        expect(renderThumbnail(def, a, 8, 5).data.length).toBe(160);
      },
    );
  }
  it('rejects aliasing and malformed surfaces; empty stack owns its result', () => {
    const a = fixture();
    expect(() => filters[0]!.apply(a, a, {}, ctx)).toThrow();
    expect(() => surface(0, 1)).toThrow();
    const out = renderStack(a, [], ctx);
    expect(out.data).toEqual(a.data);
    expect(out.data).not.toBe(a.data);
    expect(() =>
      renderStack(a, [{ id: 'missing', params: {} }], ctx),
    ).toThrow();
  });
});
