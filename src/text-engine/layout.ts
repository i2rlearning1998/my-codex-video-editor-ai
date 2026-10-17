import { z } from 'zod';
export type Direction = 'ltr' | 'rtl' | 'auto';
export function resolveDirection(
  text: string,
  direction: Direction = 'auto',
): 'ltr' | 'rtl' {
  if (direction !== 'auto') return direction;
  for (const c of text) {
    if (/[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(c)) return 'rtl';
    if (/\p{Letter}/u.test(c)) return 'ltr';
  }
  return 'ltr';
}
/** Keep shaping clusters intact; the Canvas shaper receives whole lines. */
export function graphemes(text: string): string[] {
  return Array.from(
    new Intl.Segmenter('hi', { granularity: 'grapheme' }).segment(text),
    (s) => s.segment,
  );
}
export function breakLines(
  text: string,
  width: number,
  measure: (text: string) => number,
): string[] {
  if (!Number.isFinite(width) || width <= 0 || text.length > 100000)
    throw new RangeError('Invalid text bounds');
  const lines: string[] = [];
  const fits = (s: string) => {
    const n = measure(s);
    if (!Number.isFinite(n) || n < 0)
      throw new RangeError('Invalid text metrics');
    return n <= width;
  };
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = '';
    for (const word of paragraph.match(/\s+|\S+/gu) ?? []) {
      if (fits(line + word)) {
        line += word;
        continue;
      }
      if (line.trimEnd()) lines.push(line.trimEnd());
      line = '';
      if (/^\s+$/u.test(word)) continue;
      for (const cluster of graphemes(word)) {
        if (line && !fits(line + cluster)) {
          lines.push(line);
          line = '';
        }
        line += cluster;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
export function glyphCoverage(
  text: string,
  hasGlyph: (codePoint: number) => boolean,
) {
  const missing = [
    ...new Set(
      Array.from(text).filter(
        (c) => !/[\s\p{Cf}]/u.test(c) && !hasGlyph(c.codePointAt(0)!),
      ),
    ),
  ];
  return { covered: missing.length === 0, missing };
}
const color = z.string().regex(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i);
const cellStyle = z
  .object({
    color: color.optional(),
    background: color.optional(),
    bold: z.boolean().optional(),
    align: z.enum(['start', 'center', 'end']).optional(),
  })
  .strict();
export const textEngineSchema = z
  .object({
    direction: z.enum(['ltr', 'rtl', 'auto']).optional(),
    list: z
      .object({
        kind: z.enum(['bullet', 'numbered']),
        levels: z.array(z.number().int().min(1).max(3)).max(1000).optional(),
        bullet: z.enum(['disc', 'circle', 'square']).optional(),
        indent: z.number().finite().min(8).max(500).optional(),
        spacing: z.number().finite().min(0).max(500).optional(),
      })
      .strict()
      .optional(),
    table: z
      .object({
        rows: z
          .array(
            z
              .array(
                z
                  .object({
                    text: z.string().max(10000),
                    style: cellStyle.optional(),
                  })
                  .strict(),
              )
              .min(1)
              .max(30),
          )
          .min(1)
          .max(100),
        columnWidths: z.array(z.number().finite().positive()).min(1).max(30),
        header: z.boolean().optional(),
        padding: z.number().finite().min(0).max(100).optional(),
        border: color.optional(),
        borderWidth: z.number().finite().min(0).max(20).optional(),
      })
      .strict()
      .superRefine((t, ctx) => {
        if (t.rows.some((r) => r.length !== t.columnWidths.length))
          ctx.addIssue({
            code: 'custom',
            message: 'Each table row must match columnWidths',
          });
      })
      .optional(),
  })
  .strict()
  .refine((o) => !(o.list && o.table), 'Choose a list or a table');
export type TextEngineOptions = z.infer<typeof textEngineSchema>;
export function parseTextEngine(raw?: string): TextEngineOptions | undefined {
  if (!raw || raw.length > 1048576) return undefined;
  try {
    const r = textEngineSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : undefined;
  } catch {
    return undefined;
  }
}
export interface TextCell {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  direction: 'ltr' | 'rtl';
  style?: z.infer<typeof cellStyle>;
  marker?: string;
}
export function layoutStructured(
  text: string,
  width: number,
  lineHeight: number,
  options: TextEngineOptions,
  measure: (text: string, bold?: boolean) => number,
): TextCell[] {
  textEngineSchema.parse(options);
  if (
    !Number.isFinite(lineHeight) ||
    lineHeight <= 0 ||
    !Number.isFinite(width) ||
    width <= 0
  )
    throw new RangeError('Invalid layout size');
  const result: TextCell[] = [];
  let y = 0;
  if (options.table) {
    const t = options.table,
      total = t.columnWidths.reduce((a, b) => a + b, 0),
      padding = t.padding ?? 8;
    if (!Number.isFinite(total)) throw new RangeError('Invalid table width');
    t.rows.forEach((row, ri) => {
      let x = 0;
      const cells = row.map((cell, ci): TextCell => {
        const w = (width * t.columnWidths[ci]!) / total;
        if (w <= padding * 2)
          throw new RangeError('Table column is narrower than padding');
        const style = {
          ...cell.style,
          bold: cell.style?.bold ?? (t.header === true && ri === 0),
        };
        const lines = breakLines(cell.text, w - 2 * padding, (s) =>
          measure(s, style.bold),
        );
        const c: TextCell = {
          id: `cell-${ri}-${ci}`,
          x,
          y,
          width: w,
          height: lines.length * lineHeight + 2 * padding,
          lines,
          direction: resolveDirection(cell.text, options.direction),
          style,
        };
        x += w;
        return c;
      });
      const height = Math.max(...cells.map((c) => c.height));
      result.push(...cells.map((c) => ({ ...c, height })));
      y += height;
    });
  } else {
    const counters = [0, 0, 0];
    text
      .split('\n')
      .slice(0, 1000)
      .forEach((paragraph, i) => {
        const level = options.list?.levels?.[i] ?? 1,
          indent = options.list ? (options.list.indent ?? 28) * level : 0;
        if (width <= indent) throw new RangeError('List indent exceeds width');
        counters[level - 1] = counters[level - 1]! + 1;
        counters.fill(0, level);
        const direction = resolveDirection(paragraph, options.direction);
        const lines = breakLines(paragraph, width - indent, measure),
          height = lines.length * lineHeight;
        const marker = options.list
          ? options.list.kind === 'numbered'
            ? `${counters[level - 1]}.`
            : { disc: '•', circle: '◦', square: '▪' }[
                options.list.bullet ?? 'disc'
              ]
          : undefined;
        result.push({
          id: `paragraph-${i}`,
          x: direction === 'rtl' ? 0 : indent,
          y,
          width: width - indent,
          height,
          lines,
          direction,
          ...(marker ? { marker } : {}),
        });
        y += height + (options.list?.spacing ?? 0);
      });
  }
  return result;
}
/** Pass this property to the existing SET_PROPERTY command, key textEngine. */
export function textEngineProperty(options: TextEngineOptions) {
  return {
    type: 'string' as const,
    value: JSON.stringify(textEngineSchema.parse(options)),
    animated: false,
    keyframes: [],
    constraints: [],
  };
}
