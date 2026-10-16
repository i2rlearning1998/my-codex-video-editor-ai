import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryMediaStore } from '../../src/media/store';
import {
  createThumbnailService,
  thumbnailKey,
  placeholder,
  getThumbnail,
} from '../../src/thumbnails';
import type { ThumbnailItem } from '../../src/thumbnails';
const size = { width: 160, height: 90 };
const item: ThumbnailItem = {
  id: 'test-item',
  type: 'audio',
  data: { peaks: [0.2, 0.7] },
};
const blob = () => new Blob(['image bytes'], { type: 'image/png' });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
afterEach(() => vi.unstubAllGlobals());
describe('thumbnail cache and queue', () => {
  it('keys include id, content, blob bytes, size, time and are stable across field order', async () => {
    const key = await thumbnailKey(item, size);
    expect(
      await thumbnailKey(
        { type: 'audio', data: { peaks: [0.2, 0.7] }, id: item.id },
        size,
      ),
    ).toBe(key);
    expect(await thumbnailKey({ ...item, id: 'other' }, size)).not.toBe(key);
    expect(
      await thumbnailKey({ ...item, data: { peaks: [0.8] } }, size),
    ).not.toBe(key);
    expect(await thumbnailKey(item, { width: 320, height: 180 })).not.toBe(key);
    expect(await thumbnailKey(item, size, 0.5)).not.toBe(key);
    expect(
      await thumbnailKey({ ...item, blob: new Blob(['a']) }, size),
    ).not.toBe(await thumbnailKey({ ...item, blob: new Blob(['b']) }, size));
  });
  it('cache miss renders; hit survives a service restart; changed content removes old entry', async () => {
    const cache = new MemoryMediaStore(),
      render = vi.fn(async () => blob());
    await createThumbnailService({ cache, render }).getThumbnail(item, size);
    await createThumbnailService({ cache, render }).getThumbnail(item, size);
    expect(render).toHaveBeenCalledTimes(1);
    const changed = { ...item, data: { peaks: [1] } };
    await createThumbnailService({ cache, render }).getThumbnail(changed, size);
    expect(render).toHaveBeenCalledTimes(2);
    expect(await cache.keys()).toEqual([await thumbnailKey(changed, size)]);
  });
  it('dedupes concurrent requests and never renders two queued items together', async () => {
    const entered = deferred<void>(),
      release = deferred<Blob>();
    let active = 0,
      max = 0;
    const render = vi.fn(async () => {
      active++;
      max = Math.max(max, active);
      entered.resolve();
      const value = await release.promise;
      active--;
      return value;
    });
    const service = createThumbnailService({ cache: null, render });
    const a = service.getThumbnail(item, size),
      b = service.getThumbnail(item, size),
      c = service.getThumbnail({ ...item, id: 'second' }, size);
    await entered.promise;
    expect(render).toHaveBeenCalledTimes(1);
    release.resolve(blob());
    const results = await Promise.all([a, b, c]);
    expect(results[0]).toBe(results[1]);
    expect(render).toHaveBeenCalledTimes(2);
    expect(max).toBe(1);
  });
  it('one aborted subscriber does not cancel another sharing its render', async () => {
    const entered = deferred<void>(),
      release = deferred<Blob>();
    const render = vi.fn(async (_item, request) => {
      entered.resolve();
      const value = await release.promise;
      expect(request.signal.aborted).toBe(false);
      return value;
    });
    const service = createThumbnailService({ cache: null, render });
    const controller = new AbortController();
    const a = service.getThumbnail(item, {
      ...size,
      signal: controller.signal,
    });
    const b = service.getThumbnail(item, size);
    // Same-item callers share the in-flight hash and join before rendering starts.
    await entered.promise;
    controller.abort();
    expect((await a).type).toBe('image/svg+xml');
    release.resolve(blob());
    const result = await b;
    expect(result.type).toBe('image/png');
    expect(render).toHaveBeenCalledTimes(1);
  });
  it('already aborted requests do not render; an active cancellation returns a placeholder', async () => {
    const controller = new AbortController();
    controller.abort();
    const render = vi.fn(async () => blob());
    const service = createThumbnailService({ cache: null, render });
    expect(
      (await service.getThumbnail(item, { ...size, signal: controller.signal }))
        .type,
    ).toBe('image/svg+xml');
    expect(render).not.toHaveBeenCalled();
    const entered = deferred<void>();
    const active = new AbortController();
    const cancellable = createThumbnailService({
      cache: null,
      render: async (_item, request) => {
        entered.resolve();
        return new Promise<Blob>((_, reject) =>
          request.signal.addEventListener(
            'abort',
            () => reject(Error('Abort')),
            { once: true },
          ),
        );
      },
    });
    const pending = cancellable.getThumbnail(item, {
      ...size,
      signal: active.signal,
    });
    await entered.promise;
    active.abort();
    expect((await pending).type).toBe('image/svg+xml');
  });
  it('bad items, invalid sizes, renderer failures and missing canvas return neutral blobs', async () => {
    const service = createThumbnailService({
      cache: null,
      render: async () => {
        throw Error('Bad item');
      },
    });
    for (const input of [null, {}, item])
      expect((await service.getThumbnail(input, size)).type).toBe(
        'image/svg+xml',
      );
    expect(
      (await service.getThumbnail(item, { width: Infinity, height: -1 })).size,
    ).toBeGreaterThan(0);
    expect((await getThumbnail(item, size)).type).toBe('image/svg+xml');
    expect(await placeholder().text()).toContain('viewBox');
  });
  it('cache failures still return a rendered thumbnail', async () => {
    const bad = async () => {
      throw Error('Quota');
    };
    const service = createThumbnailService({
      cache: { read: bad, write: bad, remove: bad, keys: bad },
      render: async () => blob(),
    });
    expect((await service.getThumbnail(item, size)).type).toBe('image/png');
  });
  it('samples distinct hover times and caps frame count', async () => {
    const times: number[] = [];
    const service = createThumbnailService({
      cache: null,
      render: async (_item, r) => {
        times.push(r.progress);
        return blob();
      },
    });
    expect(
      await service.getPreviewFrames(item, { ...size, count: 3 }),
    ).toHaveLength(3);
    expect(times).toEqual([0, 1 / 3, 2 / 3]);
    expect(
      await service.getPreviewFrames(item, { ...size, count: 100 }),
    ).toHaveLength(24);
  });
});

