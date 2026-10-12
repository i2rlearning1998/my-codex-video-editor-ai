import { expect, it } from 'vitest';
import { helpers, rng } from '../../src/freecode/helpers';
import { ease } from '../../src/blocks/helpers';
it('matches existing CSS curves and seeded generators', () => {
  const a = rng(7),
    b = rng(7);
  expect(Array.from({ length: 20 }, a)).toEqual(Array.from({ length: 20 }, b));
  for (const name of ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'hold'])
    for (const t of [0, 0.2, 0.7, 1])
      expect(helpers.ease(name, t)).toBe(ease(name, t));
  for (const fn of [helpers.valueNoise, helpers.simplexNoise])
    expect(fn(42, 1.3, -2.7)).toBe(fn(42, 1.3, -2.7));
  expect(helpers.emitter(7, 3, { x: 0, y: 0 })).toEqual(
    helpers.emitter(7, 3, { x: 0, y: 0 }),
  );
  expect(helpers.vec.normalize({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
  expect(helpers.hex('#abcdef80').a).toBe(128 / 255);
});
