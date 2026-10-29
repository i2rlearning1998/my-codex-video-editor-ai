import { describe, expect, it } from 'vitest';
import { PSEUDO_GROWTH, pseudoLocalize } from '../src/i18n/pseudo';
import en from '../src/i18n/locales/en.json';

describe('pseudo locale', () => {
  it('[LOC-008] accents the letters, grows the text by 40 percent and keeps {placeholders}', () => {
    const text = 'Delete {count} clips from {name}';
    const out = pseudoLocalize(text);
    expect(out).toContain('{count}');
    expect(out).toContain('{name}');
    expect(out).not.toMatch(/[a-zA-Z]{3} /);
    expect([...out.replace(/\{\w+\}/g, '')].length).toBeGreaterThanOrEqual(
      Math.floor([...text.replace(/\{\w+\}/g, '')].length * PSEUDO_GROWTH),
    );
    expect(pseudoLocalize('')).toBe('');
    expect(pseudoLocalize('{n}')).toBe('{n}');
  });
  it('[LOC-008] every English string has a pseudo version of the same placeholders', () => {
    for (const [key, value] of Object.entries(en)) {
      const holes = (item: string) =>
        (item.match(/\{\w+\}/g) ?? []).sort().join(',');
      expect(holes(pseudoLocalize(value)), key).toBe(holes(value));
    }
  });
});
