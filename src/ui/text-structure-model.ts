// FINAL2 U6: pure helpers over the text engine's opt-in `textEngine` string
// property (docs/TEXT-ENGINE-API.md): direction, structured lists and tables.
// No DOM, no engine: the UI turns these into SET_PROPERTY commands.
import type { Command } from '../core';
import type { SceneLayer } from '../render/adapter';
import {
  parseTextEngine,
  textEngineProperty,
  type TextEngineOptions,
} from '../text-engine/layout';

export type TableModel = NonNullable<TextEngineOptions['table']>;
export type ListModel = NonNullable<TextEngineOptions['list']>;
export const TABLE_LIMITS = { rows: 100, columns: 30 } as const;
/** The picker's grid (rows × columns). */
export const TABLE_PICKER = { rows: 8, columns: 8 } as const;

export function engineOf(layer: SceneLayer): TextEngineOptions | undefined {
  const raw = layer.properties.textEngine;
  return raw?.type === 'string' ? parseTextEngine(raw.value) : undefined;
}
export const tableOf = (layer: SceneLayer) => engineOf(layer)?.table;
export const isTableLayer = (layer: SceneLayer | null | undefined) =>
  !!layer && layer.type === 'text' && !!tableOf(layer);

/** A new table: header row, equal columns, a soft grey border. */
export function newTable(rows: number, columns: number): TableModel {
  const r = Math.max(1, Math.min(TABLE_LIMITS.rows, Math.round(rows)));
  const c = Math.max(1, Math.min(TABLE_LIMITS.columns, Math.round(columns)));
  return {
    rows: Array.from({ length: r }, () =>
      Array.from({ length: c }, () => ({ text: '' })),
    ),
    columnWidths: Array.from({ length: c }, () => 1),
    header: true,
    padding: 8,
    border: '#9aa0a6',
    borderWidth: 1,
  };
}
export function resizeTable(
  table: TableModel,
  rows: number,
  columns: number,
): TableModel {
  const r = Math.max(1, Math.min(TABLE_LIMITS.rows, rows));
  const c = Math.max(1, Math.min(TABLE_LIMITS.columns, columns));
  const widths = Array.from(
    { length: c },
    (_, i) => table.columnWidths[i] ?? 1,
  );
  return {
    ...table,
    columnWidths: widths,
    rows: Array.from({ length: r }, (_, ri) =>
      Array.from(
        { length: c },
        (_, ci) => table.rows[ri]?.[ci] ?? { text: '' },
      ),
    ),
  };
}
export function setCell(
  table: TableModel,
  row: number,
  column: number,
  text: string,
): TableModel {
  return {
    ...table,
    rows: table.rows.map((cells, ri) =>
      ri !== row
        ? cells
        : cells.map((cell, ci) => (ci === column ? { ...cell, text } : cell)),
    ),
  };
}
/** The plain text a table layer keeps (search, alt text, older readers). */
export const tablePlainText = (table: TableModel) =>
  table.rows
    .map((cells) => cells.map((cell) => cell.text).join('\t'))
    .join('\n');

/** Levels for each paragraph of `text`, keeping the stored ones. */
export function listLevels(text: string, list: ListModel | undefined) {
  return text
    .split('\n')
    .slice(0, 1000)
    .map((_, i) => list?.levels?.[i] ?? 1);
}

const property = (options: TextEngineOptions) => {
  // An empty record returns the layer to the legacy layout.
  const empty = !options.direction && !options.list && !options.table;
  return empty
    ? { ...textEngineProperty({}), value: '' }
    : textEngineProperty(options);
};
/** The SET_PROPERTY for a new textEngine value (and the plain text for tables). */
export function engineCommands(
  compositionId: string,
  layer: SceneLayer,
  options: TextEngineOptions,
): Command[] {
  const commands: Command[] = [
    {
      type: 'SET_PROPERTY',
      compositionId,
      layerId: layer.id,
      target: { kind: 'property', key: 'textEngine' },
      property: property(options),
    } as unknown as Command,
  ];
  if (options.table) {
    // The stored box follows the rows (one line each; longer cells still
    // draw, the adapter grows the drawn box to the content).
    const size = layer.properties.fontSize;
    const line = layer.properties.lineHeight;
    const rowHeight =
      (size?.type === 'number' ? size.value : 32) *
        (line?.type === 'number' ? line.value : 1.2) +
      2 * (options.table.padding ?? 8);
    const height = layer.properties.height as unknown as
      { type: string; animated: boolean; value: number } | undefined;
    const rowCount: number = options.table.rows.length;
    if (height?.type === 'number' && !height.animated)
      commands.push({
        type: 'SET_PROPERTY',
        compositionId,
        layerId: layer.id,
        target: { kind: 'property', key: 'height' },
        property: { ...height, value: rowCount * rowHeight },
      } as unknown as Command);
    commands.push({
      type: 'SET_PROPERTY',
      compositionId,
      layerId: layer.id,
      target: { kind: 'property', key: 'text' },
      property: {
        type: 'string',
        value: tablePlainText(options.table),
        animated: false,
        keyframes: [],
        constraints: [],
      },
    } as unknown as Command);
  }
  return commands;
}
/** Drops `undefined` keys, so the strict schema accepts the record. */
export function cleanEngine(options: TextEngineOptions): TextEngineOptions {
  return Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined),
  ) as TextEngineOptions;
}
