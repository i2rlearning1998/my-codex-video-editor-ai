import { describe, expect, it } from 'vitest';
import {
  builtScenes,
  compositionCardStatus,
  rememberBuilt,
} from '../src/ui/composition-status';
import { allSceneIds, type PlanState } from '../src/ui/plan-state';

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
};

describe('AI card status follows the canvas', () => {
  it('[FX10-003] a second build keeps the first one listed, so Undo bringing an earlier scene back makes the card read Built again', () => {
    const storage = memoryStorage();
    rememberBuilt(storage, 'p1', 'k', ['a', 'b']);
    rememberBuilt(storage, 'p1', 'k', ['c']);
    const ids = builtScenes(storage, 'p1', 'k')!;
    expect(new Set(ids)).toEqual(new Set(['a', 'b', 'c']));
    // Only "c" is on the canvas: Built, one scene.
    expect(compositionCardStatus(ids, [{ id: 'c', layers: [] }])).toEqual({
      status: 'built',
      scenes: 1,
    });
    // Undo brings "a" back and removes "c": still Built (one scene).
    expect(compositionCardStatus(ids, [{ id: 'a', layers: [] }])).toEqual({
      status: 'built',
      scenes: 1,
    });
    // No built scene on the canvas: Not built.
    expect(compositionCardStatus(ids, [{ id: 'z', layers: [] }]).status).toBe(
      'not-built',
    );
    // Another project never sees them.
    expect(builtScenes(storage, 'p2', 'k')).toBeNull();
  });

  it('[FX10-003] a plan state lists its current scenes first and then the earlier ones', () => {
    const state = {
      sceneIds: ['n1', null, 'n2'],
      earlier: ['o1'],
    } as unknown as PlanState;
    expect(allSceneIds(state)).toEqual(['n1', 'n2', 'o1']);
  });
});
