import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EditorEngine,
  createComposition,
  deserializeProject,
} from '../src/core';
import { EditorSession } from '../src/ui/session';
import { sceneLengthCommands } from '../src/ui/scene-length';
import { joinScenes } from '../src/export/join';
import {
  cloneScene,
  duplicateScene,
  moveLayerToScene,
  templateScene,
} from '../src/ui/scenes';
import { adoptFreeLayers } from '../src/core';
import { createExampleProject } from '../src/ui/example';

const nle = () =>
  new EditorEngine(
    deserializeProject(
      readFileSync('tests/fixtures/projects/nle-example.json', 'utf8'),
    ),
  );

describe('[CV-048] scene commands and scene length (G3, G5)', () => {
  it('sets the project background and a scene name as undoable commands', () => {
    const engine = nle();
    const id = engine.state.compositions[0]!.id;
    engine.commands.transaction('Set background', [
      { type: 'SET_PROJECT_BACKGROUND', color: '#223344' },
    ]);
    engine.commands.transaction('Rename scene', [
      { type: 'SET_COMPOSITION', compositionId: id, name: 'Intro' },
    ]);
    expect(engine.state.settings.backgroundColor).toBe('#223344');
    expect(engine.state.compositions[0]!.name).toBe('Intro');
    engine.undo();
    engine.undo();
    expect(engine.state.settings.backgroundColor).toBe('#f0eee7');
    expect(() =>
      engine.commands.transaction('Bad', [
        { type: 'SET_PROJECT_BACKGROUND', color: 'red' } as never,
      ]),
    ).toThrow();
  });
  it('moves and deletes scenes, and keeps at least one', () => {
    const engine = nle();
    const first = engine.state.compositions[0]!.id;
    const second = createComposition({ id: 'scene-2', name: 'Two' });
    engine.commands.transaction('Add scene', [
      { type: 'CREATE_COMPOSITION', composition: second },
    ]);
    engine.commands.transaction('Move scene', [
      { type: 'MOVE_COMPOSITION', compositionId: 'scene-2', index: 0 },
    ]);
    expect(engine.state.compositions.map((item) => item.id)).toEqual([
      'scene-2',
      first,
    ]);
    expect(() =>
      engine.commands.transaction('Move scene', [
        { type: 'MOVE_COMPOSITION', compositionId: 'scene-2', index: 2 },
      ]),
    ).toThrow(/out of range/);
    engine.commands.transaction('Delete scene', [
      { type: 'DELETE_COMPOSITION', compositionId: 'scene-2' },
    ]);
    expect(() =>
      engine.commands.transaction('Delete scene', [
        { type: 'DELETE_COMPOSITION', compositionId: first },
      ]),
    ).toThrow(/at least one scene/);
  });
  it('lengthens a scene by extending the clips that end with it, within their media', () => {
    // Clips: a 0-2 s, b 3-5 s (video source 1-3 of 6 s), c 1-4 s.
    const engine = nle();
    const session = new EditorSession(engine);
    const commands = sceneLengthCommands(session.source, 7);
    expect(commands).toHaveLength(1);
    engine.commands.transaction('Set scene length', commands);
    expect(engine.state.compositions[0]!.duration).toBeCloseTo(7, 9);
    // The media only has 3 s left after clip b's source out: at most 8 s.
    const capped = sceneLengthCommands(session.source, 20);
    engine.commands.transaction('Set scene length', capped);
    expect(engine.state.compositions[0]!.duration).toBeCloseTo(8, 9);
    session.dispose();
  });
  it('shortens a scene by trimming clips past the new end, and refuses to cut one away', () => {
    const engine = nle();
    const session = new EditorSession(engine);
    engine.commands.transaction(
      'Set scene length',
      sceneLengthCommands(session.source, 3.5),
    );
    expect(engine.state.compositions[0]!.duration).toBeCloseTo(3.5, 9);
    expect(() => sceneLengthCommands(session.source, 2)).toThrow(/starts at 3/);
    expect(() => sceneLengthCommands(session.source, 0)).toThrow(RangeError);
    expect(sceneLengthCommands(session.source, 3.5)).toEqual([]);
    session.dispose();
  });
});

