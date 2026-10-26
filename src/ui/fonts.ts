// J5: registers the bundled fonts (render/fonts.ts) with the page and loads
// the faces the project uses, so the canvas measures and draws them with
// their real weights; `loaded` redraws once a face arrives.
import type { EditorEngine } from '../core';
import { bundledFaces, isBundledFont, usedFaces } from '../render/fonts';
import { isCatalogFont } from '../text-engine/catalog';
import { loadFont } from '../text-engine/fonts';
import { loadUploadedFont } from '../text-engine/uploaded';
import { SYSTEM_FONTS } from '../render/text-style';
import { showToast } from './components/toast';
import { t } from '../i18n';
import type { SceneLayer } from '../render/adapter';

type Scenes = readonly { readonly layers: readonly SceneLayer[] }[];
export function mountFonts(
  engine: EditorEngine,
  loaded: () => void,
): (() => void) & { prefetch(scenes: Scenes): void } {
  if (typeof FontFace === 'undefined' || !document.fonts)
    return Object.assign(() => {}, { prefetch: () => {} });
  const faces = bundledFaces(import.meta.env.BASE_URL).map((source) => {
    const face = new FontFace(
      source.family,
      `url(${source.url}) format('woff2')`,
      {
        weight: String(source.weight),
        unicodeRange: source.unicodeRange,
        display: 'swap',
      },
    );
    document.fonts.add(face);
    return { source, face };
  });
  const requested = new Set<string>();
  const warned = new Set<string>();
  const failedAt = new Map<string, number>();
  const ensure = () =>
    ensureFor(engine.state.compositions as unknown as Scenes);
  // Phase 1 library (P1-24): the faces a library card would use load when
  // the card shows or the pointer reaches it, so placing it needs no font
  // request.
  const ensureFor = (scenes: Scenes) => {
    const used = usedFaces(scenes);
    for (const { source, face } of faces)
      if (
        face.status === 'unloaded' &&
        used.has(`${source.family}|${source.weight}`)
      )
        face.load().then(loaded, () => undefined);
    // FINAL2 U6: catalog fonts the project uses come from the text engine's
    // cache (or download); a failure says so once and keeps a fallback.
    for (const key of used) {
      const [family, weight, italic] = key.split('|');
      // FINAL3 T4: an uploaded font is registered from this browser's cache.
      if (
        family &&
        !isCatalogFont(family) &&
        !isBundledFont(family) &&
        !SYSTEM_FONTS.some(([name]) => name === family) &&
        !requested.has(key)
      ) {
        requested.add(key);
        void loadUploadedFont(family, document.fonts).then((found) => {
          if (found) loaded();
          else if (!warned.has(family)) {
            warned.add(family);
            showToast(t('fonts.uploadedMissing', { font: family }), 'info');
          }
        });
        continue;
      }
      if (!family || !isCatalogFont(family) || isBundledFont(family)) continue;
      if (requested.has(key)) continue;
      // A failed font is asked for again after 30 s, not on every edit.
      if (Date.now() - (failedAt.get(key) ?? -Infinity) < 30_000) continue;
      requested.add(key);
      loadFont(family, [Number(weight) || 400], ['latin'], {
        offline: navigator.onLine === false,
        italic: italic === 'i',
      }).then(loaded, () => {
        requested.delete(key);
        failedAt.set(key, Date.now());
        if (warned.has(family)) return;
        warned.add(family);
        showToast(t('fonts.error.project', { font: family }), 'error');
      });
    }
  };
  ensure();
  return Object.assign(engine.on('state:changed', ensure), {
    prefetch: (scenes: Scenes) => ensureFor(scenes),
  });
}
