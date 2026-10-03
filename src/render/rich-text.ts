// J4: rich text. A text layer may hold per-range styles in its `textRuns`
// string property (JSON; schema unchanged, D-033 pattern) and a list style in
// `listStyle`. They are read defensively here and laid out and drawn the same
// in the preview and the export. A layer without runs or a list keeps the
// plain-text path (render/text-layout.ts), so existing text draws exactly as
// before.
import {
  applyCase,
  SYSTEM_FONTS,
  textFont,
  type TextStyle,
} from './text-style';
import type { TextMeasurer } from './text-layout';

/** A character range [start, end) of `text` (UTF-16 indices) and its styles. */
export interface TextRun {
  readonly start: number;
  readonly end: number;
  readonly weight?: number;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strike?: boolean;
  /** Six-digit hex colour. */
  readonly color?: string;
  /** Font size in composition units. */
  readonly size?: number;
  readonly family?: string;
}
export const LIST_STYLES = ['none', 'bullet', 'number'] as const;
export type ListStyle = (typeof LIST_STYLES)[number];
const HEX = /^#[0-9a-fA-F]{6}$/;
const FAMILIES = new Set<string>(SYSTEM_FONTS.map(([name]) => name));
/** J5: fonts bundled with the editor are also valid families. */
export function registerFontFamilies(names: readonly string[]): void {
  for (const name of names) FAMILIES.add(name);
}
export const isKnownFamily = (name: string) => FAMILIES.has(name);

/** Valid, sorted, non-overlapping runs, or [] (malformed input is ignored). */
export function parseRuns(json: string | undefined, length: number): TextRun[] {
  if (!json) return [];
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const runs: TextRun[] = [];
  for (const item of value.slice(0, 5000)) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const start = Math.max(0, Math.floor(Number(raw.start)));
    const end = Math.min(length, Math.floor(Number(raw.end)));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
      continue;
    const run: { -readonly [K in keyof TextRun]: TextRun[K] } = { start, end };
    const weight = Number(raw.weight);
    if (Number.isFinite(weight) && weight >= 100 && weight <= 900)
      run.weight = Math.round(weight / 100) * 100;
    if (typeof raw.italic === 'boolean') run.italic = raw.italic;
    if (typeof raw.underline === 'boolean') run.underline = raw.underline;
    if (typeof raw.strike === 'boolean') run.strike = raw.strike;
    if (typeof raw.color === 'string' && HEX.test(raw.color))
      run.color = raw.color.toLowerCase();
    const size = Number(raw.size);
    if (Number.isFinite(size) && size >= 1 && size <= 4096) run.size = size;
    if (typeof raw.family === 'string' && FAMILIES.has(raw.family))
      run.family = raw.family;
    if (Object.keys(run).length > 2) runs.push(run);
  }
  runs.sort((a, b) => a.start - b.start);
  // Later runs never overlap earlier ones.
  const result: TextRun[] = [];
  let reached = 0;
  for (const run of runs) {
    const start = Math.max(run.start, reached);
    if (start >= run.end) continue;
    result.push({ ...run, start });
    reached = run.end;
  }
  return result;
}
export const formatRuns = (runs: readonly TextRun[]) =>
  runs.length ? JSON.stringify(runs) : '';
export function parseListStyle(value: string | undefined): ListStyle {
  return (LIST_STYLES as readonly string[]).includes(value ?? '')
    ? (value as ListStyle)
    : 'none';
}

/** The resolved style of one character: the layer's style with its run. */
export interface CharStyle {
  readonly style: TextStyle;
  readonly size: number;
  readonly color: string;
  readonly underline: boolean;
  readonly strike: boolean;
}
export function charStyle(
  base: TextStyle,
  size: number,
  color: string,
  run: TextRun | undefined,
): CharStyle {
  if (!run)
    return {
      style: base,
      size,
      color,
      underline: base.underline,
      strike: base.strike,
    };
  return {
    style: {
      ...base,
      ...(run.weight !== undefined ? { weight: run.weight } : {}),
      ...(run.italic !== undefined ? { italic: run.italic } : {}),
      ...(run.family !== undefined ? { family: run.family } : {}),
    },
    size: run.size ?? size,
    color: run.color ?? color,
    underline: run.underline ?? base.underline,
    strike: run.strike ?? base.strike,
  };
}
const sameStyle = (a: CharStyle, b: CharStyle) =>
  a.size === b.size &&
  a.color === b.color &&
  a.underline === b.underline &&
  a.strike === b.strike &&
  a.style.weight === b.style.weight &&
  a.style.italic === b.style.italic &&
  a.style.family === b.style.family;

