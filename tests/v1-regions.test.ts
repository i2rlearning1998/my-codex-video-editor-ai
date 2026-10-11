import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// V1 (spec 1.2): adjacent shell regions differ in luminance in both themes,
// and only the gutters use the page colour.
const css = readFileSync('src/ui/tokens.css', 'utf8');
function block(selector: string) {
  const start = css.indexOf(selector);
  return css.slice(start, css.indexOf('\n}', start));
}
const value = (source: string, name: string) =>
  new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(source)![1]!;
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const PAIRS = [
  ['rail', 'panel'],
  ['panel', 'stage'],
  ['stage', 'timeline'],
  ['stage', 'footer'],
  ['footer', 'timeline'],
  ['timeline', 'lanes'],
] as const;
const REGIONS = ['rail', 'panel', 'stage', 'footer', 'timeline', 'lanes'];

test.each([
  ['dark', ":root[data-theme='dark']"],
  ['light', ":root[data-theme='light']"],
])(
  '[LAY-064] %s: neighbouring regions differ and none uses the page colour',
  (_, selector) => {
    const source = block(selector);
    const tone = (name: string) => value(source, `region-${name}`);
    for (const [a, b] of PAIRS)
      expect(Math.abs(luminance(tone(a)) - luminance(tone(b)))).toBeGreaterThan(
        0.002,
      );
    for (const name of REGIONS)
      expect(tone(name).toLowerCase()).not.toBe(tone('page').toLowerCase());
    // The border is opaque (a six-digit colour).
    expect(tone('border')).toMatch(/^#[0-9a-f]{6}$/i);
  },
);
