import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EditorEngine, trackAcceptsLayer } from '../../src/core';
import fixture from '../fixtures/projects/two-scenes.json';
import {
  CONTROLLERS,
  defaultCameraSpec,
  defaultShot,
  dofBlur,
  insideClip,
  parseCameraSpec,
  parseShot,
  poseMatrix,
  randomiseShot,
  restPose,
  shotPose,
  type Pose,
} from '../../src/camera/rig';
import {
  activeShot,
  cameraShotsOf,
  cameraStateAt,
  camerasOf,
  frameCorners,
  isCameraTrack,
  shotFramePose,
} from '../../src/camera/shots';
import {
  addShotCommands,
  cameraShotsCommands,
  deleteCameraCommands,
} from '../../src/camera/shot-commands';
import { guideLines, safeAreaRects } from '../../src/render/camera-overlay';
import { applyFrameDelta, framedShot } from '../../src/ui/camera-frame';
import { joinScenes } from '../../src/export/join';
import { buildProjectFromComposition } from '../../src/composition';

// FINAL3 Part C: the camera rig, shots and the cameraShots hook.
const frame = { width: 1920, height: 1080 };
const context = { frame, layerCenter: () => null };
const spec = defaultCameraSpec('cam-1', 'Camera 1');
const close = (a: readonly number[], b: readonly number[], digits = 9) =>
  a.forEach((value, index) => expect(value).toBeCloseTo(b[index]!, digits));

describe('[FN3-013] camera rig', () => {
  it('[FN3-013] at rest every camera is the identity (persp and ortho, any sensor fit)', () => {
    close(poseMatrix(spec, restPose(spec), frame, 0), [1, 0, 0, 1, 0, 0]);
    close(
      poseMatrix({ ...spec, type: 'ortho' }, restPose(spec), frame, 300),
      [1, 0, 0, 1, 0, 0],
    );
    close(
      poseMatrix({ ...spec, sensorFit: 'horizontal' }, restPose(spec), frame),
      [1, 0, 0, 1, 0, 0],
    );
  });
  it('[FN3-013] a push-in is smooth: the scale grows every frame with no steps (60 fps)', () => {
    const shot = {
      ...defaultShot('cam-1', 'push-in'),
      easing: 'linear' as const,
    };
    const scales: number[] = [];
    for (let frameIndex = 0; frameIndex <= 360; frameIndex++) {
      const pose = shotPose(spec, shot, frameIndex / 60, 6, context);
      scales.push(poseMatrix(spec, pose, frame, 0)[0]);
    }
    const steps = scales.slice(1).map((value, i) => value - scales[i]!);
    expect(steps.every((step) => step > 0)).toBe(true);
    // No jitter: neighbouring steps differ by far less than a step.
    const jumps = steps.slice(1).map((step, i) => Math.abs(step - steps[i]!));
    expect(Math.max(...jumps)).toBeLessThan(Math.min(...steps) * 0.05);
    // Not rounded: the scale is not quantised to device pixels.
    expect(new Set(scales.map((s) => s.toFixed(12))).size).toBe(scales.length);
  });
  it('[FN3-013] depth gives parallax only with a perspective camera; clip and DoF follow depth', () => {
    const pose: Pose = { ...restPose(spec), x: 100 };
    // How far the canvas centre moves on screen when the camera trucks.
    const shift = (camera: typeof spec, depth: number) => {
      const at = (p: Pose) => {
        const m = poseMatrix(camera, p, frame, depth);
        return m[0] * 960 + m[2] * 540 + m[4];
      };
      return at(pose) - at(restPose(camera));
    };
    expect(shift(spec, 0)).toBeCloseTo(-100, 9);
    expect(Math.abs(shift(spec, 1000))).toBeLessThan(70);
    const ortho = { ...spec, type: 'ortho' as const };
    expect(poseMatrix(ortho, pose, frame, 1000)[4]).toBeCloseTo(
      poseMatrix(ortho, pose, frame, 0)[4],
      9,
    );
    expect(insideClip({ ...spec, clipEnd: 2500 }, pose, frame, 1000)).toBe(
      false,
    );
    const dof = { ...spec, dof: { ...spec.dof, enabled: true, fStop: 1.4 } };
    expect(dofBlur(dof, pose, frame, 0)).toBe(0);
    expect(dofBlur(dof, pose, frame, 800)).toBeGreaterThan(
      dofBlur({ ...dof, dof: { ...dof.dof, fStop: 8 } }, pose, frame, 800),
    );
  });
  it('[FN3-013] every controller moves finitely; Randomise stays inside safe limits', () => {
    for (const controller of CONTROLLERS) {
      const shot = defaultShot('cam-1', controller);
      for (const t of [0, 1.5, 3]) {
        const matrix = poseMatrix(
          spec,
          shotPose(spec, shot, t, 3, context),
          frame,
          200,
        );
        expect(matrix.every(Number.isFinite)).toBe(true);
      }
    }
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 50; i++) {
      const shot = randomiseShot(defaultShot('cam-1', 'handheld'), random);
      expect(shot.strength).toBeGreaterThanOrEqual(0.4);
      expect(shot.strength).toBeLessThanOrEqual(1.2);
      expect(shot.amount).toBeLessThanOrEqual(10);
    }
  });
  it('[FN3-013] camera and shot JSON round-trip; bad values fall back to defaults', () => {
    const custom = {
      ...spec,
      focal: 85,
      dof: { ...spec.dof, enabled: true, blades: 6 },
    };
    expect(parseCameraSpec(JSON.stringify(custom))).toEqual(custom);
    const shot = { ...defaultShot('cam-1', 'orbit'), from: { pan: 3 } };
    expect(parseShot(JSON.stringify(shot))).toEqual(shot);
    const broken = parseCameraSpec(
      JSON.stringify({ ...spec, focal: 'wide', type: 'fisheye' }),
    )!;
    expect(broken.focal).toBe(50);
    expect(broken.type).toBe('persp');
    expect(parseCameraSpec('{nope')).toBeNull();
  });
  it('[FN3-013] guides and safe areas: thirds, golden triangles, EBU margins', () => {
    const guides = { ...spec.guides, thirds: true, goldenTriangleA: true };
    const lines = guideLines({ ...spec, guides }, frame);
    expect(lines).toHaveLength(4 + 3);
    expect(lines[0]).toEqual([
      [640, 0],
      [640, 1080],
    ]);
    const rects = safeAreaRects(
      { ...spec, safeAreas: { ...spec.safeAreas, show: true } },
      frame,
    );
    expect(rects[0]).toEqual({ x: 192, y: 54, width: 1536, height: 972 });
    expect(rects[1]!.x).toBeCloseTo(1920 * 0.035, 9);
  });
});

