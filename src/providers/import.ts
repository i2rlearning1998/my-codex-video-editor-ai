import { assertActive, ProviderError } from './errors';
import { createNetwork, type Network } from './net';
import { download } from './shared';
import type { StockItem, LicenseMeta } from './types';
export interface ImportOptions {
  signal?: AbortSignal;
  maxBytes?: number;
  network?: Network;
  now?: () => Date;
}
export interface StockImport {
  blob: Blob;
  mime: string;
  name: string;
  licenseMeta: LicenseMeta;
}
export async function importStockItem(
  item: StockItem,
  quality: string,
  options: ImportOptions = {},
): Promise<StockImport> {
  assertActive(options.signal);
  const file = download(item, quality, item.providerId, options.signal),
    max = options.maxBytes ?? 200 * 1024 * 1024;
  if (!Number.isFinite(max) || max < 1) throw new ProviderError('SIZE_LIMIT');
  const network = options.network ?? createNetwork();
  const blob = await network.request(
    file.url,
    { download: true, ...(options.signal ? { signal: options.signal } : {}) },
    async (response, signal) => {
      const length = Number(response.headers.get('Content-Length'));
      if (length > max) {
        await response.body?.cancel();
        throw new ProviderError('SIZE_LIMIT');
      }
      if (!response.body) throw new ProviderError('BAD_RESPONSE');
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      const abort = () => {
        void reader.cancel().catch(() => undefined);
      };
      signal.addEventListener('abort', abort, { once: true });
      try {
        for (;;) {
          assertActive(signal);
          const result = await reader.read();
          if (result.done) break;
          size += result.value.byteLength;
          if (size > max) {
            await reader.cancel();
            throw new ProviderError('SIZE_LIMIT');
          }
          chunks.push(result.value);
        }
        assertActive(signal);
        if (!size) throw new ProviderError('BAD_RESPONSE');
        const mime = (response.headers.get('Content-Type') ?? file.mime)
          .split(';')[0]!
          .trim();
        if (!/^(image|video|audio)\//.test(mime))
          throw new ProviderError('BAD_RESPONSE');
        return new Blob(chunks, { type: mime });
      } finally {
        signal.removeEventListener('abort', abort);
        reader.releaseLock();
      }
    },
  );
  const extension: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'video/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
  };
  const name =
    (item.title
      .replace(/[^\p{L}\p{N} _-]/gu, '')
      .trim()
      .slice(0, 120) || `${item.providerId}-${item.id}`) +
    '.' +
    (extension[blob.type] ?? 'bin');
  return {
    blob,
    mime: blob.type,
    name,
    licenseMeta: {
      providerId: item.providerId,
      itemId: item.id,
      sourceUrl: item.sourceUrl,
      author: item.author,
      authorUrl: item.authorUrl,
      license: { ...item.license },
      attributionText: `${item.title} — ${item.author} (${item.providerId}), ${item.license.name}. ${item.sourceUrl}`,
      importedAt: (options.now ?? (() => new Date()))().toISOString(),
    },
  };
}
