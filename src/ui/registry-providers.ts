// ROUND-C1 C1.1.6: the editor's Stock panels list the same provider
// registry as Director. Loaded lazily the first time a Stock panel opens:
// the live Platform Config (the gateway's when one is set, else this
// browser's), built-in providers the owner switched off are hidden, and
// each REST provider the owner added appears as its own provider (filter
// by provider). Its searches run on the gateway (keys stay there); without
// a gateway, DEV and e2e pages use fixtures.
import type {
  Provider,
  ProviderKind,
  SearchOptions,
  StockItem,
} from '../providers';
import { localConfigSource } from '../platform-config/source';
import { serverConfigSource } from '../platform-config/remote-source';
import type { MediaProvider } from '../platform-config/media-providers';
import { gatewayBase, gatewayToken } from '../usage-report';
import { fixtureRunner, mediaTypeOf, type MediaItem } from '../tools/media';
import { setRegistryProviders } from './services';

const KIND_TO: Readonly<Record<string, ProviderKind>> = {
  'stock-photo': 'stock-image',
  'stock-video': 'stock-video',
  icon: 'icon',
  sticker: 'sticker',
  music: 'stock-audio',
  'sound-effect': 'stock-audio',
};
const FROM: Readonly<Record<string, string>> = {
  'stock-image': 'stock-photo',
  'stock-video': 'stock-video',
  icon: 'icon',
  sticker: 'sticker',
  'stock-audio': 'music',
};
const mimeOf = (url: string, type: string) => {
  const ext = /\.([a-z0-9]{2,4})(?:$|\?)/i.exec(url)?.[1]?.toLowerCase() ?? '';
  return (
    {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
    }[ext] ??
    (type === 'video'
      ? 'video/mp4'
      : type === 'audio'
        ? 'audio/mpeg'
        : 'image/jpeg')
  );
};
function asProvider(
  entry: MediaProvider,
  search: (kind: string, o: SearchOptions) => Promise<MediaItem[]>,
): Provider {
  const kinds = [
    ...new Set(
      entry.kinds.map((k) => KIND_TO[k]).filter((k): k is ProviderKind => !!k),
    ),
  ];
  return {
    id: entry.id,
    name: entry.name,
    kinds,
    requiresKey: false,
    keyFields: [],
    attribution: { text: entry.name, url: '' },
    async search(o) {
      const kind = entry.kinds.includes(FROM[o.kind] ?? '')
        ? FROM[o.kind]!
        : (entry.kinds.find((k) => KIND_TO[k] === o.kind) ?? FROM[o.kind]!);
      const items = await search(kind, o);
      return {
        items: items.map((i): StockItem => ({
          id: i.id,
          providerId: entry.id,
          kind: o.kind as StockItem['kind'],
          title: i.title,
          thumbUrl: i.thumbnail,
          previewUrl: i.preview,
          width: i.width,
          height: i.height,
          durationSec: i.duration,
          author: i.attribution,
          authorUrl: '',
          sourceUrl: i.preview,
          tags: [...i.tags],
          license: {
            name: i.licence,
            url: '',
            attributionRequired: true,
            commercialUse: true,
          },
          files: [
            {
              quality: 'original',
              url: i.download,
              width: i.width,
              height: i.height,
              mime: mimeOf(i.download, i.mediaType),
            },
          ],
        })),
        total: items.length,
        nextPage: null,
      };
    },
    async getDownload(item, quality) {
      const file =
        item.files.find((f) => f.quality === quality) ?? item.files[0];
      if (!file) throw new Error('This item has no file.');
      return file;
    },
  };
}
let loading: Promise<boolean> | null = null;
/** Loads the registry once; true when the provider list changed. */
export function loadRegistryProviders(userId: string): Promise<boolean> {
  loading ??= (async () => {
    const base = gatewayBase();
    const storage = window.localStorage;
    const live = await (
      base ? serverConfigSource({ base, storage }) : localConfigSource(storage)
    ).getLive();
    const providers: readonly MediaProvider[] =
      live.config.mediaProviders ?? [];
    const token = base ? gatewayToken(userId, storage, base) : null;
    const fixtures =
      import.meta.env.DEV || import.meta.env.MODE === 'e2e'
        ? (window as { __AIVE_E2E_MEDIA__?: Record<string, MediaItem[]> })
            .__AIVE_E2E_MEDIA__
        : undefined;
    const search =
      (entry: MediaProvider) =>
      async (kind: string, o: SearchOptions): Promise<MediaItem[]> => {
        const input = {
          kind,
          query: o.query,
          ...(o.orientation ? { orientation: o.orientation } : {}),
          providers: [entry.id],
          limit: o.perPage ?? 24,
        };
        if (base && token) {
          const res = await fetch(`${base.replace(/\/$/, '')}/v1/tools/run`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${await token()}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ tool: 'searchMedia', input, videoId: '' }),
            ...(o.signal ? { signal: o.signal } : {}),
          });
          const out = (await res.json()) as {
            ok?: boolean;
            error?: string;
            output?: { items: MediaItem[]; failures: { message: string }[] };
          };
          if (!res.ok || !out.ok)
            throw new Error(out.error ?? 'The server could not search.');
          if (!out.output!.items.length && out.output!.failures[0])
            throw new Error(out.output!.failures[0].message);
          return out.output!.items;
        }
        if (!fixtures)
          throw new Error(
            `${entry.name} works only when the server is connected.`,
          );
        return [
          ...(await fixtureRunner(fixtures)({
            provider: entry,
            input: { kind, query: o.query },
            descriptor: undefined as never,
          })),
        ].map((i) => ({ ...i, mediaType: mediaTypeOf(kind) }));
      };
    const rest = providers
      .filter((p) => p.enabled && p.adapter.type === 'rest')
      .map((p) => asProvider(p, search(p)));
    const offBuiltins = providers
      .filter((p) => !p.enabled && p.adapter.type === 'builtin')
      .map((p) => (p.adapter.type === 'builtin' ? p.adapter.name : ''));
    setRegistryProviders(rest, offBuiltins);
    return rest.length > 0 || offBuiltins.length > 0;
  })().catch(() => false);
  return loading;
}
