import { describe, expect, it } from 'vitest';
import { createLayer, number, type Layer } from '../../src/core';
import type { SceneLayer } from '../../src/render/adapter';
import { layerSize } from '../../src/render/adapter';
import {
  textBoxMode,
  textBoxOf,
  textHeightFixed,
} from '../../src/render/text-box';
import {
  clusters,
  layoutRich,
  listMarkers,
  SOFT_BREAK,
} from '../../src/render/rich-text';
import {
  DEFAULT_TEXT_STYLE,
  withoutLigatures,
} from '../../src/render/text-style';
import { fallbackTextMeasure } from '../../src/render/text-layout';
import {
  Composition,
  indentLevels,
  listOn,
  moveCaret,
  plainPaste,
} from '../../src/text-engine/editing';
import { revealCount } from '../../src/render/text-effects';
import {
  parseTextEffect,
  EFFECT_DEFAULTS,
} from '../../src/render/text-effects';

const string = (value: string) => ({
  type: 'string' as const,
  value,
  animated: false,
  keyframes: [] as [],
  constraints: [],
});
const bool = (value: boolean) => ({
  type: 'boolean' as const,
  value,
  animated: false,
  keyframes: [] as [],
  constraints: [],
});
let serial = 0;
function text(value: string, extra: Record<string, unknown> = {}) {
  const layer = createLayer(`t${(serial += 1)}`, 'text', 'Text');
  layer.properties = {
    text: string(value),
    fontSize: number(40),
    width: number(120),
    height: number(300),
    ...extra,
  } as Layer['properties'];
  return layer as unknown as SceneLayer;
}

describe('[FN3-005] text box model (auto and fixed width)', () => {
  it('a new single-line text is one line tall and never wraps in auto width ("Shyam Monani")', () => {
    const layer = text('Shyam Monani', { textBox: string('auto') });
    const box = textBoxOf(layer, { measure: fallbackTextMeasure });
    expect(box.mode).toBe('auto');
    expect(box.layout.lines).toHaveLength(1);
    expect(box.height).toBeCloseTo(40 * DEFAULT_TEXT_STYLE.lineHeight, 6);
    // Its stored 120 px width is ignored: the box fits the 12 characters.
    expect(box.width).toBeCloseTo(12 * 40 * 0.6, 1);
    expect(layerSize(layer, [])!.height).toBe(box.height);
  });
  it('no phantom empty line: the box is exactly the lines', () => {
    const layer = text('one\ntwo', { textBox: string('auto') });
    const box = textBoxOf(layer, { measure: fallbackTextMeasure });
    expect(box.layout.lines).toHaveLength(2);
    expect(box.height).toBeCloseTo(2 * 48, 6);
  });
  it('fixed width wraps inside the width and the height grows to fit', () => {
    const layer = text('Shyam Monani writes here', {
      textBox: string('fixed'),
      width: number(300),
    });
    const box = textBoxOf(layer, { measure: fallbackTextMeasure });
    expect(box.width).toBe(300);
    expect(box.layout.lines.length).toBeGreaterThan(1);
    expect(box.height).toBeCloseTo(box.layout.lines.length * 48, 6);
  });
  it('a fixed height keeps its height (vertical align moves the text in it)', () => {
    const layer = text('Hi', {
      textBox: string('fixed'),
      textFixedHeight: bool(true),
      width: number(300),
      height: number(400),
    });
    expect(textHeightFixed(layer)).toBe(true);
    expect(textBoxOf(layer, { measure: fallbackTextMeasure }).height).toBe(400);
  });
  it('old layers keep their look: wrapped stays fixed, a centred unwrapped box keeps its width', () => {
    expect(textBoxMode(text('a', { textWrap: bool(true) }))).toBe('fixed');
    expect(textBoxMode(text('a'))).toBe('auto');
    expect(textBoxMode(text('a', { textAlign: string('center') }))).toBe(
      'fixed',
    );
    expect(textHeightFixed(text('a', { textAnchor: string('middle') }))).toBe(
      true,
    );
  });
});

