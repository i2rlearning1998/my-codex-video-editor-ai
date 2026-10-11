import { describe, expect, it } from 'vitest';
import { effects, getItem } from '../src/fx';
import {
  activePreset,
  applyPreset,
  EFFECT_TILES,
  FILTER_PRESETS,
  presetEntries,
  toggleEffect,
} from '../src/ui/right-panel/fx-panels';

describe('V4 FX tiles', () => {
  it('has the 49 named filters of spec 5, each over existing library items', () => {
    expect(FILTER_PRESETS).toHaveLength(49);
    expect(new Set(FILTER_PRESETS.map((item) => item.key)).size).toBe(49);
    for (const preset of FILTER_PRESETS)
      for (const item of preset.stack) expect(getItem(item.id)).toBeTruthy();
  });
  it('maps every library effect to a tile (Pixelation under More)', () => {
    expect(EFFECT_TILES.map((tile) => tile.id).sort()).toEqual(
      effects.map((item) => item.id).sort(),
    );
    expect(EFFECT_TILES.filter((tile) => tile.more)).toEqual([
      { id: 'effect.pixelation', more: true },
    ]);
  });
  it('applies a bundle in place of the current filter and finds it again', () => {
    const fx = {
      version: 1 as const,
      stack: [
        { id: 'effect.blur', params: { intensity: 1, radius: 6 } },
        { id: 'filter.retro', params: { intensity: 1 } },
      ],
    };
    applyPreset(fx, 'increased', 0.5);
    expect(fx.stack.map((item) => item.id)).toEqual([
      'adjust.contrast',
      'adjust.saturation',
      'effect.blur',
    ]);
    expect(activePreset(fx)).toMatchObject({
      preset: { key: 'increased' },
      intensity: 0.5,
    });
    applyPreset(fx, 'none', 1);
    expect(fx.stack.map((item) => item.id)).toEqual(['effect.blur']);
    // An older plain library filter is still found.
    expect(
      activePreset({
        version: 1,
        stack: [{ id: 'filter.retro', params: { intensity: 1 } }],
      }),
    ).toMatchObject({ preset: { key: 'retro' } });
    expect(presetEntries(FILTER_PRESETS[0]!, 0.3)[0]!.params).toMatchObject({
      intensity: 0.3,
      preset: 'retro',
    });
  });
  it('toggles effects', () => {
    const fx = {
      version: 1 as const,
      stack: [] as {
        id: string;
        params: Record<string, number | boolean | string>;
      }[],
    };
    toggleEffect(fx, 'effect.vhs');
    expect(fx.stack.map((item) => item.id)).toEqual(['effect.vhs']);
    toggleEffect(fx, 'effect.vhs');
    expect(fx.stack).toEqual([]);
  });
});
