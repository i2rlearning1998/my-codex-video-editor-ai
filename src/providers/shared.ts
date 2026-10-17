import { z } from 'zod';
import { createSearchCache, type SearchCache } from './cache';
import { keyStore, type KeyStore } from './keys';
import {
  createNetwork,
  searchCacheKey,
  type Network,
  type RequestPolicy,
} from './net';
import { assertActive, ProviderError } from './errors';
import type {
  Provider,
  SearchOptions,
  SearchResult,
  StockFile,
  StockItem,
} from './types';
export const httpUrl = z
  .string()
  .url()
  .refine((value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  });
export const dimension = z.number().finite().nonnegative();
export interface ProviderDependencies {
  network?: Network;
  keys?: KeyStore;
  cache?: SearchCache;
}
const sharedNetwork = createNetwork(),
  sharedCache = createSearchCache();
export function download(
  item: StockItem,
  quality: string,
  providerId: string,
  signal?: AbortSignal,
): StockFile {
  assertActive(signal);
  if (item.providerId !== providerId) throw new ProviderError('BAD_RESPONSE');
  const file = item.files.find((file) => file.quality === quality);
  if (!file || !httpUrl.safeParse(file.url).success)
    throw new ProviderError('BAD_RESPONSE');
  return { ...file };
}
export function filterItems(
  items: StockItem[],
  options: SearchOptions,
): StockItem[] {
  return items.filter(
    (item) =>
      (options.minWidth === undefined || item.width >= options.minWidth) &&
      (options.minDuration === undefined ||
        item.durationSec >= options.minDuration) &&
      (options.maxDuration === undefined ||
        item.durationSec <= options.maxDuration) &&
      (!options.orientation ||
        (options.orientation === 'square'
          ? item.width === item.height
          : options.orientation === 'landscape'
            ? item.width > item.height
            : item.height > item.width)),
  );
}
interface Definition extends Omit<
  Provider,
  'search' | 'getDownload' | 'probe'
> {
  minPageSize?: number;
  maxPageSize?: number;
  ttlMs?: number;
  limits?: RequestPolicy['limits'];
  reset?: RequestPolicy['reset'];
  invalid400?: boolean;
  build(
    options: SearchOptions,
    key: string,
  ): { url: string; headers?: Record<string, string> };
  map(raw: unknown, options: SearchOptions): SearchResult;
}
export function stockProvider(
  def: Definition,
  deps: ProviderDependencies = {},
): Provider {
  const network = deps.network ?? sharedNetwork,
    keys = deps.keys ?? keyStore,
    cache = deps.cache ?? sharedCache;
  async function search(
    input: SearchOptions,
    bypass = false,
  ): Promise<SearchResult> {
    assertActive(input.signal);
    if (!def.kinds.includes(input.kind))
      throw new ProviderError('BAD_RESPONSE');
    if (
      !Number.isInteger(input.page ?? 1) ||
      (input.page ?? 1) < 1 ||
      !Number.isInteger(input.perPage ?? 20) ||
      (input.perPage ?? 20) < 1
    )
      throw new ProviderError('BAD_RESPONSE');
    for (const value of [input.minWidth, input.minDuration, input.maxDuration])
      if (value !== undefined && (!Number.isFinite(value) || value < 0))
        throw new ProviderError('BAD_RESPONSE');
    if (
      input.minDuration !== undefined &&
      input.maxDuration !== undefined &&
      input.minDuration > input.maxDuration
    )
      throw new ProviderError('BAD_RESPONSE');
    if (def.requiresKey && !keys.hasKeys(def))
      throw new ProviderError('KEY_MISSING');
    const key = keys.getKey(def.id, def.keyFields[0]?.id ?? 'apiKey');
    const options = {
      ...input,
      query: input.query.trim(),
      page: input.page ?? 1,
      perPage: Math.max(
        def.minPageSize ?? 1,
        Math.min(def.maxPageSize ?? 80, input.perPage ?? 20),
      ),
    };
    const cacheKey = searchCacheKey(def.id, options);
    let raw = bypass ? undefined : await cache.get(cacheKey);
    assertActive(input.signal);
    if (raw === undefined) {
      const request = def.build(options, key);
      raw = await network.json(request.url, {
        ...request,
        ...(input.signal ? { signal: input.signal } : {}),
        bucket: `${def.id}:${key}`,
        ...(def.limits ? { limits: def.limits } : {}),
        ...(def.reset ? { reset: def.reset } : {}),
        ...(def.invalid400 ? { invalid400: true } : {}),
      });
      try {
        def.map(raw, options);
      } catch {
        throw new ProviderError('BAD_RESPONSE');
      }
      if (!bypass) await cache.set(cacheKey, raw, def.ttlMs);
    }
    assertActive(input.signal);
    try {
      const result = def.map(raw, options);
      return { ...result, items: filterItems(result.items, options) };
    } catch {
      throw new ProviderError('BAD_RESPONSE');
    }
  }
  return {
    id: def.id,
    name: def.name,
    kinds: def.kinds,
    requiresKey: def.requiresKey,
    keyFields: def.keyFields,
    attribution: def.attribution,
    search: (options) => search(options),
    getDownload: async (item, quality, signal) =>
      download(item, quality, def.id, signal),
    probe: async (signal) => {
      await search(
        {
          kind: def.kinds[0]!,
          query: 'nature',
          page: 1,
          perPage: def.minPageSize ?? 1,
          ...(signal ? { signal } : {}),
        },
        true,
      );
    },
  };
}
export function pageResult(
  items: StockItem[],
  total: number,
  options: SearchOptions,
  hasNext?: boolean,
): SearchResult {
  const page = options.page ?? 1;
  return {
    items,
    total,
    nextPage:
      (hasNext ?? page * (options.perPage ?? 20) < total) ? page + 1 : null,
  };
}
export const apiKeyField = [
  { id: 'apiKey', label: 'API key', secret: true },
] as const;
export function scaled(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}
