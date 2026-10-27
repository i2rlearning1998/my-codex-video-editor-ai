import { describe, expect, it } from 'vitest';
import en from '../src/i18n/locales/en.json';
import hi from '../src/i18n/locales/hi.json';

describe('planned controls', () => {
  it('[FIX6-011] no label shows a wave number or a ledger id; planned controls read Coming soon', () => {
    for (const table of [en, hi] as Record<string, string>[])
      for (const [key, value] of Object.entries(table))
        expect(value, key).not.toMatch(/(Planned|योजना)[^"]*(Wave|वेव) \d+/);
    expect(en['toolbar.later']).toBe('Coming soon');
    expect(hi['toolbar.later']).toBeTruthy();
  });
});
