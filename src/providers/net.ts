import { assertActive, ProviderError } from './errors';
import type { SearchOptions } from './types';
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;
export interface RequestPolicy {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  bucket?: string;
  limits?: readonly { count: number; ms: number }[];
  invalid400?: boolean;
  reset?: 'seconds' | 'epoch';
  download?: boolean;
  /** FIX1 F2: this request's own time limit (downloads get minutes). */
  timeoutMs?: number;
}
/** FIX1 F4: an endpoint without its query (keys travel in queries). */
export const endpointOf = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch {
    return '';
  }
};
const offline = () =>
  typeof navigator !== 'undefined' && navigator.onLine === false;
export function retryAfter(
  value: string | null,
  now: number,
  fallback = 1000,
): number {
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return now + seconds * 1000;
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(now, date);
  }
  return now + fallback;
}
export function createNetwork(
  options: { fetch?: FetchLike; now?: () => number; timeoutMs?: number } = {},
) {
  const fetcher = options.fetch ?? ((url, init) => fetch(url, init)),
    now = options.now ?? Date.now;
  const budgets = new Map<
    string,
    { times: number[]; blocked: number; failures: number }
  >();
  /** Executes/consumes the body under the same timeout and abort scope. No automatic retries. */
  async function request<T>(
    url: string,
    policy: RequestPolicy,
    consume: (response: Response, signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    assertActive(policy.signal);
    const bucket = policy.bucket ?? new URL(url).origin;
    let budget = budgets.get(bucket);
    if (!budget) {
      budget = { times: [], blocked: 0, failures: 0 };
      budgets.set(bucket, budget);
    }
    const step = policy.download ? ('download' as const) : ('search' as const);
    const detail = (status?: number) => ({
      step,
      endpoint: endpointOf(url),
      ...(status === undefined ? {} : { status }),
    });
    if (budget.blocked > now())
      throw new ProviderError('RATE_LIMITED', budget.blocked);
    const limits = policy.limits ?? [];
    const longest = Math.max(0, ...limits.map((l) => l.ms));
    budget.times = budget.times.filter((t) => now() - t < longest);
    for (const limit of limits) {
      const times = budget.times.filter((t) => now() - t < limit.ms);
      if (times.length >= limit.count)
        throw new ProviderError('RATE_LIMITED', times[0]! + limit.ms);
    }
    if (limits.length) budget.times.push(now());
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    policy.signal?.addEventListener('abort', abort, { once: true });
    if (policy.signal?.aborted) abort();
    const timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      policy.timeoutMs ?? options.timeoutMs ?? 15000,
    );
    try {
      const work = (async () => {
        const response = await fetcher(url, {
          method: 'GET',
          headers: policy.headers ?? {},
          signal: controller.signal,
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          redirect: 'error',
        });
        if (response.type === 'opaque')
          throw new ProviderError('CORS_BLOCKED', undefined, detail());
        if (
          !policy.download &&
          (response.status === 401 ||
            response.status === 403 ||
            (policy.invalid400 && response.status === 400))
        )
          throw new ProviderError(
            'KEY_INVALID',
            undefined,
            detail(response.status),
          );
        if (response.status === 429) {
          budget.failures++;
          budget.blocked = Math.max(
            budget.blocked,
            retryAfter(
              response.headers.get('Retry-After'),
              now(),
              Math.min(60000, 1000 * 2 ** (budget.failures - 1)),
            ),
          );
          throw new ProviderError(
            'RATE_LIMITED',
            budget.blocked,
            detail(response.status),
          );
        }
        // FIX1 F2: any other error status is named with its number.
        if (!response.ok)
          throw new ProviderError('HTTP', undefined, detail(response.status));
        budget.failures = 0;
        const remaining = response.headers.get('X-Ratelimit-Remaining'),
          reset = response.headers.get('X-Ratelimit-Reset');
        if (
          remaining !== null &&
          Number(remaining) === 0 &&
          reset !== null &&
          Number.isFinite(Number(reset))
        )
          budget.blocked =
            policy.reset === 'seconds'
              ? now() + Number(reset) * 1000
              : Number(reset) * 1000;
        return await consume(response, controller.signal);
      })();
      return await new Promise<T>((resolve, reject) => {
        const cancelled = () =>
          reject(
            new ProviderError(
              timedOut ? 'TIMEOUT' : 'ABORTED',
              undefined,
              detail(),
            ),
          );
        controller.signal.addEventListener('abort', cancelled, { once: true });
        if (controller.signal.aborted) cancelled();
        void work
          .then(resolve, reject)
          .finally(() =>
            controller.signal.removeEventListener('abort', cancelled),
          );
      });
    } catch (error) {
      if (policy.signal?.aborted) throw new ProviderError('ABORTED');
      if (error instanceof ProviderError) {
        if (!error.step) {
          error.step = step;
          error.endpoint = endpointOf(url);
        }
        throw error;
      }
      // FIX1 F2: "No internet" only when the browser says it is offline; a
      // fetch that throws online is a blocked (cross-origin) or failed request.
      throw new ProviderError(
        offline()
          ? 'OFFLINE'
          : policy.download && error instanceof TypeError
            ? 'CORS_BLOCKED'
            : 'NETWORK',
        undefined,
        detail(),
      );
    } finally {
      clearTimeout(timer);
      policy.signal?.removeEventListener('abort', abort);
    }
  }
  const json = (url: string, policy: RequestPolicy = {}) =>
    request(url, policy, async (response) => {
      try {
        return (await response.json()) as unknown;
      } catch {
        throw new ProviderError('BAD_RESPONSE');
      }
    });
  return { request, json };
}
export type Network = ReturnType<typeof createNetwork>;
export function searchCacheKey(
  provider: string,
  options: SearchOptions,
): string {
  return JSON.stringify([
    provider,
    options.kind,
    options.query.trim(),
    options.page ?? 1,
    options.perPage ?? 20,
    options.orientation ?? null,
    options.category ?? null,
    options.color ?? null,
    options.minWidth ?? null,
    options.minDuration ?? null,
    options.maxDuration ?? null,
  ]);
}
