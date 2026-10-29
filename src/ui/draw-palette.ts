// I2, FIX9: the Draw rail item toggles a compact vertical palette at the
// canvas's left edge (Canva's whiteboard tools): Select; Draw (a flyout with
// the brushes, colour, weight and transparency: the existing Draw panel);
// Shape, Line, Sticky note, Text and Table (each tool's flyout lists its
// choices; a click on a choice adds it, centred, as one undo step);
// Signature (the H6 panel). The canvas itself never creates an object: a
// click on it only selects, whatever tool is open. The left panel collapses
// while the palette is on and comes back when it closes.
import {
  rotateAroundCenter,
  vector2,
  number,
  type Command,
  type EditorEngine,
  type Point2,
} from '../core';
import { t } from '../i18n';
import { iconSvg } from './icons';
import { stickyNoteCommands } from './library-insert';
import type { EditorSession } from './session';
import { addShapeCommands, SHAPE_PRESETS, type ShapePreset } from './shapes';
import type { LibraryItem } from '../library/schema';

export type PaletteTool =
  | 'select'
  | 'draw'
  | 'shape'
  | 'line'
  | 'sticky'
  | 'text'
  | 'signature'
  | 'table';
const FLYOUT: readonly PaletteTool[] = [
  'draw',
  'shape',
  'line',
  'sticky',
  'text',
  'table',
];
const STICKY_COLORS = [
  '#fde68a',
  '#fecaca',
  '#fbcfe8',
  '#bfdbfe',
  '#bbf7d0',
  '#e9d5ff',
] as const;
const TABLE_SIZES: readonly [number, number][] = [
  [2, 2],
  [3, 3],
  [4, 4],
];
const TOOLS: readonly [PaletteTool, string][] = [
  ['select', 'hand'],
  ['draw', 'pen'],
  ['shape', 'shape-rectangle'],
  ['line', 'shape-line'],
  ['sticky', 'comment'],
  ['text', 'text'],
  ['signature', 'signature'],
  ['table', 'list'],
];

export interface DrawPalette {
  readonly open: boolean;
  toggle(): void;
  close(): void;
  sync(): void;
}

