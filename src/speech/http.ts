import {
  createNetwork,
  type FetchLike,
  ProviderError,
  assertActive,
} from '../providers';
import { keyStore, type KeyStore } from '../providers/keys';
import { browserCodec } from './pcm';
import type { AudioCodec } from './types';
export interface PaidDependencies {
  fetch?: FetchLike;
  keys?: KeyStore;
  codec?: AudioCodec;
  now?: () => number;
}
/** Adapt C1's GET transport at the injected fetch boundary; no core/provider edits. */
export function speechHttp(deps: PaidDependencies = {}) {
  const keys = deps.keys ?? keyStore,
    now = deps.now ?? Date.now;
  let blocked = 0;
  return {
    codec: deps.codec ?? browserCodec,
    key(id: string, field = 'apiKey') {
      const value = keys.getKey(id, field);
      if (!value) throw new ProviderError('KEY_MISSING');
      return value;
    },
    async request<T>(
      url: string,
      init: RequestInit,
      consume: (r: Response) => Promise<T>,
      signal?: AbortSignal,
    ): Promise<T> {
      assertActive(signal);
      if (blocked > now()) throw new ProviderError('RATE_LIMITED', blocked);
      const net = createNetwork({
        now,
        timeoutMs: 120000,
        fetch: (url, transport) => {
          const request = {
            ...transport,
            ...init,
            signal: transport?.signal ?? null,
          };
          return (deps.fetch ?? ((u, o) => fetch(u, o)))(url, request);
        },
      });
      try {
        return await net.request(
          url,
          signal ? { signal } : {},
          async (response) => {
            try {
              return await consume(response);
            } catch (error) {
              if (error instanceof SyntaxError)
                throw new ProviderError('BAD_RESPONSE');
              throw error;
            }
          },
        );
      } catch (error) {
        if (error instanceof ProviderError && error.code === 'RATE_LIMITED')
          blocked = error.retryAt ?? now() + 1000;
        throw error;
      }
    },
  };
}
