import { z } from 'zod';
import {
  dimension,
  httpUrl,
  pageResult,
  stockProvider,
  type ProviderDependencies,
} from './shared';
import type { StockItem } from './types';
/** Commercial-friendly does not mean attribution-free; CC-BY-SA retains share-alike. */
export const COMMERCIAL_ICON_LICENSES = [
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-SA-4.0',
  'OFL-1.1',
] as const;
export const STICKER_PREFIXES = ['openmoji', 'noto', 'noto-v1'] as const;
const collection = z.object({
  name: z.string(),
  author: z.object({ name: z.string(), url: httpUrl.optional() }),
  license: z.object({
    title: z.string(),
    spdx: z.string().optional(),
    url: httpUrl.optional(),
  }),
  height: dimension.optional(),
  width: dimension.optional(),
});
export function createIconify(deps: ProviderDependencies = {}) {
  return stockProvider(
    {
      id: 'iconify',
      name: 'Iconify',
      kinds: ['icon', 'sticker'],
      requiresKey: false,
      keyFields: [],
      attribution: {
        text: 'Icons via Iconify; see each icon set licence',
        url: 'https://iconify.design/',
      },
      minPageSize: 32,
      maxPageSize: 999,
      build(o) {
        const url = new URL('https://api.iconify.design/search');
        url.search = new URLSearchParams({
          query: o.query,
          limit: String(o.perPage),
          start: String(((o.page ?? 1) - 1) * (o.perPage ?? 32)),
          ...(o.kind === 'sticker'
            ? { prefixes: STICKER_PREFIXES.join(',') }
            : {}),
        }).toString();
        return { url: url.href };
      },
      map(raw, o) {
        const root = z
          .object({
            icons: z.array(z.string()),
            total: dimension,
            limit: dimension,
            start: dimension,
            collections: z.record(collection),
          })
          .parse(raw);
        const items = root.icons.flatMap((id): StockItem[] => {
          if (!/^[a-z0-9-]+:[a-z0-9-]+$/.test(id)) return [];
          const [prefix, name] = id.split(':') as [string, string],
            info = root.collections[prefix];
          if (
            !info ||
            !COMMERCIAL_ICON_LICENSES.some(
              (license) => license === info.license.spdx,
            )
          )
            return [];
          const sticker = STICKER_PREFIXES.some((p) => p === prefix);
          if ((o.kind === 'sticker') !== sticker) return [];
          const url = `https://api.iconify.design/${prefix}/${name}.svg`,
            width = info.width ?? info.height ?? 24,
            height = info.height ?? 24;
          return [
            {
              id,
              providerId: 'iconify',
              kind: sticker ? 'sticker' : 'icon',
              title: name.replaceAll('-', ' '),
              thumbUrl: url,
              previewUrl: url,
              width,
              height,
              durationSec: 0,
              author: info.author.name,
              authorUrl: info.author.url ?? 'https://iconify.design/',
              sourceUrl: `https://icon-sets.iconify.design/${prefix}/${name}/`,
              tags: [prefix, name],
              license: {
                name: info.license.title,
                url:
                  info.license.url ??
                  `https://spdx.org/licenses/${info.license.spdx}.html`,
                attributionRequired: info.license.spdx !== 'CC0-1.0',
                commercialUse: true,
              },
              files: [
                { quality: 'svg', url, width, height, mime: 'image/svg+xml' },
              ],
            },
          ];
        });
        return pageResult(
          items,
          root.start + root.total,
          o,
          root.total >= root.limit,
        );
      },
    },
    deps,
  );
}
