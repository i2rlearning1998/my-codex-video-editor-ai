// ROUND-C2: the export card's media store. The card runs in a sandboxed
// frame on the person's device with no storage of its own; it reads each
// file once from our server (the export's ticket names the files it may
// read) and keeps it in memory for the render.
import type { MediaStore } from '../media/store';

export function remoteMediaStore(
  base: string,
  fetchBytes: typeof fetch = fetch,
): MediaStore {
  const cache = new Map<string, Promise<Blob | null>>();
  const read = (key: string): Promise<Blob | null> => {
    const m = /^media\/([0-9a-f]{32})$/.exec(key);
    if (!m) return Promise.resolve(null);
    let hit = cache.get(key);
    if (!hit) {
      hit = fetchBytes(`${base}/${m[1]}`).then(
        async (r) => (r.ok ? r.blob() : null),
        () => null,
      );
      cache.set(key, hit);
    }
    return hit;
  };
  return {
    kind: 'memory',
    write: async () => {
      throw new Error('The export card cannot store files.');
    },
    read,
    has: async (key) => (await read(key)) !== null,
    remove: async (key) => void cache.delete(key),
    keys: async () => [],
  };
}
