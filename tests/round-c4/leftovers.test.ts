// ROUND-C4 Part 0.1 (RDC4-001) and 0.2 (RDC4-002).
import { describe, expect, it } from 'vitest';
import { defaultConfig, type Style } from '../../src/platform-config';
import { validateStyle } from '../../src/director/style-check';
import {
  BUILDER_TEXTS,
  isLegacy,
  lookWarnings,
} from '../../src/director/style-builder';

describe('[RDC4-001] the three sample Styles stay legacy', () => {
  it('[RDC4-001] the sample Styles have no status and no template, pass validateStyle unchanged and read as legacy; a NEW Style marked Tested or Published without a template is refused unless the owner wrote a reason; as a Draft it is fine', () => {
    const styles = defaultConfig().styles;
    expect(styles).toHaveLength(3);
    for (const s of styles) {
      expect(s.status).toBeUndefined();
      expect(s.planTemplate).toBeUndefined();
      expect(isLegacy(s)).toBe(true);
      expect(validateStyle(s)).toEqual({ ok: true, errors: [] });
    }
    const fresh = { ...styles[0]!, id: 'fresh' } as Style;
    expect(validateStyle({ ...fresh, status: 'draft' }).ok).toBe(true);
    for (const status of ['tested', 'published'] as const)
      expect(validateStyle({ ...fresh, status }).errors).toEqual([
        'Style "fresh": a Tested or Published Style needs a plan template, or the owner\'s written reason.',
      ]);
    expect(
      validateStyle({
        ...fresh,
        status: 'published',
        publishOverride: 'Works with the form.',
      }).ok,
    ).toBe(true);
  });
});

describe('[RDC4-002] looks have English and Hindi names', () => {
  it('[RDC4-002] a look with no Hindi name, or a Hindi name that is a copy of the English one, gets a small warning (never an error); a real Hindi name has none; the sample looks are unchanged', () => {
    const s = defaultConfig().styles[0]!;
    const looks = s.looks!;
    // C3 copied English into Hindi: every sample look warns, the Style is valid.
    expect(lookWarnings(s)).toHaveLength(looks.length);
    expect(validateStyle(s).ok).toBe(true);
    const fixed = {
      ...s,
      looks: looks.map((l, i) =>
        i === 0
          ? { ...l, name: { en: l.name.en, hi: 'चॉकबोर्ड' } }
          : { ...l, name: { en: l.name.en } },
      ),
    } as Style;
    const w = lookWarnings(fixed);
    expect(w).toHaveLength(looks.length - 1);
    expect(w[0]).toBe(`${looks[1]!.id}: ${BUILDER_TEXTS['look-no-hindi'].en}`);
    expect(lookWarnings(fixed, 'hi')[0]).toContain(
      BUILDER_TEXTS['look-no-hindi'].hi,
    );
  });
});
