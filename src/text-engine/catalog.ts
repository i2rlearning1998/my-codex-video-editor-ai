export type FontCategory =
  'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace';
export interface CatalogFont {
  family: string;
  category: FontCategory;
  scripts: readonly string[];
}
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
    })),
);
export const isCatalogFont = (family: string) =>
  FONT_CATALOG.some((f) => f.family === family);
export function fallbackChain(family: string): string {
  const category = FONT_CATALOG.find((f) => f.family === family)?.category;
  return `"${family.replace(/["\\]/g, '')}", "Noto Sans Devanagari", "Noto Sans Arabic", "Noto Sans Hebrew", ${category === 'serif' ? 'serif' : category === 'monospace' ? 'monospace' : 'sans-serif'}`;
}
