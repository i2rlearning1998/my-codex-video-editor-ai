import { expect, it } from 'vitest';
import { surface, random, getEffect, clearEffectCaches } from '../../src/fx';
import { blur, transform } from '../../src/fx/spatial';
it('FX optimized blur matches a slow premultiplied box reference for opaque and translucent inputs', () => {
  for (const opaque of [true, false]) {
    const s = surface(7, 5),
      d = surface(7, 5),
      rng = random(42);
    for (let i = 0; i < s.data.length; i++) s.data[i] = rng() * 256;
    if (opaque) for (let i = 3; i < s.data.length; i += 4) s.data[i] = 255;
    blur(s, d, 2, false);
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 7; x++) {
        let r = 0,
          g = 0,
          b = 0,
          a = 0;
        for (let yy = -2; yy <= 2; yy++)
          for (let xx = -2; xx <= 2; xx++) {
            const j =
                (Math.max(0, Math.min(4, y + yy)) * 7 +
                  Math.max(0, Math.min(6, x + xx))) *
                4,
              alpha = s.data[j + 3]!;
            r += s.data[j]! * alpha;
            g += s.data[j + 1]! * alpha;
            b += s.data[j + 2]! * alpha;
            a += alpha;
          }
        const i = (y * 7 + x) * 4;
        for (const [channel, value] of [
          [0, a ? r / a : 0],
          [1, a ? g / a : 0],
          [2, a ? b / a : 0],
          [3, a / 25],
        ])
          expect(Math.abs(d.data[i + channel!]! - value!)).toBeLessThanOrEqual(
            0.51,
          );
      }
  }
});
it('FX packed spatial path matches unaligned byte path exactly', () => {
  const s = surface(7, 5),
    d = surface(7, 5),
    rng = random(42);
  for (let i = 0; i < s.data.length; i++) s.data[i] = rng() * 256;
  const bytes = new Uint8ClampedArray(s.data.length + 1);
  bytes.set(s.data, 1);
  const unaligned = { width: 7, height: 5, data: bytes.subarray(1) },
    other = surface(7, 5);
  for (const angle of [0, 0.3, Math.PI / 2]) {
    transform(s, d, angle, 1.3);
    transform(unaligned, other, angle, 1.3);
    expect(other.data).toEqual(d.data);
  }
});
it('FX bounded kaleidoscope cache cannot change bytes after eviction or clear', () => {
  const s = surface(19, 13),
    d = surface(19, 13),
    e = surface(19, 13),
    ctx = { time: 0, duration: 4, seed: 2, width: 19, height: 13 },
    rng = random(4);
  for (let i = 0; i < s.data.length; i++) s.data[i] = rng() * 256;
  const def = getEffect('effect.kaleidoscope')!;
  def.apply(s, d, { segments: 6 }, ctx);
  def.apply(s, e, { segments: 10 }, ctx);
  def.apply(s, e, { segments: 6 }, ctx);
  expect(e.data).toEqual(d.data);
  clearEffectCaches();
  def.apply(s, e, { segments: 6 }, ctx);
  expect(e.data).toEqual(d.data);
});
