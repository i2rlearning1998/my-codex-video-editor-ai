import { applyChromaCpu, finishChroma } from './cpu';
import { createWebGlChroma, type ChromaGpu } from './webgl';
import { validateFrame, type ChromaKey, type PixelFrame } from './types';
export function createChromaProcessor(
  makeGpu: () => ChromaGpu | null = createWebGlChroma,
) {
  let gpu: ChromaGpu | null | undefined;
  return {
    process(
      frame: PixelFrame,
      input: Readonly<ChromaKey>,
      backend: 'auto' | 'cpu' = 'auto',
    ): {
      frame: PixelFrame;
      backend: 'webgl' | 'cpu';
      warning?: 'GPU_FALLBACK';
    } {
      validateFrame(frame);
      if (backend === 'cpu')
        return { frame: applyChromaCpu(frame, input), backend: 'cpu' };
      try {
        if (gpu === undefined) gpu = makeGpu();
        if (gpu)
          return {
            frame: finishChroma(gpu.process(frame, input), input),
            backend: 'webgl',
          };
      } catch {
        gpu?.dispose();
        gpu = null;
      }
      return {
        frame: applyChromaCpu(frame, input),
        backend: 'cpu',
        warning: 'GPU_FALLBACK',
      };
    },
    dispose() {
      gpu?.dispose();
      gpu = undefined;
    },
  };
}
const processor = createChromaProcessor();
let frameCanvas: OffscreenCanvas | HTMLCanvasElement | undefined;
export function processChromaFrame(
  source: CanvasImageSource,
  input: Readonly<ChromaKey>,
  quality: 'full' | 'fast' = 'full',
): CanvasImageSource {
  const size = source as {
    width?: unknown;
    height?: unknown;
    videoWidth?: number;
    videoHeight?: number;
    displayWidth?: number;
    displayHeight?: number;
  };
  const w = size.displayWidth ?? size.videoWidth ?? size.width,
    h = size.displayHeight ?? size.videoHeight ?? size.height;
  if (typeof w !== 'number' || typeof h !== 'number' || w <= 0 || h <= 0)
    throw new Error('Unknown chroma source size');
  const scale = quality === 'fast' ? Math.min(1, 960 / Math.max(w, h)) : 1,
    width = Math.max(1, Math.round(w * scale)),
    height = Math.max(1, Math.round(h * scale));
  if (width * height > 16777216)
    throw new RangeError('Chroma frame exceeds 16 megapixels');
  const canvas = (frameCanvas ??=
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : document.createElement('canvas'));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true }) as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) throw new Error('Canvas2D unavailable');
  context.clearRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height),
    out = processor.process(pixels, {
      ...input,
      feather: Math.round((input.feather ?? 0) * scale),
      shrink: Math.round((input.shrink ?? 0) * scale),
    }).frame;
  pixels.data.set(out.data);
  context.putImageData(pixels, 0, 0);
  return canvas;
}
