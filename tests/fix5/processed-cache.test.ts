import { expect, it } from 'vitest';
import {
  createProcessedCache,
  frameIdentity,
} from '../../src/render/processed-cache';
it('[FX-015] reuses processed pixels and bounds retained preview memory without stale frame identities', () => {
  const released: Uint8ClampedArray[] = [];
  const cache = createProcessedCache<Uint8ClampedArray>(8, (value) =>
    released.push(value),
  );
  const first = new Uint8ClampedArray([0, 255, 0, 128]);
  const second = new Uint8ClampedArray([255, 0, 0, 255]);
  cache.set('clip@0:mask+chroma', first, 4);
  expect(cache.get('clip@0:mask+chroma')).toBe(first);
  expect(cache.get('clip@1:mask+chroma')).toBeUndefined();
  cache.set('second', second, 4);
  cache.get('clip@0:mask+chroma');
  cache.set('changed', second.slice(), 4);
  expect(cache.get('second')).toBeUndefined();
  expect(cache.bytes).toBe(8);
  expect(released).toEqual([second]);
  expect(cache.set('oversized', first, 9)).toBe(false);
  expect(cache.get('clip@0:mask+chroma')).toEqual(first);
  expect(frameIdentity(first)).toBe(frameIdentity(first));
  expect(frameIdentity(second)).not.toBe(frameIdentity(first));
  cache.clear();
  expect(cache.bytes).toBe(0);
});
