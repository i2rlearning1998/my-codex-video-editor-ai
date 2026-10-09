import { expect, it } from 'vitest';
import { getTransition, transitions, surface } from '../../src/fx';
const ctx = { time: 1, duration: 4, seed: 42, width: 40, height: 30 };
function solid(v: number, alpha = 255) {
  const s = surface(40, 30);
  for (let i = 0; i < s.data.length; i += 4) s.data.set([v, v, v, alpha], i);
  return s;
}
it('F4 fade-through-black Burn reaches black at midpoint', () => {
  const a = solid(180),
    b = solid(240),
    d = solid(0);
  getTransition('transition.burn')!.apply(a, b, d, 0.5, {}, ctx);
  for (let i = 0; i < d.data.length; i += 4) {
    expect(d.data[i]).toBe(0);
    expect(d.data[i + 1]).toBe(0);
    expect(d.data[i + 2]).toBe(0);
    expect(d.data[i + 3]).toBe(255);
  }
});
for (const def of transitions.filter((x) => x.category === 'Wipes'))
  it(
    'F4 ' + def.id + ' covered fraction grows monotonically in both directions',
    () => {
      const a = solid(0),
        b = solid(255),
        d = solid(0);
      for (const direction of ['forward', 'reverse']) {
        let prev = -1;
        for (let step = 0; step <= 20; step++) {
          def.apply(a, b, d, step / 20, { direction }, ctx);
          let coverage = 0;
          for (let i = 0; i < d.data.length; i += 4)
            coverage += d.data[i]! / 255;
          expect(coverage).toBeGreaterThanOrEqual(prev);
          prev = coverage;
        }
        expect(prev).toBe(1200);
      }
    },
  );
it('F4 transitions ignore duration/time and preserve premultiplied mixing', () => {
  const a = solid(255, 0),
    b = solid(30),
    d = solid(0),
    e = solid(0);
  for (const def of transitions) {
    def.apply(a, b, d, 0.4, {}, ctx);
    def.apply(a, b, e, 0.4, {}, { ...ctx, time: 100, duration: 200 });
    expect(e.data).toEqual(d.data);
  }
  getTransition('transition.soft-wipe-right')!.apply(
    a,
    b,
    d,
    0.5,
    { softness: 0.5 },
    ctx,
  );
  for (let i = 0; i < d.data.length; i += 4)
    if (d.data[i + 3]! > 0) expect(d.data[i]).toBe(30);
});
it('F4 push moves edges by progress and excluded layer transitions are absent', () => {
  const a = solid(0),
    b = solid(255),
    d = solid(0);
  for (const direction of ['left', 'right', 'up', 'down']) {
    getTransition('transition.push')!.apply(a, b, d, 0.5, { direction }, ctx);
    let count = 0;
    for (let i = 0; i < d.data.length; i += 4) if (d.data[i] === 255) count++;
    expect(count).toBe(600);
  }
  for (const id of [
    'crossfade',
    'fade-black',
    'fade-white',
    'wipe-left',
    'wipe-right',
    'slide-left',
    'slide-right',
  ])
    expect(getTransition('transition.' + id)).toBeUndefined();
});
