// X1 (spec section 5): baked code-animation frames. Each frame is a
// lossless PNG with alpha in the media store (OPFS, IndexedDB fallback) under
// `codeframes/<cacheKey>-<frame>`; an index (`codeindex/index.json`) records
// how many frames of a key are stored from frame 0 on, their bytes and when a
// key was last used, for the disk budget's least-recently-used eviction.
// Decoded frames are kept in memory up to a byte budget, also LRU. The
// preview and the export read the same stored frames.
import type { MediaStore } from '../media/store';

export interface FrameCodec {
  /** A lossless PNG of the frame, alpha kept. */
  encode(image: ImageBitmap): Promise<Blob>;
  decode(blob: Blob): Promise<ImageBitmap>;
}
export interface CacheEntry {
  /** Frames 0 .. stored-1 are on disk. */
  stored: number;
  total: number;
  bytes: number;
  used: number;
  width: number;
  height: number;
}
export interface CacheOptions {
  memoryBudget?: number;
  diskBudget?: number;
  now?: () => number;
}
export const frameKey = (cacheKey: string, frame: number) =>
  `codeframes/${cacheKey}-${frame}`;
const INDEX = 'codeindex/index.json';

/** PNG through an OffscreenCanvas (browser and worker). */
export const pngCodec: FrameCodec = {
  async encode(image) {
    const canvas = new OffscreenCanvas(image.width, image.height);
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    return canvas.convertToBlob({ type: 'image/png' });
  },
  decode: (blob) => createImageBitmap(blob, { premultiplyAlpha: 'default' }),
};

interface Held {
  image: ImageBitmap;
  bytes: number;
}

export class FrameCache {
  readonly #index = new Map<string, CacheEntry>();
  readonly #memory = new Map<string, Held>();
  readonly #loading = new Map<string, Promise<ImageBitmap | null>>();
  #memoryBytes = 0;
  #ready: Promise<void>;
  #indexWrite: Promise<void> = Promise.resolve();
  #indexDirty = false;
  readonly memoryBudget: number;
  readonly diskBudget: number;
  readonly #now: () => number;

  constructor(
    private readonly store: Promise<MediaStore | null>,
    private readonly codec: FrameCodec = pngCodec,
    options: CacheOptions = {},
  ) {
    this.memoryBudget = options.memoryBudget ?? 384 * 1024 * 1024;
    this.diskBudget = options.diskBudget ?? 4 * 1024 * 1024 * 1024;
    this.#now = options.now ?? (() => Date.now());
    this.#ready = this.#loadIndex();
  }

