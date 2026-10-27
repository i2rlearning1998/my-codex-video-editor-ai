// Phase 1 library (P1-20 to P1-24): the editor's catalog client. It reads
// the cached catalog first (so the panels fill at once), then refreshes in
// idle time: the manifest with its ETag, the signature checked before
// anything is used, each changed category index fetched and its SHA-256
// checked, small payload files and thumbnails prefetched into the media
// store. A rejected or failed refresh keeps the cache as it was; with no
// cache and no catalog the tiny bundled fallback pack is used. Nothing here
// blocks the UI: every call is asynchronous and a refresh never runs twice
// at once.
import type {
  LibraryItem,
  LibraryManifest,
  TemplateCategory,
} from '../library/schema';
import { libraryItemSchema } from '../library/schema';
import type { MediaStore } from '../media/store';
import type { CacheStore } from './cache';
import {
  CATALOG_CATEGORIES,
  categoryIndexSchema,
  isListed,
  orderEntries,
  type CatalogCategory,
  type CatalogEntry,
  type CatalogManifest,
  type CategoryIndex,
  type FileRef,
} from './format';
import { CatalogRejected, sha256, verifyManifest } from './verify';
import { FALLBACK_ITEMS } from './fallback';

export type CatalogSource = 'catalog' | 'cache' | 'fallback';
export type RefreshResult = 'unchanged' | 'updated' | 'rejected' | 'offline';
export interface ClientStatus {
  readonly source: CatalogSource;
  readonly catalogVersion: number | null;
  /** The last refresh's problem, in plain words (null when it went well). */
  readonly problem: string | null;
}

interface CachedManifest {
  readonly text: string;
  readonly etag: string | null;
  readonly catalogVersion: number;
}
const MANIFEST_KEY = 'manifest';
const indexKey = (category: CatalogCategory) => `index:${category}`;
interface CachedIndex {
  readonly sha256: string;
  readonly index: CategoryIndex;
}

export interface LibraryClientOptions {
  /** The catalog folder's address (ends with /), or null for none. */
  readonly url: string | null;
  readonly publicKey: string;
  readonly cache: Promise<CacheStore>;
  readonly media: Promise<MediaStore | null>;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
}

/** A catalog file in the media store: `catalog/<sha256>`. */
export const catalogFileKey = (sha: string) => `catalog/${sha}`;
/** Heavy media bytes as an ordinary media file (D-052 fingerprint shape). */
export const catalogMediaKey = (sha: string) => `media/${sha.slice(0, 32)}`;

