// ROUND-C2 (Part 1 spike, Part 4): the export card. A chat host shows it in
// a sandboxed frame; it renders the video on the person's own device with
// the editor's export engine (src/export, in this page: a sandboxed frame
// may not start a worker), plays it inline and saves it through the host
// (ui/download-file). It reaches only our server, with the export's ticket.
// Nothing here opens another tab or page.
import { App, PostMessageTransport } from '@modelcontextprotocol/ext-apps';
import { canEncodeAudio, canEncodeVideo } from 'mediabunny';
import { startExport, type ExportResult } from '../export/client';
import { remainingSeconds } from '../export/settings';
import { AudioDecoder } from '../media/audio';
import type { PreviewAsset } from '../media';
import { remoteMediaStore } from './remote-store';
import { MemoryMediaStore } from '../media/store';
import { nestedSandboxOpener } from './nested-sandbox';
import { cardText, type CardKey } from './strings';

interface ExportMeta {
  readonly ticket: string;
  readonly origin: string;
  readonly videoId: string;
}
interface Job {
  readonly exportId: string;
  readonly project: {
    composition: {
      duration: number;
      fps: number;
      width: number;
      height: number;
    };
    assets: unknown[];
    background: string;
    masterVolume?: number;
  };
  readonly settings: {
    width: number;
    height: number;
    fps: number;
    quality: 'low' | 'medium' | 'high';
    start: number;
    end: number;
    fileName: string;
  };
  readonly credits: readonly string[];
  readonly spike: boolean;
}
/** Spike measurements (RDC2-001); only filled for the proof tool. */
interface Measure {
  [key: string]: unknown;
  progress: { at: number; done: number; total: number }[];
}
const measure: Measure = { progress: [] };

const app = new App(
  { name: 'aive-export-card', version: '1.0.0' },
  {},
  { autoResize: true },
);
const $ = <T extends HTMLElement>(sel: string) =>
  document.querySelector(sel) as T | null;
const card = $('#card')!;
const t = (key: CardKey, vars?: Record<string, string | number>) =>
  cardText(app.getHostContext()?.locale, key, vars);
const status = (text: string) => {
  let el = $('#status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'status';
    el.className = 'muted';
    card.prepend(el);
  }
  el.textContent = text;
};
const human = (s: number) =>
  s >= 90
    ? t('minutes', { n: Math.ceil(s / 60) })
    : t('seconds', { n: Math.max(1, Math.round(s)) });

/** Base64 of a blob without building a huge string twice. */
async function base64(blob: Blob): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  return url.slice(url.indexOf(',') + 1);
}
const heap = () =>
  (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    ?.usedJSHeapSize ?? null;

/** Can a worker start here? (spike item 1) */
async function probeWorker(make: () => Worker): Promise<string> {
  try {
    const w = make();
    return await new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve('no answer in 3 s'), 3000);
      w.onmessage = () => (clearTimeout(timer), resolve('started'));
      w.onerror = (e) => (
        clearTimeout(timer),
        resolve(`error: ${e.message || 'refused'}`)
      );
    }).finally(() => w.terminate());
  } catch (e) {
    return `refused: ${(e as Error).name}: ${(e as Error).message}`;
  }
}
async function spikeProbes(origin: string) {
  measure.workerBlob = await probeWorker(
    () =>
      new Worker(
        URL.createObjectURL(
          new Blob(['postMessage(1)'], { type: 'text/javascript' }),
        ),
      ),
  );
  measure.workerOrigin = await probeWorker(
    () => new Worker(`${origin}/mcp/card/probe-worker.js`),
  );
  try {
    await navigator.storage.getDirectory();
    measure.opfs = 'available';
  } catch (e) {
    measure.opfs = `unavailable: ${(e as Error).name}`;
  }
  measure.indexedDb = await new Promise<string>((resolve) => {
    try {
      const r = indexedDB.open('aive-card-probe');
      r.onsuccess = () => (r.result.close(), resolve('available'));
      r.onerror = () => resolve(`unavailable: ${r.error?.name ?? 'error'}`);
    } catch (e) {
      resolve(`unavailable: ${(e as Error).name}`);
    }
  });
  measure.webcodecs = typeof VideoEncoder === 'function';
  const size = { width: 1080, height: 1920, frameRate: 30 };
  const audio = { numberOfChannels: 2, sampleRate: 48_000 };
  measure.encodeH264 = await canEncodeVideo('avc', size).catch(() => false);
  measure.encodeAac = await canEncodeAudio('aac', audio).catch(() => false);
  measure.encodeVp9 = await canEncodeVideo('vp9', size).catch(() => false);
  measure.encodeOpus = await canEncodeAudio('opus', audio).catch(() => false);
}

