// ROUND-C1 C1.1 and C1.4: the network guard for every fetch the tools make
// on the server. https only, the host fixed (a REST provider never leaves
// its own host), no private, local or reserved address (checked on the
// resolved addresses, and again after every redirect), a timeout, and a
// byte cap read while streaming. DOM-free: the server supplies `fetch` and
// a DNS resolver; tests supply fakes.

export class ToolError extends Error {
  constructor(
    readonly code:
      | 'blocked-url'
      | 'private-address'
      | 'too-large'
      | 'timeout'
      | 'http'
      | 'bad-response'
      | 'not-allowed'
      | 'rate-limit'
      | 'no-credits'
      | 'cancelled'
      | 'unknown-tool'
      | 'invalid-input'
      | 'not-available',
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

export type HttpFetch = (
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    redirect: 'manual';
    signal?: AbortSignal;
  },
) => Promise<Response>;
/** Resolves a host name to its addresses (IPv4 or IPv6 text). */
export type Resolver = (host: string) => Promise<readonly string[]>;

const v4 = (ip: string): number[] | null => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
};
/** Whether an address is private, local, link-local or reserved. */
export function isPrivateAddress(address: string): boolean {
  const ip = address
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  const four = v4(mapped ? mapped[1]! : ip);
  if (four) {
    const [a, b] = four as [number, number, number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && four[2] === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (!ip.includes(':')) return true; // not an address we understand
  if (ip === '::' || ip === '::1') return true;
  const head = ip.split(':')[0] ?? '';
  const first = parseInt(head || '0', 16);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link local
    (first & 0xff00) === 0xff00 || // multicast
    ip.startsWith('64:ff9b:') ||
    ip.startsWith('::ffff:') // mapped, not v4 text
  );
}
const IP_LITERAL = /^(\d+\.\d+\.\d+\.\d+|\[[0-9a-f:.]+\])$/i;
const LOCAL_NAMES = /(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/i;

export interface GuardOptions {
  /** Hosts this fetch may reach (exact, lower case); empty = any public host. */
  readonly hosts?: readonly string[];
  /** Domains refused (a domain blocks its sub-domains too). */
  readonly blocked?: readonly string[];
  readonly resolve: Resolver;
}
const underDomain = (host: string, domain: string) => {
  const d = domain
    .trim()
    .toLowerCase()
    .replace(/^\*?\.?/, '');
  return !!d && (host === d || host.endsWith(`.${d}`));
};
/** Throws a plain-sentence ToolError when `raw` may not be fetched. */
export async function checkUrl(raw: string, o: GuardOptions): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ToolError('blocked-url', 'That address is not a web address.');
  }
  if (url.protocol !== 'https:')
    throw new ToolError('blocked-url', 'Only https addresses can be fetched.');
  if (url.username || url.password)
    throw new ToolError('blocked-url', 'Addresses with a login are refused.');
  if (url.port && url.port !== '443')
    throw new ToolError(
      'blocked-url',
      'Only the normal https port is allowed.',
    );
  const host = url.hostname.toLowerCase();
  if (IP_LITERAL.test(host) || LOCAL_NAMES.test(host) || !host.includes('.'))
    throw new ToolError(
      'private-address',
      'That address points to a private or local machine.',
    );
  if (o.hosts?.length && !o.hosts.includes(host))
    throw new ToolError(
      'blocked-url',
      `The address leaves the provider's own host (${host}).`,
    );
  if (o.blocked?.some((d) => underDomain(host, d)))
    throw new ToolError('not-allowed', `The site ${host} is blocked.`);
  let addresses: readonly string[];
  try {
    addresses = await o.resolve(host);
  } catch {
    throw new ToolError('http', `The site ${host} could not be found.`);
  }
  if (!addresses.length || addresses.some(isPrivateAddress))
    throw new ToolError(
      'private-address',
      'That address points to a private or local machine.',
    );
  return url;
}

export interface SafeFetchOptions extends GuardOptions {
  readonly fetch: HttpFetch;
  readonly headers?: Record<string, string>;
  readonly timeoutMs: number;
  readonly maxBytes: number;
  readonly maxRedirects?: number;
  readonly signal?: AbortSignal;
}
export interface SafeReply {
  readonly url: string;
  readonly status: number;
  readonly contentType: string;
  readonly bytes: Uint8Array;
}
/** A guarded GET: every hop is checked; the body is cut at `maxBytes`. */
export async function safeFetch(
  raw: string,
  o: SafeFetchOptions,
): Promise<SafeReply> {
  const controller = new AbortController();
  const stopOuter = () => controller.abort();
  o.signal?.addEventListener('abort', stopOuter, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, o.timeoutMs);
  try {
    let current = raw;
    for (let hop = 0; hop <= (o.maxRedirects ?? 3); hop++) {
      const url = await checkUrl(current, o);
      let reply: Response;
      try {
        reply = await o.fetch(url.toString(), {
          method: 'GET',
          headers: o.headers ?? {},
          redirect: 'manual',
          signal: controller.signal,
        });
      } catch (error) {
        if (o.signal?.aborted)
          throw new ToolError('cancelled', 'The request was cancelled.');
        if (timedOut)
          throw new ToolError('timeout', 'The site took too long to answer.');
        throw new ToolError(
          'http',
          `The site could not be reached (${(error as Error).message}).`,
        );
      }
      if (reply.status >= 300 && reply.status < 400) {
        const next = reply.headers.get('location');
        if (!next)
          throw new ToolError(
            'bad-response',
            'The site sent a broken redirect.',
          );
        current = new URL(next, url).toString();
        continue;
      }
      if (!reply.ok)
        throw new ToolError(
          'http',
          `The site answered with an error (${reply.status}).`,
          reply.status,
        );
      const declared = Number(reply.headers.get('content-length') ?? 0);
      if (declared > o.maxBytes)
        throw new ToolError('too-large', 'The answer is too large.');
      const bytes = await readCapped(reply, o.maxBytes, () => timedOut);
      return {
        url: url.toString(),
        status: reply.status,
        contentType: reply.headers.get('content-type') ?? '',
        bytes,
      };
    }
    throw new ToolError('blocked-url', 'The site redirected too many times.');
  } finally {
    clearTimeout(timer);
    o.signal?.removeEventListener('abort', stopOuter);
  }
}
async function readCapped(
  reply: Response,
  max: number,
  timedOut: () => boolean,
): Promise<Uint8Array> {
  const reader = reply.body?.getReader();
  if (!reader) return new Uint8Array(await reply.arrayBuffer()).slice(0, max);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel().catch(() => undefined);
        throw new ToolError('too-large', 'The answer is too large.');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ToolError) throw error;
    if (timedOut())
      throw new ToolError('timeout', 'The site took too long to answer.');
    throw new ToolError('http', 'The answer was cut off.');
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}
