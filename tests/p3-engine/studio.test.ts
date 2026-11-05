import { expect, it } from 'vitest';
import { paramDeclSchema, type ParamDecl } from '../../src/contracts/p3';
import { createStudioEngine } from '../../src/studio-engine';
import {
  REFERENCE_PARAMS,
  REFERENCE_PARAMS_STATUS,
} from '../../src/studio-engine/reference-params';
const engine = createStudioEngine();
const make = (extra: Record<string, unknown>) =>
  paramDeclSchema.parse({
    id: 'p',
    type: 'text',
    label: { en: 'Field' },
    role: 'prompt',
    ...extra,
  });
const form = (params: ParamDecl[]) =>
  engine.buildForm(params, { modelId: 'model', studioId: 'studio' }, true);
it.each(Object.keys(REFERENCE_PARAMS))(
  '[P3E-030] %s reference fields assemble by declared roles without changing inputs',
  (kind) => {
    expect(REFERENCE_PARAMS_STATUS).toBe('unverified');
    const spec = form(REFERENCE_PARAMS[kind]!);
    const values = { ...engine.defaults(spec) };
    for (const p of [...spec.basic, ...spec.advanced])
      if (p.required && !values[p.id])
        values[p.id] = p.type === 'voice' ? 'voice-fixture' : 'A sample';
    Object.freeze(values);
    expect(engine.validate(spec, values)).toEqual({ ok: true });
    const out = engine.assemble(spec, values);
    expect(out).toEqual(engine.assemble(spec, values));
    for (const p of engine.visible(spec, values)) {
      if (p.role === 'param')
        expect(out.params[p.sends!]).toEqual(values[p.id]);
      if (p.role === 'units') expect(out.units).toBe(values[p.id]);
      if (p.role === 'reference')
        expect(out.references[p.id]).toEqual(values[p.id]);
      if (p.role === 'prompt')
        expect(out.prompt).toContain(String(values[p.id]));
      if (p.role === 'prompt-part' && values[p.id])
        expect(out.prompt).toContain(`${p.label.en}: ${values[p.id]}`);
      if (p.role === 'negative') expect(out.negativePrompt).toBe(values[p.id]);
    }
  },
);
it('[P3E-031] hidden fields and UI-only values never reach the assembled request; stable snapshot', () => {
  const spec = form([
    make({ id: 'prompt', order: 0 }),
    make({
      id: 'style',
      role: 'prompt-part',
      order: 1,
      label: { en: 'Style' },
    }),
    make({ id: 'negative', role: 'negative', order: 2 }),
    make({ id: 'seed', type: 'seed', role: 'param', sends: 'seed', order: 3 }),
    make({
      id: 'images',
      type: 'number',
      role: 'units',
      sends: 'count',
      order: 4,
    }),
    make({ id: 'reference', type: 'file', role: 'reference', order: 5 }),
    make({ id: 'show', type: 'toggle', role: 'ui', order: 6 }),
    make({
      id: 'hidden',
      role: 'param',
      sends: 'hidden',
      showIf: { field: 'show', in: ['true'] },
      order: 7,
    }),
  ]);
  const values = Object.freeze({
    prompt: 'Sunrise',
    style: 'watercolour',
    negative: 'blur',
    seed: 42,
    images: 2,
    reference: ['asset-1'],
    show: false,
    hidden: 'PRIVATE UI VALUE',
  });
  expect(engine.assemble(spec, values)).toMatchInlineSnapshot(`
    {
      "negativePrompt": "blur",
      "params": {
        "count": 2,
        "seed": 42,
      },
      "preview": "Sunrise
    Style: watercolour
    Negative prompt: blur
    seed: 42
    count: 2
    reference: asset-1
    Units: 2",
      "prompt": "Sunrise
    Style: watercolour",
      "references": {
        "reference": [
          "asset-1",
        ],
      },
      "units": 2,
    }
  `);
  expect(JSON.stringify(engine.assemble(spec, values))).not.toContain(
    'PRIVATE UI VALUE',
  );
});
it.each([
  [{ required: true }, undefined],
  [{ type: 'number', min: 1 }, 0],
  [{ type: 'number', max: 2 }, 3],
  [{ type: 'number' }, Infinity],
  [{ type: 'number' }, '2'],
  [{ type: 'slider', step: 0.5 }, 0.3],
  [{ type: 'seed' }, 1.2],
  [{ type: 'toggle' }, 'true'],
  [
    { type: 'choice', options: [{ value: 'known', label: { en: 'Known' } }] },
    'unknown',
  ],
  [{ type: 'multi', options: [] }, ['unknown']],
  [{ type: 'color' }, 'invalid'],
  [{ type: 'file' }, false],
  [{ role: 'units', type: 'number' }, -1],
  [
    {
      role: 'param',
      sends: 'x',
      type: 'multi',
      options: [{ value: 'x', label: { en: 'X' } }],
    },
    ['x'],
  ],
] as const)(
  '[P3E-032] validation reports invalid declaration/value %j / %j without correction',
  (decl, value) => {
    const spec = form([make(decl)]),
      values = Object.freeze(value === undefined ? {} : { p: value });
    const before = structuredClone(values);
    expect(engine.validate(spec, values)).toMatchObject({ ok: false });
    expect(values).toEqual(before);
  },
);
it('[P3E-033] assemble does not clamp; conditions cascade and cycles are hidden; units can count characters', () => {
  const spec = form([
    make({ type: 'number', role: 'param', sends: 'n', min: 0, max: 2 }),
  ]);
  expect(engine.validate(spec, { p: 7 })).toMatchObject({ ok: false });
  expect(engine.assemble(spec, { p: 7 }).params.n).toBe(7);
  const count = form([make({ role: 'units' })]);
  expect(engine.assemble(count, { p: 'ह😀' }).units).toBe(2);
  const cycle = form([
    make({ id: 'a', showIf: { field: 'b', in: ['yes'] } }),
    make({ id: 'b', showIf: { field: 'a', in: ['yes'] } }),
  ]);
  expect(engine.visible(cycle, { a: 'yes', b: 'yes' })).toEqual([]);
  const cascade = form([
    make({ id: 'a' }),
    make({ id: 'b', showIf: { field: 'a', in: ['yes'] } }),
    make({ id: 'c', showIf: { field: 'b', in: ['yes'] } }),
  ]);
  expect(
    engine
      .visible(cascade, { a: 'no', b: 'yes', c: 'hidden' })
      .map((p) => p.id),
  ).toEqual(['a']);
  expect(() => form([make({}), make({})])).toThrow('unique');
});
