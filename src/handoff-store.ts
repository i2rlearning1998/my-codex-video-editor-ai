// P2-R2 (P2B-23): files the panel's build made (AI pictures, the voice) wait
// here, in this browser's IndexedDB, until the editor takes the handoff and
// imports them into Project Media, where the plan's builder finds them by
// name. DOM-light: IndexedDB only; no editor or panel imports.
export interface HandoffFile {
  readonly name: string;
  readonly type: string;
  readonly bytes: Uint8Array;
}
const DB = 'aive-handoff';
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
export const putHandoffFiles = (id: string, files: readonly HandoffFile[]) =>
  tx('readwrite', (s) => s.put(files, id)).then(() => undefined);
/** Reads and removes the files of one handoff (none: an empty list). */
export async function takeHandoffFiles(id: string): Promise<HandoffFile[]> {
  try {
    const files = (await tx('readonly', (s) => s.get(id))) as
      | HandoffFile[]
      | undefined;
    await tx('readwrite', (s) => s.delete(id));
    return files ?? [];
  } catch {
    return [];
  }
}
/** Base64 (as the gateway returns media) to bytes. */
export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
