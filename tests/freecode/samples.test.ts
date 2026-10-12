import { expect, it } from 'vitest';
import { samples } from '../../src/freecode/samples';
import { validate } from '../../src/freecode/validate';
it.each(samples)(
  'validates original sample $id and exposes editable params',
  (sample) => {
    const result = validate(sample.source);
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
    if (result.ok) expect(result.meta.params.length).toBeGreaterThanOrEqual(5);
  },
);
