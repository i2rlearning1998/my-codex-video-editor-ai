import { expect, it } from 'vitest';
import {
  breakLines,
  graphemes,
  glyphCoverage,
  layoutStructured,
  parseTextEngine,
  resolveDirection,
  textEngineSchema,
} from '../../src/text-engine/layout';
import { FONT_CATALOG } from '../../src/text-engine/catalog';
import { EditorEngine } from '../../src/core';
import fixture from '../fixtures/projects/av-sync.json';
import {
  textStyleOf,
  DEFAULT_TEXT_STYLE,
  textFont,
} from '../../src/render/text-style';
import type { SceneLayer } from '../../src/render/adapter';
const measure = (s: string) => graphemes(s).length * 10;
it('catalog has distinct curated families including Hindi and handwriting', () => {
  expect(FONT_CATALOG.length).toBeGreaterThanOrEqual(60);
  expect(new Set(FONT_CATALOG.map((f) => f.family)).size).toBe(
    FONT_CATALOG.length,
  );
  expect(FONT_CATALOG.some((f) => f.scripts.includes('devanagari'))).toBe(true);
  expect(FONT_CATALOG.some((f) => f.category === 'handwriting')).toBe(true);
});
it('Hindi wrapping never splits conjuncts or matras, including mixed English', () => {
  const clusters = graphemes('क्षि');
  expect(clusters).toEqual(['क्षि']);
  expect(breakLines('क्षिक्षि हिंदी English', 20, measure).slice(0, 2)).toEqual(
    ['क्षिक्षि', 'हिंदी'],
  );
  expect(breakLines('क्षि', 1, measure)).toEqual(['क्षि']);
  expect(breakLines('hello\nworld', 100, measure)).toEqual(['hello', 'world']);
});
it('rejects invalid metrics and layout dimensions', () => {
  expect(() => breakLines('a', 0, measure)).toThrow();
  expect(() => breakLines('a', 10, () => NaN)).toThrow();
  expect(() =>
    layoutStructured(
      'a',
      20,
      20,
      { list: { kind: 'bullet', indent: 30 } },
      measure,
    ),
  ).toThrow();
});
it('resolves bidi by first strong letter and honors explicit direction', () => {
  expect(resolveDirection('123 مرحبا English')).toBe('rtl');
  expect(resolveDirection('हिंदी English')).toBe('ltr');
  expect(resolveDirection('English مرحبا')).toBe('ltr');
  expect(resolveDirection('abc', 'rtl')).toBe('rtl');
});
it('coverage checks combining marks too, without pretending widths prove glyphs', () => {
  expect(glyphCoverage('कि', (cp) => cp !== 0x93f)).toEqual({
    covered: false,
    missing: ['ि'],
  });
  expect(glyphCoverage('क्षि', () => true).covered).toBe(true);
});
it('numbered lists reset children and expose addressable paragraph boxes', () => {
  const cells = layoutStructured(
    'one\ntwo\nthree\nfour',
    200,
    20,
    {
      list: { kind: 'numbered', levels: [1, 2, 3, 1], indent: 20, spacing: 4 },
    },
    measure,
  );
  expect(cells.map((c) => c.marker)).toEqual(['1.', '1.', '1.', '2.']);
  expect(cells.map((c) => c.x)).toEqual([20, 40, 60, 20]);
  expect(cells[1]?.y).toBe(24);
  expect(cells[3]?.id).toBe('paragraph-3');
});
it('RTL lists reserve marker room on the right', () => {
  const cell = layoutStructured(
    'مرحبا',
    100,
    20,
    { direction: 'auto', list: { kind: 'bullet', indent: 20 } },
    measure,
  )[0]!;
  expect(cell.x).toBe(0);
  expect(cell.width).toBe(80);
  expect(cell.direction).toBe('rtl');
});
it('tables share row heights and expose stable cell addresses and header style', () => {
  const cells = layoutStructured(
    '',
    200,
    20,
    {
      table: {
        rows: [
          [{ text: 'long long' }, { text: 'x' }],
          [{ text: 'हिंदी' }, { text: 'y', style: { background: '#112233' } }],
        ],
        columnWidths: [1, 1],
        header: true,
        padding: 5,
      },
    },
    measure,
  );
  expect(cells[0]?.height).toBe(cells[1]?.height);
  expect(cells[2]?.y).toBe(cells[0]?.height);
  expect(cells[0]?.style?.bold).toBe(true);
  expect(cells.map((c) => c.id)).toEqual([
    'cell-0-0',
    'cell-0-1',
    'cell-1-0',
    'cell-1-1',
  ]);
  expect(cells[3]?.x).toBe(100);
});
it('validates table shape and never interprets malformed JSON', () => {
  expect(
    textEngineSchema.safeParse({
      table: { rows: [[{ text: 'a' }]], columnWidths: [1, 2] },
    }).success,
  ).toBe(false);
  expect(parseTextEngine('{')).toBeUndefined();
  expect(parseTextEngine('{"direction":"rtl"}')).toEqual({ direction: 'rtl' });
});
it('old project scenes and legacy font shorthand remain unchanged', () => {
  const engine = new EditorEngine(fixture);
  expect(JSON.parse(JSON.stringify(engine.state.compositions))).toEqual(
    fixture.compositions,
  );
  expect(textFont(DEFAULT_TEXT_STYLE, 32)).toBe('600 32px "Arial", sans-serif');
  const layer = { properties: {}, children: [] } as unknown as SceneLayer;
  expect(textStyleOf(layer)).toEqual(DEFAULT_TEXT_STYLE);
  const modern = {
    children: [],
    properties: {
      textEngine: { type: 'string', value: '{"direction":"auto"}' },
      fontFamily: { type: 'string', value: 'Lora' },
    },
  } as unknown as SceneLayer;
  expect(textStyleOf(modern).family).toBe('Lora');
  expect(textFont(textStyleOf(modern), 32)).toContain('Noto Sans Devanagari');
});
