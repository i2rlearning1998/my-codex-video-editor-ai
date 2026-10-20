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
// FIX1 F2: the real answers are looser than the examples: HLS entries have
// no width or height, `quality` and `fps` can be null or missing, and a
// file's type may be anything. Only the fields we use are required; one bad
// video is skipped instead of failing the whole page.
const videoFile = z.object({
  id: z.number(),
  quality: z.string().nullish(),
  file_type: z.string().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
  fps: z.number().nullish(),
  size: z.number().nullish(),
  link: z.string(),
});
const video = z.object({
  id: z.number(),
  width: z.number().nullish(),
  height: z.number().nullish(),
  url: z.string(),
  image: z.string().nullish(),
  duration: z.number().nullish(),
  user: z
    .object({ name: z.string().nullish(), url: z.string().nullish() })
    .nullish(),
  video_files: z.array(z.unknown()),
});
const https = (value: string | null | undefined) =>
  !!value && httpUrl.safeParse(value).success;
/** A downloadable MP4 rendition (never HLS, never without a size). */
export function pexelsMp4Files(files: readonly unknown[]): StockFile[] {
  return files
    .flatMap((raw) => {
      const parsed = videoFile.safeParse(raw);
      return parsed.success ? [parsed.data] : [];
    })
    .filter(
      (f) =>
        (f.quality ?? '').toLowerCase() !== 'hls' &&
        (f.file_type ?? 'video/mp4').toLowerCase() === 'video/mp4' &&
        !/\.m3u8(\?|$)/i.test(f.link) &&
        https(f.link) &&
        !!f.width &&
        !!f.height,
    )
    .map((f) => ({
      quality: `${f.quality || 'mp4'}-${f.id}`,
      url: f.link,
      width: f.width!,
      height: f.height!,
      mime: 'video/mp4',
      ...(f.size ? { bytes: f.size } : {}),
    }));
}
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
            ? // FIX1 F2: the documented video endpoint has no /v1 prefix.
              'https://api.pexels.com/videos/search'
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
            videos: z.array(z.unknown()).optional(),
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
              ).flatMap((raw): StockItem[] => {
                const parsed = video.safeParse(raw);
                if (!parsed.success) return [];
                const v = parsed.data;
                const files = pexelsMp4Files(v.video_files);
                const biggest = [...files].sort(
                  (a, b) => b.width * b.height - a.width * a.height,
                )[0];
                if (!biggest || !https(v.url)) return [];
                return [
                  {
                    id: String(v.id),
                    providerId: 'pexels',
                    kind: 'stock-video',
                    title: 'Pexels video',
                    thumbUrl: https(v.image) ? v.image! : '',
                    previewUrl: [...files].sort((a, b) => a.width - b.width)[0]!
                      .url,
                    width: v.width || biggest.width,
                    height: v.height || biggest.height,
                    durationSec: v.duration ?? 0,
                    author: v.user?.name ?? 'Pexels',
                    authorUrl: https(v.user?.url)
                      ? v.user!.url!
                      : 'https://www.pexels.com/',
                    sourceUrl: v.url,
                    tags: [],
                    license: { ...PEXELS_LICENSE },
                    files,
                  },
                ];
              });
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
