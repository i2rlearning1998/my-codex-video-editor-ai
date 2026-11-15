// ROUND-C1 C1.3: media for a v4 plan, found by KIND through the Platform
// Config's provider registry (src/tools searchMedia). Built-in providers
// use the editor's own clients (the person's keys from Settings, as the
// Stock panels do); REST providers the owner adds run on the gateway when
// one is set (keys and fetching stay on the server), and from test fixtures
// on a DEV or e2e page without one. Loaded lazily, only for a v4 build.
import type { Asset } from '../core';
import {
  hasKeys,
  importStockItem,
  type LicenseMeta,
  type StockItem,
  type StockKind,
} from '../providers';
import type { PlatformConfig } from '../platform-config/schema';
import {
  searchMedia,
  fixtureRunner,
  mediaTypeOf,
  type MediaItem,
  type MediaRuntime,
  type RestRunner,
} from '../tools/media';
import { ToolError } from '../tools/net-guard';
import {
  speak,
  speechFixtureRunner,
  speechProvider,
  transcribe,
  type SpeakResult,
  type SpeechKind,
  type SpeechRunner,
  type TranscribeResult,
} from '../tools/speech';
import type { MediaCandidate, ResolveServices } from '../video-plan/resolve';
import { stockProvider } from './services';
import { stockQuality } from './stock-panel';

export interface RegistryMediaOptions {
  readonly config: PlatformConfig;
  readonly planId: string;
  readonly videoId: string;
  /** The gateway's tool call (server), when a gateway is set. */
  readonly tools?:
    | ((tool: string, input: unknown, videoId: string) => Promise<unknown>)
    | undefined;
  /** Credits the person may spend, and the record of a spend (offline ledger). */
  readonly available?: (() => number) | undefined;
  readonly spend?: ((source: string, credits: number) => void) | undefined;
}
/** The plan's media type as a registry kind. */
export const KIND_OF: Readonly<Record<string, string>> = {
  photo: 'stock-photo',
  video: 'stock-video',
  icon: 'icon',
  emoji: 'sticker',
  sticker: 'sticker',
  audio: 'music',
  sfx: 'sound-effect',
};
const PROVIDER_KIND: Readonly<Record<string, StockKind>> = {
  'stock-photo': 'stock-image',
  'stock-video': 'stock-video',
  icon: 'icon',
  sticker: 'sticker',
  music: 'stock-audio',
  'sound-effect': 'stock-audio',
};
/** DEV and e2e pages only: fixtures for REST providers without a gateway. */
const e2eFixtures = (): Record<string, MediaItem[]> | null =>
  (import.meta.env.DEV || import.meta.env.MODE === 'e2e') &&
  typeof window !== 'undefined'
    ? ((window as { __AIVE_E2E_MEDIA__?: Record<string, MediaItem[]> })
        .__AIVE_E2E_MEDIA__ ?? null)
    : null;

