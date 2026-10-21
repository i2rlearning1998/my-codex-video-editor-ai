// J4: rich text. A text layer may hold per-range styles in its `textRuns`
// string property (JSON; schema unchanged, D-033 pattern) and a list style in
// `listStyle`. They are read defensively here and laid out and drawn the same
// in the preview and the export. A layer without runs or a list keeps the
// plain-text path (render/text-layout.ts), so existing text draws exactly as
// before.
import {
  applyCase,
  applyKerning,
  measureWithContext,
  SYSTEM_FONTS,
  textFont,
  typographyText,
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
  /** FINAL3 T5 (Canva "Text position"): superscript or subscript. */
  readonly script?: 'super' | 'sub';
}
/** FINAL3 T3: bullet, numbered and checklist lists act on paragraphs. */
export const LIST_STYLES = ['none', 'bullet', 'number', 'check'] as const;
/** FINAL3 T2: a soft line break (Shift+Enter) inside a paragraph. */
export const SOFT_BREAK = '\u2028';
/** FINAL3 T3: per-paragraph list levels (0 to 3) and checklist ticks. */
export interface ListInfo {
  readonly levels?: readonly number[];
  readonly checked?: readonly boolean[];
  /** FINAL2 U6's direction setting (auto detects per paragraph). */
  readonly direction?: 'ltr' | 'rtl' | 'auto';
}
export const MAX_LIST_LEVEL = 3;
/** "0,1,-1" → [0, 1, -1] (−1: a paragraph left out of the list; malformed
 *  entries read as 0). */
export function parseListLevels(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .split(',')
    .slice(0, 10000)
    .map((part) => {
      const level = Math.floor(Number(part));
      return Number.isFinite(level)
        ? Math.max(-1, Math.min(MAX_LIST_LEVEL, level))
        : 0;
    });
}
export const formatListLevels = (levels: readonly number[]) =>
  levels.some((level) => level !== 0) ? levels.join(',') : '';
/** "0,1" → [false, true]. */
export function parseListChecked(value: string | undefined): boolean[] {
  if (!value) return [];
  return value
    .split(',')
    .slice(0, 10000)
    .map((part) => part.trim() === '1');
}
export const formatListChecked = (checked: readonly boolean[]) =>
  checked.some(Boolean) ? checked.map((on) => (on ? '1' : '0')).join(',') : '';
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
    if (raw.script === 'super' || raw.script === 'sub') run.script = raw.script;
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
  /** FINAL3: drawn smaller and raised (super) or lowered (sub). */
  readonly script?: 'super' | 'sub';
}
/** FINAL3: superscript and subscript are drawn at 62 % of the size. */
export const SCRIPT_SCALE = 0.62;
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
    size: (run.size ?? size) * (run.script ? SCRIPT_SCALE : 1),
    color: run.color ?? color,
    underline: run.underline ?? base.underline,
    strike: run.strike ?? base.strike,
    ...(run.script ? { script: run.script } : {}),
  };
}
const sameStyle = (a: CharStyle, b: CharStyle) =>
  a.size === b.size &&
  a.script === b.script &&
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
  /** FINAL3: the paragraph this line belongs to (0-based). */
  readonly paragraph?: number;
  /** FINAL3: the line's text direction (Arabic and Hebrew read right to left). */
  readonly direction?: 'ltr' | 'rtl';
}
export interface RichLayout {
  readonly lines: readonly RichLine[];
  readonly height: number;
  readonly paragraphSpacing: number;
}

/**
 * FINAL3 T3: every paragraph's list marker ('' when it is not in the list):
 * bullets change shape by level, numbers restart below a shallower level
 * (odd levels count a, b, c), checklists show a ticked or empty box.
 */
