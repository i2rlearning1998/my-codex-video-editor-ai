// P3-WIRING (W4): images for vision models. The gateway passes a request to
// its adapter untouched, so an image list rides on the request and these
// wrappers turn the Anthropic, OpenAI (and OpenAI-shaped: xAI, compatible)
// and Gemini request bodies into their documented image inputs. Requests
// without images go to the original adapter unchanged. Proven against the
// local fake provider servers only; live behaviour is unproven.
import {
  GatewayError,
  type GatewayRequest,
  type HttpRequest,
  type ProviderAdapter,
  type Transport,
} from '../gateway/types';
import type { Provider } from '../platform-config';

export interface ImageInput {
  readonly mime: string;
  readonly base64: string;
}
export type VisionRequest = GatewayRequest & {
  readonly images?: readonly ImageInput[];
};
/** A request carrying images (sent only to a model with vision). */
export const visionRequest = (
  req: GatewayRequest,
  images: readonly ImageInput[],
): GatewayRequest => {
  if (!images.length) return req;
  const v: VisionRequest = { ...req, images };
  return v;
};
export const imagesOf = (req: GatewayRequest): readonly ImageInput[] =>
  (req as VisionRequest).images ?? [];

type Body = Record<string, unknown>;
type Msg = { role: string; content: unknown };
/** Adds the images to the last user message of a built request. */
export function withImages(
  kind: Provider['kind'],
  http: HttpRequest,
  images: readonly ImageInput[],
): HttpRequest {
  const body = structuredClone(http.body) as Body;
  if (kind === 'anthropic') {
    const msgs = body.messages as Msg[];
    const last = msgs.at(-1)!;
    last.content = [
      ...images.map((i) => ({
        type: 'image',
        source: { type: 'base64', media_type: i.mime, data: i.base64 },
      })),
      { type: 'text', text: String(last.content) },
    ];
  } else if (
    kind === 'openai' ||
    kind === 'xai' ||
    kind === 'openai-compatible'
  ) {
    const msgs = body.messages as Msg[];
    const last = msgs.at(-1)!;
    last.content = [
      { type: 'text', text: String(last.content) },
      ...images.map((i) => ({
        type: 'image_url',
        image_url: { url: `data:${i.mime};base64,${i.base64}` },
      })),
    ];
  } else if (kind === 'google') {
    const contents = body.contents as { parts: unknown[] }[];
    contents.at(-1)!.parts.push(
      ...images.map((i) => ({
        inlineData: { mimeType: i.mime, data: i.base64 },
      })),
    );
  } else
    throw new GatewayError('model-unknown', 'This model cannot read pictures.');
  return { ...http, body };
}

/** Wraps a text adapter so requests with images are sent with them. */
export function visionAdapter(
  base: ProviderAdapter,
  transportFor?: (provider: Provider) => Transport | undefined,
): ProviderAdapter {
  return {
    ...base,
    buildRequest: (req, ctx) => {
      const http = base.buildRequest(req, ctx);
      const images = imagesOf(req);
      return images.length ? withImages(base.kind, http, images) : http;
    },
    async call(req, ctx) {
      const images = imagesOf(req);
      if (!images.length) return base.call(req, ctx);
      if (!ctx.model.capabilities.vision)
        throw new GatewayError(
          'model-unknown',
          'This model cannot read pictures.',
        );
      const transport = transportFor?.(ctx.provider);
      if (!transport || !base.connected())
        throw new GatewayError(
          'not-connected',
          `${ctx.provider.name} is not connected.`,
        );
      let json: unknown;
      try {
        json = await transport(
          withImages(base.kind, base.buildRequest(req, ctx), images),
        );
      } catch (e) {
        if (e instanceof GatewayError) throw e;
        throw new GatewayError(
          'provider-error',
          'The model service had a problem.',
        );
      }
      return base.parseResponse(json, ctx);
    },
  };
}
/** The text adapters of a set, wrapped for vision (others unchanged). */
export function visionAdapters(
  adapters: Partial<Record<Provider['kind'], ProviderAdapter>>,
  transportFor: (provider: Provider) => Transport | undefined,
): Partial<Record<Provider['kind'], ProviderAdapter>> {
  const out = { ...adapters };
  for (const kind of [
    'anthropic',
    'openai',
    'google',
    'xai',
    'openai-compatible',
  ] as const) {
    const a = adapters[kind];
    if (a) out[kind] = visionAdapter(a, transportFor);
  }
  return out;
}
