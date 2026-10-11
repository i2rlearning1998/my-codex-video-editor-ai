import { describe, expect, it } from 'vitest';
import {
  EditorEngine,
  activeCut,
  createComposition,
  createProject,
  sceneCuts,
  sceneTransitionLabel,
  sceneTransitionOf,
} from '../src/core';

describe('[TR-018] scene-to-scene transitions (V7, spec 10.5)', () => {
  const setup = () => {
    const engine = new EditorEngine(createProject());
    for (const id of ['b', 'c'])
      engine.commands.execute({
        type: 'CREATE_COMPOSITION',
        composition: createComposition({ id }),
      });
    return engine;
  };
  const mark = (engine: EditorEngine, id: string) =>
    engine.commands.transaction('Add transition', [
      {
        type: 'ADD_MARKER',
        compositionId: id,
        marker: {
          id: `t-${id}`,
          time: 0,
          label: sceneTransitionLabel({ type: 'fade-black', duration: 1 }),
        },
      },
    ]);
  it('is a reserved marker that never changes the scene length and plays across the cut', () => {
    const engine = setup();
    const before = engine.state.compositions.map((scene) => scene.duration);
    mark(engine, 'b');
    expect(engine.state.compositions.map((scene) => scene.duration)).toEqual(
      before,
    );
    expect(sceneTransitionOf(engine.state.compositions[1]!)).toEqual({
      type: 'fade-black',
      duration: 1,
    });
    const cuts = sceneCuts(engine.state.compositions);
    const cut = before[0]!;
    expect(cuts).toEqual([
      { time: cut, transition: { type: 'fade-black', duration: 1 } },
    ]);
    expect(activeCut(cuts, cut - 0.6)).toBeNull();
    expect(activeCut(cuts, cut)!.p).toBeCloseTo(0.5, 6);
    expect(activeCut(cuts, cut + 0.49)).not.toBeNull();
    expect(activeCut(cuts, cut + 0.5)).toBeNull();
  });
  it('deleting a scene removes its transition and the next one, in one step', () => {
    const engine = setup();
    mark(engine, 'b');
    mark(engine, 'c');
    engine.commands.transaction('Delete scene', [
      { type: 'DELETE_COMPOSITION', compositionId: 'b' },
    ]);
    expect(sceneTransitionOf(engine.state.compositions[1]!)).toBeNull();
    engine.undo();
    expect(sceneTransitionOf(engine.state.compositions[2]!)).not.toBeNull();
  });
});
