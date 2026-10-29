import { describe, expect, it } from 'vitest';
import {
  ASSET_TYPES,
  CONTROL_REGISTRY,
  controlKey,
  offKeys,
} from '../../src/library-client/controls';
import { RIGHT_SECTIONS } from '../../src/ui/right-panel';

describe('FIX7-020 editor controls registry', () => {
  it('names real tabs and real kinds, with no duplicate key', () => {
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
  it('reads the switched-off keys and ignores bad settings', () => {
    expect(
      offKeys({ off: ['panel.shape.Effects'] }).has('panel.shape.Effects'),
    ).toBe(true);
    expect(offKeys({ off: 5 }).size).toBe(0);
    expect(offKeys(undefined).size).toBe(0);
  });
});
