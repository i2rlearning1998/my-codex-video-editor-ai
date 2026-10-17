import { it, expect, vi } from 'vitest';
import {
  createModelLoader,
  type ModelStore,
  type ModelFile,
} from '../../src/speech';
import type { FetchLike } from '../../src/providers';
function setup() {
  const map = new Map<string, Blob>();
  const store: ModelStore = {
    get: async (k) => map.get(k),
    put: async (k, v) => {
      map.set(k, v);
    },
    delete: async (k) => {
      map.delete(k);
    },
  };
  const fetch = vi.fn<FetchLike>(async () => new Response('abc'));
  const file: ModelFile = {
    id: 'fixture',
    url: 'https://models.example/fixture',
    sizeBytes: 3,
    sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    license: 'MIT fixture',
  };
  return { map, store, fetch, file, loader: createModelLoader(store, fetch) };
}
it('verifies integrity before committing, reports bytes and works offline after a cache hit', async () => {
  const s = setup(),
    progress = vi.fn();
  expect(await s.loader.has(s.file)).toBe(false);
  expect(
    await (await s.loader.load(s.file, { onProgress: progress })).text(),
  ).toBe('abc');
  expect(progress).toHaveBeenCalledWith({
    phase: 'download',
    completed: 3,
    total: 3,
    file: 'fixture',
  });
  expect(await s.loader.has(s.file)).toBe(true);
  await s.loader.load(s.file, { offline: true });
  expect(s.fetch).toHaveBeenCalledTimes(1);
});
it('rejects corruption and never commits partial bytes', async () => {
  const s = setup();
  s.fetch.mockResolvedValueOnce(new Response('bad'));
  await expect(s.loader.load(s.file)).rejects.toMatchObject({
    code: 'INTEGRITY_FAILED',
  });
  expect(s.map.size).toBe(0);
  await s.loader.load(s.file);
  expect(s.map.size).toBe(1);
});
it('evicts corrupted cache and re-downloads verified data', async () => {
  const s = setup();
  s.map.set(`${s.file.id}/${s.file.sha256}`, new Blob(['bad']));
  expect(await s.loader.has(s.file)).toBe(false);
  await s.loader.load(s.file);
  expect(s.fetch).toHaveBeenCalledOnce();
});
it('aborts download without caching and safely restarts on retry', async () => {
  const s = setup(),
    controller = new AbortController();
  await expect(
    s.loader.load(s.file, {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    }),
  ).rejects.toMatchObject({ code: 'ABORTED' });
  expect(s.map.size).toBe(0);
  await s.loader.load(s.file);
  expect(s.map.size).toBe(1);
});
it('offline misses and unpinned manifests do not fetch', async () => {
  const s = setup();
  await expect(s.loader.load(s.file, { offline: true })).rejects.toMatchObject({
    code: 'MODEL_UNAVAILABLE',
  });
  await expect(s.loader.load({ ...s.file, sha256: '' })).rejects.toMatchObject({
    code: 'INVALID_INPUT',
  });
  expect(s.fetch).not.toHaveBeenCalled();
});
