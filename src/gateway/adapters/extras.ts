// P3-WIRING (W4, W5; CONTRACTS-P3 rev 1.3 note 2): additive request extras
// for the real adapters. A caller may put `images` (vision input) and
// `params` (a Studio form's provider parameters) on a GatewayRequest; the
// gateway passes the request to its adapter untouched, and `httpAdapter`
// adds them to the built body in each provider's documented shape. A
// request without extras is built exactly as before. Proven against the
// local fake provider servers only.
import { GatewayError, type GatewayRequest, type HttpRequest } from '../types';
import type { Provider } from '../../platform-config';

export interface ImageInput {
  readonly mime: string;
  readonly base64: string;
}
export type RequestWithExtras = GatewayRequest & {
  readonly images?: readonly ImageInput[];
  readonly params?: Readonly<Record<string, string | number | boolean>>;
};
/** A request carrying images (sent only to a model with vision). */
export function visionRequest(
  req: GatewayRequest,
  images: readonly ImageInput[],
): GatewayRequest {
  if (!images.length) return req;
  const v: RequestWithExtras = { ...req, images };
  return v;
}
/** A request carrying a Studio form's provider parameters. */
export function paramsRequest(
  req: GatewayRequest,
  params: Readonly<Record<string, string | number | boolean>>,
): GatewayRequest {
  if (!Object.keys(params).length) return req;
  const v: RequestWithExtras = { ...req, params };
  return v;
}
export const imagesOf = (req: GatewayRequest): readonly ImageInput[] =>
  (req as RequestWithExtras).images ?? [];
export const paramsOf = (
  req: GatewayRequest,
): Readonly<Record<string, string | number | boolean>> =>
  (req as RequestWithExtras).params ?? {};

/** Keys a form parameter may never replace in a request body. */
const RESERVED = new Set([
  'model',
  'messages',
  'contents',
  'system',
  'systemInstruction',
  'prompt',
  'text',
]);
/** Merges form parameters into a JSON request body (reserved keys kept). */
export function withParams(
  http: HttpRequest,
  params: Readonly<Record<string, string | number | boolean>>,
): HttpRequest {
  const keys = Object.keys(params).filter((k) => !RESERVED.has(k));
  if (!keys.length || !http.body || typeof http.body !== 'object') return http;
  const body = { ...(http.body as Record<string, unknown>) };
  for (const k of keys) body[k] = params[k];
  return { ...http, body };
}

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

/** Adds a request's extras to its built HTTP request (images need vision). */
export function withExtras(
  kind: Provider['kind'],
  req: GatewayRequest,
  ctx: {
    readonly model: { readonly capabilities: { readonly vision: boolean } };
  },
  http: HttpRequest,
): HttpRequest {
  const images = imagesOf(req);
  if (images.length && !ctx.model.capabilities.vision)
    throw new GatewayError('model-unknown', 'This model cannot read pictures.');
  return withParams(
    images.length ? withImages(kind, http, images) : http,
    paramsOf(req),
  );
}
