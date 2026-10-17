import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DARK_ACCENTS,
  LIGHT_ACCENTS,
  MODE_COLORS,
  contrastRatio,
  applyAccent,
  loadAppearance,
  saveAppearance,
  resolveMode,
  APPEARANCE_KEY,
  EXISTING_THEME_KEY,
  type AppearanceStorage,
} from '../../src/appearance';
const storage = (): AppearanceStorage => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
};
const tokens = readFileSync('src/ui/tokens.css', 'utf8');
describe.each([
  ['dark', DARK_ACCENTS],
  ['light', LIGHT_ACCENTS],
] as const)('%s accent palettes', (mode, palettes) => {
  it('has eight unique ids and exactly preserves the existing purple tokens', () => {
    expect(palettes).toHaveLength(8);
    expect(new Set(palettes.map((p) => p.id)).size).toBe(8);
    const segment =
      mode === 'dark'
        ? tokens.split(":root[data-theme='light']")[0]!
        : tokens.split(":root[data-theme='light']")[1]!;
    const token = (name: string) =>
      new RegExp(`--${name}:\\s*([^;]+);`).exec(segment)?.[1];
    expect(palettes[0]).toMatchObject({
      id: 'purple',
      accent: token('accent'),
      accentHover: token('accent-hover'),
      accentActive: token('accent-pressed'),
      accentSoft: token('accent-soft'),
    });
    expect(MODE_COLORS[mode]).toEqual({
      panel: token('panel'),
      text: token('text'),
    });
  });
  it.each(palettes)(
    '$id meets text, component and translucent-soft contrast thresholds',
    (palette) => {
      expect(
        contrastRatio(palette.accentContrast, palette.accent),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(palette.accent, MODE_COLORS[mode].panel),
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrastRatio(
          MODE_COLORS[mode].text,
          palette.accentSoft,
          MODE_COLORS[mode].panel,
        ),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
});
describe('appearance application and persistence', () => {
  it('sets exactly all five variables and attributes with unknown-id default fallback', () => {
    const vars: Record<string, string> = {},
      root = {
        style: {
          setProperty: (key: string, value: string) => {
            vars[key] = value;
          },
        },
        dataset: { theme: 'light' } as Record<string, string>,
      };
    const p = applyAccent(root, 'light', 'missing');
    expect(p.id).toBe('purple');
    expect(vars).toEqual({
      '--accent': p.accent,
      '--accent-hover': p.accentHover,
      '--accent-active': p.accentActive,
      '--accent-soft': p.accentSoft,
      '--accent-contrast': p.accentContrast,
    });
    expect(root.dataset).toEqual({
      theme: 'light',
      mode: 'light',
      accent: 'purple',
    });
    applyAccent(root, 'dark', 'blue');
    expect(root.dataset.accent).toBe('blue');
    expect(vars['--accent']).toBe(DARK_ACCENTS[1]!.accent);
  });
  it('round-trips distinct dark/light choices and preserves one when changing the other', () => {
    const s = storage();
    expect(saveAppearance({ dark: 'teal', light: 'red' }, () => s)).toBe(true);
    expect(loadAppearance(() => s)).toEqual({ dark: 'teal', light: 'red' });
    saveAppearance({ ...loadAppearance(() => s), dark: 'blue' }, () => s);
    expect(loadAppearance(() => s)).toEqual({ dark: 'blue', light: 'red' });
  });
  it('corrupt, absent or disabled storage falls back without throwing', () => {
    const s = storage();
    s.setItem(APPEARANCE_KEY, '{broken');
    expect(loadAppearance(() => s)).toEqual({
      dark: 'purple',
      light: 'purple',
    });
    s.setItem(
      APPEARANCE_KEY,
      JSON.stringify({ dark: 'unknown', light: 'green' }),
    );
    expect(loadAppearance(() => s)).toEqual({ dark: 'purple', light: 'green' });
    expect(
      loadAppearance(() => {
        throw Error('Disabled');
      }),
    ).toEqual({ dark: 'purple', light: 'purple' });
    expect(
      saveAppearance({ dark: 'blue', light: 'red' }, () => {
        throw Error('Quota');
      }),
    ).toBe(false);
  });
  it('resolves the existing aive.theme preference and follows system independently of accent choice', () => {
    const s = storage();
    expect(resolveMode(undefined, { storage: () => s })).toBe('dark');
    s.setItem(EXISTING_THEME_KEY, 'light');
    expect(resolveMode(undefined, { storage: () => s })).toBe('light');
    s.setItem(EXISTING_THEME_KEY, 'system');
    expect(
      resolveMode(undefined, { storage: () => s, systemLight: () => false }),
    ).toBe('dark');
    expect(
      resolveMode(undefined, { storage: () => s, systemLight: () => true }),
    ).toBe('light');
    expect(
      resolveMode('dark', { storage: () => s, systemLight: () => true }),
    ).toBe('dark');
  });
  it('uses WCAG linearized luminance and composites alpha instead of treating soft as opaque', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBe(21);
    expect(
      contrastRatio('#000000', 'rgba(0, 0, 0, 0.1)', '#ffffff'),
    ).toBeGreaterThan(16);
  });
});
