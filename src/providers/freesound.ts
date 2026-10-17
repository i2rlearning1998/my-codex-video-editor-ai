import { z } from 'zod';
import {
  dimension,
  httpUrl,
  pageResult,
  stockProvider,
  type ProviderDependencies,
} from './shared';
import type { StockLicense } from './types';
export function soundLicense(url: string): StockLicense {
  const parsed = new URL(url),
    path = parsed.pathname;
  const cc = ['creativecommons.org', 'www.creativecommons.org'].includes(
    parsed.hostname,
  );
  const zero = cc && path.startsWith('/publicdomain/zero/'),
    by = cc && /^\/licenses\/by\//.test(path),
    sa = cc && /^\/licenses\/by-sa\//.test(path),
    nc = cc && path.includes('/by-nc');
  return {
    name: zero
      ? 'CC0'
      : by
        ? 'CC-BY'
        : sa
          ? 'CC-BY-SA'
          : nc
            ? 'CC-BY-NC'
            : 'Other licence',
    url,
    attributionRequired: !zero,
    commercialUse: zero || by || sa,
  };
}
const sound = z.object({
  id: z.number(),
  name: z.string(),
  url: httpUrl,
  username: z.string(),
  duration: dimension,
  tags: z.array(z.string()),
  license: z.string().url(),
  previews: z.object({ 'preview-hq-mp3': httpUrl, 'preview-lq-mp3': httpUrl }),
  images: z.object({ waveform_m: httpUrl.optional() }).optional(),
});
export function createFreesound(deps: ProviderDependencies = {}) {
  return stockProvider(
    {
      id: 'freesound',
      name: 'Freesound',
      kinds: ['stock-audio'],
      requiresKey: true,
      keyFields: [{ id: 'token', label: 'API token', secret: true }],
      attribution: {
        text: 'Sounds from Freesound; credit each sound as its licence requires',
        url: 'https://freesound.org/',
      },
      maxPageSize: 150,
      limits: [
        { count: 60, ms: 60000 },
        { count: 2000, ms: 86400000 },
      ],
      build(o, key) {
        const url = new URL('https://freesound.org/apiv2/search/');
        url.search = new URLSearchParams({
          query: o.query,
          page: String(o.page),
          page_size: String(o.perPage),
          fields: 'id,name,url,username,duration,tags,license,previews,images',
          ...(o.minDuration !== undefined || o.maxDuration !== undefined
            ? {
                filter: `duration:[${o.minDuration ?? '*'} TO ${o.maxDuration ?? '*'}]`,
              }
            : {}),
        }).toString();
        return { url: url.href, headers: { Authorization: `Token ${key}` } };
      },
      map(raw, o) {
        const root = z
          .object({
            count: dimension,
            next: z.string().nullable(),
            results: z.array(sound),
          })
          .parse(raw);
        return pageResult(
          root.results.map((s) => ({
            id: String(s.id),
            providerId: 'freesound',
            kind: 'stock-audio',
            title: s.name,
            thumbUrl: s.images?.waveform_m ?? '',
            previewUrl: s.previews['preview-lq-mp3'],
            width: 0,
            height: 0,
            durationSec: s.duration,
            author: s.username,
            authorUrl: `https://freesound.org/people/${encodeURIComponent(s.username)}/`,
            sourceUrl: s.url,
            tags: s.tags,
            license: soundLicense(s.license),
            files: [
              {
                quality: 'preview-hq',
                url: s.previews['preview-hq-mp3'],
                width: 0,
                height: 0,
                mime: 'audio/mpeg',
              },
              {
                quality: 'preview-lq',
                url: s.previews['preview-lq-mp3'],
                width: 0,
                height: 0,
                mime: 'audio/mpeg',
              },
            ],
          })),
          root.count,
          o,
          Boolean(root.next),
        );
      },
    },
    deps,
  );
}
