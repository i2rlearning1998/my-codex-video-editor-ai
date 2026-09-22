// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EditorEngine,
  createProject,
  createLayer,
  number,
  vector2,
  transformPoint,
  worldTransform,
  type Point2,
} from '../src/core';
import { mountEditorShell } from '../src/ui/shell';
import { buildTransformCommands } from '../src/ui/transform-commands';
import {
  deriveRenderItems,
  locateLayer,
  type RenderSource,
} from '../src/render/adapter';
import { fitViewport, type Viewport } from '../src/render/canvas';
import { layoutText } from '../src/render/text-layout';
import {
  DEFAULT_TRANSFORM_CAPABILITIES,
  transformCapabilities,
} from '../src/render/transform-capabilities';
import { hitHandle, selectionGeometry } from '../src/render/selection';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function setup(
  nested: boolean | number = false,
  ratio = 1,
  size = [480, 280],
  type: 'shape' | 'text' = 'shape',
) {
  const project = createProject();
  const composition = project.compositions[0]!;
  composition.width = 400;
  composition.height = 200;
  const layer = createLayer('child', type, 'Shape');
  layer.transform.position = vector2(30, 40);
  layer.properties = { width: number(100), height: number(60) };
  if (type === 'text') {
    layer.properties.fontSize = number(10);
    layer.properties.text = {
      type: 'string',
      value: 'Alpha beta gamma delta epsilon zeta eta theta',
      animated: false,
      keyframes: [],
      constraints: [],
    };
  }
  layer.transform.position.constraints = [{ tag: 'reserved metadata' }];
  if (nested) {
    const group = createLayer('group', 'group', 'Group');
    group.transform.position = vector2(250, 10);
    group.transform.scale = vector2(1.5, 0.75);
    group.transform.rotation = number(90);
    group.children = [layer];
    composition.layers = [group];
    if (nested === 2) {
      const outer = createLayer('outer', 'group', 'Outer');
      outer.transform.position = vector2(100, 20);
      outer.transform.rotation = number(25);
      outer.transform.scale = vector2(-1.2, 0.6);
      outer.children = [group];
      composition.layers = [outer];
    }
  } else composition.layers = [layer];
  vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(ratio);
  const engine = new EditorEngine(project);
  const root = document.createElement('div');
  document.body.append(root);
  const render = vi.fn(
    (
      _canvas: HTMLCanvasElement,
      source: RenderSource,
      view: Viewport,
      _selected: string | null,
    ) => ({
      zoom: view.matrix[0],
      warnings: deriveRenderItems(source).warnings,
    }),
  );
  const shell = mountEditorShell(root, engine, {}, { render });
  disposers.push(shell.dispose);
  const stage = root.querySelector('#canvas-stage')!;
  Object.defineProperties(stage, {
    clientWidth: { configurable: true, value: size[0] },
    clientHeight: { configurable: true, value: size[1] },
  });
  shell.refresh();
  const canvas = root.querySelector('canvas')!;
  const captured = new Set<number>();
  canvas.setPointerCapture = vi.fn((id) => {
    captured.add(id);
  });
  canvas.hasPointerCapture = (id) => captured.has(id);
  canvas.releasePointerCapture = vi.fn((id) => {
    captured.delete(id);
  });
  const event = (
    type: string,
    point: Point2,
    options: { shiftKey?: boolean; pointerId?: number } = {},
  ) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: point[0],
      clientY: point[1],
      shiftKey: options.shiftKey ?? false,
      button: 0,
    });
    Object.defineProperties(event, {
      pointerId: { value: options.pointerId ?? 1 },
      isPrimary: { value: true },
    });
    canvas.dispatchEvent(event);
  };
  const source = () => shell.session.source;
  const view = () =>
    fitViewport(size[0]!, size[1]!, source().composition, ratio);
  const screen = (local: Point2): Point2 =>
    transformPoint(
      view().matrix,
      transformPoint(
        worldTransform(source().composition, 'child').matrix,
        local,
      ),
    );
  const current = () =>
    locateLayer(engine.state.compositions[0]!.layers, 'child')!.layer;
  const input = (field: string) =>
    root.querySelector<HTMLInputElement>(`[data-field="${field}"] input`)!;
  const edit = (field: string, value: string) => {
    input(field).value = value;
    input(field).dispatchEvent(new Event('change', { bubbles: true }));
  };
  const geometry = () =>
    selectionGeometry(source(), shell.session.selectedId, view().matrix)!;
  return {
    root,
    engine,
    shell,
    canvas,
    render,
    event,
    screen,
    current,
    source,
    view,
    input,
    edit,
    geometry,
    captured,
    compositionId: composition.id,
  };
}

