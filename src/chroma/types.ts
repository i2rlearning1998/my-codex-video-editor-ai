import { z } from 'zod';
export const chromaSchema = z
  .object({
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    similarity: z.number().finite().min(0).max(1).optional(),
    smoothness: z.number().finite().min(0).max(1).optional(),
    spill: z.number().finite().min(0).max(1).optional(),
    feather: z.number().int().min(0).max(8).optional(),
    shrink: z.number().int().min(0).max(8).optional(),
    invert: z.boolean().optional(),
  })
  .strict();
export type ChromaKey = z.infer<typeof chromaSchema>;
export interface PixelFrame {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
export function settings(input: Readonly<ChromaKey>) {
  const p = chromaSchema.parse(input);
  return {
    color: p.color,
    similarity: p.similarity ?? 0.15,
    smoothness: p.smoothness ?? 0.1,
    spill: p.spill ?? 0.5,
    feather: p.feather ?? 0,
    shrink: p.shrink ?? 0,
    invert: p.invert ?? false,
  };
}
export function validateFrame(frame: PixelFrame) {
  if (
    !Number.isInteger(frame.width) ||
    !Number.isInteger(frame.height) ||
    frame.width <= 0 ||
    frame.height <= 0 ||
    frame.width * frame.height > 16777216 ||
    frame.data.length !== frame.width * frame.height * 4
  )
    throw new RangeError('Invalid chroma frame (16 megapixel limit)');
}
export function sampleColorAt(frame: PixelFrame, x: number, y: number): string {
  validateFrame(frame);
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= frame.width ||
    y >= frame.height
  )
    throw new RangeError('Sample point outside frame');
  const i = (y * frame.width + x) * 4;
  return (
    '#' +
    Array.from(frame.data.slice(i, i + 3))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}
export const colorChannels = (color: string) =>
  [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