  async #loadIndex() {
    const store = await this.store;
    const blob = await store?.read(INDEX).catch(() => null);
    if (!blob) return;
    try {
      const data = JSON.parse(await blob.text()) as Record<string, CacheEntry>;
      for (const [key, entry] of Object.entries(data))
        if (
          entry &&
          Number.isInteger(entry.stored) &&
          Number.isInteger(entry.total)
        )
          this.#index.set(key, entry);
    } catch {
      // A broken index only costs a re-bake.
    }
  }
  ready(): Promise<void> {
    return this.#ready;
  }
  entry(cacheKey: string): Readonly<CacheEntry> | undefined {
    return this.#index.get(cacheKey);
  }
  /** Frames stored from 0 on (0 before the index loaded). */
  stored(cacheKey: string): number {
    return this.#index.get(cacheKey)?.stored ?? 0;
  }
  complete(cacheKey: string): boolean {
    const entry = this.#index.get(cacheKey);
    return !!entry && entry.stored >= entry.total;
  }
  /** Marks a key as used now (the disk LRU's clock). */
  touch(cacheKey: string): void {
    const entry = this.#index.get(cacheKey);
    if (entry) entry.used = this.#now();
  }

  /** Stores the next frame of a key (frames arrive in order from 0). */
  async put(
    cacheKey: string,
    frame: number,
    image: ImageBitmap,
    total: number,
  ): Promise<void> {
    await this.#ready;
    const entry = this.#index.get(cacheKey) ?? {
      stored: 0,
      total,
      bytes: 0,
      used: this.#now(),
      width: image.width,
      height: image.height,
    };
    entry.total = total;
    this.#index.set(cacheKey, entry);
    this.#remember(`${cacheKey}#${frame}`, image);
    if (frame < entry.stored) return;
    const store = await this.store;
    if (store) {
      const blob = await this.codec.encode(image);
      await store.write(frameKey(cacheKey, frame), blob);
      entry.bytes += blob.size;
    }
    if (frame === entry.stored) entry.stored = frame + 1;
    entry.used = this.#now();
    if (entry.stored >= entry.total || frame % 24 === 0) await this.flush();
  }

  /** A decoded frame when it is in memory; otherwise null (and it loads). */
  get(
    cacheKey: string,
    frame: number,
    loaded?: () => void,
  ): ImageBitmap | null {
    const id = `${cacheKey}#${frame}`;
    const held = this.#memory.get(id);
    if (held) {
      // Refresh its place in the LRU order.
      this.#memory.delete(id);
      this.#memory.set(id, held);
      return held.image;
    }
    if (frame < this.stored(cacheKey) && loaded)
      void this.load(cacheKey, frame).then((image) => {
        if (image) loaded();
      });
    return null;
  }
  /** The nearest earlier frame in memory (a stand-in while one loads). */
  nearest(cacheKey: string, frame: number, reach = 30): ImageBitmap | null {
    for (let at = frame - 1; at >= Math.max(0, frame - reach); at--) {
      const held = this.#memory.get(`${cacheKey}#${at}`);
      if (held) return held.image;
    }
    return null;
  }
  /** Reads and decodes a stored frame into memory. */
  load(cacheKey: string, frame: number): Promise<ImageBitmap | null> {
    const id = `${cacheKey}#${frame}`;
    const held = this.#memory.get(id);
    if (held) return Promise.resolve(held.image);
    let pending = this.#loading.get(id);
    if (!pending) {
      pending = (async () => {
        const store = await this.store;
        const blob = await store?.read(frameKey(cacheKey, frame));
        if (!blob) return null;
        const image = await this.codec.decode(blob);
        this.#remember(id, image);
        return image;
      })()
        .catch(() => null)
        .finally(() => this.#loading.delete(id));
      this.#loading.set(id, pending);
    }
    return pending;
  }

  #remember(id: string, image: ImageBitmap) {
    const old = this.#memory.get(id);
    if (old) {
      this.#memory.delete(id);
      this.#memoryBytes -= old.bytes;
      if (old.image !== image) old.image.close?.();
    }
    const bytes = image.width * image.height * 4;
    this.#memory.set(id, { image, bytes });
    this.#memoryBytes += bytes;
    for (const [key, item] of this.#memory) {
      if (this.#memoryBytes <= this.memoryBudget || key === id) break;
      this.#memory.delete(key);
      this.#memoryBytes -= item.bytes;
      item.image.close?.();
    }
  }

  /** Writes the index (coalesced). */
  flush(): Promise<void> {
    this.#indexDirty = true;
    this.#indexWrite = this.#indexWrite.then(async () => {
      if (!this.#indexDirty) return;
      this.#indexDirty = false;
      const store = await this.store;
      await store
        ?.write(
          INDEX,
          new Blob([JSON.stringify(Object.fromEntries(this.#index))], {
            type: 'application/json',
          }),
        )
        .catch(() => undefined);
    });
    return this.#indexWrite;
  }

  /**
   * Keeps the stored frames under the disk budget: least recently used keys
   * go first, never the keys in `keep` (the open project's bakes).
   */
  async evict(keep: ReadonlySet<string> = new Set()): Promise<string[]> {
    await this.#ready;
    let total = [...this.#index.values()].reduce((a, e) => a + e.bytes, 0);
    const removed: string[] = [];
    const order = [...this.#index.entries()]
      .filter(([key]) => !keep.has(key))
      .sort((a, b) => a[1].used - b[1].used);
    for (const [key, entry] of order) {
      if (total <= this.diskBudget) break;
      await this.remove(key);
      total -= entry.bytes;
      removed.push(key);
    }
    return removed;
  }

  async remove(cacheKey: string): Promise<void> {
    const entry = this.#index.get(cacheKey);
    this.#index.delete(cacheKey);
    for (const [id, held] of this.#memory)
      if (id.startsWith(`${cacheKey}#`)) {
        this.#memory.delete(id);
        this.#memoryBytes -= held.bytes;
        held.image.close?.();
      }
    const store = await this.store;
    if (store && entry)
      for (let frame = 0; frame < entry.stored; frame++)
        await store.remove(frameKey(cacheKey, frame)).catch(() => undefined);
    await this.flush();
  }

  get memoryBytes(): number {
    return this.#memoryBytes;
  }
}
