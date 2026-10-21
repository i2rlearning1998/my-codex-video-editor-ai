// FINAL3 Part C: the commands behind the camera UI and the cameraShots API:
// add a shot (and the Camera track when the scene has none), change a shot
// or a camera (every shot of that camera), duplicate and delete cameras.
// Each user action is one transaction (one undo step). DOM-free.
import {
  createLayer,
  number,
  sortedLanes,
  type Clip,
  type Command,
  type Layer,
  type Track,
} from '../core';
import {
  CAMERA_ROLE,
  defaultCameraSpec,
  defaultShot,
  type CameraSpec,
  type Shot,
} from './rig';
import {
  CAMERA_TRACK_PREFIX,
  cameraShotsOf,
  camerasOf,
  isCameraTrack,
  type CameraShotPlan,
  type ShotScene,
} from './shots';

interface Scene extends ShotScene {
  readonly id: string;
  readonly duration: number;
}
const plain = (value: string) => ({
  type: 'string' as const,
  value,
  animated: false,
  keyframes: [] as [],
  constraints: [],
});
const freshId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** The Camera track, or the commands that make it (at the top). */
export function cameraTrackCommands(
  scene: Scene,
  id = `${CAMERA_TRACK_PREFIX}-${scene.id}`.slice(0, 120),
): { trackId: string; commands: Command[] } {
  const existing = scene.tracks.find(isCameraTrack);
  if (existing) return { trackId: existing.id, commands: [] };
  const track: Track = {
    id,
    name: 'Camera',
    type: 'object',
    order: 1_000_000,
    enabled: true,
    locked: false,
    muted: false,
    clips: [],
  };
  return {
    trackId: id,
    commands: [
      { type: 'CREATE_TRACK', compositionId: scene.id, track },
      { type: 'MOVE_TRACK', compositionId: scene.id, trackId: id, index: 0 },
    ] as Command[],
  };
}

/** The first free time at or after `start` on the Camera track. */
function freeStart(scene: Scene, start: number, duration: number): number {
  const shots = cameraShotsOf(scene).map((entry) => entry.clip);
  let at = start;
  for (const clip of [...shots].sort((a, b) => a.startTime - b.startTime))
    if (
      at < clip.startTime + clip.duration - 1e-9 &&
      at + duration > clip.startTime + 1e-9
    )
      at = clip.startTime + clip.duration;
  return at;
}

export interface AddShotOptions {
  readonly start: number;
  readonly duration: number;
  readonly spec?: CameraSpec;
  readonly shot?: Partial<Shot>;
  readonly name?: string;
  /** Keep `start` even if a shot is there (the API's planned times). */
  readonly exact?: boolean;
  readonly layerId?: string;
}
/** A new shot on the Camera track (the track too when missing). */
export function addShotCommands(
  scene: Scene,
  options: AddShotOptions,
): { commands: Command[]; layerId: string; clipId: string } {
  const cameras = camerasOf(scene);
  const spec =
    options.spec ??
    cameras[0] ??
    defaultCameraSpec(freshId('camera'), `Camera ${cameras.length + 1}`);
  const shot: Shot = {
    ...defaultShot(spec.id),
    ...options.shot,
    cameraId: spec.id,
  };
  const { trackId, commands } = cameraTrackCommands(scene);
  const duration = Math.max(0.1, options.duration);
  const start = options.exact
    ? Math.max(0, options.start)
    : freeStart(scene, Math.max(0, options.start), duration);
  const layerId = options.layerId ?? freshId('shot');
  const layer = createLayer(
    layerId,
    'shape',
    options.name ?? `${spec.name} · ${shot.controller}`,
    duration,
  );
  layer.startTime = start;
  layer.properties = {
    role: plain(CAMERA_ROLE),
    cameraSpec: plain(JSON.stringify(spec)),
    cameraShot: plain(JSON.stringify(shot)),
    width: number(1),
    height: number(1),
  } as Layer['properties'];
  const clipId = `${layerId}-clip`;
  const clip: Clip = {
    id: clipId,
    name: layer.name,
    layerId,
    assetId: null,
    startTime: start,
    duration,
    sourceIn: 0,
    sourceOut: duration,
    enabled: true,
    speed: 1,
    transitionMetadata: {},
    effectMetadata: {},
    metadata: {},
  } as Clip;
  return {
    layerId,
    clipId,
    commands: [
      ...commands,
      { type: 'CREATE_LAYER', compositionId: scene.id, parentId: null, layer },
      { type: 'CREATE_CLIP', compositionId: scene.id, trackId, clip },
    ] as Command[],
  };
}

const setString = (
  compositionId: string,
  layerId: string,
  key: string,
  value: string,
): Command =>
  ({
    type: 'SET_PROPERTY',
    compositionId,
    layerId,
    target: { kind: 'property', key },
    property: plain(value),
  }) as Command;

