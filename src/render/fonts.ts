// J5: fonts bundled with the editor (SIL Open Font License 1.1, files in
// public/fonts with their OFL.txt). They have real weights from 100 to 900,
// and Poppins and Noto Sans Devanagari also cover Devanagari. System fonts
// offer only Regular and Bold. Pure data: the UI and the export worker
// register these faces with their own FontFaceSet.
import type { SceneLayer } from './adapter';
import { parseRuns } from './rich-text';
import { textStyleOf } from './text-style';
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const DEVANAGARI =
  'U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+20F0,U+25CC,U+A830-A839,U+A8E0-A8FF,U+11B00-11B09';
export const ALL_WEIGHTS = [
  100, 200, 300, 400, 500, 600, 700, 800, 900,
] as const;
export interface BundledFont {
  readonly family: string;
  readonly generic: string;
  readonly folder: string;
  readonly prefix: string;
  readonly subsets: readonly (readonly [name: string, range: string])[];
}
export const BUNDLED_FONTS: readonly BundledFont[] = [
  {
    family: 'Inter',
    generic: 'sans-serif',
    folder: 'inter',
    prefix: 'inter',
    subsets: [['latin', LATIN]],
  },
  {
    family: 'Poppins',
    generic: 'sans-serif',
    folder: 'poppins',
    prefix: 'poppins',
    subsets: [
      ['latin', LATIN],
      ['devanagari', DEVANAGARI],
    ],
  },
  {
    family: 'Noto Sans Devanagari',
    generic: 'sans-serif',
    folder: 'noto-sans-devanagari',
    prefix: 'noto-sans-devanagari',
    subsets: [
      ['latin', LATIN],
      ['devanagari', DEVANAGARI],
    ],
  },
];
export const isBundledFont = (family: string) =>
  BUNDLED_FONTS.some((font) => font.family === family);
/** J5: the weights a family really has (system fonts: Regular and Bold). */
export function fontWeights(family: string): readonly number[] {
  return isBundledFont(family) ? ALL_WEIGHTS : [400, 700];
}
export interface FontFaceSource {
  readonly family: string;
  readonly weight: number;
  readonly url: string;
  readonly unicodeRange: string;
}
/** Every bundled face, with URLs under `base` (the app's base URL). */
export function bundledFaces(base: string): FontFaceSource[] {
  const root = base.endsWith('/') ? base : `${base}/`;
  return BUNDLED_FONTS.flatMap((font) =>
    ALL_WEIGHTS.flatMap((weight) =>
      font.subsets.map(([subset, unicodeRange]) => ({
        family: font.family,
        weight,
        url: `${root}fonts/${font.folder}/${font.prefix}-${subset}-${weight}-normal.woff2`,
        unicodeRange,
      })),
    ),
  );
}

/** Bundled family and weight pairs the project's text uses ("Inter|700"). */
export function usedFaces(
  compositions: readonly { readonly layers: readonly SceneLayer[] }[],
): Set<string> {
  const used = new Set<string>();
  const visit = (layers: readonly SceneLayer[]) => {
    for (const layer of layers) {
      if (layer.type === 'text') {
        const style = textStyleOf(layer);
        used.add(`${style.family}|${style.weight}`);
        const text = layer.properties.text;
        const runs = layer.properties.textRuns;
        for (const run of parseRuns(
          runs?.type === 'string' ? runs.value : undefined,
          text?.type === 'string' ? text.value.length : 0,
        ))
          used.add(
            `${run.family ?? style.family}|${run.weight ?? style.weight}`,
          );
      }
      visit(layer.children);
    }
  };
  compositions.forEach((composition) => visit(composition.layers));
  return new Set([...used].filter((key) => isBundledFont(key.split('|')[0]!)));
}

/** Registers every bundled face with a FontFaceSet and loads those in use. */
export async function loadUsedFonts(
  set: FontFaceSet,
  base: string,
  compositions: readonly { readonly layers: readonly SceneLayer[] }[],
): Promise<void> {
  const used = usedFaces(compositions);
  const loads: Promise<unknown>[] = [];
  for (const source of bundledFaces(base)) {
    if (!used.has(`${source.family}|${source.weight}`)) continue;
    const face = new FontFace(
      source.family,
      `url(${source.url}) format('woff2')`,
      { weight: String(source.weight), unicodeRange: source.unicodeRange },
    );
    set.add(face);
    loads.push(face.load().catch(() => undefined));
  }
  await Promise.all(loads);
}
