// P2-R1 Part C: the model gateway. Pure TypeScript: no DOM, no storage API,
// no network unless a transport is given. The same code runs in the browser
// now (with the mock) and on a server later (with real keys as env variables).
import type { Model, Provider } from '../platform-config';

export interface ChatMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}
/** What a caller asks the gateway for. */
export interface GatewayRequest {
  readonly system?: string;
  readonly messages: readonly ChatMessage[];
  /** Ask for a JSON answer (text models). */
  readonly json?: boolean;
  readonly maxOutputTokens?: number;
  /** Media work: images, seconds or minutes, whichever the model is priced by. */
  readonly units?: number;
  /** Free-form input for media models (a prompt, a text to speak). */
  readonly prompt?: string;
}
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  images: number;
  seconds: number;
  minutes: number;
}
export interface AdapterResult {
  readonly text?: string;
  readonly media?: { kind: Model['kind']; url: string; units: number };
  readonly usage: Usage;
}
/** An HTTP request with secrets referenced by name, never inlined. */
export interface HttpRequest {
  readonly url: string;
  readonly method: 'POST';
  /** Values starting with `secret:` are resolved by the server transport. */
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}
/** Sends an HttpRequest and returns the parsed JSON body (server side only). */
export type Transport = (req: HttpRequest) => Promise<unknown>;

export interface AdapterContext {
  readonly model: Model;
  readonly provider: Provider;
  readonly signal?: AbortSignal;
}
export interface ProviderAdapter {
  readonly kind: Provider['kind'];
  /** Whether a call can be made now (a transport and key are present). */
  connected(): boolean;
  buildRequest(req: GatewayRequest, ctx: AdapterContext): HttpRequest;
  parseResponse(json: unknown, ctx: AdapterContext): AdapterResult;
  call(req: GatewayRequest, ctx: AdapterContext): Promise<AdapterResult>;
}

export const emptyUsage = (): Usage => ({
  inputTokens: 0,
  outputTokens: 0,
  images: 0,
  seconds: 0,
  minutes: 0,
});

/** A refusal or failure with a code the panel turns into a plain sentence. */
export class GatewayError extends Error {
  constructor(
    readonly code: GatewayErrorCode,
    message: string,
    readonly detail: Readonly<Record<string, string | number>> = {},
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}
export type GatewayErrorCode =
  | 'not-connected'
  | 'provider-error'
  | 'timeout'
  | 'rate-limited'
  | 'bad-output'
  | 'model-unknown'
  | 'model-disabled'
  | 'provider-off'
  | 'model-plan'
  | 'tool-unknown'
  | 'tool-disabled'
  | 'tool-plan'
  | 'tool-cap'
  | 'limit-exports'
  | 'limit-storage'
  | 'limit-voice-clones'
  | 'limit-projects'
  | 'budget-video'
  | 'budget-day'
  | 'rate-limit'
  | 'shortage';