describe('[PRJ-013][PRJ-021][EXP-019] scenes on a board (G5)', () => {
  it('joins scenes end to end: times, keyframes and markers move, ids stay unique', () => {
    const engine = nle();
    const first = engine.state.compositions[0]!;
    const copy = cloneScene(first, 'Two');
    const joined = joinScenes([first, copy as never]);
    expect(joined.duration).toBeCloseTo(first.duration * 2, 9);
    const clips = joined.tracks.flatMap((track) => track.clips);
    expect(clips).toHaveLength(first.tracks.flatMap((t) => t.clips).length * 2);
    expect(new Set(clips.map((clip) => clip.id)).size).toBe(clips.length);
    const shifted = clips.filter((clip) => clip.id.startsWith('scene2-'));
    const original = first.tracks.flatMap((track) => track.clips);
    expect(shifted.map((clip) => clip.startTime)).toEqual(
      original.map((clip) => clip.startTime + first.duration),
    );
    // A single scene is exported as it is; mixed sizes are refused.
    expect(joinScenes([first])).toBe(first);
    expect(() => joinScenes([first, { ...copy, width: 640 } as never])).toThrow(
      /different sizes/,
    );
  });
  it('clones a scene with new ids for its layers, tracks and clips', () => {
    const engine = nle();
    const first = engine.state.compositions[0]!;
    const copy = cloneScene(first, 'Copy');
    const ids = (scene: typeof first | typeof copy) => [
      scene.id,
      ...scene.layers.map((layer) => layer.id),
      ...scene.tracks.map((track) => track.id),
      ...scene.tracks.flatMap((track) => track.clips.map((clip) => clip.id)),
    ];
    for (const id of ids(copy)) expect(ids(first)).not.toContain(id);
    // Clips still point at their (renamed) layers.
    for (const clip of copy.tracks.flatMap((track) => track.clips))
      expect(copy.layers.some((layer) => layer.id === clip.layerId)).toBe(true);
    engine.commands.transaction(
      'Duplicate scene',
      duplicateScene(engine.state, first.id).commands,
    );
    expect(engine.state.compositions).toHaveLength(2);
    engine.commands.transaction(
      'Add scene',
      templateScene(engine.state, first.id).commands,
    );
    expect(engine.state.compositions[1]!.name).toBe('Example layout');
  });
  it('moves a layer and its clip to another scene, or copies it with new ids', () => {
    const engine = nle();
    const first = engine.state.compositions[0]!.id;
    const added = duplicateScene(engine.state, first);
    engine.commands.transaction('Duplicate scene', added.commands);
    engine.commands.transaction(
      'Move to scene',
      moveLayerToScene(engine.state, first, 'layer-c', added.id, false),
    );
    const [from, to] = engine.state.compositions;
    expect(from!.layers.some((layer) => layer.id === 'layer-c')).toBe(false);
    expect(to!.layers.some((layer) => layer.id === 'layer-c')).toBe(true);
    expect(
      to!.tracks
        .flatMap((track) => track.clips)
        .filter((clip) => clip.layerId === 'layer-c'),
    ).toHaveLength(1);
    engine.commands.transaction(
      'Copy to scene',
      moveLayerToScene(engine.state, first, 'layer-a', added.id, true),
    );
    expect(
      engine.state.compositions[0]!.layers.some(
        (layer) => layer.id === 'layer-a',
      ),
    ).toBe(true);
    expect(() =>
      moveLayerToScene(engine.state, first, 'missing', added.id, false),
    ).toThrow();
  });
  it('[CV-048] a scene length also retimes the layers inside groups', () => {
    const engine = new EditorEngine(
      adoptFreeLayers(createExampleProject()).project,
    );
    const session = new EditorSession(engine);
    engine.commands.transaction(
      'Set scene length',
      sceneLengthCommands(session.source, 1),
    );
    expect(engine.state.compositions[0]!.duration).toBeCloseTo(1, 9);
    engine.commands.transaction(
      'Set scene length',
      sceneLengthCommands(session.source, 4),
    );
    expect(engine.state.compositions[0]!.duration).toBeCloseTo(4, 9);
    session.dispose();
  });
});
