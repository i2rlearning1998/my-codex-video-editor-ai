import { applyBlendMode } from '../blend';
import {
  invertMatrix,
  transformPoint,
  type AffineMatrix,
} from '../core/transforms';
import { stackAlpha, matteAlpha, type ReadMask } from './geometry';
import type { Matte } from './types';
export interface MaskScope {
  readonly blendMode?: string | undefined;
  readonly id: string;
  readonly matrix: AffineMatrix;
  readonly masks: readonly ReadMask[];
  readonly matte?: Readonly<Matte> | undefined;
}
export interface MaskItem {
  readonly id: string;
  readonly ancestors: readonly string[];
  readonly maskScopes?: readonly MaskScope[];
}
type Target = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Canvas = HTMLCanvasElement | OffscreenCanvas;
export function createMaskCanvas(width: number, height: number): Canvas {
  if (typeof OffscreenCanvas !== 'undefined')
    return new OffscreenCanvas(width, height);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }
  throw new Error('Mask rendering requires Canvas2D');
}
export function rasterMask(
  width: number,
  height: number,
  matrix: AffineMatrix,
  masks: readonly ReadMask[],
): Uint8ClampedArray {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > 16777216
  )
    throw new RangeError('Mask canvas exceeds 16 megapixels');
  const inverse = invertMatrix(matrix),
    out = new Uint8ClampedArray(width * height);
  if (!inverse) return out;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      out[y * width + x] = Math.round(
        255 * stackAlpha(masks, transformPoint(inverse, [x + 0.5, y + 0.5])),
      );
  return out;
}
export function createMaskCache(limit = 4) {
  const entries = new Map<string, Uint8ClampedArray>();
  return {
    get(
      width: number,
      height: number,
      matrix: AffineMatrix,
      masks: readonly ReadMask[],
    ) {
      const key = JSON.stringify([
        width,
        height,
        matrix,
        masks.map(({ keyframes: _, ...m }) => m),
      ]);
      let value = entries.get(key);
      if (!value) {
        value = rasterMask(width, height, matrix, masks);
        entries.set(key, value);
        if (entries.size > limit) entries.delete(entries.keys().next().value!);
      }
      return value.slice();
    },
    clear() {
      entries.clear();
    },
  };
}
const cache = createMaskCache();
/** The caller supplies output-pixel matrices, and paints complete isolated items. */
export function drawMaskedItems<T extends MaskItem>(
  context: Target,
  items: readonly T[],
  all: readonly T[],
  paint: (ctx: Target, item: T) => void,
  errors: string[],
  makeCanvas = createMaskCanvas,
): boolean {
  if (!items.some((i) => i.maskScopes?.length)) return false;
  const width = context.canvas.width,
    height = context.canvas.height;
  const surface = () => {
    const c = makeCanvas(width, height),
      ctx = c.getContext('2d') as Target | null;
    if (!ctx) throw new Error('Canvas2D unavailable');
    return { c, ctx };
  };
  const draw = (target: Target, list: readonly T[], depth: number) => {
    for (let i = 0; i < list.length;) {
      const first = list[i]!,
        scope = first.maskScopes?.[depth];
      if (!scope) {
        paint(target, first);
        i++;
        continue;
      }
      let end = i + 1;
      while (
        end < list.length &&
        list[end]!.maskScopes?.[depth]?.id === scope.id
      )
        end++;
      const isolated = surface();
      draw(isolated.ctx, list.slice(i, end), depth + 1);
      if (scope.masks.length || scope.matte) {
        const alpha = cache.get(width, height, scope.matrix, scope.masks);
        if (scope.matte) {
          const candidates = all.filter(
            (item) =>
              item.id === scope.matte!.layerId ||
              item.ancestors.includes(scope.matte!.layerId),
          );
          if (!candidates.length) {
            errors.push(`Matte source ${scope.matte.layerId} is missing.`);
            alpha.fill(0);
          } else {
            const matte = surface();
            candidates.forEach((item) => paint(matte.ctx, item));
            const data = matte.ctx.getImageData(0, 0, width, height).data;
            for (let p = 0; p < alpha.length; p++) {
              const n = p * 4;
              alpha[p] = Math.round(
                alpha[p]! *
                  matteAlpha(
                    data[n]!,
                    data[n + 1]!,
                    data[n + 2]!,
                    data[n + 3]!,
                    scope.matte.type,
                    scope.matte.invert,
                  ),
              );
            }
          }
        }
        const stencil = surface(),
          pixels = stencil.ctx.createImageData(width, height);
        for (let p = 0; p < alpha.length; p++)
          pixels.data[p * 4 + 3] = alpha[p]!;
        stencil.ctx.putImageData(pixels, 0, 0);
        isolated.ctx.globalCompositeOperation = 'destination-in';
        isolated.ctx.drawImage(stencil.c, 0, 0);
      }
      target.save();
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.globalAlpha = 1;
      applyBlendMode(target, scope.blendMode, (warning) =>
        errors.push(`${warning.code}: ${warning.message}`),
      );
      target.drawImage(isolated.c, 0, 0);
      target.restore();
      i = end;
    }
  };
  try {
    draw(context, items, 0);
  } catch (error) {
    errors.push(
      `Masks could not render: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
  return true;
}
