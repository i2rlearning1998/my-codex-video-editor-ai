// W5-A main-thread side of export: pre-flight, media and audio preparation, the
// worker's lifetime, progress, cancel and the download. No engine access: it reads
// the composition snapshot it is given.
import type { Asset, Composition, DeepReadonly } from '../core';
import {
  assetFingerprint,
  listAudibleClips,
  mediaKey,
  soundSource,
  type AudioDecoder,
  type MediaStore,
  type PreviewAsset,
} from '../media';
import { mixdown } from './mixdown';
import {
  usedAssetIds,
  validateSettings,
  type ExportContainer,
  type ExportSettings,
} from './settings';
import type { ExportJob, WorkerMessage } from './worker';

export interface ExportInput {
  composition: DeepReadonly<Composition>;
  assets: readonly DeepReadonly<Asset>[];
  background: string;
  settings: ExportSettings;
}
export interface ExportProgress {
  done: number;
  total: number;
}
export interface ExportResult {
  container: ExportContainer;
  videoCodec: string;
  audioCodec: string | null;
  fileName: string;
  file: Blob;
}

const MIME: Record<ExportContainer, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
};

/** Reads an asset's bytes, restoring its MIME type (OPFS files lose it). */
async function bytesOf(
  store: MediaStore,
  asset: PreviewAsset,
): Promise<Blob | null> {
  const fingerprint = assetFingerprint(asset);
  const blob = fingerprint ? await store.read(mediaKey(fingerprint)) : null;
  return blob && !blob.type && typeof asset.metadata.mimeType === 'string'
    ? blob.slice(0, blob.size, asset.metadata.mimeType)
    : blob;
}

/**
 * EXP-008: names of the media used in the range whose bytes this browser lacks.
 * Detached audio needs its source video's bytes.
 */
export async function missingMedia(
  input: Pick<ExportInput, 'composition' | 'assets' | 'settings'>,
  store: MediaStore | null,
): Promise<string[]> {
  const assets = input.assets as unknown as readonly PreviewAsset[];
  const missing: string[] = [];
  for (const id of usedAssetIds(
    input.composition,
    input.settings.start,
    input.settings.end,
  )) {
    const asset = input.assets.find((item) => item.id === id);
    if (!asset || !['video', 'audio', 'image'].includes(asset.type)) continue;
    const source = soundSource(asset as unknown as PreviewAsset, assets);
    const present =
      store && source ? (await bytesOf(store, source)) !== null : false;
    if (!present) missing.push(asset.name);
  }
  return missing;
}

/** Images are decoded here: workers cannot decode SVG. */
async function decodeImage(blob: Blob): Promise<ImageBitmap | null> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return await createImageBitmap(image);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface ExportRun {
  readonly result: Promise<ExportResult | null>;
  cancel(): void;
}

/** Starts an export. The result is null when cancelled. */
export function startExport(
  input: ExportInput,
  deps: {
    store: Promise<MediaStore | null>;
    decoder: AudioDecoder;
    onProgress(progress: ExportProgress): void;
    onPhase?(phase: 'preparing' | 'encoding'): void;
  },
): ExportRun {
  let worker: Worker | null = null;
  let cancelled = false;
  let settle: ((result: ExportResult | null) => void) | null = null;
  const result = (async (): Promise<ExportResult | null> => {
    const settings = validateSettings(
      input.settings,
      input.composition.duration,
    );
    const store = await deps.store;
    const missing = await missingMedia(input, store);
    if (missing.length) throw new Error(`Missing media: ${missing.join(', ')}`);
    deps.onPhase?.('preparing');
    // Only one finished export is kept in storage at a time.
    if (store)
      for (const key of await store.keys())
        if (key.startsWith('exports/')) await store.remove(key);
    const assets = input.assets as unknown as readonly PreviewAsset[];
    const used = usedAssetIds(input.composition, settings.start, settings.end);
    const videos: Record<string, Blob> = {};
    const images: Record<string, ImageBitmap> = {};
    for (const id of used) {
      const asset = assets.find((item) => item.id === id);
      if (!asset || !store) continue;
      const blob = await bytesOf(store, asset);
      if (!blob) continue;
      if (asset.type === 'video') videos[id] = blob;
      if (asset.type === 'image') {
        const bitmap = await decodeImage(blob);
        if (bitmap) images[id] = bitmap;
      }
    }
    const audio = await mixdown(
      listAudibleClips(input.composition, assets),
      deps.decoder,
      settings.start,
      settings.end,
    );
    if (cancelled) return null;
    deps.onPhase?.('encoding');
    const job: ExportJob = {
      id: crypto.randomUUID(),
      composition: input.composition,
      assets: input.assets,
      background: input.background,
      settings,
      videos,
      images,
      // Copies: the rendered buffer's channel views must not be detached.
      audio: audio && {
        sampleRate: audio.sampleRate,
        channels: audio.channels.map((channel) => channel.slice()),
      },
    };
    worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    });
    const finished = new Promise<ExportResult | null>((resolve, reject) => {
      settle = resolve;
      worker!.onerror = (event) =>
        reject(new Error(event.message || 'Export worker failed'));
      worker!.onmessage = async (event: MessageEvent<WorkerMessage>) => {
        const message = event.data;
        if (message.type === 'progress') deps.onProgress(message);
        else if (message.type === 'cancelled') resolve(null);
        else if (message.type === 'error') reject(new Error(message.message));
        else if (message.type === 'done') {
          const file = message.bytes
            ? new Blob([message.bytes], { type: MIME[message.container] })
            : await store?.read(message.key!);
          if (!file) {
            reject(new Error('The exported file could not be read back'));
            return;
          }
          resolve({
            container: message.container,
            videoCodec: message.videoCodec,
            audioCodec: message.audioCodec,
            fileName: `${settings.fileName}.${message.container}`,
            file: file.type
              ? file
              : file.slice(0, file.size, MIME[message.container]),
          });
        }
      };
    });
    worker.postMessage({ type: 'start', job }, [
      ...Object.values(images),
      ...(job.audio?.channels.map((channel) => channel.buffer) ?? []),
    ]);
    try {
      return await finished;
    } finally {
      worker.terminate();
      worker = null;
    }
  })();
  return {
    result,
    cancel() {
      cancelled = true;
      worker?.postMessage({ type: 'cancel' });
      // A worker stuck in a long decode still ends; the file is removed below.
      setTimeout(() => {
        if (!worker) return;
        worker.terminate();
        worker = null;
        settle?.(null);
      }, 3000);
    },
  };
}

/** Asks a worker whether MP4 (H.264 + AAC) can be encoded at this size. */
export async function probeMp4(
  width: number,
  height: number,
  fps: number,
): Promise<boolean> {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  });
  try {
    return await new Promise<boolean>((resolve) => {
      worker.onmessage = (event: MessageEvent<WorkerMessage>) =>
        resolve(event.data.type === 'probe' && event.data.mp4);
      worker.onerror = () => resolve(false);
      worker.postMessage({ type: 'probe', width, height, fps });
    });
  } finally {
    worker.terminate();
  }
}

/** Saves a blob through the browser's download. */
export function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
