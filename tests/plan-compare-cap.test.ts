import { describe, expect, it } from 'vitest';
import { capCompare } from '../src/ui/plan-review';

describe('[FIX7-026] Compare to plan stays short', () => {
  it('[FIX7-026] a long list shows 12 lines and "and N more"', () => {
    const lines = Array.from({ length: 40 }, (_, i) => `line ${i}`);
    const out = capCompare(lines);
    expect(out).toHaveLength(13);
    expect(out[12]).toContain('28');
    expect(capCompare(lines.slice(0, 13))).toHaveLength(13);
    expect(capCompare(['one'])).toEqual(['one']);
  });
});
