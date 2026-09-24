// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EditorEngine,
  createProject,
  createLayer,
  serializeProject,
  deserializeProject,
  type Command,
} from '../src/core';
import { EditorSession } from '../src/ui/session';
import { Playback } from '../src/ui/playback';
import { performEdit, contextActions, selectionRoots } from '../src/ui/editing';
import { TimelineInteraction } from '../src/ui/timeline';
import { TransformInteraction } from '../src/ui/transform-interaction';
import { calculateTiming } from '../src/ui/timeline-model';
import { mountEditorShell } from '../src/ui/shell';
import legacyFixture from './fixtures/workspace-v2.json';
import { deriveRenderItems } from '../src/render/adapter';
const clean: (() => void)[] = [];
afterEach(() => {
  clean.splice(0).forEach((fn) => fn());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function setup() {
  const project = createProject();
  const composition = project.compositions[0]!;
  const a = createLayer('a', 'shape', 'A', 3);
  a.startTime = 1;
  const b = createLayer('b', 'text', 'B', 2);
  b.startTime = 5;
  composition.layers = [a, b];
  const engine = new EditorEngine(project);
  const session = new EditorSession(engine);
  clean.push(() => session.dispose());
  const timeline = new TimelineInteraction(engine, session, () => {});
  clean.push(() => timeline.dispose());
  const commands = (commands: Command[]) =>
    engine.commands.transaction('Test edit', commands);
  return { engine, session, timeline, commands, compositionId: composition.id };
}
describe('T3 editing workspace', () => {
  it('plays by elapsed time and FPS, pauses, resets and stops exactly at the boundary without history', () => {
    const s = setup();
    let callback: FrameRequestCallback = () => {};
    const cancel = vi.fn();
    const playback = new Playback(
      s.session,
      () => 100,
      (fn) => {
        callback = fn;
        return 1;
      },
      cancel,
    );
    clean.push(() => playback.dispose());
    const before = s.engine.state;
    playback.play();
    callback(1100);
    expect(s.session.currentTime).toBe(1);
    callback(3130);
    expect(s.session.currentTime).toBeCloseTo(3.0333333333);
    playback.pause();
    expect(s.session.playing).toBe(false);
    playback.play();
    callback(20100);
    expect(s.session.currentTime).toBe(7);
    expect(s.session.playing).toBe(false);
    playback.stop();
    expect(s.session.currentTime).toBe(0);
    expect(Object.is(s.engine.state, before)).toBe(true);
    expect(s.engine.canUndo).toBe(false);
  });
  it('moves multiple clips with one common bounded delta and one exact undo/redo boundary', () => {
    const s = setup();
    s.session.selectMany(['a', 'b']);
    const before = s.engine.state;
    s.timeline.begin('a', 'move');
    s.timeline.update(800);
    expect(s.timeline.previews.map((x) => x.startTime)).toEqual([11, 15]);
    expect(Object.is(s.engine.state, before)).toBe(true);
    s.timeline.finish();
    expect(s.engine.history.undo).toHaveLength(1);
    const after = s.engine.state;
    s.engine.undo();
    expect(s.engine.state).toEqual(before);
    s.engine.redo();
    expect(s.engine.state).toEqual(after);
    expect(() => s.timeline.begin('a', 'left')).toThrow(/one clip/);
  });
  it('multi-move cancel and exact return-to-start create no committed event', () => {
    const s = setup();
    s.session.selectMany(['a', 'b']);
    const changed = vi.fn();
    s.engine.on('state:changed', changed);
    s.timeline.begin('a', 'move');
    s.timeline.update(80);
    s.timeline.cancel();
    s.timeline.finish();
    s.timeline.begin('a', 'move');
    s.timeline.update(80);
    s.timeline.update(0);
    s.timeline.finish();
    expect(changed).not.toHaveBeenCalled();
  });
  it('duplicates and deletes selection atomically with fresh nested IDs and editable records', () => {
    const s = setup();
    s.session.selectMany(['a', 'b']);
    const before = s.engine.state;
    performEdit(s.engine, s.session, 'duplicate');
    const ids = s.session.selectedIds;
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain('a');
    const copies = selectionRoots(s.session.source, ids);
    expect(copies.map((x) => [x.startTime, x.duration])).toEqual([
      [1, 3],
      [5, 2],
    ]);
    expect(s.session.source.composition.duration).toBe(7);
    expect(s.engine.history.undo).toHaveLength(1);
    performEdit(s.engine, s.session, 'delete');
    expect(s.session.selectedIds).toEqual([]);
    s.engine.undo();
    expect(s.engine.state.compositions[0]!.layers).toHaveLength(4);
    s.engine.undo();
    expect(s.engine.state).toEqual(before);
  });
  it('splits only inside a clip, preserving references and properties with exact undo/redo', () => {
    const s = setup();
    s.session.select('a');
    s.session.setCurrentTime(2);
    const before = s.engine.state;
    performEdit(s.engine, s.session, 'split');
    const layers = s.engine.state.compositions[0]!.layers;
    expect(layers[0]!.duration).toBe(1);
    expect(layers.at(-1)!.startTime).toBe(2);
    expect(layers.at(-1)!.duration).toBe(2);
    expect(layers.at(-1)!.transform).toEqual(layers[0]!.transform);
    expect(s.session.source.composition.duration).toBe(7);
    expect(s.engine.history.undo).toHaveLength(1);
    const after = s.engine.state;
    s.engine.undo();
    expect(s.engine.state).toEqual(before);
    s.engine.redo();
    expect(s.engine.state).toEqual(after);
    s.session.setCurrentTime(10);
    expect(() => performEdit(s.engine, s.session, 'split')).toThrow();
  });
  it('moves shared Canvas selection with parent inverses and no persistent grouping', () => {
    const s = setup();
    s.session.selectMany(['a', 'b']);
    const interaction = new TransformInteraction(s.engine, s.session, () => {});
    clean.push(() => interaction.dispose());
    expect(interaction.begin('move', [0, 0])).toBe(true);
    interaction.update([20, 15]);
    expect(
      interaction.previews!.map((x) => x.transform.position.value),
    ).toEqual([
      [20, 15],
      [20, 15],
    ]);
    interaction.finish();
    expect(s.engine.history.undo).toHaveLength(1);
    expect(s.engine.state.compositions[0]!.layers.map((x) => x.type)).toEqual([
      'shape',
      'text',
    ]);
    s.engine.undo();
    expect(
      s.engine.state.compositions[0]!.layers[0]!.transform.position.value,
    ).toEqual([0, 0]);
  });
  it('deduplicates selected descendants for clone/move/delete', () => {
    const s = setup();
    const group = createLayer('g', 'group', 'Group');
    group.children = [createLayer('child', 'shape', 'Child')];
    s.commands([
      {
        type: 'CREATE_LAYER',
        compositionId: s.compositionId,
        parentId: null,
        layer: group,
      },
    ]);
    s.session.selectMany(['g', 'child']);
    expect(
      selectionRoots(s.session.source, s.session.selectedIds).map((x) => x.id),
    ).toEqual(['g']);
    performEdit(s.engine, s.session, 'duplicate');
    const copy = selectionRoots(s.session.source, s.session.selectedIds)[0]!;
    expect(copy.id).not.toBe('g');
    expect(copy.children[0]!.id).not.toBe('child');
  });
  it('marker mutations validate, serialize, snap and undo atomically', () => {
    const s = setup();
    s.session.setCurrentTime(4.5);
    performEdit(s.engine, s.session, 'marker');
    const marker = s.session.source.composition.markers[0]!;
    s.commands([
      {
        type: 'UPDATE_MARKER',
        compositionId: s.compositionId,
        marker: { ...marker, time: 4.7, label: 'Beat' },
      },
    ]);
    expect(
      calculateTiming(
        s.session.source,
        s.session.source.composition.layers[0]!,
        'right',
        52,
        80,
      ).duration,
    ).toBeCloseTo(3.7);
    const before = s.engine.state;
    expect(() =>
      s.commands([
        {
          type: 'UPDATE_MARKER',
          compositionId: s.compositionId,
          marker: { ...marker, time: 99 },
        },
      ]),
    ).toThrow();
    expect(Object.is(s.engine.state, before)).toBe(true);
    expect(
      deserializeProject(serializeProject(before)).compositions[0]!.markers[0]!
        .label,
    ).toBe('Beat');
    performEdit(s.engine, s.session, 'delete-marker', marker.id);
    expect(s.session.source.composition.markers).toEqual([]);
    s.engine.undo();
    expect(s.session.source.composition.markers).toHaveLength(1);
  });
  it('adds/removes typed keyframes, preserving transforms and validating atomic rollback', () => {
    const s = setup();
    const layer = s.session.source.composition.layers[0]!;
    s.commands([
      {
        type: 'SET_KEYFRAME',
        compositionId: s.compositionId,
        layerId: 'a',
        key: 'position',
        time: 2,
      },
    ]);
    expect(
      s.session.source.composition.layers[0]!.transform.position.keyframes,
    ).toEqual([{ time: 2, value: [0, 0] }]);
    expect(
      s.session.source.composition.layers[0]!.transform.position.value,
    ).toEqual(layer.transform.position.value);
    const before = s.engine.state;
    expect(() =>
      s.commands([
        {
          type: 'SET_KEYFRAME',
          compositionId: s.compositionId,
          layerId: 'a',
          key: 'opacity',
          time: 1,
        },
        {
          type: 'SET_KEYFRAME',
          compositionId: s.compositionId,
          layerId: 'a',
          key: 'position',
          time: 99,
        },
      ]),
    ).toThrow();
    expect(Object.is(s.engine.state, before)).toBe(true);
    s.commands([
      {
        type: 'REMOVE_KEYFRAME',
        compositionId: s.compositionId,
        layerId: 'a',
        key: 'position',
        time: 2,
      },
    ]);
    expect(
      s.session.source.composition.layers[0]!.transform.position.keyframes,
    ).toEqual([]);
    s.engine.undo();
    expect(
      s.session.source.composition.layers[0]!.transform.position.keyframes,
    ).toHaveLength(1);
    expect(
      deserializeProject(serializeProject(s.engine.state)).schemaVersion,
    ).toBe(5);
  });
  it('migrates schema 2 without changing existing timing/transforms', () => {
    const legacy = legacyFixture;
    const migrated = deserializeProject(JSON.stringify(legacy));
    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.compositions).toEqual(
      legacy.compositions.map((composition) => ({
        ...composition,
        tracks: [],
      })),
    );
    expect(legacy.schemaVersion).toBe(2);
  });
  it('resolves context actions by target and validity, not fake media capabilities', () => {
    const s = setup();
    expect(contextActions(s.session.source, [], 0)).toEqual(['marker']);
    expect(contextActions(s.session.source, ['a'], 2)).toContain('split');
    expect(contextActions(s.session.source, ['a', 'b'], 2)).not.toContain(
      'split',
    );
    expect(contextActions(s.session.source, ['a', 'b'], 2)).toContain('group');
    expect(contextActions(s.session.source, [], 0, 'marker')).toEqual([
      'delete-marker',
    ]);
  });
  it('routes sibling row drops and existing-asset drops through undoable commands', () => {
    const s = setup();
    s.commands([
      {
        type: 'ADD_ASSET',
        asset: {
          id: 'asset',
          type: 'video',
          name: 'Footage',
          source: { kind: 'local', reference: 'footage.mp4' },
          duration: 2,
          metadata: {},
        },
      },
    ]);
    const root = document.createElement('div');
    document.body.append(root);
    const shell = mountEditorShell(
      root,
      s.engine,
      {},
      { render: () => ({ warnings: [], zoom: 1 }) },
    );
    clean.push(shell.dispose);
    const data = new Map<string, string>();
    const transfer = {
      getData: (key: string) => data.get(key) ?? '',
      setData: (key: string, value: string) => data.set(key, value),
      types: ['application/x-editor-row'],
    };
    const drag = (type: string, target: Element, x = 384) => {
      const e = new MouseEvent(type, { bubbles: true, clientX: x });
      Object.defineProperty(e, 'dataTransfer', { value: transfer });
      target.dispatchEvent(e);
    };
    drag('dragstart', root.querySelector('[data-reorder-id="a"]')!);
    drag('drop', root.querySelector('[data-row-id="b"]')!);
    expect(s.engine.state.compositions[0]!.layers.map((l) => l.id)).toEqual([
      'b',
      'a',
    ]);
    expect(s.engine.history.undo.at(-1)!.commands).toHaveLength(1);
    s.engine.undo();
    expect(s.engine.state.compositions[0]!.layers.map((l) => l.id)).toEqual([
      'a',
      'b',
    ]);
    data.set('application/x-editor-asset', 'asset');
    transfer.types.push('application/x-editor-asset');
    drag('drop', root.querySelector('#timeline-foundation')!);
    const added = s.engine.state.compositions[0]!.layers.at(-1)!;
    expect(added).toMatchObject({
      assetId: 'asset',
      startTime: 2,
      duration: 2,
      type: 'video',
    });
    const nleTrack = s.engine.state.compositions[0]!.tracks[0]!;
    expect(nleTrack).toMatchObject({ name: 'Video 1', type: 'video' });
    expect(nleTrack.clips).toHaveLength(1);
    expect(nleTrack.clips[0]).toMatchObject({
      layerId: added.id,
      assetId: 'asset',
      startTime: 2,
      duration: 2,
    });
    expect(shell.session.selectedId).toBe(added.id);
    const trackBody = root.querySelector('[data-track-id] .timeline-track')!;
    drag('dragover', trackBody, 464);
    expect(root.querySelector('.asset-drop-target')).not.toBeNull();
    drag('drop', trackBody, 464);
    expect(root.querySelector('.asset-drop-target')).toBeNull();
    const secondLayer = s.engine.state.compositions[0]!.layers.at(-1)!;
    const selectedAfterSecond = shell.session.selectedId;
    expect(selectedAfterSecond).toBe(secondLayer.id);
    drag('drop', root.querySelector('[data-track-id] .timeline-track')!, 704);
    const composition = s.engine.state.compositions[0]!;
    const clips = composition.tracks[0]!.clips;
    expect(clips).toHaveLength(3);
    // TL-030 insert rule: the drop at 3 s lands inside the first clip (2..4),
    // moves to its nearer edge (2 s, ties go to the start) and pushes it to 4 s.
    expect(clips.map((clip) => clip.startTime)).toEqual([4, 2, 6]);
    expect(new Set(clips.map((clip) => clip.id))).toHaveProperty('size', 3);
    expect(new Set(clips.map((clip) => clip.layerId))).toHaveProperty(
      'size',
      3,
    );
    expect(clips[0]).toMatchObject({
      layerId: added.id,
      startTime: 4,
      sourceIn: 0,
      sourceOut: 2,
    });
    expect(clips[1]).toMatchObject({
      layerId: secondLayer.id,
      startTime: 2,
      sourceIn: 0,
      sourceOut: 2,
    });
    expect(composition.duration).toBe(8);
    expect(shell.session.selectedId).toBe(clips[2]!.layerId);
    for (const clip of clips) {
      root
        .querySelector<HTMLElement>(`.nle-clip[data-id="${clip.layerId}"]`)!
        .click();
      expect(shell.session.selectedId).toBe(clip.layerId);
    }
    expect(
      deserializeProject(serializeProject(s.engine.state)).compositions[0]!
        .tracks[0]!.clips,
    ).toEqual(clips);
    const thirdId = clips[2]!.id;
    s.engine.undo();
    expect(s.engine.state.compositions[0]!.tracks[0]!.clips).toHaveLength(2);
    expect(
      s.engine.state.compositions[0]!.tracks[0]!.clips.map((clip) => clip.id),
    ).not.toContain(thirdId);
    s.engine.redo();
    expect(s.engine.state.compositions[0]!.tracks[0]!.clips[2]!.id).toBe(
      thirdId,
    );
    s.engine.undo();
    s.engine.undo();
    expect(s.engine.state.compositions[0]!.tracks[0]!.clips).toHaveLength(1);
    s.engine.undo();
    expect(s.engine.state.compositions[0]!.layers).toHaveLength(2);
    s.engine.redo();
    expect(s.engine.state.compositions[0]!.layers.at(-1)!.id).toBe(added.id);
  });
  it('cancels marquee selection and marker previews safely, including document load', () => {
    const s = setup();
    const root = document.createElement('div');
    document.body.append(root);
    const shell = mountEditorShell(
      root,
      s.engine,
      {},
      { render: () => ({ warnings: [], zoom: 1 }) },
    );
    clean.push(shell.dispose);
    const timeline = root.querySelector<HTMLElement>('#timeline-foundation')!;
    const captures = new Set<number>();
    timeline.setPointerCapture = (id) => {
      captures.add(id);
    };
    timeline.hasPointerCapture = (id) => captures.has(id);
    timeline.releasePointerCapture = (id) => {
      captures.delete(id);
    };
    const pointer = (
      type: string,
      x: number,
      y: number,
      target: Element = timeline,
    ) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        clientX: x,
        clientY: y,
      });
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        isPrimary: { value: true },
      });
      target.dispatchEvent(event);
    };
    shell.session.select('b');
    pointer('pointerdown', 800, 80, root.querySelector('.timeline-track')!);
    pointer('pointermove', 300, 28);
    expect(root.querySelector('.timeline-marquee')).not.toBeNull();
    expect(shell.session.selectedIds).toContain('a');
    pointer('pointercancel', 300, 28);
    expect(shell.session.selectedIds).toEqual(['b']);
    expect(root.querySelector('.timeline-marquee')).toBeNull();
    expect(s.engine.canUndo).toBe(false);
    s.commands([
      {
        type: 'ADD_MARKER',
        compositionId: s.compositionId,
        marker: { id: 'm', time: 2, label: 'Cut' },
      },
    ]);
    const before = s.engine.state;
    pointer('pointerdown', 384, 10, root.querySelector('.timeline-marker')!);
    pointer('pointermove', 464, 10);
    pointer('pointercancel', 464, 10);
    expect(Object.is(s.engine.state, before)).toBe(true);
    pointer('pointerdown', 384, 10, root.querySelector('.timeline-marker')!);
    s.engine.load(createProject());
    expect(captures.size).toBe(0);
    pointer('pointerup', 464, 10);
    expect(s.engine.canUndo).toBe(false);
  });
  it('wires responsive controls, shared modifiers, timing inputs, keyboard and keyframe indicators', () => {
    const s = setup();
    const root = document.createElement('div');
    document.body.append(root);
    const shell = mountEditorShell(
      root,
      s.engine,
      {},
      { render: () => ({ warnings: [], zoom: 1 }) },
    );
    clean.push(shell.dispose);
    const left = root.querySelector<HTMLButtonElement>('[data-panel="left"]')!;
    const before = s.engine.state;
    left.click();
    expect(
      root
        .querySelector('.editor-shell')!
        .classList.contains('library-collapsed'),
    ).toBe(true);
    const select = (id: string, shift = false) =>
      root
        .querySelector(`[data-layer-id="${id}"]`)!
        .dispatchEvent(
          new MouseEvent('click', { bubbles: true, shiftKey: shift }),
        );
    select('a');
    select('b', true);
    expect(shell.session.selectedIds).toEqual(['a', 'b']);
    expect(root.querySelectorAll('.timeline-row.selected')).toHaveLength(2);
    expect(Object.is(s.engine.state, before)).toBe(true);
    select('a');
    root.querySelector<HTMLButtonElement>('[data-subtab="Timing"]')!.click();
    const input = root.querySelector<HTMLInputElement>(
      '[data-field="Start time"] input',
    )!;
    input.value = '2';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    input.dispatchEvent(new Event('blur'));
    expect(s.engine.history.undo).toHaveLength(1);
    expect(s.engine.state.compositions[0]!.layers[0]!.startTime).toBe(2);
    root.querySelector<HTMLButtonElement>('[data-subtab="Transform"]')!.click();
    root
      .querySelector<HTMLButtonElement>('[aria-label="Add Opacity keyframe"]')!
      .click();
    expect(root.querySelector('.timeline-keyframe')).not.toBeNull();
    shell.session.setCurrentTime(1);
    expect(
      root.querySelector('[aria-label="Add Opacity keyframe"]'),
    ).not.toBeNull();
    shell.session.setCurrentTime(0);
    expect(
      root.querySelector('[aria-label="Remove Opacity keyframe"]'),
    ).not.toBeNull();
    const timeline = root.querySelector('#timeline-foundation')!;
    timeline.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true }),
    );
    expect(s.engine.state.compositions[0]!.layers).toHaveLength(3);
    timeline.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }),
    );
    expect(s.engine.state.compositions[0]!.layers).toHaveLength(2);
    shell.session.setCurrentTime(9);
    expect(deriveRenderItems(shell.session.source).items).toHaveLength(0);
  });
});
