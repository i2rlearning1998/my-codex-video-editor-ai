// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EditorEngine,
  createComposition,
  createLayer,
  createProject,
  number,
  vector2,
  serializeProject,
} from '../src/core';
import { mountEditorShell } from '../src/ui/shell';
import { createExampleProject } from '../src/ui/example';
import { EditorSession } from '../src/ui/session';
import type { RenderSource } from '../src/render/adapter';
import type { Viewport } from '../src/render/canvas';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
});
function setup() {
  const project = createProject();
  project.compositions[0]!.width = 400;
  project.compositions[0]!.height = 200;
  const group = createLayer('group', 'group', 'Parent group');
  group.transform.position = vector2(100, 30);
  const layer = createLayer('child', 'shape', '<b>Canonical name</b>');
  layer.transform.position = vector2(10, 20);
  layer.properties = { width: number(50), height: number(40) };
  group.children = [layer];
  project.compositions[0]!.layers = [group];
  const engine = new EditorEngine(project);
  const root = document.createElement('div');
  document.body.append(root);
  const render = vi.fn(
    (
      _canvas: HTMLCanvasElement,
      _source: RenderSource,
      view: Viewport,
      _selected: string | null,
    ) => ({ warnings: [], zoom: view.matrix[0] }),
  );
  const shell = mountEditorShell(root, engine, {}, { render });
  disposers.push(shell.dispose);
  const stage = root.querySelector<HTMLElement>('#canvas-stage')!;
  Object.defineProperties(stage, {
    clientWidth: { value: 480 },
    clientHeight: { value: 280 },
  });
  shell.refresh();
  return {
    engine,
    root,
    shell,
    render,
    compositionId: project.compositions[0]!.id,
  };
}
function clickCanvas(root: HTMLElement, x: number, y: number) {
  root
    .querySelector('canvas')!
    .dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y }));
}

