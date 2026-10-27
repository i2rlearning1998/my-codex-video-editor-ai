// Phase 1 library (P1-09): the 8 themes the editor used to bundle, now
// published into the catalog's Styles index by `npm run library:seed`.
import type { MotionStyle, Theme } from '../../src/themes/themes';

const theme = (
  id: string,
  name: string,
  palette: [string, string, string, string, string?],
  heading: string,
  body: string,
  motion: MotionStyle,
): Theme => ({
  id,
  name,
  palette: {
    background: palette[0],
    primary: palette[1],
    accent: palette[2],
    text: palette[3],
    ...(palette[4] ? { extra: palette[4] } : {}),
  },
  fonts: { heading, body },
  motion,
});
/** The 8 themes published by the seed (original palettes; fonts the editor has). */
export const SEED_THEMES: readonly Theme[] = [
  theme(
    'clean-light',
    'Clean Light',
    ['#ffffff', '#2563eb', '#f59e0b', '#111827', '#e5e7eb'],
    'Inter',
    'Inter',
    'calm',
  ),
  theme(
    'dark-neon',
    'Dark Neon',
    ['#0b0b1a', '#7c3aed', '#22d3ee', '#f8fafc', '#f472b6'],
    'Poppins',
    'Inter',
    'snappy',
  ),
  theme(
    'documentary',
    'Documentary',
    ['#1c1917', '#d6d3d1', '#ca8a04', '#fafaf9'],
    'Georgia',
    'Verdana',
    'cinematic',
  ),
  theme(
    'playful-pop',
    'Playful Pop',
    ['#fff7ed', '#ec4899', '#22c55e', '#1e1b4b', '#facc15'],
    'Poppins',
    'Poppins',
    'bouncy',
  ),
  theme(
    'corporate-blue',
    'Corporate Blue',
    ['#f8fafc', '#1d4ed8', '#0ea5e9', '#0f172a', '#cbd5e1'],
    'Arial',
    'Arial',
    'calm',
  ),
  theme(
    'warm-story',
    'Warm Story',
    ['#fef3c7', '#b45309', '#dc2626', '#422006'],
    'Georgia',
    'Trebuchet MS',
    'calm',
  ),
  theme(
    'minimal-mono',
    'Minimal Mono',
    ['#fafafa', '#171717', '#737373', '#0a0a0a'],
    'Inter',
    'Courier New',
    'snappy',
  ),
  theme(
    'cinematic-teal',
    'Cinematic Teal',
    ['#042f2e', '#14b8a6', '#fb923c', '#f0fdfa', '#99f6e4'],
    'Poppins',
    'Inter',
    'cinematic',
  ),
];
