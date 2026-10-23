// FINAL2 U11: the offline Whisper runner. The model files are downloaded once
// into this browser (IndexedDB, src/speech/model-cache.ts: progress, abort,
// size or SHA-256 check) and served to @huggingface/transformers through its
// custom cache, so inference never goes back to the network for them. The
// runner library loads only on the first transcription (lazy import).
import {
  createModelLoader,
  createIndexedModelStore,
  type ModelStore,
} from './model-cache';
import {
  DEFAULT_MODEL_HOST as DEFAULT_HOST,
  LOCAL_MODELS,
  modelHost,
  whisperFiles,
} from './models';
import { browserCodec, resampleMono } from './pcm';
import {
  createInProcessEngine,
  type TransformersModule,
  type WhisperEngine,
} from './whisper-engine';
import type { FakeWhisperMode } from './whisper-fake-transformers';
import { createWorkerEngine, workerSupported } from './whisper-worker-client';
import {
  SpeechError,
  type AudioCodec,
  type SttRequest,
  type Transcription,
  type WordTiming,
} from './types';

/** FIX1 F4: why offline captions failed, in plain classes. */
export type WhisperFailure =
  | 'no-speech'
  | 'no-audio'
  | 'blocked'
  | 'memory'
  | 'unsupported'
  | 'load-timeout'
  | 'not-downloaded'
  | 'cancelled'
  /** FIX3 2.3: the worker sent nothing for too long. */
  | 'stalled'
  | 'failed';
export class WhisperError extends Error {
  constructor(
    readonly kind: WhisperFailure,
    /** The step that failed: check, load, decode or listen. */
    readonly step: 'check' | 'load' | 'decode' | 'listen',
    readonly cause?: unknown,
  ) {
    super(
      `Offline captions failed (${kind}) while ${step === 'listen' ? 'listening' : step === 'check' ? 'checking the model' : step === 'load' ? 'loading the model' : 'reading the clip'}${
        cause instanceof Error ? `: ${cause.message}` : ''
      }`,
    );
    this.name = 'WhisperError';
  }
}
/** Sorts any failure into a WhisperError (keeps one that already is). */
export function classifyWhisperError(
  error: unknown,
  step: WhisperError['step'],
  signal?: AbortSignal,
): WhisperError {
  if (error instanceof WhisperError) return error;
  if (
    signal?.aborted ||
    (error instanceof DOMException && error.name === 'AbortError')
  )
    return new WhisperError('cancelled', step, error);
  const text =
    error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (error instanceof SpeechError && error.code === 'MODEL_UNAVAILABLE')
    return new WhisperError('not-downloaded', step, error);
  if (
    /out of memory|memory access|allocation|RangeError|Aborted\(OOM/i.test(text)
  )
    return new WhisperError('memory', step, error);
  if (/failed to fetch|networkerror|load failed|cors|blocked|ERR_/i.test(text))
    return new WhisperError('blocked', step, error);
  if (step === 'decode' || /EncodingError|decode/i.test(text))
    return new WhisperError('no-audio', step, error);
  return new WhisperError('failed', step, error);
}
/** What this browser lacks for offline captions, or null. */
export function whisperUnsupported(needsWebAudio = true): string | null {
  if (typeof WebAssembly === 'undefined') return 'WebAssembly';
  if (
    needsWebAudio &&
    typeof OfflineAudioContext === 'undefined' &&
    typeof AudioContext === 'undefined'
  )
    return 'Web Audio';
  return null;
}
/** The audio is cut into these windows so progress can be shown. */
export const WHISPER_WINDOW_SECONDS = 30;

export interface WhisperRunner {
  /** Every file is stored and passes its check. */
  isReady(): Promise<boolean>;
  download(
    onProgress: (fraction: number) => void,
    signal: AbortSignal,
  ): Promise<void>;
  remove(): Promise<void>;
  transcribe(request: SttRequest): Promise<Transcription>;
  /** FIX1 F4: how long the last model start took (ms), or null. */
  lastLoadMs?: () => number | null;
}
/** The language name Whisper's generate() expects. */
export function whisperLanguage(code: string): string {
  return code.split('-')[0] === 'hi' ? 'hindi' : 'english';
}
/** Rejects after `ms` or when `signal` aborts. */
function withTimeout<T>(work: Promise<T>, ms: number, signal?: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new WhisperError('load-timeout', 'load')),
      ms,
    );
    const abort = () => reject(new WhisperError('cancelled', 'load'));
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    });
  });
}

