export type TextMeasurer = (text: string, fontSize: number) => number;
export const TEXT_FONT = (fontSize: number) =>
  `600 ${fontSize}px Arial, sans-serif`;
/** Deterministic metrics for headless ports. The browser supplies actual Canvas font measurements. */
export const fallbackTextMeasure: TextMeasurer = (text, size) =>
  Array.from(text).length * size * 0.6;
export interface TextLayout {
  readonly lines: readonly string[];
  readonly height: number;
  readonly lineHeight: number;
}
/** Greedy word wrapping with explicit newlines and code-point splitting of overlong words. */
export function layoutText(
  text: string,
  width: number,
  fontSize: number,
  measure: TextMeasurer = fallbackTextMeasure,
): TextLayout {
  if (![width, fontSize].every(Number.isFinite) || width <= 0 || fontSize <= 0)
    throw new RangeError('Invalid text layout dimensions');
  if (text.length > 100000)
    throw new RangeError(
      'Text width layout supports at most 100,000 characters',
    );
  const lines: string[] = [];
  const fits = (value: string) => {
    const result = measure(value, fontSize);
    if (!Number.isFinite(result) || result < 0)
      throw new RangeError('Invalid text metrics');
    return result <= width;
  };
  const push = (line: string) => {
    if (lines.length >= 10000)
      throw new RangeError('Text layout exceeds 10,000 lines');
    lines.push(line);
  };
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
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
  }
  const lineHeight = fontSize * 1.2,
    height = Math.max(lineHeight, lines.length * lineHeight);
  if (!Number.isFinite(height)) throw new RangeError('Text layout overflow');
  return Object.freeze({ lines: Object.freeze(lines), lineHeight, height });
}
