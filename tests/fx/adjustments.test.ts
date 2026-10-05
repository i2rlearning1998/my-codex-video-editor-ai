import { expect, it } from 'vitest';
import {
  adjustments,
  adjustmentDefaults,
  blendModes,
  fadeAlpha,
  surface,
  renderStack,
} from '../../src/fx';
const ctx = { time: 0, duration: 4, seed: 1, width: 2, height: 1 };
it('F1 all neutral controls are byte identity and defaults reset a stack', () => {
  const s = surface(2, 1);
  s.data.set([64, 128, 192, 100, 240, 10, 37, 0]);
  for (const d of adjustments) {
    const out = surface(2, 1);
    d.apply(s, out, { amount: 0 }, ctx);
    expect(out.data).toEqual(s.data);
  }
  expect(renderStack(s, adjustmentDefaults, ctx).data).toEqual(s.data);
});
it('F1 exposure, saturation, temperature and transparency have meaningful extremes', () => {
  const s = surface(2, 1);
  s.data.set([32, 64, 96, 100, 64, 64, 64, 0]);
  const d = surface(2, 1);
  adjustments[0].apply(s, d, { amount: 0.5 }, ctx);
  expect([...d.data.slice(0, 3)]).toEqual([64, 128, 192]);
  adjustments[2].apply(s, d, { amount: -1 }, ctx);
  expect(d.data[0]).toBe(d.data[1]);
  expect(d.data[1]).toBe(d.data[2]);
  adjustments[3].apply(s, d, { amount: 1 }, ctx);
  expect(d.data[0]).toBeGreaterThan(s.data[0]!);
  expect(d.data[2]).toBeLessThan(s.data[2]!);
  adjustments[4].apply(s, d, { amount: -1 }, ctx);
  expect(d.data[3]).toBe(0);
  adjustments[4].apply(s, d, { amount: 1 }, ctx);
  expect(d.data[3]).toBe(255);
  expect(d.data[7]).toBe(0);
});
it('F1 fades cap separately at half duration and blend metadata is complete', () => {
  expect(fadeAlpha(2, 4, 99, 99)).toBe(1);
  expect(fadeAlpha(1, 4, 99, 99)).toBe(0.5);
  expect(fadeAlpha(3, 4, 99, 99)).toBe(0.5);
  expect(fadeAlpha(0, 4, 0, 0)).toBe(1);
  expect(fadeAlpha(4, 4, 0, 1)).toBe(0);
  expect(fadeAlpha(0, 0, 1, 1)).toBe(0);
  expect(() => fadeAlpha(NaN, 4, 0, 0)).toThrow();
  expect(blendModes).toHaveLength(16);
  expect(blendModes[0]!.operation).toBe('source-over');
});
