import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createProviderRegistry,
  createPixabay,
  createPexels,
  createFreesound,
  createIconify,
  createKeyStore,
  maskKey,
  testKey,
  createSearchCache,
  createNetwork,
  retryAfter,
  searchCacheKey,
} from '../../src/providers';
import type { CacheEntry, KeyStorage } from '../../src/providers';
import { setup } from './helpers';
afterEach(() => vi.useRealTimers());
const storage = (): KeyStorage => {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
};
describe('provider framework', () => {
  it('registry registers, lists, gets and filters kinds without claiming speech support', () => {
    const registry = createProviderRegistry(),
      p = createPexels();
    registry.register(p);
    expect(registry.get('pexels')).toBe(p);
    expect(registry.listByKind('stock-video')).toEqual([p]);
    expect(registry.listByKind('speech-tts')).toEqual([]);
    expect(registry.list()).toHaveLength(1);
    expect(() => registry.register(p)).toThrow();
  });
  it('keys round trip per provider/field; multi-field requirements and masking', () => {
    const s = storage(),
      keys = createKeyStore(() => s);
    keys.setKey('one', 'token', 'long-secret-token');
    keys.setKey('one', 'region', 'west');
    keys.setKey('two', 'token', 'other');
    const fresh = createKeyStore(() => s);
    expect(fresh.getKey('one', 'token')).toBe('long-secret-token');
    expect(fresh.getKey('one', 'region')).toBe('west');
    fresh.clearKey('one', 'token');
    expect(fresh.getKey('one', 'token')).toBe('');
    expect(fresh.getKey('two', 'token')).toBe('other');
    expect(maskKey('long-secret-token')).toBe('••••••••oken');
    expect(maskKey('short')).not.toContain('short');
    expect(maskKey('')).toBe('');
    const p = {
      ...createPexels(),
      id: 'one',
      keyFields: [
        { id: 'token', label: 'Token', secret: true },
        { id: 'region', label: 'Region', secret: false },
      ],
    };
    expect(fresh.hasKeys(p)).toBe(false);
    fresh.setKey('one', 'token', 'new');
    expect(fresh.hasKeys(p)).toBe(true);
  });
  it('corrupt or throwing storage does not crash or expose data', () => {
    const corrupt = {
      getItem: () => '{bad',
      setItem: () => {
        throw Error('private');
      },
      removeItem: () => {
        throw Error('private');
      },
    };
    const k = createKeyStore(() => corrupt);
    expect(k.getKey('x')).toBe('');
    k.setKey('x', 'apiKey', 'secret');
    expect(k.getKey('x')).toBe('secret');
    k.clearKey('x');
    expect(k.getKey('x')).toBe('');
    expect(
      createKeyStore(() => {
        throw Error('disabled');
      }).getKey('x'),
    ).toBe('');
  });
  it('testKey always makes one uncached cheap request and returns sanitized typed results', async () => {
    const deps = setup('pexels-photos'),
      p = createPexels(deps);
    expect(await testKey(p)).toEqual({ status: 'ok' });
    expect(await testKey(p)).toEqual({ status: 'ok' });
    expect(deps.fetch).toHaveBeenCalledTimes(2);
    deps.fetch.mockRejectedValue(Error('private-pexels'));
    expect(await testKey(p)).toMatchObject({
      status: 'network',
      code: 'NETWORK',
    });
    deps.fetch.mockResolvedValue(
      new Response('private-pexels', { status: 401 }),
    );
    const result = await testKey(p);
    expect(result).toMatchObject({
      status: 'invalid-key',
      code: 'KEY_INVALID',
    });
    expect(JSON.stringify(result)).not.toContain('private-');
  });
  it('cache persists across instances, expires exactly at TTL, returns isolated copies', async () => {
    let now = 0;
    const saved = new Map<string, CacheEntry>(),
      backend = {
        read: async (k: string) => saved.get(k),
        write: async (k: string, v: CacheEntry) => {
          saved.set(k, v);
        },
      };
    const cache = createSearchCache({ backend, now: () => now, ttlMs: 100 });
    await cache.set('key', { items: [1] });
    const got = (await cache.get('key')) as { items: number[] };
    got.items.push(2);
    expect(
      await createSearchCache({ backend, now: () => now }).get('key'),
    ).toEqual({ items: [1] });
    now = 100;
    expect(await cache.get('key')).toBeUndefined();
  });
  it('cache key excludes signal and distinguishes every search filter', () => {
    const base = { kind: 'stock-video' as const, query: 'sea' };
    const key = searchCacheKey('p', base);
    expect(
      searchCacheKey('p', { ...base, signal: new AbortController().signal }),
    ).toBe(key);
    for (const change of [
      { page: 2 },
      { perPage: 1 },
      { orientation: 'portrait' as const },
      { minWidth: 1 },
      { minDuration: 1 },
      { maxDuration: 2 },
    ])
      expect(searchCacheKey('p', { ...base, ...change })).not.toBe(key);
  });
  it('exponential fail-fast backoff and HTTP-date Retry-After do not sleep or retry', async () => {
    let now = 0;
    const fetch = vi.fn(async () => new Response('', { status: 429 })),
      net = createNetwork({ fetch, now: () => now });
    await expect(net.json('https://example.org')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAt: 1000,
    });
    now = 1000;
    await expect(net.json('https://example.org')).rejects.toMatchObject({
      retryAt: 3000,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(retryAfter('Thu, 01 Jan 1970 00:00:05 GMT', 0)).toBe(5000);
  });
  it('abort and timeout work even with a non-cooperative injectable fetch', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(() => new Promise<Response>(() => undefined)),
      net = createNetwork({ fetch, timeoutMs: 10 }),
      controller = new AbortController();
    const aborted = expect(
      net.json('https://example.org', { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
    controller.abort();
    await aborted;
    // FIX1 F2: a timeout says so (never "No internet").
    const timed = expect(net.json('https://example.org')).rejects.toMatchObject(
      { code: 'TIMEOUT' },
    );
    await vi.advanceTimersByTimeAsync(10);
    await timed;
  });
});
describe.each([
  ['Pixabay', createPixabay, 'pixabay-images', 'stock-image'],
  ['Pexels', createPexels, 'pexels-photos', 'stock-image'],
  ['Iconify', createIconify, 'iconify', 'icon'],
  ['Freesound', createFreesound, 'freesound', 'stock-audio'],
] as const)('%s shared errors', (name, create, fixture, kind) => {
  it('maps key invalid, rate limit, server and malformed JSON without secrets', async () => {
    for (const [status, code] of [
      [401, 'KEY_INVALID'],
      [429, 'RATE_LIMITED'],
      // FIX1 F2: an error status is named with its number.
      [503, 'HTTP'],
      [200, 'BAD_RESPONSE'],
    ] as const) {
      const deps = setup(fixture);
      deps.fetch.mockResolvedValue(new Response('private-secret', { status }));
      const provider = create(deps);
      await expect(
        provider.search({ kind, query: name }),
      ).rejects.toMatchObject({
        code,
        ...(code === 'HTTP' ? { status } : {}),
      });
    }
  });
});