export function registryMedia(o: RegistryMediaOptions) {
  const stockItems = new Map<string, StockItem>();
  const restItems = new Map<string, MediaItem>();
  const builtin: MediaRuntime['builtin'] = Object.fromEntries(
    ['pexels', 'pixabay', 'iconify', 'freesound'].map((name) => [
      name,
      async ({ provider, input, signal }) => {
        const client = stockProvider(name);
        const kind = PROVIDER_KIND[input.kind];
        if (!client || !kind || !client.kinds.includes(kind))
          throw new ToolError(
            'not-available',
            'it cannot search for this kind here.',
          );
        if (!hasKeys(client))
          throw new ToolError(
            'not-available',
            'its key is not saved in Settings.',
          );
        const found = await client.search({
          kind,
          query: input.query,
          perPage: 12,
          ...(input.orientation &&
          (kind === 'stock-image' || kind === 'stock-video')
            ? { orientation: input.orientation }
            : {}),
          ...(input.minDuration ? { minDuration: input.minDuration } : {}),
          ...(signal ? { signal } : {}),
        });
        return found.items.map((item): MediaItem => {
          stockItems.set(`${provider.id}:${item.id}`, item);
          return {
            key: `${provider.id}:${item.id}`,
            provider: provider.id,
            providerName: provider.name,
            id: item.id,
            kind: input.kind,
            mediaType: mediaTypeOf(input.kind),
            title: item.title,
            tags: item.tags,
            thumbnail: item.thumbUrl,
            preview: item.previewUrl,
            download: item.files[0]?.url ?? '',
            width: item.width,
            height: item.height,
            duration: item.durationSec,
            licence: item.license.name,
            attribution: item.author || provider.name,
          };
        });
      },
    ]),
  );
  const fixtures = e2eFixtures();
  const rest: RestRunner = o.tools
    ? async ({ provider, input }) => {
        const out = (await o.tools!(
          'searchMedia',
          { ...input, providers: [provider.id] },
          o.videoId,
        )) as {
          ok: boolean;
          error?: string;
          output?: { items: MediaItem[]; failures: { message: string }[] };
        };
        if (!out.ok)
          throw new ToolError(
            'http',
            out.error ?? 'the server could not search.',
          );
        if (!out.output!.items.length && out.output!.failures[0])
          throw new ToolError('http', out.output!.failures[0].message);
        return out.output!.items;
      }
    : fixtures
      ? fixtureRunner(fixtures)
      : async () => {
          throw new ToolError(
            'not-available',
            'it works only when the server is connected.',
          );
        };
  const find = async (
    query: string,
    type: string,
    orientation?: 'landscape' | 'portrait' | 'square',
    minDuration?: number,
  ) => {
    const kind = KIND_OF[type];
    if (!kind) return [] as MediaItem[];
    const r = await searchMedia(
      {
        kind,
        query,
        ...(orientation ? { orientation } : {}),
        ...(minDuration ? { minDuration } : {}),
        limit: 12,
      },
      {
        providers: o.config.mediaProviders,
        planId: o.planId,
        runtime: { builtin, rest },
        available: o.available,
        spend: (id, n) => o.spend?.(`media:${id}`, n),
      },
    );
    for (const item of r.items)
      if (!stockItems.has(item.key)) restItems.set(item.key, item);
    if (!r.items.length && r.failures.length)
      throw new Error(r.failures.map((f) => f.message).join(' '));
    return r.items;
  };
  const candidate = (item: MediaItem): MediaCandidate => ({
    key: item.key,
    source: 'stock',
    kind: item.mediaType,
    title: item.title,
    tags: [...item.tags],
    width: item.width,
    height: item.height,
    thumbUrl: item.thumbnail,
    duration: item.duration,
    licence: item.licence,
    attribution: item.attribution,
    provider: item.provider,
    payload: stockItems.get(item.key) ?? item,
  });
  const stock: ResolveServices['stock'] = async (query, type, orientation) =>
    (await find(query, type, orientation)).map(candidate);
  /** Downloads a pick and imports it through the existing importer. */
  const importPick = (
    c: MediaCandidate,
    importFile: (file: File, license?: LicenseMeta) => Promise<Asset | null>,
    signal?: AbortSignal,
  ) =>
    importRegistryPick(
      c,
      importFile,
      signal,
      stockItems.get(c.key),
      restItems.get(c.key),
    );
  /** Music or a sound effect by words through the registry (v4 builds). */
  const sound = async (query: string, kind: 'music' | 'sfx') => {
    const items = await find(query, kind === 'music' ? 'audio' : 'sfx').catch(
      () => [] as MediaItem[],
    );
    const pick = items.find((i) => i.mediaType === 'audio');
    return pick ? candidate(pick) : null;
  };
  // ROUND-C1 F4: voices and captions of the registry (kinds text-to-speech,
  // speech-to-text): through the gateway's tools when one is set (keys on
  // the server), else DEV and e2e fixtures, else they are not available.
  const speechFixtures = e2eSpeech();
  const speechCall = async <T>(
    tool: 'speak' | 'transcribe',
    input: Record<string, unknown>,
    offline: (run: SpeechRunner) => Promise<T>,
  ): Promise<T> => {
    if (o.tools) {
      const out = (await o.tools(tool, input, o.videoId)) as {
        ok: boolean;
        error?: string;
        output?: T;
      };
      if (!out.ok) throw new Error(out.error ?? 'The provider failed.');
      return out.output!;
    }
    if (!speechFixtures)
      throw new Error('Voices and captions from providers need the server.');
    return offline(speechFixtureRunner(speechFixtures));
  };
  const hasSpeech = (kind: SpeechKind, wanted?: string) => {
    try {
      speechProvider(o.config.mediaProviders, kind, o.planId, wanted);
      return true;
    } catch {
      return false;
    }
  };
  const voice = (
    text: string,
    lang: string,
    voiceId?: string,
    provider?: string,
  ) =>
    speechCall<SpeakResult>(
      'speak',
      {
        text,
        lang,
        ...(voiceId ? { voice: voiceId } : {}),
        ...(provider ? { provider } : {}),
      },
      (run) =>
        speak(
          { text, lang, voice: voiceId, provider },
          o.config.mediaProviders,
          o.planId,
          run,
        ),
    );
  const transcribeAudio = (
    audio: string,
    mime: string,
    lang: string,
    provider?: string,
  ) =>
    speechCall<TranscribeResult>(
      'transcribe',
      { audio, mime, lang, ...(provider ? { provider } : {}) },
      (run) =>
        transcribe(
          { audio, mime, lang, provider },
          o.config.mediaProviders,
          o.planId,
          run,
        ),
    );
  return {
    stock,
    importPick,
    sound,
    hasSpeech,
    voice,
    transcribe: transcribeAudio,
    licenceOf: speechLicence,
  };
}
/** DEV and e2e pages only: speech provider answers by provider id. */
const e2eSpeech = (): Record<string, unknown> | null =>
  (import.meta.env.DEV || import.meta.env.MODE === 'e2e') &&
  typeof window !== 'undefined'
    ? ((window as { __AIVE_E2E_SPEECH__?: Record<string, unknown> })
        .__AIVE_E2E_SPEECH__ ?? null)
    : null;