/** Changes one shot (its controller and settings). */
export function updateShotCommands(
  scene: Scene,
  layerId: string,
  shot: Shot,
): Command[] {
  return [setString(scene.id, layerId, 'cameraShot', JSON.stringify(shot))];
}
/** Changes a camera: every shot that films with it. */
export function updateCameraCommands(
  scene: Scene,
  spec: CameraSpec,
): Command[] {
  return cameraShotsOf(scene)
    .filter((entry) => entry.spec.id === spec.id)
    .map((entry) =>
      setString(scene.id, entry.layer.id, 'cameraSpec', JSON.stringify(spec)),
    );
}
/** Points a shot at another camera. */
export function setShotCameraCommands(
  scene: Scene,
  layerId: string,
  spec: CameraSpec,
  shot: Shot,
): Command[] {
  return [
    setString(scene.id, layerId, 'cameraSpec', JSON.stringify(spec)),
    setString(
      scene.id,
      layerId,
      'cameraShot',
      JSON.stringify({ ...shot, cameraId: spec.id }),
    ),
  ];
}
/** A copy of a camera (new id, "<name> copy") with one shot after the last. */
export function duplicateCameraCommands(
  scene: Scene,
  spec: CameraSpec,
  shot: Shot,
  duration: number,
): { commands: Command[]; layerId: string } {
  const copy: CameraSpec = {
    ...spec,
    id: freshId('camera'),
    name: `${spec.name} copy`.slice(0, 80),
  };
  const end = Math.max(
    0,
    ...cameraShotsOf(scene).map((e) => e.clip.startTime + e.clip.duration),
  );
  const added = addShotCommands(scene, {
    start: end,
    duration,
    spec: copy,
    shot,
  });
  return { commands: added.commands, layerId: added.layerId };
}
/** Deletes a camera's shots; the Camera track goes when it empties. */
export function deleteCameraCommands(
  scene: Scene,
  cameraId: string,
): Command[] {
  const entries = cameraShotsOf(scene);
  const gone = entries.filter((entry) => entry.spec.id === cameraId);
  const commands: Command[] = gone.map(
    (entry) =>
      ({
        type: 'DELETE_LAYER',
        compositionId: scene.id,
        layerId: entry.layer.id,
      }) as Command,
  );
  if (gone.length === entries.length) {
    const track = scene.tracks.find(isCameraTrack);
    if (track)
      commands.push({
        type: 'DELETE_TRACK',
        compositionId: scene.id,
        trackId: track.id,
      } as Command);
  }
  return commands;
}

/**
 * C5: shots from a plan (docs/camera.md), for one or more scenes of a
 * project. Shots of a camera name share one camera; times are the plan's.
 */
export function cameraShotsCommands(
  project: { readonly compositions: readonly Scene[] },
  plans: readonly CameraShotPlan[],
  /** Fresh ids for cameras and shots (default: time and random based). */
  ids: (prefix: string) => string = freshId,
): Command[] {
  const commands: Command[] = [];
  const bySceneCamera = new Map<string, CameraSpec>();
  const working = new Map<string, Scene>();
  for (const plan of plans) {
    const scene =
      working.get(plan.sceneId) ??
      project.compositions.find((item) => item.id === plan.sceneId);
    if (!scene) throw new Error(`Unknown scene ${plan.sceneId}`);
    const cameraName = plan.params?.camera ?? 'Camera 1';
    const key = `${scene.id}|${cameraName}`;
    const spec =
      bySceneCamera.get(key) ??
      camerasOf(scene).find((camera) => camera.name === cameraName) ??
      defaultCameraSpec(ids('camera'), cameraName);
    bySceneCamera.set(key, spec);
    const { camera: _camera, ...params } = plan.params ?? {};
    void _camera;
    const added = addShotCommands(scene, {
      start: plan.start,
      duration: plan.duration,
      spec,
      exact: true,
      layerId: ids('shot'),
      shot: {
        controller: plan.controller,
        ...params,
        ...(plan.from ? { from: plan.from } : {}),
        ...(plan.to ? { to: plan.to } : {}),
      },
    });
    commands.push(...added.commands);
    // Later plans see the track and shots this one made.
    const track = scene.tracks.find(isCameraTrack);
    const created = added.commands.find(
      (command) => command.type === 'CREATE_LAYER',
    ) as { layer: Layer } | undefined;
    const clip = added.commands.find(
      (command) => command.type === 'CREATE_CLIP',
    ) as { clip: Clip; trackId: string } | undefined;
    const tracks = track
      ? scene.tracks.map((item) =>
          item.id === track.id
            ? { ...item, clips: [...item.clips, clip!.clip] }
            : item,
        )
      : [
          {
            id: clip!.trackId,
            order: -1,
            clips: [clip!.clip],
          },
          ...scene.tracks,
        ];
    working.set(scene.id, {
      ...scene,
      layers: [...scene.layers, created!.layer as never],
      tracks: tracks as never,
    });
  }
  return commands;
}
/** Lanes top to bottom with the Camera track first (for the timeline). */
export const cameraFirst = <T extends { id: string; order: number }>(
  tracks: readonly T[],
) => {
  const lanes = sortedLanes(tracks as never) as unknown as T[];
  return [
    ...lanes.filter(isCameraTrack),
    ...lanes.filter((lane) => !isCameraTrack(lane)),
  ];
};
