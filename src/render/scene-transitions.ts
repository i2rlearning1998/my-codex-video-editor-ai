// V7 (Clipchamp clone spec 10.5): drawing a transition across a scene cut,
// shared by the editor's playback and the export worker. Both scenes are
// drawn whole (the other one held on its boundary frame), read back and
// mixed by the same pixel mix the transition tiles preview with, so every
// tile works between scenes too.
import {
  defaults as fxDefaults,
  getTransition,
  surface,
  type Surface,
} from '../fx';
import { EASING_CURVES, cubicBezier, type SceneCut } from '../core';

type Target = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** The transition `type` from `a` to `b` at progress `p`. */
export function mixFrames(type: string, a: Surface, b: Surface, p: number) {
  const { width, height } = b;
  const out = surface(width, height);
  const library = getTransition(type);
  if (library) {
    library.apply(a, b, out, p, fxDefaults(library), {
      time: 0,
      duration: 1,
      seed: 7,
      width,
      height,
    });
    return out;
  }
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const from = a.data[i + c]!,
          to = b.data[i + c]!;
        let value: number;
        switch (type) {
          case 'fade-black':
          case 'fade-white': {
            const veil = type === 'fade-black' ? 0 : 255;
            value =
              c === 3
                ? 255
                : p < 0.5
                  ? from + (veil - from) * (p * 2)
                  : veil + (to - veil) * (p * 2 - 1);
            break;
          }
          case 'wipe-left':
            value = x >= width * (1 - p) ? to : from;
            break;
          case 'wipe-right':
            value = x < width * p ? to : from;
            break;
          case 'slide-left':
          case 'slide-right': {
            const shift =
              Math.round(p * width) * (type === 'slide-left' ? 1 : -1);
            const at = x + shift;
            const j =
              at >= 0 && at < width
                ? (y * width + at) * 4
                : (y * width + (at < 0 ? at + width : at - width)) * 4;
            value = at >= 0 && at < width ? a.data[j + c]! : b.data[j + c]!;
            break;
          }
          default:
            value = from + (to - from) * p;
        }
        out.data[i + c] = value;
      }
    }
  return out;
}

const canvases: OffscreenCanvas[] = [];
function canvasFor(index: number, width: number, height: number) {
  let canvas = canvases[index];
  if (!canvas) canvas = canvases[index] = new OffscreenCanvas(width, height);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return canvas;
}
const ease = (p: number) => cubicBezier(...EASING_CURVES['ease-in-out'], p);

/**
 * Draws the cut's transition at progress `p` (0 to 1 over the window) onto
 * `context`: `draw(target, 'from')` paints the outgoing scene, `'to'` the
 * incoming one, each the whole canvas. False when it cannot (no
 * OffscreenCanvas): the caller then draws plainly.
 */
export function drawSceneTransition(
  context: Target,
  cut: SceneCut,
  p: number,
  draw: (target: Target, side: 'from' | 'to') => void,
): boolean {
  const width = context.canvas.width,
    height = context.canvas.height;
  if (typeof OffscreenCanvas === 'undefined' || !width || !height) return false;
  const read = (index: number, side: 'from' | 'to'): Surface => {
    const local = canvasFor(index, width, height).getContext('2d', {
      willReadFrequently: true,
    })!;
    local.setTransform(1, 0, 0, 1, 0, 0);
    local.clearRect(0, 0, width, height);
    draw(local, side);
    return {
      width,
      height,
      data: local.getImageData(0, 0, width, height).data,
    };
  };
  const out = mixFrames(
    cut.transition.type,
    read(0, 'from'),
    read(1, 'to'),
    ease(Math.min(1, Math.max(0, p))),
  );
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.putImageData(
    new ImageData(new Uint8ClampedArray(out.data), width, height),
    0,
    0,
  );
  context.restore();
  return true;
}
