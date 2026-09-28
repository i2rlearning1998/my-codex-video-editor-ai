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

interface ClipRow {
  id: string;
  name: string;
  trackId: string;
  assetId: string | null;
  startTime: number;
  duration: number;
  sourceIn: number;
  sourceOut: number;
  metadata: Record<string, unknown>;
}
describe('[TL-027][TL-032] clipboard, links and detach', () => {
  const setup = async () => {
    const { EditorSession } = await import('../src/ui/session');
    const editing = await import('../src/ui/editing');
    editing.clearClipboard();
    const engine = new EditorEngine(adoptFreeLayers(fixture()).project);
    const session = new EditorSession(engine);
    // Plain rows: the deep readonly snapshot types are too deep for expect().
    const clips = (): ClipRow[] =>
      JSON.parse(
        JSON.stringify(
          engine.state.compositions[0]!.tracks.flatMap((track) =>
            track.clips.map((clip) => ({ ...clip, trackId: track.id })),
          ),
        ),
      );
    return { engine, session, editing, clips };
  };
  it('pastes copies at the playhead with the insert rule, repeatedly', async () => {
    const { engine, session, editing, clips } = await setup();
    session.select('layer-a'); // clip-a 0..2 on Video 1
    editing.performEdit(engine, session, 'copy');
    expect(engine.canUndo).toBe(false);
    session.setCurrentTime(2);
    editing.performEdit(engine, session, 'paste');
    const video1 = () =>
      clips()
        .filter((clip) => clip.trackId === 'video-1')
        .map((clip) => [clip.startTime, clip.duration])
        .sort((a, b) => a[0]! - b[0]!);
    // The copy lands at 2 s on Video 1 and pushes clip-b (3..5) to 4 s.
    expect(video1()).toEqual([
      [0, 2],
      [2, 2],
      [4, 2],
    ]);
    editing.performEdit(engine, session, 'paste');
    expect(video1()).toHaveLength(4);
    expect(overlaps(engine.state as unknown as Project)).toEqual([]);
    expect(engine.history.undo.map((step) => step.label)).toEqual([
      'Paste',
      'Paste',
    ]);
  });
  it('cuts in one undo step and keeps the clipboard for a paste', async () => {
    const { engine, session, editing, clips } = await setup();
    session.select('layer-c');
    editing.performEdit(engine, session, 'cut');
    expect(clips().map((clip) => clip.id)).not.toContain('clip-c');
    engine.undo();
    expect(clips().map((clip) => clip.id)).toContain('clip-c');
    engine.redo();
    session.setCurrentTime(0);
    editing.performEdit(engine, session, 'paste');
    const pasted = clips().find((clip) => clip.name === 'clip-c')!;
    expect([pasted.trackId, pasted.startTime, pasted.duration]).toEqual([
      'video-2',
      0,
      3,
    ]);
  });
  it('links clips so delete and split act on the whole group; unlink separates them', async () => {
    const { engine, session, editing, clips } = await setup();
    session.selectMany(['layer-a', 'layer-c']);
    editing.performEdit(engine, session, 'link');
    const link = (id: string) =>
      (clips().find((clip) => clip.id === id)!.metadata as { linkId?: string })
        .linkId;
    expect(link('clip-a')).toBeDefined();
    expect(link('clip-a')).toBe(link('clip-c'));
    // Split at 1.5 s from clip-a alone splits clip-c too (it spans 1.5 s).
    session.select('layer-a');
    session.setCurrentTime(1.5);
    editing.performEdit(engine, session, 'split');
    const pieces = clips().filter((clip) => clip.startTime === 1.5);
    expect(pieces).toHaveLength(2);
    expect(link(pieces[0]!.id)).toBe(link(pieces[1]!.id));
    expect(link(pieces[0]!.id)).not.toBe(link('clip-a'));
    engine.undo();
    // Delete from clip-a alone removes its partner.
    session.select('layer-a');
    editing.performEdit(engine, session, 'delete');
    expect(clips().map((clip) => clip.id)).not.toContain('clip-c');
    engine.undo();
    session.select('layer-c');
    editing.performEdit(engine, session, 'unlink');
    expect(link('clip-a')).toBeUndefined();
    expect(link('clip-c')).toBeUndefined();
  });
  it('detaches audio into an audio clip on an audio track with a derived audio asset', async () => {
    const { engine, session, editing, clips } = await setup();
    session.select('layer-b'); // clip-b 3..5, source 1..3 of asset-video
    editing.performEdit(engine, session, 'detach-audio');
    const state = engine.state;
    const audio = clips().find((clip) => clip.name === 'clip-b audio')!;
    const track = state.compositions[0]!.tracks.find(
      (item) => item.id === audio.trackId,
    )!;
    expect(track.type).toBe('audio');
    expect([
      audio.startTime,
      audio.duration,
      audio.sourceIn,
      audio.sourceOut,
    ]).toEqual([3, 2, 1, 3]);
    expect(audio.metadata).toEqual({ detachedFrom: 'clip-b' });
    const asset = state.assets.find((item) => item.id === audio.assetId)!;
    expect(asset).toMatchObject({
      type: 'audio',
      source: { kind: 'generated', reference: 'audio-of:asset-video' },
      duration: 6,
    });
    expect(clips().find((clip) => clip.id === 'clip-b')!.metadata).toEqual({
      audioDetached: true,
    });
    // Already detached: no second detach; another video clip reuses the asset.
    expect(
      editing.contextActions(session.source, ['layer-b'], 0),
    ).not.toContain('detach-audio');
    session.select('layer-a');
    editing.performEdit(engine, session, 'detach-audio');
    expect(
      engine.state.assets.filter(
        (item) => item.type === 'audio' && item.source.kind === 'generated',
      ),
    ).toHaveLength(1);
    engine.undo();
    engine.undo();
    expect(engine.state.assets.map((item) => item.id)).toEqual(
      fixture().assets.map((item) => item.id),
    );
  });
});
