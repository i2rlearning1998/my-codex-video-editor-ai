// FINAL3 Part C: the scene's camera shots. A shot is a clip on the Camera
// track whose layer (role "camera", never drawn or picked) holds the camera
// (`cameraSpec`) and the shot (`cameraShot`) as JSON. The shot covering a
// time gives the camera pose there; a cut is where one shot ends and the
// next begins. Without shots the scene uses its FINAL1 camera (or none).
// DOM-free; the preview and the export draw through the same function.
import {
  applyTrackTo,
  CAMERA_ROLE,
  defaultCameraSpec,
  defaultShot,
  parseCameraSpec,
  parseShot,
  poseMatrix,
  shotPose,
  type CameraSpec,
  type ControllerId,
  type Frame,
  type Matrix,
  type Pose,
  type Shot,
  type ShotContext,
} from './rig';

/** Enough of a layer (works on frozen project states). */
export interface ShotLayer {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly properties: Readonly<
    Record<string, { readonly type: string; readonly value: unknown }>
  >;
  readonly children: readonly ShotLayer[];
  readonly transform?: unknown;
}
interface ShotClip {
  readonly id: string;
  readonly layerId: string;
  readonly startTime: number;
  readonly duration: number;
  readonly enabled: boolean;
}
interface ShotTrack {
  readonly id: string;
  readonly order: number;
  readonly enabled?: boolean;
  readonly clips: readonly ShotClip[];
}
export interface ShotScene {
  readonly id?: string;
  readonly width: number;
  readonly height: number;
  readonly layers: readonly ShotLayer[];
  readonly tracks: readonly ShotTrack[];
}
const stringOf = (layer: ShotLayer, key: string) => {
  const value = layer.properties[key];
  return value?.type === 'string' && typeof value.value === 'string'
    ? value.value
    : undefined;
};
export const isCameraLayer = (layer: {
  readonly properties: ShotLayer['properties'];
}) => stringOf(layer as ShotLayer, 'role') === CAMERA_ROLE;
/** The Camera track's id prefix (a scene has at most one). */
export const CAMERA_TRACK_PREFIX = 'camera-track';
export const isCameraTrack = (track: { readonly id: string }) =>
  track.id.startsWith(CAMERA_TRACK_PREFIX);

export interface CameraShotEntry {
  readonly layer: ShotLayer;
  readonly clip: ShotClip;
  readonly trackId: string;
  readonly spec: CameraSpec;
  readonly shot: Shot;
}
/** Every shot of a scene, in time order. */
export function cameraShotsOf(scene: ShotScene): CameraShotEntry[] {
  const layers = new Map(
    scene.layers.filter(isCameraLayer).map((layer) => [layer.id, layer]),
  );
  if (!layers.size) return [];
  const result: CameraShotEntry[] = [];
  for (const track of scene.tracks)
    for (const clip of track.clips) {
      const layer = layers.get(clip.layerId);
      if (!layer) continue;
      const spec =
        parseCameraSpec(stringOf(layer, 'cameraSpec')) ??
        defaultCameraSpec(`camera-${layer.id}`, layer.name);
      const shot =
        parseShot(stringOf(layer, 'cameraShot')) ??
        defaultShot(spec.id, 'hold');
      result.push({ layer, clip, trackId: track.id, spec, shot });
    }
  return result.sort((a, b) => a.clip.startTime - b.clip.startTime);
}
/** The cameras of a scene (one per camera id, the first shot's settings). */
export function camerasOf(scene: ShotScene): CameraSpec[] {
  const seen = new Map<string, CameraSpec>();
  for (const entry of cameraShotsOf(scene))
    if (!seen.has(entry.spec.id)) seen.set(entry.spec.id, entry.spec);
  return [...seen.values()];
}
/** The shot on screen at `time` (the later shot at a cut). */
export function activeShot(
  scene: ShotScene,
  time: number,
): CameraShotEntry | null {
  let found: CameraShotEntry | null = null;
  for (const entry of cameraShotsOf(scene))
    if (
      entry.clip.enabled &&
      time >= entry.clip.startTime - 1e-9 &&
      time < entry.clip.startTime + entry.clip.duration - 1e-9
    )
      found = entry;
  return found;
}

