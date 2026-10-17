// FINAL1: the scene camera. A composition may hold an optional `camera`
// (number properties x, y, zoom and rotation that keyframe with the editor's
// model and easing, plus an optional seeded shake). It moves the whole
// scene's picture, in the preview and the export alike (drawComposition);
// picking and editing keep the resting geometry, like the W5-C presets
// (D-072). No camera means the scene draws exactly as before.
import { evaluateProperty } from '../core/animation';
import type { Easing, SceneCamera } from '../core/model';
import { cameraMatrix, defaultCamera, type Camera, type Matrix } from './index';

interface CameraHolder {
  readonly width: number;
  readonly height: number;
  /** A SceneCamera (typed loosely so frozen project states fit). */
  readonly camera?: unknown;
}

/** The camera at a composition time, or null when the scene has none. */
export function sceneCameraAt(
  composition: CameraHolder,
  time: number,
): Camera | null {
  const camera = composition.camera as SceneCamera | undefined;
  if (!camera) return null;
  const value = (key: 'x' | 'y' | 'zoom' | 'rotation') =>
    Number(evaluateProperty(camera[key] as never, time));
  return {
    x: value('x'),
    y: value('y'),
    zoom: value('zoom'),
    rotation: value('rotation'),
    shake: camera.shake ?? defaultCamera.shake,
  };
}

/** The matrix the scene's picture is drawn through, or null for none. */
export function sceneCameraMatrix(
  composition: CameraHolder,
  time: number,
): Matrix | null {
  const camera = sceneCameraAt(composition, time);
  if (!camera) return null;
  return cameraMatrix(camera, time, {
    width: composition.width,
    height: composition.height,
  });
}

/** One camera value over time: `[time, value, easing?]` keyframes. */
type Track = readonly (readonly [number, number, Easing?])[];
const property = (track: Track) => {
  const keyframes = track.map(([time, value, easing]) => ({
    time,
    value,
    ...(easing ? { easing } : {}),
  }));
  return {
    type: 'number' as const,
    value: track[0]?.[1] ?? 0,
    animated: keyframes.length > 1,
    keyframes: keyframes.length > 1 ? keyframes : [],
    constraints: [],
  };
};
/** Builds a scene camera from per-value keyframes (missing: the default). */
export function cameraFromTracks(tracks: {
  x?: Track;
  y?: Track;
  zoom?: Track;
  rotation?: Track;
  shake?: SceneCamera['shake'];
}): SceneCamera {
  return {
    x: property(tracks.x ?? [[0, 0]]),
    y: property(tracks.y ?? [[0, 0]]),
    zoom: property(tracks.zoom ?? [[0, 1]]),
    rotation: property(tracks.rotation ?? [[0, 0]]),
    ...(tracks.shake ? { shake: tracks.shake } : {}),
  };
}

export const CAMERA_PRESETS = [
  'push-in',
  'pull-out',
  'pan-left',
  'pan-right',
  'pan-up',
  'pan-down',
  'ken-burns',
  'handheld',
] as const;
export type CameraPreset = (typeof CAMERA_PRESETS)[number];

/**
 * A preset as camera keyframes over [start, start + duration] for a canvas.
 * Pans travel 8 % of the canvas with a small zoom so no edge shows; push and
 * pull move between zoom 1 and 1.15; Ken Burns zooms in while drifting; the
 * handheld drift is a seeded shake of 0.4 % of the shorter side at 0.6 Hz.
 */
