import { isCatalogFont } from './catalog';
export interface FontAsset {
  family: string;
  weight: string;
  style: string;
  unicodeRange: string;
  bytes: ArrayBuffer;
}
export interface FontStore {
  get(key: string): Promise<FontAsset[] | undefined>;
  put(key: string, value: FontAsset[]): Promise<void>;
}
export type FontState = 'idle' | 'loading' | 'ready' | 'error';
export class FontLoadError extends Error {
  constructor(
    public readonly code:
      'OFFLINE_MISS' | 'FONT_UNAVAILABLE' | 'STORAGE' | 'ABORTED',
    message: string,
  ) {
    super(message);
    this.name = 'FontLoadError';
  }
}
export function createFontStore(): FontStore {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('aive-text-fonts', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('faces');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () =>
        reject(new FontLoadError('STORAGE', 'Font cache could not open'));
      req.onblocked = () =>
        reject(new FontLoadError('STORAGE', 'Font cache is blocked'));
    });
  return {
    async get(key) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('faces', 'readonly'),
          r = tx.objectStore('faces').get(key);
        tx.oncomplete = () => {
          db.close();
          resolve(r.result as FontAsset[] | undefined);
        };
        tx.onerror = () => {
          db.close();
          reject(new FontLoadError('STORAGE', 'Font cache read failed'));
        };
      });
    },
    async put(key, value) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('faces', 'readwrite');
        tx.objectStore('faces').put(value, key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(new FontLoadError('STORAGE', 'Font cache write failed'));
        };
      });
    },
  };
}
export interface FontLoaderOptions {
  store: FontStore;
  fetcher?: typeof fetch;
  register?: (asset: FontAsset) => Promise<void>;
  online?: () => boolean;
}
export interface FontRequest {
  signal?: AbortSignal;
  offline?: boolean;
  onState?: (state: FontState) => void;
}
export function createFontLoader(options: FontLoaderOptions) {
  const states = new Map<string, FontState>();
  const fetcher = options.fetcher ?? globalThis.fetch;
  const register =
    options.register ??
    (async (asset: FontAsset) => {
      const face = new FontFace(asset.family, asset.bytes, {
        weight: asset.weight,
        style: asset.style,
        unicodeRange: asset.unicodeRange,
      });
      await face.load();
      const set =
        (globalThis as unknown as { fonts?: FontFaceSet; document?: Document })
          .fonts ?? globalThis.document?.fonts;
      if (!set)
        throw new FontLoadError(
          'FONT_UNAVAILABLE',
          'Font registration is unavailable',
        );
      set.add(face);
    });
  const memory = new Map<string, FontAsset[]>();
  const keyOf = (
    family: string,
    weights: readonly number[],
    subsets: readonly string[],
  ) =>
    JSON.stringify([
      family,
      [...new Set(weights)].sort((a, b) => a - b),
      [...new Set(subsets)].sort(),
    ]);
  return {
    state(
      family: string,
      weights: readonly number[] = [400],
      subsets: readonly string[] = ['latin'],
    ) {
      return states.get(keyOf(family, weights, subsets)) ?? 'idle';
    },
    async loadFont(
      family: string,
      weights: readonly number[] = [400],
      subsets: readonly string[] = ['latin'],
      request: FontRequest = {},
    ): Promise<readonly FontAsset[]> {
      if (
        !isCatalogFont(family) ||
        !weights.length ||
        weights.some((w) => !Number.isInteger(w) || w < 100 || w > 900) ||
        subsets.some(
          (s) => !['latin', 'devanagari', 'arabic', 'hebrew'].includes(s),
        )
      )
        throw new FontLoadError('FONT_UNAVAILABLE', 'Unsupported font request');
      const key = keyOf(family, weights, subsets);
      const state = (s: FontState) => {
        states.set(key, s);
        request.onState?.(s);
      };
      const aborted = () => {
        if (request.signal?.aborted)
          throw new FontLoadError('ABORTED', 'Font loading cancelled');
      };
      state('loading');
      try {
        aborted();
        let assets = memory.get(key) ?? (await options.store.get(key));
        if (!assets) {
          if (request.offline || options.online?.() === false)
            throw new FontLoadError(
              'OFFLINE_MISS',
              'This font has not been cached on this device',
            );
          const url = new URL('https://fonts.googleapis.com/css2');
          url.searchParams.set(
            'family',
            `${family}:wght@${[...new Set(weights)].sort((a, b) => a - b).join(';')}`,
          );
          url.searchParams.set('display', 'swap');
          const response = await fetcher(url, {
            signal: request.signal ?? null,
            credentials: 'omit',
          });
          if (!response.ok)
            throw new FontLoadError(
              'FONT_UNAVAILABLE',
              'Font stylesheet could not load',
            );
          const css = await response.text();
          if (css.length > 1000000)
            throw new FontLoadError(
              'FONT_UNAVAILABLE',
              'Font stylesheet is too large',
            );
          assets = [];
          for (const match of css.matchAll(/@font-face\s*\{([^}]+)\}/g)) {
            const rule = match[1]!;
            const prop = (name: string) =>
              new RegExp(`${name}:\\s*([^;]+)`).exec(rule)?.[1]?.trim();
            const src = /url\(\s*['"]?([^\s)'" ]+)/.exec(
              prop('src') ?? '',
            )?.[1];
            if (!src) continue;
            const u = new URL(src);
            if (u.protocol !== 'https:' || u.hostname !== 'fonts.gstatic.com')
              throw new FontLoadError(
                'FONT_UNAVAILABLE',
                'Unexpected font host',
              );
            aborted();
            const file = await fetcher(u, {
              signal: request.signal ?? null,
              credentials: 'omit',
            });
            if (!file.ok)
              throw new FontLoadError(
                'FONT_UNAVAILABLE',
                'Font file could not load',
              );
            const bytes = await file.arrayBuffer();
            if (
              bytes.byteLength === 0 ||
              bytes.byteLength > 10 * 1024 * 1024 ||
              assets.length >= 100
            )
              throw new FontLoadError(
                'FONT_UNAVAILABLE',
                'Font file exceeds limits',
              );
            assets.push({
              family,
              weight: prop('font-weight') ?? '400',
              style: prop('font-style') ?? 'normal',
              unicodeRange: prop('unicode-range') ?? 'U+0-10FFFF',
              bytes,
            });
          }
          if (!assets.length)
            throw new FontLoadError(
              'FONT_UNAVAILABLE',
              'No font faces returned',
            );
          aborted();
          // Atomic manifest: incomplete requests never replace a complete cached family.
          await options.store.put(key, assets);
        }
        for (const asset of assets) {
          aborted();
          await register({ ...asset, bytes: asset.bytes.slice(0) });
        }
        memory.set(key, assets);
        state('ready');
        return assets.map((a) => ({ ...a, bytes: a.bytes.slice(0) }));
      } catch (error) {
        state('error');
        if (request.signal?.aborted)
          throw new FontLoadError('ABORTED', 'Font loading cancelled');
        throw error;
      }
    },
  };
}
let shared: ReturnType<typeof createFontLoader> | undefined;
export function loadFont(
  family: string,
  weights: readonly number[] = [400],
  subsets: readonly string[] = ['latin'],
  request: FontRequest = {},
) {
  shared ??= createFontLoader({
    store: createFontStore(),
    online: () => typeof navigator === 'undefined' || navigator.onLine,
  });
  return shared.loadFont(family, weights, subsets, request);
}