/** A top-level layer's centre and depth (for targets and focus objects). */
export function layerCenterFinder(
  scene: ShotScene,
  center: (id: string) => { x: number; y: number } | null,
): ShotContext['layerCenter'] {
  return (id) => {
    const layer = scene.layers.find((item) => item.id === id);
    if (!layer) return null;
    const point = center(id);
    if (!point) return null;
    const depth = layer.properties.depth;
    return {
      ...point,
      depth:
        depth?.type === 'number' && Number.isFinite(depth.value)
          ? (depth.value as number)
          : 0,
    };
  };
}

export interface CameraState {
  readonly spec: CameraSpec;
  readonly pose: Pose;
  readonly entry: CameraShotEntry;
  /** The depth in focus (the focus object's, else the pose's). */
  readonly focusDepth: number;
}
/** The camera at `time`, or null without a shot there. */
export function cameraStateAt(
  scene: ShotScene,
  time: number,
  center: (id: string) => { x: number; y: number } | null = () => null,
): CameraState | null {
  const entry = activeShot(scene, time);
  if (!entry) return null;
  const frame: Frame = { width: scene.width, height: scene.height };
  const context: ShotContext = {
    frame,
    layerCenter: layerCenterFinder(scene, center),
  };
  const local = time - entry.clip.startTime;
  const pose = applyTrackTo(
    entry.spec,
    shotPose(entry.spec, entry.shot, local, entry.clip.duration, context, time),
    context,
    time,
  );
  const focus = entry.spec.dof.focusLayer
    ? context.layerCenter(entry.spec.dof.focusLayer, time)
    : null;
  return {
    spec: entry.spec,
    pose,
    entry,
    focusDepth: focus ? focus.depth : pose.focus,
  };
}
/** FINAL3 C3: a shot's framing at its start or end (the editor's frame). */
export function shotFramePose(
  scene: ShotScene,
  entry: CameraShotEntry,
  which: 'start' | 'end',
  center: (id: string) => { x: number; y: number } | null = () => null,
): Pose {
  const frame: Frame = { width: scene.width, height: scene.height };
  const context: ShotContext = {
    frame,
    layerCenter: layerCenterFinder(scene, center),
  };
  const local = which === 'start' ? 0 : entry.clip.duration;
  const time = entry.clip.startTime + local;
  return applyTrackTo(
    entry.spec,
    shotPose(entry.spec, entry.shot, local, entry.clip.duration, context, time),
    context,
    time,
  );
}
/** What the camera sees at a pose: the frame's corners in composition space. */
export function frameCorners(
  spec: CameraSpec,
  pose: Pose,
  frame: Frame,
): [[number, number], [number, number], [number, number], [number, number]] {
  const [a, b, c, d, e, f] = poseMatrix(spec, pose, frame, 0);
  const det = a * d - b * c;
  const map = (x: number, y: number): [number, number] => [
    (d * (x - e) - c * (y - f)) / det,
    (-b * (x - e) + a * (y - f)) / det,
  ];
  return [
    map(0, 0),
    map(frame.width, 0),
    map(frame.width, frame.height),
    map(0, frame.height),
  ];
}
/** Assets of camera backgrounds included in the render (for the export). */
export function cameraBackgroundAssets(scene: ShotScene): string[] {
  return [
    ...new Set(
      cameraShotsOf(scene).flatMap((entry) =>
        entry.spec.background?.render ? [entry.spec.background.assetId] : [],
      ),
    ),
  ];
}
/** The matrix for a layer at `depth` through the camera at a state. */
export const cameraMatrixFor = (
  state: CameraState,
  frame: Frame,
  depth = 0,
): Matrix => poseMatrix(state.spec, state.pose, frame, depth);

// --- C5: the plain-data hook for the composition builder ---------------------

/** One planned shot (docs/camera.md). */
export interface CameraShotPlan {
  readonly sceneId: string;
  /** Seconds from the scene's start. */
  readonly start: number;
  readonly duration: number;
  readonly controller: ControllerId;
  readonly params?: Partial<
    Pick<
      Shot,
      | 'easing'
      | 'strength'
      | 'amount'
      | 'speed'
      | 'seed'
      | 'direction'
      | 'target'
    >
  > & { readonly camera?: string };
  readonly from?: Partial<Pose>;
  readonly to?: Partial<Pose>;
}
