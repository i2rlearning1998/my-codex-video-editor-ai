import { describe, expect, it } from 'vitest';
import {
  ASSET_TYPES,
  CONTROL_REGISTRY,
  controlKey,
  offKeys,
} from '../../src/library-client/controls';
import { RIGHT_SECTIONS } from '../../src/ui/right-panel';

describe('[FIX7-020] editor controls registry', () => {
  it('[FIX7-020] names real tabs and real kinds, with no duplicate key', () => {
    const keys = new Set<string>();
    for (const def of CONTROL_REGISTRY) {
      if (def.surface === 'panel')
        expect(RIGHT_SECTIONS as readonly string[]).toContain(def.id);
      expect(def.types.length).toBeGreaterThan(0);
      for (const type of def.types) {
        expect(ASSET_TYPES).toContain(type);
        const key = controlKey(def.surface, type, def.id);
        expect(keys.has(key)).toBe(false);
        keys.add(key);
      }
    }
  });
  it('[FIX7-020] reads the switched-off keys and ignores bad settings', () => {
    expect(
      offKeys({ off: ['panel.shape.Effects'] }).has('panel.shape.Effects'),
    ).toBe(true);
    expect(offKeys({ off: 5 }).size).toBe(0);
    expect(offKeys(undefined).size).toBe(0);
  });
});

describe('[FIX7-029] filter, effect and transition tiles can be switched off', () => {
  it('[FIX7-029] the registry lists exactly the tiles the editor shows', async () => {
    const { FILTER_PRESETS } =
      await import('../../src/ui/right-panel/fx-panels');
    const { EFFECT_TILES } = await import('../../src/ui/right-panel/fx-panels');
    const { TRANSITION_TILES } =
      await import('../../src/ui/right-panel/transition-tiles');
    const { FILTER_KEYS, EFFECT_IDS, TRANSITION_IDS } =
      await import('../../src/library-client/fx-keys');
    expect([...FILTER_KEYS]).toEqual(FILTER_PRESETS.map((p) => p.key));
    expect([...EFFECT_IDS]).toEqual(EFFECT_TILES.map((p) => p.id));
    expect([...TRANSITION_IDS]).toEqual(TRANSITION_TILES.map((p) => p.type));
    const fx = CONTROL_REGISTRY.filter((def) => def.surface === 'fx');
    expect(fx.length).toBeGreaterThan(100);
    expect(fx.every((def) => def.label.en.includes('·'))).toBe(true);
  });
});
