import { expect, it } from 'vitest';
import {
  clamp,
  lerp,
  map,
  rngFor,
  ease,
  spring,
  validateParams,
  defineBlock,
} from '../../src/blocks';
import { easeProgress } from '../../src/core/animation';
import { recording } from './recording';
it('B0 indexed randomness is order independent and bounded', () => {
  const a = rngFor(4, 10);
  rngFor(5, 1);
  expect(rngFor(4, 10)).toBe(a);
  expect(a).not.toBe(rngFor(4, 11));
  for (let i = 0; i < 100; i++) expect(rngFor(-4, i)).toBeGreaterThanOrEqual(0);
});
it('B0 easing agrees with the existing core curves and spring is closed form', () => {
  for (const name of [
    'linear',
    'ease-in',
    'ease-out',
    'ease-in-out',
    'hold',
  ] as const)
    for (const t of [0, 0.1, 0.5, 0.9])
      expect(ease(name, t)).toBeCloseTo(easeProgress(name, t), 9);
  expect(spring(0)).toBe(0);
  expect(spring(4)).toBeCloseTo(1, 6);
  expect(spring(0.2)).toBe(spring(0.2));
  expect(() => spring(1, 0)).toThrow();
  expect(clamp(2)).toBe(1);
  expect(lerp(10, 20, 0.4)).toBe(14);
  expect(map(5, 0, 10, 0, 100)).toBe(50);
  expect(() => map(1, 0, 0, 0, 1)).toThrow();
});
it('B0 parameters fill defaults and reject invalid types, bounds and keys', () => {
  const specs = [
    {
      name: 'amount',
      label: 'Amount',
      type: 'number' as const,
      min: 0,
      max: 10,
      step: 0.1,
      default: 2,
    },
    {
      name: 'color',
      label: 'Colour',
      type: 'color' as const,
      default: '#ffffff',
    },
    {
      name: 'label',
      label: 'Text',
      type: 'text' as const,
      default: 'Hello',
      maxLength: 10,
    },
    { name: 'on', label: 'On', type: 'bool' as const, default: true },
    {
      name: 'mode',
      label: 'Mode',
      type: 'select' as const,
      default: 'a',
      options: ['a', 'b'],
    },
  ];
  expect(validateParams(specs).amount).toBe(2);
  for (const raw of [
    { amount: NaN },
    { amount: 11 },
    { color: 'red' },
    { label: 'x'.repeat(11) },
    { on: 1 },
    { mode: 'c' },
    { extra: 1 },
  ])
    expect(() => validateParams(specs, raw)).toThrow();
  expect(() => validateParams([...specs, specs[0]!])).toThrow();
});
it('B0 frame wrapper clears/clips and balances state on success and error', () => {
  const info = {
    id: 'test',
    version: '1.0.0',
    name: 'Test',
    category: 'Test',
    defaultDuration: 4,
    params: [],
  };
  const b = defineBlock(info, (ctx, t) => ctx.fillRect(t, 0, 10, 10)),
    r = recording();
  b.render(r.ctx, 3, { width: 100, height: 100 }, {}, 1);
  const a = JSON.stringify(r.log);
  const other = recording();
  b.render(other.ctx, 1, { width: 100, height: 100 }, {}, 1);
  const again = recording();
  b.render(again.ctx, 3, { width: 100, height: 100 }, {}, 1);
  expect(JSON.stringify(again.log)).toBe(a);
  expect(r.depth).toBe(0);
  expect(r.log).toContainEqual(['clip']);
  const bad = defineBlock(info, () => {
    throw new Error('draw failed');
  });
  expect(() =>
    bad.render(r.ctx, 0, { width: 100, height: 100 }, {}, 1),
  ).toThrow('draw failed');
  expect(r.depth).toBe(0);
});
it('BLK-1 preserves inherited canvas dimensions when copying the size contract', () => {
  const size = Object.create({ width: 960, height: 540 }) as {
    width: number;
    height: number;
  };
  let observed: unknown;
  const block = defineBlock(
    {
      id: 'canvas-size',
      version: '1.0.0',
      name: 'Canvas size',
      category: 'Test',
      defaultDuration: 4,
      params: [],
    },
    (_ctx, _t, received) => {
      observed = received;
    },
  );
  block.render(recording().ctx, 0, size, {}, 7);
  expect(observed).toEqual({ width: 960, height: 540 });
});
