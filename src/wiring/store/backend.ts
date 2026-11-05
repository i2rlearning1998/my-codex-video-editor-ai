// P3-WIRING (W2): where the Style > Project > Chat records live. Local-first
// (IndexedDB in the browser); the interface lets a Supabase backend be added
// later without changing the store. Values are JSON.
export interface RecordBackend {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  /** Keys that start with `prefix`. */
  keys(prefix: string): Promise<string[]>;
}

/** In memory (tests, and a browser without IndexedDB). */
export function memoryBackend(): RecordBackend {
  const m = new Map<string, string>();
  return {
    async get(k) {
      const v = m.get(k);
      return v === undefined ? undefined : JSON.parse(v);
    },
    async put(k, v) {
      m.set(k, JSON.stringify(v));
    },
    async remove(k) {
      m.delete(k);
    },
    async keys(prefix) {
      return [...m.keys()].filter((k) => k.startsWith(prefix)).sort();
    },
  };
}

/** IndexedDB, one object store keyed by string (the browser default). */
export function indexedDbBackend(
  name = 'aive-wiring',
  idb: IDBFactory = globalThis.indexedDB,
): RecordBackend {
  let db: Promise<IDBDatabase> | null = null;
  const open = () =>
    (db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = idb.open(name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('records');
      r.onsuccess = () => {
        const d = r.result;
        // The browser may close it; open again next time (D-347).
        d.onclose = () => (db = null);
        resolve(d);
      };
      r.onerror = () => reject(r.error);
    }));
  const req = <T>(
    mode: IDBTransactionMode,
    fn: (s: IDBObjectStore) => IDBRequest<T>,
  ) =>
    open().then(
      (d) =>
        new Promise<T>((resolve, reject) => {
          const r = fn(d.transaction('records', mode).objectStore('records'));
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        }),
    );
  return {
    get: (k) => req('readonly', (s) => s.get(k)),
    put: (k, v) => req('readwrite', (s) => s.put(v, k)).then(() => undefined),
    remove: (k) => req('readwrite', (s) => s.delete(k)).then(() => undefined),
    keys: (prefix) =>
      req('readonly', (s) =>
        s.getAllKeys(IDBKeyRange.bound(prefix, `${prefix}￿`)),
      ).then((ks) => ks.map(String).sort()),
  };
}
