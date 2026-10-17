export type AppearanceMode = 'dark' | 'light';
export interface AccentPalette {
  readonly id: string;
  readonly name: string;
  readonly accent: string;
  readonly accentHover: string;
  readonly accentActive: string;
  readonly accentSoft: string;
  readonly accentContrast: string;
}
/** Literal source: src/ui/tokens.css --panel and --text (not canvas colours). */
export const MODE_COLORS = {
  dark: { panel: '#1a1c23', text: '#eceef4' },
  light: { panel: '#ffffff', text: '#14161d' },
} as const;
function palette(
  id: string,
  name: string,
  accent: string,
  hover: string,
  active: string,
  soft: string,
  contrast: string,
): AccentPalette {
  return Object.freeze({
    id,
    name,
    accent,
    accentHover: hover,
    accentActive: active,
    accentSoft: soft,
    accentContrast: contrast,
  });
}
/** First four colour tokens exactly preserve existing purple/hover/pressed/soft. */
export const DARK_ACCENTS: readonly AccentPalette[] = Object.freeze([
  palette(
    'purple',
    'Purple',
    '#7c5cff',
    '#8f74ff',
    '#6a49f0',
    'rgba(124, 92, 255, 0.16)',
    '#000000',
  ),
  palette(
    'blue',
    'Blue',
    '#60a5fa',
    '#93c5fd',
    '#3b82f6',
    'rgba(96, 165, 250, 0.16)',
    '#0e0f13',
  ),
  palette(
    'teal',
    'Teal',
    '#2dd4bf',
    '#5eead4',
    '#14b8a6',
    'rgba(45, 212, 191, 0.16)',
    '#0e0f13',
  ),
  palette(
    'green',
    'Green',
    '#4ade80',
    '#86efac',
    '#22c55e',
    'rgba(74, 222, 128, 0.16)',
    '#0e0f13',
  ),
  palette(
    'amber',
    'Amber',
    '#fbbf24',
    '#fcd34d',
    '#f59e0b',
    'rgba(251, 191, 36, 0.16)',
    '#0e0f13',
  ),
  palette(
    'pink',
    'Pink',
    '#f472b6',
    '#f9a8d4',
    '#ec4899',
    'rgba(244, 114, 182, 0.16)',
    '#0e0f13',
  ),
  palette(
    'red',
    'Red',
    '#fb7185',
    '#fda4af',
    '#f43f5e',
    'rgba(251, 113, 133, 0.16)',
    '#0e0f13',
  ),
  palette(
    'slate',
    'Slate',
    '#94a3b8',
    '#cbd5e1',
    '#64748b',
    'rgba(148, 163, 184, 0.16)',
    '#0e0f13',
  ),
]);
export const LIGHT_ACCENTS: readonly AccentPalette[] = Object.freeze([
  palette(
    'purple',
    'Purple',
    '#6c47ff',
    '#5b37f0',
    '#4f2ce0',
    'rgba(108, 71, 255, 0.1)',
    '#ffffff',
  ),
  palette(
    'blue',
    'Blue',
    '#2563eb',
    '#1d4ed8',
    '#1e40af',
    'rgba(37, 99, 235, 0.1)',
    '#ffffff',
  ),
  palette(
    'teal',
    'Teal',
    '#0f766e',
    '#115e59',
    '#134e4a',
    'rgba(15, 118, 110, 0.1)',
    '#ffffff',
  ),
  palette(
    'green',
    'Green',
    '#15803d',
    '#166534',
    '#14532d',
    'rgba(21, 128, 61, 0.1)',
    '#ffffff',
  ),
  palette(
    'amber',
    'Amber',
    '#b45309',
    '#92400e',
    '#78350f',
    'rgba(180, 83, 9, 0.1)',
    '#ffffff',
  ),
  palette(
    'pink',
    'Pink',
    '#be185d',
    '#9d174d',
    '#831843',
    'rgba(190, 24, 93, 0.1)',
    '#ffffff',
  ),
  palette(
    'red',
    'Red',
    '#b91c1c',
    '#991b1b',
    '#7f1d1d',
    'rgba(185, 28, 28, 0.1)',
    '#ffffff',
  ),
  palette(
    'slate',
    'Slate',
    '#475569',
    '#334155',
    '#1e293b',
    'rgba(71, 85, 105, 0.1)',
    '#ffffff',
  ),
]);
export function accentPalette(mode: AppearanceMode, id: string): AccentPalette {
  const list = mode === 'light' ? LIGHT_ACCENTS : DARK_ACCENTS;
  return list.find((p) => p.id === id) ?? list[0]!;
}
