// FINAL2 U10: the scene camera (docs/CAMERA-API.md) of older projects:
// its data helpers, the canvas badge and the transient view state. FINAL3
// C3 replaced its keyframed side panel with the right panel's Camera
// section (camera-section.ts), which can remove such a camera; playback
// and export still apply it.
import { t } from '../i18n';
import type { Composition, DeepReadonly, SceneCamera } from '../core';
import {
  cameraFromTracks,
  sceneCameraAt,
  type CameraPreset,
} from '../camera/scene';

/** Transient view state (not saved, no history). */
export const cameraView = {
  preview: false,
  /** The last preset applied per scene, for the canvas badge. */
  presets: new Map<string, CameraPreset | 'custom'>(),
};

type Key = 'zoom' | 'x' | 'y' | 'rotation';

/** A camera property with `value` at `time`: a keyframe there when animated. */
export function setCameraValue(
  camera: SceneCamera,
  key: Key,
  value: number,
  time: number,
): SceneCamera {
  const next = structuredClone(camera as unknown) as SceneCamera;
  const property = next[key];
  if (!property.animated) property.value = value;
  else {
    const others = property.keyframes.filter(
      (frame) => Math.abs(frame.time - time) > 1e-6,
    );
    property.keyframes = [...others, { time, value }].sort(
      (a, b) => a.time - b.time,
    );
  }
  return next;
}
/** Turns a property's keyframes on (one keyframe at `time`) or off. */
export function toggleCameraKeyframes(
  camera: SceneCamera,
  key: Key,
  time: number,
): SceneCamera {
  const next = structuredClone(camera as unknown) as SceneCamera;
  const property = next[key];
  const now =
    sceneCameraAt({ camera, width: 1, height: 1 }, time)?.[key] ??
    property.value;
  if (property.animated) {
    property.animated = false;
    property.keyframes = [];
    property.value = Number(now);
  } else {
    property.animated = true;
    property.keyframes = [{ time, value: Number(now) }];
  }
  return next;
}

/** The camera with nothing moving. */
export const restingCamera = (): SceneCamera => cameraFromTracks({});

/** The badge text for a scene with a camera, else null. */
export function cameraBadge(
  composition: DeepReadonly<Composition>,
): string | null {
  if (!composition.camera) return null;
  const preset = cameraView.presets.get(composition.id) ?? 'custom';
  return t('camera.badge', {
    name: t(preset === 'custom' ? 'camera.custom' : `camera.preset.${preset}`),
  });
}
