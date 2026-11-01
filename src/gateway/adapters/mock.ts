// A deterministic offline provider. It answers from a handler (the mock
// planner, a studio) or an echo, counts tokens as characters / 4, and can be
// told to fail in each way a real provider fails.
import {
  GatewayError,
  emptyUsage,
  type AdapterContext,
  type AdapterResult,
  type GatewayRequest,
  type HttpRequest,
  type ProviderAdapter,
} from '../types';

export type MockFailure =
  'none' | 'error' | 'timeout' | 'rate-limit' | 'bad-json';
export interface MockOptions {
  /** Simulated latency in ms (0 answers on the next microtask). */
  readonly latencyMs?: number;
  /** Fail every call this way, or decide per call. */
  readonly failure?: MockFailure | ((req: GatewayRequest) => MockFailure);
  /** Produce the text of a text model's answer. */
  readonly respond?: (req: GatewayRequest, ctx: AdapterContext) => string;
  readonly sleep?: (ms: number) => Promise<void>;
}

export const tokens = (s: string): number => Math.ceil(s.length / 4);
/** FNV-1a, so every mock answer is stable for the same input. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mockAdapter(opts: MockOptions = {}): ProviderAdapter {
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const self: ProviderAdapter = {
    kind: 'mock',
    connected: () => true,
    buildRequest(req, ctx): HttpRequest {
      return {
        url: `mock://${ctx.model.providerModel}`,
        method: 'POST',
        headers: {},
        body: req,
      };
    },
    parseResponse(json, ctx): AdapterResult {
      const r = json as { text?: string; units?: number; input?: string };
      const usage = emptyUsage();
      const m = ctx.model;
      if (m.kind === 'text') {
        usage.inputTokens = tokens(r.input ?? '');
        usage.outputTokens = tokens(r.text ?? '');
        return { text: r.text ?? '', usage };
      }
      const units = r.units ?? 1;
      if (m.price.perImage) usage.images = units;
      else if (m.price.perSecond) usage.seconds = units;
      else usage.minutes = units;
      return {
        media: {
          kind: m.kind,
          url: `mock://${m.id}/${hash(r.input ?? '').toString(16)}`,
          units,
        },
        usage,
      };
    },
    async call(req, ctx) {
      const f =
        typeof opts.failure === 'function'
          ? opts.failure(req)
          : (opts.failure ?? 'none');
      if (opts.latencyMs) await sleep(opts.latencyMs);
      else await Promise.resolve();
      if (ctx.signal?.aborted)
        throw new GatewayError('timeout', 'The request was cancelled.');
      if (f === 'error')
        throw new GatewayError(
          'provider-error',
          'The model service had a problem.',
        );
      if (f === 'timeout')
        throw new GatewayError('timeout', 'The model took too long to answer.');
      if (f === 'rate-limit')
        throw new GatewayError(
          'rate-limited',
          'The model service is busy right now.',
        );
      const input = [
        req.system ?? '',
        ...req.messages.map((m) => m.content),
        req.prompt ?? '',
      ].join('\n');
      const text =
        f === 'bad-json'
          ? '{"this is": not json'
          : opts.respond
            ? opts.respond(req, ctx)
            : `mock:${hash(input).toString(16)}`;
      return self.parseResponse({ text, input, units: req.units ?? 1 }, ctx);
    },
  };
  return self;
}
