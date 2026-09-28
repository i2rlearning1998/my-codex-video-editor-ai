/// <reference lib="webworker" />
// W5-A export worker: decodes source video with WebCodecs (via Mediabunny), draws
// every output frame with the same drawComposition as the preview, encodes video and
// the pre-mixed audio, and streams the file into OPFS (EXP-001 to EXP-004).
import {
  AudioSample,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  MATROSKA,
  MP4,
  QTFF,
  WEBM,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_LOW,
  QUALITY_MEDIUM,
  StreamTarget,
  VideoSampleSink,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
  type VideoSample,
} from 'mediabunny';
import {
  compositionAt,
  type Asset,
  type Composition,
  type DeepReadonly,
} from '../core';
import {
  deriveRenderItems,
  type FrameProvider,
  type MediaFrameRequest,
  type RenderSource,
} from '../render/adapter';
import { drawComposition } from '../render/canvas';
import { measureWithContext } from '../render/text-style';
import type { TextMeasurer } from '../render/text-layout';
import { fitMatrix, frameTimes, type ExportSettings } from './settings';

export interface ExportJob {
  id: string;
  composition: DeepReadonly<Composition>;
  assets: readonly DeepReadonly<Asset>[];
  background: string;
  settings: ExportSettings;
  /** Source bytes of every video asset drawn in the range. */
  videos: Record<string, Blob>;
  /** Decoded images (the main thread can decode SVG; workers cannot). */
  images: Record<string, ImageBitmap>;
  /** The pre-mixed stereo audio of the range, or null when silent. */
  audio: { sampleRate: number; channels: Float32Array[] } | null;
}
export type WorkerRequest =
  | { type: 'start'; job: ExportJob }
  | { type: 'probe'; width: number; height: number; fps: number }
  | { type: 'cancel' };
export type WorkerMessage =
  | { type: 'probe'; mp4: boolean }
  | { type: 'progress'; done: number; total: number }
  | {
      type: 'done';
      container: 'mp4' | 'webm';
      videoCodec: string;
      audioCodec: string | null;
      /** OPFS path under aive-media, or the bytes when OPFS is unavailable. */
      key: string | null;
      bytes: ArrayBuffer | null;
    }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };

const NUDGE = 0.001;
const QUALITY = {
  low: QUALITY_LOW,
  medium: QUALITY_MEDIUM,
  high: QUALITY_HIGH,
};
let cancelled = false;
const post = (message: WorkerMessage, transfer: Transferable[] = []) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(
    message,
    transfer,
  );

/** MP4 needs both H.264 and AAC encoders; otherwise WebM (VP9 + Opus) is used. */
async function canUseMp4(width: number, height: number, fps: number) {
  return (
    (await canEncodeVideo('avc', { width, height, frameRate: fps })) &&
    (await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48_000 }))
  );
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'cancel') cancelled = true;
  else if (request.type === 'probe')
    void canUseMp4(request.width, request.height, request.fps).then(
      (mp4) => post({ type: 'probe', mp4 }),
      () => post({ type: 'probe', mp4: false }),
    );
  else
    void run(request.job).catch((error: unknown) =>
      post({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      }),
    );
};

/** The source time a request should show, nudged inside the wanted frame. */
const target = (request: MediaFrameRequest) =>
  Math.max(0, request.sourceTime + (request.reversed ? -NUDGE : NUDGE));

