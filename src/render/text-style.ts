// W2-F5 text styling (TXT-010, TXT-014, TXT-016, TXT-017): a text layer's
// font, weight, italic, alignment, spacing and case live in its property
// record (schema unchanged, D-033 pattern) and are read defensively here, so
// the preview, hit-testing and export share one interpretation.
import type { SceneLayer } from './adapter';

/** System fonts with their generic fallback; the W3 font picker replaces this. */
export const SYSTEM_FONTS = [
  ['Arial', 'sans-serif'],
  ['Verdana', 'sans-serif'],
  ['Tahoma', 'sans-serif'],
  ['Trebuchet MS', 'sans-serif'],
  ['Georgia', 'serif'],
  ['Times New Roman', 'serif'],
  ['Courier New', 'monospace'],
] as const;
export const FONT_WEIGHTS = [400, 600, 700] as const;
export const TEXT_ALIGNS = ['left', 'center', 'right', 'justify'] as const;
export const TEXT_CASES = ['none', 'upper', 'lower', 'title'] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];
export type TextCase = (typeof TEXT_CASES)[number];
/** Ranges accepted from stored values and from the toolbar. */
export const TEXT_LIMITS = {
  lineHeight: [0.5, 5],
  letterSpacing: [-50, 200],
  paragraphSpacing: [0, 500],
} as const;

export interface TextStyle {
  readonly family: string;
  readonly weight: number;
  readonly italic: boolean;
  readonly align: TextAlign;
  /** A multiple of the font size. */
  readonly lineHeight: number;
  /** Composition units added after every character. */
  readonly letterSpacing: number;
  /** Composition units added after every paragraph but the last. */
  readonly paragraphSpacing: number;
  readonly textCase: TextCase;
}
/** Matches the pre-W2-F5 rendering exactly (600 Arial, 1.2 line height). */
export const DEFAULT_TEXT_STYLE: TextStyle = Object.freeze({
  family: 'Arial',
  weight: 600,
  italic: false,
  align: 'left',
  lineHeight: 1.2,
  letterSpacing: 0,
  paragraphSpacing: 0,
  textCase: 'none',
});

const inRange = (value: number, [low, high]: readonly [number, number]) =>
  Number.isFinite(value) && value >= low && value <= high;

export function textStyleOf(layer: SceneLayer): TextStyle {
  const p = layer.properties;
  const string = (key: string) => {
    const value = p[key];
    return value?.type === 'string' ? value.value : undefined;
  };
  const numeric = (key: string) => {
    const value = p[key];
    return value?.type === 'number' ? value.value : undefined;
  };
  const family = string('fontFamily');
  const weight = numeric('fontWeight');
  const align = string('textAlign');
  const textCase = string('textCase');
  const lineHeight = numeric('lineHeight');
  const letterSpacing = numeric('letterSpacing');
  const paragraphSpacing = numeric('paragraphSpacing');
  return {
    family: SYSTEM_FONTS.some(([name]) => name === family)
      ? family!
      : DEFAULT_TEXT_STYLE.family,
    weight:
      weight !== undefined && inRange(weight, [100, 900])
        ? Math.round(weight / 100) * 100
        : DEFAULT_TEXT_STYLE.weight,
    italic: string('fontStyle') === 'italic',
    align: (TEXT_ALIGNS as readonly string[]).includes(align ?? '')
      ? (align as TextAlign)
      : DEFAULT_TEXT_STYLE.align,
    lineHeight:
      lineHeight !== undefined && inRange(lineHeight, TEXT_LIMITS.lineHeight)
        ? lineHeight
        : DEFAULT_TEXT_STYLE.lineHeight,
    letterSpacing:
      letterSpacing !== undefined &&
      inRange(letterSpacing, TEXT_LIMITS.letterSpacing)
        ? letterSpacing
        : 0,
    paragraphSpacing:
      paragraphSpacing !== undefined &&
      inRange(paragraphSpacing, TEXT_LIMITS.paragraphSpacing)
        ? paragraphSpacing
        : 0,
    textCase: (TEXT_CASES as readonly string[]).includes(textCase ?? '')
      ? (textCase as TextCase)
      : 'none',
  };
}

/** The CSS font shorthand for a style at a size. */
export function textFont(style: TextStyle, fontSize: number): string {
  const generic =
    SYSTEM_FONTS.find(([name]) => name === style.family)?.[1] ?? 'sans-serif';
  return `${style.italic ? 'italic ' : ''}${style.weight} ${fontSize}px "${style.family}", ${generic}`;
}

/** TXT-017: display-only case; the stored text keeps what the user typed. */
export function applyCase(text: string, textCase: TextCase): string {
  if (textCase === 'upper') return text.toLocaleUpperCase();
  if (textCase === 'lower') return text.toLocaleLowerCase();
  if (textCase === 'title')
    return text.replace(
      /(^|[\s\-–—/(["'“‘])(\p{L})/gu,
      (_, before: string, letter: string) =>
        before + letter.toLocaleUpperCase(),
    );
  return text;
}

/** Canvas measuring with letter spacing, whether or not Canvas supports it. */
export function measureWithContext(
  context: {
    font: string;
    measureText(text: string): { width: number };
    letterSpacing?: string;
  },
  text: string,
  fontSize: number,
  style: TextStyle = DEFAULT_TEXT_STYLE,
): number {
  context.font = textFont(style, fontSize);
  if ('letterSpacing' in context) context.letterSpacing = '0px';
  return (
    context.measureText(text).width +
    Array.from(text).length * style.letterSpacing
  );
}
