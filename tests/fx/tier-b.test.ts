import { expect, it } from 'vitest';
import {
  getEffect,
  getTransition,
  surface,
  effects,
  transitions,
} from '../../src/fx';
it('F5 all tier B entries exist and keying removes selected colours only', () => {
  expect(effects).toHaveLength(28);
  expect(transitions).toHaveLength(21);
  const a = surface(4, 1),
    d = surface(4, 1),
    ctx = { time: 1, duration: 4, seed: 2, width: 4, height: 1 };
  a.data.set([
    0, 255, 0, 255, 200, 30, 20, 128, 0, 0, 0, 255, 255, 255, 255, 255,
  ]);
  getEffect('effect.green-screen')!.apply(a, d, {}, ctx);
  expect(d.data[3]).toBe(0);
  expect(d.data[7]).toBe(128);
  getEffect('effect.black-white-removal')!.apply(a, d, {}, ctx);
  expect(d.data[11]).toBe(0);
  expect(d.data[15]).toBe(255);
  getEffect('effect.black-white-removal')!.apply(a, d, { color: 'white' }, ctx);
  expect(d.data[15]).toBe(0);
  expect(d.data[11]).toBe(255);
  getEffect('effect.green-screen')!.apply(
    a,
    d,
    { screen: '#c81e14', threshold: 0 },
    ctx,
  );
  expect(d.data[7]).toBe(0);
});
it('F5 Kaleidoscope mirrors sectors and Comic draws an ink edge', () => {
  const a = surface(31, 31),
    d = surface(31, 31),
    ctx = { time: 1, duration: 4, seed: 2, width: 31, height: 31 };
  for (let y = 0; y < 31; y++)
    for (let x = 0; x < 31; x++)
      a.data.set([x < 15 ? 0 : 255, y * 8, x * 8, 255], (y * 31 + x) * 4);
  getEffect('effect.kaleidoscope')!.apply(a, d, { segments: 4 }, ctx);
  expect([...d.data.slice((15 * 31 + 25) * 4, (15 * 31 + 25) * 4 + 4)]).toEqual(
    [...d.data.slice((25 * 31 + 15) * 4, (25 * 31 + 15) * 4 + 4)],
  );
  getEffect('effect.comic')!.apply(a, d, { edge: 10 }, ctx);
  expect(d.data[(15 * 31 + 14) * 4]).toBe(12);
});
it('F5 Bloom peaks white and page/cube are geometric, not plain dissolves', () => {
  const a = surface(20, 20),
    b = surface(20, 20),
    d = surface(20, 20),
    ctx = { time: 0, duration: 4, seed: 2, width: 20, height: 20 };
  for (let i = 0; i < a.data.length; i += 4) {
    a.data.set([220, 30, 30, 255], i);
    b.data.set([30, 30, 220, 255], i);
  }
  getTransition('transition.bloom')!.apply(a, b, d, 0.5, {}, ctx);
  expect([...d.data.slice(0, 3)]).toEqual([255, 255, 255]);
  for (const id of ['page-turn', 'cube-flip']) {
    getTransition('transition.' + id)!.apply(a, b, d, 0.5, {}, ctx);
    const left = (10 * 20 + 2) * 4,
      right = (10 * 20 + 17) * 4;
    expect(d.data[left]).toBeGreaterThan(d.data[left + 2]!);
    expect(d.data[right + 2]).toBeGreaterThan(d.data[right]!);
  }
});
