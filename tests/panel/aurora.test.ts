// P2-R2 Part E: the Aurora Ink tokens: one file, the config's defaults, and
// AA contrast for every text/background pair in both themes.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AURORA } from '../../src/panel/aurora-tokens';
import { defaultConfig } from '../../src/platform-config';

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

describe('P2-R2 Aurora Ink', () => {
  it('[P2R2-028] one token file holds the Aurora Ink values; the config brand colours match; panel CSS has no colour literals', () => {
    const css = readFileSync('src/panel/aurora.css', 'utf8');
    for (const theme of ['dark', 'light'] as const)
      for (const v of Object.values(AURORA[theme]))
        expect(css.toLowerCase(), `${theme} ${v}`).toContain(v);
    for (const v of [AURORA.violet, AURORA.cyan, AURORA.gold])
      expect(css).toContain(v);
    const c = defaultConfig().brand.colors;
    expect(c).toMatchObject({
      accent: AURORA.violet,
      accent2: AURORA.cyan,
      gold: AURORA.gold,
      bg: AURORA.dark.bg,
      panel: AURORA.dark.panel,
      border: AURORA.dark.border,
      text: AURORA.dark.text,
      muted: AURORA.dark.muted,
    });
    const panel = readFileSync('src/panel/panel.css', 'utf8');
    expect(panel.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
    expect(css).toContain("'Plus Jakarta Sans'");
    expect(css).toContain("'JetBrains Mono'");
    expect(css).toMatch(/:lang\(hi\)[^{]*\{\s*line-height: 1\.6/);
  });

  it('[P2R2-034] every text and surface pair meets AA (4.5:1) in both themes, and text on the aurora gradient too', () => {
    for (const theme of ['dark', 'light'] as const) {
      const t = AURORA[theme];
      for (const surface of [t.bg, t.panel, t.raised])
        for (const [name, ink] of Object.entries({
          text: t.text,
          muted: t.muted,
          accentText: t.accentText,
          goldText: t.goldText,
          danger: t.danger,
          success: t.success,
        }))
          expect(
            ratio(ink, surface),
            `${theme} ${name} on ${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
    }
    for (const stop of [AURORA.violet, AURORA.cyan])
      expect(ratio(AURORA.dark.onAurora, stop)).toBeGreaterThanOrEqual(4.5);
  });
});
