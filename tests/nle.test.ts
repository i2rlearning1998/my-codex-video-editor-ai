// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EditorEngine,
  createLayer,
  createProject,
  deserializeProject,
  serializeProject,
  validateProject,
  type Clip,
  type Project,
  type Track,
} from '../src/core';
import { deriveRenderItems } from '../src/render/adapter';
import { performEdit } from '../src/ui/editing';
import { EditorSession } from '../src/ui/session';
import { mountEditorShell } from '../src/ui/shell';
import { TimelineInteraction } from '../src/ui/timeline';

const clean: (() => void)[] = [];
afterEach(() => {
  clean.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
});

function clip(id: string, layerId: string, startTime: number): Clip {
  return {
    id,
    name: id,
    layerId,
    assetId: 'asset',
    startTime,
    duration: 2,
    sourceIn: 0,
    sourceOut: 2,
    enabled: true,
    speed: 1,
    transitionMetadata: {},
    effectMetadata: {},
    metadata: {},
  };
}
function track(id: string, order: number, clips: Clip[] = []): Track {
  return {
    id,
    name: `Video ${order + 1}`,
    type: 'video',
    order,
    enabled: true,
    locked: false,
    muted: false,
    clips,
  };
}
function projectWithClips(): Project {
  const project = createProject();
  project.assets.push({
    id: 'asset',
    name: 'Footage',
    type: 'video',
    source: { kind: 'local', reference: 'footage.mp4' },
    duration: 20,
    metadata: {},
  });
  const first = createLayer('layer-a', 'video', 'Intro');
  const second = createLayer('layer-b', 'video', 'Main');
  first.assetId = second.assetId = 'asset';
  project.compositions[0]!.layers = [first, second];
  project.compositions[0]!.tracks = [
    track('video-1', 0, [
      clip('clip-a', first.id, 0),
      clip('clip-b', second.id, 3),
    ]),
    track('video-2', 1),
  ];
  return validateProject(project);
}

