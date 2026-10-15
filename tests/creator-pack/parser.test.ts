import { expect, it } from 'vitest';
import { parsePack } from '../../src/creator-pack/parser';
import { controlsSchema } from '../../src/creator-pack/controls';
import { packEnvelopeSchema, itemSchema } from '../../src/creator-pack/schemas';
it('parses raw references and JSON equivalently without execution', () => {
  const value = { items: [{ source: 'while(true){}' }] };
  expect(
    parsePack(
      '=== PACK ===\n{"items":[{"source":{"$ref":"test"}}]}\n=== SOURCE test ===\nwhile(true){}\n=== END ===',
    ),
  ).toEqual(value);
  expect(parsePack(JSON.stringify(value))).toEqual(value);
});
it.each([
  ['{"a":{"$ref":"gone"}}', '', 'Unknown source'],
  ['{}', '=== SOURCE foo ===\ncode\n', 'Unused source'],
  ['{}', '=== SOURCE foo ===\nx\n=== SOURCE foo ===\ny\n', 'duplicate source'],
  ['{}', '=== WRONG ===\n', 'unknown section'],
])('rejects malformed sections %s', (manifest, source, message) =>
  expect(() =>
    parsePack(`=== PACK ===\n${manifest}\n${source}=== END ===`),
  ).toThrow(message),
);
it('enforces JSON boundaries and source/pack sizes', () => {
  expect(() => parsePack('x'.repeat(4194305))).toThrow('4 MiB');
  expect(() =>
    parsePack(
      '=== PACK ===\n{}\n=== SOURCE big ===\n' +
        'a'.repeat(1048577) +
        '\n=== END ===',
    ),
  ).toThrow('1 MiB');
  expect(() => parsePack('=== PACK ===\n{}')).toThrow('END');
  expect(() =>
    parsePack({
      get a() {
        throw Error('invoked');
      },
    }),
  ).toThrow('Accessors');
  expect(() => parsePack({ a: Infinity })).toThrow('finite');
  expect(() => parsePack(JSON.parse('{"__proto__":1}'))).toThrow('Unsafe');
});
const control = {
  name: 'amount',
  label: { en: 'Amount', hi: 'मात्रा' },
  type: 'number',
  min: 0,
  max: 1,
  step: 0.1,
  default: 0.5,
};
it('validates defaults, unique names and basic/total control limits', () => {
  expect(controlsSchema.safeParse([control]).success).toBe(true);
  for (const c of [
    [{ ...control, default: 2 }],
    [control, control],
    Array.from({ length: 9 }, (_, i) => ({ ...control, name: 'x' + i })),
    Array.from({ length: 25 }, (_, i) => ({
      ...control,
      name: 'x' + i,
      group: 'advanced',
    })),
  ])
    expect(controlsSchema.safeParse(c).success).toBe(false);
});
it('reuses native data validation and rejects font/v2 envelopes', () => {
  expect(
    itemSchema.safeParse({
      id: 'bad',
      name: { en: 'Bad' },
      tags: [],
      type: 'shape',
      data: {},
    }).success,
  ).toBe(false);
  expect(
    itemSchema.safeParse({
      id: 'font',
      name: { en: 'Font' },
      tags: [],
      type: 'font',
      data: {},
    }).success,
  ).toBe(false);
  expect(
    packEnvelopeSchema.safeParse({
      format: 'creator-pack',
      version: 2,
      items: [],
    }).success,
  ).toBe(false);
});