/** Shows the file; tries a blob URL, then a data URL (spike item 5). */
async function showVideo(file: Blob): Promise<HTMLVideoElement | null> {
  const video = document.createElement('video');
  video.controls = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.muted = false;
  card.append(video);
  const plays = (src: string) =>
    new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 5000);
      video.onloadeddata = () => (clearTimeout(timer), resolve(true));
      video.onerror = () => (clearTimeout(timer), resolve(false));
      video.src = src;
    });
  if (await plays(URL.createObjectURL(file))) {
    measure.player = 'blob';
    return video;
  }
  if (await plays(`data:${file.type};base64,${await base64(file)}`)) {
    measure.player = 'data';
    return video;
  }
  measure.player = 'none';
  video.remove();
  return null;
}

/** Six frames drawn from the finished file (spike item 8). */
async function sampleFrames(video: HTMLVideoElement, duration: number) {
  const canvas = document.createElement('canvas');
  const w = 360;
  canvas.width = w;
  canvas.height = Math.round(
    (w * video.videoHeight) / Math.max(1, video.videoWidth),
  );
  const ctx = canvas.getContext('2d')!;
  const frames: { time: number; png: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const time = Math.min(duration - 0.05, ((i + 0.5) * duration) / 6);
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 3000);
      video.onseeked = () => (clearTimeout(timer), resolve());
      video.currentTime = time;
    });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      const url = canvas.toDataURL('image/png');
      frames.push({ time, png: url.slice(url.indexOf(',') + 1) });
    } catch (e) {
      measure.framesError = (e as Error).message;
      break;
    }
  }
  video.currentTime = 0;
  return frames;
}

async function download(file: Blob, name: string, button: HTMLButtonElement) {
  if (!app.getHostCapabilities()?.downloadFile) {
    status(t('noDownload'));
    return;
  }
  button.disabled = true;
  button.textContent = t('downloading');
  try {
    const { isError } = await app.downloadFile({
      contents: [
        {
          type: 'resource',
          resource: {
            uri: `file:///${encodeURIComponent(name)}`,
            mimeType: file.type,
            blob: await base64(file),
          },
        },
      ],
    });
    if (isError) status(t('downloadFailed'));
  } catch {
    status(t('downloadFailed'));
  } finally {
    button.disabled = false;
    button.textContent = t('download');
  }
}

