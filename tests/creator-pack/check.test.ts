import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkPack } from '../../src/creator-pack';
const options = { fxCatalog: [], knownLibraryIds: [] };
const base = new URL('../../examples/creator-packs/', import.meta.url);
const read = (name: string) =>
  JSON.parse(readFileSync(new URL(name, base), 'utf8')) as Record<
    string,
    unknown
  >;
const expected = read('expected.json') as Record<
  string,
  { ok: boolean; statuses: string[]; reason?: string }
>;
it.each(Object.entries(expected))('checks example %s', (name, want) => {
  const result = checkPack(read(name), options);
  expect(result.ok, result.report).toBe(want.ok);
  expect(
    result.items.map((i) => i.status),
    result.report,
  ).toEqual(want.statuses);
  if (want.reason) expect(result.report).toContain(want.reason);
});
it('reports partial acceptance, missing Hindi fallback, font rejection and duplicate ids', () => {
  const value = read('shape.json'),
    shape = (value.items as Record<string, unknown>[])[0]!;
  const result = checkPack(
    {
      ...value,
      items: [
        { ...shape, name: { en: 'Kite' } },
        { ...shape, id: 'my-font', type: 'font' },
      ],
    },
    options,
  );
  expect(result.items.map((i) => i.status)).toEqual(['warning', 'rejected']);
  expect(result.items[0]!.item?.name.hi).toBe('Kite');
  expect(result.report).toContain('Font is not supported');
  expect(
    checkPack({ ...value, items: [shape, shape] }, options).items.every(
      (i) => i.status === 'rejected',
    ),
  ).toBe(true);
});
it('rejects failed/missing/cyclic dependencies and invalid references without losing independent items', () => {
  const value = read('shape.json'),
    shape = (value.items as Record<string, unknown>[])[0]!;
  const result = checkPack(
    {
      ...value,
      items: [
        shape,
        { ...shape, id: 'second', needs: ['third'] },
        { ...shape, id: 'third', needs: ['second'] },
        { ...shape, id: 'fourth', needs: ['gone'] },
      ],
    },
    options,
  );
  expect(result.items.map((i) => i.status)).toEqual([
    'warning',
    'rejected',
    'rejected',
    'rejected',
  ]);
  expect(
    checkPack({ ...value, items: Array(201).fill(shape) }, options).ok,
  ).toBe(false);
  expect(checkPack('not json', options).report).toContain('Pack rejected');
});
it('validates all right-panel kinds, recipe bindings and code contract', () => {
  const value = read('shape.json'),
    shape = (value.items as Record<string, unknown>[])[0]!;
  const intensity = {
    name: 'intensity',
    label: { en: 'Strength', hi: 'प्रभाव' },
    type: 'number',
    min: 0,
    max: 1,
    step: 0.1,
    default: 1,
  };
  for (const type of ['adjust', 'filter', 'effect', 'transition']) {
    const item = {
      ...shape,
      id: 'right-item',
      type,
      controls: [intensity],
      data: {
        mode: 'recipe',
        steps: [
          { fx: 'known', params: { intensity: { $param: 'intensity' } } },
        ],
      },
    };
    expect(
      checkPack(
        { ...value, items: [item] },
        { ...options, fxCatalog: ['known'] },
      ).ok,
    ).toBe(true);
    expect(checkPack({ ...value, items: [item] }, options).report).toContain(
      'Unknown fx',
    );
  }
  const item = {
    ...shape,
    type: 'effect',
    controls: [intensity],
    data: {
      mode: 'code',
      kind: 'effect',
      source:
        "export default {id:'right',name:'Right',category:'Color',params:[],alpha:'preserve',apply(input,output,params,ctx){output.set(input);}}",
    },
  };
  expect(
    checkPack({ ...value, items: [item] }, options).items[0],
  ).toMatchObject({ status: 'warning', needsRuntimeCheck: true });
});
it('authoring examples are complete valid offline packs', () => {
  const doc = readFileSync(
    new URL('../../docs/CREATOR-PACK-AUTHORING.md', import.meta.url),
    'utf8',
  );
  expect(doc.split('\n').length).toBeLessThan(400);
  const examples = [...doc.matchAll(/```json\n([\s\S]*?)\n```/g)];
  // T1 (D-254): one more worked example, the theme.
  expect(examples).toHaveLength(13);
  for (const m of examples) {
    const r = checkPack(m[1]!, {
      fxCatalog: [
        'adjust.contrast',
        'filter.dreamscape',
        'effect.glow',
        'crossfade',
      ],
      knownLibraryIds: [],
    });
    expect(r.ok, r.report).toBe(true);
  }
  const text = /```text\n([\s\S]*?)\n```/.exec(doc)!;
  expect(checkPack(text[1]!, options).ok).toBe(true);
});
it('CLI prints the identical offline report', () => {
  const file = fileURLToPath(new URL('shape.json', base));
  const expected = checkPack(readFileSync(file, 'utf8'), options).report;
  const actual = execFileSync(
    process.execPath,
    ['scripts/pack-check.mjs', file],
    {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      encoding: 'utf8',
      timeout: 20000,
    },
  );
  expect(actual.trim()).toBe(expected.trim());
}, 25000);
