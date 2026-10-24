import { assertActive, ProviderError, type FetchLike } from '../providers';
import { SpeechError, type SpeechProgress } from './types';
import type { ModelFile } from './models';
export interface ModelStore {
  get(key: string): Promise<Blob | undefined>;
  put(key: string, blob: Blob): Promise<void>;
  delete(key: string): Promise<void>;
}
/**
 * FIX5 C9: a model download that failed, naming the file and the host (never
 * a bare "network error"), with the HTTP status and the bytes that arrived.
 */
export class ModelDownloadError extends ProviderError {
  readonly file: string;
  readonly host: string;
  readonly bytes: number;
  readonly reason: 'network' | 'http' | 'stalled';
  constructor(
    reason: 'network' | 'http' | 'stalled',
    file: ModelFile,
    detail: { status?: number; bytes?: number; quietMs?: number } = {},
  ) {
    super(reason === 'http' ? 'BAD_RESPONSE' : 'NETWORK', undefined, {
      ...(detail.status !== undefined ? { status: detail.status } : {}),
      endpoint: file.url,
    });
    this.name = 'ModelDownloadError';
    this.reason = reason;
    this.file = file.id;
    this.bytes = detail.bytes ?? 0;
    let host = file.url;
    try {
      host = new URL(file.url).host;
    } catch {
      /* Keep the whole address. */
    }
    this.host = host;
    this.message =
      reason === 'http'
        ? `The server ${host} answered HTTP ${detail.status} for ${file.id}.`
        : reason === 'stalled'
          ? `No data arrived from ${host} for ${Math.round((detail.quietMs ?? 0) / 1000)} s while downloading ${file.id} (${this.bytes} bytes so far).`
          : `The connection to ${host} failed while starting ${file.id} (blocked, offline or a security rule).`;
  }
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
  const MAX = 512 * 1024 * 1024;
  // FINAL2 U11: a file not yet pinned (`sha256: null`, run `npm run
  // models:pin`) is checked by size only: its exact size when known, else
  // any non-empty file under the cap.
  const key = (file: ModelFile) =>
    `${file.id}/${file.sha256 ? file.sha256.toLowerCase() : 'size-only'}`;
  async function valid(file: ModelFile, blob: Blob) {
    if (file.sizeBytes !== null && blob.size !== file.sizeBytes) return false;
    if (!file.sha256) return blob.size > 0 && blob.size <= MAX;
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
      (file.sizeBytes !== null &&
        (!Number.isSafeInteger(file.sizeBytes) ||
          file.sizeBytes < 1 ||
          file.sizeBytes > MAX)) ||
      (file.sha256 !== null && !/^[a-f0-9]{64}$/i.test(file.sha256))
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
        /** No bytes for this long (ms) is a stall; default one minute. */
        stallMs?: number;
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
        throw new ModelDownloadError('network', file);
      }
      assertActive(options.signal);
      if (!response.ok || !response.body)
        throw new ModelDownloadError('http', file, { status: response.status });
      // Sizes come from the pinned list, else the server's Content-Length
      // (absent for chunked answers: then the total is unknown).
      const announced = Number(response.headers.get('content-length'));
      const total =
        file.sizeBytes ??
        (Number.isFinite(announced) && announced > 0 ? announced : null);
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
          const stallMs = options.stallMs ?? 60_000;
          let timer: ReturnType<typeof setTimeout> | undefined;
          const part = await Promise.race([
            reader.read(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () =>
                  reject(
                    new ModelDownloadError('stalled', file, {
                      bytes: size,
                      quietMs: stallMs,
                    }),
                  ),
                stallMs,
              );
            }),
          ]).finally(() => clearTimeout(timer));
          assertActive(options.signal);
          if (part.done) break;
          size += part.value.length;
          if (size > (file.sizeBytes ?? MAX))
            throw new SpeechError('INTEGRITY_FAILED');
          chunks.push(part.value);
          options.onProgress?.({
            phase: 'download',
            completed: size,
            total,
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
