// Phase 1 library brief, P1-33: every new text of this phase has Hindi.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../../src/i18n/locales/en.json';
import hi from '../../src/i18n/locales/hi.json';

const NEW_KEYS = [
  'library.locked',
  'library.fallback',
  'library.mediaFailed',
  'library.retry',
  'elements.section.media',
  'features.upgrade',
  'features.locked',
  'cloud.freeSpace',
  'cloud.freeSpaceTitle',
  'cloud.freeSpaceIntro',
  'cloud.freeSpaceNone',
  'cloud.freeSpaceAsk',
  'cloud.freeSpaceDone',
  'cloud.google',
  'cloud.googleOff',
] as const;
const devanagari = /[ऀ-ॿ]/;

describe('Hindi for Phase 1', () => {
  it('[LIB-033] the editor and the owner app have Hindi for every new text', () => {
    const english = en as Record<string, string>;
    const hindi = hi as Record<string, string>;
    for (const key of NEW_KEYS) {
      expect(english[key], key).toBeTruthy();
      expect(hindi[key], key).toMatch(devanagari);
      // The same {placeholders} in both.
      const holes = (text: string) =>
        [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(holes(hindi[key]!), key).toEqual(holes(english[key]!));
    }
    // The owner app: the Hindi block has every English key, in Devanagari.
    const source = readFileSync('owner/ui/app.ts', 'utf8');
    const block = (name: 'en' | 'hi') => {
      const start = source.indexOf(`  ${name}: {`);
      const end = source.indexOf('\n  },', start);
      return source.slice(start, end);
    };
    const keys = (text: string) =>
      [...text.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
    expect(keys(block('hi')).sort()).toEqual(keys(block('en')).sort());
    expect(keys(block('en')).length).toBeGreaterThan(40);
    expect(block('hi')).toMatch(devanagari);
  });
});
