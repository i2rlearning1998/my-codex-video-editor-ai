import { describe, expect, it } from 'vitest';
import {
  formatRuns,
  layoutRich,
  parseListStyle,
  parseRuns,
} from '../src/render/rich-text';
import { fallbackTextMeasure } from '../src/render/text-layout';
import { DEFAULT_TEXT_STYLE } from '../src/render/text-style';
import {
  clearRunKeys,
  resolvedTextStyle,
  runsFromStyles,
  stylesFromRuns,
} from '../src/ui/text-editor';
import { createLayer } from '../src/core';

const base = { style: DEFAULT_TEXT_STYLE, size: 20, color: '#111111' };
type SceneLayer = Parameters<typeof clearRunKeys>[1];
function textLayer(
  text: string,
  runs: unknown[] = [],
  weight = 600,
): SceneLayer {
  const layer = createLayer('t', 'text', 'Text');
  const string = (value: string) => ({
    type: 'string' as const,
    value,
    animated: false,
    keyframes: [],
    constraints: [],
  });
  layer.properties = {
    text: string(text),
    textRuns: string(runs.length ? JSON.stringify(runs) : ''),
    fontWeight: {
      type: 'number',
      value: weight,
      animated: false,
      keyframes: [],
      constraints: [],
    },
  };
  return layer as unknown as SceneLayer;
}

describe('[TXT-023] text runs (J4)', () => {
  it('parses valid runs, drops malformed ones and never overlaps', () => {
    const runs = parseRuns(
      JSON.stringify([
        { start: 4, end: 8, italic: true },
        { start: 0, end: 5, weight: 700, color: '#AA0000' },
        { start: 2, end: 3, color: 'red' },
        { start: 9, end: 9, weight: 700 },
        { start: 6, end: 99, size: 9000 },
        'nonsense',
      ]),
      10,
    );
    expect(runs).toEqual([
      { start: 0, end: 5, weight: 700, color: '#aa0000' },
      { start: 5, end: 8, italic: true },
    ]);
    expect(parseRuns('{broken', 10)).toEqual([]);
    expect(parseRuns(undefined, 10)).toEqual([]);
  });
  it('styles per character round-trip to the same runs', () => {
    const runs = [
      { start: 0, end: 3, weight: 700 },
      { start: 5, end: 7, color: '#00ff00', underline: true },
    ];
    expect(runsFromStyles(stylesFromRuns(8, runs))).toEqual(runs);
    expect(formatRuns([])).toBe('');
  });
  it('lays out mixed sizes per line and wraps at the box width', () => {
    const text = 'aaaa bbbb cccc';
    const layout = layoutRich(
      text,
      [{ start: 5, end: 9, size: 40 }],
      'none',
      base,
      // 12 px per character at size 20 (24 at 40) with the fallback measure:
      // the large word needs a line of its own.
      12 * 10,
      fallbackTextMeasure,
    );
    expect(
      layout.lines.map((line) => line.spans.map((s) => s.text).join('')),
    ).toEqual(['aaaa', 'bbbb', 'cccc']);
    expect(layout.lines[1]!.size).toBe(40);
    expect(layout.lines[1]!.lineHeight).toBeCloseTo(40 * 1.2);
    expect(layout.height).toBeCloseTo(20 * 1.2 * 2 + 40 * 1.2);
  });
  it('numbers and bullets every paragraph with a hanging indent', () => {
    const layout = layoutRich(
      'one\ntwo',
      [],
      'number',
      base,
      null,
      fallbackTextMeasure,
    );
    expect(layout.lines.map((line) => line.marker?.text)).toEqual([
      '1. ',
      '2. ',
    ]);
    expect(layout.lines[0]!.indent).toBeGreaterThan(0);
    expect(parseListStyle('bullet')).toBe('bullet');
    expect(parseListStyle('roman')).toBe('none');
  });
  it('a whole-box style clears that key from the runs; the resolved style follows the runs', () => {
    const layer = textLayer('Hello world', [
      { start: 0, end: 5, weight: 700, italic: true },
    ]);
    const command = clearRunKeys('c', layer, ['weight']) as unknown as {
      property: { value: string };
    };
    expect(JSON.parse(command.property.value)).toEqual([
      { start: 0, end: 5, italic: true },
    ]);
    expect(clearRunKeys('c', layer, ['size'])).toBeNull();
    // Mixed weight is not bold; every character bold is bold (J5).
    expect(resolvedTextStyle(layer).weight).toBeNull();
    const bold = textLayer('Hello world', [{ start: 0, end: 11, weight: 700 }]);
    expect(resolvedTextStyle(bold).weight).toBe(700);
    expect(resolvedTextStyle(textLayer('Hi', [], 700)).weight).toBe(700);
  });
});