async function run(job: ExportJob): Promise<void> {
  const { settings } = job;
  const times = frameTimes(settings);
  const canvas = new OffscreenCanvas(settings.width, settings.height);
  const context = canvas.getContext('2d')!;
  const measure = new OffscreenCanvas(1, 1).getContext('2d')!;
  const measureText: TextMeasurer = (text, fontSize, style) =>
    measureWithContext(measure, text, fontSize, style);
  const sourceAt = (time: number, frames?: FrameProvider): RenderSource => ({
    // ANI-003: the same evaluation as the preview.
    composition: compositionAt(job.composition, time),
    // W5-C: animation presets, drawn exactly like the preview.
    animate: true,
    assets: job.assets,
    background: job.background,
    currentTime: time,
    measureText,
    ...(frames ? { frames } : {}),
  });

  // Plan: which video layers need which source times, frame by frame.
  const plan = times.map((time) =>
    deriveRenderItems(sourceAt(time)).items.flatMap((item) =>
      item.media?.kind === 'video' ? [item.media] : [],
    ),
  );
  const decoders = new Map<
    string,
    { input: Input; samples: AsyncGenerator<VideoSample | null, void, unknown> }
  >();
  for (const key of new Set(plan.flat().map((request) => request.key))) {
    const requests = plan.flat().filter((request) => request.key === key);
    const blob = job.videos[requests[0]!.assetId];
    if (!blob) continue;
    const input = new Input({
      source: new BlobSource(blob),
      formats: [MP4, QTFF, WEBM, MATROSKA],
    });
    const track = await input.getPrimaryVideoTrack();
    if (!track) continue;
    decoders.set(key, {
      input,
      samples: new VideoSampleSink(track).samplesAtTimestamps(
        requests.map(target),
      ),
    });
  }

  // Codecs: MP4 (H.264 + AAC) when the browser can encode it, else WebM (VP9 + Opus).
  const quality = QUALITY[settings.quality];
  const mp4 = await canUseMp4(settings.width, settings.height, settings.fps);
  const container = mp4 ? 'mp4' : 'webm';
  const videoCodec = mp4 ? 'avc' : 'vp9';
  const audioCodec = job.audio ? (mp4 ? 'aac' : 'opus') : null;

  const root =
    typeof navigator.storage?.getDirectory === 'function'
      ? await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle('aive-media', {
          create: true,
        })
      : null;
  const folder = root
    ? await root.getDirectoryHandle('exports', { create: true })
    : null;
  const name = `${job.id}.${container}`;
  const handle = folder
    ? await folder.getFileHandle(name, { create: true })
    : null;
  const writable = handle ? await handle.createWritable() : null;
  const buffer = writable ? null : new BufferTarget();
  const output = new Output({
    format: mp4 ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target: writable
      ? new StreamTarget(writable as unknown as WritableStream)
      : buffer!,
  });
  const video = new CanvasSource(canvas, { codec: videoCodec, quality });
  output.addVideoTrack(video, { frameRate: settings.fps });
  const audio = audioCodec
    ? new AudioSampleSource({ codec: audioCodec, quality })
    : null;
  if (audio) output.addAudioTrack(audio);
  await output.start();

  // Audio goes in one-second chunks, interleaved ahead of the video frames.
  let audioAt = 0;
  const pushAudioUntil = async (seconds: number) => {
    if (!audio || !job.audio) return;
    const { sampleRate, channels } = job.audio;
    const length = channels[0]!.length;
    while (audioAt < length && audioAt / sampleRate < seconds) {
      const frames = Math.min(sampleRate, length - audioAt);
      const data = new Float32Array(frames * channels.length);
      channels.forEach((channel, index) =>
        data.set(channel.subarray(audioAt, audioAt + frames), index * frames),
      );
      const sample = new AudioSample({
        data,
        format: 'f32-planar',
        numberOfChannels: channels.length,
        sampleRate,
        timestamp: audioAt / sampleRate,
      });
      await audio.add(sample);
      sample.close();
      audioAt += frames;
    }
  };

  const view = {
    width: settings.width,
    height: settings.height,
    pixelRatio: 1,
    matrix: fitMatrix(job.composition, settings.width, settings.height),
  };
  const open: VideoSample[] = [];
  try {
    for (const [index, time] of times.entries()) {
      if (cancelled) throw new DOMException('Export cancelled', 'AbortError');
      // Fetch this frame's decoded source frames, in the planned order.
      const ready = new Map<string, CanvasImageSource>();
      for (const request of plan[index]!) {
        const decoder = decoders.get(request.key);
        const next = decoder ? await decoder.samples.next() : null;
        const sample = next && !next.done ? next.value : null;
        if (sample) {
          open.push(sample);
          ready.set(request.key, sample.toCanvasImageSource());
        }
      }
      const frames: FrameProvider = {
        frame: (request) =>
          request.kind === 'image'
            ? (job.images[request.assetId] ?? null)
            : (ready.get(request.key) ?? null),
      };
      drawComposition(context, sourceAt(time, frames), view, null, {
        overlays: false,
        surround: '#000000',
      });
      const timestamp = index / settings.fps;
      await pushAudioUntil(timestamp + 1);
      await video.add(timestamp, 1 / settings.fps);
      for (const sample of open.splice(0)) sample.close();
      post({ type: 'progress', done: index + 1, total: times.length });
    }
    await pushAudioUntil(Infinity);
    await output.finalize();
  } catch (error) {
    for (const sample of open.splice(0)) sample.close();
    await output.cancel().catch(() => undefined);
    if (folder) await folder.removeEntry(name).catch(() => undefined);
    if ((error as { name?: string }).name === 'AbortError') {
      post({ type: 'cancelled' });
      return;
    }
    throw error;
  } finally {
    for (const decoder of decoders.values()) decoder.input.dispose();
  }
  const bytes = buffer?.buffer ?? null;
  post(
    {
      type: 'done',
      container,
      videoCodec,
      audioCodec,
      key: handle ? `exports/${name}` : null,
      bytes,
    },
    bytes ? [bytes] : [],
  );
}
