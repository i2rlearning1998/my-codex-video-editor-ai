import { expect, test } from 'vitest';
import { effects, filters, isTimeStatic } from '../../src/fx';

// PHASE 0 E2: which stack items are the same at any time (cacheable by pixels).
test('[FX5-013] blur, glow and the colour filters are time-static; motion effects are not', () => {
  expect(isTimeStatic('effect.blur')).toBe(true);
  expect(isTimeStatic('effect.glow')).toBe(true);
  // Colour filters never change over time (the two with film grain do).
  const grained = filters.filter((filter) => !isTimeStatic(filter.id));
  expect(grained.map((filter) => filter.id).sort()).toEqual([
    'filter.35mm',
    'filter.old-western',
  ]);
  expect(isTimeStatic('effect.vhs')).toBe(false);
  expect(isTimeStatic('effect.flash')).toBe(false);
  expect(isTimeStatic('nope')).toBe(false);
  const moving = effects.filter((effect) => !isTimeStatic(effect.id));
  expect(moving.length).toBeGreaterThan(5);
});