describe('canvas command interactions', () => {
  it('selects without history, previews without canonical writes, commits one move, and synchronizes inspector/undo/redo', () => {
    const s = setup();
    const before = s.engine.state;
    const changed = vi.fn();
    s.engine.on('state:changed', changed);
    const start = s.screen([40, 30]);
    s.event('pointerdown', start);
    expect(s.shell.session.selectedId).toBe('child');
    expect(s.canvas.setPointerCapture).toHaveBeenCalledWith(1);
    expect(s.engine.state).toBe(before);
    expect(s.engine.canUndo).toBe(false);
    for (let i = 1; i <= 30; i++)
      s.event('pointermove', [start[0] + i, start[1] + i / 2]);
    expect(s.engine.state).toBe(before);
    expect(changed).not.toHaveBeenCalled();
    expect(s.input('Position X').value).toBe('30');
    const preview = s.render.mock.calls.at(-1)![1];
    expect(preview.composition).toBe(before.compositions[0]);
    expect(deriveRenderItems(preview).items[0]!.matrix[4]).toBe(60);
    s.event('pointerup', [start[0] + 30, start[1] + 15]);
    expect(s.current().transform.position.value).toEqual([60, 55]);
    expect(
      (s.current().transform.position as unknown as { constraints: unknown })
        .constraints,
    ).toEqual([{ tag: 'reserved metadata' }]);
    expect(s.input('Position X').value).toBe('60');
    expect(changed).toHaveBeenCalledOnce();
    expect(s.captured.size).toBe(0);
    expect(s.render.mock.calls.at(-1)![1].preview).toBeUndefined();
    s.engine.undo();
    expect(s.current().transform.position.value).toEqual([30, 40]);
    expect(s.engine.canUndo).toBe(false);
    expect(s.input('Position Y').value).toBe('40');
    s.engine.redo();
    expect(s.input('Position Y').value).toBe('55');
    expect(s.render.mock.calls.at(-1)![1].composition).toBe(
      s.engine.state.compositions[0],
    );
  });
  it('deselects on empty pointer clicks without creating an edit', () => {
    const s = setup();
    s.shell.session.select('child');
    const before = s.engine.state;
    s.event('pointerdown', [400, 220]);
    s.event('pointerup', [400, 220]);
    expect(s.shell.session.selectedId).toBeNull();
    expect(s.engine.state).toBe(before);
  });
  it.each(['pointercancel', 'lostpointercapture', 'escape', 'blur', 'resize'])(
    'cancels %s with no mutation, autosave event or history',
    (reason) => {
      const s = setup();
      const before = s.engine.state;
      const changed = vi.fn();
      s.engine.on('state:changed', changed);
      const start = s.screen([40, 30]);
      s.event('pointerdown', start);
      s.event('pointermove', [start[0] + 20, start[1]]);
      if (reason === 'escape')
        s.root
          .querySelector('canvas')!
          .dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
          );
      else if (reason === 'blur' || reason === 'resize')
        window.dispatchEvent(new Event(reason));
      else s.event(reason, start);
      s.event('pointerup', [start[0] + 20, start[1]]);
      expect(s.engine.state).toBe(before);
      expect(s.engine.canUndo).toBe(false);
      expect(changed).not.toHaveBeenCalled();
      expect(s.captured.size).toBe(0);
      expect(s.render.mock.calls.at(-1)![1].preview).toBeUndefined();
    },
  );
  it.each([0, 2, 30])(
    'treats zero distance, sub-threshold, or returned-to-start movement (%s) as no-op',
    (distance) => {
      const s = setup();
      const before = s.engine.state;
      const start = s.screen([40, 30]);
      s.event('pointerdown', start);
      s.event('pointermove', [start[0] + distance, start[1]]);
      s.event('pointerup', start);
      expect(s.engine.state).toBe(before);
      expect(s.engine.canUndo).toBe(false);
    },
  );
  it('uses the final rapid pointer position outside the canvas and ignores unrelated pointers', () => {
    const s = setup();
    const start = s.screen([40, 30]);
    s.event('pointerdown', start);
    s.event('pointermove', [1000, 900], { pointerId: 2 });
    s.event('pointerup', [start[0] + 600, start[1] - 200]);
    expect(s.current().transform.position.value).toEqual([630, -160]);
  });
  it('converts child movement through a rotated, nonuniformly scaled parent', () => {
    const s = setup(true);
    const start = s.screen([40, 30]);
    s.event('pointerdown', start);
    s.event('pointerup', [start[0] - 15, start[1] + 30]);
    expect(s.current().transform.position.value[0]).toBeCloseTo(50);
    expect(s.current().transform.position.value[1]).toBeCloseTo(60);
    expect(s.engine.state.compositions[0]!.layers[0]!.children[0]!.id).toBe(
      'child',
    );
  });
  it.each([1, 2, 4])(
    'keeps logical pointer geometry independent of DPR %s',
    (ratio) => {
      const s = setup(false, ratio);
      const start = s.screen([40, 30]);
      s.event('pointerdown', start);
      s.event('pointerup', [start[0] + 20, start[1] + 10]);
      expect(s.current().transform.position.value).toEqual([50, 50]);
    },
  );
  it('converts a tiny fitted viewport without NaN or canonical pixel-ratio scaling', () => {
    const s = setup(false, 4, [20, 10]);
    const start = s.screen([40, 30]);
    s.event('pointerdown', start);
    s.event('pointerup', [start[0] + 3, start[1]]);
    expect(s.current().transform.position.value[0]).toBeCloseTo(1230);
    expect(s.current().transform.position.value.every(Number.isFinite)).toBe(
      true,
    );
  });
  it('rejects invalid coordinates during a gesture', () => {
    const s = setup();
    const before = s.engine.state;
    const start = s.screen([40, 30]);
    s.event('pointerdown', start);
    const event = new MouseEvent('pointermove');
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      clientX: { value: NaN },
    });
    s.canvas.dispatchEvent(event);
    s.event('pointerup', [start[0] + 10, start[1]]);
    expect(s.engine.state).toBe(before);
    expect(s.captured.size).toBe(0);
    expect(s.root.querySelector('#status')!.textContent).toContain(
      'Invalid pointer',
    );
  });
  it('cancels safely if pointer capture cannot be obtained', () => {
    const s = setup();
    const before = s.engine.state;
    s.canvas.setPointerCapture = () => {
      throw new Error('Capture unavailable');
    };
    s.event('pointerdown', s.screen([40, 30]));
    s.event('pointerup', [200, 180]);
    expect(s.engine.state).toBe(before);
    expect(s.engine.canUndo).toBe(false);
  });
  it('cancels a stale gesture on selection changes and external commands', () => {
    const s = setup();
    const start = s.screen([40, 30]);
    s.event('pointerdown', start);
    s.event('pointermove', [start[0] + 20, start[1]]);
    s.shell.session.select(null);
    s.event('pointerup', [start[0] + 20, start[1]]);
    expect(s.engine.canUndo).toBe(false);
    s.event('pointerdown', start);
    s.event('pointermove', [start[0] + 20, start[1]]);
    s.engine.commands.execute({
      type: 'SET_PROPERTY',
      compositionId: s.compositionId,
      layerId: 'child',
      target: { kind: 'transform', key: 'position' },
      property: vector2(80, 90),
    });
    s.event('pointerup', [start[0] + 20, start[1]]);
    expect(s.current().transform.position.value).toEqual([80, 90]);
    s.engine.undo();
    expect(s.engine.canUndo).toBe(false);
  });
  it.each([false, true])(
    'resizes proportionally from a corner with Shift=%s and one undo boundary',
    (shiftKey) => {
      const s = setup();
      s.shell.session.select('child');
      const corner = s.geometry().corners[2]!;
      s.event('pointerdown', corner);
      s.event('pointermove', [corner[0] + 50, corner[1] + 15], { shiftKey });
      s.event('pointerup', [corner[0] + 50, corner[1] + 15], { shiftKey });
      expect(s.current().transform.scale.value).toEqual([1.5, 1.5]);
      expect(s.current().transform.position.value).toEqual([30, 40]);
      expect(s.current().properties.width!.value).toBe(100);
      s.engine.undo();
      expect(s.current().transform.scale.value).toEqual([1, 1]);
      expect(s.engine.canUndo).toBe(false);
      s.engine.redo();
      expect(s.input('Scale X').value).toBe('1.5');
    },
  );
  it('resizes a rotated nested child while holding the opposite world corner fixed', () => {
    const s = setup(true);
    s.shell.session.select('child');
    s.edit('Rotation', '35');
    const before = s.geometry();
    const moving = before.corners[0]!;
    const fixed = before.corners[2]!;
    s.event('pointerdown', [moving[0] + 2, moving[1] + 2]);
    s.event('pointerup', [moving[0] - 18, moving[1] - 13]);
    expect(s.geometry().corners[2]![0]).toBeCloseTo(fixed[0]);
    expect(s.geometry().corners[2]![1]).toBeCloseTo(fixed[1]);
    expect(s.current().transform.rotation.value).toBe(35);
    const after = s.current().transform;
    s.engine.undo();
    expect(s.current().transform.scale.value).toEqual([1, 1]);
    s.engine.redo();
    expect(s.current().transform).toEqual(after);
  });
  it('rotates clockwise around the visual center and supports undo/redo', () => {
    const s = setup();
    s.shell.session.select('child');
    const geometry = s.geometry();
    const handle = geometry.rotation;
    const anchor = geometry.center;
    const end: Point2 = [
      anchor[0] - (handle[1] - anchor[1]),
      anchor[1] + (handle[0] - anchor[0]),
    ];
    s.event('pointerdown', handle);
    s.event('pointerup', end);
    expect(s.current().transform.rotation.value).toBeCloseTo(90);
    expect(s.current().transform.position.value).toEqual([110, 20]);
    expect(s.geometry().center).toEqual(anchor);
    s.engine.undo();
    expect(s.current().transform.rotation.value).toBe(0);
    expect(s.engine.canUndo).toBe(false);
    s.engine.redo();
    expect(Number(s.input('Rotation').value)).toBeCloseTo(90);
  });
  it('derives a group box and previews/commits a group resize without changing child local data', () => {
    const s = setup(true);
    s.shell.session.select('group');
    const before = s.current().transform;
    const corner = s.geometry().corners[2]!;
    s.event('pointerdown', corner);
    s.event('pointerup', [corner[0] - 15, corner[1] + 30]);
    expect(s.current().transform).toEqual(before);
    expect(s.engine.canUndo).toBe(true);
    s.engine.undo();
    expect(s.engine.canUndo).toBe(false);
  });
});

