// ROUND-B B0.3: a model's declared parameters only hide fields and map values.
import { describe, expect, it } from 'vitest';
import { paramDeclSchema, type ParamDecl } from '../../src/contracts/p3';
import {
  acceptsField,
  mapValues,
  primaryField,
} from '../../src/panel/studio-params';

const P = (x: Record<string, unknown>): ParamDecl =>
  paramDeclSchema.parse({ type: 'text', label: { en: String(x.id) }, ...x });
const fields = [
  { id: 'aspect', type: 'choice' },
  { id: 'look', type: 'choice' },
  { id: 'prompt', type: 'longtext' },
  { id: 'count', type: 'number' },
  { id: 'tips', type: 'info' },
];
const params = [
  P({ id: 'text', role: 'prompt', type: 'longtext' }),
  P({
    id: 'size',
    sends: 'aspect',
    type: 'choice',
    options: [
      { value: 'square', label: { en: '1:1' } },
      { value: 'wide', label: { en: '16:9' } },
    ],
  }),
  P({ id: 'count', type: 'number', min: 1, max: 2 }),
];

describe('[RDB-003] a real model with declared parameters keeps the config form', () => {
  it('[RDB-003] with no parameters every field shows', () => {
    for (const f of fields) expect(acceptsField([], f, 'prompt')).toBe(true);
  });
  it('[RDB-003] hides only the fields the model does not accept; notes stay', () => {
    const primary = primaryField(fields);
    expect(primary).toBe('prompt');
    const shown = fields
      .filter((f) => acceptsField(params, f, primary))
      .map((f) => f.id);
    expect(shown).toEqual(['aspect', 'prompt', 'count', 'tips']);
  });
  it('[RDB-003] maps values to the parameter ids, matches a choice by its label and clamps numbers', () => {
    const r = mapValues(params, fields, {
      aspect: '16:9',
      look: 'anime',
      prompt: 'a kite',
      count: 9,
    });
    expect(r.values).toEqual({ size: 'wide', text: 'a kite', count: 2 });
    expect(r.dropped).toEqual([]);
  });
  it('[RDB-003] leaves out a choice the model does not list and says which', () => {
    const r = mapValues(params, fields, { aspect: '3:2', prompt: 'x' });
    expect(r.values).toEqual({ text: 'x' });
    expect(r.dropped).toEqual(['aspect']);
  });
  it('[RDB-003] turns a chip text number into a number for a number parameter', () => {
    const r = mapValues(params, fields, { count: '2', prompt: 'x' });
    expect(r.values.count).toBe(2);
    expect(mapValues(params, fields, { count: '9' }).values.count).toBe(2);
  });
});
