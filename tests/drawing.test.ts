import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  EditorEngine,
  deserializeProject,
  localTransformMatrix,
  transformPoint,
  type TransformValues,
} from '../src/core';
import { deriveRenderItems, locateLayer } from '../src/render/adapter';
import {
  drawingOf,
  eraseStrokes,
  formatStrokes,
  parsePath,
  parseStrokes,
  smoothStroke,
  strokeGeometry,
} from '../src/render/drawing';
import {
  brushSizeCommands,
  flipTransform,
  toolbarKind,
} from '../src/ui/context-toolbar';
import {
  erasableStrokes,
  eraseCommands,
  strokeCommands,
  strokesTouched,
} from '../src/ui/draw-tool';
import { EditorSession } from '../src/ui/session';
import { pasteStyleCommands, styleOf } from '../src/ui/style-clipboard';

const setup = () => {
  const engine = new EditorEngine(
    deserializeProject(
      readFileSync('tests/fixtures/projects/nle-example.json', 'utf8'),
    ),
  );
  return { engine, session: new EditorSession(engine) };
};
const find = (session: EditorSession, id: string) =>
  locateLayer(session.source.composition.layers, id)!.layer;

test('[SHP-019] a stroke becomes one shape layer with a clip at the playhead', () => {
  const { engine, session } = setup();
  session.setCurrentTime(1);
  const commands = strokeCommands(
    session.source,
    [
      [100, 100],
      [200, 150],
      [300, 120],
    ],
    'marker',
    { size: 12, color: '#123456', opacity: 1 },
    1,
  );
  engine.commands.transaction('Draw', commands);
  const composition = session.source.composition;
  const layer = composition.layers.at(-1)!;
  expect(layer.type).toBe('shape');
  expect(toolbarKind(layer)).toBe('drawing');
  expect(layer.transform.position.value).toEqual([94, 94]);
  const drawing = drawingOf(layer);
  expect(drawing).toMatchObject({
    width: 12,
    color: '#123456',
    brush: 'marker',
  });
  expect(
    composition.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.layerId === layer.id),
  ).toMatchObject({ startTime: 1, duration: 5 });
  // The renderer draws it as a path at composition coordinates.
  const item = deriveRenderItems({
    ...session.source,
    currentTime: 2,
  }).items.find((entry) => entry.id === layer.id)!;
  expect(item.kind).toBe('path');
  expect(transformPoint(item.matrix, item.path!.strokes[0]![0]!)).toEqual([
    100, 100,
  ]);
  // A dot (no second distinct point) commits nothing.
  expect(
    strokeCommands(
      session.source,
      [
        [5, 5],
        [5, 5],
      ],
      'pen',
      { size: 4, color: '#000000', opacity: 1 },
      0,
    ),
  ).toEqual([]);
  expect(parsePath('1 2 3')).toBeNull();
  expect(parsePath('1 2 x 4')).toBeNull();
});

test('[CV-038] brush size re-pads the drawing and keeps its points in place', () => {
  const { engine, session } = setup();
  engine.commands.transaction(
    'Draw',
    strokeCommands(
      session.source,
      [
        [100, 100],
        [200, 200],
      ],
      'pen',
      { size: 4, color: '#000000', opacity: 1 },
      0,
    ),
  );
  const id = session.source.composition.layers.at(-1)!.id;
  const world = () => {
    const layer = find(session, id);
    const drawing = drawingOf(layer) as Exclude<
      ReturnType<typeof drawingOf>,
      'invalid' | null
    >;
    const matrix = localTransformMatrix(layer.transform as TransformValues);
    return drawing.strokes[0]!.map((point) => transformPoint(matrix, point));
  };
  const before = world();
  engine.commands.transaction(
    'Set brush size',
    brushSizeCommands(session.source.composition.id, find(session, id), 20),
  );
  expect(world()).toEqual(before);
  expect(find(session, id).properties.width!.value).toBe(120);
  expect(
    strokeGeometry(
      [
        [0, 0],
        [10, 0],
      ],
      4,
    ).height,
  ).toBe(4);
});

