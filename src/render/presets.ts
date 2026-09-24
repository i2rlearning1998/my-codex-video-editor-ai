// W5-C animation presets (ANI-007, ANI-008), applied only when drawing, on top
// of keyframe evaluation. Preview and export share this code. Hit-testing and
// editing use the layer's resting geometry (D-072), so nothing here is stored.
import {
  EASING_CURVES,
  boundsCorners,
  clipAnimation,
  cubicBezier,
  localTransformMatrix,
  number,
  transformPoint,
  type ClipAnimation,
  type InOutPreset,
  type Point2,
  type TransformValues,
} from '../core';
import { layerSize, type RenderSource, type SceneLayer } from './adapter';

type Composition = RenderSource['composition'];
type Clip = Composition['tracks'][number]['clips'][number];

const easeOut = (p: number) => cubicBezier(...EASING_CURVES['ease-out'], p);
const easeIn = (p: number) => cubicBezier(...EASING_CURVES['ease-in'], p);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Local bounds of a layer: its size, or the union of its children's boxes. */
function localBounds(
  layer: SceneLayer,
  assets: RenderSource['assets'],
): { x: number; y: number; width: number; height: number } | null {
  if (layer.type !== 'group') {
    const size = layerSize(layer, assets);
    return size ? { x: 0, y: 0, width: size.width, height: size.height } : null;
  }
  const points = layer.children.flatMap((child) => {
    const bounds = localBounds(child, assets);
    if (!bounds) return [];
    const matrix = localTransformMatrix(child.transform as TransformValues);
    return boundsCorners(bounds).map((point) => transformPoint(matrix, point));
  });
  if (!points.length) return null;
  const xs = points.map((point) => point[0]),
    ys = points.map((point) => point[1]);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** The effect of all presets on one layer at clip-local time `local`. */
export interface PresetEffect {
  opacity: number;
  scale: number;
  rotation: number;
  offset: [number, number];
  reveal: number;
  characters: number;
}
const identity = (): PresetEffect => ({
  opacity: 1,
  scale: 1,
  rotation: 0,
  offset: [0, 0],
  reveal: 1,
  characters: 1,
});

/** Applies an In or Out preset at visibility v (0 hidden, 1 at rest). */
function applyInOut(
  effect: PresetEffect,
  preset: InOutPreset,
  v: number,
  raw: number,
  size: { width: number; height: number },
  leaving = false,
): void {
  switch (preset.preset) {
    case 'fade':
      effect.opacity *= v;
      return;
    case 'slide': {
      const distance =
        preset.direction === 'left' || preset.direction === 'right'
          ? size.width * 0.15
          : size.height * 0.15;
      // In: arrives moving in `direction` (starts behind). Out: leaves that way.
      const away = (1 - v) * distance * (leaving ? -1 : 1);
      const direction = preset.direction ?? 'up';
      effect.offset[0] +=
        direction === 'left' ? away : direction === 'right' ? -away : 0;
      effect.offset[1] +=
        direction === 'up' ? away : direction === 'down' ? -away : 0;
      effect.opacity *= v;
      return;
    }
    case 'zoom':
      effect.scale *= 0.6 + 0.4 * v;
      effect.opacity *= v;
      return;
    case 'pop':
      // 0 → 1.1 at 70% of the way → 1 at rest (linear progress).
      effect.scale *=
        raw < 0.7 ? (1.1 * raw) / 0.7 : 1.1 - (0.1 * (raw - 0.7)) / 0.3;
      return;
    case 'wipe':
      effect.reveal *= v;
      return;
    case 'typewriter':
      effect.characters *= raw;
      return;
  }
}

export function presetEffect(
  animation: ClipAnimation,
  local: number,
  duration: number,
  composition: { width: number; height: number },
  isImage: boolean,
  layerWidth: number,
): PresetEffect {
  const effect = identity();
  let inTime = animation.in?.duration ?? 0,
    outTime = animation.out?.duration ?? 0;
  // In and Out shrink together when they would overlap.
  if (inTime + outTime > duration && inTime + outTime > 0) {
    const k = duration / (inTime + outTime);
    inTime *= k;
    outTime *= k;
  }
  if (animation.in && inTime > 0 && local < inTime) {
    const raw = clamp01(local / inTime);
    applyInOut(effect, animation.in, easeOut(raw), raw, composition);
  }
  if (animation.out && outTime > 0 && local > duration - outTime) {
    const raw = clamp01((duration - local) / outTime);
    applyInOut(
      effect,
      animation.out,
      1 - easeIn(1 - raw),
      raw,
      composition,
      true,
    );
  }
  if (animation.loop) {
    const phase = local / animation.loop.period;
    const wave = Math.sin(2 * Math.PI * phase);
    switch (animation.loop.preset) {
      case 'pulse':
        effect.scale *= 1 + 0.06 * wave;
        break;
      case 'float':
        effect.offset[1] -= 12 * wave;
        break;
      case 'spin':
        effect.rotation += 360 * phase;
        break;
      case 'wiggle':
        effect.rotation +=
          4 * wave + 2 * Math.sin(2 * Math.PI * phase * 2.7 + 1);
        break;
    }
  }
  if (animation.kenBurns && isImage) {
    const f = clamp01(local / duration);
    effect.scale *=
      animation.kenBurns.zoom === 'in' ? 1 + 0.15 * f : 1.15 - 0.15 * f;
    effect.offset[0] += layerWidth * 0.03 * (0.5 - f) * 2;
  }
  return effect;
}

function modulate(
  layer: SceneLayer,
  clip: Clip,
  animation: ClipAnimation,
  time: number,
  composition: Composition,
  assets: RenderSource['assets'],
): SceneLayer {
  const local = time - clip.startTime;
  if (local < 0 || local > clip.duration) return layer;
  const bounds = localBounds(layer, assets);
  const base = layer.transform as TransformValues;
  const effect = presetEffect(
    animation,
    local,
    clip.duration,
    composition,
    layer.type === 'image',
    (bounds?.width ?? 0) * Math.abs(base.scale.value[0]),
  );
  const center: Point2 = bounds
    ? [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2]
    : [0, 0];
  const after: TransformValues = {
    ...base,
    scale: {
      value: [
        base.scale.value[0] * effect.scale,
        base.scale.value[1] * effect.scale,
      ],
    },
    rotation: { value: base.rotation.value + effect.rotation },
    opacity: { value: base.opacity.value * effect.opacity },
  };
  // Scale and rotation happen about the visual center (the contract's compensation).
  const fixed = transformPoint(localTransformMatrix(base), center);
  const moved = transformPoint(
    localTransformMatrix({ ...after, position: { value: [0, 0] } }),
    center,
  );
  const position: Point2 = [
    fixed[0] - moved[0] + effect.offset[0],
    fixed[1] - moved[1] + effect.offset[1],
  ];
  const transform = Object.freeze(
    Object.fromEntries(
      (['position', 'scale', 'rotation', 'opacity'] as const).map((key) => [
        key,
        Object.freeze({
          ...((layer.transform as Record<string, object>)[key] as object),
          value: key === 'position' ? position : after[key].value,
        }),
      ]),
    ),
  );
  let properties = layer.properties as Record<string, unknown>;
  if (effect.reveal < 1)
    properties = { ...properties, presetReveal: number(effect.reveal) };
  const text = layer.properties.text;
  if (
    effect.characters < 1 &&
    layer.type === 'text' &&
    text?.type === 'string'
  ) {
    const characters = [...text.value];
    properties = {
      ...properties,
      text: {
        ...(text as object),
        value: characters
          .slice(0, Math.ceil(characters.length * effect.characters))
          .join(''),
      },
    };
  }
  return Object.freeze({
    ...(layer as object),
    transform,
    properties,
  }) as unknown as SceneLayer;
}

/** The composition as drawn at `time`, with every clip's presets applied. */
export function applyPresets<C extends Composition>(
  composition: C,
  assets: RenderSource['assets'],
  time: number,
): C {
  const animated = new Map<string, { clip: Clip; animation: ClipAnimation }>();
  for (const track of composition.tracks)
    for (const clip of track.clips) {
      const animation = clipAnimation(clip);
      if (Object.keys(animation).length)
        animated.set(clip.layerId, { clip, animation });
    }
  if (!animated.size) return composition;
  let changed = false;
  const layers = composition.layers.map((layer) => {
    const entry = animated.get(layer.id);
    if (!entry) return layer;
    const next = modulate(
      layer,
      entry.clip,
      entry.animation,
      time,
      composition,
      assets,
    );
    changed ||= next !== layer;
    return next;
  });
  return changed ? ({ ...composition, layers } as C) : composition;
}
