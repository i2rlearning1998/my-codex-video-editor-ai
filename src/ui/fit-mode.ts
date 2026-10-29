// VID-004: Fit, Fill, Stretch and Custom for a picture or video whose shape
// differs from the scene. Each mode is only a scale and a position, so the
// result is an ordinary, undoable edit and Custom is "anything else".
import type { Command } from '../core';
import {
  layerSize,
  type RenderSource,
  type SceneLayer,
} from '../render/adapter';
import { copyProperty } from './keyframes';

export type FitMode = 'fit' | 'fill' | 'stretch' | 'custom';
export const FIT_MODES: readonly FitMode[] = [
  'fit',
  'fill',
  'stretch',
  'custom',
];
interface Box {
  readonly width: number;
  readonly height: number;
}
interface Placement {
  readonly scale: readonly [number, number];
  readonly position: readonly [number, number];
}

/** The scale and top-left position that make `media` Fit, Fill or Stretch in `scene`. */
export function fitPlacement(
  mode: Exclude<FitMode, 'custom'>,
  media: Box,
  scene: Box,
): Placement {
  const sx = scene.width / media.width;
  const sy = scene.height / media.height;
  const scale: [number, number] =
    mode === 'stretch'
      ? [sx, sy]
      : mode === 'fit'
        ? [Math.min(sx, sy), Math.min(sx, sy)]
        : [Math.max(sx, sy), Math.max(sx, sy)];
  return {
    scale,
    position: [
      (scene.width - media.width * scale[0]) / 2,
      (scene.height - media.height * scale[1]) / 2,
    ],
  };
}

/** Which mode the layer is in now; Custom when none matches. */
export function currentFitMode(
  layer: SceneLayer,
  assets: RenderSource['assets'],
  scene: Box,
): FitMode {
  const media = layerSize(layer, assets);
  if (!media) return 'custom';
  const scale = layer.transform.scale.value as readonly [number, number];
  const position = layer.transform.position.value as readonly [number, number];
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.5;
  for (const mode of ['fit', 'fill', 'stretch'] as const) {
    const want = fitPlacement(mode, media, scene);
    if (
      Math.abs(scale[0] - want.scale[0]) < 0.002 &&
      Math.abs(scale[1] - want.scale[1]) < 0.002 &&
      near(position[0], want.position[0]) &&
      near(position[1], want.position[1])
    )
      return mode;
  }
  return 'custom';
}

/** The commands that apply a mode (none for Custom or an animated transform). */
export function fitCommands(
  compositionId: string,
  layer: SceneLayer,
  mode: FitMode,
  assets: RenderSource['assets'],
  scene: Box,
): Command[] {
  const media = layerSize(layer, assets);
  if (mode === 'custom' || !media) return [];
  const want = fitPlacement(mode, media, scene);
  const set = (key: 'scale' | 'position', value: readonly [number, number]) =>
    ({
      type: 'SET_PROPERTY',
      compositionId,
      layerId: layer.id,
      target: { kind: 'transform', key },
      property: { ...copyProperty(layer.transform[key]), value: [...value] },
    }) as Command;
  return [set('scale', want.scale), set('position', want.position)];
}

/** Scale or position is animated: a mode would fight the keyframes. */
export const fitLocked = (layer: SceneLayer): boolean =>
  layer.transform.scale.animated || layer.transform.position.animated;
