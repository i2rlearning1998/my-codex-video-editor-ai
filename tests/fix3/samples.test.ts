import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validatePlan } from '../../src/video-plan';

// FIX3 4.3: the two sample plans in docs/samples pass the plan check with no
// errors and no warnings, in their own language, with the same scenes.
const sample = (name: string) =>
  validatePlan(readFileSync(`docs/samples/${name}.json`, 'utf8'));

describe('FIX3 sample plans', () => {
  it('plan-en-honey and plan-hi-honey are valid, warning-free and match', () => {
    const en = sample('plan-en-honey');
    const hi = sample('plan-hi-honey');
    for (const check of [en, hi]) {
      expect(check.errors).toEqual([]);
      expect(check.warnings).toEqual([]);
      expect(check.ok).toBe(true);
    }
    expect(en.plan!.meta.language).toBe('en');
    expect(hi.plan!.meta.language).toBe('hi');
    expect(hi.plan!.scenes.map((s) => s.id)).toEqual(
      en.plan!.scenes.map((s) => s.id),
    );
    for (const scene of hi.plan!.scenes)
      expect(scene.narration).toMatch(/[ऀ-ॿ]/);
  });
});
