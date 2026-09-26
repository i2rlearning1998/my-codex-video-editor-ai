import { expect, test } from 'vitest';
import { EditorEngine, type Command } from '../src/core';
import { locateLayer } from '../src/render/adapter';
import { formatPolygons, parsePolygons, shapeOf } from '../src/render/shapes';
import { createExampleProject } from '../src/ui/example';
import { EditorSession } from '../src/ui/session';
import {
  addShape,
  booleanCommands,
  canCombine,
  combineShapes,
  shapeStyleCommand,
} from '../src/ui/shapes';

const setup = () => {
  const engine = new EditorEngine(createExampleProject());
  const session = new EditorSession(engine);
  const layer = (id: string) =>
    locateLayer(session.source.composition.layers, id)!.layer;
  return { engine, session, layer };
};

test('[SHP-001] existing shapes read as plain filled rectangles; drawings are not shapes', () => {
  const { layer } = setup();
  expect(shapeOf(layer('example-badge'))).toMatchObject({
    kind: 'rectangle',
    fill: '#cbbced',
    fillOpacity: 1,
    stroke: null,
    strokeWidth: 0,
    radius: 0,
  });
  expect(shapeOf(layer('example-headline'))).toBeNull();
});

test('[SHP-015] polygons round-trip and malformed outlines are rejected', () => {
  const square = [
    [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
    ],
  ] as const;
  expect(parsePolygons(formatPolygons(square as never))).toEqual(square);
  expect(parsePolygons('[[[[0,0],[1,1]]]]')).toBeNull();
  expect(parsePolygons('{"x":1}')).toBeNull();
  expect(parsePolygons('not json')).toBeNull();
});

test('[SHP-003][SHP-005][SHP-006] style commands validate their values', () => {
  const { engine, session, layer } = setup();
  addShape(engine, session, 'rectangle');
  const id = session.selectedId!;
  const compositionId = session.source.composition.id;
  const run = (key: Parameters<typeof shapeStyleCommand>[2], value: never) =>
    shapeStyleCommand(compositionId, layer(id), key, value);
  expect(run('fillOpacity', 0.5 as never)).not.toBeNull();
  expect(() => run('fillOpacity', 2 as never)).toThrow(RangeError);
  expect(() => run('strokeDash', 'wavy' as never)).toThrow(RangeError);
  expect(() => run('cornerRadius', -1 as never)).toThrow(RangeError);
  engine.commands.transaction('Set', [run('cornerRadius', 40 as never)!]);
  expect(shapeOf(layer(id))!.radius).toBe(40);
  // The same value is a no-op; ellipses take no corner radius.
  expect(run('cornerRadius', 40 as never)).toBeNull();
  addShape(engine, session, 'ellipse');
  expect(
    shapeStyleCommand(
      compositionId,
      layer(session.selectedId!),
      'cornerRadius',
      10,
    ),
  ).toBeNull();
});

test('[SHP-015] union replaces the shapes with one outline in the bottom shape’s place, and undo restores them', () => {
  const { engine, session, layer } = setup();
  addShape(engine, session, 'rectangle');
  const rectangle = session.selectedId!;
  addShape(engine, session, 'ellipse');
  const ellipse = session.selectedId!;
  const ids = [rectangle, ellipse];
  expect(canCombine(session.source, ids)).toBe(true);
  // A shape with text or a line cannot combine.
  expect(canCombine(session.source, [rectangle, 'example-headline'])).toBe(
    false,
  );
  const before = session.source.composition.layers.map((item) => item.id);
  session.selectMany(ids);
  combineShapes(engine, session, 'union');
  const after = session.source.composition.layers;
  expect(after).toHaveLength(before.length - 1);
  const result = shapeOf(layer(session.selectedId!))!;
  expect(result.kind).toBe('path');
  expect(result.fill).toBe('#8b6cff');
  // 240x160 rectangle ∪ 200x200 circle, both centered on 640,360.
  const merged = layer(session.selectedId!);
  expect(merged.transform.position.value).toEqual([520, 260]);
  expect(merged.properties.width!.value).toBeCloseTo(240, 3);
  expect(merged.properties.height!.value).toBeCloseTo(200, 3);
  engine.undo();
  expect(session.source.composition.layers.map((item) => item.id)).toEqual(
    before,
  );
  // Two shapes that do not overlap intersect to nothing: refused.
  engine.commands.transaction('Move', [
    {
      type: 'SET_PROPERTY',
      compositionId: session.source.composition.id,
      layerId: ellipse,
      target: { kind: 'transform', key: 'position' },
      property: {
        type: 'vector2',
        value: [1000, 500],
        animated: false,
        keyframes: [],
        constraints: [],
      },
    } as unknown as Command,
  ]);
  expect(() => booleanCommands(session.source, ids, 'intersect')).toThrow(
    /do not overlap/,
  );
});