describe('inspector shares the canonical command path', () => {
  it.each([
    ['Position X', '52'],
    ['Position Y', '-12.5'],
    ['Scale X', '-2'],
    ['Scale Y', '0'],
    ['Rotation', '450'],
    ['Opacity', '0.25'],
  ])('commits %s, refreshes canvas, and follows undo/redo', (field, value) => {
    const s = setup();
    s.shell.session.select('child');
    const before = s.input(field).value;
    expect(s.root.querySelectorAll('#inspector-content input')).toHaveLength(8);
    s.edit(field, value);
    expect(s.input(field).value).toBe(value);
    expect(s.render.mock.calls.at(-1)![1].composition).toBe(
      s.engine.state.compositions[0],
    );
    const item = deriveRenderItems(s.render.mock.calls.at(-1)![1]).items[0]!;
    if (field === 'Opacity') expect(item.opacity).toBe(0.25);
    if (field === 'Position X') expect(item.matrix[4]).toBe(52);
    s.engine.undo();
    expect(s.input(field).value).toBe(before);
    expect(s.engine.canUndo).toBe(false);
    s.engine.redo();
    expect(s.input(field).value).toBe(value);
  });
  it.each([
    ['Position X', ''],
    ['Rotation', 'Infinity'],
    ['Opacity', '-0.1'],
    ['Opacity', '1.01'],
  ])('rejects invalid %s=%s without changing history', (field, value) => {
    const s = setup();
    s.shell.session.select('child');
    const before = s.engine.state;
    s.edit(field, value);
    expect(s.engine.state).toBe(before);
    expect(s.engine.canUndo).toBe(false);
    expect(s.root.querySelector('#status')!.textContent).toContain('finite');
  });
  it('supports Enter commit, Escape revert, and unchanged values without duplicate edits', () => {
    const s = setup();
    s.shell.session.select('child');
    s.edit('Position X', '30');
    expect(s.engine.canUndo).toBe(false);
    let input = s.input('Position X');
    input.value = '50';
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(s.engine.canUndo).toBe(false);
    expect(input.value).toBe('30');
    input = s.input('Position X');
    input.value = '50';
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    expect(s.input('Position X').value).toBe('50');
    s.engine.undo();
    expect(s.engine.canUndo).toBe(false);
  });
});

