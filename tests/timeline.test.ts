// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EditorEngine,
  createLayer,
  createProject,
  deserializeProject,
  serializeProject,
  frameToTime,
  timeToFrame,
  pixelToTime,
  timeToPixel,
  validateProject,
} from '../src/core';
import { deriveRenderItems, type RenderSource } from '../src/render/adapter';
import { mountEditorShell } from '../src/ui/shell';
import { calculateTiming, timelineRows } from '../src/ui/timeline-model';
import { TimelineInteraction } from '../src/ui/timeline';
const { readFileSync } = await vi.importActual<{
  readFileSync(path: string, encoding: 'utf8'): string;
}>('node:fs');
const timelineStyles = readFileSync('src/style.css', 'utf8');
import legacyFixture from './fixtures/timeline-v1.json';
import { LocalProjectStore } from '../src/persistence/local';

const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function setup() {
  const project = createProject();
  const composition = project.compositions[0]!;
  composition.width = 400;
  composition.height = 200;
  const a = createLayer('a', 'shape', 'First', 2);
  a.startTime = 1;
  const b = createLayer('b', 'text', 'Second', 2);
  b.startTime = 5;
  composition.layers = [a, b];
  const engine = new EditorEngine(project);
  const root = document.createElement('div');
  document.body.append(root);
  const render = vi.fn(() => ({ warnings: [], zoom: 1 }));
  const shell = mountEditorShell(root, engine, {}, { render });
  Object.defineProperties(root.querySelector('#canvas-stage')!, {
    clientWidth: { value: 480 },
    clientHeight: { value: 280 },
  });
  shell.refresh();
  cleanup.push(shell.dispose);
  const timeline = root.querySelector<HTMLElement>('#timeline-foundation')!;
  const captures = new Set<number>();
  timeline.setPointerCapture = (id) => {
    captures.add(id);
  };
  timeline.hasPointerCapture = (id) => captures.has(id);
  timeline.releasePointerCapture = (id) => {
    captures.delete(id);
  };
  const controller = new TimelineInteraction(engine, shell.session, () => {});
  cleanup.push(() => controller.dispose());
  const current = () => engine.state.compositions[0]!.layers[0]!;
  const clip = () =>
    root.querySelector<HTMLElement>('[data-action="clip"][data-id="a"]')!;
  const event = (
    type: string,
    x: number,
    target: HTMLElement = timeline,
    y = 0,
  ) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX: Number.isFinite(x) ? x : 0,
      clientY: y,
      button: 0,
    });
    Object.defineProperties(event, {
      clientX: { value: x },
      pointerId: { value: 1 },
      isPrimary: { value: true },
    });
    target.dispatchEvent(event);
  };
  return {
    engine,
    root,
    shell,
    timeline,
    controller,
    current,
    clip,
    event,
    captures,
    compositionId: composition.id,
  };
}
describe('timeline foundation', () => {
  it('derives duration from content and extends it after timing edits with exact undo/redo', () => {
    const s = setup();
    expect(s.engine.state.compositions[0]!.duration).toBe(7);
    expect(s.root.querySelector('[data-derived-duration]')!.textContent).toBe(
      '7s content length',
    );
    const before = s.engine.state;
    s.engine.commands.execute({
      type: 'SET_LAYER_TIMING',
      compositionId: s.compositionId,
      layerId: 'a',
      startTime: 8,
      duration: 4,
    });
    expect(s.engine.state.compositions[0]!.duration).toBe(12);
    expect(s.engine.history.undo).toHaveLength(1);
    expect(
      s.root.querySelector<HTMLElement>('.timeline-content')!.style.width,
    ).toBe('1208px');
    expect(s.root.querySelector('.timeline-ruler')!.textContent).toContain(
      '12s',
    );
    s.timeline.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true }),
    );
    expect(s.shell.session.currentTime).toBe(12);
    s.engine.undo();
    expect(s.engine.state).toEqual(before);
    expect(s.engine.state.compositions[0]!.duration).toBe(7);
    s.engine.redo();
    expect(s.engine.state.compositions[0]!.duration).toBe(12);
    expect(
      JSON.parse(serializeProject(s.engine.state)).compositions[0].duration,
    ).toBe(12);
    expect(s.shell.session.source.composition.duration).toBe(12);
  });
  it('keeps frame-derived duration readouts concise', () => {
    const s = setup();
    s.engine.commands.execute({
      type: 'SET_LAYER_TIMING',
      compositionId: s.compositionId,
      layerId: 'b',
      startTime: 10,
      duration: 1 / 30,
    });
    expect(s.root.querySelector('[data-composition-strip]')!.textContent).toBe(
      'Composition 1 · 10.033s · 30 fps',
    );
    expect(s.root.querySelector('[data-derived-duration]')!.textContent).toBe(
      '10.033s content length',
    );
  });
  it('recalculates after trim, move and deletion, with a safe empty minimum', () => {
    const s = setup();
    s.engine.commands.execute({
      type: 'SET_LAYER_TIMING',
      compositionId: s.compositionId,
      layerId: 'b',
      startTime: 5,
      duration: 5,
    });
    expect(s.engine.state.compositions[0]!.duration).toBe(10);
    s.engine.commands.execute({
      type: 'SET_LAYER_TIMING',
      compositionId: s.compositionId,
      layerId: 'b',
      startTime: 5,
      duration: 1,
    });
    expect(s.engine.state.compositions[0]!.duration).toBe(6);
    s.engine.commands.execute({
      type: 'SET_LAYER_TIMING',
      compositionId: s.compositionId,
      layerId: 'a',
      startTime: 10,
      duration: 2,
    });
    expect(s.engine.state.compositions[0]!.duration).toBe(12);
    s.engine.commands.execute({
      type: 'DELETE_LAYER',
      compositionId: s.compositionId,
      layerId: 'a',
    });
    expect(s.engine.state.compositions[0]!.duration).toBe(6);
    s.engine.commands.execute({
      type: 'DELETE_LAYER',
      compositionId: s.compositionId,
      layerId: 'b',
    });
    expect(s.engine.state.compositions[0]!.duration).toBe(10);
    expect(Number.isFinite(s.engine.state.compositions[0]!.duration)).toBe(
      true,
    );
  });

  it('keeps the ruler sticky in the horizontal scroll space and transport outside scrolling rows', () => {
    const s = setup();
    const style = document.createElement('style');
    style.textContent = timelineStyles;
    document.body.append(style);
    const scroll = s.root.querySelector<HTMLElement>('.timeline-scroll')!;
    const bar = s.root.querySelector<HTMLElement>('.timeline-ruler-bar')!;
    const transport = s.root.querySelector<HTMLElement>('.timeline-controls')!;
    const header = s.root.querySelector<HTMLElement>('.timeline-row-header')!;
    expect(getComputedStyle(bar).position).toBe('sticky');
    expect(getComputedStyle(bar).top).toBe('0px');
    expect(scroll.contains(bar)).toBe(true);
    expect(scroll.contains(transport)).toBe(false);
    expect(getComputedStyle(header).position).toBe('sticky');
    expect(getComputedStyle(header).left).toBe('0px');
    expect(bar.contains(s.root.querySelector('.timeline-playhead'))).toBe(true);
    scroll.scrollTop = 100;
    scroll.scrollLeft = 300;
    scroll.dispatchEvent(new Event('scroll'));
    expect(s.root.querySelector('.timeline-ruler-bar')).toBe(bar);
    expect(s.root.querySelector('.timeline-controls')).toBe(transport);
    expect(transport.textContent).toContain('0.000s / 7s');
  });
  it('uses composition duration beyond ten seconds for ruler, scrolling, clip movement and zoom', () => {
    const s = setup();
    const project = JSON.parse(serializeProject(s.engine.state));
    project.compositions[0].layers[1].startTime = 73;
    s.engine.load(project);
    expect(
      s.root.querySelector<HTMLElement>('.timeline-content')!.style.width,
    ).toBe('6248px');
    expect(s.root.querySelector('.timeline-ruler')!.textContent).toContain(
      '75s',
    );
    const scroll = s.root.querySelector<HTMLElement>('.timeline-scroll')!;
    scroll.scrollLeft = 1600;
    s.event(
      'pointerdown',
      384,
      s.root.querySelector<HTMLElement>('.timeline-ruler')!,
    );
    s.event('pointerup', 384);
    expect(s.shell.session.currentTime).toBe(22);
    s.controller.begin('a', 'move');
    s.controller.update(1600);
    s.controller.finish();
    expect(s.current().startTime).toBe(21);
    s.shell.session.setTimelineZoom(160);
    expect(s.clip().style.left).toBe('3360px');
    expect(
      s.root.querySelector<HTMLElement>('.timeline-content')!.style.width,
    ).toBe('12248px');
  });
  it('combines pointer X timing and Y sibling reorder in one history entry and cancels safely', () => {
    const s = setup();
    const scroll = s.root.querySelector<HTMLElement>('.timeline-scroll')!;
    vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 200,
      left: 0,
      right: 1000,
      width: 1000,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const before = s.engine.state;
    s.event('pointerdown', 320, s.clip(), 45);
    s.event('pointermove', 400, s.timeline, 79);
    expect(
      s.root.querySelector('.drop-target')?.getAttribute('data-row-id'),
    ).toBe('b');
    expect(s.engine.state).toBe(before);
    s.event('pointerup', 400, s.timeline, 79);
    expect(s.engine.state.compositions[0]!.layers.map((l) => l.id)).toEqual([
      'b',
      'a',
    ]);
    expect(s.engine.state.compositions[0]!.layers[1]!.startTime).toBe(2);
    expect(s.engine.history.undo).toHaveLength(1);
    expect(s.engine.history.undo[0]!.commands.map((c) => c.type)).toEqual([
      'SET_LAYER_TIMING',
      'MOVE_LAYER',
    ]);
    const after = s.engine.state;
    s.engine.undo();
    expect(s.engine.state).toEqual(before);
    s.engine.redo();
    expect(s.engine.state).toEqual(after);
    s.engine.undo();
    s.event('pointerdown', 320, s.clip(), 45);
    s.event('pointermove', 320, s.timeline, 79);
    s.event('pointercancel', 320, s.timeline, 79);
    expect(s.engine.state).toEqual(before);
    expect(s.engine.canUndo).toBe(false);
    s.event('pointerdown', 320, s.clip(), 45);
    s.event('pointermove', 320, s.timeline, 79);
    s.event('pointerup', 320, s.timeline, 45);
    expect(s.engine.canUndo).toBe(false);
    s.shell.session.selectMany(['a', 'b']);
    s.controller.begin('a', 'move');
    s.controller.update(0, 'b');
    s.controller.finish();
    expect(s.engine.canUndo).toBe(false);
  });

  it('releases playhead capture on document replacement without overwriting the new session time', () => {
    const s = setup();
    s.event(
      'pointerdown',
      384,
      s.root.querySelector<HTMLElement>('.timeline-ruler')!,
    );
    expect(s.captures.size).toBe(1);
    s.engine.load(createProject());
    expect(s.captures.size).toBe(0);
    s.event('pointerup', 700);
    expect(s.shell.session.currentTime).toBe(0);
    expect(s.engine.canUndo).toBe(false);
  });
  it('derives nested rows and resets transient time on composition changes/load', () => {
    const s = setup();
    const project = deserializeProject(JSON.stringify(legacyFixture));
    s.engine.load(project);
    const rows = timelineRows(s.shell.session.source, 80);
    expect(
      rows.map((row) => [row.layer.id, row.parentId, row.depth, row.index]),
    ).toEqual([
      ['g', null, 0, 0],
      ['a', 'g', 1, 0],
    ]);
    s.shell.session.setCurrentTime(6);
    s.shell.session.selectComposition(project.compositions[0]!.id);
    expect(s.shell.session.currentTime).toBe(0);
    expect(s.shell.session.selectedId).toBeNull();
    s.shell.session.setCurrentTime(3);
    s.engine.load(project);
    expect(s.shell.session.currentTime).toBe(0);
    expect(s.engine.canUndo).toBe(false);
  });
  it('loads legacy saves without writing and preserves the original backup on first schema-2 save', () => {
    const original = JSON.stringify(legacyFixture);
    const values = new Map([['project', original]]);
    const setItem = vi.fn((key: string, value: string) => {
      values.set(key, value);
    });
    const store = new LocalProjectStore(
      {
        getItem: (key) => values.get(key) ?? null,
        setItem,
        removeItem: (key) => {
          values.delete(key);
        },
      },
      'project',
    );
    const loaded = store.load();
    expect(loaded.project!.schemaVersion).toBe(4);
    expect(setItem).not.toHaveBeenCalled();
    store.save(loaded.project!);
    expect(values.get('project:backup')).toBe(original);
    expect(JSON.parse(values.get('project')!).schemaVersion).toBe(4);
    values.set(
      'project',
      JSON.stringify({ ...legacyFixture, schemaVersion: 99 }),
    );
    const future = values.get('project');
    expect(() => store.save(loaded.project!)).toThrow();
    expect(values.get('project')).toBe(future);
  });
  it('projects canonical rows and pixel timing without copied layer data', () => {
    const s = setup();
    const rows = timelineRows(s.shell.session.source, 80);
    expect(rows.map((row) => [row.left, row.width])).toEqual([
      [80, 160],
      [400, 160],
    ]);
    expect(rows[0]!.layer).toBe(s.current());
    expect(s.clip().style.left).toBe('80px');
    expect(s.clip().style.width).toBe('160px');
  });
  it('shares reversible time/pixel conversion and FPS-aware nearest-frame conversion', () => {
    expect(timeToPixel(2.5, 80)).toBe(200);
    expect(pixelToTime(200, 80)).toBe(2.5);
    for (const fps of [24, 30, 60, 29.97]) {
      expect(timeToFrame(frameToTime(45, fps), fps)).toBe(45);
    }
    expect(() => pixelToTime(1, 0)).toThrow();
    expect(() => timeToPixel(Infinity, 80)).toThrow();
  });
  it('clamps transient playhead and zoom, keeping ruler/clip/playhead alignment without events', () => {
    const s = setup();
    const before = s.engine.state;
    const changed = vi.fn();
    s.engine.on('state:changed', changed);
    s.shell.session.setCurrentTime(99);
    expect(s.shell.session.currentTime).toBe(7);
    s.shell.session.setCurrentTime(-1);
    expect(s.shell.session.currentTime).toBe(0);
    s.shell.session.setCurrentTime(2);
    s.shell.session.setTimelineZoom(160);
    expect(s.clip().style.left).toBe('160px');
    expect(s.clip().style.width).toBe('320px');
    expect(
      s.root.querySelector<HTMLElement>('.timeline-playhead')!.style.left,
    ).toBe('544px');
    s.shell.session.setTimelineZoom(999);
    expect(s.shell.session.timelineZoom).toBe(400);
    s.shell.session.setTimelineZoom(0);
    expect(s.shell.session.timelineZoom).toBe(10);
    expect(() => s.shell.session.setCurrentTime(NaN)).toThrow();
    expect(Object.is(s.engine.state, before)).toBe(true);
    expect(changed).not.toHaveBeenCalled();
    expect(s.engine.canUndo).toBe(false);
  });
  it('seeks with ruler/captured playhead, keyboard and cancellation without project changes', () => {
    const s = setup();
    const before = s.engine.state;
    s.event(
      'pointerdown',
      384,
      s.root.querySelector<HTMLElement>('.timeline-ruler')!,
    );
    expect(s.shell.session.currentTime).toBe(2);
    s.event('pointermove', 464);
    expect(s.shell.session.currentTime).toBe(3);
    s.event('pointercancel', 464);
    expect(s.shell.session.currentTime).toBe(0);
    expect(s.captures.size).toBe(0);
    s.event(
      'pointerdown',
      384,
      s.root.querySelector<HTMLElement>('.timeline-ruler')!,
    );
    s.event('pointerup', 384);
    s.timeline.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
      }),
    );
    expect(s.shell.session.currentTime).toBeCloseTo(2 + 10 / 30);
    for (const [key, time] of [
      ['End', 7],
      ['Home', 0],
    ] as const) {
      s.timeline.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true }),
      );
      expect(s.shell.session.currentTime).toBe(time);
    }
    expect(Object.is(s.engine.state, before)).toBe(true);
  });
  it('filters Canvas by half-open time intervals including ancestor timing', () => {
    const s = setup();
    s.shell.session.setCurrentTime(1);
    expect(
      deriveRenderItems(s.shell.session.source).items.map((x) => x.id),
    ).toEqual(['a']);
    s.shell.session.setCurrentTime(3);
    expect(deriveRenderItems(s.shell.session.source).items).toEqual([]);
    const project = createProject();
    const group = createLayer('g', 'group', 'Group', 2);
    group.startTime = 2;
    group.children = [createLayer('child', 'shape', 'Child')];
    project.compositions[0]!.layers = [group];
    const source = {
      composition: project.compositions[0]!,
      assets: [],
      background: '#000000',
    } as unknown as RenderSource;
    expect(deriveRenderItems({ ...source, currentTime: 1 }).items).toEqual([]);
    expect(
      deriveRenderItems({ ...source, currentTime: 2 }).items.map((x) => x.id),
    ).toEqual(['child']);
  });
  it.each(['move', 'left', 'right'] as const)(
    '%s preview commits one validated transaction and supports exact undo/redo',
    (kind) => {
      const s = setup();
      const before = s.engine.state;
      const changed = vi.fn();
      s.engine.on('state:changed', changed);
      s.controller.begin('a', kind);
      s.controller.update(80);
      expect(Object.is(s.engine.state, before)).toBe(true);
      expect(changed).not.toHaveBeenCalled();
      s.controller.finish();
      expect([s.current().startTime, s.current().duration]).toEqual(
        kind === 'move' ? [2, 2] : kind === 'left' ? [2, 1] : [1, 3],
      );
      expect(s.engine.history.undo).toHaveLength(1);
      expect(s.engine.history.undo[0]!.commands[0]!.type).toBe(
        'SET_LAYER_TIMING',
      );
      const after = s.engine.state;
      s.engine.undo();
      expect(s.engine.state).toEqual(before);
      s.engine.redo();
      expect(s.engine.state).toEqual(after);
      expect(
        s.root.querySelector<HTMLInputElement>(
          '[data-field="Start time"] input',
        )!.value,
      ).toBe(String(s.current().startTime));
      expect(
        s.root.querySelector<HTMLInputElement>('[data-field="Duration"] input')!
          .value,
      ).toBe(String(s.current().duration));
    },
  );
  it.each(['move', 'left', 'right'] as const)(
    '%s cancel and return-to-start are no history/autosave operations',
    (kind) => {
      const s = setup();
      const before = s.engine.state;
      const changed = vi.fn();
      s.engine.on('state:changed', changed);
      s.controller.begin('a', kind);
      s.controller.update(80);
      s.controller.cancel();
      s.controller.finish();
      s.controller.begin('a', kind);
      s.controller.update(80);
      s.controller.update(0);
      s.controller.finish();
      expect(Object.is(s.engine.state, before)).toBe(true);
      expect(s.engine.canUndo).toBe(false);
      expect(changed).not.toHaveBeenCalled();
    },
  );
  it('drags and trims through pointer events, cancelling on Escape/blur/invalid coordinates', () => {
    const s = setup();
    s.event('pointerdown', 320, s.clip());
    s.event('pointermove', 400);
    expect(s.current().startTime).toBe(1);
    expect(s.clip().style.left).toBe('160px');
    s.event('pointerup', 400);
    expect(s.current().startTime).toBe(2);
    expect(s.captures.size).toBe(0);
    const edge = s.clip().querySelector<HTMLElement>('.right')!;
    s.event('pointerdown', 544, edge);
    s.event('pointerup', 624);
    expect(s.current().duration).toBe(3);
    const before = s.engine.state;
    for (const cancel of [
      () =>
        s.timeline.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        ),
      () => window.dispatchEvent(new Event('blur')),
      () => s.event('pointerup', Infinity),
    ]) {
      s.event('pointerdown', 420, s.clip());
      s.event('pointermove', 460);
      cancel();
      expect(Object.is(s.engine.state, before)).toBe(true);
      expect(s.captures.size).toBe(0);
    }
  });
  it('keeps movement and trims positive while allowing content to extend the end', () => {
    const s = setup();
    const source = s.shell.session.source;
    expect(calculateTiming(source, s.current(), 'move', 99999, 80)).toEqual({
      startTime: 1251,
      duration: 2,
    });
    expect(calculateTiming(source, s.current(), 'move', -99999, 80)).toEqual({
      startTime: 0,
      duration: 2,
    });
    const left = calculateTiming(source, s.current(), 'left', 99999, 80);
    expect(left.duration).toBeCloseTo(1 / 30);
    expect(left.startTime + left.duration).toBe(3);
    const right = calculateTiming(source, s.current(), 'right', 99999, 80);
    expect(right).toEqual({ startTime: 1, duration: 1252 });
  });
  it.each([
    { startTime: -1, duration: 2 },
    { startTime: 1, duration: 0 },
    { startTime: NaN, duration: 2 },
  ])('rejects invalid command timing %j atomically', (timing) => {
    const s = setup();
    const before = s.engine.state;
    expect(() =>
      s.engine.commands.transaction('Invalid trim', [
        {
          type: 'SET_LAYER_TIMING',
          compositionId: s.compositionId,
          layerId: 'b',
          startTime: 4,
          duration: 2,
        },
        {
          type: 'SET_LAYER_TIMING',
          compositionId: s.compositionId,
          layerId: 'a',
          ...timing,
        },
      ]),
    ).toThrow();
    expect(Object.is(s.engine.state, before)).toBe(true);
    expect(s.engine.canUndo).toBe(false);
  });
  it('snaps starts and ends without changing the candidate clip', () => {
    const s = setup();
    const other = s.engine.state.compositions[0]!.layers[1];
    const source = s.shell.session.source;
    expect(calculateTiming(source, s.current(), 'move', 154, 80)).toEqual({
      startTime: 3,
      duration: 2,
    }); // moving end -> other start
    expect(calculateTiming(source, s.current(), 'move', 474, 80)).toEqual({
      startTime: 7,
      duration: 2,
    }); // moving start -> other end
    expect(calculateTiming(source, s.current(), 'right', 154, 80)).toEqual({
      startTime: 1,
      duration: 4,
    });
    s.controller.begin('a', 'move');
    s.controller.update(154);
    s.controller.finish();
    expect(s.engine.state.compositions[0]!.layers[1]).toEqual(other);
  });
  it('shares timeline, scene-list and Canvas selection without mutation', () => {
    const s = setup();
    const before = s.engine.state;
    s.clip().click();
    expect(s.shell.session.selectedId).toBe('a');
    expect(
      s.root.querySelector('[data-layer-id="a"]')!.getAttribute('aria-pressed'),
    ).toBe('true');
    s.shell.session.setCurrentTime(5);
    s.root
      .querySelector('canvas')!
      .dispatchEvent(new MouseEvent('click', { clientX: 60, clientY: 60 }));
    expect(s.shell.session.selectedId).toBe('b');
    expect(
      s.root
        .querySelector('[data-action="clip"][data-id="b"]')!
        .getAttribute('aria-pressed'),
    ).toBe('true');
    s.shell.session.select(null);
    expect(s.root.querySelectorAll('.timeline-row.selected')).toHaveLength(0);
    expect(Object.is(s.engine.state, before)).toBe(true);
  });
  it('reorders canonical siblings through MOVE_LAYER and deletes through existing command', () => {
    const s = setup();
    s.root
      .querySelector<HTMLButtonElement>('[data-action="down"][data-id="a"]')!
      .click();
    expect(s.engine.state.compositions[0]!.layers.map((x) => x.id)).toEqual([
      'b',
      'a',
    ]);
    expect(s.engine.history.undo[0]!.commands[0]!.type).toBe('MOVE_LAYER');
    s.engine.undo();
    s.clip().click();
    s.timeline.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }),
    );
    expect(s.engine.state.compositions[0]!.layers.map((x) => x.id)).toEqual([
      'b',
    ]);
    expect(s.shell.session.selectedId).toBeNull();
  });
  it('offers only working context actions and preserves scroll during refresh', () => {
    const s = setup();
    const scroll = s.root.querySelector<HTMLElement>('.timeline-scroll')!;
    scroll.scrollLeft = 70;
    s.clip().dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 100 }),
    );
    expect(s.root.querySelector<HTMLElement>('.timeline-menu')!.hidden).toBe(
      false,
    );
    expect(s.shell.session.selectedId).toBe('a');
    expect(scroll.scrollLeft).toBe(70);
    s.clip().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    s.root
      .querySelector<HTMLButtonElement>(
        '.timeline-menu [data-action="delete"]',
      )!
      .click();
    expect(s.engine.state.compositions[0]!.layers.map((x) => x.id)).toEqual([
      'b',
    ]);
  });
  it('migrates nested schema-1 layers to full composition timing without losing content', () => {
    const original = JSON.stringify(legacyFixture);
    const migrated = deserializeProject(original);
    expect(migrated.schemaVersion).toBe(4);
    const group = migrated.compositions[0]!.layers[0]!;
    expect([group.startTime, group.duration]).toEqual([0, 12]);
    expect([group.children[0]!.startTime, group.children[0]!.duration]).toEqual(
      [0, 12],
    );
    expect(group.children[0]!.properties.text!.value).toBe('Preserve me');
    expect(JSON.stringify(legacyFixture)).toBe(original);
    expect(deserializeProject(serializeProject(migrated))).toEqual(migrated);
    expect(
      validateProject({
        ...migrated,
        compositions: [{ ...migrated.compositions[0], duration: 1 }],
      }).compositions[0]!.duration,
    ).toBe(12);
    expect(() =>
      deserializeProject(
        JSON.stringify({ ...legacyFixture, unknown: 'preserve or reject' }),
      ),
    ).toThrow();
  });
});