/** The licence of a provider's voice or words, kept with the asset. */
export const speechLicence = (r: {
  provider: string;
  providerName: string;
  licence: string;
  attribution: string;
}): LicenseMeta => ({
  providerId: r.provider,
  itemId: 'speech',
  sourceUrl: '',
  author: r.attribution,
  authorUrl: '',
  license: {
    name: r.licence,
    url: '',
    attributionRequired: true,
    commercialUse: true,
  },
  attributionText: `${r.attribution} (${r.providerName})`,
  importedAt: new Date().toISOString(),
});

const isMediaItem = (v: unknown): v is MediaItem =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as MediaItem).download === 'string' &&
  typeof (v as MediaItem).provider === 'string' &&
  typeof (v as MediaItem).mediaType === 'string';
const isStockItem = (v: unknown): v is StockItem =>
  !!v &&
  typeof v === 'object' &&
  Array.isArray((v as StockItem).files) &&
  !!(v as StockItem).license;
/**
 * Imports a pick of the provider registry. The pick carries its own details
 * (`payload`, kept with the plan's alternatives), so Review & swap can
 * import a choice long after the build (ROUND-C1 F3).
 */
export async function importRegistryPick(
  c: MediaCandidate,
  importFile: (file: File, license?: LicenseMeta) => Promise<Asset | null>,
  signal?: AbortSignal,
  known?: StockItem,
  knownRest?: MediaItem,
): Promise<Asset> {
  {
    const stockItem = known ?? (isStockItem(c.payload) ? c.payload : undefined);
    if (stockItem) {
      const got = await importStockItem(
        stockItem,
        stockQuality(stockItem),
        signal ? { signal } : {},
      );
      const asset = await importFile(
        new File([got.blob], got.name, { type: got.mime }),
        got.licenseMeta,
      );
      if (!asset) throw new Error('The file could not be added.');
      return asset;
    }
    const item = knownRest ?? (isMediaItem(c.payload) ? c.payload : undefined);
    if (!item) throw new Error('This pick is no longer available.');
    const res = await fetch(item.download, signal ? { signal } : {});
    if (!res.ok)
      throw new Error(`The file could not be downloaded (${res.status}).`);
    const blob = await res.blob();
    const ext = (
      /\.([a-z0-9]{2,4})(?:$|\?)/i.exec(item.download)?.[1] ??
      (item.mediaType === 'video'
        ? 'mp4'
        : item.mediaType === 'audio'
          ? 'mp3'
          : 'jpg')
    ).toLowerCase();
    const name =
      `${item.title || item.id}`
        .replace(/[^\p{L}\p{N} -]+/gu, ' ')
        .trim()
        .slice(0, 60) || item.id;
    const licence: LicenseMeta = {
      providerId: item.provider,
      itemId: item.id,
      sourceUrl: item.preview || item.download,
      author: item.attribution,
      authorUrl: '',
      license: {
        name: item.licence,
        url: '',
        attributionRequired: true,
        commercialUse: true,
      },
      attributionText: `${item.attribution} (${item.providerName})`,
      importedAt: new Date().toISOString(),
    };
    const asset = await importFile(
      new File([blob], `${name}.${ext}`, {
        type: blob.type || 'application/octet-stream',
      }),
      licence,
    );
    if (!asset) throw new Error('The file could not be added.');
    return asset;
  }
}