describe('Tier 2.2.1 professional interaction contract', () => {
  it.each(['shape', 'text'] as const)(
    'derives the %s handle capabilities and a dedicated outside rotation handle',
    (type) => {
      const s = setup(false, 1, [480, 280], type);
      s.shell.session.select('child');
      const overlay = s.geometry();
      expect(
        overlay.handles.filter((handle) => handle.kind === 'corner'),
      ).toHaveLength(4);
      expect(
        overlay.handles.filter((handle) => handle.kind === 'edge'),
      ).toHaveLength(type === 'text' ? 0 : 4);
      expect(
        overlay.handles.filter((handle) => handle.kind === 'text-width'),
      ).toHaveLength(type === 'text' ? 2 : 0);
      expect(overlay.rotation[1]).toBeLessThan(
        Math.min(...overlay.corners.map((point) => point[1])),
      );
      expect(overlay.rotation[0]).toBe(overlay.top[0]);
      expect(
        hitHandle(s.source(), 'child', s.view().matrix, overlay.rotation),
      ).toBe('rotate');
      expect(s.engine.canUndo).toBe(false);
    },
  );
  it('keeps the visual center fixed under nested rotation and commits position + rotation atomically', () => {
    const s = setup(true);
    s.shell.session.select('child');
    const before = s.engine.state;
    const center = s.geometry().center;
    const handle = s.geometry().rotation;
    // Parent inverse: world delta (-.75*y, 1.5*x); rotate the parent-space pointer vector +90.
    const dx = handle[0] - center[0],
      dy = handle[1] - center[1];
    const end: Point2 = [center[0] - dy / 2, center[1] + dx * 2];
    s.event('pointerdown', handle);
    s.event('pointermove', end);
    expect(s.engine.state).toBe(before);
    s.event('pointerup', end);
    expect(s.current().transform.rotation.value).toBeCloseTo(90);
    expect(s.geometry().center[0]).toBeCloseTo(center[0], 10);
    expect(s.geometry().center[1]).toBeCloseTo(center[1], 10);
    expect(s.engine.history.undo).toHaveLength(1);
    const after = s.engine.state;
    s.engine.undo();
    expect(s.engine.state).toEqual(before);
    s.engine.redo();
    expect(s.engine.state).toEqual(after);
    expect(Number(s.input('Rotation').value)).toBeCloseTo(90);
  });
  it('rotates smoothly across the angular branch cut and updates the inspector', () => {
    const s = setup();
    s.shell.session.select('child');
    const center = s.geometry().center;
    const start = s.geometry().rotation;
    const radius = Math.hypot(start[0] - center[0], start[1] - center[1]);
    const point = (degrees: number): Point2 => [
      center[0] + Math.cos((degrees * Math.PI) / 180) * radius,
      center[1] + Math.sin((degrees * Math.PI) / 180) * radius,
    ];
    s.event('pointerdown', start);
    for (const angle of [-150, -179, 179, 170])
      s.event('pointermove', point(angle));
    s.event('pointerup', point(170));
    expect(Number(s.input('Rotation').value)).toBeCloseTo(-100);
    expect(s.geometry().center[0]).toBeCloseTo(center[0]);
    expect(s.geometry().center[1]).toBeCloseTo(center[1]);
    expect(s.engine.history.undo).toHaveLength(1);
  });
  it('inspector rotation also compensates position to preserve the same center', () => {
    const s = setup(true);
    s.shell.session.select('child');
    const center = s.geometry().center;
    s.edit('Rotation', '47');
    expect(s.geometry().center[0]).toBeCloseTo(center[0], 10);
    expect(s.geometry().center[1]).toBeCloseTo(center[1], 10);
    expect(s.current().transform.rotation.value).toBe(47);
    expect(s.engine.history.undo).toHaveLength(1);
  });
  it.each(['top', 'right', 'bottom', 'left'] as const)(
    'resizes the %s edge along local axes with the opposite edge fixed',
    (edge) => {
      const s = setup();
      s.shell.session.select('child');
      const overlay = s.geometry(),
        handle = overlay.handles.find((item) => item.id === edge)!;
      const opposite = (
        { top: 'bottom', bottom: 'top', right: 'left', left: 'right' } as const
      )[edge];
      const fixed = overlay.handles.find((item) => item.id === opposite)!.point;
      const horizontal = edge === 'left' || edge === 'right';
      const end: Point2 = [
        handle.point[0] + (horizontal ? 20 : 0),
        handle.point[1] + (horizontal ? 0 : 15),
      ];
      s.event('pointerdown', handle.point);
      s.event('pointerup', end, { shiftKey: true });
      expect(
        s.geometry().handles.find((item) => item.id === opposite)!.point,
      ).toEqual(fixed);
      expect(s.current().transform.scale.value[horizontal ? 1 : 0]).toBe(1);
      expect(s.engine.history.undo).toHaveLength(1);
      s.engine.undo();
      expect(s.current().transform.scale.value).toEqual([1, 1]);
    },
  );
  it('resizes a reflected rotated edge under a nonuniform parent without drifting the opposite edge', () => {
    const s = setup(true);
    s.shell.session.select('child');
    s.edit('Scale X', '-1');
    s.edit('Rotation', '33');
    const before = s.geometry(),
      handle = before.handles.find((item) => item.id === 'right')!.point,
      fixed = before.handles.find((item) => item.id === 'left')!.point;
    s.event('pointerdown', handle);
    s.event('pointerup', [handle[0] + 20, handle[1] - 17]);
    const actual = s
      .geometry()
      .handles.find((item) => item.id === 'left')!.point;
    expect(actual[0]).toBeCloseTo(fixed[0], 10);
    expect(actual[1]).toBeCloseTo(fixed[1], 10);
    expect(s.current().transform.scale.value[1]).toBe(1);
  });
  it.each(['left', 'right'] as const)(
    'text %s width control reflows and preserves scale/font and opposite top corner',
    (side) => {
      const s = setup(false, 1, [480, 280], 'text');
      s.shell.session.select('child');
      const before = s.engine.state;
      const overlay = s.geometry();
      const start = overlay.handles.find(
        (item) => item.id === `text-${side}`,
      )!.point;
      const fixed = overlay.corners[side === 'right' ? 0 : 1]!;
      const end: Point2 = [start[0] + (side === 'right' ? -50 : 50), start[1]];
      s.event('pointerdown', start);
      s.event('pointermove', end);
      expect(s.engine.state).toBe(before);
      const preview = s.render.mock.calls.at(-1)![1];
      const item = deriveRenderItems(preview).items[0]!;
      expect(item.size.width).toBe(50);
      expect(item.lines!.length).toBeGreaterThan(1);
      expect(item.size.height).toBe(item.lines!.length * 12);
      s.event('pointerup', end);
      expect(s.current().properties.width!.value).toBe(50);
      expect(s.current().properties.height!.value).toBe(item.size.height);
      expect(s.current().properties.fontSize!.value).toBe(10);
      expect(s.current().transform.scale.value).toEqual([1, 1]);
      expect(s.geometry().corners[side === 'right' ? 0 : 1]).toEqual(fixed);
      expect(s.engine.history.undo).toHaveLength(1);
      const after = s.engine.state;
      s.engine.undo();
      expect(s.engine.state).toEqual(before);
      expect(s.engine.canUndo).toBe(false);
      s.engine.redo();
      expect(s.engine.state).toEqual(after);
    },
  );
  it('text width uses inverse local and parent transforms, including reflection', () => {
    const s = setup(true, 1, [480, 280], 'text');
    s.shell.session.select('child');
    s.edit('Scale X', '-2');
    s.edit('Rotation', '30');
    const before = s.geometry(),
      start = before.handles.find((item) => item.id === 'text-left')!.point;
    const localStart = s.screen([0, 30]),
      localEnd = s.screen([20, 30]);
    s.event('pointerdown', start);
    s.event('pointerup', [
      start[0] + localEnd[0] - localStart[0],
      start[1] + localEnd[1] - localStart[1],
    ]);
    expect(s.current().properties.width!.value).toBeCloseTo(80);
    expect(s.current().transform.scale.value).toEqual([-2, 1]);
    expect(s.current().transform.rotation.value).toBe(30);
    expect(s.geometry().corners[1]![0]).toBeCloseTo(before.corners[1]![0]);
    expect(s.geometry().corners[1]![1]).toBeCloseTo(before.corners[1]![1]);
  });
  it('text corners scale the whole object without changing box width, height, or font size', () => {
    const s = setup(false, 1, [480, 280], 'text');
    s.shell.session.select('child');
    const before = s.current().properties;
    const start = s.geometry().corners[2]!;
    s.event('pointerdown', start);
    s.event('pointerup', [start[0] + 50, start[1] + 10]);
    expect(s.current().transform.scale.value).toEqual([1.5, 1.5]);
    expect(s.current().properties).toEqual(before);
    expect(s.engine.history.undo).toHaveLength(1);
  });
  it.each(['rotate', 'right', 'text-right'] as const)(
    'cancels %s after updates without history or autosave notifications',
    (id) => {
      const s = setup(
        false,
        1,
        [480, 280],
        id === 'text-right' ? 'text' : 'shape',
      );
      s.shell.session.select('child');
      const before = s.engine.state;
      const changed = vi.fn();
      s.engine.on('state:changed', changed);
      const start = s.geometry().handles.find((item) => item.id === id)!.point;
      s.event('pointerdown', start);
      s.event('pointermove', [start[0] + 20, start[1] - 10]);
      s.event('pointercancel', start);
      s.event('pointerup', [200, 100]);
      expect(s.engine.state).toBe(before);
      expect(s.engine.canUndo).toBe(false);
      expect(changed).not.toHaveBeenCalled();
      expect(s.captured.size).toBe(0);
    },
  );
  it.each(['rotate', 'right', 'text-right'] as const)(
    'return-to-start %s is an exact no-op',
    (id) => {
      const s = setup(
        false,
        1,
        [480, 280],
        id === 'text-right' ? 'text' : 'shape',
      );
      s.shell.session.select('child');
      const before = s.engine.state;
      const start = s.geometry().handles.find((item) => item.id === id)!.point;
      s.event('pointerdown', start);
      s.event('pointermove', [start[0] + 20, start[1] - 10]);
      s.event('pointerup', start);
      expect(s.engine.state).toBe(before);
      expect(s.engine.canUndo).toBe(false);
    },
  );
  it('vertical-only text width movement does not enable wrapping or create an edit', () => {
    const s = setup(false, 1, [480, 280], 'text');
    s.shell.session.select('child');
    const before = s.engine.state;
    const start = s
      .geometry()
      .handles.find((item) => item.id === 'text-right')!.point;
    s.event('pointerdown', start);
    s.event('pointerup', [start[0], start[1] + 20]);
    expect(s.engine.state).toBe(before);
  });
  it.each([1, 2, 4])(
    'keeps handle hit regions, hover feedback, and width edits logical at DPR %s',
    (ratio) => {
      const s = setup(false, ratio, [480, 280], 'text');
      s.shell.session.select('child');
      const handle = s
        .geometry()
        .handles.find((item) => item.id === 'text-right')!;
      expect(
        hitHandle(s.source(), 'child', s.view().matrix, [
          handle.point[0] + 8,
          handle.point[1],
        ]),
      ).toBe('text-right');
      s.event('pointermove', handle.point);
      expect(s.canvas.style.cursor).toBe('ew-resize');
      expect(s.render.mock.calls.at(-1)![1].hoveredHandle).toBe('text-right');
      s.event('pointerdown', handle.point);
      s.event('pointerup', [handle.point[0] + 20, handle.point[1]]);
      expect(s.current().properties.width!.value).toBe(120);
    },
  );
  it('prioritizes rotation then corners in a tiny overlay and rejects invalid hit coordinates', () => {
    const s = setup(false, 4, [20, 10], 'text');
    s.shell.session.select('child');
    const overlay = s.geometry();
    expect(
      hitHandle(s.source(), 'child', s.view().matrix, overlay.rotation),
    ).toBe('rotate');
    expect(
      hitHandle(s.source(), 'child', s.view().matrix, overlay.center),
    ).toBe(0);
    expect(
      hitHandle(s.source(), 'child', s.view().matrix, [NaN, 0]),
    ).toBeNull();
  });
  it('moves a selected group by its descendant body without changing child local data', () => {
    const s = setup(true);
    s.shell.session.select('group');
    const child = s.current().transform;
    const start = s.screen([40, 30]);
    s.event('pointerdown', start);
    s.event('pointerup', [start[0] + 20, start[1] + 10]);
    expect(s.shell.session.selectedId).toBe('group');
    expect(s.current().transform).toEqual(child);
    expect(
      s.engine.state.compositions[0]!.layers[0]!.transform.position.value,
    ).toEqual([270, 20]);
    expect(s.engine.history.undo).toHaveLength(1);
  });
  it('accepts explicit type policies without exposing unknown/future tools by default', () => {
    expect(transformCapabilities('unknown').rotate).toBe(false);
    const policy = {
      ...DEFAULT_TRANSFORM_CAPABILITIES,
      extension: {
        move: true,
        rotate: false,
        corners: false,
        edges: false,
        textWidth: false,
      },
    };
    expect(transformCapabilities('extension', policy).move).toBe(true);
    const s = setup();
    s.shell.session.select('child');
    const overlay = selectionGeometry(
      { ...s.source(), capabilities: { shape: policy.extension } },
      'child',
      s.view().matrix,
    )!;
    expect(overlay.handles).toEqual([]);
    expect(overlay.capabilities.move).toBe(true);
  });
  it('wraps deterministically with explicit newlines, long words, and invalid metric rejection', () => {
    const measure = (text: string) => Array.from(text).length * 10;
    expect(layoutText('one two\nabcdef', 35, 10, measure).lines).toEqual([
      'one',
      'two',
      'abc',
      'def',
    ]);
    expect(layoutText('', 1, 10, measure).height).toBe(12);
    expect(() => layoutText('text', 0, 10, measure)).toThrow();
    expect(() => layoutText('text', 20, 10, () => NaN)).toThrow();
  });
  it('keeps nested group rotation centered while preserving descendant local records', () => {
    const s = setup(2);
    s.shell.session.select('group');
    const child = s.current().transform;
    const center = s.geometry().center;
    s.edit('Rotation', '137');
    expect(s.geometry().center[0]).toBeCloseTo(center[0], 9);
    expect(s.geometry().center[1]).toBeCloseTo(center[1], 9);
    expect(s.current().transform).toEqual(child);
    const overlay = s.geometry();
    // A transformed top side has its own normal, not a screen-axis-aligned box.
    const edge: Point2 = [
      overlay.corners[1]![0] - overlay.top[0],
      overlay.corners[1]![1] - overlay.top[1],
    ];
    const stem: Point2 = [
      overlay.rotation[0] - overlay.top[0],
      overlay.rotation[1] - overlay.top[1],
    ];
    expect(edge[0] * stem[0] + edge[1] * stem[1]).toBeCloseTo(0, 8);
    expect(Math.hypot(...stem)).toBeCloseTo(34);
    expect(s.engine.history.undo).toHaveLength(1);
    s.engine.undo();
    expect(s.engine.canUndo).toBe(false);
  });
  it('retains width property metadata and persists editable text with the current schema', () => {
    const s = setup(false, 1, [480, 280], 'text');
    const property = number(100);
    property.constraints = [{ reserved: 'width metadata' }];
    s.engine.commands.execute({
      type: 'SET_PROPERTY',
      compositionId: s.compositionId,
      layerId: 'child',
      target: { kind: 'property', key: 'width' },
      property,
    });
    s.shell.session.select('child');
    const start = s
      .geometry()
      .handles.find((handle) => handle.id === 'text-right')!.point;
    s.event('pointerdown', start);
    s.event('pointerup', [start[0] - 40, start[1]]);
    const json = JSON.parse(JSON.stringify(s.engine.state));
    const loaded = new EditorEngine(json);
    const layer = loaded.state.compositions[0]!.layers[0]!;
    expect(json.schemaVersion).toBe(4);
    expect(layer.properties.width!.value).toBe(60);
    expect(
      JSON.parse(JSON.stringify(layer.properties.width)).constraints,
    ).toEqual([{ reserved: 'width metadata' }]);
    expect(layer.properties.text!.value).toBe(
      s.current().properties.text!.value,
    );
    expect(layer.properties.textWrap!.value).toBe(true);
  });
  it('rejects incompatible text properties without partial writes or history', () => {
    const s = setup(false, 1, [480, 280], 'text');
    s.engine.commands.execute({
      type: 'SET_PROPERTY',
      compositionId: s.compositionId,
      layerId: 'child',
      target: { kind: 'property', key: 'textWrap' },
      property: {
        type: 'string',
        value: 'reserved',
        animated: false,
        keyframes: [],
        constraints: [],
      },
    });
    s.shell.session.select('child');
    const before = s.engine.state,
      history = s.engine.history;
    const start = s
      .geometry()
      .handles.find((handle) => handle.id === 'text-right')!.point;
    s.event('pointerdown', start);
    s.event('pointerup', [start[0] + 20, start[1]]);
    expect(s.engine.state).toBe(before);
    expect(s.engine.history).toEqual(history);
    expect(s.root.querySelector('#status')!.textContent).toContain(
      'incompatible',
    );
  });
  it('clamps text width at one local unit and keeps font and scale intact', () => {
    const s = setup(false, 1, [480, 280], 'text');
    s.shell.session.select('child');
    const start = s
      .geometry()
      .handles.find((handle) => handle.id === 'text-right')!.point;
    s.event('pointerdown', start);
    s.event('pointerup', [start[0] - 200, start[1]]);
    expect(s.current().properties.width!.value).toBe(1);
    expect(s.current().properties.fontSize!.value).toBe(10);
    expect(s.current().transform.scale.value).toEqual([1, 1]);
    expect(s.engine.history.undo).toHaveLength(1);
  });
  it('rejects invalid text-width coordinates and discards an already reflowed preview', () => {
    const s = setup(false, 1, [480, 280], 'text');
    s.shell.session.select('child');
    const before = s.engine.state;
    const start = s
      .geometry()
      .handles.find((handle) => handle.id === 'text-left')!.point;
    s.event('pointerdown', start);
    s.event('pointermove', [start[0] + 20, start[1]]);
    const event = new MouseEvent('pointerup');
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      clientX: { value: Infinity },
    });
    s.canvas.dispatchEvent(event);
    expect(s.engine.state).toBe(before);
    expect(s.engine.canUndo).toBe(false);
    expect(s.captured.size).toBe(0);
    expect(s.render.mock.calls.at(-1)![1].preview).toBeUndefined();
  });
  it('ignores tangential movement of a rotated edge without a numerical history edit', () => {
    const s = setup(true);
    s.shell.session.select('child');
    s.edit('Rotation', '33');
    const before = s.engine.state;
    const start = s
      .geometry()
      .handles.find((handle) => handle.id === 'right')!.point;
    const a = s.screen([100, 30]),
      b = s.screen([100, 50]);
    s.event('pointerdown', start);
    s.event('pointerup', [start[0] + b[0] - a[0], start[1] + b[1] - a[1]]);
    expect(s.engine.state).toBe(before);
  });
  it('rolls back all text-box commands on invalid layout results and preserves redo', () => {
    const s = setup(false, 1, [480, 280], 'text');
    s.shell.session.select('child');
    s.edit('Position X', '60');
    s.engine.undo();
    const before = s.engine.state,
      history = s.engine.history;
    const commands = buildTransformCommands(
      s.compositionId,
      s.current(),
      { ...s.current().transform, position: { value: [55, 40] } },
      { width: 80, height: NaN },
    );
    expect(() =>
      s.engine.commands.transaction('Invalid layout', commands),
    ).toThrow();
    expect(s.engine.state).toBe(before);
    expect(s.engine.history).toEqual(history);
    expect(s.engine.canRedo).toBe(true);
  });
});

