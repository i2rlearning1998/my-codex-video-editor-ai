import { describe, it, expect } from 'vitest';
import { createPixabay } from '../../src/providers';
import { setup } from './helpers';
describe('Pixabay', () => {
  it('maps photos, authenticates only with required query key, uses 24-hour cache', async () => {
    const deps = setup('pixabay-images'),
      p = createPixabay(deps),
      o = { kind: 'stock-image' as const, query: 'forest' };
    const r = await p.search(o);
    expect(r.items[0]).toMatchObject({
      providerId: 'pixabay',
      author: 'Ada',
      width: 3000,
      license: { name: 'Pixabay Content License' },
    });
    expect(r.items[0]!.files.map((f) => f.quality)).toEqual([
      'tiny',
      'small',
      'medium',
      'large',
    ]);
    expect(r.nextPage).toBe(2);
    const [url, init] = deps.fetch.mock.calls[0]!;
    expect(new URL(url).searchParams.get('key')).toBe('private-pixabay');
    expect(init?.headers).toEqual({});
    deps.advance(600001);
    await p.search(o);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    deps.advance(86400000);
    await p.search(o);
    expect(deps.fetch).toHaveBeenCalledTimes(2);
  });
  it('maps the real video sizes (an empty `large` with size 0 is skipped) and applies duration filtering without losing next-page semantics', async () => {
    const p = createPixabay(setup('pixabay-videos'));
    const r = await p.search({ kind: 'stock-video', query: 'ocean' });
    expect(r.items[0]!.files.map((f) => f.quality)).toEqual([
      'tiny',
      'small',
      'medium',
    ]);
    expect(r.items[0]!.files.every((f) => f.url !== '')).toBe(true);
    expect(r.items[0]!.files[2]!.bytes).toBe(3500000);
    expect(r.items[0]).toMatchObject({
      width: 1280,
      height: 720,
      durationSec: 12,
    });
    expect((await p.getDownload(r.items[0]!, 'tiny')).mime).toBe('video/mp4');
    expect(
      (await p.search({ kind: 'stock-video', query: 'ocean', minDuration: 13 }))
        .items,
    ).toEqual([]);
  });
  it('throttles the 101st uncached request per key without sleeping', async () => {
    const deps = setup('pixabay-images'),
      p = createPixabay(deps);
    await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        p.search({ kind: 'stock-image', query: String(i) }),
      ),
    );
    await expect(
      p.search({ kind: 'stock-image', query: 'overflow' }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAt: 60000 });
    expect(deps.fetch).toHaveBeenCalledTimes(100);
    deps.advance(60000);
    await p.search({ kind: 'stock-image', query: 'overflow' });
    expect(deps.fetch).toHaveBeenCalledTimes(101);
  });
  it('maps invalid API-key 400 without leaking provider response text', async () => {
    const deps = setup('pixabay-images');
    deps.fetch.mockResolvedValue(
      new Response('private-pixabay', { status: 400 }),
    );
    await expect(
      createPixabay(deps).search({ kind: 'stock-image', query: 'x' }),
    ).rejects.toMatchObject({
      code: 'KEY_INVALID',
      message: 'The provider rejected the key.',
    });
  });
});
