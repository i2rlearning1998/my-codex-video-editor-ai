import { assetFingerprint, mediaKey, thumbnailKey } from './import';
import { makeFilmstrip, makeThumbnail, type MediaKind } from './probe';
import type { MediaStore } from './store';

/** The asset fields previews read (structural, to keep readonly types shallow). */
export interface PreviewAsset {
  readonly id: string;
  readonly type: string;
  readonly source: { readonly kind: string; readonly reference: string };
  readonly metadata: { readonly mimeType?: unknown };
  readonly duration?: number | undefined;
}
export type Preview =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly url: string }
  | { readonly state: 'none' };

export const stripKey = (fingerprint: string) => `strips/${fingerprint}`;

/**
 * Thumbnails (MED-018) and filmstrip sprites (TL-046), made in the background one at
 * a time and cached in the media store, so a reload reads them back instead of
 * decoding again. Shared by the Media tab and the timeline.
 */
export class MediaPreviews {
  readonly #entries = new Map<string, Preview>();
  readonly #listeners = new Set<() => void>();
  #queue = Promise.resolve();
  #disposed = false;
  constructor(private readonly store: Promise<MediaStore | null>) {}

  thumbnail(asset: PreviewAsset): Preview {
    return this.#get('thumb', asset, (source) =>
      makeThumbnail(source, asset.type as MediaKind),
    );
  }
  strip(asset: PreviewAsset): Preview {
    if (asset.type !== 'video') return { state: 'none' };
    return this.#get('strip', asset, makeFilmstrip);
  }
  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  /** Bytes may have arrived (an import): try previews that had none again. */
  retry(): void {
    for (const [key, entry] of this.#entries)
      if (entry.state === 'none') this.#entries.delete(key);
    this.#emit();
  }
  dispose(): void {
    this.#disposed = true;
    for (const entry of this.#entries.values())
      if (entry.state === 'ready') URL.revokeObjectURL(entry.url);
    this.#entries.clear();
    this.#listeners.clear();
  }
  #emit() {
    for (const listener of this.#listeners) listener();
  }
  #get(
    kind: 'thumb' | 'strip',
    asset: PreviewAsset,
    make: (source: Blob) => Promise<Blob | null>,
  ): Preview {
    const fingerprint = assetFingerprint(asset);
    if (!fingerprint || asset.type === 'audio') return { state: 'none' };
    const cacheKey = `${kind}:${fingerprint}`;
    const known = this.#entries.get(cacheKey);
    if (known) return known;
    this.#entries.set(cacheKey, { state: 'loading' });
    const storeKey =
      kind === 'thumb' ? thumbnailKey(fingerprint) : stripKey(fingerprint);
    this.#queue = this.#queue.then(async () => {
      let result: Preview = { state: 'none' };
      try {
        const media = await this.store;
        if (media && !this.#disposed) {
          let blob = await media.read(storeKey);
          if (!blob) {
            const stored = await media.read(mediaKey(fingerprint));
            // Stored files can lose their MIME type (OPFS); SVG needs it to decode.
            const source =
              stored &&
              !stored.type &&
              typeof asset.metadata.mimeType === 'string'
                ? stored.slice(0, stored.size, asset.metadata.mimeType)
                : stored;
            blob = source ? await make(source) : null;
            if (blob) await media.write(storeKey, blob);
          }
          if (blob) result = { state: 'ready', url: URL.createObjectURL(blob) };
        }
      } catch {
        // A preview is optional: the UI keeps its type icon.
      }
      if (this.#disposed) {
        if (result.state === 'ready') URL.revokeObjectURL(result.url);
        return;
      }
      this.#entries.set(cacheKey, result);
      this.#emit();
    });
    return { state: 'loading' };
  }
}
