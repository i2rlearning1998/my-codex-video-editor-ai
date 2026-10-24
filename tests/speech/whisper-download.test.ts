import { expect, test, vi } from 'vitest';
import {
  ModelDownloadError,
  createModelLoader,
  type ModelStore,
} from '../../src/speech/model-cache';
import type { ModelFile } from '../../src/speech/models';
import {
  classifyWhisperError,
  createWhisperRunner,
} from '../../src/speech/whisper';

// FIX5 C9: a local fake that behaves like Hugging Face: a redirect, no
// Content-Length, chunked answers, a slow first byte, and a server that hangs.
const memoryStore = (): ModelStore => {
  const map = new Map<string, Blob>();
  return {
    get: async (key) => map.get(key),
    put: async (key, blob) => void map.set(key, blob),
    delete: async (key) => void map.delete(key),
  };
};
const file: ModelFile = {
  id: 'whisper-tiny/onnx/encoder.onnx',
  url: 'https://huggingface.co/Xenova/whisper-tiny/resolve/main/onnx/encoder.onnx',
  sizeBytes: null,
  sha256: null,
  license: 'MIT',
};
/** A chunked body without Content-Length, first byte after `delay` ms. */
const chunked = (parts: number, delay = 0) =>
  new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        for (let i = 0; i < parts; i++) {
          controller.enqueue(new Uint8Array(100).fill(i + 1));
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        controller.close();
      },
    }),
    { status: 200 },
  );

test('[FX5-009] a chunked download with no Content-Length reports bytes with an unknown total and completes', async () => {
  const loader = createModelLoader(memoryStore(), async () => chunked(5, 30));
  const seen: { completed: number; total: number | null }[] = [];
  const blob = await loader.load(file, {
    onProgress: (p) => seen.push({ completed: p.completed, total: p.total }),
  });
  expect(blob.size).toBe(500);
  expect(seen.length).toBe(5);
  expect(seen.every((p) => p.total === null)).toBe(true);
  expect(seen.at(-1)!.completed).toBe(500);
});

test('[FX5-009] the runner passes bytes and an unknown total to the Settings download line', async () => {
  const runner = createWhisperRunner({
    store: memoryStore(),
    fetcher: (async () => chunked(3)) as never,
  });
  const details: { done: number; total: number | null }[] = [];
  await runner.download(
    (_fraction, detail) => detail && details.push(detail),
    new AbortController().signal,
  );
  expect(details.length).toBeGreaterThan(3);
  expect(details.slice(0, -1).every((d) => d.total === null)).toBe(true);
  expect(details.at(-1)!.done).toBeGreaterThan(0);
});

test('[FX5-009] a server that goes quiet is a stall that names the file, host and bytes', async () => {
  const hung = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(40));
      },
    }),
  );
  const loader = createModelLoader(memoryStore(), async () => hung);
  const error = await loader
    .load(file, { stallMs: 600 })
    .catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ModelDownloadError);
  const failure = error as ModelDownloadError;
  expect(failure.reason).toBe('stalled');
  expect(failure.message).toContain('huggingface.co');
  expect(failure.message).toContain(file.id);
  expect(failure.message).toContain('40 bytes');
  expect(classifyWhisperError(failure, 'load').kind).toBe('stalled');
});

test('[FX5-009] an HTTP error and a blocked connection name the host and the status', async () => {
  const http = await createModelLoader(
    memoryStore(),
    async () => new Response('no', { status: 503 }),
  )
    .load(file)
    .then(
      () => {
        throw new Error('expected a failure');
      },
      (e: unknown) => e as ModelDownloadError,
    );
  expect(http).toMatchObject({
    reason: 'http',
    status: 503,
    host: 'huggingface.co',
  });
  expect(http.message).toContain('HTTP 503');
  const blocked = await createModelLoader(memoryStore(), async () => {
    throw new TypeError('Failed to fetch');
  })
    .load(file)
    .then(
      () => {
        throw new Error('expected a failure');
      },
      (e: unknown) => e as ModelDownloadError,
    );
  expect(blocked.reason).toBe('network');
  expect(blocked.message).toContain(file.id);
  expect(classifyWhisperError(blocked, 'load').kind).toBe('blocked');
  void vi;
});