describe('canvas rendering with fakes', () => {
  const fake = () => {
    const calls: Record<string, unknown[][]> = {};
    const context = new Proxy<Record<string, unknown>>(
      {},
      {
        get(target, key) {
          if (key in target) return target[String(key)];
          return (...args: unknown[]) => {
            (calls[String(key)] ??= []).push(args);
          };
        },
        set(target, key, value) {
          target[String(key)] = value;
          return true;
        },
      },
    );
    class Canvas {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
      }
      getContext() {
        return context;
      }
      async convertToBlob() {
        return blob();
      }
    }
    vi.stubGlobal('OffscreenCanvas', Canvas);
    return calls;
  };
  it('draws an audio waveform and encodes using OffscreenCanvas', async () => {
    const calls = fake();
    const service = createThumbnailService({ cache: null });
    expect((await service.getThumbnail(item, size)).type).toBe('image/png');
    expect(calls.lineTo).toHaveLength(2);
  });
  it('draws theme swatches and heading-font Aa', async () => {
    const calls = fake();
    const service = createThumbnailService({ cache: null });
    const theme = {
      id: 'my-theme',
      type: 'theme',
      data: {
        palette: {
          background: '#ffffff',
          primary: '#ff0000',
          accent: '#00ff00',
          text: '#000000',
        },
        fonts: { heading: 'Georgia', body: 'Arial' },
        motion: 'calm',
      },
    };
    expect((await service.getThumbnail(theme, size)).type).toBe('image/png');
    expect(calls.fillText?.[0]?.[0]).toBe('Aa');
    expect(calls.fillRect).toHaveLength(5);
  });
  it('renders a library polygon and a preset rectangle at different keyframes', async () => {
    const calls = fake();
    const service = createThumbnailService({ cache: null });
    expect(
      (
        await service.getThumbnail(
          {
            id: 'my-shape',
            type: 'shape',
            data: {
              polygons: [
                [
                  [
                    [0, 0],
                    [100, 0],
                    [100, 100],
                    [0, 100],
                  ],
                ],
              ],
              width: 100,
              height: 100,
              fill: '#ff0000',
            },
          },
          size,
        )
      ).type,
    ).toBe('image/png');
    const preset = {
      id: 'move-preset',
      type: 'preset',
      data: {
        appliesTo: ['shape'],
        controls: [],
        tracks: [
          {
            property: 'x',
            keys: [
              { t: 0, v: 20 },
              { t: 1, v: 140 },
            ],
          },
        ],
      },
    };
    await service.getPreviewFrames(preset, { ...size, count: 2 });
    expect(calls.translate).toContainEqual([20, 45]);
    expect(calls.translate).toContainEqual([80, 45]);
  });
  it('requires live-frame revision and uses baked/live frames, closing decoded bitmaps', async () => {
    fake();
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', async () => ({
      width: 160,
      height: 90,
      close,
    }));
    const service = createThumbnailService({ cache: null });
    const provider = vi.fn(async () => blob());
    const motion = { id: 'motion-test', type: 'motion', frameAt: provider };
    expect((await service.getThumbnail(motion, size)).type).toBe(
      'image/svg+xml',
    );
    expect(provider).not.toHaveBeenCalled();
    expect(
      (await service.getThumbnail({ ...motion, revision: '1' }, size)).type,
    ).toBe('image/png');
    expect(
      (
        await service.getThumbnail(
          { id: 'baked', type: 'code', bakedFrames: [blob()] },
          size,
        )
      ).type,
    ).toBe('image/png');
    expect(close).toHaveBeenCalledTimes(2);
  });
});
