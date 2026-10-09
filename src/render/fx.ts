// T-ALL P6: the FX library on the shared draw path (preview and export).
// An item with an effect stack is painted alone on a scratch canvas at the
// output's pixel size, read back as a Surface, processed by `renderStack`
// (unknown ids are skipped, params sanitized) and drawn back once, with its
// blend mode. A pixel transition paints both clips that way and mixes them.
import {
  getBlendMode,
  getItem,
  getTransition,
  renderStack,
  sanitize,
  surface,
  type Params,
  type Surface,
} from '../fx';
import type { RenderItem } from './adapter';

type Target = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Paint = (context: Target, item: RenderItem, fade: number) => void;

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
): boolean {
  const width = context.canvas.width,
    height = context.canvas.height;
  if (!width || !height || !scratchCanvas(0, width, height)) return false;
  try {
    const processed = (target: RenderItem, index: number): Surface => {
      const canvas = scratchCanvas(index, width, height)!;
      const local = canvas.getContext('2d', { willReadFrequently: true })!;
      local.setTransform(1, 0, 0, 1, 0, 0);
      local.clearRect(0, 0, width, height);
      paint(local, target, fade);
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
      return renderStack(source, stack, {
        time: fx.time,
        duration: Math.max(fx.duration, 1e-3),
        seed: fx.seed,
        width,
        height,
      });
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
      context.drawImage(result, 0, 0);
    } finally {
      context.restore();
    }
    return true;
  } catch {
    errors.push(`Could not apply effects to layer ${item.id}.`);
    return false;
  }
}