/** A piece of a line in one style. */
export interface RichSpan {
  readonly text: string;
  readonly look: CharStyle;
  readonly width: number;
}
export interface RichLine {
  readonly spans: readonly RichSpan[];
  readonly width: number;
  /** The largest font size on the line. */
  readonly size: number;
  readonly lineHeight: number;
  readonly paragraphEnd: boolean;
  /** List indent (the marker's width) on every line of a list paragraph. */
  readonly indent: number;
  /** The list marker on a paragraph's first line. */
  readonly marker?: RichSpan;
}
export interface RichLayout {
  readonly lines: readonly RichLine[];
  readonly height: number;
  readonly paragraphSpacing: number;
}

/**
 * Lays out rich text: paragraphs split on newlines, greedy word wrapping at
 * `width` (null: one line per paragraph), mixed sizes per line, list markers
 * with a hanging indent. Case is applied per span (display only).
 */
export function layoutRich(
  text: string,
  runs: readonly TextRun[],
  list: ListStyle,
  base: { style: TextStyle; size: number; color: string },
  width: number | null,
  measure: TextMeasurer,
): RichLayout {
  const plain = charStyle(base.style, base.size, base.color, undefined);
  const styles: CharStyle[] = [];
  let run = 0;
  for (let index = 0; index < text.length; index++) {
    while (run < runs.length && runs[run]!.end <= index) run++;
    const current = runs[run];
    styles.push(
      current && current.start <= index && index < current.end
        ? charStyle(base.style, base.size, base.color, current)
        : plain,
    );
  }
  const measureSpan = (value: string, look: CharStyle) =>
    measure(applyCase(value, look.style.textCase), look.size, look.style);
  const lines: RichLine[] = [];
  let offset = 0;
  let paragraphIndex = 0;
  for (const paragraph of text.split('\n')) {
    const start = offset;
    offset += paragraph.length + 1;
    paragraphIndex++;
    const markerText =
      list === 'bullet' ? '• ' : list === 'number' ? `${paragraphIndex}. ` : '';
    const firstLook = styles[start] ?? plain;
    const marker = markerText
      ? {
          text: markerText,
          look: firstLook,
          width: measureSpan(markerText, firstLook),
        }
      : undefined;
    const indent = marker?.width ?? 0;
    const room =
      width === null ? Number.POSITIVE_INFINITY : Math.max(1, width - indent);
    // Tokens: words and spaces, each split further where the style changes.
    const tokens: { text: string; looks: CharStyle[]; space: boolean }[] = [];
    for (const match of paragraph.matchAll(/\s+|\S+/gu)) {
      const at = start + match.index!;
      tokens.push({
        text: match[0],
        looks: styles.slice(at, at + match[0].length),
        space: /^\s/u.test(match[0]),
      });
    }
    const spansOf = (value: string, looks: CharStyle[]): RichSpan[] => {
      const result: RichSpan[] = [];
      let from = 0;
      for (let index = 1; index <= value.length; index++)
        if (index === value.length || !sameStyle(looks[index]!, looks[from]!)) {
          const piece = value.slice(from, index);
          result.push({
            text: piece,
            look: looks[from]!,
            width: measureSpan(piece, looks[from]!),
          });
          from = index;
        }
      return result;
    };
    let current: RichSpan[] = [];
    let currentWidth = 0;
    let first = true;
    const pushLine = (end: boolean) => {
      // Trailing spaces do not count for alignment.
      while (current.length && /^\s+$/u.test(current.at(-1)!.text)) {
        currentWidth -= current.at(-1)!.width;
        current.pop();
      }
      const size = Math.max(
        current.reduce((max, span) => Math.max(max, span.look.size), 0) ||
          (styles[start]?.size ?? base.size),
        marker?.look.size ?? 0,
      );
      lines.push({
        spans: current,
        width: currentWidth,
        size,
        lineHeight: size * base.style.lineHeight,
        paragraphEnd: end,
        indent,
        ...(first && marker ? { marker } : {}),
      });
      if (lines.length > 10000)
        throw new RangeError('Text layout exceeds 10,000 lines');
      first = false;
      current = [];
      currentWidth = 0;
    };
    for (const token of tokens) {
      const spans = spansOf(token.text, token.looks);
      const tokenWidth = spans.reduce((sum, span) => sum + span.width, 0);
      if (token.space) {
        if (current.length) {
          current.push(...spans);
          currentWidth += tokenWidth;
        }
        continue;
      }
      if (currentWidth + tokenWidth <= room || !current.length) {
        if (tokenWidth <= room || !current.length) {
          if (tokenWidth > room && width !== null) {
            // An overlong word breaks by character.
            for (const span of spans)
              for (const char of Array.from(span.text)) {
                const piece = {
                  text: char,
                  look: span.look,
                  width: measureSpan(char, span.look),
                };
                if (currentWidth + piece.width > room && current.length)
                  pushLine(false);
                current.push(piece);
                currentWidth += piece.width;
              }
            continue;
          }
          current.push(...spans);
          currentWidth += tokenWidth;
          continue;
        }
      }
      pushLine(false);
      current.push(...spans);
      currentWidth += tokenWidth;
    }
    pushLine(true);
  }
  const height = lines.reduce(
    (sum, line, index) =>
      sum +
      line.lineHeight +
      (line.paragraphEnd && index < lines.length - 1
        ? base.style.paragraphSpacing
        : 0),
    0,
  );
  return { lines, height, paragraphSpacing: base.style.paragraphSpacing };
}

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/** The font's ascent at a size (top of the line to the baseline). */
function ascentOf(context: Context, look: CharStyle): number {
  context.font = textFont(look.style, look.size);
  const metrics = context.measureText('Mg');
  const ascent = metrics.fontBoundingBoxAscent;
  return Number.isFinite(ascent) && ascent > 0 ? ascent : look.size * 0.8;
}

