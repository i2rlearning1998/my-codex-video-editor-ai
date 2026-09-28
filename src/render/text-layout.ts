import {
  applyCase,
  DEFAULT_TEXT_STYLE,
  textFont,
  type TextStyle,
} from './text-style';

/** A line's width at a size; `style` defaults to DEFAULT_TEXT_STYLE. */
export type TextMeasurer = (
  text: string,
  fontSize: number,
  style?: TextStyle,
) => number;
export const TEXT_FONT = (fontSize: number) =>
  textFont(DEFAULT_TEXT_STYLE, fontSize);
/** Deterministic metrics for headless ports. The browser supplies actual Canvas font measurements. */
export const fallbackTextMeasure: TextMeasurer = (text, size, style) =>
  Array.from(text).length * (size * 0.6 + (style?.letterSpacing ?? 0));
export interface TextLayout {
  readonly lines: readonly string[];
  readonly height: number;
  readonly lineHeight: number;
  /** TXT-016: whether each line ends a paragraph (paragraph spacing follows). */
  readonly paragraphEnds: readonly boolean[];
  readonly paragraphSpacing: number;
}
/** The y offset of every line: line height plus spacing after paragraphs. */
export function lineOffsets(layout: TextLayout): number[] {
  let y = 0;
  return layout.lines.map((_, index) => {
    const at = y;
    y +=
      layout.lineHeight +
      (layout.paragraphEnds[index] ? layout.paragraphSpacing : 0);
    return at;
  });
}
/** Unwrapped text: one line per paragraph. */
export function layoutParagraphs(
  text: string,
  fontSize: number,
  style: TextStyle = DEFAULT_TEXT_STYLE,
  maxLines = 1000,
): TextLayout {
  const lines = applyCase(text, style.textCase).split('\n', maxLines);
  const lineHeight = fontSize * style.lineHeight;
  return Object.freeze({
    lines: Object.freeze(lines),
    lineHeight,
    height:
      lines.length * lineHeight +
      Math.max(0, lines.length - 1) * style.paragraphSpacing,
    paragraphEnds: Object.freeze(lines.map(() => true)),
    paragraphSpacing: style.paragraphSpacing,
  });
}
/** Greedy word wrapping with explicit newlines and code-point splitting of overlong words. */
export function layoutText(
  text: string,
  width: number,
  fontSize: number,
  measure: TextMeasurer = fallbackTextMeasure,
  style: TextStyle = DEFAULT_TEXT_STYLE,
): TextLayout {
  if (![width, fontSize].every(Number.isFinite) || width <= 0 || fontSize <= 0)
    throw new RangeError('Invalid text layout dimensions');
  if (text.length > 100000)
    throw new RangeError(
      'Text width layout supports at most 100,000 characters',
    );
  const lines: string[] = [];
  const ends: boolean[] = [];
  const fits = (value: string) => {
    const result = measure(value, fontSize, style);
    if (!Number.isFinite(result) || result < 0)
      throw new RangeError('Invalid text metrics');
    return result <= width;
  };
  const push = (line: string) => {
    if (lines.length >= 10000)
      throw new RangeError('Text layout exceeds 10,000 lines');
    lines.push(line);
    ends.push(false);
  };
  for (const paragraph of applyCase(text, style.textCase)
    .replace(/\r\n?/g, '\n')
    .split('\n')) {
    let line = '';
    for (const token of paragraph.match(/\s+|\S+/gu) ?? []) {
      if (/^\s+$/u.test(token)) {
        if (line) line += token;
        continue;
      }
      if (fits(line + token)) {
        line += token;
        continue;
      }
      if (line.trimEnd()) push(line.trimEnd());
      line = '';
      // Binary-search maximal fitting code-point prefixes instead of quadratic character scans.
      const points = Array.from(token);
      let offset = 0;
      while (offset < points.length) {
        let low = 1,
          high = points.length - offset;
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (fits(points.slice(offset, offset + middle).join('')))
            low = middle;
          else high = middle - 1;
        }
        const part = points.slice(offset, offset + low).join('');
        offset += low;
        if (offset < points.length) push(part);
        else line = part;
      }
    }
    push(line.trimEnd());
    ends[ends.length - 1] = true;
  }
  const lineHeight = fontSize * style.lineHeight,
    paragraphs = ends.filter(Boolean).length,
    height = Math.max(
      lineHeight,
      lines.length * lineHeight +
        Math.max(0, paragraphs - 1) * style.paragraphSpacing,
    );
  if (!Number.isFinite(height)) throw new RangeError('Text layout overflow');
  return Object.freeze({
    lines: Object.freeze(lines),
    lineHeight,
    height,
    paragraphEnds: Object.freeze(ends),
    paragraphSpacing: style.paragraphSpacing,
  });
}
