// FINAL2 U6: tables (the text engine's table model, a text layer with a
// `textEngine` table record). Insert table opens a rows × columns picker and
// adds the table centred at the playhead in one undo step; double-click or
// Enter on a table edits the cell under the pointer in place (Tab moves to
// the next cell, Enter or a click elsewhere commits one step, Escape cancels).
import {
  invertMatrix,
  multiplyMatrices,
  transformPoint,
  worldTransform,
  type Command,
  type EditorEngine,
} from '../core';
import { t } from '../i18n';
import { locateLayer, type SceneLayer } from '../render/adapter';
import type { Viewport } from '../render/canvas';
import { fallbackTextMeasure } from '../render/text-layout';
import { textStyleOf } from '../render/text-style';
import { layoutStructured, textEngineProperty } from '../text-engine/layout';
import { openModal } from './components/modal';
import type { LibraryItem } from '../library/schema';
import type { EditorSession } from './session';
import {
  engineCommands,
  engineOf,
  newTable,
  setCell,
  tableOf,
  tablePlainText,
  TABLE_PICKER,
} from './text-structure-model';

const FONT_SIZE = 28;

/** Opens the rows × columns picker; `pick` runs with the chosen size. */
export function openTablePicker(pick: (rows: number, columns: number) => void) {
  let rows = 3,
    columns = 3;
  const modal = openModal({
    titleText: t('textx.table.insert'),
    bodyBuilder: (body) => {
      body.classList.add('table-picker');
      const label = document.createElement('p');
      label.className = 'table-picker-size';
      label.setAttribute('aria-live', 'polite');
      const grid = document.createElement('div');
      grid.className = 'table-picker-grid';
      grid.style.setProperty('--u6-columns', String(TABLE_PICKER.columns));
      grid.setAttribute('role', 'grid');
      grid.setAttribute('aria-label', t('textx.table.pick'));
      const show = () => {
        label.textContent = t('textx.table.size', {
          rows: String(rows),
          columns: String(columns),
        });
        for (const cell of grid.querySelectorAll<HTMLElement>('button')) {
          const r = Number(cell.dataset.rows),
            c = Number(cell.dataset.columns);
          cell.classList.toggle('on', r <= rows && c <= columns);
        }
      };
      for (let r = 1; r <= TABLE_PICKER.rows; r++)
        for (let c = 1; c <= TABLE_PICKER.columns; c++) {
          const cell = document.createElement('button');
          cell.type = 'button';
          cell.dataset.rows = String(r);
          cell.dataset.columns = String(c);
          cell.setAttribute(
            'aria-label',
            t('textx.table.size', { rows: String(r), columns: String(c) }),
          );
          const hover = () => {
            rows = r;
            columns = c;
            show();
          };
          cell.onpointerenter = hover;
          cell.onfocus = hover;
          cell.onclick = () => {
            modal.close();
            pick(r, c);
          };
          grid.append(cell);
        }
      body.append(grid, label);
      show();
    },
  });
}

/**
 * The table insert: the text box commands with a table record, sized to
 * its rows. `build` makes a text library insert centred on the canvas.
 */
export function tableInsertCommands(
  rows: number,
  columns: number,
  canvas: { width: number; height: number },
  build: (item: LibraryItem) => { commands: Command[]; layerId?: string },
): { commands: Command[]; layerId?: string } {
  const table = newTable(rows, columns);
  // Header labels so the new table reads as one (Column 1, Column 2 ...).
  table.rows[0] = table.rows[0]!.map((_, i) => ({
    text: t('textx.table.headerCell', { n: String(i + 1) }),
  }));
  const width = Math.min(canvas.width * 0.8, Math.max(240, columns * 180));
  const height = rows * (FONT_SIZE * 1.2 + 2 * (table.padding ?? 8));
  const item = {
    id: 'table',
    type: 'text',
    name: { en: t('textx.table'), hi: t('textx.table') },
    tags: [],
    data: {
      // FINAL3 T1: a table keeps its width (its columns divide it).
      fixedWidth: true,
      elements: [
        {
          kind: 'text',
          x: 0,
          y: 0,
          w: width / canvas.width,
          h: height / canvas.height,
          text: { en: tablePlainText(table), hi: tablePlainText(table) },
          size: FONT_SIZE / canvas.height,
          color: '#272b29',
          align: 'left',
        },
      ],
    },
  } as unknown as LibraryItem;
  const insert = build(item);
  for (const command of insert.commands) {
    if (command.type === 'CREATE_CLIP') {
      const clip = (command as unknown as { clip: { name: string } }).clip;
      clip.name = t('textx.table');
      continue;
    }
    if (command.type !== 'CREATE_LAYER') continue;
    const layer = (command as unknown as { layer: SceneLayer }).layer;
    if (layer.type !== 'text') continue;
    (layer as { name: string }).name = t('textx.table');
    const properties = layer.properties as unknown as Record<
      string,
      { value: unknown }
    >;
    const engineProperty: unknown = textEngineProperty({ table } as never);
    (layer as unknown as { properties: Record<string, unknown> }).properties = {
      ...properties,
      fontSize: { ...properties.fontSize!, value: FONT_SIZE },
      textEngine: engineProperty,
    };
  }
  return insert;
}