describe('editor shell integration', () => {
  it('establishes all regions and keeps the unselected inspector empty', () => {
    const { root } = setup();
    for (const label of [
      'Library',
      'Composition preview',
      'Inspector',
      'Timeline',
    ])
      expect(root.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
    expect(root.querySelectorAll('[data-category]')).toHaveLength(5);
    expect(root.querySelector('#inspector-content input')).toBeNull();
    expect(root.querySelector('.timeline canvas')).toBeNull();
    expect(root.querySelector('[data-derived-duration]')!.textContent).toBe(
      '10s content length',
    );
    expect(
      root.querySelector('.timeline-playhead')!.getAttribute('aria-label'),
    ).toBe('Drag playhead');
  });
  it('passes current canonical objects to the renderer, not cloned project/layer state', () => {
    const { engine, render } = setup();
    const source = render.mock.calls.at(-1)![1];
    expect(source.composition).toBe(engine.state.compositions[0]);
    expect(source.assets).toBe(engine.state.assets);
  });
  it('clicking a nested layer updates selection and inspector without state/history/events/autosave changes', () => {
    const { root, engine, shell, render } = setup();
    const before = engine.state;
    const text = serializeProject(before);
    const changed = vi.fn();
    engine.on('state:changed', changed);
    clickCanvas(root, 160, 100);
    expect(shell.session.selectedId).toBe('child');
    expect(render.mock.calls.at(-1)![3]).toBe('child');
    expect(
      root
        .querySelector('[data-layer-id="child"]')!
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(root.querySelector('.selected-name')!.textContent).toBe(
      '<b>Canonical name</b>',
    );
    expect(root.querySelector('.selected-name b')).toBeNull();
    expect(
      root.querySelector<HTMLInputElement>('[data-field="Position X"] input')!
        .value,
    ).toBe('10');
    expect(root.querySelector('[data-field="Parent"]')!.textContent).toBe(
      'Parent group',
    );
    expect(root.querySelector('[data-field="Width"]')!.textContent).toBe('50');
    expect(root.querySelector('[data-field="Type"]')!.textContent).toBe(
      'shape',
    );
    expect(engine.state).toBe(before);
    expect(serializeProject(engine.state)).toBe(text);
    expect(engine.canUndo).toBe(false);
    expect(changed).not.toHaveBeenCalled();
  });
  it('clears selection on empty canvas, outside composition, and Escape', () => {
    const { root, shell } = setup();
    clickCanvas(root, 160, 100);
    clickCanvas(root, 350, 200);
    expect(shell.session.selectedId).toBeNull();
    expect(root.querySelector('.inspector-empty')).not.toBeNull();
    clickCanvas(root, 160, 100);
    clickCanvas(root, 1, 1);
    expect(shell.session.selectedId).toBeNull();
    clickCanvas(root, 160, 100);
    root
      .querySelector('canvas')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(shell.session.selectedId).toBeNull();
  });
  it('reflects command changes in canvas and inspector and follows undo/redo', () => {
    const { engine, root, shell, render, compositionId } = setup();
    shell.session.select('child');
    engine.commands.transaction('Update from command system', [
      {
        type: 'SET_PROPERTY',
        compositionId,
        layerId: 'child',
        target: { kind: 'transform', key: 'position' },
        property: vector2(25, 35),
      },
      {
        type: 'SET_PROPERTY',
        compositionId,
        layerId: 'child',
        target: { kind: 'property', key: 'width' },
        property: number(90),
      },
    ]);
    expect(render.mock.calls.at(-1)![1].composition).toBe(
      engine.state.compositions[0],
    );
    expect(
      root.querySelector<HTMLInputElement>('[data-field="Position X"] input')!
        .value,
    ).toBe('25');
    expect(root.querySelector('[data-field="Width"]')!.textContent).toBe('90');
    engine.undo();
    expect(
      root.querySelector<HTMLInputElement>('[data-field="Position X"] input')!
        .value,
    ).toBe('10');
    engine.redo();
    expect(root.querySelector('[data-field="Width"]')!.textContent).toBe('90');
    expect(shell.session.selectedId).toBe('child');
  });
  it('clears stale selections when a layer is deleted or a document is loaded', () => {
    const { engine, shell, compositionId } = setup();
    shell.session.select('child');
    engine.commands.execute({
      type: 'DELETE_LAYER',
      compositionId,
      layerId: 'child',
    });
    expect(shell.session.selectedId).toBeNull();
    engine.undo();
    shell.session.select('child');
    engine.load(createProject());
    expect(shell.session.selectedId).toBeNull();
  });
  it('supports group selection from the scene list and switching compositions without canonical mutation', () => {
    const { engine, root, shell, compositionId } = setup();
    engine.commands.execute({
      type: 'CREATE_COMPOSITION',
      composition: createComposition({ id: 'second' }),
    });
    const before = engine.state;
    root.querySelector<HTMLButtonElement>('[data-layer-id="group"]')!.click();
    expect(shell.session.selectedId).toBe('group');
    expect(root.querySelector('[data-field="Width"]')!.textContent).toBe('—');
    const picker = root.querySelector<HTMLSelectElement>('#composition')!;
    picker.value = 'second';
    picker.dispatchEvent(new Event('change'));
    expect(shell.session.source.composition.id).toBe('second');
    expect(shell.session.selectedId).toBeNull();
    expect(engine.state).toBe(before);
    shell.session.selectComposition(compositionId);
    expect(shell.session.source.composition.id).toBe(compositionId);
  });
  it('library tabs are presentation-only and timeline interactions do not change state', () => {
    const { engine, root } = setup();
    const before = engine.state;
    root.querySelector<HTMLButtonElement>('[data-category="Media"]')!.click();
    expect(root.querySelector('#library-title')!.textContent).toBe(
      'A home for your footage',
    );
    root
      .querySelector('.timeline-track')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    root
      .querySelector('canvas')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    root
      .querySelector('canvas')!
      .dispatchEvent(
        new MouseEvent('pointermove', { clientX: 200, clientY: 100 }),
      );
    expect(engine.state).toBe(before);
    expect(engine.canUndo).toBe(false);
  });
  it('disposes subscriptions instead of retaining a hidden shell', () => {
    const { shell, render, engine, compositionId } = setup();
    shell.dispose();
    const calls = render.mock.calls.length;
    engine.commands.execute({
      type: 'DELETE_LAYER',
      compositionId,
      layerId: 'child',
    });
    expect(render.mock.calls).toHaveLength(calls);
  });
  it('example artwork is a valid serializable canonical project', () => {
    const engine = new EditorEngine(createExampleProject());
    const before = engine.state;
    const session = new EditorSession(engine);
    disposers.push(() => session.dispose());
    session.select('example-paper');
    expect(session.selectedId).toBe('example-paper');
    expect(engine.state).toBe(before);
    expect(JSON.parse(serializeProject(before)).schemaVersion).toBe(4);
  });
});
