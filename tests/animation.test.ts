import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  EditorEngine,
  compositionAt,
  cubicBezier,
  deserializeProject,
  easeProgress,
  evaluateProperty,
  serializeProject,
  type Property,
  type TransformValues,
} from '../src/core';
import { EditorSession } from '../src/ui/session';
import { buildTransformCommands } from '../src/ui/transform-commands';
import { stopwatchOff, stopwatchOn, keyframeTimes } from '../src/ui/keyframes';

const fixture = (name: string) =>
  readFileSync(`tests/fixtures/projects/${name}`, 'utf8');
const property = (
  keyframes: { time: number; value: number; easing?: unknown }[],
): Property =>
  ({
    type: 'number',
    value: 0,
    animated: true,
    keyframes,
    constraints: [],
  }) as Property;

test('[ANI-002] interpolation: linear, named eases, hold and custom cubic-bezier', () => {
  const linear = property([
    { time: 1, value: 0 },
    { time: 3, value: 100 },
  ]);
  expect(evaluateProperty(linear, 0)).toBe(0);
  expect(evaluateProperty(linear, 2)).toBe(50);
  expect(evaluateProperty(linear, 9)).toBe(100);
  const eased = (easing: unknown) =>
    evaluateProperty(
      property([
        { time: 0, value: 0, easing },
        { time: 1, value: 100 },
      ]),
      0.5,
    ) as number;
  expect(eased('ease-in')).toBeLessThan(50);
  expect(eased('ease-out')).toBeGreaterThan(50);
  expect(eased('ease-in-out')).toBeCloseTo(50, 9);
  expect(eased('hold')).toBe(0);
  expect(eased({ type: 'cubic', x1: 0, y1: 0, x2: 1, y2: 1 })).toBeCloseTo(
    50,
    9,
  );
  // CSS "ease-in" at x = 0.5 is about 0.3153.
  expect(cubicBezier(0.42, 0, 1, 1, 0.5)).toBeCloseTo(0.3153, 3);
  expect(easeProgress(undefined, 0.25)).toBe(0.25);
  // Vectors and colors interpolate per component.
  const color = {
    type: 'color',
    value: '#000000',
    animated: true,
    keyframes: [
      { time: 0, value: '#000000' },
      { time: 2, value: '#ff8040' },
    ],
    constraints: [],
  } as Property;
  expect(evaluateProperty(color, 1)).toBe('#804020');
});

test('[ANI-002] schema 5: a v4 file migrates losslessly; invalid easing is rejected', () => {
  const project = deserializeProject(fixture('v4-keyframes.json'));
  expect(project.schemaVersion).toBe(5);
  const legacy = JSON.parse(fixture('v4-keyframes.json'));
  expect(project.compositions).toEqual(legacy.compositions);
  const layer = project.compositions[0]!.layers[0]!;
  // Absent easing reads as linear.
  expect(evaluateProperty(layer.transform.position, 1)).toEqual([300, 200]);
  const bad = JSON.parse(serializeProject(project));
  bad.compositions[0].layers[0].transform.position.keyframes[0].easing =
    'bouncy';
  expect(() => deserializeProject(JSON.stringify(bad))).toThrow();
  bad.compositions[0].layers[0].transform.position.keyframes[0].easing = {
    type: 'cubic',
    x1: 2,
    y1: 0,
    x2: 0.5,
    y2: 1,
  };
  expect(() => deserializeProject(JSON.stringify(bad))).toThrow();
});

test('[ANI-003] compositionAt evaluates animated values and leaves static projects untouched', () => {
  const project = deserializeProject(fixture('v4-keyframes.json'));
  const composition = project.compositions[0]!;
  const at = compositionAt(composition, 1);
  const layer = at.layers[0]!;
  expect(layer.transform.position.value).toEqual([300, 200]);
  expect(layer.transform.opacity.value).toBeCloseTo(0.6, 12);
  expect(layer.properties.fill!.value).toBe('#808080');
  // Keyframes are kept; memoized per time; unanimated layers are shared.
  expect(layer.transform.position.keyframes).toHaveLength(2);
  expect(compositionAt(composition, 1)).toBe(at);
  expect(at.layers[1]).toBe(composition.layers[1]);
  const plain = deserializeProject(fixture('nle-example.json'))
    .compositions[0]!;
  expect(compositionAt(plain, 1)).toBe(plain);
});

test('[ANI-004] moving a clip carries its keyframes; trimming does not', () => {
  const engine = new EditorEngine(
    deserializeProject(fixture('v4-keyframes.json')),
  );
  const composition = () => engine.state.compositions[0]!;
  const clip = composition().tracks[0]!.clips.find(
    (item) => item.layerId === 'layer-a',
  )!;
  const times = () =>
    composition().layers[0]!.transform.position.keyframes.map(
      (frame) => frame.time,
    );
  engine.commands.execute({
    type: 'SET_CLIP_TIMING',
    compositionId: composition().id,
    clipId: clip.id,
    startTime: clip.startTime + 0.5,
    duration: clip.duration,
  });
  expect(times()).toEqual([0.5, 2.5]);
  engine.commands.execute({
    type: 'SET_CLIP_TIMING',
    compositionId: composition().id,
    clipId: clip.id,
    startTime: 0.5,
    duration: 1,
  });
  expect(times()).toEqual([0.5, 2.5]);
});

test('[ANI-006][ANI-001] auto-keyframe on edit, stopwatch on and off', () => {
  const engine = new EditorEngine(
    deserializeProject(fixture('v4-keyframes.json')),
  );
  const session = new EditorSession(engine);
  session.setCurrentTime(1);
  const layer = session.source.composition.layers[0]!;
  const commands = buildTransformCommands(
    session.source.composition.id,
    layer,
    {
      ...(layer.transform as unknown as TransformValues),
      position: { value: [320, 200] },
    },
    undefined,
    session.currentTime,
  );
  engine.commands.transaction('Move layer', commands);
  const position = engine.state.compositions[0]!.layers[0]!.transform.position;
  expect(position.keyframes.map((frame) => frame.time)).toEqual([0, 1, 2]);
  expect(position.keyframes[1]!.value).toEqual([320, 200]);
  expect(position.keyframes[0]!.value).toEqual([100, 100]);
  // Without a time (or on a static property) the value changes, no keyframe.
  const rotation = layer.transform.rotation;
  expect(stopwatchOn(rotation, 1).keyframes).toEqual([{ time: 1, value: 0 }]);
  const off = stopwatchOff(position, 1.5);
  expect(off.animated).toBe(false);
  expect(off.keyframes).toEqual([]);
  expect(off.value).toEqual([410, 250]);
  expect(keyframeTimes(engine.state.compositions[0]!.layers[0]!)).toEqual([
    0, 0.5, 1, 1.5, 2,
  ]);
  session.dispose();
});
