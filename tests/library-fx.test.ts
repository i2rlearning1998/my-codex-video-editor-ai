import { describe, expect, it } from 'vitest';
import { libraryFx, syncLibraryFx, toLibraryFx } from '../src/ui/library-fx';
import {
  activePreset,
  applyPreset,
  presetList,
  selectedEffects,
  selectedLibraryEffects,
  toggleLibraryEffect,
} from '../src/ui/right-panel/fx-panels';
import {
  transitionKey,
  transitionOf,
} from '../src/ui/right-panel/transition-tiles';
import { runtimeCheck } from '../src/ui/creator-checks';
import type { CreatorItem } from '../src/creator-pack';
import type { ClipFx } from '../src/core';

const controls = [
  {
    type: 'number',
    name: 'intensity',
    label: { en: 'Intensity' },
    group: 'basic',
    min: 0,
    max: 1,
    step: 0.01,
    default: 1,
  },
];
const item = (type: string, data: unknown, id = 'x'): CreatorItem =>
  ({
    id,
    type,
    name: { en: id },
    tags: [],
    controls,
    data,
  }) as unknown as CreatorItem;
const recipe = (...fx: [string, Record<string, unknown>][]) => ({
  mode: 'recipe',
  steps: fx.map(([id, params]) => ({ fx: id, params })),
});

describe('[FIX7-028] owner filters, effects, adjustments and transitions', () => {
  it('[FIX7-028] a recipe becomes a tile; a saved clip keeps only built-in ids', () => {
    const warm = toLibraryFx(
      'p-warm',
      'Warm look',
      item(
        'filter',
        recipe(['filter.retro', {}], ['adjust.contrast', { amount: 0.2 }]),
      ),
    )!;
    expect(warm.kind).toBe('filter');
    expect(warm.steps.map((s) => s.id)).toEqual([
      'filter.retro',
      'adjust.contrast',
    ]);
    expect(warm.marker.length).toBeLessThanOrEqual(12);
    syncLibraryFx([
      {
        key: 'p-warm',
        name: 'Warm look',
        item: item(
          'filter',
          recipe(['filter.retro', {}], ['adjust.contrast', { amount: 0.2 }]),
        ),
      },
    ]);
    expect(presetList().some((p) => p.key === warm.marker)).toBe(true);
    const fx: ClipFx = { version: 1, stack: [] };
    applyPreset(fx, warm.marker, 0.5);
    expect(fx.stack.map((e) => e.id)).toEqual([
      'filter.retro',
      'adjust.contrast',
    ]);
    expect(fx.stack[0]!.params.preset).toBe(warm.marker);
    expect(activePreset(fx)?.preset.key).toBe(warm.marker);
    expect(activePreset(fx)?.intensity).toBe(0.5);
  });
  it('[FIX7-028] a colour adjustment (values) lists as a filter; unknown ids are refused', () => {
    expect(
      toLibraryFx(
        'a',
        'A',
        item('adjust', { values: { contrast: 0.3, saturation: 0.1 } }),
      )!.steps,
    ).toHaveLength(2);
    expect(
      toLibraryFx('b', 'B', item('filter', recipe(['filter.nope', {}]))),
    ).toBeNull();
    expect(
      toLibraryFx('c', 'C', item('adjust', { values: { nope: 1 } })),
    ).toBeNull();
  });
  it('[FIX7-028] a library effect switches its steps on and off together and is not a built-in tile', () => {
    const data = item(
      'effect',
      recipe(['effect.glow', {}], ['filter.retro', {}]),
      'fx1',
    );
    syncLibraryFx([{ key: 'fx1', name: 'Dream', item: data }]);
    const marker = libraryFx.effects()[0]!.marker;
    const fx: ClipFx = { version: 1, stack: [] };
    toggleLibraryEffect(fx, marker);
    expect(fx.stack).toHaveLength(2);
    expect(selectedLibraryEffects(fx).has(marker)).toBe(true);
    expect(selectedEffects(fx).size).toBe(0);
    expect(activePreset(fx)).toBeNull();
    toggleLibraryEffect(fx, marker);
    expect(fx.stack).toHaveLength(0);
  });
  it('[FIX7-028] a library transition is a built-in type with settings, found again by its tile', () => {
    syncLibraryFx([
      {
        key: 't1',
        name: 'Slow swirl',
        item: item('transition', recipe(['transition.swirl', {}]), 't1'),
      },
    ]);
    const tile = libraryFx.transitions()[0]!;
    const stored = transitionOf(tile.marker);
    expect(stored.type).toBe('transition.swirl');
    expect(transitionKey(stored)).toBe(tile.marker);
    expect(
      transitionKey({ type: 'transition.swirl', params: { amount: 99 } }),
    ).toBe('transition.swirl');
    expect(transitionKey(null)).toBeNull();
  });
  it('[FIX7-028] the publish check accepts recipes and still refuses code', async () => {
    const deps = { runtime: async () => null };
    expect(
      (await runtimeCheck(item('filter', recipe(['filter.retro', {}])), deps))
        .status,
    ).toBe('ok');
    expect(
      (
        await runtimeCheck(
          item('transition', recipe(['transition.swirl', {}])),
          deps,
        )
      ).status,
    ).toBe('ok');
    expect(
      (
        await runtimeCheck(
          item('filter', { mode: 'code', source: 'x', kind: 'filter' }),
          deps,
        )
      ).status,
    ).toBe('unsupported');
  });
});
