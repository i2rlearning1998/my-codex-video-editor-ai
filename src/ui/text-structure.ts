// FINAL2 U6: the right panel's text controls over the text engine's opt-in
// `textEngine` property: direction (Auto, LTR, RTL), start / centre / end
// alignment that flips for RTL, structured bullet and numbered lists (style,
// level per line, indent, spacing) and, for a table, its rows, columns,
// header row, column widths, border and cells. Every change is one
// SET_PROPERTY step through the Command Bus.
import type { Command } from '../core';
import { t } from '../i18n';
import type { SceneLayer } from '../render/adapter';
import {
  resolveDirection,
  type TextEngineOptions,
} from '../text-engine/layout';
import { textStyleOf } from '../render/text-style';
import { createColorField } from './components/color-picker';
import { createNumberField } from './components/number-field';
import { createSelect } from './components/select';
import { iconSvg } from './icons';
import {
  cleanEngine,
  engineCommands,
  engineOf,
  listLevels,
  resizeTable,
  setCell,
  TABLE_LIMITS,
  type TableModel,
} from './text-structure-model';

export interface TextStructureDeps {
  readonly compositionId: string;
  /** The selected text layer, read fresh at commit time. */
  readonly layer: () => SceneLayer | null;
  readonly run: (label: string, commands: Command[]) => void;
  /** The existing whole-box textAlign command (shared with the toolbar). */
  readonly align: (value: 'left' | 'center' | 'right') => void;
  readonly accordion: (
    id: string,
    title: string,
    content: readonly (HTMLElement | null | undefined)[],
  ) => HTMLElement;
}

const segmented = (
  id: string,
  label: string,
  options: readonly {
    value: string;
    label: string;
    icon?: string;
  }[],
  value: string,
  pick: (value: string) => void,
) => {
  const wrap = document.createElement('div');
  wrap.className = 'segmented text-structure-segmented';
  wrap.id = id;
  wrap.setAttribute('role', 'radiogroup');
  wrap.setAttribute('aria-label', label);
  for (const option of options) {
    const item = document.createElement('button');
    item.type = 'button';
    item.dataset.value = option.value;
    item.setAttribute('role', 'radio');
    item.setAttribute('aria-checked', String(option.value === value));
    item.title = option.label;
    item.innerHTML = option.icon
      ? `${iconSvg(option.icon, 16)}<span></span>`
      : '<span></span>';
    item.querySelector('span')!.textContent = option.label;
    item.onclick = () => {
      if (option.value !== value) pick(option.value);
    };
    wrap.append(item);
  }
  const field = document.createElement('div');
  field.className = 'text-structure-field';
  const caption = document.createElement('span');
  caption.className = 'text-structure-label';
  caption.textContent = label;
  field.append(caption, wrap);
  return field;
};

export function textStructureSections(deps: TextStructureDeps): HTMLElement[] {
  const layer = deps.layer();
  if (!layer || layer.type !== 'text') return [];
  const engine: TextEngineOptions = engineOf(layer) ?? {};
  const text =
    layer.properties.text?.type === 'string' ? layer.properties.text.value : '';
  const update = (label: string, next: TextEngineOptions) => {
    const item = deps.layer();
    if (!item) return;
    deps.run(
      label,
      engineCommands(deps.compositionId, item, cleanEngine(next)),
    );
  };
  const direction = engine.direction ?? 'auto';
  const resolved = resolveDirection(
    engine.table ? (engine.table.rows[0]?.[0]?.text ?? '') : text,
    direction,
  );
  const rtl = resolved === 'rtl';
  const align = textStyleOf(layer).align;
  // Start is the right edge in RTL text, so the icons flip with it.
  const alignValue =
    align === 'center' ? 'center' : align === 'right' ? 'end' : 'start';
  const layout = [
    segmented(
      'right-text-direction',
      t('textx.direction'),
      [
        { value: 'auto', label: t('textx.direction.auto') },
        { value: 'ltr', label: t('textx.direction.ltr') },
        { value: 'rtl', label: t('textx.direction.rtl') },
      ],
      direction,
      (value) =>
        update(t('textx.step.direction'), {
          ...engine,
          direction: value === 'auto' ? undefined : (value as 'ltr' | 'rtl'),
        }),
    ),
    segmented(
      'right-text-align',
      t('textx.align'),
      [
        {
          value: 'start',
          label: t('textx.align.start'),
          icon: rtl ? 'alignRight' : 'alignLeft',
        },
        {
          value: 'center',
          label: t('textx.align.center'),
          icon: 'alignCenter',
        },
        {
          value: 'end',
          label: t('textx.align.end'),
          icon: rtl ? 'alignLeft' : 'alignRight',
        },
      ],
      alignValue,
      (value) =>
        deps.align(
          value === 'center' ? 'center' : value === 'end' ? 'right' : 'left',
        ),
    ),
  ];
  const hint = document.createElement('p');
  hint.className = 'text-structure-hint';
  hint.dataset.direction = resolved;
  hint.textContent = t(rtl ? 'textx.resolved.rtl' : 'textx.resolved.ltr');
  layout.push(hint);
  const sections = [
    deps.accordion('text-structure', t('textx.layout'), layout),
  ];
  if (engine.table) sections.push(tableSection(deps, engine, engine.table));
  else sections.push(listSection(deps, engine, text, update));
  return sections;
}

