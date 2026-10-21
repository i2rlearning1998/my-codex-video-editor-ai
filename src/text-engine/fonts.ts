import { familyHasItalic, isCatalogFont, servedWeights } from './catalog';
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
  /** FIX1 F8: the HTTP status Google Fonts answered with, if any. */
  status?: number;
  constructor(
    public readonly code:
      'OFFLINE_MISS' | 'FONT_UNAVAILABLE' | 'STORAGE' | 'ABORTED',
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = 'FontLoadError';
    if (status !== undefined) this.status = status;
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
  /** FINAL3: also the real italic faces (only when the family has them). */
  italic?: boolean;
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
      // FIX1 F8: only weights the family really has (Google refuses others).
      weights = servedWeights(family, weights);
      // FINAL3 T4: italics only when the family has real ones; otherwise the
      // browser slants the upright face (synthetic, no request, no error).
      const italic = !!request.italic && familyHasItalic(family);
      const key = keyOf(family, weights, subsets) + (italic ? '|italic' : '');
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
          const url = new URL(
            fontStylesheetUrl(family, weights, subsets, undefined, italic),
          );
          const response = await fetcher(url, {
            signal: request.signal ?? null,
            credentials: 'omit',
          });
          if (!response.ok)
            throw new FontLoadError(
              'FONT_UNAVAILABLE',
              `Google Fonts returned ${response.status} for the stylesheet`,
              response.status,
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
                `Google Fonts returned ${file.status} for a font file`,
                file.status,
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
/**
 * FIX1 F8: the Google Fonts CSS2 request for a family: only the given
 * (served) weights, normal style; `text` asks for just those glyphs (the
 * picker's preview).
 */
export function fontStylesheetUrl(
  family: string,
  weights: readonly number[],
  subsets: readonly string[] = ['latin'],
  text?: string,
  /** FINAL3 T4: the italic faces too (the caller checked they exist). */
  italic = false,
): string {
  const url = new URL('https://fonts.googleapis.com/css2');
  const list = [...new Set(weights)].sort((a, b) => a - b);
  url.searchParams.set(
    'family',
    italic
      ? list.length === 1 && list[0] === 400
        ? `${family}:ital@0;1`
        : `${family}:ital,wght@${[
            ...list.map((w) => `0,${w}`),
            ...list.map((w) => `1,${w}`),
          ].join(';')}`
      : list.length === 1 && list[0] === 400
        ? family
        : `${family}:wght@${list.join(';')}`,
  );
  url.searchParams.set('display', 'swap');
  if (text) url.searchParams.set('text', text);
  void subsets;
  return url.href;
}
/** Preview faces already asked for (family → promise). */
const previews = new Map<string, Promise<boolean>>();
/**
 * FIX1 F8: a tiny face holding only `text` (the font's name, plus a Hindi
 * word for Devanagari fonts), registered as "<family> Preview", so each row
 * of the font picker can be drawn in its own typeface without downloading
 * the family. Resolves false when it cannot load (the row keeps the
 * fallback face).
 */
export function loadFontPreview(
  family: string,
  text: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<boolean> {
  if (!isCatalogFont(family)) return Promise.resolve(false);
  const known = previews.get(family);
  if (known) return known;
  const work = (async () => {
    try {
      const weight = servedWeights(family, [400])[0]!;
      const response = await fetcher(
        fontStylesheetUrl(family, [weight], ['latin'], text),
        { credentials: 'omit' },
      );
      if (!response.ok) return false;
      const css = await response.text();
      const src = /url\(\s*['"]?([^\s)'" ]+)/.exec(css)?.[1];
      if (!src || new URL(src).hostname !== 'fonts.gstatic.com') return false;
      const file = await fetcher(src, { credentials: 'omit' });
      if (!file.ok) return false;
      const face = new FontFace(`${family} Preview`, await file.arrayBuffer());
      await face.load();
      (globalThis.document?.fonts as FontFaceSet | undefined)?.add(face);
      return true;
    } catch (error) {
      console.debug('[fonts] preview not loaded', family, error);
      return false;
    }
  })();
  previews.set(family, work);
  return work;
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