export function mountDrawPalette(options: {
  stage: HTMLElement;
  engine: EditorEngine;
  session: EditorSession;
  /** The existing Draw panel (brushes and their settings). */
  drawPanel: HTMLElement;
  report: (error: unknown) => void;
  openSignature: () => void;
  /** Library shapes for the Shape flyout. */
  shapeItems: () => readonly LibraryItem[];
  /** FIX7: items the owner listed under Draw (any kind, any sub-category). */
  ownerItems?: () => readonly LibraryItem[];
  insertItem: (item: LibraryItem) => void;
  insertTable: (rows: number, columns: number) => void;
  pickTable: (pick: (rows: number, columns: number) => void) => void;
  insertTextBox: (at: Point2, width?: number) => void;
  /** FIX9: the text styles the Text flyout lists (default styles + combinations). */
  textItems: () => readonly LibraryItem[];
  /** The left panel: collapse while open, restore after. */
  setLeftOpen: (open: boolean) => void;
  leftOpen: () => boolean;
  changed: () => void;
}): DrawPalette {
  const { stage, engine, session, report } = options;
  const bar = document.createElement('div');
  bar.className = 'draw-palette';
  bar.id = 'draw-palette';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-orientation', 'vertical');
  bar.setAttribute('aria-label', t('palette.label'));
  bar.hidden = true;
  const flyout = document.createElement('div');
  flyout.className = 'draw-flyout';
  flyout.id = 'draw-flyout';
  flyout.hidden = true;
  const extra = document.createElement('div');
  extra.className = 'draw-flyout-extra';
  flyout.append(options.drawPanel, extra);
  options.drawPanel.hidden = false;
  stage.append(bar, flyout);

  let open = false;
  let tool: PaletteTool = 'draw';
  let lastBrush: NonNullable<EditorSession['drawBrush']> = 'pen';
  let leftWasOpen = true;
  let shapePreset: ShapePreset = 'rectangle';
  let linePreset: ShapePreset = 'line';
  const safely = (action: () => void) => {
    try {
      action();
    } catch (error) {
      report(error);
    }
  };

  const buttons = TOOLS.map(([id, icon]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-button draw-palette-tool';
    button.dataset.paletteTool = id;
    if (id === 'signature') button.id = 'palette-signature';
    const label = t(`palette.${id}`);
    button.innerHTML = iconSvg(icon, 18);
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', 'false');
    button.onclick = () => safely(() => choose(id));
    return button;
  });
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'icon-button draw-palette-close';
  close.id = 'draw-palette-close';
  close.innerHTML = iconSvg('close', 16);
  close.title = t('palette.close');
  close.setAttribute('aria-label', t('palette.close'));
  close.onclick = () => palette.close();
  bar.append(close, ...buttons);
  bar.addEventListener('keydown', (event) => {
    const list = [...bar.querySelectorAll<HTMLButtonElement>('button')];
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    const step =
      event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    list[(at + step + list.length) % list.length]!.focus();
  });

  const choose = (id: PaletteTool) => {
    if (id === 'signature') {
      options.openSignature();
      return;
    }
    tool = id;
    if (id === 'draw') session.setDrawBrush(lastBrush);
    else session.setDrawBrush(null);
    sync();
  };
  const sync = () => {
    if (session.drawBrush) lastBrush = session.drawBrush;
    // Esc or V left draw mode: the palette goes back to Select.
    if (open && tool === 'draw' && !session.drawBrush) tool = 'select';
    for (const button of buttons)
      button.setAttribute(
        'aria-pressed',
        String(open && button.dataset.paletteTool === tool),
      );
    flyout.hidden = !open || !FLYOUT.includes(tool);
    options.drawPanel.hidden = tool !== 'draw';
    extra.hidden = tool === 'draw';
    if (builtTool !== tool) {
      builtTool = tool;
      buildExtra();
    }
  };

  // --- Flyouts (Canva's Draw: each tool shows its own choices) -------------
  let builtTool: PaletteTool | null = null;
  const tile = (label: string, svg: string, on: boolean, run: () => void) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'draw-tile';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(on));
    button.innerHTML = svg;
    button.onclick = () => {
      safely(run);
      buildExtra();
    };
    return button;
  };
  const presetSvg = (preset: ShapePreset) => {
    const spec = SHAPE_PRESETS[preset];
    const stroke = 'currentColor';
    const body =
      spec.kind === 'ellipse'
        ? `<ellipse cx="24" cy="24" rx="19" ry="19" fill="#8b6cff"/>`
        : spec.kind === 'rectangle'
          ? `<rect x="5" y="9" width="38" height="30" rx="${spec.radius ? 9 : 0}" fill="#8b6cff"/>`
          : `<line x1="${spec.kind === 'arrow' && 'both' in spec ? 10 : 5}" y1="24" x2="${spec.kind === 'arrow' ? 38 : 43}" y2="24" stroke="${stroke}" stroke-width="3" stroke-linecap="round" ${'dash' in spec ? (spec.dash === 'dot' ? 'stroke-dasharray="1 6"' : 'stroke-dasharray="7 5"') : ''}/>${spec.kind === 'arrow' ? `<path d="M34 17l10 7-10 7" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${'both' in spec ? `<path d="M14 17L4 24l10 7" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : ''}` : ''}`;
    return `<svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">${body}</svg>`;
  };
  const itemSvg = (item: Extract<LibraryItem, { type: 'shape' }>) => {
    const paths = item.data.polygons
      .map((polygon) =>
        polygon
          .map(
            (ring) =>
              `M${ring.map(([x, y]) => `${(x * 0.48).toFixed(1)} ${(y * 0.48).toFixed(1)}`).join('L')}Z`,
          )
          .join(''),
      )
      .join('');
    return `<svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true"><path d="${paths}" fill="#8b6cff" fill-rule="evenodd"/></svg>`;
  };
  /** A sticky note as Canva draws it: paper, a folded corner, soft shadow, lines of writing. */
  const stickySvg = (color: string) =>
    `<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><rect x="7" y="9" width="34" height="34" rx="2" fill="#000" opacity=".16"/><path d="M6 6h36v26l-10 10H6z" fill="${color}"/><path d="M42 32L32 42V34a2 2 0 0 1 2-2z" fill="#000" opacity=".16"/><path d="M12 15h24M12 21h24M12 27h14" stroke="#3f3a1f" stroke-width="2" stroke-linecap="round" opacity=".55"/></svg>`;
  const textTile = (item: LibraryItem) => {
    const elements =
      item.type === 'text'
        ? (item as Extract<LibraryItem, { type: 'text' }>).data.elements
        : [];
    const name =
      typeof item.name === 'string' ? item.name : (item.name.en ?? item.id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'draw-text-tile';
    button.dataset.itemId = item.id;
    button.title = name;
    button.setAttribute('aria-label', name);
    for (const element of elements.slice(0, 3)) {
      if (element.kind !== 'text') continue;
      const line = document.createElement('span');
      const words =
        typeof element.text === 'string'
          ? element.text
          : (element.text.en ?? name);
      line.textContent = words;
      line.style.fontSize = `${Math.min(26, Math.max(12, Math.round(element.size * 300)))}px`;
      line.style.fontWeight = String(element.weight ?? 400);
      if (element.font) line.style.fontFamily = `"${element.font}", sans-serif`;
      line.style.color = element.color ?? 'inherit';
      button.append(line);
    }
    if (!button.childElementCount) button.textContent = name;
    button.onclick = () => safely(() => options.insertItem(item));
    return button;
  };
  const section = (title: string, ...tiles: HTMLElement[]) => {
    const wrap = document.createElement('section');
    wrap.className = 'draw-section';
    const heading = document.createElement('h3');
    heading.className = 'draw-title';
    heading.textContent = title;
    const grid = document.createElement('div');
    grid.className = 'draw-tiles';
    grid.append(...tiles);
    wrap.append(heading, grid);
    return wrap;
  };
  const buildExtra = () => {
    extra.replaceChildren();
    if (tool === 'shape') {
      const presets: ShapePreset[] = ['rectangle', 'rounded', 'ellipse'];
      const tiles = presets.map((preset) =>
        tile(
          t(`shape.${preset}`),
          presetSvg(preset),
          shapePreset === preset,
          () => {
            shapePreset = preset;
            placeCentred(preset, canvasCentre());
          },
        ),
      );
      const library = options
        .shapeItems()
        .map((item) =>
          tile(
            typeof item.name === 'string'
              ? item.name
              : (item.name.en ?? item.id),
            itemSvg(item as Extract<LibraryItem, { type: 'shape' }>),
            false,
            () => options.insertItem(item),
          ),
        );
      const shown = new Set(options.shapeItems().map((item) => item.id));
      const owner = (options.ownerItems?.() ?? [])
        .filter((item) => !shown.has(item.id))
        .map((item) =>
          tile(
            typeof item.name === 'string'
              ? item.name
              : (item.name.en ?? item.id),
            item.type === 'shape'
              ? itemSvg(item as Extract<LibraryItem, { type: 'shape' }>)
              : `<svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true"><rect x="8" y="8" width="32" height="32" rx="6" fill="#8b6cff" opacity=".5"/></svg>`,
            false,
            () => options.insertItem(item),
          ),
        );
      extra.append(section(t('palette.shape.title'), ...tiles, ...library));
      if (owner.length) extra.append(section(t('library.extras'), ...owner));
    } else if (tool === 'line') {
      const presets: ShapePreset[] = [
        'line',
        'line-dashed',
        'line-dotted',
        'arrow',
        'arrow-double',
      ];
      extra.append(
        section(
          t('palette.line.title'),
          ...presets.map((preset) =>
            tile(
              t(`shape.${preset}`),
              presetSvg(preset),
              linePreset === preset,
              () => {
                linePreset = preset;
                placeCentred(preset, canvasCentre());
              },
            ),
          ),
        ),
      );
    } else if (tool === 'sticky') {
      extra.append(
        section(
          t('palette.sticky'),
          ...STICKY_COLORS.map((color) =>
            tile(
              t('palette.sticky'),
              stickySvg(color),
              stickyColor === color,
              () => {
                stickyColor = color;
                placeSticky(color);
              },
            ),
          ),
        ),
      );
    } else if (tool === 'text') {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'button primary draw-text-add';
      add.id = 'draw-add-text-box';
      add.textContent = t('text.addBox');
      add.onclick = () =>
        safely(() => options.insertTextBox(canvasCentre(), undefined));
      const wrap = document.createElement('section');
      wrap.className = 'draw-section';
      const heading = document.createElement('h3');
      heading.className = 'draw-title';
      heading.textContent = t('palette.text.title');
      const list = document.createElement('div');
      list.className = 'draw-text-list';
      list.append(...options.textItems().map(textTile));
      wrap.append(heading, list);
      extra.append(add, wrap);
    } else if (tool === 'table') {
      const tiles = TABLE_SIZES.map(([rows, columns]) =>
        tile(
          t('textx.table.size', {
            rows: String(rows),
            columns: String(columns),
          }),
          `<svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">${Array.from({ length: rows * columns }, (_, i) => `<rect x="${6 + (i % columns) * (36 / columns)}" y="${6 + Math.floor(i / columns) * (36 / rows)}" width="${36 / columns - 2}" height="${36 / rows - 2}" fill="#8b6cff"/>`).join('')}</svg>`,
          false,
          () => options.insertTable(rows, columns),
        ),
      );
      const custom = document.createElement('button');
      custom.type = 'button';
      custom.className = 'button draw-table-custom';
      custom.textContent = t('palette.table.custom');
      custom.onclick = () =>
        safely(() => options.pickTable(options.insertTable));
      extra.append(section(t('palette.table'), ...tiles), custom);
    }
  };

  /** A preset shape resized and placed by the drag (one undo step). */
  const placeShape = (preset: ShapePreset, start: Point2, end: Point2) => {
    const commands = addShapeCommands(
      session.source,
      preset,
      session.currentTime,
    );
    const create = commands.find(
      (command) => command.type === 'CREATE_LAYER',
    ) as Extract<Command, { type: 'CREATE_LAYER' }>;
    const layer = create.layer;
    const properties = layer.properties as Record<string, { value: unknown }>;
    if (
      SHAPE_PRESETS[preset].kind === 'line' ||
      SHAPE_PRESETS[preset].kind === 'arrow'
    ) {
      const length = Math.max(
        8,
        Math.hypot(end[0] - start[0], end[1] - start[1]),
      );
      const height = Number(properties.height!.value);
      const angle =
        (Math.atan2(end[1] - start[1], end[0] - start[0]) * 180) / Math.PI;
      const mid: Point2 = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
      layer.properties = {
        ...layer.properties,
        width: number(length),
      } as never;
      const placed = rotateAroundCenter(
        {
          position: { value: [mid[0] - length / 2, mid[1] - height / 2] },
          scale: { value: [1, 1] },
          rotation: { value: 0 },
          opacity: { value: 1 },
        },
        { x: 0, y: 0, width: length, height },
        angle,
      );
      layer.transform.position = vector2(...placed.position.value);
      layer.transform.rotation = number(placed.rotation.value);
    } else {
      const x = Math.min(start[0], end[0]),
        y = Math.min(start[1], end[1]);
      const width = Math.max(8, Math.abs(end[0] - start[0])),
        height = Math.max(8, Math.abs(end[1] - start[1]));
      layer.properties = {
        ...layer.properties,
        width: number(width),
        height: number(height),
      } as never;
      layer.transform.position = vector2(x, y);
    }
    session.setPlaying(false);
    engine.commands.transaction('Add shape', commands);
    session.select(layer.id);
  };
  /** A click places the preset's own size, centred on the point. */
  const placeCentred = (preset: ShapePreset, at: Point2) => {
    const spec = SHAPE_PRESETS[preset];
    const line = spec.kind === 'line' || spec.kind === 'arrow';
    placeShape(
      preset,
      [at[0] - spec.width / 2, at[1] - (line ? 0 : spec.height / 2)],
      [at[0] + spec.width / 2, at[1] + (line ? 0 : spec.height / 2)],
    );
  };
  const canvasCentre = (): Point2 => [
    session.source.composition.width / 2,
    session.source.composition.height / 2,
  ];
  let stickyColor: string = STICKY_COLORS[0];
  const placeSticky = (color: string) => {
    const insert = stickyNoteCommands(
      session.source,
      canvasCentre(),
      session.currentTime,
      t('palette.stickyText'),
      t('palette.sticky'),
      color,
    );
    session.setPlaying(false);
    engine.commands.transaction(insert.label, insert.commands);
    if (insert.layerId) session.select(insert.layerId);
  };

  const palette: DrawPalette = {
    get open() {
      return open;
    },
    toggle() {
      if (open) palette.close();
      else {
        open = true;
        bar.hidden = false;
        leftWasOpen = options.leftOpen();
        options.setLeftOpen(false);
        choose('draw');
        options.changed();
      }
    },
    close() {
      if (!open) return;
      open = false;
      bar.hidden = true;
      session.setDrawBrush(null);
      sync();
      if (leftWasOpen) options.setLeftOpen(true);
      options.changed();
    },
    sync,
  };
  return palette;
}
