import { expect, test } from 'vitest';
import { EditorEngine } from '../src/core';
import { locateLayer } from '../src/render/adapter';
import {
  layoutParagraphs,
  layoutText,
  lineOffsets,
} from '../src/render/text-layout';
import {
  DEFAULT_TEXT_STYLE,
  applyCase,
  textFont,
  textStyleOf,
} from '../src/render/text-style';
import { textStyleCommands } from '../src/ui/context-toolbar';
import { createExampleProject } from '../src/ui/example';
import { EditorSession } from '../src/ui/session';

const setup = () => {
  const engine = new EditorEngine(createExampleProject());
  const session = new EditorSession(engine);
  const layer = (id: string) =>
    locateLayer(session.source.composition.layers, id)!.layer;
  return { engine, session, layer };
};

test('[TXT-010] a layer without style properties keeps the old 600 Arial look; unknown values fall back', () => {
  const { layer } = setup();
  const style = textStyleOf(layer('example-headline'));
  expect(style).toEqual(DEFAULT_TEXT_STYLE);
  expect(textFont(style, 78)).toBe('600 78px "Arial", sans-serif');
  expect(
    textFont({ ...style, family: 'Georgia', weight: 700, italic: true }, 20),
  ).toBe('italic 700 20px "Georgia", serif');
  const odd = {
    ...layer('example-headline'),
    properties: {
      fontFamily: {
        type: 'string',
        value: 'Comic <script>',
        animated: false,
        keyframes: [],
        constraints: [],
      },
      lineHeight: {
        type: 'number',
        value: 99,
        animated: false,
        keyframes: [],
        constraints: [],
      },
    },
  } as never;
  expect(textStyleOf(odd).family).toBe('Arial');
  expect(textStyleOf(odd).lineHeight).toBe(1.2);
});

test('[TXT-016] line height and paragraph spacing set the line offsets and height', () => {
  const style = { ...DEFAULT_TEXT_STYLE, lineHeight: 2, paragraphSpacing: 10 };
  const layout = layoutText('one two\nthree', 35, 10, undefined, style);
  // "one two" wraps at 35 units (6 units a character).
  expect(layout.lines).toEqual(['one', 'two', 'three']);
  expect(layout.paragraphEnds).toEqual([false, true, true]);
  expect(lineOffsets(layout)).toEqual([0, 20, 50]);
  expect(layout.height).toBe(70);
  const plain = layoutParagraphs('a\nb', 10, style);
  expect(lineOffsets(plain)).toEqual([0, 30]);
  expect(plain.height).toBe(50);
  // Letter spacing widens the fallback measure, so text wraps sooner.
  expect(
    layoutText('one two', 50, 10, undefined, { ...style, letterSpacing: 2 })
      .lines,
  ).toEqual(['one', 'two']);
});

test('[TXT-017] case is applied for display only', () => {
  expect(applyCase('a study in shape', 'upper')).toBe('A STUDY IN SHAPE');
  expect(applyCase('STUDIO NOTES', 'lower')).toBe('studio notes');
  expect(applyCase('a study-in (shape) NASA', 'title')).toBe(
    'A Study-In (Shape) NASA',
  );
  expect(
    layoutParagraphs('ab', 10, {
      ...DEFAULT_TEXT_STYLE,
      textCase: 'upper',
    }).lines,
  ).toEqual(['AB']);
});

test('[TXT-016] a style change that overflows an unwrapped box grows its height in the same step', () => {
  const { engine, session, layer } = setup();
  const id = 'example-headline';
  const compositionId = session.source.composition.id;
  // 2 lines of 78 × 2 = 312 > the stored 230.
  const commands = textStyleCommands(compositionId, layer(id), 'lineHeight', 2);
  expect(commands).toHaveLength(2);
  engine.commands.transaction('Set line height', commands);
  expect(layer(id).properties.height!.value).toBe(312);
  // A change that fits leaves the height alone; the same value is a no-op.
  expect(
    textStyleCommands(compositionId, layer(id), 'textAlign', 'center'),
  ).toHaveLength(1);
  expect(textStyleCommands(compositionId, layer(id), 'lineHeight', 2)).toEqual(
    [],
  );
  expect(() =>
    textStyleCommands(compositionId, layer(id), 'fontFamily', 'Wingdings'),
  ).toThrow(RangeError);
  expect(() =>
    textStyleCommands(compositionId, layer(id), 'letterSpacing', 500),
  ).toThrow(RangeError);
  expect(
    textStyleCommands(compositionId, layer('example-badge'), 'fontWeight', 700),
  ).toEqual([]);
});
