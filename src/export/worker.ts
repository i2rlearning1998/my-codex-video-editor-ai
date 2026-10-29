/// <reference lib="webworker" />
import { setTextBoxMeasurer } from '../render/text-box';
import { mediaSeekTime } from '../media-probe/timing';
import { rasterizeOrientedSample } from '../media-probe/rotation';
// W5-A export worker: decodes source video with WebCodecs (via Mediabunny), draws
// every output frame with the same drawComposition as the preview, encodes video and
// the pre-mixed audio, and streams the file into OPFS (EXP-001 to EXP-004).
import { loadUsedFonts } from '../render/fonts';
import type { SceneLayer } from '../render/adapter';
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
  activeCut,
  compositionAt,
  type SceneCut,
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
import { cameraBackgroundRequest } from '../render/camera-overlay';
import { cameraStateAt } from '../camera/shots';
import { drawComposition } from '../render/canvas';
import { drawSceneTransition } from '../render/scene-transitions';
import { measureWithContext } from '../render/text-style';
import type { TextMeasurer } from '../render/text-layout';
import { fitMatrix, frameTimes, type ExportSettings } from './settings';
import { openMediaStore } from '../media/store';
import { gifFrameAt, type GifFrames } from '../media/gif';
import { frameKey, pngCodec } from '../code-layer/cache';
import { cacheKeyOf } from '../code-layer/meta';

