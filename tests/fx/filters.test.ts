import { expect, it } from 'vitest';
import { filters, getFilter, surface } from '../../src/fx';
const ctx = { time: 1, duration: 4, seed: 4, width: 32, height: 8 };
it('F2 has every requested grade, unique IDs and original differentiated output', () => {
  expect(filters).toHaveLength(47);
  expect(new Set(filters.map((x) => x.id)).size).toBe(47);
  const s = surface(32, 8);
  for (let i = 0; i < s.data.length; i += 4)
    s.data.set(
      [(i * 3) % 256, (i * 7 + 30) % 256, (i * 13 + 110) % 256, 255],
      i,
    );
  const signatures = new Set<string>();
  for (const def of filters) {
    const d = surface(32, 8);
    def.apply(s, d, {}, ctx);
    signatures.add([...d.data].join(','));
  }
  expect(signatures.size).toBe(47);
});
it('F2 all B&W variants have exactly zero saturation; white/black overlays brighten/darken', () => {
  const s = surface(32, 8);
  for (let i = 0; i < s.data.length; i += 4) s.data.set([30, 160, 220, 180], i);
  for (const id of ['black-white', 'soft-bw', 'muted-bw']) {
    const d = surface(32, 8);
    getFilter('filter.' + id)!.apply(s, d, {}, ctx);
    for (let i = 0; i < d.data.length; i += 4) {
      expect(d.data[i]).toBe(d.data[i + 1]);
      expect(d.data[i + 1]).toBe(d.data[i + 2]);
    }
  }
  const d = surface(32, 8);
  getFilter('filter.overlay-white')!.apply(s, d, {}, ctx);
  expect(d.data[0]).toBeGreaterThan(30);
  getFilter('filter.overlay-black')!.apply(s, d, {}, ctx);
  expect(d.data[0]).toBeLessThan(30);
});
it('F2 intensity interpolates toward the source and grain follows seed/time', () => {
  const s = surface(32, 8);
  s.data.fill(128);
  const a = surface(32, 8),
    b = surface(32, 8),
    d = surface(32, 8);
  const def = getFilter('filter.35mm')!;
  def.apply(s, a, {}, ctx);
  def.apply(s, b, { intensity: 0.5 }, ctx);
  for (let i = 0; i < s.data.length; i += 4)
    expect(
      Math.abs(b.data[i]! - (s.data[i]! + a.data[i]!) / 2),
    ).toBeLessThanOrEqual(0.5);
  def.apply(s, d, {}, { ...ctx, seed: 5 });
  expect(d.data).not.toEqual(a.data);
});