describe('[FN3-014] camera shots and the cameraShots hook', () => {
  it('[FN3-014] adds shots on a Camera track at the top; cuts switch cameras; deleting the last removes the track', () => {
    const engine = new EditorEngine(fixture);
    const scene = engine.state.compositions[0]!;
    const plans = [
      {
        sceneId: scene.id,
        start: 0,
        duration: 2,
        controller: 'push-in' as const,
        params: { camera: 'Wide' },
      },
      {
        sceneId: scene.id,
        start: 2,
        duration: 2,
        controller: 'pan-left' as const,
        params: { camera: 'Close', strength: 0.5 },
        from: { focal: 85 },
      },
    ];
    engine.commands.transaction(
      'Camera shots',
      cameraShotsCommands(engine.state as never, plans),
    );
    const after = engine.state.compositions[0]!;
    const shots = cameraShotsOf(after as never);
    expect(shots.map((s) => [s.clip.startTime, s.shot.controller])).toEqual([
      [0, 'push-in'],
      [2, 'pan-left'],
    ]);
    expect(camerasOf(after as never).map((c) => c.name)).toEqual([
      'Wide',
      'Close',
    ]);
    const lanes = [...after.tracks].sort((a, b) => a.order - b.order);
    expect(isCameraTrack(lanes[0]!)).toBe(true);
    expect(activeShot(after as never, 1.99)!.spec.name).toBe('Wide');
    expect(activeShot(after as never, 2)!.spec.name).toBe('Close');
    expect(cameraStateAt(after as never, 2)!.pose.focal).toBe(85);
    // The Camera track takes only shots; shots stay on it.
    const cameraTrack = lanes[0]!;
    const textLayer = after.layers.find(
      (l) => l.properties.role?.value !== 'camera',
    )!;
    expect(trackAcceptsLayer('object', textLayer, cameraTrack.id)).toBe(false);
    expect(
      trackAcceptsLayer('object', shots[0]!.layer as never, 'track-x'),
    ).toBe(false);
    expect(
      trackAcceptsLayer('object', shots[0]!.layer as never, cameraTrack.id),
    ).toBe(true);
    // One undo removes both shots and the track.
    engine.undo();
    expect(cameraShotsOf(engine.state.compositions[0] as never)).toEqual([]);
    engine.redo();
    for (const camera of camerasOf(engine.state.compositions[0] as never))
      engine.commands.transaction(
        'Delete camera',
        deleteCameraCommands(engine.state.compositions[0] as never, camera.id),
      );
    expect(engine.state.compositions[0]!.tracks.some(isCameraTrack)).toBe(
      false,
    );
  });
  it('[FN3-014] a scene without shots draws exactly as before (old projects unchanged), and a shot on scene 2 leaves scene 1 alone', () => {
    const engine = new EditorEngine(fixture);
    const [one, two] = engine.state.compositions;
    expect(cameraStateAt(one as never, 1)).toBeNull();
    engine.commands.transaction(
      'Add shot',
      addShotCommands(two as never, { start: 0, duration: 2 }).commands,
    );
    expect(cameraStateAt(engine.state.compositions[0] as never, 1)).toBeNull();
    expect(
      cameraStateAt(engine.state.compositions[1] as never, 1),
    ).not.toBeNull();
  });
  it('[FN3-014] the frame edits the start framing: truck, zoom and roll go into `from`', () => {
    const shot = defaultShot('cam-1', 'hold');
    const moved = framedShot(shot, spec, 'start', {
      x: 40,
      focal: 0.5,
      roll: 10,
    });
    expect(moved.from).toEqual({ x: 40, focal: 25, roll: 10 });
    const entry = {
      layer: { id: 'l' } as never,
      clip: { id: 'c', layerId: 'l', startTime: 0, duration: 2, enabled: true },
      trackId: 'camera-track',
      spec,
      shot: moved,
    };
    const pose = shotFramePose(
      { width: 1920, height: 1080, layers: [], tracks: [] },
      entry,
      'start',
    );
    expect(applyFrameDelta(pose, { focal: 2 }).focal).toBe(50);
    // A wider lens sees more: the frame grows around the moved centre.
    const corners = frameCorners(spec, pose, frame);
    expect(corners[1][0] - corners[0][0]).toBeGreaterThan(1920);
  });
  it('[FN3-014] the joined export keeps targets and focus objects pointing at their layers', () => {
    const engine = new EditorEngine(fixture);
    const two = engine.state.compositions[1]!;
    const target = two.layers[0]!.id;
    engine.commands.transaction(
      'Camera shots',
      cameraShotsCommands(engine.state as never, [
        {
          sceneId: two.id,
          start: 0,
          duration: 1,
          controller: 'follow',
          params: { target },
        },
      ]),
    );
    const joined = joinScenes(engine.state.compositions);
    const shot = cameraShotsOf(joined as never)[0]!;
    expect(shot.shot.target).toBe(`scene2-${target}`);
    expect(joined.layers.some((l) => l.id === shot.shot.target)).toBe(true);
  });
  it('[FN3-014] a Composition Spec scene builds its cameraShots (target = an item)', async () => {
    const data = JSON.parse(
      readFileSync('tests/fixtures/compositions/logo-reveal.json', 'utf8'),
    ) as {
      spec: {
        scenes: {
          items: { id: string; kind: string }[];
          cameraShots?: unknown;
        }[];
      };
    };
    data.spec.scenes[0]!.cameraShots = [
      {
        start: 0,
        duration: 2,
        controller: 'pull-out',
        strength: 1.2,
        from: { tilt: -4 },
      },
      {
        start: 2,
        duration: 2,
        controller: 'follow',
        target: 'tagline',
        camera: 'Close',
      },
    ];
    const { project, errors } = await buildProjectFromComposition(data);
    expect(errors).toEqual([]);
    const scene = project!.compositions[0]!;
    const shots = cameraShotsOf(scene as never);
    expect(shots.map((s) => s.shot.controller)).toEqual(['pull-out', 'follow']);
    const tagline = scene.layers.find((l) => l.name === 'Tagline')!;
    expect(shots[1]!.shot.target).toBe(tagline.id);
    expect(shots[0]!.shot.from).toEqual({ tilt: -4 });
  });
});
