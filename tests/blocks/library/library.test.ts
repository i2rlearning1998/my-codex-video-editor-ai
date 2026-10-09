import { describe, expect, it } from 'vitest';
import { blockLibrary } from '../../../src/blocks/library';
import { compileBlock } from '../../../src/blocks/sandbox/compile';
import { drawingFacade } from '../../../src/blocks/sandbox/facade';
import { frame } from '../../../src/blocks/render';
import { helpers } from '../../../src/blocks/helpers';
import { validateParams } from '../../../src/blocks/params';
import type { Params } from '../../../src/blocks/types';
import { recording } from '../recording';

it('library contains fourteen unique original source definitions', () => {
  expect(blockLibrary).toHaveLength(14);
  expect(new Set(blockLibrary.map((b) => b.id)).size).toBe(14);
});
for (const entry of blockLibrary) {
  describe(entry.id, () => {
    const result = compileBlock(entry.source);
    if (!result.ok) throw Error(entry.id + ': ' + result.error);
    const { info, body } = result.value;
    // Trusted, repository-owned fixture ONLY. Production/gallery execution stays in workers.
    const draw = new Function(
      'ctx',
      't',
      'size',
      'params',
      'seed',
      'helpers',
      body,
    );
    const size = Object.freeze({ width: 960, height: 540 });
    const render = (t: number, raw: Params = {}, seed = 7) => {
      const r = recording();
      const p = validateParams(info.params, raw);
      frame(r.ctx, size, () => {
        const facade = drawingFacade(r.ctx);
        draw(facade.ctx, t, size, p, seed, helpers);
        facade.finish();
      });
      expect(r.depth).toBe(0);
      return r.log;
    };
    it('compiles under 12000 characters with defaults and thumbnail metadata', () => {
      expect(entry.source.length).toBeLessThan(12000);
      expect(info.id).toBe(entry.id);
      expect(info.name).toBe(entry.name);
      expect(info.category).toBe(entry.category);
      expect(info.params.length).toBeGreaterThanOrEqual(5);
      expect(info.params.length).toBeLessThanOrEqual(9);
      expect(info.thumbnailTime).toBeGreaterThan(0);
      expect(info.thumbnailTime).toBeLessThan(info.defaultDuration);
      expect(Object.keys(validateParams(info.params, {}))).toHaveLength(
        info.params.length,
      );
    });
    it('is scrub-independent, finite, balanced and draws at its thumbnail', () => {
      const first = render(3);
      render(1);
      expect(render(3)).toEqual(first);
      const pose = render(info.thumbnailTime!);
      expect(
        pose.some((row) =>
          ['fill', 'stroke', 'fillText', 'fillRect'].includes(String(row[0])),
        ),
      ).toBe(true);
      // The wrapper clears transparently; no block paints a full-canvas backing plate.
      expect(pose.filter((row) => row[0] === 'clearRect')).toEqual([
        ['clearRect', 0, 0, 960, 540],
      ]);
      expect(pose).not.toContainEqual(['fillRect', 0, 0, 960, 540]);
      for (const t of [-1, 0, 0.1, info.defaultDuration, 86400]) render(t);
    });
    it('validates every parameter and renders its boundary values without mutation', () => {
      expect(() => validateParams(info.params, { unknown: 1 })).toThrow();
      for (const spec of info.params) {
        const bad = spec.type === 'number' ? spec.max + 1 : 123;
        expect(() =>
          validateParams(info.params, { [spec.name]: bad }),
        ).toThrow();
        const values =
          spec.type === 'number'
            ? [spec.min, spec.max]
            : spec.type === 'color'
              ? ['#12345600', '#abcdef']
              : spec.type === 'text'
                ? ['', 'W'.repeat(spec.maxLength ?? 200)]
                : [spec.default];
        for (const value of values) {
          const raw = Object.freeze({ [spec.name]: value });
          render(info.thumbnailTime!, raw, -2147483648);
          expect(raw[spec.name]).toBe(value);
        }
      }
    });
  });
}
