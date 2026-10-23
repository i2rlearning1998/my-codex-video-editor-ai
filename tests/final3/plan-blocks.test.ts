import { describe, expect, it } from 'vitest';
import { buildVideoFromPlan, validatePlan } from '../../src/video-plan';
import { graphicsBlocks } from '../../src/blocks/graphics';
import { getBlock } from '../../src/blocks';

// Graphics blocks (code layers) as plan layers: the plan names a block and
// its settings; the builder makes a code layer over the scene's timeline.
const plan = (layers: unknown[]) => ({
  format: 'video-plan',
  version: 3,
  meta: { title: 'Blocks', aspect: '9:16', build: 'timeline' },
  captions: { enabled: false },
  scenes: [{ id: 'main', durationHint: 20, layers }],
});
const deps = {
  resolve: { local: () => [], stock: async () => [] },
  importCandidate: async () => {
    throw new Error('no media expected');
  },
};

describe('Plan graphics blocks', () => {
  it('registers the teaching graphics in the block catalogue', () => {
    for (const block of graphicsBlocks) expect(getBlock(block.id)).toBe(block);
    expect(graphicsBlocks.map((b) => b.id)).toEqual(
      expect.arrayContaining([
        'earth-globe',
        'story-map',
        'ink-mark',
        'stick-diagram',
        'sun-earth',
        'earth-arc',
        'soft-panel',
      ]),
    );
  });
  it('checks the block id and its settings', () => {
    const ok = plan([
      {
        id: 'g',
        kind: 'block',
        block: 'earth-globe',
        start: 1,
        duration: 8,
        params: { radius: 30, pinAt: 2, palette: 'tan-blue' },
      },
    ]);
    expect(validatePlan(ok).ok).toBe(true);
    const unknown = plan([{ id: 'g', kind: 'block', block: 'nope' }]);
    expect(validatePlan(unknown).errors.join(' ')).toMatch(/no graphics block/);
    const missing = plan([{ id: 'g', kind: 'block' }]);
    expect(validatePlan(missing).errors.join(' ')).toMatch(/without "block"/);
    const bad = plan([
      {
        id: 'g',
        kind: 'block',
        block: 'earth-globe',
        params: { radius: 9999 },
      },
    ]);
    expect(validatePlan(bad).errors.join(' ')).toMatch(/radius/);
    const stray = plan([
      { id: 'g', kind: 'block', block: 'ink-mark', params: { colour: 'x' } },
    ]);
    expect(validatePlan(stray).errors.join(' ')).toMatch(/colour/);
  });
  it('builds each block as a code layer with its own start and length', async () => {
    const result = await buildVideoFromPlan(
      plan([
        {
          id: 'g',
          kind: 'block',
          block: 'earth-globe',
          start: 2,
          duration: 6,
          params: { pinAt: 1 },
        },
        {
          id: 'm',
          kind: 'block',
          block: 'ink-mark',
          start: 9,
          duration: 3,
          params: { kind: 'cross', color: '#d62828' },
        },
      ]),
      deps,
    );
    expect(result.errors).toEqual([]);
    const scene = result.project!.compositions[0]!;
    const codes = scene.layers.filter((l) => l.code);
    expect(codes).toHaveLength(2);
    const [globe, mark] = codes as [(typeof codes)[0], (typeof codes)[0]];
    expect(globe.startTime).toBeCloseTo(2, 5);
    expect(globe.duration).toBeCloseTo(6, 5);
    expect(mark.startTime).toBeCloseTo(9, 5);
    expect(JSON.stringify(globe.code)).toContain('earth-globe');
    expect(JSON.stringify(mark.code)).toContain('#d62828');
  });
});
