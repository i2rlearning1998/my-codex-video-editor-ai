import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createLayer,
  createProject,
  deserializeProject,
  EditorEngine,
  IDENTITY_MATRIX,
  number,
  type AffineMatrix,
} from '../../src/core';
import {
  CAMERA_PRESETS,
  cameraPreset,
  joinSceneCameras,
  sceneCameraAt,
  sceneCameraMatrix,
} from '../../src/camera/scene';
import { drawComposition } from '../../src/render/canvas';
import { joinScenes } from '../../src/export/join';

function scene() {
  const project = createProject('Camera', '2026-01-01T00:00:00.000Z');
  const composition = project.compositions[0]!;
  composition.width = 400;
  composition.height = 200;
  const layer = createLayer('box', 'shape', 'Box');
  layer.properties = { width: number(40), height: number(40) };
  composition.layers.push(layer);
  return new EditorEngine(project);
}
function recordFills(engine: EditorEngine, time: number) {
  let current: AffineMatrix = IDENTITY_MATRIX;
  const fills: AffineMatrix[] = [];
  const stack: AffineMatrix[] = [];
  const noop = vi.fn();
  const context = new Proxy(
    {
      setTransform: (...m: number[]) =>
        (current = m as unknown as AffineMatrix),
      fillRect: () => fills.push(current),
      save: () => stack.push(current),
      restore: () => (current = stack.pop()!),
    } as Record<string, unknown>,
    { get: (target, key) => (key in target ? target[key as string] : noop) },
  ) as unknown as CanvasRenderingContext2D;
  const composition = engine.state.compositions[0]!;
  drawComposition(
    context,
    {
      composition,
      assets: [],
      background: '#000000',
      currentTime: time,
    },
    { width: 400, height: 200, pixelRatio: 1, matrix: IDENTITY_MATRIX },
    null,
    { overlays: false },
  );
  return fills;
}

describe('[FINAL1] scene camera', () => {
  it('evaluates keyframes with easing and moves the picture, not the artboard', () => {
    const engine = scene();
    const id = engine.state.compositions[0]!.id;
    const still = recordFills(engine, 1);
    expect(sceneCameraMatrix(engine.state.compositions[0]!, 1)).toBeNull();
    engine.commands.execute({
      type: 'SET_COMPOSITION_CAMERA',
      compositionId: id,
      camera: cameraPreset('push-in', { width: 400, height: 200 }, 0, 2),
    });
    const composition = engine.state.compositions[0]!;
    expect(sceneCameraAt(composition, 0)!.zoom).toBe(1);
    expect(sceneCameraAt(composition, 2)!.zoom).toBeCloseTo(1.15);
    // ease-in-out: halfway in time is halfway in value.
    expect(sceneCameraAt(composition, 1)!.zoom).toBeCloseTo(1.075, 3);
    const moved = recordFills(engine, 2);
    expect(moved[0]).toEqual(still[0]); // the artboard background
    expect(moved[1]).not.toEqual(still[1]); // the box
    expect(moved[1]![0]).toBeCloseTo(1.15);
    engine.undo();
    expect(engine.state.compositions[0]!.camera).toBeUndefined();
  });
  it('refuses a zero zoom and leaves old projects without a camera', () => {
    const engine = scene();
    expect(() =>
      engine.commands.execute({
        type: 'SET_COMPOSITION_CAMERA',
        compositionId: engine.state.compositions[0]!.id,
        camera: {
          ...cameraPreset('push-in', { width: 400, height: 200 }, 0, 1),
          zoom: number(0),
        },
      }),
    ).toThrow();
    const old = deserializeProject(
      readFileSync('tests/fixtures/projects/v7-rotated.json', 'utf8'),
    );
    expect(old.compositions.every((c) => c.camera === undefined)).toBe(true);
  });
  it('has every preset as valid data and joins scene cameras for export', () => {
    for (const preset of CAMERA_PRESETS) {
      const engine = scene();
      engine.commands.execute({
        type: 'SET_COMPOSITION_CAMERA',
        compositionId: engine.state.compositions[0]!.id,
        camera: cameraPreset(preset, { width: 400, height: 200 }, 0, 3),
      });
      expect(
        sceneCameraMatrix(engine.state.compositions[0]!, 1.5),
      ).not.toBeNull();
    }
    const camera = cameraPreset('push-in', { width: 400, height: 200 }, 0, 2);
    const joined = joinSceneCameras([
      { duration: 2 },
      { duration: 2, camera },
    ])!;
    const holder = { width: 400, height: 200, camera: joined };
    expect(sceneCameraAt(holder, 1)!.zoom).toBe(1);
    expect(sceneCameraAt(holder, 2)!.zoom).toBe(1);
    expect(sceneCameraAt(holder, 3.9999)!.zoom).toBeCloseTo(1.15, 3);
    expect(joinSceneCameras([{ duration: 1 }])).toBeNull();
    const a = scene().state.compositions[0]!;
    expect(joinScenes([a, a]).camera).toBeUndefined();
  });
});
