import { expect, test } from 'vitest';
import { createWhisperRunner } from '../../src/speech/whisper';
import { WHISPER_FILES } from '../../src/speech/models';
import type { ModelStore } from '../../src/speech/model-cache';

// FINAL2 U11: the offline Whisper runner with a fake network and a fake
// transformers module (the sandbox cannot reach huggingface.co).
const memoryStore = (): ModelStore & { keys(): string[] } => {
  const map = new Map<string, Blob>();
  return {
    get: async (key) => map.get(key),
    put: async (key, blob) => void map.set(key, blob),
    delete: async (key) => void map.delete(key),
    keys: () => [...map.keys()],
  };
};

test('downloads every unpinned file once (size only), reports progress, serves the runner from the store and maps word timings', async () => {
  const store = memoryStore();
  const fetched: string[] = [];
  const fetcher = async (url: string) => {
    fetched.push(url);
    return new Response(new Uint8Array(1000).fill(7));
  };
  let cacheHits = 0;
  const runner = createWhisperRunner({
    store,
    fetcher: fetcher as never,
    codec: {
      decode: async () => ({
        sampleRate: 16000,
        channels: [new Float32Array(32000)],
      }),
      encode: () => new Blob(),
    },
    loadTransformers: async () => {
      const env: Record<string, unknown> = {};
      return {
        env,
        pipeline: async (_task, model) => {
          expect(model).toBe('Xenova/whisper-small');
          const cache = env.customCache as {
            match(url: string): Promise<Response | undefined>;
          };
          for (const file of WHISPER_FILES)
            if (await cache.match(file.url)) cacheHits++;
          return async (_audio, options) => {
            expect(options.language).toBe('hindi');
            return {
              text: ' नमस्ते दुनिया',
              chunks: [
                { text: ' नमस्ते', timestamp: [0, 0.6] },
                { text: ' दुनिया', timestamp: [0.6, null] },
              ],
            };
          };
        },
      };
    },
  });
  expect(await runner.isReady()).toBe(false);
  const steps: number[] = [];
  await runner.download((f) => steps.push(f), new AbortController().signal);
  expect(fetched).toHaveLength(WHISPER_FILES.length);
  expect(steps.at(-1)).toBe(1);
  expect(await runner.isReady()).toBe(true);
  const result = await runner.transcribe({
    blob: new Blob([new Uint8Array(4)]),
    lang: 'hi',
  });
  expect(cacheHits).toBe(WHISPER_FILES.length);
  expect(fetched).toHaveLength(WHISPER_FILES.length);
  expect(result.words).toEqual([
    { text: 'नमस्ते', start: 0, end: 0.6 },
    { text: 'दुनिया', start: 0.6, end: 2 },
  ]);
  await runner.remove();
  expect(store.keys()).toEqual([]);
  expect(await runner.isReady()).toBe(false);
});

test('a cancelled download stores nothing', async () => {
  const store = memoryStore();
  const controller = new AbortController();
  const runner = createWhisperRunner({
    store,
    fetcher: (async () => {
      controller.abort();
      return new Response(new Uint8Array(10));
    }) as never,
  });
  await expect(runner.download(() => {}, controller.signal)).rejects.toThrow();
  expect(store.keys()).toEqual([]);
});

// FIX1 F4: every way offline captions can fail has its own class (and so a
// visible message); success maps windows to timed cues.
import { fakeWhisperRunner } from '../../src/speech/whisper-fake';
import { WhisperError, whisperLanguage } from '../../src/speech/whisper';
const codec = (seconds: number) => ({
  decode: async () => ({
    sampleRate: 16000,
    channels: [new Float32Array(Math.round(seconds * 16000)).fill(0.1)],
  }),
  encode: () => new Blob(),
});
const ready = async (runner: ReturnType<typeof fakeWhisperRunner>) => {
  await runner.download(() => {}, new AbortController().signal);
  return runner;
};
test('[FX1-010] success: windows of 30 s report progress and keep their offsets; Hindi and English map to the names Whisper expects', async () => {
  const runner = await ready(fakeWhisperRunner('ok', { codec: codec(65) }));
  const phases: string[] = [];
  const result = await runner.transcribe({
    blob: new Blob(),
    lang: 'hi-IN',
    onProgress: (p) =>
      phases.push(
        `${p.phase}${p.stage ? `.${p.stage}` : ''}:${p.completed}/${p.total}`,
      ),
  });
  // FIX4 A5: the model start names its stages.
  expect(phases).toEqual([
    'load:0/null',
    'load.library:0/null',
    'load.pipeline:0/null',
    'load.ready:0/null',
    'decode:0/null',
    'transcription:0/3',
    'transcription:1/3',
    'transcription:2/3',
    'transcription:3/3',
  ]);
  expect(runner.languages).toEqual(['hindi', 'hindi', 'hindi']);
  expect(result.words?.[4]?.start).toBeCloseTo(30, 5);
  expect(whisperLanguage('en-US')).toBe('english');
  expect(whisperLanguage('hi')).toBe('hindi');
});
test.each([
  ['no-speech', 'no-speech', 'listen'],
  ['blocked', 'blocked', 'load'],
  ['memory', 'memory', 'load'],
  ['unsupported', 'unsupported', 'check'],
  ['no-audio', 'no-audio', 'decode'],
] as const)(
  '[FX1-010] %s fails visibly as %s at %s',
  async (mode, kind, step) => {
    const runner = await ready(
      fakeWhisperRunner(mode, mode === 'no-audio' ? {} : { codec: codec(2) }),
    );
    const error = await runner
      .transcribe({ blob: new Blob(), lang: 'en' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WhisperError);
    expect(error).toMatchObject({ kind, step });
  },
);
test('[FX1-010] not downloaded, a hung model start and Cancel each end with their own class', async () => {
  const missing = fakeWhisperRunner('ok', { codec: codec(1) });
  await expect(
    missing.transcribe({ blob: new Blob(), lang: 'en' }),
  ).rejects.toMatchObject({ kind: 'not-downloaded', step: 'check' });
  const hung = await ready(fakeWhisperRunner('hang', { codec: codec(1) }));
  const controller = new AbortController();
  const pending = hung.transcribe({
    blob: new Blob(),
    lang: 'en',
    signal: controller.signal,
  });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
});
