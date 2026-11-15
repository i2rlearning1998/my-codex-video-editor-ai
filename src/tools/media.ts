// ROUND-C1 C1.1 and C1.3: searchMedia over the Platform Config's media
// providers. Providers are chosen by KIND, never by name in code: every
// enabled provider of the kind that the person's plan may use is asked in
// parallel, the answers are merged, duplicates removed (two providers with
// the same picture), and ranked deterministically. One provider failing
// never fails the rest: its failure is listed in the result in a plain
// sentence. A `rest` provider runs the descriptor runtime below (server
// side, behind the network guard); a `builtin` one runs the adapter the
// caller supplies (the editor's existing Pexels, Pixabay, Iconify,
// Freesound clients, or fixtures offline). DOM-free.
import type {
  MediaProvider,
  RestDescriptor,
} from '../platform-config/media-providers';
import { readNumber, readPath, readString } from './path';
import {
  safeFetch,
  ToolError,
  type HttpFetch,
  type Resolver,
} from './net-guard';

export type MediaType = 'image' | 'video' | 'audio';
export type Orientation = 'landscape' | 'portrait' | 'square';
export interface MediaItem {
  /** "<provider>:<item id>" (stable). */
  readonly key: string;
  readonly provider: string;
  readonly providerName: string;
  readonly id: string;
  readonly kind: string;
  readonly mediaType: MediaType;
  readonly title: string;
  readonly tags: readonly string[];
  readonly thumbnail: string;
  readonly preview: string;
  readonly download: string;
  readonly width: number;
  readonly height: number;
  /** Seconds (0 for pictures or when unknown). */
  readonly duration: number;
  readonly licence: string;
  readonly attribution: string;
}
export interface SearchMediaInput {
  readonly kind: string;
  readonly query: string;
  readonly orientation?: Orientation | undefined;
  readonly minDuration?: number | undefined;
  /** Only these provider ids (still only enabled ones of the kind). */
  readonly providers?: readonly string[] | undefined;
  readonly limit?: number | undefined;
  readonly page?: number | undefined;
}
export interface ProviderFailure {
  readonly provider: string;
  readonly name: string;
  readonly message: string;
}
export interface SearchMediaResult {
  readonly items: readonly MediaItem[];
  readonly failures: readonly ProviderFailure[];
  /** The providers asked, in config order. */
  readonly asked: readonly string[];
  /** Credits spent (successful calls of paid providers only). */
  readonly credits: number;
}
export interface AdapterCall {
  readonly provider: MediaProvider;
  readonly input: SearchMediaInput;
  readonly signal?: AbortSignal | undefined;
}
export type BuiltinAdapter = (
  call: AdapterCall,
) => Promise<readonly MediaItem[]>;
export type RestRunner = (
  call: AdapterCall & { readonly descriptor: RestDescriptor },
) => Promise<readonly MediaItem[]>;
export interface MediaRuntime {
  /** Built-in adapters by name; a missing one is reported, not thrown. */
  readonly builtin: Readonly<Record<string, BuiltinAdapter>>;
  /** Runs a REST descriptor (server) or fixtures (offline). */
  readonly rest: RestRunner;
}
export interface SearchMediaDeps {
  readonly providers: readonly MediaProvider[];
  /** The person's plan id (providers may be limited to plans). */
  readonly planId: string;
  readonly runtime: MediaRuntime;
  /** Credits the person may still spend (null: not counted here). */
  readonly available?: (() => number) | null | undefined;
  /** Records a paid call's credits (server ledger, or the mock ledger). */
  readonly spend?: ((providerId: string, credits: number) => void) | undefined;
  readonly limiter?: RateLimiter | undefined;
  readonly signal?: AbortSignal | undefined;
}

export const mediaTypeOf = (kind: string): MediaType =>
  kind === 'stock-video' || kind === 'video-gen'
    ? 'video'
    : kind === 'music' ||
        kind === 'sound-effect' ||
        kind === 'text-to-speech' ||
        kind === 'speech-to-text'
      ? 'audio'
      : 'image';

/** Providers of a kind the plan may use, in config order. */
export function providersFor(
  all: readonly MediaProvider[],
  kind: string,
  planId: string,
  only?: readonly string[],
): MediaProvider[] {
  return all.filter(
    (p) =>
      p.enabled &&
      p.kinds.includes(kind) &&
      (!p.plans.length || p.plans.includes(planId)) &&
      (!only?.length || only.includes(p.id)),
  );
}

/** A per-provider window of calls per minute (in memory). */
export class RateLimiter {
  #calls = new Map<string, number[]>();
  constructor(private readonly now: () => number = () => Date.now()) {}
  take(id: string, perMinute: number): boolean {
    const t = this.now();
    const list = (this.#calls.get(id) ?? []).filter((x) => t - x < 60_000);
    if (list.length >= perMinute) {
      this.#calls.set(id, list);
      return false;
    }
    list.push(t);
    this.#calls.set(id, list);
    return true;
  }
}

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1);
export const orientationOf = (w: number, h: number): Orientation | null =>
  w <= 0 || h <= 0
    ? null
    : Math.abs(w - h) <= Math.max(w, h) * 0.05
      ? 'square'
      : w > h
        ? 'landscape'
        : 'portrait';