export function listMarkers(
  paragraphs: number,
  list: ListStyle,
  info: ListInfo = {},
): string[] {
  const counters = [0, 0, 0, 0];
  const result: string[] = [];
  for (let paragraphIndex = 1; paragraphIndex <= paragraphs; paragraphIndex++) {
    const listed =
      list === 'none' ? -1 : (info.levels?.[paragraphIndex - 1] ?? 0);
    const level = Math.max(0, listed);
    if (listed >= 0) {
      counters[level] = counters[level]! + 1;
      counters.fill(0, level + 1);
    }
    const markerText =
      listed < 0
        ? ''
        : list === 'bullet'
          ? `${['•', '◦', '▪', '‣'][level]} `
          : list === 'number'
            ? `${level % 2 ? String.fromCharCode(96 + Math.min(26, counters[level]!)) : counters[level]}. `
            : list === 'check'
              ? info.checked?.[paragraphIndex - 1]
                ? '☑ '
                : '☐ '
              : '';
    result.push(markerText);
  }
  return result;
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
  info: ListInfo = {},
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
  const markers = listMarkers(text.split('\n').length, list, info);
  for (const paragraph of text.split('\n')) {
    const start = offset;
    offset += paragraph.length + 1;
    paragraphIndex++;
    const listed =
      list === 'none' ? -1 : (info.levels?.[paragraphIndex - 1] ?? 0);
    const level = Math.max(0, listed);
    const markerText = markers[paragraphIndex - 1] ?? '';
    const firstLook = styles[start] ?? plain;
    const marker = markerText
      ? {
          text: markerText,
          look: firstLook,
          width: measureSpan(markerText, firstLook),
        }
      : undefined;
    // FINAL3 T3: each level indents by about two characters.
    const indent = marker ? marker.width + level * firstLook.size * 1.2 : 0;
    const direction =
      info.direction === 'rtl' || info.direction === 'ltr'
        ? info.direction
        : /^[^\p{L}]*[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(paragraph)
          ? ('rtl' as const)
          : ('ltr' as const);
    const room =
      width === null ? Number.POSITIVE_INFINITY : Math.max(1, width - indent);
    // Tokens: words and spaces, each split further where the style changes.
    // FINAL3 T2: a soft break (Shift+Enter) is a token of its own.
    const tokens: {
      text: string;
      looks: CharStyle[];
      space: boolean;
      soft?: true;
    }[] = [];
    for (const match of paragraph.matchAll(
      /\u2028|[^\S\u2028]+|[^\s\u2028]+/gu,
    )) {
      const at = start + match.index!;
      if (match[0] === SOFT_BREAK) {
        tokens.push({ text: '', looks: [], space: false, soft: true });
        continue;
      }
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
        paragraph: paragraphIndex - 1,
        direction,
        ...(first && marker ? { marker } : {}),
      });
      if (lines.length > 10000)
        throw new RangeError('Text layout exceeds 10,000 lines');
      first = false;
      current = [];
      currentWidth = 0;
    };
    for (const token of tokens) {
      if (token.soft) {
        pushLine(false);
        continue;
      }
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

/** One span placed on a line. */
export interface PlacedSpan {
  readonly span: RichSpan;
  readonly x: number;
  readonly ascent: number;
}
/** FINAL3: where each line of a rich layout is drawn in its box. */
export interface PlacedLine {
  readonly line: RichLine;
  readonly top: number;
  readonly baseline: number;
  /** The text's left edge and width (justified lines fill the room). */
  readonly x: number;
  readonly width: number;
  readonly spans: readonly PlacedSpan[];
  readonly marker?: PlacedSpan;
}
/**
 * FINAL3: lays every line of a rich layout into a box: the vertical anchor,
 * alignment (justify spreads word gaps; a right-to-left line starts at the
 * right) and list markers. Shared by every drawing pass and text effect.
 */
export function placeRich(
  context: Context,
  layout: RichLayout,
  base: TextStyle,
  width: number,
  height: number,
): PlacedLine[] {
  const room = Math.max(0, height - layout.height);
  let y =
    base.anchor === 'middle' ? room / 2 : base.anchor === 'bottom' ? room : 0;
  const placed: PlacedLine[] = [];
  for (const [index, line] of layout.lines.entries()) {
    if (y > height + 0.5) break;
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
    const rtl = line.direction === 'rtl';
    // A right-to-left line reads from the right: "left" means its start.
    const align =
      rtl && base.align === 'left'
        ? 'right'
        : rtl && base.align === 'right'
          ? 'left'
          : base.align;
    const offset = justify
      ? 0
      : align === 'center'
        ? (space - line.width) / 2
        : align === 'right'
          ? space - line.width
          : 0;
    const spans: PlacedSpan[] = [];
    const lineWidth = justify ? space : line.width;
    if (rtl) {
      // Spans run from the right edge leftwards.
      let x = width - line.indent - offset;
      line.spans.forEach((span, at) => {
        x -= span.width + (extra && /^\s+$/u.test(span.text) ? extra : 0);
        spans.push({ span, x, ascent: ascents[at]! });
      });
    } else {
      let x = line.indent + offset;
      line.spans.forEach((span, at) => {
        spans.push({ span, x, ascent: ascents[at]! });
        x += span.width + (extra && /^\s+$/u.test(span.text) ? extra : 0);
      });
    }
    const start = rtl
      ? width - line.indent - offset - lineWidth
      : line.indent + offset;
    placed.push({
      line,
      top: y,
      baseline,
      x: start,
      width: lineWidth,
      spans,
      ...(line.marker
        ? {
            marker: {
              span: {
                ...line.marker,
                look: { ...line.marker.look, underline: false, strike: false },
              },
              x: rtl ? start + lineWidth + 0 : start - line.marker.width,
              ascent: markerAscent,
            },
          }
        : {}),
    });
    y +=
      line.lineHeight +
      (line.paragraphEnd && index < layout.lines.length - 1
        ? layout.paragraphSpacing
        : 0);
  }
  return placed;
}

/** FINAL3: one drawing pass over the text (effects draw several). */
export interface TextPaint {
  /** Replaces every span's colour (a tint, a gradient or a pattern). */
  readonly color?: string | CanvasGradient | CanvasPattern;
  /** Strokes the glyphs at this width (composition units) instead. */
  readonly stroke?: number;
  readonly dx?: number;
  readonly dy?: number;
  /** FINAL3 T6: how many grapheme clusters show (typewriter); all if unset. */
  readonly reveal?: number;
  /** No underline or strikethrough (outline and shadow copies). */
  readonly bare?: boolean;
  /** FINAL3 Curve: −100 (bends down) to 100 (arches up); 0 is straight. */
  readonly curve?: number;
}

let segmenter: Intl.Segmenter | null | undefined;
/** Grapheme clusters: a Devanagari conjunct or an emoji is never split. */
export function clusters(text: string): string[] {
  if (segmenter === undefined)
    segmenter =
      typeof Intl !== 'undefined' && 'Segmenter' in Intl
        ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        : null;
  return segmenter
    ? Array.from(segmenter.segment(text), (part) => part.segment)
    : Array.from(text);
}
/** FINAL3 T6: the grapheme clusters a layout draws (markers excluded). */
export function richClusterCount(layout: RichLayout): number {
  let count = 0;
  for (const line of layout.lines)
    for (const span of line.spans) count += clusters(span.text).length;
  return count;
}
/** FINAL3 Curve: the arc's angle and radius for a line (null: straight). */
export function curveArc(
  curve: number | undefined,
  lineWidth: number,
): { angle: number; radius: number } | null {
  if (!curve || !Number.isFinite(curve) || lineWidth <= 0) return null;
  const angle = (Math.min(100, Math.abs(curve)) / 100) * 1.5 * Math.PI;
  return { angle: Math.sign(curve) * angle, radius: lineWidth / angle };
}
/** FINAL3 Curve: how far the ends of a curved line move (the arc's sagitta). */
export function curveDrop(curve: number | undefined, lineWidth: number) {
  const arc = curveArc(curve, lineWidth);
  if (!arc) return 0;
  const half = Math.abs(arc.angle) / 2;
  return half >= Math.PI / 2
    ? arc.radius * (1 + Math.min(1, half / Math.PI - 0.5))
    : arc.radius * (1 - Math.cos(half));
}

/** Draws a rich layout in a box `width` wide, anchored like plain text. */
export function drawRich(
  context: Context,
  layout: RichLayout,
  base: TextStyle,
  width: number,
  height: number,
  paint: TextPaint = {},
  placed: readonly PlacedLine[] = placeRich(
    context,
    layout,
    base,
    width,
    height,
  ),
) {
  context.textBaseline = 'alphabetic';
  context.textAlign = 'left';
  let left = paint.reveal ?? Number.POSITIVE_INFINITY;
  const dx = paint.dx ?? 0,
    dy = paint.dy ?? 0;
  const glyphs = (span: RichSpan, text: string, x: number, y: number) => {
    const style = span.look.style;
    context.font = textFont(style, span.look.size);
    applyKerning(context as { fontKerning?: string }, style);
    context.letterSpacing = `${style.letterSpacing}px`;
    const value = typographyText(applyCase(text, style.textCase), style);
    if (paint.stroke) {
      context.lineWidth = paint.stroke;
      context.lineJoin = 'round';
      context.strokeStyle = paint.color ?? span.look.color;
      context.strokeText(value, x, y);
    } else {
      context.fillStyle = paint.color ?? span.look.color;
      context.fillText(value, x, y);
    }
    context.letterSpacing = '0px';
  };
  const scriptShift = (span: RichSpan) =>
    span.look.script === 'super'
      ? -span.look.size * 0.6
      : span.look.script === 'sub'
        ? span.look.size * 0.25
        : 0;
  const drawSpan = (
    placedSpan: PlacedSpan,
    baseline: number,
    marker = false,
  ) => {
    const { span } = placedSpan;
    let text = span.text;
    if (!marker && Number.isFinite(left)) {
      const parts = clusters(text);
      if (left <= 0) return;
      if (parts.length > left) text = parts.slice(0, left).join('');
      left -= parts.length;
    }
    const x = placedSpan.x + dx,
      y = baseline + dy + scriptShift(span);
    glyphs(span, text, x, y);
    if (paint.bare || marker) return;
    if (/^\s+$/u.test(span.text) && !span.look.underline && !span.look.strike)
      return;
    const thickness = Math.max(1, span.look.size / 15);
    const top = y - placedSpan.ascent;
    const drawn =
      text === span.text
        ? span.width
        : measureWithContext(context, text, span.look.size, span.look.style);
    context.fillStyle = paint.color ?? span.look.color;
    if (span.look.underline)
      context.fillRect(x, top + span.look.size * 0.95, drawn, thickness);
    if (span.look.strike)
      context.fillRect(x, top + span.look.size * 0.52, drawn, thickness);
  };
  for (const line of placed) {
    const arc = curveArc(paint.curve, line.line.width);
    if (arc) {
      drawCurvedLine(context, line, arc, paint, (span, text, x, y) => {
        if (Number.isFinite(left)) {
          if (left <= 0) return;
          left -= 1;
        }
        glyphs(span, text, x, y);
      });
      continue;
    }
    if (line.marker) drawSpan(line.marker, line.baseline, true);
    for (const span of line.spans) drawSpan(span, line.baseline);
  }
}

/** FINAL3 Curve: draws a line's clusters one by one along a circle. */
function drawCurvedLine(
  context: Context,
  line: PlacedLine,
  arc: { angle: number; radius: number },
  paint: TextPaint,
  draw: (span: RichSpan, text: string, x: number, y: number) => void,
) {
  const up = arc.angle > 0;
  const centerX = line.x + line.width / 2 + (paint.dx ?? 0);
  const centerY = up
    ? line.baseline + arc.radius + (paint.dy ?? 0)
    : line.baseline - arc.radius + (paint.dy ?? 0);
  let travelled = 0;
  for (const placed of line.spans) {
    const { span } = placed;
    context.font = textFont(span.look.style, span.look.size);
    for (const cluster of clusters(span.text)) {
      const advance = measureWithContext(
        context,
        cluster,
        span.look.size,
        span.look.style,
      );
      const middle = travelled + advance / 2 - line.line.width / 2;
      const theta = (middle / line.line.width) * Math.abs(arc.angle);
      context.save();
      if (up) {
        context.translate(
          centerX + arc.radius * Math.sin(theta),
          centerY - arc.radius * Math.cos(theta),
        );
        context.rotate(theta);
      } else {
        context.translate(
          centerX + arc.radius * Math.sin(theta),
          centerY + arc.radius * Math.cos(theta),
        );
        context.rotate(-theta);
      }
      if (!/^\s+$/u.test(cluster)) draw(span, cluster, -advance / 2, 0);
      context.restore();
      travelled += advance;
    }
  }
}
