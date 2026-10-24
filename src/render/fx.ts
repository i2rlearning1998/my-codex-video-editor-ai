// T-ALL P6: the FX library on the shared draw path (preview and export).
// An item with an effect stack is painted alone on a scratch canvas at the
// output's pixel size, read back as a Surface, processed by `renderStack`
// (unknown ids are skipped, params sanitized) and drawn back once, with its
// blend mode. A pixel transition paints both clips that way and mixes them.
import {
  getBlendMode,
  getItem,
  getTransition,
  isTimeStatic,
  renderStack,
  sanitize,
  surface,
  type Params,
  type Surface,
} from '../fx';
import type { RenderItem } from './adapter';
import { createProcessedCache } from './processed-cache';

type Target = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Paint = (
  context: Target,
  item: RenderItem,
  fade: number,
  /** FINAL3: device pixels the scratch canvas starts at (its origin). */
  offset?: readonly [number, number],
) => void;
/** FINAL3: the artboard on the output (composition size and its matrix). */
export interface FxFrame {
  readonly matrix: readonly [number, number, number, number, number, number];
  readonly width: number;
  readonly height: number;
}

/**
 * PHASE 0 E2: a stack that does not depend on time gives the same pixels for
 * the same picture, so a repeated picture (an image clip, a paused frame, a
 * redraw while only a panel changed) is processed once. Keyed by two hashes
 * of the picture's pixels plus the stack. The page only: the export worker
 * has no window and always processes.
 */
const staticResults = createProcessedCache<Surface>(48 * 1024 * 1024);
function pixelKey(data: Uint8ClampedArray): string {
  const words = new Uint32Array(
    data.buffer,
    data.byteOffset,
    data.byteLength >> 2,
  );
  let h1 = 0x811c9dc5,
    h2 = 0x1234567;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    h1 = Math.imul(h1 ^ w, 16777619);
    h2 = (Math.imul(h2, 31) + w + i) | 0;
  }
  return `${data.byteLength}:${h1 >>> 0}:${h2 >>> 0}`;
}

const scratch: OffscreenCanvas[] = [];
/** A reusable scratch canvas of the given size (null without OffscreenCanvas). */
function scratchCanvas(index: number, width: number, height: number) {
  if (typeof OffscreenCanvas === 'undefined') return null;
  let canvas = scratch[index];
  if (!canvas) canvas = scratch[index] = new OffscreenCanvas(width, height);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return canvas;
}

/** Draws `item` through its effects (and transition); false when it cannot,
 *  so the caller draws it plainly. */
export function drawWithFx(
  context: Target,
  item: RenderItem,
  fade: number,
  paint: Paint,
  from: RenderItem | undefined,
  errors: string[],
  /**
   * FINAL3 A1: the effects and transitions see the artboard, not the whole
   * editor canvas, so a wipe or a banding covers the same part of the picture
   * in the preview as in the export (the stage around the artboard is wider
   * on a 1920 px window).
   */
  frame?: FxFrame,
): boolean {
  let ox = 0,
    oy = 0,
    width = context.canvas.width,
    height = context.canvas.height;
  if (frame && frame.matrix[1] === 0 && frame.matrix[2] === 0) {
    const [a, , , d, e, f] = frame.matrix;
    ox = Math.floor(e);
    oy = Math.floor(f);
    width = Math.max(1, Math.min(8192, Math.ceil(a * frame.width + e - ox)));
    height = Math.max(1, Math.min(8192, Math.ceil(d * frame.height + f - oy)));
  }
  const offset: readonly [number, number] = [ox, oy];
  if (!width || !height || !scratchCanvas(0, width, height)) return false;
  try {
    const processed = (target: RenderItem, index: number): Surface => {
      const canvas = scratchCanvas(index, width, height)!;
      const local = canvas.getContext('2d', { willReadFrequently: true })!;
      local.setTransform(1, 0, 0, 1, 0, 0);
      local.clearRect(0, 0, width, height);
      paint(local, target, fade, offset);
      const pixels = local.getImageData(0, 0, width, height);
      const source: Surface = { width, height, data: pixels.data };
      const fx = target.fx;
      const stack = (fx?.stack ?? []).flatMap((entry) => {
        const definition = getItem(entry.id);
        return definition && definition.kind !== 'transition'
          ? [
              {
                id: entry.id,
                params: sanitize(definition.params, entry.params as Params),
              },
            ]
          : [];
      });
      if (!fx || !stack.length) return source;
      const cacheable =
        typeof window !== 'undefined' &&
        stack.every((entry) => isTimeStatic(entry.id));
      const key = cacheable
        ? `${pixelKey(source.data)}|${JSON.stringify(stack)}`
        : '';
      if (cacheable) {
        const hit = staticResults.get(key);
        if (hit) return hit;
      }
      const result = renderStack(source, stack, {
        time: fx.time,
        duration: Math.max(fx.duration, 1e-3),
        seed: fx.seed,
        width,
        height,
      });
      if (cacheable) staticResults.set(key, result, result.data.byteLength);
      return result;
    };
    let out = processed(item, 0);
    const transition = item.fxTransition
      ? getTransition(item.fxTransition.id)
      : undefined;
    if (transition && from) {
      const before = processed(from, 1);
      const mixed = surface(width, height);
      transition.apply(
        before,
        out,
        mixed,
        Math.min(1, Math.max(0, item.fxTransition!.progress)),
        sanitize(transition.params, item.fxTransition!.params as Params),
        { time: 0, duration: 1, seed: item.fx?.seed ?? 0, width, height },
      );
      out = mixed;
    }
    const result = scratchCanvas(2, width, height)!;
    const resultContext = result.getContext('2d')!;
    resultContext.putImageData(
      new ImageData(out.data as Uint8ClampedArray<ArrayBuffer>, width, height),
      0,
      0,
    );
    context.save();
    try {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;
      context.globalCompositeOperation = (getBlendMode(
        item.fx?.blendMode ?? 'blend.normal',
      )?.operation ?? 'source-over') as GlobalCompositeOperation;
      context.drawImage(result, ox, oy);
    } finally {
      context.restore();
    }
    return true;
  } catch {
    errors.push(`Could not apply effects to layer ${item.id}.`);
    return false;
  }
}