/** Higher is better: query words, orientation, enough length. */
export function scoreItem(item: MediaItem, input: SearchMediaInput): number {
  const want = words(input.query);
  const have = new Set([...words(item.title), ...item.tags.flatMap(words)]);
  let score = want.filter((w) => have.has(w)).length * 10;
  if (
    input.orientation &&
    orientationOf(item.width, item.height) === input.orientation
  )
    score += 4;
  if (input.minDuration && item.duration >= input.minDuration) score += 3;
  return score;
}
/** The same file from two providers: same download path or same title and size. */
const fingerprints = (item: MediaItem): string[] => {
  const out: string[] = [];
  try {
    const u = new URL(item.download);
    out.push(`u:${u.hostname}${u.pathname}`);
  } catch {
    /* no url */
  }
  if (item.title && item.width && item.height)
    out.push(
      `t:${item.title.trim().toLowerCase()}:${item.width}x${item.height}`,
    );
  return out;
};
export function mergeItems(
  lists: readonly (readonly MediaItem[])[],
  input: SearchMediaInput,
): MediaItem[] {
  const seen = new Set<string>();
  const merged: { item: MediaItem; order: number }[] = [];
  lists.forEach((list, order) => {
    for (const item of list) {
      const keys = [`k:${item.key}`, ...fingerprints(item)];
      if (keys.some((k) => seen.has(k))) continue;
      for (const k of keys) seen.add(k);
      merged.push({ item, order });
    }
  });
  return merged
    .map((m) => ({ ...m, score: scoreItem(m.item, input) }))
    .sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : a.order !== b.order
          ? a.order - b.order
          : a.item.key < b.item.key
            ? -1
            : a.item.key > b.item.key
              ? 1
              : 0,
    )
    .map((m) => m.item);
}

/** Asks every enabled provider of the kind in parallel; never throws for one provider. */
export async function searchMedia(
  input: SearchMediaInput,
  deps: SearchMediaDeps,
): Promise<SearchMediaResult> {
  const query = input.query.trim().slice(0, 200);
  if (!query) throw new ToolError('invalid-input', 'Say what to look for.');
  const list = providersFor(
    deps.providers,
    input.kind,
    deps.planId,
    input.providers,
  );
  const failures: ProviderFailure[] = [];
  let credits = 0;
  let budget = deps.available ? deps.available() : Infinity;
  const calls = list.map(async (provider) => {
    const fail = (message: string) => {
      failures.push({ provider: provider.id, name: provider.name, message });
      return [] as MediaItem[];
    };
    if (provider.costPerCall > 0) {
      if (budget < provider.costPerCall)
        return fail(`${provider.name}: not enough credits for this search.`);
      budget -= provider.costPerCall; // held until the call settles
    }
    if (
      deps.limiter &&
      !deps.limiter.take(provider.id, provider.rateLimit.perMinute)
    ) {
      budget += provider.costPerCall;
      return fail(`${provider.name} is busy; try again in a minute.`);
    }
    try {
      const call: AdapterCall = {
        provider,
        input: { ...input, query },
        signal: deps.signal,
      };
      const got =
        provider.adapter.type === 'rest'
          ? await deps.runtime.rest({
              ...call,
              descriptor: provider.adapter.descriptor,
            })
          : await runBuiltin(deps.runtime, provider.adapter.name, call);
      if (provider.costPerCall > 0) {
        credits += provider.costPerCall;
        deps.spend?.(provider.id, provider.costPerCall);
      }
      return provider.licences.length
        ? got.filter((item) => provider.licences.includes(item.licence))
        : got;
    } catch (error) {
      budget += provider.costPerCall; // refunded: nothing is spent on a failure
      if (deps.signal?.aborted)
        throw new ToolError('cancelled', 'The search was cancelled.');
      return fail(`${provider.name}: ${plain(error)}`);
    }
  });
  const lists = await Promise.all(calls);
  const items = mergeItems(lists, input).slice(
    0,
    Math.max(1, Math.min(input.limit ?? 24, 100)),
  );
  return {
    items,
    failures: failures.sort((a, b) => (a.provider < b.provider ? -1 : 1)),
    asked: list.map((p) => p.id),
    credits,
  };
}
async function runBuiltin(
  runtime: MediaRuntime,
  name: string,
  call: AdapterCall,
): Promise<readonly MediaItem[]> {
  const adapter = runtime.builtin[name];
  if (!adapter)
    throw new ToolError(
      'not-available',
      'this provider is not available here.',
    );
  return adapter(call);
}
const plain = (error: unknown): string => {
  const m = error instanceof Error ? error.message : String(error);
  return m.endsWith('.') ? m : `${m}.`;
};

