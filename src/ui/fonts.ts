// J5: registers the bundled fonts (render/fonts.ts) with the page and loads
// the faces the project uses, so the canvas measures and draws them with
// their real weights; `loaded` redraws once a face arrives.
import type { EditorEngine } from '../core';
import { bundledFaces, usedFaces } from '../render/fonts';
import type { SceneLayer } from '../render/adapter';

export function mountFonts(engine: EditorEngine, loaded: () => void) {
  if (typeof FontFace === 'undefined' || !document.fonts) return () => {};
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
  const ensure = () => {
    const used = usedFaces(
      engine.state.compositions as unknown as readonly {
        readonly layers: readonly SceneLayer[];
      }[],
    );
    for (const { source, face } of faces)
      if (
        face.status === 'unloaded' &&
        used.has(`${source.family}|${source.weight}`)
      )
        face.load().then(loaded, () => undefined);
  };
  ensure();
  return engine.on('state:changed', ensure);
}
