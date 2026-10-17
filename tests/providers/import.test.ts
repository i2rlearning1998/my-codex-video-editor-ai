import { describe, it, expect, vi } from 'vitest';
import {
  createPixabay,
  importStockItem,
  createNetwork,
  attachStockLicense,
} from '../../src/providers';
import { assetSchema } from '../../src/core/model';
import { setup } from './helpers';
const sample = async () => {
  const deps = setup('pixabay-images');
  return (await createPixabay(deps).search({ kind: 'stock-image', query: 'x' }))
    .items[0]!;
};
describe('stock import', () => {
  it('returns file bytes and licence record accepted inside existing media metadata', async () => {
    const item = await sample(),
      fetch = vi.fn(
        async () =>
          new Response(new Uint8Array([1, 2, 3]), {
            headers: { 'Content-Type': 'image/jpeg' },
          }),
      );
    const result = await importStockItem(item, 'large', {
      network: createNetwork({ fetch }),
      now: () => new Date('2026-01-01T00:00:00Z'),
    });
    expect(result.blob.size).toBe(3);
    expect(result.licenseMeta).toMatchObject({
      providerId: 'pixabay',
      itemId: '42',
      importedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(fetch.mock.calls).toHaveLength(1);
    const asset = attachStockLicense(
      {
        id: 'asset-1',
        name: result.name,
        type: 'image',
        source: { kind: 'local', reference: 'media/example' },
        metadata: { mimeType: result.mime },
      },
      result.licenseMeta,
    );
    expect(assetSchema.parse(asset).metadata.stockLicense).toEqual(
      result.licenseMeta,
    );
  });
  it('enforces both declared and streamed size and cancels oversized streams', async () => {
    const item = await sample();
    const declared = createNetwork({
      fetch: async () =>
        new Response('123', {
          headers: { 'Content-Length': '999', 'Content-Type': 'image/jpeg' },
        }),
    });
    await expect(
      importStockItem(item, 'large', { network: declared, maxBytes: 2 }),
    ).rejects.toMatchObject({ code: 'SIZE_LIMIT' });
    const cancel = vi.fn();
    const streamed = createNetwork({
      fetch: async () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new Uint8Array(3));
            },
            cancel,
          }),
          { headers: { 'Content-Type': 'image/jpeg' } },
        ),
    });
    await expect(
      importStockItem(item, 'large', { network: streamed, maxBytes: 2 }),
    ).rejects.toMatchObject({ code: 'SIZE_LIMIT' });
    expect(cancel).toHaveBeenCalled();
  });
  it('rejects pre-aborted and in-flight requests, preserving no partial import', async () => {
    const item = await sample(),
      c = new AbortController();
    c.abort();
    const fetch = vi.fn(async () => new Response('data'));
    await expect(
      importStockItem(item, 'large', {
        signal: c.signal,
        network: createNetwork({ fetch }),
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
    expect(fetch).not.toHaveBeenCalled();
    const c2 = new AbortController(),
      network = createNetwork({
        fetch: async () => {
          c2.abort();
          return new Response('data');
        },
      });
    await expect(
      importStockItem(item, 'large', { network, signal: c2.signal }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });
  it('reports unreadable cross-origin CDN as typed CORS_BLOCKED without URL/key text', async () => {
    const item = await sample(),
      network = createNetwork({
        fetch: async () => {
          throw new TypeError('secret-url-and-key');
        },
      });
    await expect(
      importStockItem(item, 'large', { network }),
    ).rejects.toMatchObject({ code: 'CORS_BLOCKED' });
    try {
      await importStockItem(item, 'large', { network });
    } catch (error) {
      expect(String(error)).not.toContain('secret-url');
    }
  });
});
