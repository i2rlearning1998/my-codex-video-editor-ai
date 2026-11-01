// Shared parts of the real provider adapters. They are built and parsed on
// recorded fixture JSON only in this round (models stay `tested: false`):
// without a server transport every call says "not connected".
import {
  GatewayError,
  type AdapterContext,
  type AdapterResult,
  type GatewayRequest,
  type HttpRequest,
  type ProviderAdapter,
  type Transport,
} from '../types';

export interface HttpAdapterSpec {
  readonly kind: ProviderAdapter['kind'];
  readonly defaultBase: string;
  build(req: GatewayRequest, ctx: AdapterContext, base: string): HttpRequest;
  parse(json: unknown, ctx: AdapterContext): AdapterResult;
}
export const secret = (name: string) => `secret:${name}`;

export function httpAdapter(
  spec: HttpAdapterSpec,
  transport?: Transport,
): ProviderAdapter {
  return {
    kind: spec.kind,
    connected: () => !!transport,
    buildRequest: (req, ctx) =>
      spec.build(
        req,
        ctx,
        (ctx.provider.baseUrl ?? spec.defaultBase).replace(/\/$/, ''),
      ),
    parseResponse: (json, ctx) => spec.parse(json, ctx),
    async call(req, ctx) {
      if (!transport)
        throw new GatewayError(
          'not-connected',
          `${ctx.provider.name} is not connected. The server needs ${ctx.provider.keyRef}.`,
          { provider: ctx.provider.name, keyRef: ctx.provider.keyRef },
        );
      let json: unknown;
      try {
        json = await transport(
          spec.build(
            req,
            ctx,
            (ctx.provider.baseUrl ?? spec.defaultBase).replace(/\/$/, ''),
          ),
        );
      } catch (e) {
        if (e instanceof GatewayError) throw e;
        throw new GatewayError(
          'provider-error',
          'The model service had a problem.',
        );
      }
      return spec.parse(json, ctx);
    },
  };
}

export function bad(what: string): never {
  throw new GatewayError(
    'bad-output',
    `The model answer could not be read (${what}).`,
  );
}
export const num = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;