/** Draws a rich layout in a box `width` wide, anchored like plain text. */
export function drawRich(
  context: Context,
  layout: RichLayout,
  base: TextStyle,
  width: number,
  height: number,
) {
  const room = Math.max(0, height - layout.height);
  let y =
    base.anchor === 'middle' ? room / 2 : base.anchor === 'bottom' ? room : 0;
  context.textBaseline = 'alphabetic';
  const drawSpan = (
    span: RichSpan,
    x: number,
    baseline: number,
    ascent: number,
  ) => {
    context.font = textFont(span.look.style, span.look.size);
    context.fillStyle = span.look.color;
    context.letterSpacing = `${span.look.style.letterSpacing}px`;
    context.fillText(
      applyCase(span.text, span.look.style.textCase),
      x,
      baseline,
    );
    context.letterSpacing = '0px';
    if (/^\s+$/u.test(span.text) && !span.look.underline && !span.look.strike)
      return;
    const thickness = Math.max(1, span.look.size / 15);
    const top = baseline - ascent;
    if (span.look.underline)
      context.fillRect(x, top + span.look.size * 0.95, span.width, thickness);
    if (span.look.strike)
      context.fillRect(x, top + span.look.size * 0.52, span.width, thickness);
  };
  for (const [index, line] of layout.lines.entries()) {
    if (y > height) break;
    const ascents = line.spans.map((span) => ascentOf(context, span.look));
    const markerAscent = line.marker ? ascentOf(context, line.marker.look) : 0;
    const ascent = Math.max(markerAscent, ...ascents, 0) || line.size * 0.8;
    const baseline = y + ascent;
    const space = width - line.indent;
    const justify =
      base.align === 'justify' &&
      !line.paragraphEnd &&
      line.spans.some((span) => /\s/u.test(span.text));
    const spaces = justify
      ? line.spans.filter((span) => /^\s+$/u.test(span.text)).length
      : 0;
    const extra = justify && spaces ? (space - line.width) / spaces : 0;
    let x =
      line.indent +
      (justify
        ? 0
        : base.align === 'center'
          ? (space - line.width) / 2
          : base.align === 'right'
            ? space - line.width
            : 0);
    if (line.marker)
      drawSpan(
        {
          ...line.marker,
          look: { ...line.marker.look, underline: false, strike: false },
        },
        x - line.indent,
        baseline,
        markerAscent,
      );
    line.spans.forEach((span, at) => {
      drawSpan(span, x, baseline, ascents[at]!);
      x += span.width + (extra && /^\s+$/u.test(span.text) ? extra : 0);
    });
    y +=
      line.lineHeight +
      (line.paragraphEnd && index < layout.lines.length - 1
        ? layout.paragraphSpacing
        : 0);
  }
}
