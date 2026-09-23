import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EditorEngine,
  adoptFreeLayers,
  deserializeProject,
  planInsert,
  type Project,
} from '../src/core';
import { createExampleProject } from '../src/ui/example';

const fixture = (): Project =>
  deserializeProject(
    readFileSync('tests/fixtures/projects/nle-example.json', 'utf8'),
  );
const overlaps = (project: Project) =>
  project.compositions.flatMap((composition) =>
    composition.tracks.flatMap((track) =>
      track.clips.flatMap((a) =>
        track.clips
          .filter(
            (b) =>
              a !== b &&
              a.startTime < b.startTime + b.duration - 1e-9 &&
              b.startTime < a.startTime + a.duration - 1e-9,
          )
          .map((b) => `${track.id}:${a.id}/${b.id}`),
      ),
    ),
  );

describe('[TL-001] one clip model', () => {
  it('gives every top-level layer of the example a clip on a compatible, non-overlapping track', () => {
    const { project, adopted } = adoptFreeLayers(createExampleProject());
    const composition = project.compositions[0]!;
    expect(adopted).toBe(composition.layers.length);
    const linked = new Set(
      composition.tracks.flatMap((track) =>
        track.clips.map((clip) => clip.layerId),
      ),
    );
    for (const layer of composition.layers)
      expect(linked.has(layer.id)).toBe(true);
    expect(overlaps(project)).toEqual([]);
    expect(
      composition.tracks.map((track) => [track.type, track.name]),
    ).toContainEqual(['text', 'Text 1']);
    expect(
      composition.tracks.find((track) =>
        track.clips.some((clip) => clip.layerId === 'example-cards'),
      )!.type,
    ).toBe('object');
    // Layer timing and every layer are preserved; only clips and tracks are added.
    expect(composition.layers).toEqual(
      createExampleProject().compositions[0]!.layers,
    );
    // Idempotent: a converted document converts nothing more.
    expect(adoptFreeLayers(project).adopted).toBe(0);
  });

  it('leaves an all-clip document unchanged and folds nested clips into their layer', () => {
    const clean = fixture();
    expect(adoptFreeLayers(clean)).toEqual({ project: clean, adopted: 0 });
    const nested = fixture();
    const composition = nested.compositions[0]!;
    const group = structuredClone(composition.layers[0]!);
    group.id = 'group-x';
    group.type = 'group';
    group.assetId = null;
    group.properties = {};
    group.children = [composition.layers.splice(1, 1)[0]!]; // layer-b nested
    composition.layers.push(group);
    const result = adoptFreeLayers(nested).project.compositions[0]!;
    const clipsFor = (id: string) =>
      result.tracks.flatMap((track) =>
        track.clips.filter((clip) => clip.layerId === id),
      );
    expect(clipsFor('layer-b')).toEqual([]);
    expect(clipsFor('group-x')).toHaveLength(1);
    const layerB = result.layers.find((layer) => layer.id === 'group-x')!
      .children[0]!;
    // clip-b timing (3..5) moved onto the nested layer.
    expect([layerB.startTime, layerB.duration]).toEqual([3, 2]);
  });
});

describe('[TL-020][TL-030] insert rule', () => {
  const span = (id: string, startTime: number, duration: number) => ({
    id,
    startTime,
    duration,
  });
  it('pushes later clips just enough and keeps their spacing', () => {
    const plan = planInsert(
      [span('a', 0, 2), span('b', 3, 2), span('c', 6, 1)],
      [span('m', 2.5, 2)],
    );
    expect(plan.placed.get('m')).toBe(2.5);
    expect(Object.fromEntries(plan.pushed)).toEqual({ b: 4.5, c: 7.5 });
    expect(plan.insertions).toEqual([2.5]);
  });
  it('moves a landing point inside a clip to its nearer edge and never splits', () => {
    const early = planInsert([span('a', 0, 4)], [span('m', 1, 1)]);
    expect(early.placed.get('m')).toBe(0);
    expect(early.pushed.get('a')).toBe(1);
    const late = planInsert([span('a', 0, 4)], [span('m', 3, 1)]);
    expect(late.placed.get('m')).toBe(4);
    expect(late.pushed.size).toBe(0);
  });
  it('needs no push when the landing range is free', () => {
    const plan = planInsert([span('a', 0, 2)], [span('m', 2, 1)]);
    expect(plan.pushed.size).toBe(0);
    expect(plan.insertions).toEqual([]);
  });
  it('places several incoming clips without overlapping each other', () => {
    const plan = planInsert(
      [span('a', 5, 1)],
      [span('m', 1, 2), span('n', 2, 2)],
    );
    expect(plan.placed.get('m')).toBe(1);
    expect(plan.placed.get('n')).toBe(3);
    expect(plan.pushed.has('a')).toBe(false); // n ends exactly at 5
  });
});

describe('[TL-004] locked tracks', () => {
  it('refuse deleting a layer whose clip is on a locked track', () => {
    const project = fixture();
    project.compositions[0]!.tracks[0]!.locked = true;
    const engine = new EditorEngine(project);
    expect(() =>
      engine.commands.execute({
        type: 'DELETE_LAYER',
        compositionId: engine.state.compositions[0]!.id,
        layerId: 'layer-a',
      }),
    ).toThrow(/locked/);
    expect(engine.canUndo).toBe(false);
  });
});
