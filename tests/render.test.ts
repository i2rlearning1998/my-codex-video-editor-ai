import { describe, expect, it, vi } from 'vitest';
import {
  EditorEngine,
  IDENTITY_MATRIX,
  createLayer,
  createProject,
  number,
  serializeProject,
  transformPoint,
  vector2,
  type AffineMatrix,
} from '../src/core';
import {
  deriveRenderItems,
  hitTest,
  layerSize,
  type RenderSource,
} from '../src/render/adapter';
import {
  Canvas2DRenderer,
  drawComposition,
  fitViewport,
  pickLayer,
  type Viewport,
} from '../src/render/canvas';
import { createExampleProject } from '../src/ui/example';

function setup() {
  const project = createProject();
  const composition = project.compositions[0]!;
  composition.width = 512;
  composition.height = 256;
  const layer = createLayer('rectangle', 'shape', 'Rectangle');
  layer.properties = { width: number(40), height: number(60) };
  composition.layers.push(layer);
  const engine = new EditorEngine(project);
  const source = (): RenderSource => ({
    composition: engine.state.compositions[0]!,
    assets: engine.state.assets,
    background: engine.state.settings.backgroundColor,
  });
  return { engine, source, compositionId: composition.id };
}
const viewport: Viewport = {
  width: 512,
  height: 256,
  pixelRatio: 1,
  matrix: IDENTITY_MATRIX,
};

function recordingContext() {
  let current: AffineMatrix = IDENTITY_MATRIX;
  const records: {
    matrix: AffineMatrix;
    alpha: number;
    rectangle: number[];
  }[] = [];
  const stack: { matrix: AffineMatrix; alpha: number }[] = [];
  const context = {
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    textBaseline: '',
    font: '',
    setTransform: vi.fn((...matrix: number[]) => {
      current = matrix as unknown as AffineMatrix;
    }),
    fillRect: vi.fn((...rectangle: number[]) => {
      records.push({ matrix: current, alpha: context.globalAlpha, rectangle });
    }),
    save: vi.fn(() => {
      stack.push({ matrix: current, alpha: context.globalAlpha });
    }),
    restore: vi.fn(() => {
      const saved = stack.pop()!;
      current = saved.matrix;
      context.globalAlpha = saved.alpha;
    }),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillText: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    strokeRect: vi.fn(),
  };
  return {
    context,
    port: context as unknown as CanvasRenderingContext2D,
    records,
  };
}

