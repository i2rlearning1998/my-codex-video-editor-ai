import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { blocks, defaults, particleBurst } from '../../src/blocks';
import { recording } from './recording';
for (const block of blocks)
  it(
    'B1 ' + block.id + ' is deterministic, scrub-safe, balanced and immutable',
    () => {
      const size = Object.freeze({ width: 1280, height: 720 }),
        p = defaults(block);
      const run = (t: number) => {
        const r = recording();
        block.render(r.ctx, t, size, p, 42);
        expect(r.depth).toBe(0);
        expect(r.log).toContainEqual(['rect', 0, 0, 1280, 720]);
        return r.log;
      };
      const a = run(3);
      run(1);
      expect(run(3)).toEqual(a);
      expect(run(0.5)).not.toEqual(run(2));
      expect(run(block.thumbnailTime!)).toEqual(run(block.thumbnailTime!));
      expect(p).toEqual(defaults(block));
    },
  );
it('B1 particles obey ballistic time equations and are gone after lifetime', () => {
  const p = defaults(particleBurst),
    run = (t: number) => {
      const r = recording();
      particleBurst.render(r.ctx, t, { width: 1280, height: 720 }, p, 9);
      return r.log.filter((l) => l[0] === 'arc');
    };
  const a = run(0),
    b = run(1),
    c = run(2);
  expect(a).toHaveLength(90);
  for (let i = 0; i < 90; i++) {
    expect(
      (c[i]![1] as number) - 2 * (b[i]![1] as number) + (a[i]![1] as number),
    ).toBeCloseTo(0, 8);
    expect(
      (c[i]![2] as number) - 2 * (b[i]![2] as number) + (a[i]![2] as number),
    ).toBeCloseTo(0.16 * 720, 8);
  }
  expect(run(4)).toEqual([]);
});
it('B1 trusted block/helper sources use no wall-clock randomness or mutable module simulation', () => {
  for (const path of ['src/blocks/starters.ts', 'src/blocks/helpers.ts'])
    expect(readFileSync(path, 'utf8')).not.toMatch(
      /\b(?:Date|performance|Math\.random|setInterval|setTimeout)\b/,
    );
});
