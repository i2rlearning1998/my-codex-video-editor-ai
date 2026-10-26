// Phase 1 library (P1-25): a heavy catalog item (sound, video, picture) as
// a project asset. The asset names the FULL file (`media/<sha>`), so the
// project keeps its own reference whatever the catalog does later (P1-27);
// until the full bytes are in this browser the editor draws the poster and
// plays the small proxy (`catalogProxy`), which the card prefetched.
import type { CatalogEntry } from './format';
import { catalogMediaKey } from './client';

const TYPES = { sound: 'audio', video: 'video', image: 'image' } as const;

export interface CatalogAsset {
  readonly id: string;
  readonly name: string;
  readonly type: 'audio' | 'video' | 'image';
  readonly source: { readonly kind: 'local'; readonly reference: string };
  readonly metadata: Record<string, unknown>;
  readonly width?: number;
  readonly height?: number;
  readonly duration?: number;
}

export function isHeavy(entry: CatalogEntry): boolean {
  return !!entry.media && entry.kind in TYPES;
}

/** The project asset for a heavy catalog entry (pure; same id every time). */
export function catalogAsset(entry: CatalogEntry, language: 'en' | 'hi' = 'en'): CatalogAsset {
  const media = entry.media;
  const type = TYPES[entry.kind as keyof typeof TYPES];
  if (!media || !type) throw new Error('This library item is not a media file.');
  const fingerprint = media.full.sha256.slice(0, 32);
  const name = (entry.name[language] || entry.name.en).slice(0, 256);
  const extension = media.full.url.split('.').pop() ?? 'bin';
  return {
    id: `media-${fingerprint.slice(0, 16)}`,
    name,
    type,
    source: { kind: 'local', reference: catalogMediaKey(media.full.sha256) },
    metadata: {
      mimeType: media.full.mime,
      size: media.full.size,
      fileName: `${name}.${extension}`,
      fingerprint,
      catalog: { id: entry.id, itemVersion: entry.itemVersion },
      ...(media.proxy ? { catalogProxy: catalogMediaKey(media.proxy.sha256) } : {}),
      ...(media.poster ? { catalogPoster: media.poster.sha256 } : {}),
      ...(entry.license.credit ? { license: { name: entry.license.name, credit: entry.license.credit } } : {}),
    },
    ...(media.width ? { width: media.width } : {}),
    ...(media.height ? { height: media.height } : {}),
    ...(media.duration !== undefined ? { duration: media.duration } : {}),
  };
}
