// @vitest-environment jsdom
import { expect, it, vi, afterEach } from 'vitest';
import { createFreeCodeRuntime } from '../../src/freecode/runtime';
const source = `export default {meta:{id:'test',name:'Test',version:'1.0.0',category:'Test',duration:1,params:[]},init(){},renderFrame(){}}`;
const options = {
  width: 64,
  height: 64,
  fps: 24,
  duration: 1,
  params: {},
  seed: 1,
};
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});
it('removes iframe and rejects pending startup on deadline', async () => {
  vi.useFakeTimers();
  const promise = createFreeCodeRuntime({
    frameTimeoutMs: 50,
    totalTimeoutMs: 100,
  }).open(source, options);
  const check = expect(promise).rejects.toThrow('Frame timeout');
  await vi.advanceTimersByTimeAsync(51);
  await check;
  expect(document.querySelector('iframe')).toBeNull();
});
it('validates dimensions, params and timeouts before execution', async () => {
  expect(() => createFreeCodeRuntime({ frameTimeoutMs: NaN })).toThrow();
  await expect(
    createFreeCodeRuntime().open(source, { ...options, width: 0 }),
  ).rejects.toThrow('Invalid canvas');
  await expect(
    createFreeCodeRuntime().open(source, {
      ...options,
      params: { unknown: 2 },
    }),
  ).rejects.toThrow('Unknown parameter');
  expect(document.querySelector('iframe')).toBeNull();
});
