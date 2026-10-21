export type FontCategory =
  'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace';
export interface CatalogFont {
  family: string;
  category: FontCategory;
  scripts: readonly string[];
  /** FIX1 F8: the weights Google Fonts really serves for this family. */
  weights: readonly number[];
  /** Whether it has real italics (otherwise the browser slants it). */
  italic: boolean;
}
const range = (from: number, to: number) =>
  Array.from({ length: (to - from) / 100 + 1 }, (_, i) => from + i * 100);
/**
 * FIX1 F8: weights and italics per family (Google Fonts, 2026). A request
 * for a weight a family does not have is refused by Google (HTTP 400), so
 * the loader asks only for these; bold or italic on a single-weight family
 * is drawn synthetically by the browser.
 */
const STYLES: Record<string, readonly [readonly number[], boolean]> = {
  'Noto Sans Arabic': [range(100, 900), false],
  'Noto Sans Hebrew': [range(100, 900), false],
  Inter: [range(100, 900), false],
  Poppins: [range(100, 900), true],
  'Noto Sans': [range(100, 900), true],
  Roboto: [range(100, 900), true],
  'Open Sans': [range(300, 800), true],
  Lato: [[100, 300, 400, 700, 900], true],
  Montserrat: [range(100, 900), true],
  Raleway: [range(100, 900), true],
  Nunito: [range(200, 900), true],
  'Nunito Sans': [range(200, 900), true],
  'Work Sans': [range(100, 900), true],
  'DM Sans': [range(100, 900), true],
  Manrope: [range(200, 800), false],
  Outfit: [range(100, 900), false],
  'Plus Jakarta Sans': [range(200, 800), true],
  Figtree: [range(300, 900), true],
  Mulish: [range(200, 900), true],
  Rubik: [range(300, 900), true],
  Barlow: [range(100, 900), true],
  Karla: [range(200, 800), true],
  'Noto Serif': [range(100, 900), true],
  Lora: [range(400, 700), true],
  Merriweather: [range(300, 900), true],
  'Playfair Display': [range(400, 900), true],
  'Libre Baskerville': [[400, 700], true],
  'Cormorant Garamond': [range(300, 700), true],
  'Crimson Pro': [range(200, 900), true],
  Bitter: [range(100, 900), true],
  Spectral: [range(200, 800), true],
  'DM Serif Display': [[400], true],
  'Bebas Neue': [[400], false],
  Oswald: [range(200, 700), false],
  Anton: [[400], false],
  'Abril Fatface': [[400], false],
  Righteous: [[400], false],
  'Alfa Slab One': [[400], false],
  Bungee: [[400], false],
  Cinzel: [range(400, 900), false],
  Caveat: [range(400, 700), false],
  'Dancing Script': [range(400, 700), false],
  Pacifico: [[400], false],
  Satisfy: [[400], false],
  Kalam: [[300, 400, 700], false],
  Handlee: [[400], false],
  'Space Mono': [[400, 700], true],
  'IBM Plex Mono': [range(100, 700), true],
  'Fira Code': [range(300, 700), false],
  'JetBrains Mono': [range(100, 800), true],
  'Noto Sans Devanagari': [range(100, 900), false],
  Hind: [range(300, 700), false],
  Mukta: [range(200, 800), false],
  Khand: [range(300, 700), false],
  Rajdhani: [range(300, 700), false],
  Teko: [range(300, 700), false],
  Yantramanav: [[100, 300, 400, 500, 700, 900], false],
  'Noto Serif Devanagari': [range(100, 900), false],
  'Tiro Devanagari Hindi': [[400], true],
  Martel: [[200, 300, 400, 600, 700, 800, 900], false],
  'Rozha One': [[400], false],
  'Yatra One': [[400], false],
};
const groups: readonly [FontCategory, string][] = [
  [
    'sans-serif',
    'Noto Sans Arabic|Noto Sans Hebrew|Inter|Poppins|Noto Sans|Roboto|Open Sans|Lato|Montserrat|Raleway|Nunito|Nunito Sans|Work Sans|DM Sans|Manrope|Outfit|Plus Jakarta Sans|Figtree|Mulish|Rubik|Barlow|Karla',
  ],
  [
    'serif',
    'Noto Serif|Lora|Merriweather|Playfair Display|Libre Baskerville|Cormorant Garamond|Crimson Pro|Bitter|Spectral|DM Serif Display',
  ],
  [
    'display',
    'Bebas Neue|Oswald|Anton|Abril Fatface|Righteous|Alfa Slab One|Bungee|Cinzel',
  ],
  ['handwriting', 'Caveat|Dancing Script|Pacifico|Satisfy|Kalam|Handlee'],
  ['monospace', 'Space Mono|IBM Plex Mono|Fira Code|JetBrains Mono'],
  [
    'sans-serif',
    'Noto Sans Devanagari|Hind|Mukta|Khand|Rajdhani|Teko|Yantramanav',
  ],
  [
    'serif',
    'Noto Serif Devanagari|Tiro Devanagari Hindi|Martel|Rozha One|Yatra One',
  ],
];
const hindi = new Set(
  'Poppins|Kalam|Noto Sans Devanagari|Hind|Mukta|Khand|Rajdhani|Teko|Yantramanav|Noto Serif Devanagari|Tiro Devanagari Hindi|Martel|Rozha One|Yatra One'.split(
    '|',
  ),
);
export const FONT_CATALOG: readonly CatalogFont[] = groups.flatMap(
  ([category, names]) =>
    names.split('|').map((family) => ({
      family,
      category,
      scripts: hindi.has(family) ? ['latin', 'devanagari'] : ['latin'],
      weights: STYLES[family]?.[0] ?? [400],
      italic: STYLES[family]?.[1] ?? false,
    })),
);
export const isCatalogFont = (family: string) =>
  FONT_CATALOG.some((f) => f.family === family);
/**
 * FIX1 F8: the weights to request for `wanted`: each mapped to the
 * family's nearest real weight (ties go heavier), without repeats.
 */
export function servedWeights(
  family: string,
  wanted: readonly number[],
): number[] {
  const real = FONT_CATALOG.find((f) => f.family === family)?.weights ?? [400];
  const nearest = (weight: number) =>
    [...real].sort(
      (a, b) => Math.abs(a - weight) - Math.abs(b - weight) || b - a,
    )[0]!;
  return [...new Set(wanted.map(nearest))].sort((a, b) => a - b);
}
export function fallbackChain(family: string): string {
  const category = FONT_CATALOG.find((f) => f.family === family)?.category;
  return `"${family.replace(/["\\]/g, '')}", "Noto Sans Devanagari", "Noto Sans Arabic", "Noto Sans Hebrew", ${category === 'serif' ? 'serif' : category === 'monospace' ? 'monospace' : 'sans-serif'}`;
}
