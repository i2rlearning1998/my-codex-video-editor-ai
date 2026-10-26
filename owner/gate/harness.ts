// Phase 1 library (P1-07): the page the publish gate opens in headless
// Chromium. It runs the editor's own render checks on Creator Pack items
// and checks media files the way the editor will use them (decode, size,
// a poster or waveform, a small proxy). Loaded only by the gate's own Vite
// server (owner/catalog/gate.ts), never by the editor.
import { runtimeCheck, type RuntimeResult } from '../../src/ui/creator-checks';
import { freeCodeRuntime } from '../../src/code-layer/runtime';
import { canvasMeasureText } from '../../src/render/canvas';
import { encodeWav } from '../../src/audio/wav';
import type { CreatorItem } from '../../src/creator-pack';

export interface MediaProbe {
  readonly ok: boolean;
  readonly reason?: string;
  readonly kind?: 'sound' | 'video' | 'image';
  readonly width?: number;
  readonly height?: number;
  readonly duration?: number;
  /** base64 of a PNG (pictures) or an SVG waveform (sound). */
  readonly poster?: { b64: string; ext: string; mime: string };
  readonly proxy?: { b64: string; ext: string; mime: string };
  readonly blur?: string;
}

const toB64 = (bytes: Uint8Array) => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};
const fromB64 = (b64: string) =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const canvasBytes = async (canvas: HTMLCanvasElement) =>
  new Uint8Array(
    await (
      await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('No picture'))),
          'image/png',
        ),
      )
    ).arrayBuffer(),
  );
function draw(source: CanvasImageSource, w: number, h: number, width: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.max(1, Math.round((width * h) / w));
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function probeImage(blob: Blob): Promise<MediaProbe> {
  const bitmap = await createImageBitmap(blob);
  const poster = await canvasBytes(
    draw(bitmap, bitmap.width, bitmap.height, 320),
  );
  const blur = draw(bitmap, bitmap.width, bitmap.height, 8).toDataURL(
    'image/png',
  );
  return {
    ok: true,
    kind: 'image',
    width: bitmap.width,
    height: bitmap.height,
    poster: { b64: toB64(poster), ext: 'png', mime: 'image/png' },
    blur,
  };
}

async function probeSound(blob: Blob): Promise<MediaProbe> {
  const context = new OfflineAudioContext(1, 1, 48_000);
  const buffer = await context.decodeAudioData(await blob.arrayBuffer());
  const rate = 12_000;
  const length = Math.max(1, Math.round(buffer.duration * rate));
  const render = new OfflineAudioContext(1, length, rate);
  const node = render.createBufferSource();
  node.buffer = buffer;
  node.connect(render.destination);
  node.start();
  const mono = (await render.startRendering()).getChannelData(0);
  const columns = 80;
  const per = Math.max(1, Math.floor(mono.length / columns));
  const bars: string[] = [];
  for (let c = 0; c < columns; c++) {
    let peak = 0;
    for (let i = c * per; i < Math.min(mono.length, (c + 1) * per); i++)
      peak = Math.max(peak, Math.abs(mono[i]!));
    const h = Math.max(1, peak * 80);
    bars.push(
      `<rect x="${c * 2}" y="${(45 - h / 2).toFixed(1)}" width="1.2" height="${h.toFixed(1)}"/>`,
    );
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" width="160" height="90"><rect width="160" height="90" fill="#1d2030"/><g fill="#a591ff">${bars.join('')}</g></svg>`;
  return {
    ok: true,
    kind: 'sound',
    duration: buffer.duration,
    poster: { b64: btoa(svg), ext: 'svg', mime: 'image/svg+xml' },
    proxy: { b64: toB64(encodeWav(mono, rate)), ext: 'wav', mime: 'audio/wav' },
  };
}

async function probeVideo(blob: Blob): Promise<MediaProbe> {
  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () =>
        reject(new Error('This video cannot be played in Chrome.'));
    });
    video.currentTime = Math.min(0.5, video.duration / 10);
    await new Promise<void>((resolve) => (video.onseeked = () => resolve()));
    const poster = await canvasBytes(
      draw(video, video.videoWidth, video.videoHeight, 320),
    );
    const blur = draw(video, video.videoWidth, video.videoHeight, 8).toDataURL(
      'image/png',
    );
    const {
      Conversion,
      Input,
      Output,
      BlobSource,
      BufferTarget,
      WebMOutputFormat,
      ALL_FORMATS,
    } = await import('mediabunny');
    const output = new Output({
      format: new WebMOutputFormat(),
      target: new BufferTarget(),
    });
    const conversion = await Conversion.init({
      input: new Input({ source: new BlobSource(blob), formats: ALL_FORMATS }),
      output,
      video: { width: 320, bitrate: 100_000, codec: 'vp9' },
      audio: { discard: true },
    });
    await conversion.execute();
    const proxy = new Uint8Array(
      (output.target as InstanceType<typeof BufferTarget>).buffer!,
    );
    return {
      ok: true,
      kind: 'video',
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration,
      poster: { b64: toB64(poster), ext: 'png', mime: 'image/png' },
      // A proxy that is not smaller than the file itself is left out.
      ...(proxy.length < blob.size
        ? { proxy: { b64: toB64(proxy), ext: 'webm', mime: 'video/webm' } }
        : {}),
      blur,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const api = {
  async checkItems(items: CreatorItem[]): Promise<RuntimeResult[]> {
    const out: RuntimeResult[] = [];
    for (const item of items)
      out.push(
        await runtimeCheck(item, {
          measureText: canvasMeasureText,
          runtime: freeCodeRuntime,
        }),
      );
    return out;
  },
  async probeMedia(b64: string, mime: string): Promise<MediaProbe> {
    const blob = new Blob([fromB64(b64)], { type: mime });
    try {
      if (mime.startsWith('image/')) return await probeImage(blob);
      if (mime.startsWith('audio/')) return await probeSound(blob);
      if (mime.startsWith('video/')) return await probeVideo(blob);
      return {
        ok: false,
        reason: 'This file type is not a picture, a sound or a video.',
      };
    } catch (error) {
      return {
        ok: false,
        reason: `It could not be opened in Chrome (${error instanceof Error ? error.message : String(error)}).`,
      };
    }
  },
};
(window as unknown as { __gate: typeof api }).__gate = api;
document.body.dataset.ready = 'true';
