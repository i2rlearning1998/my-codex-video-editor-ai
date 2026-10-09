import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EditorEngine,
  deserializeProject,
  serializeProject,
} from '../src/core';

const v6 = () =>
  readFileSync('tests/fixtures/projects/v6-outliner.json', 'utf8');

describe('[LYR-020] outliner collections (schema 7, T-ALL P5)', () => {
  it('migrates a schema 6 file to 7 with nothing else changed', () => {
    const legacy = JSON.parse(v6());
    const project = deserializeProject(v6());
    expect(legacy.schemaVersion).toBe(6);
    expect(project.schemaVersion).toBe(7);
    expect(project.compositions.map((item) => item.outliner)).toEqual(
      legacy.compositions.map(() => undefined),
    );
    expect(project.compositions[0]!.layers).toEqual(
      legacy.compositions[0].layers,
    );
  });
  it('stores collections as one undo step, round trips, and never touches layers', () => {
    const engine = new EditorEngine(deserializeProject(v6()));
    const scene = engine.state.compositions[0]!;
    const layerId = scene.layers[0]!.id;
    const layers = JSON.stringify(scene.layers);
    engine.commands.transaction('Move to collection', [
      {
        type: 'SET_OUTLINER',
        compositionId: scene.id,
        outliner: {
          collections: [
            { id: 'c1', name: 'Titles', parentId: null },
            { id: 'c2', name: 'Inner', parentId: 'c1' },
          ],
          items: { [layerId]: 'c2' },
          order: [layerId],
        },
      },
    ]);
    expect(JSON.stringify(engine.state.compositions[0]!.layers)).toBe(layers);
    const again = deserializeProject(serializeProject(engine.state));
    expect(again.compositions[0]!.outliner!.items[layerId]).toBe('c2');
    engine.undo();
    expect(engine.state.compositions[0]!.outliner).toBeUndefined();
  });
  it('refuses a collection cycle and an unknown collection', () => {
    const engine = new EditorEngine(deserializeProject(v6()));
    const scene = engine.state.compositions[0]!;
    for (const outliner of [
      {
        collections: [
          { id: 'a', name: 'A', parentId: 'b' },
          { id: 'b', name: 'B', parentId: 'a' },
        ],
        items: {},
        order: [],
      },
      { collections: [], items: { x: 'missing' }, order: [] },
    ])
      expect(() =>
        engine.commands.transaction('Bad', [
          { type: 'SET_OUTLINER', compositionId: scene.id, outliner },
        ]),
      ).toThrow();
  });
});
