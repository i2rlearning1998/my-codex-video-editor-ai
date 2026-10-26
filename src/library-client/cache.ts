// Phase 1 library (P1-20): the catalog cache in this browser. The signed
// manifest text, its ETag and every category index live in IndexedDB
// (`aive-library`); payload files, thumbnails and media go to the media
// store (OPFS). A browser without IndexedDB keeps the cache in memory.
const DB = 'aive-library';
const STORE = 'kv';

export interface CacheStore {
  get<T>(key: string): Promise<T | undefined>;
  /** Writes several keys in one transaction (all or nothing). */
  put(entries: Record<string, unknown>): Promise<void>;
}

export class MemoryCache implements CacheStore {
  readonly #data = new Map<string, unknown>();
  get<T>(key: string) {
    return Promise.resolve(structuredClone(this.#data.get(key)) as T | undefined);
  }
  put(entries: Record<string, unknown>) {
    for (const [key, value] of Object.entries(entries))
      this.#data.set(key, structuredClone(value));
    return Promise.resolve();
  }
}

class IndexedCache implements CacheStore {
  constructor(private readonly db: IDBDatabase) {}
  get<T>(key: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const request = this.db.transaction(STORE).objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  }
  put(entries: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      for (const [key, value] of Object.entries(entries)) store.put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
}

export function openCache(): Promise<CacheStore> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(new MemoryCache());
  return new Promise((resolve) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(new IndexedCache(request.result));
    request.onerror = () => resolve(new MemoryCache());
    request.onblocked = () => resolve(new MemoryCache());
  });
}
