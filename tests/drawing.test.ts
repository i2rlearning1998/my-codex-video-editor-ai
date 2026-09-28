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
import { drawingOf, parsePath, strokeGeometry } from '../src/render/drawing';
import {
  brushSizeCommands,
  flipTransform,
  toolbarKind,
} from '../src/ui/context-toolbar';
import {
  erasableStrokes,
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
  expect(drawing).toMatchObject({ width: 12, color: '#123456', cap: 'round' });
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
  expect(transformPoint(item.matrix, item.path!.points[0]!)).toEqual([
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
    return drawing.points.map((point) => transformPoint(matrix, point));
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

test('[SHP-020] brush defaults apply until the user changes size or opacity; then all brushes share them', () => {
  const { session } = setup();
  session.setDrawBrush('highlighter');
  expect(session.drawStyle.opacity).toBe(0.4);
  session.setDrawBrush('pen');
  expect(session.drawStyle.size).toBe(4);
  session.setDrawStyle({ size: 30 });
  session.setDrawBrush('highlighter');
  expect(session.drawStyle).toMatchObject({ size: 30, opacity: 1 });
  session.setDrawBrush('eraser');
  expect(session.drawStyle.size).toBe(30);
});
