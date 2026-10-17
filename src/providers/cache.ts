export interface CacheEntry {
  expires: number;
  value: unknown;
}
export interface CacheBackend {
  read(key: string): Promise<CacheEntry | undefined>;
  write(key: string, value: CacheEntry): Promise<void>;
}
export function indexedDbCache(): CacheBackend {
  let database: Promise<IDBDatabase> | undefined;
  const open = () =>
    (database ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(Error('Unavailable'));
        return;
      }
      const request = indexedDB.open('aive-provider-cache', 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('search');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(Error('Unavailable'));
      request.onblocked = () => reject(Error('Unavailable'));
    }));
  return {
    async read(key) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('search', 'readonly'),
          r = tx.objectStore('search').get(key);
        r.onsuccess = () => resolve(r.result as CacheEntry | undefined);
        r.onerror = () => reject(Error('Read failed'));
      });
    },
    async write(key, value) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('search', 'readwrite');
        tx.objectStore('search').put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(Error('Write failed'));
      });
    },
  };
}
export function createSearchCache(
  options: {
    ttlMs?: number;
    now?: () => number;
    backend?: CacheBackend | null;
  } = {},
) {
  const memory = new Map<string, CacheEntry>(),
    now = options.now ?? Date.now,
    backend =
      options.backend === undefined ? indexedDbCache() : options.backend;
  return {
    async get(key: string): Promise<unknown | undefined> {
      let entry = memory.get(key);
      if (!entry)
        try {
          entry = await backend?.read(key);
        } catch {
          /* In-memory fallback. */
        }
      if (!entry || !Number.isFinite(entry.expires) || entry.expires <= now()) {
        memory.delete(key);
        return undefined;
      }
      memory.set(key, entry);
      return structuredClone(entry.value);
    },
    async set(key: string, value: unknown, ttlMs = options.ttlMs ?? 600000) {
      const entry = { expires: now() + ttlMs, value: structuredClone(value) };
      memory.set(key, entry);
      if (memory.size > 200) memory.delete(memory.keys().next().value!);
      try {
        await backend?.write(key, entry);
      } catch {
        /* In-memory fallback. */
      }
    },
  };
}
export type SearchCache = ReturnType<typeof createSearchCache>;
