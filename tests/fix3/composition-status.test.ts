import { describe, expect, it } from 'vitest';
import {
  builtScenes,
  compositionCardStatus,
  compositionKey,
  rememberBuilt,
} from '../../src/ui/composition-status';

// FIX3 4.6: Not built, Built and Needs assets for an AI composition card.
const scene = (id: string, slot = false) => ({
  id,
  layers: [
    { properties: {} },
    ...(slot ? [{ properties: { compositionSlot: { value: 'logo' } } }] : []),
  ],
});

describe('FIX3 composition card status', () => {
  it('is not built until a build made scenes that are still there', () => {
    expect(compositionCardStatus(null, [scene('a')])).toEqual({
      status: 'not-built',
      scenes: 0,
    });
    expect(compositionCardStatus(['gone'], [scene('a')]).status).toBe(
      'not-built',
    );
  });
  it('is built with the count of its scenes still in the project', () => {
    expect(
      compositionCardStatus(['a', 'b', 'gone'], [scene('a'), scene('b')]),
    ).toEqual({ status: 'built', scenes: 2 });
  });
  it('needs assets while one of its scenes keeps an empty slot frame', () => {
    expect(
      compositionCardStatus(['a', 'b'], [scene('a'), scene('b', true)]).status,
    ).toBe('needs-assets');
  });
  it('remembers built scenes per project and composition', () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    };
    const key = compositionKey({ scenes: [1] });
    expect(key).toBe(compositionKey({ scenes: [1] }));
    expect(key).not.toBe(compositionKey({ scenes: [2] }));
    expect(builtScenes(storage, 'p1', key)).toBeNull();
    rememberBuilt(storage, 'p1', key, ['s1', 's2']);
    expect(builtScenes(storage, 'p1', key)).toEqual(['s1', 's2']);
    expect(builtScenes(storage, 'p2', key)).toBeNull();
    map.set('aive.compositionBuilt.p1', '{bad');
    expect(builtScenes(storage, 'p1', key)).toBeNull();
  });
});