async function run(meta: ExportMeta) {
  status(t('loading'));
  measure.startedAt = performance.now();
  const res = await fetch(
    `${meta.origin}/mcp/card/job/${encodeURIComponent(meta.ticket)}`,
  ).catch(() => null);
  if (!res?.ok) {
    status(t('ended'));
    return;
  }
  const job = (await res.json()) as Job;
  if (job.spike) {
    Object.assign(window, { __CARD__: measure });
    await spikeProbes(meta.origin);
  }
  const assets = job.project.assets as unknown as PreviewAsset[];
  const store = Promise.resolve(
    remoteMediaStore(
      `${meta.origin}/mcp/card/media/${encodeURIComponent(meta.ticket)}`,
    ),
  );
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.innerHTML = '<i></i>';
  const cancel = document.createElement('button');
  cancel.textContent = t('cancel');
  const row = document.createElement('div');
  row.className = 'row';
  row.append(cancel);
  card.append(bar, row);
  const begun = performance.now();
  measure.heapBefore = heap();
  const codeStore = new MemoryMediaStore();
  const exportRun = startExport(
    {
      composition: job.project.composition as never,
      assets: job.project.assets as never,
      background: job.project.background,
      ...(job.project.masterVolume !== undefined
        ? { masterVolume: job.project.masterVolume }
        : {}),
      settings: job.settings,
    },
    {
      store,
      decoder: new AudioDecoder(store, () => assets),
      inPage: { fontBase: `${meta.origin}/mcp/card/`, codeStore },
      // ROUND-C3 (0.2): code graphics are baked first, frame by frame, in
      // the nested sandbox (no network, no access to this card's bridge).
      prepareCode: async (composition, progress, cancelled) => {
        const [{ FrameCache }, { CodeBaker }, { bakeForExport, codeLayersOf }] =
          await Promise.all([
            import('../code-layer/cache'),
            import('../code-layer/baker'),
            import('../code-layer/export-bake'),
          ]);
        if (!codeLayersOf(composition).length) return;
        const baker = new CodeBaker(
          new FrameCache(Promise.resolve(codeStore)),
          nestedSandboxOpener(meta.origin),
        );
        const began = performance.now();
        try {
          await bakeForExport(baker, composition, progress, cancelled);
        } finally {
          baker.dispose();
          measure.codeBakeMs = Math.round(performance.now() - began);
        }
      },
      onPhase: (phase) => {
        if (phase === 'preparing') status(t('preparing'));
        measure[`phase:${phase}`] = Math.round(performance.now() - begun);
      },
      onCodeProgress: ({ done, total }) =>
        status(t('code', { pct: Math.floor((100 * done) / total) })),
      onProgress: ({ done, total }) => {
        measure.progress.push({ at: performance.now(), done, total });
        (bar.firstElementChild as HTMLElement).style.width =
          `${(100 * done) / total}%`;
        status(
          t('rendering', {
            pct: Math.floor((100 * done) / total),
            left: human(
              remainingSeconds(done, total, performance.now() - begun) ?? 0,
            ),
          }),
        );
      },
    },
  );
  cancel.onclick = () => exportRun.cancel();
  let result: ExportResult | null;
  try {
    result = await exportRun.result;
  } catch (e) {
    measure.error = (e as Error).message;
    row.remove();
    status(t('failed', { why: (e as Error).message }));
    return;
  }
  row.remove();
  bar.remove();
  if (!result) {
    measure.cancelled = true;
    status(t('cancelled'));
    return;
  }
  measure.renderMs = Math.round(performance.now() - begun);
  measure.bytes = result.file.size;
  measure.container = result.container;
  measure.videoCodec = result.videoCodec;
  measure.audioCodec = result.audioCodec;
  measure.heapAfter = heap();
  status(t('done'));
  const video = await showVideo(result.file);
  const actions = document.createElement('div');
  actions.className = 'row';
  const save = document.createElement('button');
  save.className = 'primary';
  save.textContent = t('download');
  save.onclick = () => void download(result.file, result.fileName, save);
  actions.append(save);
  card.append(actions);
  const credits = document.createElement('div');
  credits.className = 'muted';
  credits.textContent = job.credits.length
    ? `${t('credits')}: ${job.credits.join(' · ')}`
    : t('noCredits');
  card.append(credits);
  measure.downloadCapability = !!app.getHostCapabilities()?.downloadFile;
  // The server counts the export once, whatever happens next.
  await app
    .callServerTool({
      name: 'export_done',
      arguments: { export_id: job.exportId },
    })
    .then((r) => (measure.exportDone = !r.isError))
    .catch(() => (measure.exportDone = false));
  if (video) {
    const frames = await sampleFrames(
      video,
      job.settings.end - job.settings.start,
    );
    measure.frames = frames.length;
    if (frames.length)
      await app
        .callServerTool({
          name: 'submit_frames',
          arguments: { video_id: meta.videoId, frames },
        })
        .then((r) => (measure.submitFrames = !r.isError))
        .catch((e: Error) => (measure.submitFrames = e.message));
    if (job.spike && app.getHostCapabilities()?.updateModelContext && frames[0])
      await app
        .updateModelContext({
          content: [
            { type: 'image', data: frames[0].png, mimeType: 'image/png' },
          ],
        })
        .then(() => (measure.updateModelContext = 'accepted'))
        .catch((e: Error) => (measure.updateModelContext = e.message));
  }
  if (job.spike)
    Object.assign(window, {
      __CARD_FILE__: result.file,
      // Item 4: how large a download the host receives.
      __CARD_DOWNLOAD__: async (megabytes: number) => {
        const bytes = new Uint8Array(megabytes * 1024 * 1024);
        const before = heap();
        const b64 = await base64(new Blob([bytes]));
        const started = performance.now();
        const r = await app
          .downloadFile({
            contents: [
              {
                type: 'resource',
                resource: {
                  uri: `file:///probe-${megabytes}mb.bin`,
                  mimeType: 'application/octet-stream',
                  blob: b64,
                },
              },
            ],
          })
          .catch((e: Error) => ({ isError: true, message: e.message }));
        return {
          ok: !r.isError,
          ms: Math.round(performance.now() - started),
          base64Chars: b64.length,
          heapDelta: before === null ? null : (heap() ?? 0) - before,
        };
      },
    });
  measure.engine = performance
    .getEntriesByType('resource')
    .filter((e) => e.name.startsWith(`${meta.origin}/mcp/card/`))
    .filter((e) => !e.name.includes('/media/') && !e.name.includes('/job/'))
    .map((e) => ({
      name: e.name.slice(meta.origin.length).replace(/-[\w]{8}\.js$/, '.js'),
      bytes: (e as PerformanceResourceTiming).decodedBodySize,
      ms: Math.round(e.duration),
    }));
  measure.finished = true;
}

let started = false;
app.ontoolresult = (result) => {
  const meta = (result._meta as Record<string, unknown> | undefined)?.[
    'aive/export'
  ] as ExportMeta | undefined;
  if (!meta || started) return;
  started = true;
  void run(meta).catch((e: Error) => {
    measure.error = e.message;
    status(t('failed', { why: e.message }));
  });
};
document.addEventListener('visibilitychange', () => {
  measure[`visibility@${Math.round(performance.now())}`] =
    document.visibilityState;
  if (document.visibilityState === 'hidden' && !measure.finished)
    status(t('hidden'));
});
void app.connect(new PostMessageTransport(window.parent, window.parent));
