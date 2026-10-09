import { expect, it } from 'vitest';
import { getEffect, surface } from '../../src/fx';
import { blur } from '../../src/fx/spatial';
function checker() {
  const s = surface(64, 64);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++)
      s.data.set(
        [((x + y) % 2) * 255, ((x + y) % 2) * 255, ((x + y) % 2) * 255, 255],
        (y * 64 + x) * 4,
      );
  return s;
}
function energy(s: ReturnType<typeof surface>) {
  let v = 0;
  for (let y = 0; y < s.height; y++)
    for (let x = 1; x < s.width; x++) {
      const i = (y * s.width + x) * 4;
      v += Math.abs(s.data[i]! - s.data[i - 4]!);
    }
  return v;
}
const ctx = { time: 2, duration: 4, seed: 10, width: 64, height: 64 };
it('F3 blur lowers high-frequency energy and ignores hidden RGB', () => {
  const s = checker(),
    d = surface(64, 64);
  getEffect('effect.blur')!.apply(s, d, { radius: 32 }, ctx);
  expect(energy(d)).toBeLessThan(energy(s) * 0.1);
  const a = surface(3, 1),
    b = surface(3, 1);
  a.data.set([255, 0, 0, 0, 0, 0, 255, 255, 255, 0, 0, 0]);
  blur(a, b, 1);
  expect([...b.data.slice(4, 8)]).toEqual([0, 0, 255, 255]);
});
it('F3 Flash raises mean luminance, Glow adds highlights and rotation moves alpha', () => {
  const s = checker(),
    d = surface(64, 64);
  getEffect('effect.flash')!.apply(s, d, {}, ctx);
  expect(d.data[0]).toBe(255);
  expect(d.data[4]).toBe(255);
  getEffect('effect.glow')!.apply(s, d, { radius: 32 }, ctx);
  expect(d.data[0]).toBeGreaterThan(0);
  getEffect('effect.rotate')!.apply(s, d, { angle: 45 }, ctx);
  expect(d.data[3]).toBe(0);
  expect(d.data[(32 * 64 + 32) * 4 + 3]).toBe(255);
});
it('F3 seeded random zoom changes with seed and RGB565 really quantizes', () => {
  const s = checker(),
    a = surface(64, 64),
    b = surface(64, 64);
  getEffect('effect.slow-zoom-random')!.apply(s, a, {}, ctx);
  getEffect('effect.slow-zoom-random')!.apply(s, b, {}, { ...ctx, seed: 20 });
  expect(a.data).not.toEqual(b.data);
  for (let i = 0; i < s.data.length; i += 4)
    s.data.set([117, 131, 177, 255], i);
  getEffect('effect.pixelation')!.apply(s, a, { palette16: true }, ctx);
  expect(a.data[0]).toBe(Math.round((Math.round((117 / 255) * 31) / 31) * 255));
  expect(a.data[1]).toBe(Math.round((Math.round((131 / 255) * 63) / 63) * 255));
});
it('F3 motion stops at clip end unless loop requested', () => {
  const s = checker(),
    a = surface(64, 64),
    b = surface(64, 64);
  const def = getEffect('effect.slow-zoom')!;
  def.apply(s, a, {}, { ...ctx, time: 4 });
  def.apply(s, b, {}, { ...ctx, time: 8 });
  expect(a.data).toEqual(b.data);
  def.apply(s, b, { loop: true }, { ...ctx, time: 8 });
  expect(b.data).toEqual(s.data);
});