// --- the REST descriptor runtime (server side) ----------------------------
export interface RestRuntimeOptions {
  readonly fetch: HttpFetch;
  readonly resolve: Resolver;
  /** The key for a key-vault reference (server only); undefined when unset. */
  readonly key: (ref: string) => string | undefined;
}
const https = (value: string): string => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
};
/** Builds the request URL and headers of a search (exported for tests). */
export function restRequest(
  d: RestDescriptor,
  input: SearchMediaInput,
  key: string | undefined,
): { url: string; headers: Record<string, string> } {
  const url = new URL(d.searchPath, d.baseUrl);
  const q = d.request;
  const set = (name: string, value: string | number | undefined) => {
    if (name && value !== undefined && value !== '')
      url.searchParams.set(name, String(value));
  };
  for (const [k, v] of Object.entries(q.fixed)) set(k, v);
  set(q.query, input.query);
  if (input.orientation)
    set(q.orientation, q.orientationValues[input.orientation]);
  set(q.page, input.page ?? 1);
  set(q.limit, Math.min(input.limit ?? d.maxItems, d.maxItems));
  const headers: Record<string, string> = { accept: 'application/json' };
  if (d.auth.style !== 'none' && d.auth.keyRef) {
    if (!key)
      throw new ToolError('not-available', 'its key is not set on the server.');
    if (d.auth.style === 'query') set(d.auth.name || 'key', key);
    else
      headers[(d.auth.name || 'authorization').toLowerCase()] =
        `${d.auth.prefix}${key}`;
  }
  return { url: url.toString(), headers };
}
/** Maps a provider's JSON reply to items (exported for tests). */
export function restItems(
  json: unknown,
  d: RestDescriptor,
  provider: MediaProvider,
  kind: string,
): MediaItem[] {
  const r = d.response;
  if (!r) throw new ToolError('not-available', 'it does not search.');
  const raw = readPathArray(json, r.items);
  if (!raw)
    throw new ToolError(
      'bad-response',
      'it sent an answer in a shape it did not promise.',
    );
  const out: MediaItem[] = [];
  for (const entry of raw.slice(0, d.maxItems)) {
    const id = readString(entry, r.id, 120)
      .replace(/[^\w.-]/g, '')
      .slice(0, 80);
    const download = https(readString(entry, r.download, 2000));
    const thumbnail = https(readString(entry, r.thumbnail, 2000));
    if (!id || !download || (!thumbnail && kind !== 'web-search')) continue;
    out.push({
      key: `${provider.id}:${id}`,
      provider: provider.id,
      providerName: provider.name,
      id,
      kind,
      mediaType: mediaTypeOf(kind),
      title: readString(entry, r.title, 200),
      tags: readString(entry, r.tags, 400)
        .split(/[,;]\s*/)
        .filter(Boolean)
        .slice(0, 20),
      thumbnail,
      preview: https(readString(entry, r.preview, 2000)) || thumbnail,
      download,
      width: Math.round(readNumber(entry, r.width)),
      height: Math.round(readNumber(entry, r.height)),
      duration: readNumber(entry, r.duration),
      licence: readString(entry, r.licence, 60) || d.defaultLicence,
      attribution: readString(entry, r.attribution, 200) || provider.name,
    });
  }
  return out;
}
const readPathArray = (json: unknown, expr: string): unknown[] | null => {
  const got = readPath(json, expr);
  return Array.isArray(got) ? got : null;
};
/** The server's REST runner: guarded fetch, key from the vault, validated reply. */
export function restRunner(o: RestRuntimeOptions): RestRunner {
  return async ({ provider, input, descriptor: d, signal }) => {
    const host = new URL(d.baseUrl).hostname.toLowerCase();
    const req = restRequest(
      d,
      input,
      d.auth.keyRef ? o.key(d.auth.keyRef) : undefined,
    );
    const reply = await safeFetch(req.url, {
      fetch: o.fetch,
      resolve: o.resolve,
      hosts: [host],
      headers: req.headers,
      timeoutMs: d.timeoutMs,
      maxBytes: d.maxBytes,
      ...(signal ? { signal } : {}),
    });
    let json: unknown;
    try {
      json = JSON.parse(
        new TextDecoder('utf-8', { fatal: false }).decode(reply.bytes),
      );
    } catch {
      throw new ToolError(
        'bad-response',
        'it sent something that is not JSON.',
      );
    }
    return restItems(json, d, provider, input.kind);
  };
}
/** Offline: fixtures by provider id (the same flows without a gateway). */
export function fixtureRunner(
  fixtures: Readonly<
    Record<
      string,
      readonly Omit<
        MediaItem,
        'provider' | 'providerName' | 'key' | 'kind' | 'mediaType'
      >[]
    >
  >,
): RestRunner {
  return async ({ provider, input }) => {
    const list = fixtures[provider.id];
    if (!list)
      throw new ToolError(
        'not-available',
        'it works only when the server is connected.',
      );
    const want = words(input.query);
    return list
      .filter(
        (x) =>
          !want.length ||
          want.some((w) => words(`${x.title} ${x.tags.join(' ')}`).includes(w)),
      )
      .map((x) => ({
        ...x,
        key: `${provider.id}:${x.id}`,
        provider: provider.id,
        providerName: provider.name,
        kind: input.kind,
        mediaType: mediaTypeOf(input.kind),
      }));
  };
}