export interface ExportJob {
  id: string;
  composition: DeepReadonly<Composition>;
  assets: readonly DeepReadonly<Asset>[];
  background: string;
  /** J1: joined scenes keep their own backgrounds (start times in seconds). */
  backgrounds?: readonly { start: number; color: string }[];
  settings: ExportSettings;
  /** Source bytes of every video asset drawn in the range. */
  videos: Record<string, Blob>;
  /** Decoded images (the main thread can decode SVG; workers cannot). */
  images: Record<string, ImageBitmap>;
  /** VID-008: the frames of animated GIFs, shown by the clip's time. */
  gifs?: Record<string, GifFrames>;
  /** The pre-mixed stereo audio of the range, or null when silent. */
  audio: { sampleRate: number; channels: Float32Array[] } | null;
  /** V7: transitions across the cuts of joined scenes (composition time). */
  sceneCuts?: readonly SceneCut[];
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
  mediaSeekTime(request.sourceTime, {
    reverse: request.reversed,
    nudge: NUDGE,
  });

async function run(job: ExportJob): Promise<void> {
  const { settings } = job;
  const times = frameTimes(settings);
  const canvas = new OffscreenCanvas(settings.width, settings.height);
  const context = canvas.getContext('2d')!;
  const measure = new OffscreenCanvas(1, 1).getContext('2d')!;
  // J5: the bundled fonts the text uses, loaded before the first frame.
  const fonts = (self as unknown as { fonts?: FontFaceSet }).fonts;
  if (fonts && typeof FontFace !== 'undefined')
    await loadUsedFonts(
      fonts,
      new URL(import.meta.env.BASE_URL, self.location.origin).href,
      [job.composition as unknown as { layers: readonly SceneLayer[] }],
    );
  const measureText: TextMeasurer = (text, fontSize, style) =>
    measureWithContext(measure, text, fontSize, style);
  // FINAL3 T1: text boxes are sized with the worker's measurer, like the
  // preview's (same fonts, same metrics).
  setTextBoxMeasurer(measureText);
  const sourceAt = (time: number, frames?: FrameProvider): RenderSource => ({
    // ANI-003: the same evaluation as the preview.
    composition: compositionAt(job.composition, time),
    // W5-C: animation presets, drawn exactly like the preview.
    animate: true,
    assets: job.assets,
    background:
      [...(job.backgrounds ?? [])].reverse().find((item) => item.start <= time)
        ?.color ?? job.background,
    currentTime: time,
    measureText,
    ...(frames ? { frames } : {}),
  });

  // V7 (spec 10.5): inside a scene cut's window a frame draws both scenes,
  // the outgoing one up to its last frame and the incoming from its first.
  const frame = 1 / job.composition.fps;
  const drawsAt = (time: number): number[] => {
    const active = activeCut(job.sceneCuts ?? [], time);
    if (!active) return [time];
    return [
      Math.min(time, active.cut.time - frame),
      Math.max(time, active.cut.time),
    ];
  };
  // Plan: which video layers need which source times, frame by frame (and
  // draw by draw).
  const plan = times.map((time) =>
    drawsAt(time).map((at) => {
      const source = sourceAt(at);
      // FINAL3 C3: a camera background video included in the render.
      const backdrop = cameraBackgroundRequest(
        cameraStateAt(source.composition, at),
        source.assets,
        at,
        true,
      );
      return [
        ...deriveRenderItems(source).items.flatMap((item) =>
          item.media?.kind === 'video' || item.media?.kind === 'code'
            ? [item.media]
            : [],
        ),
        ...(backdrop?.kind === 'video' ? [backdrop] : []),
      ];
    }),
  );
  const decoders = new Map<
    string,
    { input: Input; samples: AsyncGenerator<VideoSample | null, void, unknown> }
  >();
  const flat = plan.flat(2);
  // X1: code animations read their baked Full-quality frames from the same
  // frame cache the preview draws (the main thread baked them first).
  const codeStore = flat.some((request) => request.kind === 'code')
    ? await openMediaStore()
    : null;
  const codeFrame = async (request: MediaFrameRequest) => {
    const code = request.code;
    if (!code || !codeStore) return null;
    const blob = await codeStore.read(
      frameKey(
        cacheKeyOf(code.bakeKey, code.width, code.height, code.fps, 'full'),
        code.frame,
      ),
    );
    if (!blob)
      throw new Error(
        'A code animation frame is missing from the cache; export again.',
      );
    return pngCodec.decode(blob);
  };
  for (const key of new Set(
    flat.filter((request) => request.kind === 'video').map((r) => r.key),
  )) {
    const requests = flat.filter((request) => request.key === key);
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
  // H3: More options can ask for WebM; MP4 still needs both encoders.
  const mp4 =
    settings.container !== 'webm' &&
    (await canUseMp4(settings.width, settings.height, settings.fps));
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
  const codeImages: ImageBitmap[] = [];
  try {
    for (const [index, time] of times.entries()) {
      if (cancelled) throw new DOMException('Export cancelled', 'AbortError');
      // Fetch this frame's decoded source frames, in the planned order.
      const providers: FrameProvider[] = [];
      for (const requests of plan[index]!) {
        const ready = new Map<string, CanvasImageSource>();
        for (const request of requests) {
          if (request.kind === 'code') {
            const image = await codeFrame(request);
            if (image) {
              codeImages.push(image);
              ready.set(request.key, image);
            }
            continue;
          }
          const decoder = decoders.get(request.key);
          const next = decoder ? await decoder.samples.next() : null;
          const sample = next && !next.done ? next.value : null;
          if (sample) {
            open.push(sample);
            ready.set(request.key, rasterizeOrientedSample(sample));
          }
        }
        const frames: FrameProvider = {
          frame: (request) =>
            request.kind === 'image'
              ? job.gifs?.[request.assetId]
                ? gifFrameAt(job.gifs[request.assetId]!, request.sourceTime)
                : (job.images[request.assetId] ?? null)
              : (ready.get(request.key) ?? null),
        };
        providers.push(frames);
      }
      const draws = drawsAt(time);
      const active = activeCut(job.sceneCuts ?? [], time);
      const paint = (
        target: Parameters<typeof drawComposition>[0],
        at: number,
        frames: FrameProvider,
      ) =>
        drawComposition(target, sourceAt(at, frames), view, null, {
          overlays: false,
          surround: '#000000',
        });
      if (
        !active ||
        draws.length < 2 ||
        !drawSceneTransition(context, active.cut, active.p, (target, side) =>
          side === 'from'
            ? paint(target, draws[0]!, providers[0]!)
            : paint(target, draws[1]!, providers[1]!),
        )
      )
        paint(context, draws.at(-1)!, providers.at(-1)!);
      const timestamp = index / settings.fps;
      await pushAudioUntil(timestamp + 1);
      await video.add(timestamp, 1 / settings.fps);
      for (const sample of open.splice(0)) sample.close();
      for (const image of codeImages.splice(0)) image.close();
      post({ type: 'progress', done: index + 1, total: times.length });
    }
    await pushAudioUntil(Infinity);
    await output.finalize();
  } catch (error) {
    for (const sample of open.splice(0)) sample.close();
    for (const image of codeImages.splice(0)) image.close();
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