export function createWhisperRunner(
  options: {
    store?: ModelStore;
    fetcher?: Parameters<typeof createModelLoader>[1];
    loadTransformers?: () => Promise<TransformersModule>;
    codec?: AudioCodec;
    /** FIX1 F4: how long the model may take to start (ms). */
    loadTimeoutMs?: number;
    /** FIX1 F4: test seam for a browser without WebAssembly. */
    unsupported?: () => string | null;
    /** FIX3: run the worker with this fake model (dev/test only). */
    workerFake?: FakeWhisperMode;
    /** FIX3: called with each window's language (tests). */
    onLanguage?: (language: string) => void;
  } = {},
): WhisperRunner {
  const config = LOCAL_MODELS.find((m) => m.id === 'local-whisper')!;
  // FIX4 A6: the files come from the saved model host at each use.
  const getFiles = () => whisperFiles();
  const store = options.store ?? createIndexedModelStore();
  const loader = createModelLoader(store, options.fetcher);
  // FIX3 2.2: in a browser the engine is a dedicated worker; without one
  // (Node unit tests, or a test-supplied module) it runs in-process.
  const makeEngine = (): WhisperEngine & { abort?(): void } =>
    !options.loadTransformers && workerSupported()
      ? createWorkerEngine(
          options.workerFake ? { fake: options.workerFake } : {},
        )
      : createInProcessEngine(
          options.loadTransformers ??
            (() =>
              import('@huggingface/transformers') as unknown as Promise<TransformersModule>),
        );
  const codec = options.codec ?? browserCodec;
  let engine: (WhisperEngine & { abort?(): void }) | null = null;
  let loaded = false;
  let lastLoadMs: number | null = null;

  const total = () => {
    const files = getFiles();
    return files.every((f) => f.sizeBytes !== null)
      ? files.reduce((sum, f) => sum + (f.sizeBytes ?? 0), 0)
      : (config.approxBytes ?? 1);
  };

  return {
    async isReady() {
      const files = getFiles();
      if (!files.length) return false;
      for (const file of files) if (!(await loader.has(file))) return false;
      return true;
    },
    async download(onProgress, signal) {
      const files = getFiles();
      const whole = total();
      let done = 0;
      for (const file of files) {
        let current = 0;
        const blob = await loader.load(file, {
          signal,
          onProgress: (p) => {
            current = p.completed;
            onProgress(Math.min(0.99, (done + current) / whole));
          },
        });
        done += blob.size;
        onProgress(Math.min(0.99, done / whole));
      }
      onProgress(1);
    },
    async remove() {
      engine?.dispose();
      engine = null;
      loaded = false;
      for (const file of getFiles())
        await store.delete(
          `${file.id}/${file.sha256 ? file.sha256.toLowerCase() : 'size-only'}`,
        );
    },
    async transcribe(request) {
      const signal = request.signal;
      const missing = (
        options.unsupported ?? (() => whisperUnsupported(!options.codec))
      )();
      if (missing)
        throw new WhisperError(
          'unsupported',
          'check',
          new Error(`This browser has no ${missing}`),
        );
      const files = getFiles();
      if (!files.length || !config.model)
        throw new WhisperError(
          'not-downloaded',
          'check',
          new SpeechError('MODEL_UNAVAILABLE'),
        );
      if (signal?.aborted) throw new WhisperError('cancelled', 'check');
      for (const file of files)
        if (!(await loader.has(file)))
          throw new WhisperError(
            'not-downloaded',
            'check',
            new Error(`Missing ${file.id}`),
          );
      const started = performance.now();
      if (!engine) engine = makeEngine();
      const active = engine;
      // FIX3 2.2: Cancel stops the worker at once, mid-run included.
      const abort = () => {
        active.abort?.();
        if (engine === active) engine = null;
        loaded = false;
      };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        if (!loaded) {
          request.onProgress?.({ phase: 'load', completed: 0, total: null });
          try {
            const blobs = [];
            for (const file of files)
              blobs.push({
                url: file.url,
                blob: await loader.load(file, { offline: true }),
              });
            await withTimeout(
              active.load(
                blobs,
                config.model!,
                (completed, total) =>
                  request.onProgress?.({ phase: 'load', completed, total }),
                {
                  onStage: (stage) =>
                    request.onProgress?.({
                      phase: 'load',
                      stage,
                      completed: 0,
                      total: null,
                    }),
                  ...(modelHost() !== DEFAULT_HOST
                    ? { host: `${modelHost()}/` }
                    : {}),
                },
              ),
              options.loadTimeoutMs ?? 180_000,
              signal,
            );
          } catch (error) {
            abort();
            throw classifyWhisperError(error, 'load', signal);
          }
          loaded = true;
          lastLoadMs = performance.now() - started;
        }
        return await listen(active, request);
      } finally {
        signal?.removeEventListener('abort', abort);
      }
    },
    lastLoadMs: () => lastLoadMs,
  };

  async function listen(
    active: WhisperEngine,
    request: SttRequest,
  ): Promise<Transcription> {
    const signal = request.signal;
    let audio: Float32Array;
    try {
      request.onProgress?.({ phase: 'decode', completed: 0, total: null });
      const blob =
        request.blob ??
        (await (await fetch(request.url!, { credentials: 'omit' })).blob());
      const decoded = await codec.decode(blob);
      // FIX4 A9: the long resample loop runs in the worker.
      audio = active.resample
        ? await active.resample(decoded)
        : resampleMono(decoded, 16000);
    } catch (error) {
      throw classifyWhisperError(error, 'decode', signal);
    }
    if (!audio.length) throw new WhisperError('no-audio', 'decode');
    // Whisper expects the bare language name; Hindi and English are the
    // two this editor offers (FIX1 F4: checked by a unit test).
    const language = (request.lang ?? 'en').split('-')[0]!;
    const duration = audio.length / 16000;
    const step = WHISPER_WINDOW_SECONDS * 16000;
    const windows = Math.max(1, Math.ceil(audio.length / step));
    const chunks: WordTiming[] = [];
    const texts: string[] = [];
    request.onProgress?.({
      phase: 'transcription',
      completed: 0,
      total: windows,
    });
    try {
      for (let i = 0; i < windows; i++) {
        if (signal?.aborted) throw new WhisperError('cancelled', 'listen');
        const part = audio.subarray(
          i * step,
          Math.min(audio.length, (i + 1) * step),
        );
        const offset = i * WHISPER_WINDOW_SECONDS;
        const run = (timestamps: 'word' | true) => {
          options.onLanguage?.(whisperLanguage(language));
          return active.run(part, {
            language: whisperLanguage(language),
            task: 'transcribe',
            return_timestamps: timestamps,
          });
        };
        // Word timings need cross-attention outputs; fall back to segments
        // (never after a cancel or a stall: the worker is gone then).
        const out = await run('word').catch((error) => {
          if (error instanceof WhisperError) throw error;
          return run(true);
        });
        texts.push(out.text.trim());
        const end = offset + part.length / 16000;
        for (const c of out.chunks ?? [])
          chunks.push({
            text: c.text.trim(),
            start: offset + (c.timestamp[0] ?? 0),
            end: Math.min(
              end,
              offset + (c.timestamp[1] ?? part.length / 16000),
            ),
          });
        request.onProgress?.({
          phase: 'transcription',
          completed: i + 1,
          total: windows,
        });
      }
    } catch (error) {
      throw classifyWhisperError(error, 'listen', signal);
    }
    const text = texts.filter(Boolean).join(' ').trim();
    const timed = chunks.filter((c) => c.text);
    if (!text || !/[\p{L}\p{N}]/u.test(text))
      throw new WhisperError('no-speech', 'listen');
    const words = timed.filter((c) => !/\s/.test(c.text));
    return {
      text,
      language,
      segments: timed.length ? timed : [{ text, start: 0, end: duration }],
      ...(words.length === timed.length && words.length ? { words } : {}),
    };
  }
}
