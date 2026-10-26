// Phase 1 library, Part D (P1-20 to P1-27): the editor's catalog client
// against a real seeded catalog (served by the owner's catalog server code):
// signature check, cache, ETag, fallback pack, rejected catalogs keeping the
// cache, owner controls, render identity with the old bundled library, and
// catalog media assets.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { LibraryClient } from '../../src/library-client/client';
import { MemoryCache } from '../../src/library-client/cache';
import { catalogAsset } from '../../src/library-client/media';
import { FALLBACK_ITEMS } from '../../src/library-client/fallback';
import { MemoryMediaStore } from '../../src/media/store';
import { generateKeys } from '../../owner/catalog/keys';
import { seedCatalog } from '../../owner/catalog/seed';
import { defaultSeedSources } from '../../owner/catalog/sources';
import { buildCatalog } from '../../owner/catalog/build';
import { ItemStore } from '../../owner/catalog/store';
import { catalogResponse } from '../../owner/catalog/serve';
import { assetSchema } from '../../src/core/model';

const root = mkdtempSync(path.join(tmpdir(), 'aive-client-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const keys = generateKeys(path.join(root, 'keys'));
const dataDir = path.join(root, 'data');
const outDir = path.join(root, 'out');
seedCatalog(defaultSeedSources(), { dataDir, outDir, keys });
const BASE = 'https://catalog.test/';

/** A fetch over the catalog folder, counting requests. */
function catalogFetch(dir = outDir) {
  const calls: string[] = [];
  let offline = false;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (offline) throw new TypeError('Failed to fetch');
    const headers = new Headers(init?.headers);
    const result = catalogResponse(dir, 'GET', new URL(url).pathname, {
      'if-none-match': headers.get('if-none-match') ?? undefined,
    });
    return new Response(result.status === 304 ? null : (result.body ?? null), {
      status: result.status,
      headers: result.headers as Record<string, string>,
    });
  }) as typeof fetch;
  return {
    fetcher,
    calls,
    setOffline: (value: boolean) => (offline = value),
  };
}
const client = (
  net: ReturnType<typeof catalogFetch>,
  cache = new MemoryCache(),
  extra: Partial<ConstructorParameters<typeof LibraryClient>[0]> = {},
) =>
  new LibraryClient({
    url: BASE,
    publicKey: keys.publicKey,
    cache: Promise.resolve(cache),
    media: Promise.resolve(new MemoryMediaStore()),
    fetch: net.fetcher,
    ...extra,
  });