export function cameraPreset(
  preset: CameraPreset,
  canvas: { readonly width: number; readonly height: number },
  start: number,
  duration: number,
  seed = 1,
): SceneCamera {
  const end = start + duration;
  const ease: Easing = 'ease-in-out';
  const dx = canvas.width * 0.08,
    dy = canvas.height * 0.08,
    hold = 1.18; // covers a 8 % pan on both sides
  switch (preset) {
    case 'push-in':
      return cameraFromTracks({
        zoom: [
          [start, 1, ease],
          [end, 1.15],
        ],
      });
    case 'pull-out':
      return cameraFromTracks({
        zoom: [
          [start, 1.15, ease],
          [end, 1],
        ],
      });
    case 'pan-left':
      return cameraFromTracks({
        x: [
          [start, dx, ease],
          [end, -dx],
        ],
        zoom: [[start, hold]],
      });
    case 'pan-right':
      return cameraFromTracks({
        x: [
          [start, -dx, ease],
          [end, dx],
        ],
        zoom: [[start, hold]],
      });
    case 'pan-up':
      return cameraFromTracks({
        y: [
          [start, dy, ease],
          [end, -dy],
        ],
        zoom: [[start, hold]],
      });
    case 'pan-down':
      return cameraFromTracks({
        y: [
          [start, -dy, ease],
          [end, dy],
        ],
        zoom: [[start, hold]],
      });
    case 'ken-burns':
      return cameraFromTracks({
        x: [
          [start, -dx / 4, ease],
          [end, dx / 4],
        ],
        y: [
          [start, dy / 4, ease],
          [end, -dy / 4],
        ],
        zoom: [
          [start, 1.05, ease],
          [end, 1.2],
        ],
      });
    case 'handheld':
      return cameraFromTracks({
        zoom: [[start, 1.03]],
        shake: {
          amplitude: Math.min(canvas.width, canvas.height) * 0.004,
          frequency: 0.6,
          seed,
        },
      });
  }
}

type CameraKey = 'x' | 'y' | 'zoom' | 'rotation';
const CAMERA_KEYS: readonly CameraKey[] = ['x', 'y', 'zoom', 'rotation'];
const DEFAULTS: Record<CameraKey, number> = {
  x: 0,
  y: 0,
  zoom: 1,
  rotation: 0,
};
interface LooseKeyframe {
  time: number;
  value: number;
  easing?: Easing;
}
/** The easing of the segment that contains `time` (hold before the first key). */
function easingAt(frames: readonly LooseKeyframe[], time: number): Easing {
  let found: LooseKeyframe | undefined;
  for (const frame of frames) if (frame.time <= time) found = frame;
  return found ? (found.easing ?? 'linear') : 'hold';
}
/**
 * FINAL1: the joined export's camera (export/join.ts): each scene's camera
 * shifted to its place in the joined timeline, holding its last value to
 * the cut; a scene without a camera stays still. Null when no scene has a
 * camera. The joined camera uses the first shake it finds (one shake per
 * export).
 */
export function joinSceneCameras(
  scenes: readonly { readonly duration: number; readonly camera?: unknown }[],
): SceneCamera | null {
  if (!scenes.some((scene) => scene.camera)) return null;
  const EPSILON = 1e-6;
  const tracks = {} as Record<CameraKey, LooseKeyframe[]>;
  for (const key of CAMERA_KEYS) {
    const frames: LooseKeyframe[] = [];
    let offset = 0;
    for (const scene of scenes) {
      const camera = scene.camera as SceneCamera | undefined;
      const prop = camera?.[key];
      const local: LooseKeyframe[] =
        prop && prop.animated && prop.keyframes.length
          ? prop.keyframes.map((k) => ({ ...k }) as LooseKeyframe)
          : [];
      const at = (time: number) =>
        prop ? Number(evaluateProperty(prop as never, time)) : DEFAULTS[key];
      frames.push({
        time: offset,
        value: at(0),
        easing: local.length ? easingAt(local, 0) : 'hold',
      });
      for (const frame of local)
        if (frame.time > 0 && frame.time < scene.duration - EPSILON)
          frames.push({ ...frame, time: frame.time + offset });
      frames.push({
        time: offset + scene.duration - EPSILON,
        value: at(scene.duration),
        easing: 'hold',
      });
      offset += scene.duration;
    }
    tracks[key] = frames;
  }
  const shake = scenes
    .map((scene) => (scene.camera as SceneCamera | undefined)?.shake)
    .find(Boolean);
  const property = (frames: LooseKeyframe[]) => ({
    type: 'number' as const,
    value: frames[0]!.value,
    animated: true,
    keyframes: frames,
    constraints: [],
  });
  return {
    x: property(tracks.x),
    y: property(tracks.y),
    zoom: property(tracks.zoom),
    rotation: property(tracks.rotation),
    ...(shake ? { shake } : {}),
  } as SceneCamera;
}
