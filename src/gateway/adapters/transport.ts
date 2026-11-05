// P2-R2 (P2B-05, P2B-07): the real HTTP transport, for the server only.
// Header values `secret:<NAME>` are read from the server's environment; a
// missing variable means "not connected". Keys never appear in an error,
// a log line or an answer. Retries 429 and 5xx with backoff; times out.
import {
  GatewayError,
  type BinaryBody,
  type HttpRequest,
  type Transport,
} from '../types';

export interface TransportOptions {
  /** The server's environment (process.env). */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Provider name for plain sentences. */
  readonly provider: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  /** Extra tries after the first, for 429 and 5xx (default 2). */
  readonly retries?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  /**
   * P3-WIRING (W6): an injected secret resolver, asked first (the key
   * vault); a name it does not answer falls back to `env`.
   */
  readonly resolveSecret?: (name: string) => string | undefined;
}

const SECRET = /^(.*?)secret:([A-Z][A-Z0-9_]*)(.*)$/;
/** Names of the secrets a request needs. */
export function secretNames(req: HttpRequest): string[] {
  return Object.values(req.headers)
    .map((v) => SECRET.exec(v)?.[2])
    .filter((x): x is string => !!x);
}
/** Whether every secret a provider needs is present (names only). */
export const hasSecret = (
  env: Readonly<Record<string, string | undefined>>,
  name: string,
) => typeof env[name] === 'string' && env[name]!.trim().length > 0;

export function fetchTransport(o: TransportOptions): Transport {
  const doFetch = o.fetch ?? fetch;
  const sleep =
    o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const retries = o.retries ?? 2;
  return async (req) => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      const m = SECRET.exec(v);
      if (!m) {
        headers[k] = v;
        continue;
      }
      const fromVault = o.resolveSecret?.(m[2]!);
      const value =
        typeof fromVault === 'string' && fromVault.trim()
          ? fromVault
          : hasSecret(o.env, m[2]!)
            ? o.env[m[2]!]!
            : null;
      if (value === null)
        throw new GatewayError(
          'not-connected',
          `${o.provider} is not connected yet.`,
          { provider: o.provider },
        );
      headers[k] = `${m[1]}${value.trim()}${m[3]}`;
    }
    for (let attempt = 0; ; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 60_000);
      let res: Response;
      try {
        res = await doFetch(req.url, {
          method: req.method,
          headers,
          ...(req.method === 'POST' ? { body: JSON.stringify(req.body) } : {}),
          signal: ctrl.signal,
        });
      } catch {
        clearTimeout(timer);
        if (attempt < retries && !ctrl.signal.aborted) {
          await sleep(250 * 2 ** attempt);
          continue;
        }
        throw ctrl.signal.aborted
          ? new GatewayError(
              'timeout',
              `${o.provider} took too long to answer.`,
            )
          : new GatewayError(
              'provider-error',
              `${o.provider} could not be reached.`,
            );
      }
      try {
        if (res.status === 401 || res.status === 403)
          throw new GatewayError(
            'not-connected',
            `${o.provider} is not connected: its key was refused.`,
            { provider: o.provider, status: res.status },
          );
        if (res.status === 429 || res.status >= 500) {
          if (attempt < retries) {
            const after = Number(res.headers.get('retry-after'));
            await sleep(
              Number.isFinite(after) && after > 0
                ? Math.min(after * 1000, 4000)
                : 250 * 2 ** attempt,
            );
            continue;
          }
          throw res.status === 429
            ? new GatewayError(
                'rate-limited',
                `${o.provider} is busy right now. Try again in a minute.`,
              )
            : new GatewayError(
                'provider-error',
                `${o.provider} had a problem (${res.status}).`,
              );
        }
        if (!res.ok)
          throw new GatewayError(
            'provider-error',
            `${o.provider} refused the request (${res.status}).`,
          );
        if (req.expect === 'binary') {
          const body: BinaryBody = {
            binary: new Uint8Array(await res.arrayBuffer()),
            contentType:
              res.headers.get('content-type') ?? 'application/octet-stream',
          };
          return body;
        }
        const text = await res.text();
        try {
          return JSON.parse(text) as unknown;
        } catch {
          throw new GatewayError(
            'bad-output',
            `${o.provider} sent an answer that could not be read.`,
          );
        }
      } catch (e) {
        if (e instanceof GatewayError) throw e;
        throw ctrl.signal.aborted
          ? new GatewayError(
              'timeout',
              `${o.provider} took too long to answer.`,
            )
          : new GatewayError('provider-error', `${o.provider} had a problem.`);
      } finally {
        clearTimeout(timer);
      }
    }
  };
}
