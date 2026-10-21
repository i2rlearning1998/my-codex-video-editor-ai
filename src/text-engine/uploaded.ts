// FINAL3 T4 (Canva "Uploaded fonts"): the user's own .ttf, .otf, .woff or
// .woff2 files. The bytes stay in this browser (the text engine's font
// cache, IndexedDB, never the project); the project's text stores the
// family with `fontSource: 'uploaded'`. The export worker reads the same
// cache. A project opened where the font is missing falls back to a similar
// sans-serif without breaking the layout.
import { createFontStore, FontLoadError, type FontStore } from './fonts';

export const UPLOADED_KEY = 'aive.fonts.uploaded';
const PREFIX = 'uploaded:';
export const UPLOAD_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2'] as const;
const MAX_BYTES = 10 * 1024 * 1024;

/** A family name made from a file name ("My Brand-Bold.otf" → "My Brand-Bold"). */
export function uploadedFamilyName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/u, '');
  const clean = base
    .replace(/[^\p{L}\p{N} _-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 60);
  return clean || 'Uploaded font';
}
/** Family names safe to put in a CSS font list. */
export const isSafeFamily = (name: string) =>
  /^[\p{L}\p{N} _-]{1,60}$/u.test(name);

export function uploadedFonts(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(UPLOADED_KEY) ?? '[]');
    return Array.isArray(raw)
      ? raw.filter((name): name is string => typeof name === 'string')
      : [];
  } catch {
    return [];
  }
}
function remember(family: string) {
  try {
    localStorage.setItem(
      UPLOADED_KEY,
      JSON.stringify([family, ...uploadedFonts().filter((n) => n !== family)]),
    );
  } catch {
    /* Storage blocked: the font still works in this page. */
  }
}

let store: FontStore | null = null;
const fontStore = () => (store ??= createFontStore());

/** Registers stored bytes as a face in `set` (the page or a worker). */
async function register(set: FontFaceSet, family: string, bytes: ArrayBuffer) {
  const face = new FontFace(family, bytes.slice(0));
  await face.load();
  set.add(face);
}

/**
 * Checks, stores and registers an uploaded font file; resolves its family.
 * Rejects with a plain message for a file that is not a font.
 */
export async function uploadFont(
  file: File,
  set: FontFaceSet = document.fonts,
): Promise<string> {
  const lower = file.name.toLowerCase();
  if (!UPLOAD_EXTENSIONS.some((extension) => lower.endsWith(extension)))
    throw new FontLoadError(
      'FONT_UNAVAILABLE',
      'Choose a .ttf, .otf, .woff or .woff2 font file',
    );
  if (!file.size || file.size > MAX_BYTES)
    throw new FontLoadError(
      'FONT_UNAVAILABLE',
      'The font file is empty or larger than 10 MB',
    );
  const family = uploadedFamilyName(file.name);
  const bytes = await file.arrayBuffer();
  try {
    await register(set, family, bytes);
  } catch {
    throw new FontLoadError('FONT_UNAVAILABLE', 'This file is not a font');
  }
  await fontStore().put(PREFIX + family, [
    {
      family,
      weight: '100 900',
      style: 'normal',
      unicodeRange: 'U+0-10FFFF',
      bytes,
    },
  ]);
  remember(family);
  return family;
}

/** Loads an uploaded family from this browser's cache; false when missing. */
export async function loadUploadedFont(
  family: string,
  set: FontFaceSet,
  cache: FontStore = fontStore(),
): Promise<boolean> {
  try {
    const assets = await cache.get(PREFIX + family);
    if (!assets?.length) return false;
    for (const asset of assets) await register(set, family, asset.bytes);
    return true;
  } catch {
    return false;
  }
}