describe('scene graph render adapter', () => {
  it('derives immutable visual records from the canonical source and reflects commands', () => {
    const { engine, source, compositionId } = setup();
    const before = serializeProject(engine.state);
    const first = deriveRenderItems(source());
    expect(first.items[0]).toMatchObject({
      id: 'rectangle',
      matrix: IDENTITY_MATRIX,
      size: { width: 40, height: 60, source: 'properties' },
    });
    expect(Object.isFrozen(first.items[0])).toBe(true);
    expect(serializeProject(engine.state)).toBe(before);
    expect(engine.canUndo).toBe(false);
    engine.commands.execute({
      type: 'SET_PROPERTY',
      compositionId,
      layerId: 'rectangle',
      target: { kind: 'transform', key: 'position' },
      property: vector2(25, 30),
    });
    expect(deriveRenderItems(source()).items[0]!.matrix).toEqual([
      1, 0, 0, 1, 25, 30,
    ]);
    expect(first.items[0]!.matrix).toEqual(IDENTITY_MATRIX);
  });
  it('uses property sizes, asset dimensions, then deterministic fallbacks', () => {
    const project = createProject();
    const image = createLayer('image', 'image', 'Image');
    image.assetId = 'asset';
    project.assets.push({
      id: 'asset',
      name: 'Reference',
      type: 'image',
      source: {
        kind: 'uri',
        reference: 'https://example.invalid/no-fetch.png',
      },
      metadata: {},
      width: 640,
      height: 480,
    });
    image.properties.width = number(100);
    project.compositions[0]!.layers = [image];
    const engine = new EditorEngine(project);
    const layer = engine.state.compositions[0]!.layers[0]!;
    expect(layerSize(layer, engine.state.assets)).toEqual({
      width: 100,
      height: 480,
      source: 'mixed',
    });
    const source: RenderSource = {
      composition: engine.state.compositions[0]!,
      assets: engine.state.assets,
      background: '#000000',
    };
    expect(deriveRenderItems(source).items[0]).toMatchObject({
      kind: 'placeholder',
      text: 'IMAGE / Image',
    });
    expect(
      layerSize(
        new EditorEngine(createExampleProject()).state.compositions[0]!
          .layers[5]!,
        [],
      ),
    ).toBeNull();
    const blank = createProject();
    blank.compositions[0]!.layers.push(createLayer('blank', 'text', 'Blank'));
    const snapshot = new EditorEngine(blank).state;
    expect(layerSize(snapshot.compositions[0]!.layers[0]!, [])).toEqual({
      width: 360,
      height: 100,
      source: 'placeholder',
    });
  });
  it('respects nested matrices, inherited opacity and depth-first sibling order', () => {
    const project = createProject();
    const group = createLayer('g', 'group', 'Group');
    group.transform.position = vector2(10, 20);
    group.transform.scale = vector2(2, 3);
    group.transform.rotation = number(90);
    group.transform.opacity = number(0.5);
    const child = createLayer('child', 'shape', 'Child');
    child.transform.position = vector2(4, 5);
    child.transform.opacity = number(0.4);
    group.children = [child];
    project.compositions[0]!.layers = [
      group,
      createLayer('top', 'shape', 'Top'),
    ];
    const state = new EditorEngine(project).state;
    const { items } = deriveRenderItems({
      composition: state.compositions[0]!,
      assets: [],
      background: '#000000',
    });
    expect(items.map((item) => item.id)).toEqual(['child', 'top']);
    expect(items[0]).toMatchObject({
      matrix: [0, 2, -3, 0, -5, 28],
      opacity: 0.2,
      ancestors: ['g'],
    });
  });
  it('reports overflowing geometry without dropping valid siblings or mutating state', () => {
    const project = createProject();
    const huge = createLayer('huge', 'shape', 'Huge');
    huge.transform.scale = vector2(1e308, 1);
    project.compositions[0]!.layers = [
      huge,
      createLayer('valid', 'shape', 'Valid'),
    ];
    const state = new EditorEngine(project).state;
    const result = deriveRenderItems({
      composition: state.compositions[0]!,
      assets: [],
      background: '#000000',
    });
    expect(result.items.map((item) => item.id)).toEqual(['valid']);
    expect(result.warnings).toHaveLength(1);
  });
});

describe('Canvas 2D renderer boundary', () => {
  it('sends expected affine geometry and inherited alpha to Canvas without mutating state', () => {
    const { engine, source, compositionId } = setup();
    engine.commands.transaction('Transform', [
      {
        type: 'SET_PROPERTY',
        compositionId,
        layerId: 'rectangle',
        target: { kind: 'transform', key: 'position' },
        property: vector2(10, 20),
      },
      {
        type: 'SET_PROPERTY',
        compositionId,
        layerId: 'rectangle',
        target: { kind: 'transform', key: 'scale' },
        property: vector2(2, 3),
      },
      {
        type: 'SET_PROPERTY',
        compositionId,
        layerId: 'rectangle',
        target: { kind: 'transform', key: 'rotation' },
        property: number(90),
      },
      {
        type: 'SET_PROPERTY',
        compositionId,
        layerId: 'rectangle',
        target: { kind: 'transform', key: 'opacity' },
        property: number(0.25),
      },
    ]);
    const before = engine.state;
    const history = engine.history;
    const { port, records, context } = recordingContext();
    expect(
      drawComposition(port, source(), viewport, 'rectangle').warnings,
    ).toEqual([]);
    expect(records[1]).toEqual({
      matrix: [0, 2, -3, 0, 10, 20],
      alpha: 0.25,
      rectangle: [0, 0, 40, 60],
    });
    expect(context.moveTo).toHaveBeenCalledWith(10, 20);
    expect(context.lineTo).toHaveBeenCalledWith(10, 100);
    expect(context.lineTo).toHaveBeenCalledWith(-170, 100);
    expect(context.stroke).toHaveBeenCalledTimes(2);
    expect(context.clip).toHaveBeenCalled();
    expect(engine.state).toBe(before);
    expect(engine.history).toEqual(history);
  });
  it('applies inherited group opacity exactly once to each drawable', () => {
    const project = createProject();
    const group = createLayer('g', 'group', 'Group');
    group.transform.opacity = number(0.5);
    const child = createLayer('c', 'shape', 'Child');
    child.transform.opacity = number(0.5);
    group.children = [child];
    project.compositions[0]!.layers = [group];
    const state = new EditorEngine(project).state;
    const { port, records, context } = recordingContext();
    drawComposition(
      port,
      {
        composition: state.compositions[0]!,
        assets: [],
        background: '#000000',
      },
      viewport,
      'g',
    );
    // Composition and child retain inherited opacity; eight resize handles are opaque; the separate rotation disc uses fill().
    expect(records.map((item) => item.alpha)).toEqual([
      1,
      0.25,
      ...Array<number>(8).fill(1),
    ]);
    expect(context.stroke).toHaveBeenCalledTimes(2);
  });
  it('separates device pixels from fit coordinates and clips to composition bounds', () => {
    const { source } = setup();
    const view = fitViewport(592, 336, source().composition, 2);
    expect(view.matrix).toEqual([1, 0, 0, 1, 40, 40]);
    const { port, records, context } = recordingContext();
    drawComposition(port, source(), view, null);
    expect(records[1]!.matrix).toEqual([2, 0, 0, 2, 80, 80]);
    expect(context.rect).toHaveBeenCalledWith(0, 0, 512, 256);
    expect(pickLayer(source(), view, [50, 50])).toBe('rectangle');
    expect(pickLayer(source(), view, [20, 20])).toBeNull();
  });
  it('returns an actionable fallback when Canvas 2D is unavailable', () => {
    const { source } = setup();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => null,
    } as unknown as HTMLCanvasElement;
    expect(
      new Canvas2DRenderer().render(canvas, source(), viewport, null)
        .warnings[0],
    ).toMatch(/unavailable/);
  });
});

