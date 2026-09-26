import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  adoptFreeLayers,
  EditorEngine,
  deserializeProject,
  localTransformMatrix,
  multiplyMatrices,
  type TransformValues,
} from '../src/core';
import { createExampleProject } from '../src/ui/example';
import { arrangeOrder } from '../src/ui/arrange';
import { contextActions, performEdit } from '../src/ui/editing';
import { describeSelection } from '../src/ui/selection-context';
import { EditorSession } from '../src/ui/session';
import { bakeTransform, ungroupBlocker } from '../src/ui/ungroup';

const values = (
  position: [number, number],
  rotation: number,
  scale: [number, number],
  opacity = 1,
): TransformValues => ({
  position: { value: position },
  rotation: { value: rotation },
  scale: { value: scale },
  opacity: { value: opacity },
});

test('[LYR-012] bakeTransform folds a group into a child exactly, and refuses a skew', () => {
  const group = values([100, 50], 30, [2, 2], 0.5);
  const child = values([10, -4], 15, [1, 0.5], 0.8);
  const baked = bakeTransform(group, child)!;
  const expected = multiplyMatrices(
    localTransformMatrix(group),
    localTransformMatrix(child),
  );
  const actual = localTransformMatrix(baked);
  expected.forEach((value, index) =>
    expect(actual[index]).toBeCloseTo(value, 8),
  );
  expect(baked.rotation.value).toBeCloseTo(45, 8);
  expect(baked.opacity.value).toBeCloseTo(0.4, 9);
  // A flipped group keeps a representable, mirrored child.
  expect(
    bakeTransform(values([0, 0], 0, [-1, 1]), values([5, 5], 20, [1, 1])),
  ).not.toBeNull();
  // Non-uniform scale on a rotated child would need a skew.
  expect(
    bakeTransform(values([0, 0], 0, [2, 1]), values([0, 0], 30, [1, 1])),
  ).toBeNull();
});

test('[CV-026] arrangeOrder moves selected layers as a block', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  expect(arrangeOrder(order, new Set(['b', 'c']), 'front')).toEqual([
    'a',
    'd',
    'e',
    'b',
    'c',
  ]);
  expect(arrangeOrder(order, new Set(['d']), 'back')).toEqual([
    'd',
    'a',
    'b',
    'c',
    'e',
  ]);
  expect(arrangeOrder(order, new Set(['b', 'c']), 'forward')).toEqual([
    'a',
    'd',
    'b',
    'c',
    'e',
  ]);
  expect(arrangeOrder(order, new Set(['a', 'c']), 'backward')).toEqual([
    'a',
    'c',
    'b',
    'd',
    'e',
  ]);
  expect(arrangeOrder(order, new Set(['e']), 'forward')).toEqual(order);
});

test('[CV-040] menu actions are the intersection of every selected item’s capabilities', () => {
  const engine = new EditorEngine(
    deserializeProject(
      readFileSync('tests/fixtures/projects/nle-example.json', 'utf8'),
    ),
  );
  const session = new EditorSession(engine);
  const video = contextActions(session.source, ['layer-b'], 3.5);
  expect(video).toEqual(
    expect.arrayContaining(['speed', 'reverse', 'freeze', 'detach-audio']),
  );
  const image = contextActions(session.source, ['layer-c'], 3.5);
  for (const action of ['speed', 'reverse', 'freeze', 'detach-audio'])
    expect(image).not.toContain(action);
  expect(image).toContain('toggle-enabled');
  const mixed = contextActions(session.source, ['layer-b', 'layer-c'], 3.5);
  for (const action of ['speed', 'reverse', 'freeze', 'detach-audio'])
    expect(mixed).not.toContain(action);
  expect(mixed).toContain('group');
  const selection = describeSelection(session.source, ['layer-b', 'layer-c']);
  expect(selection.every('clip')).toBe(true);
  expect(selection.every('time-effects')).toBe(false);
  expect(selection.some('time-effects')).toBe(true);
  session.dispose();
});

test('[LYR-012] Ungroup of the example card group is one step, keeps world geometry and gives children clips', () => {
  // The shell adopts free layers into clips when a project opens (TL-001).
  const engine = new EditorEngine(
    adoptFreeLayers(createExampleProject()).project,
  );
  const session = new EditorSession(engine);
  const world = (id: string) => {
    const composition = engine.state.compositions[0]!;
    const find = (
      layers: typeof composition.layers,
      parent = localTransformMatrix(values([0, 0], 0, [1, 1])),
    ): readonly number[] | null => {
      for (const layer of layers) {
        const matrix = multiplyMatrices(
          parent,
          localTransformMatrix(layer.transform as TransformValues),
        );
        if (layer.id === id) return matrix;
        const found = find(layer.children, matrix);
        if (found) return found;
      }
      return null;
    };
    return find(composition.layers)!;
  };
  const before = ['example-back', 'example-paper'].map(world);
  session.select('example-cards');
  expect(ungroupBlocker(session.source, ['example-cards'])).toBeNull();
  performEdit(engine, session, 'ungroup');
  expect(engine.history.undo).toHaveLength(1);
  expect(JSON.stringify(engine.history.undo[0])).toContain('Ungroup');
  const after = ['example-back', 'example-paper'].map(world);
  before.forEach((matrix, i) =>
    matrix.forEach((value, j) => expect(after[i]![j]).toBeCloseTo(value, 8)),
  );
  const composition = engine.state.compositions[0]!;
  expect(composition.layers.map((layer) => layer.id)).not.toContain(
    'example-cards',
  );
  const clipped = composition.tracks.flatMap((track) =>
    track.clips.map((clip) => clip.layerId),
  );
  expect(clipped).toEqual(
    expect.arrayContaining(['example-back', 'example-front']),
  );
  expect(clipped).not.toContain('example-cards');
  expect(session.selectedIds).toEqual(['example-back', 'example-front']);
  engine.undo();
  expect(
    engine.state.compositions[0]!.layers.map((layer) => layer.id),
  ).toContain('example-cards');
  session.dispose();
});
