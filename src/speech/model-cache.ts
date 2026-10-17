import { assertActive, ProviderError, type FetchLike } from '../providers';
import { SpeechError, type SpeechProgress } from './types';
import type { ModelFile } from './models';
export interface ModelStore {
  get(key: string): Promise<Blob | undefined>;
  put(key: string, blob: Blob): Promise<void>;
  delete(key: string): Promise<void>;
}
export function createIndexedModelStore(): ModelStore {
  const run = async <T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    if (typeof indexedDB === 'undefined')
      throw new SpeechError('MODEL_UNAVAILABLE');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('aive.speech.models', 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('files');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(new SpeechError('MODEL_UNAVAILABLE'));
      r.onblocked = () => reject(new SpeechError('MODEL_UNAVAILABLE'));
    });
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction('files', mode);
      const r = work(tx.objectStore('files'));
      tx.oncomplete = () => {
        db.close();
        resolve(r.result);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(new SpeechError('MODEL_UNAVAILABLE'));
      };
    });
  };
  return {
    async get(key) {
      const value: unknown = await run('readonly', (s) => s.get(key));
      return value instanceof Blob ? value : undefined;
    },
    async put(key, blob) {
      await run('readwrite', (s) => s.put(blob, key));
    },
    async delete(key) {
      await run('readwrite', (s) => s.delete(key));
    },
  };
}
export function createModelLoader(
  store: ModelStore = createIndexedModelStore(),
  fetcher: FetchLike = (url, init) => fetch(url, init),
) {
  const key = (file: ModelFile) => `${file.id}/${file.sha256.toLowerCase()}`;
  async function valid(file: ModelFile, blob: Blob) {
    if (blob.size !== file.sizeBytes) return false;
    const digest = await crypto.subtle.digest(
      'SHA-256',
      await blob.arrayBuffer(),
    );
    return (
      Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('') === file.sha256.toLowerCase()
    );
  }
  function check(file: ModelFile) {
    if (
      !/^https:\/\//.test(file.url) ||
      !Number.isSafeInteger(file.sizeBytes) ||
      file.sizeBytes < 1 ||
      file.sizeBytes > 512 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/i.test(file.sha256)
    )
      throw new SpeechError('INVALID_INPUT');
  }
  return {
    async has(file: ModelFile) {
      check(file);
      const cached = await store.get(key(file));
      return !!cached && (await valid(file, cached));
    },
    async load(
      file: ModelFile,
      options: {
        signal?: AbortSignal;
        onProgress?: (p: SpeechProgress) => void;
        offline?: boolean;
      } = {},
    ): Promise<Blob> {
      check(file);
      assertActive(options.signal);
      const cached = await store.get(key(file));
      assertActive(options.signal);
      if (cached && (await valid(file, cached))) {
        assertActive(options.signal);
        return cached;
      }
      if (cached) await store.delete(key(file));
      if (options.offline) throw new SpeechError('MODEL_UNAVAILABLE');
      let response: Response;
      try {
        response = await fetcher(file.url, {
          signal: options.signal ?? null,
          credentials: 'omit',
        });
      } catch {
        assertActive(options.signal);
        throw new ProviderError('NETWORK');
      }
      assertActive(options.signal);
      if (!response.ok || !response.body)
        throw new ProviderError('BAD_RESPONSE');
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      const abort = () => {
        void reader.cancel().catch(() => {});
      };
      options.signal?.addEventListener('abort', abort, { once: true });
      try {
        for (;;) {
          assertActive(options.signal);
          const part = await reader.read();
          assertActive(options.signal);
          if (part.done) break;
          size += part.value.length;
          if (size > file.sizeBytes) throw new SpeechError('INTEGRITY_FAILED');
          chunks.push(part.value);
          options.onProgress?.({
            phase: 'download',
            completed: size,
            total: file.sizeBytes,
            file: file.id,
          });
        }
        const blob = new Blob(chunks);
        if (!(await valid(file, blob)))
          throw new SpeechError('INTEGRITY_FAILED');
        assertActive(options.signal);
        await store.put(key(file), blob);
        assertActive(options.signal);
        return blob;
      } finally {
        options.signal?.removeEventListener('abort', abort);
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    },
  };
}