test('[CV-036] flip keeps the visual center fixed', () => {
  const base: TransformValues = {
    position: { value: [100, 50] },
    rotation: { value: 30 },
    scale: { value: [2, 1] },
    opacity: { value: 1 },
  } as TransformValues;
  const center: [number, number] = [50, 25];
  const flipped = flipTransform(base, center, 'horizontal');
  expect(flipped.scale.value).toEqual([-2, 1]);
  const a = transformPoint(localTransformMatrix(base), center);
  const b = transformPoint(localTransformMatrix(flipped), center);
  expect(b[0]).toBeCloseTo(a[0], 10);
  expect(b[1]).toBeCloseTo(a[1], 10);
});

test('[CV-039] paste style applies only what each target can take', () => {
  const { engine, session } = setup();
  engine.commands.transaction(
    'Draw',
    strokeCommands(
      session.source,
      [
        [0, 0],
        [50, 50],
      ],
      'highlighter',
      { size: 24, color: '#00ff00', opacity: 0.4 },
      0,
    ),
  );
  const drawing = session.source.composition.layers.at(-1)!.id;
  const style = styleOf(session.source, drawing)!;
  expect(style).toEqual({ opacity: 0.4, color: '#00ff00', strokeWidth: 24 });
  // Onto a video layer: opacity only.
  const commands = pasteStyleCommands(session.source, ['layer-a'], style);
  expect(commands).toHaveLength(1);
  engine.commands.transaction('Paste style', commands);
  expect(find(session, 'layer-a').transform.opacity.value).toBe(0.4);
  expect(find(session, 'layer-a').properties.fill!.value).toBe('#4a90d9');
});

test('[SHP-020] the eraser touches a stroke within its radius plus half the stroke width, sampling fast moves', () => {
  const { engine, session } = setup();
  session.setDrawStyle({ size: 10, opacity: 1, color: '#123456' });
  engine.commands.transaction(
    'Draw',
    strokeCommands(
      session.source,
      [
        [600, 650],
        [700, 650],
      ],
      'pen',
      session.drawStyle,
      session.currentTime,
    ),
  );
  const strokes = erasableStrokes(session.source);
  expect(strokes).toHaveLength(1);
  const id = strokes[0]!.id;
  // Radius 5 + half width 5 = 10 units from the line.
  expect(strokesTouched(strokes, [650, 660], [650, 660], 10)).toEqual([id]);
  expect(strokesTouched(strokes, [650, 661], [650, 661], 10)).toEqual([]);
  // A fast move that jumps over the line still touches it.
  expect(strokesTouched(strokes, [650, 600], [650, 700], 2)).toEqual([id]);
  // Past the end of the line only the end cap counts.
  expect(strokesTouched(strokes, [712, 650], [712, 650], 2)).toEqual([]);
});

test('[SHP-018] each brush keeps its own size, colour and opacity (G4)', () => {
  const { session } = setup();
  session.setDrawBrush('highlighter');
  expect(session.drawStyle).toMatchObject({ size: 24, opacity: 0.4 });
  session.setDrawBrush('pen');
  expect(session.drawStyle.size).toBe(4);
  session.setDrawStyle({ size: 30, color: '#112233' });
  // Another brush is untouched; coming back restores the pen's own values.
  session.setDrawBrush('highlighter');
  expect(session.drawStyle).toMatchObject({ size: 24, opacity: 0.4 });
  session.setDrawBrush('glow');
  expect(session.drawStyle.color).toBe('#35d7ff');
  session.setDrawBrush('pen');
  expect(session.drawStyle).toMatchObject({ size: 30, color: '#112233' });
  // The eraser has its own size too.
  session.setDrawBrush('eraser');
  expect(session.drawStyle.size).toBe(24);
});

