// P2-R2 (P2B-05, P2B-07): the server's provider adapters. Each call makes a
// real HTTP transport for its provider; the key is read from the server's
// environment by NAME (provider.keyRef) and never leaves the server.
import {
  anthropicAdapter,
  elevenlabsAdapter,
  fetchTransport,
  googleAdapter,
  hasSecret,
  mockAdapter,
  mockRespond,
  openaiAdapter,
  openaiCompatibleAdapter,
  openaiImageAdapter,
  videoJobsAdapter,
  xaiAdapter,
  type ProviderAdapter,
  type Transport,
} from '../src/gateway';
import type { Provider } from '../src/platform-config';

export type Env = Readonly<Record<string, string | undefined>>;
export interface AdapterOptions {
  readonly env: Env;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly retries?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly pollMs?: number;
}

/** Whether a provider can be called now (names only: never the value). */
export function providerConnected(p: Provider, env: Env): boolean {
  if (!p.enabled) return false;
  if (p.kind === 'mock') return true;
  if (p.kind === 'video-jobs' && !p.baseUrl) return false;
  return hasSecret(env, p.keyRef);
}

/** One adapter per provider kind; each call gets a transport for its provider. */
export function serverAdapters(
  o: AdapterOptions,
): Partial<Record<Provider['kind'], ProviderAdapter>> {
  const transportFor = (name: string): Transport =>
    fetchTransport({
      env: o.env,
      provider: name,
      ...(o.fetch ? { fetch: o.fetch } : {}),
      ...(o.timeoutMs ? { timeoutMs: o.timeoutMs } : {}),
      ...(o.retries !== undefined ? { retries: o.retries } : {}),
      ...(o.sleep ? { sleep: o.sleep } : {}),
    });
  const wrap = (
    kind: Provider['kind'],
    make: (t: Transport, modelKind: string) => ProviderAdapter,
  ): ProviderAdapter => {
    return {
      kind,
      connected: () => true,
      buildRequest: (req, ctx) =>
        make(transportFor(ctx.provider.name), ctx.model.kind).buildRequest(
          req,
          ctx,
        ),
      parseResponse: (json, ctx) =>
        make(transportFor(ctx.provider.name), ctx.model.kind).parseResponse(
          json,
          ctx,
        ),
      call: (req, ctx) =>
        make(transportFor(ctx.provider.name), ctx.model.kind).call(req, ctx),
    };
  };
  return {
    mock: mockAdapter({ respond: mockRespond }),
    anthropic: wrap('anthropic', (t) => anthropicAdapter(t)),
    openai: wrap('openai', (t, kind) =>
      kind === 'image' ? openaiImageAdapter(t) : openaiAdapter(t),
    ),
    google: wrap('google', (t) => googleAdapter(t)),
    xai: wrap('xai', (t) => xaiAdapter(t)),
    'openai-compatible': wrap('openai-compatible', (t, kind) =>
      kind === 'image' ? openaiImageAdapter(t) : openaiCompatibleAdapter(t),
    ),
    elevenlabs: wrap('elevenlabs', (t) => elevenlabsAdapter(t)),
    'video-jobs': wrap('video-jobs', (t) =>
      videoJobsAdapter(t, {
        ...(o.pollMs !== undefined ? { pollMs: o.pollMs } : {}),
        ...(o.sleep ? { sleep: o.sleep } : {}),
      }),
    ),
  };
}
