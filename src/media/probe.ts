// Browser-side media inspection: what kind a file is, its size and duration, and a
// small thumbnail. Everything decodes through the browser's own media elements (D-005).

export type MediaKind = 'video' | 'audio' | 'image';

const EXTENSIONS: Record<string, MediaKind> = {
  mp4: 'video',
  m4v: 'video',
  mov: 'video',
  webm: 'video',
  mkv: 'video',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  aac: 'audio',
  ogg: 'audio',
  oga: 'audio',
  opus: 'audio',
  flac: 'audio',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  svg: 'image',
  avif: 'image',
};

/** MIME type first, then the extension; null for anything that is not media. */
export function classifyMedia(file: {
  name: string;
  type: string;
}): MediaKind | null {
  const major = file.type.split('/')[0];
  if (major === 'video' || major === 'audio' || major === 'image') return major;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSIONS[extension] ?? null;
}

export interface MediaProbe {
  width?: number;
  height?: number;
  duration?: number;
}

const TIMEOUT_MS = 15_000;

function waitFor(
  target: EventTarget,
  success: string,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener(success, ok);
      target.removeEventListener('error', fail);
      signal?.removeEventListener('abort', cancel);
    };
    const ok = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error('unreadable'));
    };
    const cancel = () => {
      cleanup();
      reject(new DOMException('Import cancelled', 'AbortError'));
    };
    const timer = setTimeout(fail, TIMEOUT_MS);
    target.addEventListener(success, ok, { once: true });
    target.addEventListener('error', fail, { once: true });
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

async function loadElement(
  kind: MediaKind,
  url: string,
  signal?: AbortSignal,
): Promise<HTMLVideoElement | HTMLAudioElement | HTMLImageElement> {
  if (kind === 'image') {
    const image = new Image();
    image.decoding = 'async';
    const loaded = waitFor(image, 'load', signal);
    image.src = url;
    await loaded;
    return image;
  }
  const element = document.createElement(kind);
  // With 'metadata', Chromium cancels its own fetch once it has the header, which
  // shows up as an aborted request; 'auto' lets the fetch finish (the browser still
  // caps how much it buffers, so large files are not read whole).
  element.preload = 'auto';
  element.muted = true;
  const loaded = waitFor(element, 'loadedmetadata', signal);
  element.src = url;
  await loaded;
  // Some recorders write no duration; seeking far ahead makes the browser find it.
  if (!Number.isFinite(element.duration)) {
    const changed = waitFor(element, 'durationchange', signal);
    element.currentTime = 1e7;
    await changed;
    element.currentTime = 0;
  }
  return element;
}

const settle = (element: HTMLMediaElement, event: string) =>
  new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      element.removeEventListener(event, done);
      element.removeEventListener('error', done);
      resolve();
    };
    const timer = setTimeout(done, 3000);
    element.addEventListener(event, done);
    element.addEventListener('error', done);
  });
/**
 * Frees the decoder. A media element keeps fetching after its metadata, so first
 * let it decode its first frame and go idle (each wait at most 3 s): detaching the
 * source mid-fetch would abort the request.
 */
async function release(
  element: HTMLMediaElement | HTMLImageElement,
): Promise<void> {
  if (element instanceof HTMLMediaElement) {
    if (element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
      await settle(element, 'loadeddata');
    if (element.networkState === HTMLMediaElement.NETWORK_LOADING)
      await settle(element, 'suspend');
    element.removeAttribute('src');
    element.load();
  } else element.removeAttribute('src');
}

/** Reads size and duration; throws when this browser cannot decode the file. */
export async function probeMedia(
  blob: Blob,
  kind: MediaKind,
  signal?: AbortSignal,
): Promise<MediaProbe> {
  const url = URL.createObjectURL(blob);
  try {
    const element = await loadElement(kind, url, signal);
    try {
      if (element instanceof HTMLImageElement) {
        // Vector images without an intrinsic size get a square default.
        const width = element.naturalWidth || 512,
          height = element.naturalHeight || 512;
        return { width, height };
      }
      const duration = element.duration;
      if (!Number.isFinite(duration) || duration <= 0)
        throw new Error('unreadable');
      if (element instanceof HTMLVideoElement) {
        if (!element.videoWidth || !element.videoHeight)
          throw new Error('unreadable');
        return {
          width: element.videoWidth,
          height: element.videoHeight,
          duration,
        };
      }
      return { duration };
    } finally {
      await release(element);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

const THUMB_SIZE = 320;

/** A small WebP poster (null for audio). Video uses a frame near 10%, at most 1 s. */
export async function makeThumbnail(
  blob: Blob,
  kind: MediaKind,
): Promise<Blob | null> {
  if (kind === 'audio') return null;
  const url = URL.createObjectURL(blob);
  try {
    const element = (await loadElement(kind, url)) as
      HTMLVideoElement | HTMLImageElement;
    try {
      let width: number, height: number;
      if (element instanceof HTMLVideoElement) {
        const seeked = waitFor(element, 'seeked');
        element.currentTime = Math.min(1, element.duration * 0.1);
        await seeked;
        width = element.videoWidth;
        height = element.videoHeight;
      } else {
        width = element.naturalWidth || 512;
        height = element.naturalHeight || 512;
      }
      const scale = Math.min(1, THUMB_SIZE / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      canvas
        .getContext('2d')!
        .drawImage(element, 0, 0, canvas.width, canvas.height);
      return await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', 0.8),
      );
    } finally {
      await release(element);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const STRIP_FRAMES = 12;
export const STRIP_TILE = { width: 96, height: 54 } as const;
/** Source time of sprite frame `index` in a filmstrip of a `duration`-second video. */
export const stripFrameTime = (index: number, duration: number) =>
  ((index + 0.5) * duration) / STRIP_FRAMES;

/**
 * TL-046: a WebP sprite of STRIP_FRAMES frames spread evenly over the video, each
 * letterboxed into a 96x54 tile, left to right.
 */
export async function makeFilmstrip(blob: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(blob);
  try {
    const video = (await loadElement('video', url)) as HTMLVideoElement;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = STRIP_TILE.width * STRIP_FRAMES;
      canvas.height = STRIP_TILE.height;
      const context = canvas.getContext('2d')!;
      const scale = Math.min(
        STRIP_TILE.width / video.videoWidth,
        STRIP_TILE.height / video.videoHeight,
      );
      const width = video.videoWidth * scale,
        height = video.videoHeight * scale;
      for (let index = 0; index < STRIP_FRAMES; index++) {
        const seeked = waitFor(video, 'seeked');
        video.currentTime = stripFrameTime(index, video.duration);
        await seeked;
        context.drawImage(
          video,
          index * STRIP_TILE.width + (STRIP_TILE.width - width) / 2,
          (STRIP_TILE.height - height) / 2,
          width,
          height,
        );
      }
      return await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', 0.8),
      );
    } finally {
      await release(video);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