describe('composition viewport fitting regression', () => {
  it('scales a large composition below 100% with the intended padding and center', () => {
    const { source } = setup();
    const view = fitViewport(336, 208, source().composition);
    expect(view.matrix).toEqual([0.5, 0, 0, 0.5, 40, 40]);
    expect(transformPoint(view.matrix, [512, 256])).toEqual([296, 168]);
    expect(transformPoint(view.matrix, [256, 128])).toEqual([168, 104]);
  });

  it('keeps smaller compositions at 100%, centered and fully inside the viewport', () => {
    const { source } = setup();
    const view = fitViewport(1000, 600, source().composition);
    expect(view.matrix).toEqual([1, 0, 0, 1, 244, 172]);
    expect(transformPoint(view.matrix, [512, 256])).toEqual([756, 428]);
  });

  it.each([
    [1104, 200, 0.46875, 432, 40],
    [208, 800, 0.25, 40, 368],
  ])(
    'fits differing aspect ratios in a %s × %s viewport',
    (width, height, zoom, x, y) => {
      const { source } = setup();
      const view = fitViewport(width, height, source().composition);
      expect(view.matrix).toEqual([zoom, 0, 0, zoom, x, y]);
      expect(transformPoint(view.matrix, [256, 128])).toEqual([
        width / 2,
        height / 2,
      ]);
    },
  );

  it.each([
    [40, 20],
    [1, 1],
    [0.25, 0.5],
  ])(
    'relaxes impossible padding without clipping a tiny %s × %s viewport',
    (width, height) => {
      const { source } = setup();
      const view = fitViewport(width, height, source().composition);
      const topLeft = transformPoint(view.matrix, [0, 0]);
      const bottomRight = transformPoint(view.matrix, [512, 256]);
      expect(view.matrix[0]).toBeGreaterThan(0);
      expect(view.matrix[0]).toBeLessThan(1);
      expect(topLeft[0]).toBeGreaterThanOrEqual(0);
      expect(topLeft[1]).toBeGreaterThanOrEqual(0);
      expect(bottomRight[0]).toBeLessThanOrEqual(width);
      expect(bottomRight[1]).toBeLessThanOrEqual(height);
      expect(transformPoint(view.matrix, [256, 128])).toEqual([
        width / 2,
        height / 2,
      ]);
      // Existing tiny-viewport behavior is preserved for dimensions of at least 1px.
      expect(view.matrix[0]).toBe(Math.min(1, width) / 512);
    },
  );

  it.each([0, -1, NaN, Infinity, -Infinity])(
    'rejects invalid viewport, composition, and pixel-ratio dimensions: %s',
    (invalid) => {
      const { source } = setup();
      const composition = source().composition;
      expect(() => fitViewport(invalid, 208, composition)).toThrow(RangeError);
      expect(() => fitViewport(336, invalid, composition)).toThrow(RangeError);
      expect(() => fitViewport(336, 208, composition, invalid)).toThrow(
        RangeError,
      );
      expect(() =>
        fitViewport(336, 208, { ...composition, width: invalid }),
      ).toThrow(RangeError);
      expect(() =>
        fitViewport(336, 208, { ...composition, height: invalid }),
      ).toThrow(RangeError);
    },
  );

  it('rejects a positive viewport whose fit underflows to zero', () => {
    const { source } = setup();
    expect(() =>
      fitViewport(Number.MIN_VALUE, Number.MIN_VALUE, source().composition),
    ).toThrow(/Unrepresentable/);
  });

  it.each([0.5, 1, 2, 3])(
    'keeps logical fit and picking independent of devicePixelRatio %s',
    (pixelRatio) => {
      const { source, engine } = setup();
      const before = engine.state;
      const view = fitViewport(336, 208, source().composition, pixelRatio);
      expect(view.matrix).toEqual([0.5, 0, 0, 0.5, 40, 40]);
      expect(view.pixelRatio).toBe(Math.min(pixelRatio, 2));
      expect(pickLayer(source(), view, [45, 45])).toBe('rectangle');
      expect(pickLayer(source(), view, [30, 30])).toBeNull();
      const { port, records, context } = recordingContext();
      const report = drawComposition(port, source(), view, 'rectangle');
      const ratio = view.pixelRatio;
      expect(records[1]).toEqual({
        matrix: [0.5 * ratio, 0, 0, 0.5 * ratio, 40 * ratio, 40 * ratio],
        alpha: 1,
        rectangle: [0, 0, 40, 60],
      });
      expect(context.moveTo).toHaveBeenCalledWith(40, 40);
      expect(context.lineTo).toHaveBeenCalledWith(60, 70);
      expect(report.warnings).toEqual([]);
      expect(engine.state).toBe(before);
      expect(engine.canUndo).toBe(false);
    },
  );
});

