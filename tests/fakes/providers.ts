// P2-R2 (P2B-06): local fake provider servers that speak each provider's
// documented HTTP shape (Anthropic Messages, OpenAI Chat Completions and
// Images, Gemini generateContent, xAI, ElevenLabs text to speech, a generic
// video job). Used over real localhost HTTP by the adapter, server and e2e
// tests. They check the auth header against the fake key and can be told to
// fail like a real service: 401, 429 (once or always), 5xx, malformed JSON,
// slow, truncated output.
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

export type FakeMode =
  | 'ok'
  | '401'
  | '429-once'
  | '429'
  | '500'
  | 'malformed'
  | 'slow'
  | 'truncated';
export interface FakeProviders {
  readonly url: string;
  readonly key: string;
  /** Set how the next requests behave (per provider, or all). */
  mode(m: FakeMode, provider?: string): void;
  /** What text models answer (default: echo). */
  respond(
    fn: (provider: string, body: Record<string, unknown>) => string,
  ): void;
  /** Requests seen (path and provider; never the key). */
  readonly seen: { provider: string; path: string }[];
  close(): Promise<void>;
}

const read = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return (text ? JSON.parse(text) : {}) as Record<string, unknown>;
  } catch {
    return {};
  }
};
const lastUser = (b: Record<string, unknown>): string => {
  const msgs = (b.messages ?? (b.contents as unknown[])) as
    { content?: unknown; parts?: { text?: string }[] }[] | undefined;
  const m = msgs?.at(-1);
  return typeof m?.content === 'string'
    ? m.content
    : (m?.parts?.[0]?.text ?? String(b.prompt ?? b.text ?? ''));
};

export async function startFakeProviders(
  key = 'fake-key-0123456789abcdef',
): Promise<FakeProviders> {
  const modes = new Map<string, FakeMode>();
  const once = new Set<string>();
  let respond = (_p: string, body: Record<string, unknown>) =>
    `echo: ${lastUser(body)}`;
  const seen: { provider: string; path: string }[] = [];
  const jobs = new Map<string, number>();

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';
    const body = await read(req);
    const provider = url.startsWith('/anthropic')
      ? 'anthropic'
      : url.startsWith('/openai')
        ? 'openai'
        : url.startsWith('/google')
          ? 'google'
          : url.startsWith('/xai')
            ? 'xai'
            : url.startsWith('/eleven')
              ? 'elevenlabs'
              : url.startsWith('/video')
                ? 'video'
                : 'other';
    seen.push({ provider, path: url.replace(/^\/[a-z]+/, '') });
    const json = (status: number, v: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(typeof v === 'string' ? v : JSON.stringify(v));
    };
    const h = req.headers;
    const given =
      provider === 'anthropic'
        ? h['x-api-key']
        : provider === 'google'
          ? h['x-goog-api-key']
          : provider === 'elevenlabs'
            ? h['xi-api-key']
            : String(h.authorization ?? '').replace(/^Bearer /, '');
    const mode = modes.get(provider) ?? modes.get('*') ?? 'ok';
    if (mode === '401' || given !== key)
      return json(401, {
        error: { type: 'authentication_error', message: 'invalid x-api-key' },
      });
    if (mode === '429' || (mode === '429-once' && !once.has(provider))) {
      once.add(provider);
      res.setHeader('retry-after', '0');
      return json(429, { error: { message: 'rate limited' } });
    }
    if (mode === '500') return json(500, { error: { message: 'overloaded' } });
    if (mode === 'malformed') return json(200, '{"choices": [ {"message": ');
    if (mode === 'slow') await new Promise((r) => setTimeout(r, 3000));
    const truncated = mode === 'truncated';
    const text = respond(provider, body);
    const inTok = Math.ceil(JSON.stringify(body).length / 4);
    const outTok = Math.ceil(text.length / 4);
    if (provider === 'anthropic' && url.endsWith('/v1/messages')) {
      if (h['anthropic-version'] !== '2023-06-01')
        return json(400, {
          error: { message: 'anthropic-version header required' },
        });
      return json(200, {
        id: 'msg_fake',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [{ type: 'text', text }],
        stop_reason: truncated ? 'max_tokens' : 'end_turn',
        usage: { input_tokens: inTok, output_tokens: outTok },
      });
    }
    if (
      (provider === 'openai' || provider === 'xai') &&
      url.endsWith('/v1/chat/completions')
    )
      return json(200, {
        id: 'chatcmpl-fake',
        object: 'chat.completion',
        model: body.model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: text },
            finish_reason: truncated ? 'length' : 'stop',
          },
        ],
        usage: { prompt_tokens: inTok, completion_tokens: outTok },
      });
    if (provider === 'openai' && url.endsWith('/v1/images/generations')) {
      // A 1 x 1 PNG.
      const png =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      return json(200, {
        created: 1,
        data: Array.from({ length: Number(body.n ?? 1) }, () => ({
          b64_json: png,
        })),
      });
    }
    if (provider === 'google' && url.includes(':generateContent'))
      return json(200, {
        candidates: [
          {
            content: { role: 'model', parts: [{ text }] },
            finishReason: truncated ? 'MAX_TOKENS' : 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: inTok,
          candidatesTokenCount: outTok,
        },
      });
    if (provider === 'elevenlabs' && url.includes('/v1/text-to-speech/')) {
      res.writeHead(200, { 'content-type': 'audio/mpeg' });
      return res.end(Buffer.from([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4]));
    }
    if (
      provider === 'video' &&
      req.method === 'POST' &&
      url.endsWith('/v1/jobs')
    ) {
      const id = `job${jobs.size + 1}`;
      jobs.set(id, 0);
      return json(200, { id, status: 'queued' });
    }
    const jm = /\/v1\/jobs\/([a-z0-9]+)$/.exec(url);
    if (provider === 'video' && jm && jobs.has(jm[1]!)) {
      const polls = jobs.get(jm[1]!)! + 1;
      jobs.set(jm[1]!, polls);
      return json(
        200,
        polls < 2
          ? { id: jm[1], status: 'running' }
          : {
              id: jm[1],
              status: 'succeeded',
              output_url: `${base}/files/${jm[1]}.mp4`,
              seconds: 5,
            },
      );
    }
    return json(404, { error: { message: 'not found' } });
  };
  const server: Server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address() as { port: number };
  const base = `http://127.0.0.1:${addr.port}`;
  return {
    url: base,
    key,
    mode: (m, p = '*') => {
      modes.set(p, m);
      if (m === '429-once') once.delete(p === '*' ? '' : p);
      if (p === '*') once.clear();
    },
    respond: (fn) => void (respond = fn),
    seen,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

/** The base URL each provider uses on the fake server. */
export const fakeBase = (url: string) => ({
  anthropic: `${url}/anthropic`,
  openai: `${url}/openai`,
  google: `${url}/google`,
  xai: `${url}/xai`,
  'openai-compatible': `${url}/openai`,
  elevenlabs: `${url}/eleven`,
  'video-jobs': `${url}/video`,
});