test('[SHP-020] the area eraser cuts a stroke in two, removes a covered one, and stays one layer', () => {
  // A horizontal line from 0 to 100, 4 wide; an eraser of radius 10 at 50.
  const line: [number, number][] = [
    [0, 10],
    [100, 10],
  ];
  const pieces = eraseStrokes([line], 4, [[50, 10]], 10);
  expect(pieces).toHaveLength(2);
  const [left, right] = pieces;
  expect(left![0]).toEqual([0, 10]);
  expect(Math.max(...left!.map((point) => point[0]))).toBeLessThan(50 - 10);
  expect(Math.min(...right!.map((point) => point[0]))).toBeGreaterThan(50 + 10);
  expect(right!.at(-1)![0]).toBeCloseTo(100, 0);
  // Far away: untouched, exactly as it was.
  expect(eraseStrokes([line], 4, [[50, 60]], 10)).toEqual([line]);
  // Covered from end to end: nothing is left.
  const samples = Array.from({ length: 21 }, (_, i): [number, number] => [
    i * 5,
    10,
  ]);
  expect(eraseStrokes([line], 4, samples, 10)).toEqual([]);
  // Sub-strokes round-trip through the stored path text.
  expect(parseStrokes(formatStrokes(pieces))).toEqual(pieces);
  expect(parseStrokes('1 2 3 4 ; 5 6')).toBeNull();
});

test('[SHP-020] an erase commits one undo step: a cut stroke keeps its ink in place in one layer', () => {
  const { engine, session } = setup();
  engine.commands.transaction(
    'Draw',
    strokeCommands(
      session.source,
      [
        [100, 100],
        [300, 100],
      ],
      'pen',
      { size: 6, color: '#123456', opacity: 1 },
      0,
    ),
  );
  const id = session.source.composition.layers.at(-1)!.id;
  const [stroke] = erasableStrokes(session.source).filter(
    (item) => item.id === id,
  );
  const local = stroke!.path.strokes;
  const inverse = stroke!.inverse;
  const centre = transformPoint(inverse, [200, 100]);
  const pieces = eraseStrokes(local, 6, [centre], 20);
  expect(pieces).toHaveLength(2);
  const history = engine.history.undo.length;
  engine.commands.transaction(
    'Erase',
    eraseCommands(session.source, new Map([[id, pieces]])),
  );
  expect(engine.history.undo.length).toBe(history + 1);
  const layer = session.source.composition.layers.find(
    (item) => item.id === id,
  )!;
  const drawing = drawingOf(layer) as Exclude<
    ReturnType<typeof drawingOf>,
    'invalid' | null
  >;
  expect(drawing.strokes).toHaveLength(2);
  // The first point is still at (100, 100) in the composition.
  const matrix = localTransformMatrix(layer.transform as never);
  const first = transformPoint(matrix, drawing.strokes[0]![0]!);
  expect(first[0]).toBeCloseTo(100, 6);
  expect(first[1]).toBeCloseTo(100, 6);
  // Erasing everything deletes the layer.
  engine.commands.transaction(
    'Erase',
    eraseCommands(session.source, new Map([[id, []]])),
  );
  expect(session.source.composition.layers.some((item) => item.id === id)).toBe(
    false,
  );
});

test('[SHP-022] smoothing evens out a jittery stroke and keeps its ends', () => {
  const jitter = Array.from({ length: 20 }, (_, i): [number, number] => [
    i * 5,
    i % 2 ? 4 : -4,
  ]);
  const smooth = smoothStroke(jitter);
  expect(smooth[0]).toEqual(jitter[0]);
  expect(smooth.at(-1)).toEqual(jitter.at(-1));
  const spread = (points: readonly (readonly [number, number])[]) =>
    Math.max(...points.slice(2, -2).map((point) => Math.abs(point[1])));
  expect(spread(smooth)).toBeLessThan(spread(jitter) / 3);
});