export class LibraryClient {
  #manifest: CatalogManifest | null = null;
  #indexes = new Map<CatalogCategory, CategoryIndex>();
  #status: ClientStatus = {
    source: 'fallback',
    catalogVersion: null,
    problem: null,
  };
  #refreshing: Promise<RefreshResult> | null = null;
  readonly #listeners = new Set<() => void>();
  readonly #posters = new Map<string, ImageBitmap | HTMLImageElement>();
  readonly #pending = new Map<string, Promise<Blob | null>>();
  readonly ready: Promise<void>;

  constructor(private readonly options: LibraryClientOptions) {
    this.ready = this.#start();
  }
  get status(): ClientStatus {
    return this.#status;
  }
  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  #emit() {
    for (const listener of [...this.#listeners]) listener();
  }
  #fetch(url: string, init?: RequestInit) {
    return (this.options.fetch ?? fetch)(url, init);
  }
  #href(path: string) {
    return new URL(path, this.options.url ?? location.href).href;
  }

  async #start(): Promise<void> {
    const cache = await this.options.cache;
    try {
      const cached = await cache.get<CachedManifest>(MANIFEST_KEY);
      if (cached) {
        // The cached text was checked when it arrived; check it again (cheap).
        const manifest = await verifyManifest(
          cached.text,
          this.options.publicKey,
        );
        const indexes = new Map<CatalogCategory, CategoryIndex>();
        for (const category of CATALOG_CATEGORIES) {
          const entry = await cache.get<CachedIndex>(indexKey(category));
          if (!entry || entry.sha256 !== manifest.categories[category].sha256)
            throw new Error('incomplete');
          indexes.set(category, entry.index);
        }
        this.#manifest = manifest;
        this.#indexes = indexes;
        this.#status = {
          source: 'cache',
          catalogVersion: manifest.catalogVersion,
          problem: null,
        };
        void this.#prefetchFiles();
      }
    } catch {
      // A damaged or partial cache is ignored; the network fills it again.
    }
    if (!this.#manifest) {
      // Nothing cached: wait for the catalog once (the fallback otherwise).
      await this.refresh();
    } else {
      const later = () => void this.refresh();
      if (typeof requestIdleCallback === 'function')
        requestIdleCallback(later, { timeout: 3000 });
      else setTimeout(later, 500);
    }
  }

  /** Checks for a newer catalog; safe to call at any time. */
  refresh(): Promise<RefreshResult> {
    this.#refreshing ??= this.#refresh().finally(
      () => (this.#refreshing = null),
    );
    return this.#refreshing;
  }
  async #refresh(): Promise<RefreshResult> {
    if (!this.options.url) {
      this.#status = {
        ...this.#status,
        problem: 'No library catalog is set up for this editor.',
      };
      this.#emit();
      return 'offline';
    }
    const cache = await this.options.cache;
    const cached = await cache
      .get<CachedManifest>(MANIFEST_KEY)
      .catch(() => undefined);
    let response: Response;
    try {
      response = await this.#fetch(this.#href('manifest.json'), {
        cache: 'no-cache',
        headers:
          cached?.etag && this.#manifest
            ? { 'if-none-match': cached.etag }
            : {},
      });
    } catch {
      this.#status = {
        ...this.#status,
        problem: this.#manifest
          ? 'The library catalog cannot be reached; the saved copy is used.'
          : 'The library catalog cannot be reached.',
      };
      this.#emit();
      return 'offline';
    }
    if (response.status === 304 && this.#manifest) {
      if (this.#status.problem) {
        this.#status = { ...this.#status, problem: null };
        this.#emit();
      }
      return 'unchanged';
    }
    if (!response.ok) {
      this.#status = {
        ...this.#status,
        problem: `The library catalog answered ${response.status}${this.#manifest ? '; the saved copy is used' : ''}.`,
      };
      this.#emit();
      return 'offline';
    }
    const text = await response.text();
    try {
      const manifest = await verifyManifest(text, this.options.publicKey);
      const have = this.#manifest?.catalogVersion ?? 0;
      if (manifest.catalogVersion < have)
        throw new CatalogRejected(
          'The catalog is older than the one already saved here.',
        );
      if (manifest.catalogVersion === have && this.#manifest) {
        await cache.put({
          [MANIFEST_KEY]: {
            text,
            etag: response.headers.get('etag'),
            catalogVersion: have,
          },
        });
        return 'unchanged';
      }
      const indexes = new Map<CatalogCategory, CategoryIndex>();
      const writes: Record<string, unknown> = {};
      for (const category of CATALOG_CATEGORIES) {
        const ref = manifest.categories[category];
        const old = this.#indexes.get(category);
        const oldSha = this.#manifest?.categories[category].sha256;
        if (old && oldSha === ref.sha256) {
          indexes.set(category, old);
          continue;
        }
        const indexResponse = await this.#fetch(this.#href(ref.url));
        if (!indexResponse.ok)
          throw new Error(
            `The ${category} index answered ${indexResponse.status}.`,
          );
        const indexText = await indexResponse.text();
        if ((await sha256(indexText)) !== ref.sha256)
          throw new CatalogRejected(
            `The ${category} index does not match the signed catalog.`,
          );
        const index = categoryIndexSchema.parse(JSON.parse(indexText));
        indexes.set(category, index);
        writes[indexKey(category)] = {
          sha256: ref.sha256,
          index,
        } satisfies CachedIndex;
      }
      // Indexes first, the manifest last: a cut-off write keeps the old one.
      await cache.put(writes);
      await cache.put({
        [MANIFEST_KEY]: {
          text,
          etag: response.headers.get('etag'),
          catalogVersion: manifest.catalogVersion,
        },
      });
      this.#manifest = manifest;
      this.#indexes = indexes;
      this.#status = {
        source: 'catalog',
        catalogVersion: manifest.catalogVersion,
        problem: null,
      };
      this.#emit();
      void this.#prefetchFiles();
      return 'updated';
    } catch (error) {
      const rejected = error instanceof CatalogRejected;
      this.#status = {
        ...this.#status,
        problem: rejected
          ? `${error.message}${this.#manifest ? ' The saved copy is used.' : ''}`
          : `The library catalog could not be read${this.#manifest ? '; the saved copy is used' : ''}.`,
      };
      this.#emit();
      return rejected ? 'rejected' : 'offline';
    }
  }

  /** Entries listed now in a category (hidden and scheduled ones left out). */
  entries(category: CatalogCategory): CatalogEntry[] {
    const index = this.#indexes.get(category);
    if (!index) return [];
    const now = (this.options.now ?? Date.now)();
    return orderEntries(index.entries.filter((entry) => isListed(entry, now)));
  }
  entry(id: string): CatalogEntry | undefined {
    for (const index of this.#indexes.values()) {
      const found = index.entries.find((entry) => entry.id === id);
      if (found) return found;
    }
    return undefined;
  }
  /** The library manifest the panels read (the loader's shape, P1-22). */
  manifest(): LibraryManifest {
    if (!this.#manifest)
      return {
        version: 1,
        pack: { id: 'fallback', name: { en: 'Basics', hi: 'बुनियादी' } },
        templates: [],
        items: [...FALLBACK_ITEMS],
      };
    const items: LibraryItem[] = [];
    for (const category of ['elements', 'draw', 'text', 'templates'] as const)
      for (const entry of this.entries(category)) {
        const record = this.#record(entry);
        if (record) items.push(record);
      }
    return {
      version: 1,
      pack: { id: 'catalog', name: { en: 'Library', hi: 'लाइब्रेरी' } },
      templates: (this.#indexes.get('templates')?.taxonomy ??
        []) as TemplateCategory[],
      items,
    };
  }
  #records = new Map<string, LibraryItem | null>();
  /** A library record from an inline payload (validated once). */
  #record(entry: CatalogEntry): LibraryItem | null {
    const key = `${entry.id}@${entry.itemVersion}`;
    if (this.#records.has(key)) return this.#records.get(key)!;
    if (!('inline' in entry.payload)) return null; // Until its file arrives.
    const parsed = libraryItemSchema.safeParse(entry.payload.inline);
    const record = parsed.success ? parsed.data : null;
    this.#records.set(key, record);
    return record;
  }
  /** Inline payloads of a category (themes, styles, motion, presets). */
  payloads(
    category: CatalogCategory,
  ): { entry: CatalogEntry; payload: unknown }[] {
    return this.entries(category).flatMap((entry) =>
      'inline' in entry.payload
        ? [{ entry, payload: entry.payload.inline }]
        : [],
    );
  }
  url(path: string): string {
    return this.#href(path);
  }

  // --- Files (payloads, thumbnails, media) ----------------------------------
  /** A catalog file: from the media store when cached, else the network. */
  file(ref: FileRef, key = catalogFileKey(ref.sha256)): Promise<Blob | null> {
    const known = this.#pending.get(key);
    if (known) return known;
    const loading = (async () => {
      const store = await this.options.media;
      const cached = await store?.read(key).catch(() => null);
      if (cached)
        return cached.type ? cached : cached.slice(0, cached.size, ref.mime);
      if (!this.options.url) return null;
      const response = await this.#fetch(this.#href(ref.url));
      if (!response.ok) throw new Error(`answered ${response.status}`);
      const bytes = await response.arrayBuffer();
      if ((await sha256(bytes)) !== ref.sha256)
        throw new Error('The file does not match the catalog.');
      const blob = new Blob([bytes], { type: ref.mime });
      await store?.write(key, blob).catch(() => undefined);
      return blob;
    })();
    this.#pending.set(key, loading);
    loading.then(
      () => this.#pending.delete(key),
      () => this.#pending.delete(key),
    );
    return loading;
  }
  /** Whether a file is already in this browser (no network needed). */
  async has(ref: FileRef, key = catalogFileKey(ref.sha256)): Promise<boolean> {
    const store = await this.options.media;
    return !!store && (await store.has(key).catch(() => false));
  }
  /** A decoded poster ready to draw at once (after `prefetch`). */
  poster(sha: string): ImageBitmap | HTMLImageElement | null {
    return this.#posters.get(sha) ?? null;
  }
  /**
   * P1-24, P1-25: makes an entry local before it is used: a heavy item's
   * poster (decoded) and proxy (as a media file); a small item's payload
   * file. Called when the card shows and on pointer enter or down.
   */
  async prefetch(entry: CatalogEntry): Promise<void> {
    const media = entry.media;
    if (media?.poster && !this.#posters.has(media.poster.sha256)) {
      const blob = await this.file(media.poster).catch(() => null);
      if (blob) {
        const image = await decodePicture(blob).catch(() => null);
        if (image) this.#posters.set(media.poster.sha256, image);
      }
    }
    if (media?.proxy)
      await this.file(media.proxy, catalogMediaKey(media.proxy.sha256)).catch(
        () => null,
      );
    if ('file' in entry.payload)
      await this.file(entry.payload.file).catch(() => null);
  }
  /**
   * Prefetches every payload file of the catalog (idle time), so an item
   * too large to inline is local before its card is used.
   */
  async #prefetchFiles() {
    const queue: CatalogEntry[] = [];
    for (const category of CATALOG_CATEGORIES)
      for (const entry of this.entries(category))
        if ('file' in entry.payload) queue.push(entry);
    let sinceEmit = 0;
    // Four at a time, and items show in batches as they arrive, so a long
    // list of large items fills in while the panel is open.
    const worker = async () => {
      for (let entry = queue.shift(); entry; entry = queue.shift()) {
        if (!('file' in entry.payload)) continue;
        const key = `${entry.id}@${entry.itemVersion}`;
        if (this.#records.get(key)) continue;
        const blob = await this.file(entry.payload.file).catch(() => null);
        if (!blob) continue;
        const parsed = libraryItemSchema.safeParse(
          JSON.parse(await blob.text()) as unknown,
        );
        if (!parsed.success) continue;
        this.#records.set(key, parsed.data);
        if (++sinceEmit >= 12) {
          sinceEmit = 0;
          this.#emit();
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (sinceEmit) this.#emit();
  }
}

async function decodePicture(
  blob: Blob,
): Promise<ImageBitmap | HTMLImageElement> {
  if (
    blob.type === 'image/svg+xml' ||
    typeof createImageBitmap !== 'function'
  ) {
    const image = new Image();
    image.src = URL.createObjectURL(blob);
    await image.decode();
    return image;
  }
  return createImageBitmap(blob);
}