function listSection(
  deps: TextStructureDeps,
  engine: TextEngineOptions,
  text: string,
  update: (label: string, next: TextEngineOptions) => void,
) {
  const list = engine.list;
  const kind = list?.kind ?? 'none';
  const content: HTMLElement[] = [
    segmented(
      'right-list-kind',
      t('textx.list'),
      [
        { value: 'none', label: t('textx.list.none') },
        { value: 'bullet', label: t('textx.list.bullet'), icon: 'list' },
        { value: 'numbered', label: t('textx.list.numbered') },
      ],
      kind,
      (value) =>
        update(t('textx.step.list'), {
          ...engine,
          list:
            value === 'none'
              ? undefined
              : {
                  ...(list ?? {}),
                  kind: value as 'bullet' | 'numbered',
                },
        }),
    ),
  ];
  if (list) {
    if (list.kind === 'bullet')
      content.push(
        createSelect({
          id: 'right-list-bullet',
          label: t('textx.list.style'),
          value: list.bullet ?? 'disc',
          options: (['disc', 'circle', 'square'] as const).map((value) => ({
            value,
            label: t(`textx.bullet.${value}`),
          })),
          onChange: (value) =>
            update(t('textx.step.list'), {
              ...engine,
              list: { ...list, bullet: value as 'disc' | 'circle' | 'square' },
            }),
        }),
      );
    content.push(
      createNumberField({
        id: 'right-list-indent',
        label: t('textx.list.indent'),
        value: list.indent ?? 28,
        unit: 'px',
        min: 8,
        max: 500,
        decimals: 0,
        onCommit: (value) =>
          update(t('textx.step.list'), {
            ...engine,
            list: { ...list, indent: value },
          }),
      }),
      createNumberField({
        id: 'right-list-spacing',
        label: t('textx.list.spacing'),
        value: list.spacing ?? 0,
        unit: 'px',
        min: 0,
        max: 500,
        decimals: 0,
        onCommit: (value) =>
          update(t('textx.step.list'), {
            ...engine,
            list: { ...list, spacing: value },
          }),
      }),
    );
    // One row per line: its level (1 to 3), changed with − and +.
    const levels = listLevels(text, list);
    const lines = document.createElement('ol');
    lines.className = 'text-list-levels';
    lines.setAttribute('aria-label', t('textx.list.levels'));
    text
      .split('\n')
      .slice(0, 30)
      .forEach((line, index) => {
        const item = document.createElement('li');
        item.dataset.line = String(index);
        item.style.setProperty('--level', String(levels[index]! - 1));
        const name = document.createElement('span');
        name.className = 'text-list-line';
        name.textContent = line.trim() || t('textx.list.empty');
        const step = (delta: number, icon: string, label: string) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'button sm icon-only';
          button.dataset.action = delta < 0 ? 'outdent' : 'indent';
          button.setAttribute('aria-label', `${label}: ${name.textContent}`);
          button.title = label;
          button.innerHTML = iconSvg(icon, 16);
          const next = levels[index]! + delta;
          if (next < 1 || next > 3) button.disabled = true;
          button.onclick = () =>
            update(t('textx.step.level'), {
              ...engine,
              list: {
                ...list,
                levels: levels.map((level, i) => (i === index ? next : level)),
              },
            });
          return button;
        };
        const badge = document.createElement('span');
        badge.className = 'text-list-level';
        badge.textContent = t('textx.list.level', {
          level: String(levels[index]),
        });
        item.append(
          step(-1, 'chevronLeft', t('textx.list.outdent')),
          name,
          badge,
          step(1, 'chevronRight', t('textx.list.indentLine')),
        );
        lines.append(item);
      });
    content.push(lines);
  }
  return deps.accordion('text-list', t('textx.list'), content);
}

