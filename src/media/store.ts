// Media bytes and thumbnails live here, never in project JSON or localStorage (D-004).
// Keys are slash-separated paths such as `media/<fingerprint>` or `thumbs/<fingerprint>`.

export interface WriteOptions {
  onProgress?: (written: number, total: number) => void;
  signal?: AbortSignal;
}

export interface MediaStore {
  readonly kind: 'opfs' | 'indexeddb' | 'memory';
  /** Streams the blob in; an aborted or failed write leaves nothing behind. */
  write(key: string, data: Blob, options?: WriteOptions): Promise<void>;
  /** A disk-backed Blob/File, or null when the key is missing. */
  read(key: string): Promise<Blob | null>;
  has(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

const KEY = /^[a-z]+\/[A-Za-z0-9._-]{1,128}$/;
function checkKey(key: string): [string, string] {
  if (!KEY.test(key)) throw new Error(`Invalid media key ${key}`);
  const [folder, name] = key.split('/') as [string, string];
  return [folder, name];
}
function aborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException('Import cancelled', 'AbortError');
}

export class MemoryMediaStore implements MediaStore {
  readonly kind = 'memory';
  readonly #items = new Map<string, Blob>();
  async write(key: string, data: Blob, options: WriteOptions = {}) {
    checkKey(key);
    aborted(options.signal);
    options.onProgress?.(data.size, data.size);
    this.#items.set(key, data);
  }
  async read(key: string) {
    checkKey(key);
    return this.#items.get(key) ?? null;
  }
  async has(key: string) {
    return this.#items.has(checkKey(key).join('/'));
  }
  async remove(key: string) {
    this.#items.delete(checkKey(key).join('/'));
  }
  async keys() {
    return [...this.#items.keys()].sort();
  }
}

const ROOT = 'aive-media';

/** Origin Private File System: streamed writes, disk-backed reads. */
export class OpfsMediaStore implements MediaStore {
  readonly kind = 'opfs';
  constructor(private readonly root: FileSystemDirectoryHandle) {}
  static async open(): Promise<OpfsMediaStore> {
    const origin = await navigator.storage.getDirectory();
    return new OpfsMediaStore(
      await origin.getDirectoryHandle(ROOT, { create: true }),
    );
  }
  async #folder(name: string, create: boolean) {
    try {
      return await this.root.getDirectoryHandle(name, { create });
    } catch (error) {
      if (!create && (error as DOMException).name === 'NotFoundError')
        return null;
      throw error;
    }
  }
  /** FIX6: writes of one key wait for each other (see write). */
  readonly #writing = new Map<string, Promise<unknown>>();
  async write(key: string, data: Blob, options: WriteOptions = {}) {
    // Two writes of the same file at once (a plan asking for the same
    // picture twice) fought over the swap file and one failed with "A
    // requested file or directory could not be found". They now go one after
    // the other, and a write that still meets NotFoundError is tried once more.
    const before = this.#writing.get(key) ?? Promise.resolve();
    const run = before
      .catch(() => undefined)
      .then(async () => {
        try {
          await this.#write(key, data, options);
        } catch (error) {
          if ((error as DOMException)?.name !== 'NotFoundError') throw error;
          aborted(options.signal);
          await this.#write(key, data, options);
        }
      });
    this.#writing.set(key, run);
    try {
      await run;
    } finally {
      if (this.#writing.get(key) === run) this.#writing.delete(key);
    }
  }
  async #write(key: string, data: Blob, options: WriteOptions) {
    const [folderName, name] = checkKey(key);
    aborted(options.signal);
    const folder = (await this.#folder(folderName, true))!;
    const existed = await this.has(key);
    const handle = await folder.getFileHandle(name, { create: true });
    // The writable goes to a swap file; nothing is visible until close().
    const writable = await handle.createWritable();
    const reader = data.stream().getReader();
    let written = 0;
    try {
      options.onProgress?.(0, data.size);
      for (;;) {
        aborted(options.signal);
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
        written += value.byteLength;
        options.onProgress?.(written, data.size);
      }
      aborted(options.signal);
      await writable.close();
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      await writable.abort().catch(() => undefined);
      if (!existed) await folder.removeEntry(name).catch(() => undefined);
      throw error;
    }
  }
  async read(key: string) {
    const [folderName, name] = checkKey(key);
    const folder = await this.#folder(folderName, false);
    if (!folder) return null;
    try {
      return await (await folder.getFileHandle(name)).getFile();
    } catch (error) {
      if ((error as DOMException).name === 'NotFoundError') return null;
      throw error;
    }
  }
  async has(key: string) {
    return (await this.read(key)) !== null;
  }
  async remove(key: string) {
    const [folderName, name] = checkKey(key);
    const folder = await this.#folder(folderName, false);
    await folder?.removeEntry(name).catch((error: DOMException) => {
      if (error.name !== 'NotFoundError') throw error;
    });
  }
  async keys() {
    // The DOM typings in this TypeScript version lack the async iterator.
    const entries = (folder: FileSystemDirectoryHandle) =>
      (
        folder as unknown as {
          entries(): AsyncIterable<[string, FileSystemHandle]>;
        }
      ).entries();
    const keys: string[] = [];
    for await (const [folderName, folder] of entries(this.root))
      if (folder.kind === 'directory')
        for await (const [name, file] of entries(
          folder as FileSystemDirectoryHandle,
        ))
          if (file.kind === 'file') keys.push(`${folderName}/${name}`);
    return keys.sort();
  }
}

/** IndexedDB fallback for browsers without OPFS. Blobs stay disk-backed. */
export class IndexedDbMediaStore implements MediaStore {
  readonly kind = 'indexeddb';
  #db: IDBDatabase;
  constructor(db: IDBDatabase) {
    this.#db = db;
    this.#watch(db);
  }
  static open(): Promise<IndexedDbMediaStore> {
    return IndexedDbMediaStore.#connect().then(
      (db) => new IndexedDbMediaStore(db),
    );
  }
  static #connect(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(ROOT, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('blobs');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  /** FX10: the browser may close the connection (another tab upgrading, a
   *  storage clean-up); the next call opens it again instead of failing with
   *  "The database connection is closing". */
  #closed = false;
  #watch(db: IDBDatabase) {
    db.onclose = () => {
      if (this.#db === db) this.#closed = true;
    };
    db.onversionchange = () => {
      db.close();
      if (this.#db === db) this.#closed = true;
    };
  }
  async #connection(): Promise<IDBDatabase> {
    if (this.#closed) {
      this.#db = await IndexedDbMediaStore.#connect();
      this.#closed = false;
      this.#watch(this.#db);
    }
    return this.#db;
  }
  async #run<T>(
    mode: IDBTransactionMode,
    body: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const attempt = async () => {
      const db = await this.#connection();
      return new Promise<T>((resolve, reject) => {
        const transaction = db.transaction('blobs', mode);
        const request = body(transaction.objectStore('blobs'));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    };
    try {
      return await attempt();
    } catch (error) {
      if ((error as DOMException)?.name !== 'InvalidStateError') throw error;
      this.#closed = true;
      return attempt();
    }
  }
  async write(key: string, data: Blob, options: WriteOptions = {}) {
    checkKey(key);
    aborted(options.signal);
    options.onProgress?.(0, data.size);
    await this.#run('readwrite', (store) => store.put(data, key));
    options.onProgress?.(data.size, data.size);
  }
  async read(key: string) {
    checkKey(key);
    const value = await this.#run<unknown>('readonly', (store) =>
      store.get(key),
    );
    return value instanceof Blob ? value : null;
  }
  async has(key: string) {
    checkKey(key);
    return (await this.#run('readonly', (store) => store.count(key))) > 0;
  }
  async remove(key: string) {
    checkKey(key);
    await this.#run('readwrite', (store) => store.delete(key));
  }
  async keys() {
    return (await this.#run('readonly', (store) => store.getAllKeys()))
      .map(String)
      .sort();
  }
}

/** OPFS when the browser has it, else IndexedDB; null means no media storage. */
export async function openMediaStore(): Promise<MediaStore | null> {
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage?.getDirectory === 'function'
  )
    try {
      // FX10: a browser that never answers must not leave the panel on
      // "Opening media storage" for good; after 4 s the fallback is used.
      return await Promise.race([
        OpfsMediaStore.open(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('OPFS timeout')), 4000),
        ),
      ]);
    } catch {
      // Fall through to IndexedDB (for example in a private window).
    }
  if (typeof indexedDB !== 'undefined')
    try {
      return await IndexedDbMediaStore.open();
    } catch {
      return null;
    }
  return null;
}
