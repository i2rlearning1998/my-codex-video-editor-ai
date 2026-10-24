/** Bounded LRU for owned preview surfaces. Export never consults this cache. */
export function createProcessedCache<T>(
  maxBytes = 24 * 1024 * 1024,
  dispose: (value: T) => void = () => {},
) {
  const entries = new Map<string, { value: T; bytes: number }>();
  let used = 0;
  const remove = (key: string) => {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    used -= entry.bytes;
    dispose(entry.value);
  };
  return {
    get(key: string): T | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    set(key: string, value: T, bytes: number): boolean {
      if (!Number.isFinite(bytes) || bytes < 0 || bytes > maxBytes)
        return false;
      remove(key);
      while (used + bytes > maxBytes && entries.size)
        remove(entries.keys().next().value!);
      entries.set(key, { value, bytes });
      used += bytes;
      return true;
    },
    clear() {
      for (const key of entries.keys()) remove(key);
    },
    get bytes() {
      return used;
    },
  };
}

const identities = new WeakMap<object, number>();
let serial = 0;
export function frameIdentity(frame: object): number {
  let id = identities.get(frame);
  if (id === undefined) {
    id = ++serial;
    identities.set(frame, id);
  }
  return id;
}