function tableSection(
  deps: TextStructureDeps,
  engine: TextEngineOptions,
  table: TableModel,
) {
  const save = (label: string, next: TableModel) => {
    const item = deps.layer();
    if (!item) return;
    deps.run(
      label,
      engineCommands(
        deps.compositionId,
        item,
        cleanEngine({ ...engine, table: next }),
      ),
    );
  };
  const rows = table.rows.length,
    columns = table.columnWidths.length;
  const counter = (
    id: string,
    label: string,
    value: number,
    max: number,
    apply: (value: number) => void,
  ) =>
    createNumberField({
      id,
      label,
      value,
      min: 1,
      max,
      decimals: 0,
      onCommit: (next) => apply(Math.round(next)),
    });
  const header = document.createElement('label');
  header.className = 'switch-row';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.id = 'right-table-header';
  box.checked = table.header === true;
  box.onchange = () =>
    save(t('textx.step.table'), { ...table, header: box.checked });
  const caption = document.createElement('span');
  caption.textContent = t('textx.table.header');
  header.append(box, caption);
  const widths = document.createElement('div');
  widths.className = 'text-table-widths';
  table.columnWidths.forEach((width, index) =>
    widths.append(
      createNumberField({
        id: `right-table-width-${index}`,
        label: t('textx.table.width', { n: String(index + 1) }),
        value: width,
        min: 0.1,
        max: 20,
        decimals: 1,
        compact: true,
        onCommit: (value) =>
          save(t('textx.step.table'), {
            ...table,
            columnWidths: table.columnWidths.map((w, i) =>
              i === index ? value : w,
            ),
          }),
      }),
    ),
  );
  // The cells, editable here too (the first 12 rows and 8 columns).
  const grid = document.createElement('div');
  grid.className = 'text-table-cells';
  grid.style.setProperty('--u6-columns', String(Math.min(columns, 8)));
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', t('textx.table.cells'));
  table.rows.slice(0, 12).forEach((cells, ri) =>
    cells.slice(0, 8).forEach((cell, ci) => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'text-table-cell-input';
      input.dataset.cell = `${ri}-${ci}`;
      input.value = cell.text;
      input.setAttribute(
        'aria-label',
        t('textx.table.cell', { row: String(ri + 1), column: String(ci + 1) }),
      );
      // One commit per edit: a re-render's blur must not save again.
      let saved = false;
      const commit = () => {
        if (saved || input.value === cell.text) return;
        saved = true;
        save(t('textx.step.cell'), setCell(table, ri, ci, input.value));
      };
      input.onchange = commit;
      input.onkeydown = (event) => {
        if (event.key === 'Enter') commit();
      };
      grid.append(input);
    }),
  );
  return deps.accordion('text-table', t('textx.table'), [
    counter(
      'right-table-rows',
      t('textx.table.rows'),
      rows,
      TABLE_LIMITS.rows,
      (value) =>
        save(t('textx.step.table'), resizeTable(table, value, columns)),
    ),
    counter(
      'right-table-columns',
      t('textx.table.columns'),
      columns,
      TABLE_LIMITS.columns,
      (value) => save(t('textx.step.table'), resizeTable(table, rows, value)),
    ),
    header,
    widths,
    createColorField({
      id: 'right-table-border',
      label: t('textx.table.border'),
      value: (table.border ?? '#808080').slice(0, 7),
      onCommit: (value) =>
        save(t('textx.step.table'), { ...table, border: value }),
    }),
    createNumberField({
      id: 'right-table-border-width',
      label: t('textx.table.borderWidth'),
      value: table.borderWidth ?? 1,
      unit: 'px',
      min: 0,
      max: 20,
      decimals: 0,
      onCommit: (value) =>
        save(t('textx.step.table'), { ...table, borderWidth: value }),
    }),
    grid,
  ]);
}