describe('Phase 1 library client', () => {
  it('[LIB-020] reads the signed catalog, caches it, and starts from the cache without waiting for the network', async () => {
    const net = catalogFetch();
    const cache = new MemoryCache();
    const first = client(net, cache);
    await first.ready;
    expect(first.status).toMatchObject({ source: 'catalog', problem: null });
    expect(first.entries('elements').length).toBeGreaterThan(50);
    expect(first.entries('audio').map((entry) => entry.id)).toContain(
      'sound-ding',
    );
    expect(
      net.calls.filter((url) => url.endsWith('manifest.json')),
    ).toHaveLength(1);

    // A second page: the cache fills the panels before any request.
    const later = catalogFetch();
    const second = client(later, cache);
    await second.ready;
    expect(second.status.source).toBe('cache');
    expect(later.calls).toHaveLength(0);
    expect(second.entries('elements')).toEqual(first.entries('elements'));
    // The idle refresh asks with the ETag and gets 304.
    expect(await second.refresh()).toBe('unchanged');
    expect(
      later.calls.filter((url) => url.endsWith('manifest.json')),
    ).toHaveLength(1);
  });

  it('[LIB-021] with no catalog and no cache the tiny fallback pack is used, and the reason is given', async () => {
    const net = catalogFetch();
    net.setOffline(true);
    const offline = client(net);
    await offline.ready;
    expect(offline.status.source).toBe('fallback');
    expect(offline.status.problem).toMatch(/cannot be reached/);
    const manifest = offline.manifest();
    expect(manifest.items.map((item) => item.id)).toEqual(
      FALLBACK_ITEMS.map((item) => item.id),
    );
    expect(manifest.items.some((item) => item.type === 'background')).toBe(
      true,
    );
    // No catalog address at all: the same fallback.
    const none = client(net, new MemoryCache(), { url: null });
    await none.ready;
    expect(none.manifest().items).toHaveLength(FALLBACK_ITEMS.length);
  });

  it('[LIB-021][LIB-006] a catalog with a bad signature is rejected and the saved copy stays', async () => {
    const net = catalogFetch();
    const cache = new MemoryCache();
    const good = client(net, cache);
    await good.ready;
    const before = good.entries('text');

    // The served manifest is tampered with: one byte of the signed text.
    const bad = path.join(root, 'tampered');
    rmSync(bad, { recursive: true, force: true });
    const { cpSync } = await import('node:fs');
    cpSync(outDir, bad, { recursive: true });
    const manifestPath = path.join(bad, 'manifest.json');
    const wrapper = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      signed: string;
    };
    wrapper.signed = wrapper.signed.replace(
      '"catalogVersion":1',
      '"catalogVersion":9',
    );
    writeFileSync(manifestPath, JSON.stringify(wrapper));
    const tampered = catalogFetch(bad);
    const next = client(tampered, cache);
    await next.ready;
    expect(await next.refresh()).toBe('rejected');
    expect(next.status.problem).toMatch(
      /signature is wrong.*saved copy is used/,
    );
    expect(next.status.catalogVersion).toBe(1);
    expect(next.entries('text')).toEqual(before);

    // Another key: rejected the same way.
    const other = generateKeys(path.join(root, 'other-keys'));
    const stranger = client(catalogFetch(), new MemoryCache(), {
      publicKey: other.publicKey,
    });
    await stranger.ready;
    expect(stranger.status.source).toBe('fallback');
    expect(stranger.status.problem).toMatch(/key this editor does not know/);
  });

  it('[LIB-023] hidden, scheduled, featured and ordered entries are honoured; a plan key is kept for the lock', async () => {
    const dir = path.join(root, 'controls');
    rmSync(dir, { recursive: true, force: true });
    const data = path.join(dir, 'data');
    const out = path.join(dir, 'out');
    seedCatalog(defaultSeedSources(), { dataDir: data, outDir: out, keys });
    const store = new ItemStore(data);
    const ids = store.data.items
      .filter((item) => item.category === 'audio')
      .map((item) => item.id);
    const [hidden, later, ended, featured, locked] = ids;
    for (const item of store.data.items) {
      if (item.id === hidden) item.hidden = true;
      if (item.id === later) item.publishAt = '2027-01-01T00:00:00.000Z';
      if (item.id === ended) item.unpublishAt = '2026-01-01T00:00:00.000Z';
      if (item.id === featured) item.featured = true;
      if (item.id === locked) item.planKey = 'pro';
    }
    store.save();
    buildCatalog(store, out, keys, { now: '2026-10-27T00:00:00.000Z' });
    const listed = client(catalogFetch(out), new MemoryCache(), {
      now: () => Date.parse('2026-10-27T00:00:00.000Z'),
    });
    await listed.ready;
    const audio = listed.entries('audio').map((entry) => entry.id);
    expect(audio).not.toContain(hidden);
    expect(audio).not.toContain(later);
    expect(audio).not.toContain(ended);
    expect(audio[0]).toBe(featured);
    expect(listed.entry(locked!)?.planKey).toBe('pro');
  });

  it('[LIB-026] render identity: the catalog gives the panels exactly the records the editor used to bundle', async () => {
    const bundled = JSON.parse(
      readFileSync('tests/fixtures/library/bundled-before.json', 'utf8'),
    ) as { items: { id: string }[]; templates: unknown[] };
    const fresh = client(catalogFetch());
    await fresh.ready;
    // The 200 Starter Pack items plus the 24 font combinations (P1-01).
    await vi.waitFor(
      () =>
        expect(fresh.manifest().items).toHaveLength(bundled.items.length + 24),
      { timeout: 10_000 },
    );
    const byId = new Map(fresh.manifest().items.map((item) => [item.id, item]));
    for (const item of bundled.items) expect(byId.get(item.id)).toEqual(item);
    expect(
      [...byId.keys()].filter((id) => id.startsWith('combo-')),
    ).toHaveLength(24);
    expect(fresh.manifest().templates).toEqual(bundled.templates);
  });

  it('[LIB-027][LIB-025] a catalog sound becomes a valid asset naming its full file, with its proxy and poster', async () => {
    const fresh = client(catalogFetch());
    await fresh.ready;
    const entry = fresh.entry('sound-ding')!;
    const asset = catalogAsset(entry);
    expect(assetSchema.safeParse(asset).success).toBe(true);
    expect(asset).toEqual(catalogAsset(entry)); // Same id every time.
    expect(asset.type).toBe('audio');
    expect(asset.source.reference).toBe(
      `media/${entry.media!.full.sha256.slice(0, 32)}`,
    );
    expect(asset.metadata.catalogProxy).toBe(
      `media/${entry.media!.proxy!.sha256.slice(0, 32)}`,
    );
    expect(asset.metadata.catalog).toEqual({
      id: 'sound-ding',
      itemVersion: entry.itemVersion,
    });
    // The proxy is local after prefetch; the full file only when asked.
    const media = new MemoryMediaStore();
    const net = catalogFetch();
    const warm = client(net, new MemoryCache(), {
      media: Promise.resolve(media),
    });
    await warm.ready;
    await warm.prefetch(warm.entry('sound-ding')!);
    expect(await media.has(String(asset.metadata.catalogProxy))).toBe(true);
    expect(await media.has(asset.source.reference)).toBe(false);
  });
});
