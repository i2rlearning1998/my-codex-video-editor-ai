// P4: files a person adds on Director's asset step wait here (IndexedDB, this
// browser) until the build runs, so closing the site loses nothing. Part 2
// moves them to the person's cloud Media Library. DOM-light, no imports.
export interface SlotFile {
  readonly name: string;
  readonly type: string;
  readonly blob: Blob;
}
const DB = 'aive-slot-files';
const STORE = 'files';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const r = fn(db.transaction(STORE, mode).objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
const key = (projectId: string, slot: string) => `${projectId}\u0000${slot}`;
export const putSlotFile = (projectId: string, slot: string, f: SlotFile) =>
  tx('readwrite', (s) => s.put(f, key(projectId, slot))).then(() => undefined);
export const getSlotFile = (projectId: string, slot: string) =>
  tx('readonly', (s) => s.get(key(projectId, slot))) as Promise<
    SlotFile | undefined
  >;
export const deleteSlotFile = (projectId: string, slot: string) =>
  tx('readwrite', (s) => s.delete(key(projectId, slot))).then(() => undefined);

/** The extension of a file name, with its dot ('' when it has none). */
export const extOf = (name: string): string =>
  /\.[a-z0-9]{2,5}$/i.exec(name)?.[0] ?? '';