describe('canonical NLE tracks and clips', () => {
  it('stores multiple independent clips on one track and derives content extent', () => {
    const project = projectWithClips();
    const composition = project.compositions[0]!;
    expect(composition.tracks[0]!.clips.map((item) => item.id)).toEqual([
      'clip-a',
      'clip-b',
    ]);
    expect(composition.duration).toBe(5);
    expect(deserializeProject(serializeProject(project))).toEqual(project);
  });

  it('migrates schema 3 consecutively without inventing NLE clips', () => {
    const current = createProject();
    const legacy = JSON.parse(serializeProject(current));
    legacy.schemaVersion = 3;
    delete legacy.compositions[0].tracks;
    const migrated = deserializeProject(JSON.stringify(legacy));
    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.compositions[0]!.tracks).toEqual([]);
  });

  it('moves and retimes clips through commands with exact one-step history', () => {
    const engine = new EditorEngine(projectWithClips());
    const compositionId = engine.state.compositions[0]!.id;
    const before = engine.state;
    engine.commands.transaction('Move clip', [
      {
        type: 'SET_CLIP_TIMING',
        compositionId,
        clipId: 'clip-a',
        startTime: 6,
        duration: 2,
      },
      {
        type: 'MOVE_CLIP',
        compositionId,
        clipId: 'clip-a',
        trackId: 'video-2',
      },
    ]);
    expect(engine.history.undo).toHaveLength(1);
    expect(engine.state.compositions[0]!.duration).toBe(8);
    expect(engine.state.compositions[0]!.tracks[1]!.clips[0]!.id).toBe(
      'clip-a',
    );
    const after = engine.state;
    engine.undo();
    expect(engine.state).toEqual(before);
    engine.redo();
    expect(engine.state).toEqual(after);
  });

  it('reorders and enables tracks through undoable semantic commands', () => {
    const engine = new EditorEngine(projectWithClips());
    const compositionId = engine.state.compositions[0]!.id;
    engine.commands.execute({
      type: 'MOVE_TRACK',
      compositionId,
      trackId: 'video-2',
      index: 0,
    });
    expect(
      engine.state.compositions[0]!.tracks.map((item) => [item.id, item.order]),
    ).toEqual([
      ['video-2', 0],
      ['video-1', 1],
    ]);
    engine.commands.execute({
      type: 'SET_TRACK_STATE',
      compositionId,
      trackId: 'video-2',
      enabled: false,
      locked: false,
      muted: false,
    });
    expect(engine.state.compositions[0]!.tracks[0]!.enabled).toBe(false);
    engine.undo();
    expect(engine.state.compositions[0]!.tracks[0]!.enabled).toBe(true);
    engine.undo();
    expect(engine.state.compositions[0]!.tracks[0]!.id).toBe('video-1');
  });

  it('rejects locked and incompatible track edits atomically', () => {
    const project = projectWithClips();
    project.compositions[0]!.tracks[1]!.locked = true;
    const engine = new EditorEngine(project);
    const before = engine.state;
    const compositionId = before.compositions[0]!.id;
    expect(() =>
      engine.commands.transaction('Invalid locked move', [
        {
          type: 'SET_CLIP_TIMING',
          compositionId,
          clipId: 'clip-a',
          startTime: 4,
          duration: 2,
        },
        {
          type: 'MOVE_CLIP',
          compositionId,
          clipId: 'clip-a',
          trackId: 'video-2',
        },
      ]),
    ).toThrow(/locked/);
    expect(engine.state).toBe(before);
    expect(engine.canUndo).toBe(false);
  });

  it('renders linked layers from clip timing and track/clip enabled state', () => {
    const engine = new EditorEngine(projectWithClips());
    const source = (time: number) => ({
      composition: engine.state.compositions[0]!,
      assets: engine.state.assets,
      background: '#000000',
      currentTime: time,
    });
    expect(deriveRenderItems(source(1)).items.map((item) => item.id)).toEqual([
      'layer-a',
    ]);
    expect(deriveRenderItems(source(4)).items.map((item) => item.id)).toEqual([
      'layer-b',
    ]);
    engine.commands.execute({
      type: 'SET_CLIP_ENABLED',
      compositionId: engine.state.compositions[0]!.id,
      clipId: 'clip-b',
      enabled: false,
    });
    expect(deriveRenderItems(source(4)).items).toEqual([]);
    engine.commands.transaction('Disable track', [
      {
        type: 'SET_CLIP_ENABLED',
        compositionId: engine.state.compositions[0]!.id,
        clipId: 'clip-b',
        enabled: true,
      },
      {
        type: 'SET_TRACK_STATE',
        compositionId: engine.state.compositions[0]!.id,
        trackId: 'video-1',
        enabled: false,
        locked: false,
        muted: false,
      },
    ]);
    expect(deriveRenderItems(source(4)).items).toEqual([]);
  });

  it('projects tracks once with multiple clips and keeps the linked Inspector timing', () => {
    const engine = new EditorEngine(projectWithClips());
    const root = document.createElement('div');
    document.body.append(root);
    const shell = mountEditorShell(
      root,
      engine,
      {},
      { render: vi.fn(() => ({ warnings: [], zoom: 1 })) },
    );
    clean.push(shell.dispose);
    expect(root.querySelectorAll('.timeline-nle-row')).toHaveLength(2);
    expect(root.querySelectorAll('.nle-clip')).toHaveLength(2);
    expect(root.querySelectorAll('.timeline-row')).toHaveLength(2);
    shell.session.select('layer-b');
    shell.refresh();
    root.querySelector<HTMLButtonElement>('[data-subtab="Timing"]')!.click();
    expect(
      root.querySelector<HTMLInputElement>('[data-field="Start time"] input')!
        .value,
    ).toBe('3');
    const duration = root.querySelector<HTMLInputElement>(
      '[data-field="Duration"] input',
    )!;
    duration.value = '4';
    duration.dispatchEvent(new Event('change', { bubbles: true }));
    expect(engine.state.compositions[0]!.tracks[0]!.clips[1]!.duration).toBe(4);
    expect(engine.history.undo.at(-1)!.commands[0]!.type).toBe(
      'SET_CLIP_TIMING',
    );
  });

  it('supports clip drag, source-aware trim, track movement and split/duplicate/delete', () => {
    const engine = new EditorEngine(projectWithClips());
    const session = new EditorSession(engine);
    const timeline = new TimelineInteraction(engine, session, () => {});
    clean.push(() => timeline.dispose());
    clean.push(() => session.dispose());
    session.select('layer-a');
    timeline.begin('layer-a', 'move');
    timeline.update(80, 'track:video-2');
    timeline.finish();
    let composition = engine.state.compositions[0]!;
    expect(composition.tracks[1]!.clips[0]!.startTime).toBe(1);
    expect(engine.history.undo).toHaveLength(1);

    timeline.begin('layer-a', 'right');
    timeline.update(80);
    timeline.finish();
    composition = engine.state.compositions[0]!;
    expect(composition.tracks[1]!.clips[0]!).toMatchObject({
      duration: 3,
      sourceIn: 0,
      sourceOut: 3,
    });

    session.setCurrentTime(2);
    performEdit(engine, session, 'split');
    expect(engine.state.compositions[0]!.tracks[1]!.clips).toHaveLength(2);
    performEdit(engine, session, 'duplicate');
    expect(engine.state.compositions[0]!.tracks[1]!.clips).toHaveLength(3);
    performEdit(engine, session, 'delete');
    expect(engine.state.compositions[0]!.tracks[1]!.clips).toHaveLength(2);
  });

  it('moves multiple selected clips in time and to one compatible track atomically', () => {
    const engine = new EditorEngine(projectWithClips());
    const session = new EditorSession(engine);
    const timeline = new TimelineInteraction(engine, session, () => {});
    clean.push(() => timeline.dispose());
    clean.push(() => session.dispose());
    session.selectMany(['layer-a', 'layer-b']);
    timeline.begin('layer-a', 'move');
    timeline.update(80, 'track:video-2');
    timeline.finish();
    const composition = engine.state.compositions[0]!;
    expect(composition.tracks[0]!.clips).toHaveLength(0);
    expect(
      composition.tracks[1]!.clips.map((item) => [item.id, item.startTime]),
    ).toEqual([
      ['clip-a', 1],
      ['clip-b', 4],
    ]);
    expect(engine.history.undo).toHaveLength(1);
    engine.undo();
    expect(
      engine.state.compositions[0]!.tracks[0]!.clips.map((item) => [
        item.id,
        item.startTime,
      ]),
    ).toEqual([
      ['clip-a', 0],
      ['clip-b', 3],
    ]);
  });
});