/** The cell boxes of a table layer, in its local units. */
function cellsOf(layer: SceneLayer, session: EditorSession) {
  const engine = engineOf(layer);
  if (!engine?.table) return [];
  const style = textStyleOf(layer);
  const size = layer.properties.fontSize;
  const fontSize = size?.type === 'number' ? size.value : 32;
  const width = layer.properties.width;
  const measure = session.source.measureText ?? fallbackTextMeasure;
  try {
    return layoutStructured(
      '',
      width?.type === 'number' ? width.value : 360,
      fontSize * style.lineHeight,
      engine,
      (value, bold) =>
        measure(value, fontSize, bold ? { ...style, weight: 700 } : style),
    );
  } catch {
    return [];
  }
}

export interface TableEditor {
  readonly layerId: string | null;
  /** Edits the cell at a window point (or the first cell). */
  start(layerId: string, at?: { x: number; y: number }): boolean;
  finish(commit?: boolean): void;
}

export function mountTableEditor(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  engine: EditorEngine,
  session: EditorSession,
  viewport: () => Viewport,
  report: (error: unknown) => void,
): TableEditor {
  const box = document.createElement('textarea');
  box.className = 'table-cell-editor';
  box.hidden = true;
  box.setAttribute('aria-label', t('textx.table.editing'));
  host.append(box);
  let layerId: string | null = null;
  let cell: [number, number] = [0, 0];
  let original = '';
  const layer = () =>
    layerId
      ? (locateLayer(session.source.composition.layers, layerId)?.layer ?? null)
      : null;
  const place = () => {
    const item = layer();
    if (!item || !layerId) return;
    const target = cellsOf(item, session).find(
      (entry) => entry.id === `cell-${cell[0]}-${cell[1]}`,
    );
    if (!target) return;
    const world = worldTransform(session.source.composition, layerId);
    const [a, b, c, d, e, f] = multiplyMatrices(
      viewport().matrix,
      world.matrix,
    );
    const canvasBox = canvas.getBoundingClientRect();
    const hostBox = host.getBoundingClientRect();
    const style = textStyleOf(item);
    const size = item.properties.fontSize;
    box.style.left = `${canvasBox.left - hostBox.left + host.scrollLeft}px`;
    box.style.top = `${canvasBox.top - hostBox.top + host.scrollTop}px`;
    box.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f}) translate(${target.x}px, ${target.y}px)`;
    box.style.width = `${target.width}px`;
    box.style.height = `${target.height}px`;
    box.style.fontFamily = `"${style.family}", sans-serif`;
    box.style.fontSize = `${size?.type === 'number' ? size.value : 32}px`;
    box.style.lineHeight = String(style.lineHeight);
    box.dir = target.direction;
  };
  const open = (row: number, column: number) => {
    const table = layer() ? tableOf(layer()!) : undefined;
    if (!table) return;
    cell = [row, column];
    original = table.rows[row]?.[column]?.text ?? '';
    box.value = original;
    box.hidden = false;
    place();
    box.focus({ preventScroll: true });
    box.select();
  };
  const commit = () => {
    const item = layer();
    const table = item ? tableOf(item) : undefined;
    if (!item || !table || box.value === original) return;
    try {
      engine.commands.transaction(
        t('textx.step.cell'),
        engineCommands(session.source.composition.id, item, {
          ...engineOf(item),
          table: setCell(table, cell[0], cell[1], box.value),
        }),
      );
      original = box.value;
    } catch (error) {
      report(error);
    }
  };
  const editor: TableEditor = {
    get layerId() {
      return layerId;
    },
    start(id, at) {
      const item = locateLayer(session.source.composition.layers, id)?.layer;
      if (!item || !tableOf(item)) return false;
      if (layerId) editor.finish(true);
      layerId = id;
      let row = 0,
        column = 0;
      if (at) {
        const inverse = invertMatrix(
          multiplyMatrices(
            viewport().matrix,
            worldTransform(session.source.composition, id).matrix,
          ),
        );
        const rect = canvas.getBoundingClientRect();
        if (inverse) {
          const [x, y] = transformPoint(inverse, [
            at.x - rect.left,
            at.y - rect.top,
          ]);
          const hit = cellsOf(item, session).find(
            (entry) =>
              x >= entry.x &&
              x <= entry.x + entry.width &&
              y >= entry.y &&
              y <= entry.y + entry.height,
          );
          const match = hit && /^cell-(\d+)-(\d+)$/.exec(hit.id);
          if (match) [row, column] = [Number(match[1]), Number(match[2])];
        }
      }
      open(row, column);
      return true;
    },
    finish(save = true) {
      if (!layerId) return;
      if (save) commit();
      layerId = null;
      box.hidden = true;
      box.blur();
    },
  };
  box.addEventListener('keydown', (event) => {
    event.stopPropagation();
    const table = layer() ? tableOf(layer()!) : undefined;
    if (event.key === 'Escape') {
      event.preventDefault();
      editor.finish(false);
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      editor.finish(true);
    } else if (event.key === 'Tab' && table) {
      event.preventDefault();
      commit();
      const columns = table.columnWidths.length;
      let index = cell[0] * columns + cell[1] + (event.shiftKey ? -1 : 1);
      const total = table.rows.length * columns;
      index = (index + total) % total;
      open(Math.floor(index / columns), index % columns);
    }
  });
  box.addEventListener('blur', () => {
    // A click elsewhere commits (Escape has already closed the editor).
    if (layerId) editor.finish(true);
  });
  return editor;
}
