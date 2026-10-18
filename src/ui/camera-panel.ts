// FINAL2 U10: the scene camera (docs/CAMERA-API.md), opened from the scene
// toolbar's Camera button as a left side panel. Presets, then zoom, X, Y and
// rotation with keyframe buttons. Owner rule: playback and export always
// apply the camera; the editing canvas shows the scene un-moved unless
// "Preview camera" is on. While previewing, picking objects is off (a hint
// says so), because handles are drawn at the resting place.
import { t } from '../i18n';
import type { Command, Composition, DeepReadonly, SceneCamera } from '../core';
import {
  CAMERA_PRESETS,
  cameraFromTracks,
  cameraPreset,
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
const KEYS: readonly Key[] = ['zoom', 'x', 'y', 'rotation'];

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

export interface CameraPanelDeps {
  composition(): DeepReadonly<Composition>;
  time(): number;
  run(label: string, commands: Command[]): void;
  /** Redraws the canvas (the preview toggle changed). */
  redraw(): void;
}

export function cameraPanel(deps: CameraPanelDeps): HTMLElement {
  const composition = deps.composition();
  const camera = composition.camera as unknown as SceneCamera | undefined;
  const set = (label: string, next: SceneCamera | null) =>
    deps.run(label, [
      {
        type: 'SET_COMPOSITION_CAMERA',
        compositionId: composition.id,
        camera: next,
      },
    ] as unknown as Command[]);
  const root = document.createElement('div');
  root.className = 'camera-panel';
  const note = document.createElement('p');
  note.className = 'settings-note';
  note.textContent = t('camera.note');
  const presets = document.createElement('div');
  presets.className = 'camera-presets';
  for (const preset of CAMERA_PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button secondary sm';
    button.dataset.cameraPreset = preset;
    button.textContent = t(`camera.preset.${preset}`);
    button.setAttribute(
      'aria-pressed',
      String(cameraView.presets.get(composition.id) === preset),
    );
    button.onclick = () => {
      cameraView.presets.set(composition.id, preset);
      set(
        'Camera preset',
        cameraPreset(
          preset,
          { width: composition.width, height: composition.height },
          0,
          composition.duration,
        ),
      );
    };
    presets.append(button);
  }
  const none = document.createElement('button');
  none.type = 'button';
  none.className = 'button ghost sm';
  none.dataset.cameraPreset = 'none';
  none.textContent = t('camera.none');
  none.disabled = !camera;
  none.onclick = () => {
    cameraView.presets.delete(composition.id);
    set('Remove camera', null);
  };
  presets.append(none);

  const fields = document.createElement('div');
  fields.className = 'camera-fields';
  const now = sceneCameraAt(composition, deps.time());
  for (const key of KEYS) {
    const row = document.createElement('label');
    row.className = 'camera-field';
    const label = document.createElement('span');
    label.textContent = t(`camera.${key}`);
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'camera-input';
    input.dataset.cameraKey = key;
    input.step = key === 'zoom' ? '0.05' : '1';
    if (key === 'zoom') {
      input.min = '0.05';
      input.max = '100';
    }
    const value = now?.[key] ?? (key === 'zoom' ? 1 : 0);
    input.value = String(Math.round(value * 1000) / 1000);
    input.onchange = () => {
      const typed = Number(input.value);
      if (!Number.isFinite(typed) || (key === 'zoom' && typed <= 0)) {
        input.value = String(value);
        return;
      }
      cameraView.presets.set(composition.id, 'custom');
      set(
        'Camera',
        setCameraValue(camera ?? restingCamera(), key, typed, deps.time()),
      );
    };
    const keyframe = document.createElement('button');
    keyframe.type = 'button';
    keyframe.className = 'icon-button camera-keyframe';
    keyframe.dataset.cameraKeyframe = key;
    const animated = !!(
      camera as { [k: string]: { animated?: boolean } } | undefined
    )?.[key]?.animated;
    keyframe.setAttribute('aria-pressed', String(animated));
    keyframe.title = t(animated ? 'camera.keyframesOff' : 'camera.keyframesOn');
    keyframe.setAttribute('aria-label', keyframe.title);
    keyframe.textContent = '◆';
    keyframe.onclick = () => {
      cameraView.presets.set(composition.id, 'custom');
      set(
        'Camera keyframes',
        toggleCameraKeyframes(camera ?? restingCamera(), key, deps.time()),
      );
    };
    row.append(label, input, keyframe);
    fields.append(row);
  }

  const preview = document.createElement('label');
  preview.className = 'camera-preview';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.id = 'camera-preview';
  box.checked = cameraView.preview;
  box.onchange = () => {
    cameraView.preview = box.checked;
    deps.redraw();
  };
  preview.append(box, document.createTextNode(` ${t('camera.preview')}`));
  const hint = document.createElement('p');
  hint.className = 'settings-note';
  hint.textContent = t('camera.previewHint');
  root.append(note, presets, fields, preview, hint);
  return root;
}

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
