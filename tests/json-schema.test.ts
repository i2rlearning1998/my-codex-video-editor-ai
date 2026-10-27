// FIX6-005: the JSON value check is a plain loop now (the zod union took
// minutes on a built video); it must accept and refuse exactly what it did.
import { describe, expect, it } from 'vitest';
import { jsonSchema } from '../src/core/model';

describe('[FIX6-005] jsonSchema', () => {
  it('accepts plain JSON trees', () => {
    for (const value of [
      null,
      true,
      'x',
      0,
      -1.5,
      [],
      {},
      [1, 'a', null, { a: [true, { b: 2 }] }],
      { a: { b: { c: [1, 2, 3] } } },
    ])
      expect(jsonSchema.safeParse(value).success).toBe(true);
  });
  it('refuses what JSON cannot hold', () => {
    const deep: unknown[] = [];
    let cursor = deep;
    for (let i = 0; i < 120; i++) {
      const next: unknown[] = [];
      cursor.push(next);
      cursor = next;
    }
    for (const value of [
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      () => 1,
      Symbol('x'),
      10n,
      [1, undefined],
      { a: undefined },
      { a: { b: Number.NaN } },
      deep,
    ])
      expect(jsonSchema.safeParse(value).success).toBe(false);
  });
  it('checks a large value quickly', () => {
    const big = Array.from({ length: 20000 }, (_, i) => ({
      id: `n${i}`,
      values: [i, i + 1, i + 2],
      flag: i % 2 === 0,
      text: 'x'.repeat(20),
    }));
    const start = performance.now();
    expect(jsonSchema.safeParse(big).success).toBe(true);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
