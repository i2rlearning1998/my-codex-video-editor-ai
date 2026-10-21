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
import type { StockFile, StockItem, StockLicense } from './types';
export const PIXABAY_LICENSE: StockLicense = {
  name: 'Pixabay Content License',
  url: 'https://pixabay.com/service/license-summary/',
  attributionRequired: false,
  commercialUse: true,
};
const base = z.object({
  id: z.number(),
  pageURL: httpUrl,
  tags: z.string(),
  user: z.string(),
  user_id: z.number(),
});
const photo = base.extend({
  previewURL: httpUrl,
  previewWidth: dimension,
  previewHeight: dimension,
  webformatURL: httpUrl,
  webformatWidth: dimension,
  webformatHeight: dimension,
  largeImageURL: httpUrl,
  imageWidth: dimension,
  imageHeight: dimension,
  imageURL: httpUrl.optional(),
});
const video = base.extend({
  duration: dimension,
  videos: z.record(
    z.object({
      url: z.string(),
      width: z.number().nullish(),
      height: z.number().nullish(),
      size: z.number().nullish(),
      // FIX1 F2: an absent rendition has an empty thumbnail too.
      thumbnail: z.string().nullish(),
    }),
  ),
});
export function createPixabay(deps: ProviderDependencies = {}) {
  return stockProvider(
    {
      id: 'pixabay',
      name: 'Pixabay',
      kinds: ['stock-image', 'stock-video'],
      requiresKey: true,
      keyFields: apiKeyField,
      attribution: {
        text: 'Images and videos from Pixabay',
        url: 'https://pixabay.com/',
      },
      minPageSize: 3,
      maxPageSize: 200,
      ttlMs: 86400000,
      limits: [{ count: 100, ms: 60000 }],
      reset: 'seconds',
      invalid400: true,
      build(options, key) {
        const url = new URL(
          options.kind === 'stock-video'
            ? 'https://pixabay.com/api/videos/'
            : 'https://pixabay.com/api/',
        );
        url.search = new URLSearchParams({
          key,
          q: options.query.slice(0, 100),
          page: String(options.page),
          per_page: String(options.perPage),
          safesearch: 'true',
          ...(options.minWidth === undefined
            ? {}
            : { min_width: String(options.minWidth) }),
          ...(options.kind === 'stock-image' &&
          options.orientation &&
          options.orientation !== 'square'
            ? {
                orientation:
                  options.orientation === 'landscape'
                    ? 'horizontal'
                    : 'vertical',
              }
            : {}),
        }).toString();
        return { url: url.href };
      },
      map(raw, options) {
        const root = z
          .object({ totalHits: dimension, hits: z.array(z.unknown()) })
          .parse(raw);
        // FIX1 F2: one unusable hit is skipped, not the whole page.
        const items = root.hits.flatMap((hit): StockItem[] => {
          try {
            return [mapHit(hit)];
          } catch {
            return [];
          }
        });
        function mapHit(hit: unknown): StockItem {
          if (options.kind === 'stock-image') {
            const p = photo.parse(hit);
            const files: StockFile[] = [
              {
                quality: 'tiny',
                url: p.previewURL,
                width: p.previewWidth,
                height: p.previewHeight,
                mime: 'image/jpeg',
              },
              {
                quality: 'small',
                url: p.webformatURL,
                width: p.webformatWidth,
                height: p.webformatHeight,
                mime: 'image/jpeg',
              },
              {
                quality: 'medium',
                url: p.largeImageURL,
                ...scaled(p.imageWidth, p.imageHeight, 1280),
                mime: 'image/jpeg',
              },
              ...(p.imageURL
                ? [
                    {
                      quality: 'large',
                      url: p.imageURL,
                      width: p.imageWidth,
                      height: p.imageHeight,
                      mime: 'image/jpeg',
                    },
                  ]
                : []),
            ];
            return {
              id: String(p.id),
              providerId: 'pixabay',
              kind: 'stock-image',
              title: p.tags,
              thumbUrl: p.previewURL,
              previewUrl: p.webformatURL,
              width: p.imageWidth,
              height: p.imageHeight,
              durationSec: 0,
              author: p.user,
              authorUrl: `https://pixabay.com/users/${encodeURIComponent(p.user)}-${p.user_id}/`,
              sourceUrl: p.pageURL,
              tags: p.tags.split(',').map((t) => t.trim()),
              license: { ...PIXABAY_LICENSE },
              files,
            };
          }
          const v = video.parse(hit),
            files: StockFile[] = Object.entries(v.videos)
              // FIX1 F2: `large` can be { url: "", size: 0 } (no 4K file).
              .filter(
                ([, f]) =>
                  httpUrl.safeParse(f.url).success &&
                  f.size !== 0 &&
                  !!f.width &&
                  !!f.height,
              )
              .map(([quality, f]) => ({
                quality,
                url: f.url,
                width: f.width!,
                height: f.height!,
                mime: 'video/mp4',
                ...(f.size ? { bytes: f.size } : {}),
              }));
          const largest = [...files].sort((a, b) => b.width - a.width)[0];
          if (!largest) throw Error('No file');
          return {
            id: String(v.id),
            providerId: 'pixabay',
            kind: 'stock-video',
            title: v.tags,
            thumbUrl:
              [v.videos.tiny?.thumbnail, v.videos.medium?.thumbnail].find(
                (url) => !!url && httpUrl.safeParse(url).success,
              ) ?? '',
            previewUrl:
              files.find((f) => f.quality === 'tiny')?.url ?? largest.url,
            width: largest.width,
            height: largest.height,
            durationSec: v.duration,
            author: v.user,
            authorUrl: `https://pixabay.com/users/${encodeURIComponent(v.user)}-${v.user_id}/`,
            sourceUrl: v.pageURL,
            tags: v.tags.split(',').map((t) => t.trim()),
            license: { ...PIXABAY_LICENSE },
            files,
          };
        }
        return pageResult(items, root.totalHits, options);
      },
    },
    deps,
  );
}
