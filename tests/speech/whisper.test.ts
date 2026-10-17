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
          expect(model).toBe('Xenova/whisper-tiny');
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
