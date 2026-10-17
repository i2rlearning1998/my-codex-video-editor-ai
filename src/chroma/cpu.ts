import {
  settings,
  validateFrame,
  colorChannels,
  type ChromaKey,
  type PixelFrame,
} from './types';
export function baseChroma(
  frame: PixelFrame,
  input: Readonly<ChromaKey>,
): PixelFrame {
  validateFrame(frame);
  const p = settings(input),
    key = colorChannels(p.color),
    dominant = key.indexOf(Math.max(...key)),
    data = new Uint8ClampedArray(frame.data);
  for (let i = 0; i < data.length; i += 4) {
    const rgb = [
        frame.data[i]! / 255,
        frame.data[i + 1]! / 255,
        frame.data[i + 2]! / 255,
      ],
      distance = Math.hypot(...rgb.map((v, j) => v - key[j]!)) / Math.sqrt(3),
      t = p.smoothness
        ? Math.max(0, Math.min(1, (distance - p.similarity) / p.smoothness))
        : distance > p.similarity
          ? 1
          : 0,
      keep = t * t * (3 - 2 * t);
    data[i + 3] = Math.round(frame.data[i + 3]! * (p.invert ? 1 - keep : keep));
    const other = Math.max(...rgb.filter((_, j) => j !== dominant));
    data[i + dominant] = Math.round(
      255 *
        (rgb[dominant]! -
          p.spill * (1 - keep) * Math.max(0, rgb[dominant]! - other)),
    );
  }
  return { width: frame.width, height: frame.height, data };
}
/** Shared edge pass, including GPU results. Radius is in source pixels. */
export function finishChroma(
  frame: PixelFrame,
  input: Readonly<ChromaKey>,
): PixelFrame {
  const p = settings(input);
  validateFrame(frame);
  let alpha = Uint8ClampedArray.from(
    { length: frame.width * frame.height },
    (_, i) => frame.data[i * 4 + 3]!,
  );
  for (const kind of ['shrink', 'feather'] as const) {
    const radius = p[kind];
    if (!radius) continue;
    const next = new Uint8ClampedArray(alpha.length);
    for (let y = 0; y < frame.height; y++)
      for (let x = 0; x < frame.width; x++) {
        let value = kind === 'shrink' ? 255 : 0,
          count = 0;
        for (let dy = -radius; dy <= radius; dy++)
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = Math.max(0, Math.min(frame.width - 1, x + dx)),
              yy = Math.max(0, Math.min(frame.height - 1, y + dy)),
              a = alpha[yy * frame.width + xx]!;
            value = kind === 'shrink' ? Math.min(value, a) : value + a;
            count++;
          }
        next[y * frame.width + x] =
          kind === 'shrink' ? value : Math.round(value / count);
      }
    alpha = next;
  }
  const data = new Uint8ClampedArray(frame.data);
  for (let i = 0; i < alpha.length; i++) data[i * 4 + 3] = alpha[i]!;
  return { width: frame.width, height: frame.height, data };
}
export const applyChromaCpu = (frame: PixelFrame, input: Readonly<ChromaKey>) =>
  finishChroma(baseChroma(frame, input), input);
