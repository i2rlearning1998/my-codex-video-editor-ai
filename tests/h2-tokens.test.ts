import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// H2: the design tokens. Text, secondary text and accent-on-panel meet WCAG
// AA (4.5:1) in both themes, and the stylesheets use only defined tokens.
const tokens = readFileSync('src/ui/tokens.css', 'utf8');
const styles = readFileSync('src/style.css', 'utf8');

function block(selector: string): Record<string, string> {
  const start = tokens.indexOf(selector);
  const open = tokens.indexOf('{', start);
  const close = tokens.indexOf('}', open);
  const values: Record<string, string> = {};
  for (const match of tokens
    .slice(open + 1, close)
    .matchAll(/--([\w-]+):\s*([^;]+);/g))
    values[match[1]!] = match[2]!.trim();
  return values;
}
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
export const contrast = (a: string, b: string) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
};

describe('H2 design tokens', () => {
  const themes = {
    dark: block(":root[data-theme='dark'] {"),
    light: block(":root[data-theme='light'] {"),
  };
  it('[LAY-032] both themes define the owner-specified surfaces, text and accent', () => {
    expect(themes.dark).toMatchObject({
      stage: '#0e0f13',
      app: '#13141a',
      panel: '#1a1c23',
      raised: '#22252e',
      overlay: '#272a34',
      text: '#eceef4',
      'text-secondary': '#a6abba',
      // T7 (owner: AA everywhere): was #858a9b.
      'text-tertiary': '#9499aa',
      accent: '#7c5cff',
      'accent-hover': '#8f74ff',
      'accent-pressed': '#6a49f0',
      danger: '#f0616d',
      warning: '#f5b83d',
      success: '#3dd68c',
    });
    expect(themes.light).toMatchObject({
      stage: '#e9ebf0',
      app: '#f4f5f8',
      panel: '#ffffff',
      raised: '#f1f2f6',
      overlay: '#ffffff',
      text: '#14161d',
      'text-secondary': '#515668',
      // T7 (owner: AA everywhere): was #6b7085.
      'text-tertiary': '#5c6175',
      accent: '#6c47ff',
      'accent-hover': '#5b37f0',
    });
  });
  for (const [name, theme] of Object.entries(themes))
    it(`[LAY-032] ${name}: text, secondary text and accent on panels reach 4.5:1`, () => {
      for (const surface of ['panel', 'app', 'raised', 'overlay'])
        for (const ink of ['text', 'text-secondary', 'accent-text'])
          expect(
            contrast(theme[ink]!, theme[surface]!),
            `${ink} on ${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
    });
  const aa = (theme: Record<string, string>) => {
    for (const surface of [
      'stage',
      'app',
      'panel',
      'raised',
      'overlay',
      'input',
      'raised-hover',
    ])
      for (const ink of [
        'text',
        'text-secondary',
        'text-tertiary',
        'accent-text',
        'danger-text',
        'success-text',
        'warning-text',
      ])
        expect(
          contrast(theme[ink]!, theme[surface]!),
          `${ink} on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
    for (const clip of [
      'clip-text',
      'clip-shape',
      'clip-group',
      'clip-video',
      'clip-image',
      'clip-audio',
      'clip-other',
    ])
      expect(
        contrast(theme['clip-label']!, theme[clip]!),
        `clip-label on ${clip}`,
      ).toBeGreaterThanOrEqual(4.5);
    for (const fill of ['accent-fill', 'accent-fill-hover', 'danger-fill'])
      expect(
        contrast(theme['text-on-accent']!, theme[fill]!),
        `text-on-accent on ${fill}`,
      ).toBeGreaterThanOrEqual(4.5);
    // Marks (accent, focus ring) reach 3:1 on panels (WCAG 1.4.11).
    for (const mark of ['accent', 'focus-ring'])
      expect(
        contrast(theme[mark]!, theme.panel!),
        `${mark} on panel`,
      ).toBeGreaterThanOrEqual(3);
  };
  it('[LAY-051] dark: every text colour reaches 4.5:1 on every surface, clip labels on every clip colour and white on every fill', () =>
    aa(themes.dark));
  it('[LAY-051] light: every text colour reaches 4.5:1 on every surface, clip labels on every clip colour and white on every fill', () =>
    aa(themes.light));

  it('[LAY-032] every custom property the stylesheet reads is defined', () => {
    const defined = new Set(
      [...(tokens + styles).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]),
    );
    // Set at run time by components (inline styles).
    const runtime = new Set([
      '--swatch',
      '--hue',
      '--slider-fill',
      '--easing',
      '--depth',
      '--track-height',
      // J4: the text editor's paragraph spacing (inline, per layer).
      '--paragraph-spacing',
      // T6: a fixed-height text box's stored height (inline).
      '--fixed-height',
    ]);
    const missing = [
      ...new Set(
        [...styles.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]!),
      ),
    ].filter((name) => !defined.has(name) && !runtime.has(name));
    expect(missing).toEqual([]);
  });
  it('[LAY-033] motion tokens: fast 120, base 180, panel 240, slow 320, ~0 when reduced', () => {
    const root = tokens.slice(tokens.indexOf('--motion-fast'));
    expect(root).toMatch(/--motion-fast: 120ms/);
    expect(root).toMatch(/--motion-base: 180ms/);
    expect(root).toMatch(/--motion-panel: 240ms/);
    expect(root).toMatch(/--motion-slow: 320ms/);
    const reduced = tokens.slice(
      tokens.indexOf('@media (prefers-reduced-motion: reduce)'),
    );
    expect(reduced).toMatch(/--motion-panel: 1ms/);
  });
});
