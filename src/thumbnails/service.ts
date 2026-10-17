import { openMediaStore } from '../media/store';
import { thumbnailKey, thumbnailSize } from './key';
import { renderThumbnail, placeholder } from './render';
import type {
  ThumbnailItem,
  ThumbnailOptions,
  PreviewOptions,
  ThumbnailCache,
  ThumbnailRender,
} from './types';

export function createThumbnailService(
  options: {
    cache?: ThumbnailCache | null;
    render?: ThumbnailRender;
    timeoutMs?: number;
  } = {},
) {
  const cache =
    options.cache === undefined
      ? openMediaStore()
      : Promise.resolve(options.cache);
  const render = options.render ?? renderThumbnail;
  const pending = new Map<
    string,
    { promise: Promise<Blob>; users: Set<symbol>; controller: AbortController }
  >();
  const recent = new Map<string, Blob>();
  const hashing = new WeakMap<object, Map<string, Promise<string>>>();
  const keyFor = (
    item: ThumbnailItem,
    size: { width: number; height: number },
    progress: number,
  ) => {
    let active = hashing.get(item);
    if (!active) {
      active = new Map();
      hashing.set(item, active);
    }
    const position = `${size.width}x${size.height}:${progress}`;
    const existing = active.get(position);
    if (existing) return existing;
    const entries = active;
    const key = thumbnailKey(item, size, progress).finally(() =>
      entries.delete(position),
    );
    entries.set(position, key);
    return key;
  };
  const remember = (key: string, blob: Blob) => {
    const prefix = key.slice(0, key.indexOf('-') + 1);
    const contentPrefix = key.slice(0, key.indexOf('-', prefix.length) + 1);
    for (const old of recent.keys())
      if (old.startsWith(prefix) && !old.startsWith(contentPrefix))
        recent.delete(old);
    recent.set(key, blob);
    // Retain completed fast jobs for late hash completions without unbounded RAM.
    let bytes = [...recent.values()].reduce(
      (sum, value) => sum + value.size,
      0,
    );
    for (const [old, value] of recent) {
      if (recent.size <= 64 && bytes <= 8 * 1024 * 1024) break;
      recent.delete(old);
      bytes -= value.size;
    }
  };
  let queue: Promise<unknown> = Promise.resolve();
  const request = async (
    input: unknown,
    opts: ThumbnailOptions,
    progress: number,
  ): Promise<Blob> => {
    const fallback = () => placeholder(opts.width, opts.height);
    try {
      const size = thumbnailSize(opts);
      if (opts.signal?.aborted) return fallback();
      if (
        !input ||
        typeof input !== 'object' ||
        !('id' in input) ||
        typeof input.id !== 'string' ||
        !('type' in input) ||
        typeof input.type !== 'string'
      )
        return fallback();
      const item = input as ThumbnailItem;
      const key = await keyFor(item, size, progress);
      if (opts.signal?.aborted) return fallback();
      const completed = recent.get(key);
      if (completed) return completed;
      let job = pending.get(key);
      if (job?.controller.signal.aborted) job = undefined;
      if (!job) {
        const users = new Set<symbol>();
        const controller = new AbortController();
        const promise = queue
          .then(async () => {
            if (!users.size) return fallback();
            const storage = await cache.catch(() => null);
            try {
              const hit = await storage?.read(key);
              if (hit) {
                remember(key, hit);
                return hit;
              }
            } catch {
              /* Cache failure must not block rendering. */
            }
            if (!users.size) return fallback();
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
              const result = await Promise.race([
                render(item, { ...size, progress, signal: controller.signal }),
                new Promise<never>((_, reject) => {
                  timer = setTimeout(() => {
                    controller.abort();
                    reject(Error('Thumbnail timed out'));
                  }, options.timeoutMs ?? 5000);
                }),
              ]);
              if (
                !(result instanceof Blob) ||
                !result.size ||
                controller.signal.aborted
              )
                return fallback();
              remember(key, result);
              if (storage)
                try {
                  // Drop older content for this id; keep other sizes and frame positions.
                  const prefix = key.slice(0, key.indexOf('-') + 1);
                  const contentPrefix = key.slice(
                    0,
                    key.indexOf('-', prefix.length) + 1,
                  );
                  for (const old of await storage.keys())
                    if (
                      old.startsWith(prefix) &&
                      !old.startsWith(contentPrefix)
                    )
                      await storage.remove(old);
                  await storage.write(key, result);
                } catch {
                  /* A full/unavailable cache still returns the freshly rendered image. */
                }
              return result;
            } catch {
              return fallback();
            } finally {
              if (timer !== undefined) clearTimeout(timer);
            }
          })
          .catch(fallback)
          .finally(() => {
            if (pending.get(key)?.controller === controller)
              pending.delete(key);
          });
        job = { promise, users, controller };
        pending.set(key, job);
        queue = promise;
      }
      const current = job,
        token = Symbol();
      current.users.add(token);
      return await new Promise<Blob>((resolve) => {
        const finish = (blob: Blob) => {
          opts.signal?.removeEventListener('abort', abort);
          current.users.delete(token);
          resolve(blob);
        };
        const abort = () => {
          finish(fallback());
          if (!current.users.size) current.controller.abort();
        };
        opts.signal?.addEventListener('abort', abort, { once: true });
        if (opts.signal?.aborted) abort();
        else void current.promise.then(finish);
      });
    } catch {
      return fallback();
    }
  };
  return {
    getThumbnail: (item: unknown, options: ThumbnailOptions) =>
      request(item, options, 0),
    getPreviewFrames: async (
      item: unknown,
      options: PreviewOptions,
    ): Promise<Blob[]> => {
      const count = Number.isFinite(options.count)
        ? Math.max(1, Math.min(24, Math.floor(options.count)))
        : 1;
      // Hashing uses Web Crypto and can complete out of order. Enqueue each
      // frame after the previous one finishes so stateful live providers see
      // monotonically increasing time, not hash-completion order.
      const frames: Blob[] = [];
      for (let i = 0; i < count; i++)
        frames.push(await request(item, options, i / count));
      return frames;
    },
  };
}
const service = createThumbnailService();
export const getThumbnail = service.getThumbnail;
export const getPreviewFrames = service.getPreviewFrames;
