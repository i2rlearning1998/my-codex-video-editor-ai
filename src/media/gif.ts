// VID-008: an animated GIF is an animated clip. The browser's ImageDecoder
// reads every frame once; a frame is then picked by the clip's time, and the
// GIF repeats for as long as the clip lasts.
export interface GifFrames {
  readonly frames: readonly ImageBitmap[];
  /** Seconds at which each frame stops showing (cumulative). */
  readonly ends: readonly number[];
  /** One loop, in seconds. */
  readonly duration: number;
}
/** A GIF shorter than this still plays at this length per frame (browsers do the same). */
const DEFAULT_FRAME = 0.1;
const MIN_FRAME = 0.02;
/** Frames times pixels a GIF may hold decoded (about 600 MB of pictures). */
const MAX_PIXELS = 150_000_000;
const MAX_FRAMES = 1000;

interface DecoderApi {
  tracks: {
    ready: Promise<unknown>;
    selectedTrack?: { frameCount: number };
  };
  decode(options: {
    frameIndex: number;
    completeFramesOnly?: boolean;
  }): Promise<{ image: VideoFrame }>;
  close(): void;
}
const decoderClass = ():
  | (new (init: {
      data: ReadableStream | BufferSource;
      type: string;
    }) => DecoderApi)
  | null =>
  (globalThis as unknown as { ImageDecoder?: never }).ImageDecoder ?? null;

export const isGifType = (mime: unknown): boolean => mime === 'image/gif';

/**
 * Decodes the frames of a GIF; null when this browser cannot, the file has a
 * single frame, or it is too big to hold. `keep` false only measures the loop.
 */
export async function decodeGif(
  blob: Blob,
  keep = true,
): Promise<GifFrames | null> {
  const Decoder = decoderClass();
  if (!Decoder) return null;
  const decoder = new Decoder({
    data: await blob.arrayBuffer(),
    type: 'image/gif',
  });
  const frames: ImageBitmap[] = [];
  const ends: number[] = [];
  let total = 0;
  try {
    await decoder.tracks.ready;
    const count = decoder.tracks.selectedTrack?.frameCount ?? 0;
    if (count < 2 || count > MAX_FRAMES) return null;
    for (let index = 0; index < count; index++) {
      const { image } = await decoder.decode({
        frameIndex: index,
        completeFramesOnly: true,
      });
      if (
        index === 0 &&
        image.displayWidth * image.displayHeight * count > MAX_PIXELS
      ) {
        image.close();
        return null;
      }
      const seconds =
        image.duration && image.duration > 0
          ? Math.max(MIN_FRAME, image.duration / 1e6)
          : DEFAULT_FRAME;
      if (keep) frames.push(await createImageBitmap(image));
      image.close();
      total += seconds;
      ends.push(total);
    }
  } catch {
    for (const frame of frames) frame.close();
    return null;
  } finally {
    decoder.close();
  }
  return { frames, ends, duration: total };
}

/** The frame shown `time` seconds after the clip started (the GIF repeats). */
export function gifFrameIndex(
  ends: readonly number[],
  duration: number,
  time: number,
): number {
  if (!ends.length || duration <= 0) return 0;
  let at = time % duration;
  if (at < 0) at += duration;
  let low = 0;
  let high = ends.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (ends[middle]! > at) high = middle;
    else low = middle + 1;
  }
  return low;
}
export function gifFrameAt(gif: GifFrames, time: number): ImageBitmap {
  return gif.frames[gifFrameIndex(gif.ends, gif.duration, time)]!;
}

/** One loop of a GIF in seconds, or undefined when it is not animated. */
export async function gifLoopSeconds(blob: Blob): Promise<number | undefined> {
  const measured = await decodeGif(blob, false);
  return measured ? Math.round(measured.duration * 1000) / 1000 : undefined;
}