describe('Tier 2.2.2 uniform corner scaling', () => {
  it.each([
    { name: 'top-left', corner: 0, nested: false, rotation: 0, sx: 1 },
    { name: 'top-right', corner: 1, nested: false, rotation: 0, sx: 1 },
    { name: 'bottom-right', corner: 2, nested: false, rotation: 0, sx: 1 },
    { name: 'bottom-left', corner: 3, nested: false, rotation: 0, sx: 1 },
    { name: 'rotated', corner: 2, nested: false, rotation: 37, sx: 1 },
    { name: 'nested', corner: 2, nested: true, rotation: 37, sx: 1 },
    {
      name: 'reflected unequal scales',
      corner: 2,
      nested: true,
      rotation: 37,
      sx: -2,
    },
  ])(
    'preserves ratio and opposite corner for $name',
    ({ corner, nested, rotation, sx }) => {
      const s = setup(nested);
      s.shell.session.select('child');
      if (sx !== 1) s.edit('Scale X', String(sx));
      if (rotation) s.edit('Rotation', String(rotation));
      const before = s.engine.state;
      const historyLength = s.engine.history.undo.length;
      const overlay = s.geometry();
      const fixedIndex = (corner + 2) % 4;
      const fixed = overlay.corners[fixedIndex]!;
      const start = overlay.corners[corner]!;
      const x = corner === 1 || corner === 2 ? 100 : 0;
      const y = corner >= 2 ? 60 : 0;
      // Deliberately unequal candidate multipliers: 1.5 on X, 1.1 on Y.
      const end = s.screen([x + (x ? 50 : -50), y + (y ? 6 : -6)]);
      s.event('pointerdown', start);
      s.event('pointerup', end);
      expect(s.current().transform.scale.value[0]).toBeCloseTo(sx * 1.5, 10);
      expect(s.current().transform.scale.value[1]).toBeCloseTo(1.5, 10);
      expect(s.geometry().corners[fixedIndex]![0]).toBeCloseTo(fixed[0], 9);
      expect(s.geometry().corners[fixedIndex]![1]).toBeCloseTo(fixed[1], 9);
      expect(s.engine.history.undo.length).toBe(historyLength + 1);
      const after = s.engine.state;
      s.engine.undo();
      expect(s.engine.state).toEqual(before);
      s.engine.redo();
      expect(s.engine.state).toEqual(after);
    },
  );
  it('preserves text glyph proportions across repeated normal corner drags', () => {
    const s = setup(false, 1, [480, 280], 'text');
    s.shell.session.select('child');
    const properties = s.current().properties;
    for (let i = 1; i <= 3; i++) {
      const start = s.geometry().corners[2]!;
      const end = s.screen([150, 66]);
      s.event('pointerdown', start);
      s.event('pointerup', end);
      expect(s.current().transform.scale.value[0]).toBeCloseTo(1.5 ** i, 10);
      expect(s.current().transform.scale.value[1]).toBeCloseTo(1.5 ** i, 10);
      expect(s.current().properties).toEqual(properties);
      expect(s.engine.history.undo).toHaveLength(i);
    }
  });
});
