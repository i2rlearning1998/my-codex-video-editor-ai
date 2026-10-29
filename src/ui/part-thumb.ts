// FIX9: a picture of one part of a scene (a shape, a text, a picture, a code
// animation …) drawn alone with the editor's own renderer, cropped to the
// part so a small shape fills its card instead of sitting tiny in a frame.
// It serves the in-panel asset view of My Templates and of AI compositions.
import {
  compositionAt,
  type Asset,
  type Composition,
  type Layer,
} from '../core';
import type { FrameProvider, RenderSource } from '../render/adapter';
import { drawComposition } from '../render/canvas';

const number = (property: unknown): number | null => {
  const value = (property as { value?: unknown } | undefined)?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

type Box = { x: number; y: number; w: number; h: number };

/** A layer's own box, or the union of a group's children (null: unknown). */
function boxOf(layer: Layer): Box | null {
  const width = number(layer.properties.width);
  const height = number(layer.properties.height);
  const position = layer.transform.position.value;
  const scale = layer.transform.scale.value;
  const sx = Math.abs(scale[0] ?? 1),
    sy = Math.abs(scale[1] ?? 1);
  if (width && height && width > 0 && height > 0)
    return { x: position[0], y: position[1], w: width * sx, h: height * sy };
  const boxes = layer.children
    .map(boxOf)
    .filter((box): box is Box => box !== null);
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((box) => box.x)),
    top = Math.min(...boxes.map((box) => box.y)),
    right = Math.max(...boxes.map((box) => box.x + box.w)),
    bottom = Math.max(...boxes.map((box) => box.y + box.h));
  return {
    x: position[0] + left * sx,
    y: position[1] + top * sy,
    w: (right - left) * sx,
    h: (bottom - top) * sy,
  };
}

/** The part's box in scene coordinates, or the whole frame when unknown. */
export function partBox(scene: Composition, layer: Layer): Box {
  // A turned part is boxed unturned; the margin around it absorbs the turn.
  return boxOf(layer) ?? { x: 0, y: 0, w: scene.width, h: scene.height };
}

/** Draws `layer` alone into `canvas` (returns false when it cannot). */
export function drawPartThumb(
  canvas: HTMLCanvasElement,
  scene: Composition,
  assets: readonly Asset[],
  layer: Layer,
  frames?: FrameProvider,
  measureText?: RenderSource['measureText'],
): boolean {
  const context = canvas.getContext('2d');
  if (!context) return false;
  const clip = scene.tracks
    .flatMap((track) => track.clips)
    .find((item) => item.layerId === layer.id);
  // A moment when the part is in (text and pictures have arrived).
  const at = clip
    ? clip.startTime + Math.min(clip.duration * 0.5, 2)
    : Math.min(scene.duration * 0.4, 2);
  const alone: Composition = {
    ...scene,
    layers: [layer],
    tracks: scene.tracks.map((track) => ({
      ...track,
      clips: track.clips.filter((item) => item.layerId === layer.id),
    })),
  };
  const source: RenderSource = {
    composition: compositionAt(
      alone as unknown as { readonly layers: readonly object[] },
      at,
    ) as unknown as RenderSource['composition'],
    assets: assets as never,
    background: scene.backgroundColor,
    currentTime: at,
    ...(frames ? { frames, playing: false } : {}),
    ...(measureText ? { measureText } : {}),
  };
  const box = partBox(scene, layer);
  const zoom = Math.min(
    (canvas.width * 0.84) / box.w,
    (canvas.height * 0.84) / box.h,
  );
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawComposition(
    context,
    source,
    {
      width: canvas.width,
      height: canvas.height,
      pixelRatio: 1,
      matrix: [
        zoom,
        0,
        0,
        zoom,
        canvas.width / 2 - (box.x + box.w / 2) * zoom,
        canvas.height / 2 - (box.y + box.h / 2) * zoom,
      ],
    },
    null,
    { overlays: false },
  );
  return true;
}
