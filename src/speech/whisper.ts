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
import { LOCAL_MODELS, type ModelFile } from './models';
import { browserCodec, resampleMono } from './pcm';
import {
  SpeechError,
  type AudioCodec,
  type SttRequest,
  type Transcription,
  type WordTiming,
} from './types';

/** The few parts of @huggingface/transformers the runner uses. */
interface TransformersModule {
  env: Record<string, unknown>;
  pipeline(
    task: 'automatic-speech-recognition',
    model: string,
    options: Record<string, unknown>,
  ): Promise<
    (
      audio: Float32Array,
      options: Record<string, unknown>,
    ) => Promise<{
      text: string;
      chunks?: { text: string; timestamp: [number, number | null] }[];
    }>
  >;
}

export interface WhisperRunner {
  /** Every file is stored and passes its check. */
  isReady(): Promise<boolean>;
  download(
    onProgress: (fraction: number) => void,
    signal: AbortSignal,
  ): Promise<void>;
  remove(): Promise<void>;
  transcribe(request: SttRequest): Promise<Transcription>;
}

export function createWhisperRunner(
  options: {
    store?: ModelStore;
    fetcher?: Parameters<typeof createModelLoader>[1];
    loadTransformers?: () => Promise<TransformersModule>;
    codec?: AudioCodec;
  } = {},
): WhisperRunner {
  const config = LOCAL_MODELS.find((m) => m.id === 'local-whisper')!;
  const files: readonly ModelFile[] = config.files;
  const store = options.store ?? createIndexedModelStore();
  const loader = createModelLoader(store, options.fetcher);
  const loadTransformers =
    options.loadTransformers ??
    (() =>
      import('@huggingface/transformers') as unknown as Promise<TransformersModule>);
  const codec = options.codec ?? browserCodec;
  let asr: Awaited<ReturnType<TransformersModule['pipeline']>> | null = null;

  const total = () =>
    files.every((f) => f.sizeBytes !== null)
      ? files.reduce((sum, f) => sum + (f.sizeBytes ?? 0), 0)
      : (config.approxBytes ?? 1);

  return {
    async isReady() {
      if (!files.length) return false;
      for (const file of files) if (!(await loader.has(file))) return false;
      return true;
    },
    async download(onProgress, signal) {
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
      asr = null;
      for (const file of files)
        await store.delete(
          `${file.id}/${file.sha256 ? file.sha256.toLowerCase() : 'size-only'}`,
        );
    },
    async transcribe(request) {
      if (!files.length || !config.model)
        throw new SpeechError('MODEL_UNAVAILABLE');
      if (request.signal?.aborted) throw new SpeechError('INVALID_INPUT');
      if (!asr) {
        const { env, pipeline } = await loadTransformers();
        // Every file comes from this browser's verified store.
        env.allowLocalModels = false;
        env.useBrowserCache = false;
        env.useCustomCache = true;
        env.customCache = {
          match: async (input: string | Request) => {
            const url = typeof input === 'string' ? input : input.url;
            const file = files.find((f) => f.url === url);
            if (!file) return undefined;
            const blob = await loader.load(file, { offline: true });
            return new Response(blob);
          },
          put: async () => {},
        };
        asr = await pipeline('automatic-speech-recognition', config.model, {
          dtype: 'q8',
          device: 'wasm',
        });
      }
      const blob =
        request.blob ??
        (await (await fetch(request.url!, { credentials: 'omit' })).blob());
      request.onProgress?.({ phase: 'transcription', completed: 0, total: 1 });
      const audio = resampleMono(await codec.decode(blob), 16000);
      const language = (request.lang ?? 'en').split('-')[0]!;
      const run = (timestamps: 'word' | true) =>
        asr!(audio, {
          language: language === 'hi' ? 'hindi' : 'english',
          task: 'transcribe',
          return_timestamps: timestamps,
          chunk_length_s: 30,
          stride_length_s: 5,
        });
      // Word timings need cross-attention outputs; fall back to segments.
      const out = await run('word').catch(() => run(true));
      request.onProgress?.({ phase: 'transcription', completed: 1, total: 1 });
      const duration = audio.length / 16000;
      const chunks: WordTiming[] = (out.chunks ?? []).map((c) => ({
        text: c.text.trim(),
        start: c.timestamp[0],
        end: c.timestamp[1] ?? duration,
      }));
      const words = chunks.filter((c) => c.text && !/\s/.test(c.text));
      return {
        text: out.text.trim(),
        language,
        segments: chunks.length
          ? chunks
          : [{ text: out.text.trim(), start: 0, end: duration }],
        ...(words.length === chunks.length && words.length ? { words } : {}),
      };
    },
  };
}