describe('[FN3-006] lists act on paragraphs', () => {
  const layout = (value: string, levels?: number[]) =>
    layoutRich(
      value,
      [],
      'bullet',
      { style: DEFAULT_TEXT_STYLE, size: 20, color: '#000000' },
      null,
      fallbackTextMeasure,
      levels ? { levels } : {},
    );
  it('one line gives one bullet; three paragraphs give three', () => {
    expect(layout('Hello').lines.filter((l) => l.marker)).toHaveLength(1);
    expect(layout('a\nb\nc').lines.filter((l) => l.marker)).toHaveLength(3);
  });
  it('a stale empty line is removed when a list is turned on', () => {
    const on = listOn('Shyam Monani\n\n', null);
    expect(on.text).toBe('Shyam Monani');
    expect(on.levels).toEqual([0]);
  });
  it('a selection makes bullets of the selected paragraphs only', () => {
    expect(listOn('a\nb\nc', [1, 2]).levels).toEqual([-1, 0, 0]);
  });
  it('Tab and Shift+Tab change levels (0 to 3); markers follow the level', () => {
    const levels = indentLevels([0, 0, 0], 3, [1, 2], 1);
    expect(levels).toEqual([0, 1, 1]);
    expect(indentLevels(levels, 3, [0, 2], -1)).toEqual([0, 0, 0]);
    expect(
      listMarkers(3, 'number', { levels: [0, 1, 0] }).map((m) => m.trim()),
    ).toEqual(['1.', 'a.', '2.']);
    expect(
      listMarkers(2, 'check', { checked: [true, false] }).map((m) => m.trim()),
    ).toEqual(['☑', '☐']);
  });
  it('a soft line break keeps one bullet for two lines', () => {
    const result = layout(`first${SOFT_BREAK}second`);
    expect(result.lines).toHaveLength(2);
    expect(result.lines.filter((l) => l.marker)).toHaveLength(1);
  });
});

describe('[FN3-007] IME composition, clusters and paste', () => {
  it('Devanagari composition commits once: no doubled or lost characters', () => {
    const composition = new Composition();
    composition.start({ text: 'नाम: ', selection: [5, 5] });
    for (const step of ['न', 'नम', 'नमस', 'नमस्', 'नमस्त', 'नमस्ते'])
      composition.update(step);
    expect(composition.preview!.text).toBe('नाम: नमस्ते');
    const result = composition.end('नमस्ते')!;
    expect(result.text).toBe('नाम: नमस्ते');
    expect(result.selection).toEqual([11, 11]);
    expect(composition.active).toBe(false);
  });
  it('composition replaces a selection exactly once', () => {
    const composition = new Composition();
    composition.start({ text: 'abc', selection: [1, 2] });
    composition.update('ह');
    expect(composition.end('हि')!.text).toBe('aहिc');
  });
  it('the caret moves by grapheme cluster: a conjunct or a vowel sign never splits', () => {
    const word = 'नमस्ते';
    // Unicode 15.1: the conjunct स्ते is one cluster with its vowel sign.
    expect(clusters(word)).toEqual(['न', 'म', 'स्ते']);
    expect(moveCaret(word, 2, 1)).toBe(6);
    expect(moveCaret(word, 6, -1)).toBe(2);
  });
  it('paste keeps plain text only', () => {
    expect(plainPaste('a\r\nb\u0007c')).toBe('a\nbc');
  });
  it('ligatures off breaks Latin ligatures only (Devanagari still joins)', () => {
    expect(withoutLigatures('fi')).toBe('f\u200ci');
    expect(withoutLigatures('क्ष')).toBe('क्ष');
  });
});

describe('[FN3-008] typewriter reveal and effects', () => {
  it('the typewriter reveals whole clusters, so a conjunct appears whole', () => {
    const layout = layoutRich(
      'नमस्ते दुनिया',
      [],
      'none',
      { style: DEFAULT_TEXT_STYLE, size: 20, color: '#000000' },
      null,
      fallbackTextMeasure,
    );
    // न म स्ते, a space, दु नि या: 7 clusters, 2 words.
    expect(revealCount(layout, 1)).toBe(7);
    expect(revealCount(layout, 0.5)).toBe(3);
    expect(revealCount(layout, 0.4, true)).toBe(0);
    expect(revealCount(layout, 0.5, true)).toBe(3);
  });
  it('effects read defensively with Canva defaults', () => {
    expect(parseTextEffect('{"type":"shadow"}')).toEqual(
      EFFECT_DEFAULTS.shadow,
    );
    expect(parseTextEffect('{"type":"nope"}')).toBeNull();
    expect(parseTextEffect('{"type":"glow","intensity":500}')!.intensity).toBe(
      100,
    );
  });
});
