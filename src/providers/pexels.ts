import { z } from 'zod';
import {
  apiKeyField,
  dimension,
  httpUrl,
  pageResult,
  scaled,
  stockProvider,
  type ProviderDependencies,
} from './shared';
import type { StockItem, StockLicense } from './types';
export const PEXELS_LICENSE: StockLicense = {
  name: 'Pexels License',
  url: 'https://www.pexels.com/license/',
  attributionRequired: false,
  commercialUse: true,
};
const photo = z.object({
  id: z.number(),
  width: dimension,
  height: dimension,
  url: httpUrl,
  photographer: z.string(),
  photographer_url: httpUrl,
  alt: z.string().optional(),
  src: z.object({
    original: httpUrl,
    large: httpUrl,
    medium: httpUrl,
    small: httpUrl,
    tiny: httpUrl,
  }),
});
const video = z.object({
  id: z.number(),
  width: dimension,
  height: dimension,
  url: httpUrl,
  image: httpUrl,
  duration: dimension,
  user: z.object({ name: z.string(), url: httpUrl }),
  video_files: z.array(
    z.object({
      id: z.number(),
      quality: z.string(),
      file_type: z.string(),
      width: dimension.nullable(),
      height: dimension.nullable(),
      link: httpUrl,
    }),
  ),
});
export function createPexels(deps: ProviderDependencies = {}) {
  return stockProvider(
    {
      id: 'pexels',
      name: 'Pexels',
      kinds: ['stock-image', 'stock-video'],
      requiresKey: true,
      keyFields: apiKeyField,
      attribution: {
        text: 'Photos provided by Pexels',
        url: 'https://www.pexels.com/',
      },
      maxPageSize: 80,
      limits: [
        { count: 200, ms: 3600000 },
        { count: 20000, ms: 31 * 86400000 },
      ],
      reset: 'epoch',
      build(o, key) {
        const url = new URL(
          o.kind === 'stock-video'
            ? 'https://api.pexels.com/v1/videos/search'
            : 'https://api.pexels.com/v1/search',
        );
        url.search = new URLSearchParams({
          query: o.query,
          page: String(o.page),
          per_page: String(o.perPage),
          ...(o.orientation ? { orientation: o.orientation } : {}),
        }).toString();
        return { url: url.href, headers: { Authorization: key } };
      },
      map(raw, o) {
        const root = z
          .object({
            total_results: dimension,
            photos: z.array(photo).optional(),
            videos: z.array(video).optional(),
            next_page: httpUrl.optional(),
          })
          .parse(raw);
        const items: StockItem[] =
          o.kind === 'stock-image'
            ? (
                root.photos ??
                (() => {
                  throw Error('Missing photos');
                })()
              ).map((p) => ({
                id: String(p.id),
                providerId: 'pexels',
                kind: 'stock-image',
                title: p.alt || 'Pexels photo',
                thumbUrl: p.src.tiny,
                previewUrl: p.src.medium,
                width: p.width,
                height: p.height,
                durationSec: 0,
                author: p.photographer,
                authorUrl: p.photographer_url,
                sourceUrl: p.url,
                tags: [],
                license: { ...PEXELS_LICENSE },
                files: [
                  {
                    quality: 'original',
                    url: p.src.original,
                    width: p.width,
                    height: p.height,
                    mime: 'image/jpeg',
                  },
                  {
                    quality: 'large',
                    url: p.src.large,
                    ...scaled(p.width, p.height, 940),
                    mime: 'image/jpeg',
                  },
                  {
                    quality: 'medium',
                    url: p.src.medium,
                    ...scaled(p.width, p.height, 350),
                    mime: 'image/jpeg',
                  },
                ],
              }))
            : (
                root.videos ??
                (() => {
                  throw Error('Missing videos');
                })()
              ).map((v) => ({
                id: String(v.id),
                providerId: 'pexels',
                kind: 'stock-video',
                title: 'Pexels video',
                thumbUrl: v.image,
                previewUrl:
                  v.video_files.find((f) => f.file_type === 'video/mp4')
                    ?.link ?? v.image,
                width: v.width,
                height: v.height,
                durationSec: v.duration,
                author: v.user.name,
                authorUrl: v.user.url,
                sourceUrl: v.url,
                tags: [],
                license: { ...PEXELS_LICENSE },
                files: v.video_files
                  .filter(
                    (f) => f.file_type === 'video/mp4' && f.width && f.height,
                  )
                  .map((f) => ({
                    quality: `${f.quality}-${f.id}`,
                    url: f.link,
                    width: f.width!,
                    height: f.height!,
                    mime: f.file_type,
                  })),
              }));
        return pageResult(
          items,
          root.total_results,
          o,
          Boolean(root.next_page),
        );
      },
    },
    deps,
  );
}
