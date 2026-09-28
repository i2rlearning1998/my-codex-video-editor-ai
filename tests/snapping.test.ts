import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { EditorEngine, deserializeProject, type Point2 } from '../src/core';
import { deriveRenderItems } from '../src/render/adapter';
import { alignCommands, distributeCommands } from '../src/ui/align';
import { EditorSession } from '../src/ui/session';
import { snapTargets, solveSnap, worldBox, type Box } from '../src/ui/snapping';

const translated =
  (width: number, height: number) =>
  (point: Point2): Box => ({
    minX: point[0],
    minY: point[1],
    maxX: point[0] + width,
    maxY: point[1] + height,
  });

test('[CV-013] a move snaps its nearest feature exactly and reports the guide', () => {
  const result = solveSnap(
    translated(40, 20),
    [77, 300.5],
    { x: [100, 500], y: [0] },
    6,
    'move',
  );
  // The center (97) is 3 from 100; the max edge (117) is further from anything.
  expect(result.point).toEqual([80, 300.5]);
  expect(result.guides).toEqual([{ axis: 'x', value: 100 }]);
  // Out of tolerance: the pointer is unchanged and nothing is drawn.
  expect(
    solveSnap(translated(40, 20), [50, 50], { x: [100], y: [] }, 6, 'move'),
  ).toEqual({ point: [50, 50], guides: [] });
});

test('[CV-013] a resize snaps only moving edges and keeps the closer axis when both cannot hold', () => {
  // A fixed min edge at 0 never snaps; the moving max edge follows the pointer.
  const edge = (point: Point2): Box => ({
    minX: 0,
    minY: 0,
    maxX: point[0],
    maxY: 50,
  });
  expect(
    solveSnap(edge, [96, 10], { x: [0, 100], y: [50] }, 6, 'resize'),
  ).toEqual({ point: [100, 10], guides: [{ axis: 'x', value: 100 }] });
  // Both edges depend on both pointer axes (a proportional corner): the
  // combined correction breaks x, so only the closer x snap is kept.
  const coupled = (point: Point2): Box => ({
    minX: 0,
    minY: 0,
    maxX: point[0] + point[1],
    maxY: point[0] + point[1],
  });
  const result = solveSnap(
    coupled,
    [4.8, 5],
    { x: [10], y: [10.5] },
    1,
    'resize',
  );
  expect(result.point[0] + result.point[1]).toBeCloseTo(10, 12);
  expect(result.guides).toEqual([{ axis: 'x', value: 10 }]);
});

const fixture = () => {
  const engine = new EditorEngine(
    deserializeProject(
      readFileSync('tests/fixtures/projects/nle-example.json', 'utf8'),
    ),
  );
  const session = new EditorSession(engine);
  // At 1.5 s layer-a (0..2) and layer-c (1..4) are drawn; layer-b (3..5) is not.
  session.setCurrentTime(1.5);
  expect(deriveRenderItems(session.source).items).toHaveLength(2);
  return { engine, session };
};

test('[CV-013] targets are the canvas, its safe margins and other layers, not the dragged one', () => {
  const { session } = fixture();
  const targets = snapTargets(session.source, ['layer-a'], null);
  for (const x of [0, 64, 640, 1216, 1280]) expect(targets.x).toContain(x);
  for (const y of [0, 36, 360, 684, 720]) expect(targets.y).toContain(y);
  // layer-c (300..700) is drawn; the dragged layer-a (100..500) and the
  // off-screen layer-b (600..1000) are not targets.
  expect(targets.x).toEqual(expect.arrayContaining([300, 500, 700]));
  expect(targets.y).toEqual(expect.arrayContaining([400, 512.5, 625]));
  for (const x of [100, 600, 800, 1000]) expect(targets.x).not.toContain(x);
});

test('[CV-025] align to the selection or the canvas, and distribute with equal gaps', () => {
  const { engine, session } = fixture();
  const box = (id: string) => worldBox(session.source, id)!;
  engine.commands.transaction(
    'Align layers',
    alignCommands(session.source, ['layer-a', 'layer-c'], 'left', false),
  );
  expect(box('layer-a').minX).toBe(100);
  expect(box('layer-c').minX).toBe(100);
  engine.commands.transaction(
    'Align layers',
    alignCommands(session.source, ['layer-b'], 'middle', false),
  );
  expect(box('layer-b').minY + box('layer-b').maxY).toBe(720);
  engine.commands.transaction(
    'Align layers',
    alignCommands(
      session.source,
      ['layer-a', 'layer-b', 'layer-c'],
      'bottom',
      true,
    ),
  );
  for (const id of ['layer-a', 'layer-b', 'layer-c'])
    expect(box(id).maxY).toBe(720);
  // Already in place: nothing to commit.
  expect(
    alignCommands(session.source, ['layer-a', 'layer-c'], 'left', false),
  ).toEqual([]);
  // Distribute: a at 100..500, c at 100..500, b at 600..1000 -> spread by center.
  engine.commands.transaction('Move', [
    ...alignCommands(session.source, ['layer-c'], 'center', true),
  ]);
  const commands = distributeCommands(
    session.source,
    ['layer-a', 'layer-b', 'layer-c'],
    'horizontal',
  );
  expect(commands.length).toBeGreaterThan(0);
  engine.commands.transaction('Distribute layers', commands);
  const boxes = ['layer-a', 'layer-c', 'layer-b'].map(box);
  expect(boxes[1]!.minX - boxes[0]!.maxX).toBeCloseTo(
    boxes[2]!.minX - boxes[1]!.maxX,
    10,
  );
  expect(boxes[0]!.minX).toBe(100);
  expect(boxes[2]!.maxX).toBe(1000);
  expect(
    distributeCommands(session.source, ['layer-a', 'layer-b'], 'horizontal'),
  ).toEqual([]);
  session.dispose();
});