describe('read-only hit testing', () => {
  it('picks the front-most nested drawable and clears on empty/outside space', () => {
    const project = createProject();
    const group = createLayer('g', 'group', 'Group');
    group.transform.position = vector2(200, 100);
    group.transform.rotation = number(90);
    const child = createLayer('c', 'shape', 'Child');
    child.properties = { width: number(40), height: number(60) };
    group.children = [child];
    project.compositions[0]!.layers = [
      createLayer('bottom', 'shape', 'Bottom'),
      group,
    ];
    const state = new EditorEngine(project).state;
    const source: RenderSource = {
      composition: state.compositions[0]!,
      assets: [],
      background: '#000000',
    };
    expect(hitTest(source, [150, 110])).toBe('c');
    expect(hitTest(source, [10, 10])).toBe('bottom');
    expect(hitTest(source, [1900, 1000])).toBeNull();
    expect(hitTest(source, [-1, 10])).toBeNull();
  });
  it('does not pick zero-opacity or non-invertible layers', () => {
    const { engine, source, compositionId } = setup();
    engine.commands.execute({
      type: 'SET_PROPERTY',
      compositionId,
      layerId: 'rectangle',
      target: { kind: 'transform', key: 'opacity' },
      property: number(0),
    });
    expect(hitTest(source(), [10, 10])).toBeNull();
    engine.undo();
    engine.commands.execute({
      type: 'SET_PROPERTY',
      compositionId,
      layerId: 'rectangle',
      target: { kind: 'transform', key: 'scale' },
      property: vector2(0, 1),
    });
    expect(hitTest(source(), [0, 10])).toBeNull();
  });
  it('handles mirrored geometry and rejects the empty part of rotated bounding boxes', () => {
    const { engine, source, compositionId } = setup();
    engine.commands.transaction('Mirror', [
      {
        type: 'SET_PROPERTY',
        compositionId,
        layerId: 'rectangle',
        target: { kind: 'transform', key: 'position' },
        property: vector2(100, 100),
      },
      {
        type: 'SET_PROPERTY',
        compositionId,
        layerId: 'rectangle',
        target: { kind: 'transform', key: 'scale' },
        property: vector2(-1, 1),
      },
    ]);
    expect(hitTest(source(), [90, 110])).toBe('rectangle');
    expect(hitTest(source(), [110, 110])).toBeNull();
    engine.commands.execute({
      type: 'SET_PROPERTY',
      compositionId,
      layerId: 'rectangle',
      target: { kind: 'transform', key: 'rotation' },
      property: number(45),
    });
    expect(hitTest(source(), [95, 140])).toBeNull();
  });
});
