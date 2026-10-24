// I2: the Draw rail item toggles a compact vertical palette at the canvas's
// left edge (Canva's whiteboard tools): Select; Draw (a flyout with the
// brushes, colour, weight and transparency: the existing Draw panel);
// Shape, Line, Sticky note, Text and Table (FIX5 C4: each opens a flyout of
// choices first; the choice stays until changed; a click places the default
// size, a drag draws the size, a ghost follows the pointer, Esc cancels);
// Signature (the H6 panel). The
// left panel collapses while the palette is on and comes back when it
// closes. A placing drag previews a frame over the canvas and commits once,
// on release, as one undo step.
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
import { TABLE_PICKER } from './text-structure-model';
import type { EditorSession } from './session';
import {
  LINE_PRESETS,
  SHAPE_PRESETS,
  addShapeCommands,
  type ShapePreset,
} from './shapes';

export type PaletteTool =
  | 'select'
  | 'draw'
  | 'shape'
  | 'line'
  | 'sticky'
  | 'text'
  | 'signature'
  | 'table';
type PlaceKind = 'shape' | 'line' | 'sticky' | 'text' | 'table';
const PLACE_TOOLS: readonly PaletteTool[] = [
  'shape',
  'line',
  'sticky',
  'text',
  'table',
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

/** What the flyouts offer besides the built-in presets. */
export interface PaletteChoice {
  readonly id: string;
  readonly name: string;
}
export interface PaletteLibrary {
  shapes(): readonly PaletteChoice[];
  /** Default text styles first, then the user's saved text. */
  texts(): readonly PaletteChoice[];
  /** The commands that add the item centred on `at` (nothing runs). */
  insert(
    id: string,
    at: Point2,
  ): { label: string; commands: Command[]; layerId?: string } | null;
}
export const STICKY_COLORS = [
  '#fde68a',
  '#fca5a5',
  '#a7f3d0',
  '#bfdbfe',
  '#ddd6fe',
  '#fbcfe8',
] as const;
const SHAPE_PRESET_CHOICES: readonly ShapePreset[] = [
  'rectangle',
  'rounded',
  'ellipse',
];

/** The canvas side of the placing tools (canvas-interaction.ts calls it). */
export interface PlaceTool {
  /** A placing tool is armed (the canvas places instead of picking). */
  readonly armed: boolean;
  readonly active: boolean;
  begin(at: Point2): void;
  update(at: Point2): void;
  finish(): void;
  cancel(): void;
}

export interface DrawPalette {
  readonly open: boolean;
  toggle(): void;
  close(): void;
  sync(): void;
  readonly place: PlaceTool;
}

export function mountDrawPalette(options: {
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  engine: EditorEngine;
  session: EditorSession;
  /** The existing Draw panel (brushes and their settings). */
  drawPanel: HTMLElement;
  /** Composition point → canvas CSS point. */
  toCanvas: (point: Point2) => Point2;
  report: (error: unknown) => void;
  openSignature: () => void;
  insertTextBox: (at: Point2, width?: number) => void;
  /** FIX5 C4: the library's shapes and the text styles to choose from. */
  library: PaletteLibrary;
  /** The Elements table insert, at a point. */
  insertTable: (rows: number, columns: number, at: Point2) => void;
  /** The left panel: collapse while open, restore after. */
  setLeftOpen: (open: boolean) => void;
  leftOpen: () => boolean;
  changed: () => void;
}): DrawPalette {
  const { stage, canvas, engine, session, report } = options;
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
  const choices = document.createElement('div');
  choices.className = 'draw-choices';
  choices.id = 'draw-choices';
  choices.hidden = true;
  flyout.append(options.drawPanel, choices);
  options.drawPanel.hidden = false;
  stage.append(bar, flyout);
  const preview = document.createElement('div');
  preview.className = 'place-preview';
  preview.hidden = true;
  stage.append(preview);

  let open = false;
  let tool: PaletteTool = 'draw';
  let lastBrush: NonNullable<EditorSession['drawBrush']> = 'pen';
  let leftWasOpen = true;
  // FIX5 C4: the choice of each tool stays until it is changed.
  const picked = {
    shape: 'rectangle',
    line: 'line',
    sticky: STICKY_COLORS[0] as string,
    text: 'textbox',
    table: '3x3',
  };
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

  // --- Choices (the flyout of each placing tool) -------------------------------
  const ghost = document.createElement('div');
  ghost.className = 'place-preview place-ghost';
  ghost.hidden = true;
  stage.append(ghost);
  const hideGhost = () => {
    ghost.hidden = true;
  };
  /** The default box of the current choice, in composition units. */
  const defaultSize = (): [number, number] => {
    if (tool === 'shape') {
      const preset = SHAPE_PRESETS[picked.shape as ShapePreset];
      return preset ? [preset.width, preset.height] : [200, 200];
    }
    if (tool === 'line') {
      const preset = SHAPE_PRESETS[picked.line as ShapePreset];
      return [preset.width, preset.height];
    }
    if (tool === 'sticky') {
      const side = Math.round(
        Math.min(
          session.source.composition.width,
          session.source.composition.height,
        ) / 4,
      );
      return [side, side];
    }
    if (tool === 'table') return [480, 200];
    return [session.source.composition.width * 0.4, 80];
  };
  const showGhost = (event: PointerEvent) => {
    if (!open || !PLACE_TOOLS.includes(tool) || placing) {
      hideGhost();
      return;
    }
    const origin = options.toCanvas([0, 0]);
    const unit = options.toCanvas([1, 0]);
    const scale = unit[0] - origin[0] || 1;
    const rect = canvas.getBoundingClientRect();
    const [w, h] = defaultSize();
    ghost.hidden = false;
    Object.assign(ghost.style, {
      left: `${canvas.offsetLeft + event.clientX - rect.left - (w * scale) / 2}px`,
      top: `${canvas.offsetTop + event.clientY - rect.top - (h * scale) / 2}px`,
      width: `${w * scale}px`,
      height: `${h * scale}px`,
      transform: 'none',
    });
  };
  canvas.addEventListener('pointermove', showGhost);
  canvas.addEventListener('pointerleave', hideGhost);
  const option = (
    host: HTMLElement,
    value: string,
    label: string,
    current: string,
    pick: (value: string) => void,
    inner?: string,
  ) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'draw-choice';
    button.dataset.choice = value;
    button.setAttribute('aria-pressed', String(value === current));
    button.setAttribute('aria-label', label);
    button.title = label;
    if (inner) button.innerHTML = inner;
    else button.textContent = label;
    button.onclick = () => {
      pick(value);
      renderChoices();
    };
    host.append(button);
    return button;
  };
  const group = (title: string) => {
    const heading = document.createElement('h3');
    heading.className = 'draw-choices-title';
    heading.textContent = title;
    const list = document.createElement('div');
    list.className = 'draw-choices-list';
    choices.append(heading, list);
    return list;
  };
  const renderChoices = () => {
    choices.replaceChildren();
    choices.dataset.tool = tool;
    if (tool === 'shape') {
      const list = group(t('palette.chooseShape'));
      for (const preset of SHAPE_PRESET_CHOICES)
        option(list, preset, t(`shape.${preset}`), picked.shape, (v) => {
          picked.shape = v;
        });
      for (const item of options.library.shapes())
        option(list, item.id, item.name, picked.shape, (v) => {
          picked.shape = v;
        });
    } else if (tool === 'line') {
      const list = group(t('palette.chooseLine'));
      for (const preset of LINE_PRESETS)
        option(list, preset, t(`shape.${preset}`), picked.line, (v) => {
          picked.line = v;
        });
    } else if (tool === 'sticky') {
      const list = group(t('palette.chooseSticky'));
      list.classList.add('swatches');
      STICKY_COLORS.forEach((color, index) => {
        const button = option(
          list,
          color,
          t('palette.stickyColor', { n: String(index + 1) }),
          picked.sticky,
          (v) => {
            picked.sticky = v;
          },
          '<span class="draw-swatch"></span>',
        );
        (button.firstElementChild as HTMLElement).style.background = color;
      });
    } else if (tool === 'text') {
      const list = group(t('palette.chooseText'));
      option(list, 'textbox', t('text.boxName'), picked.text, (v) => {
        picked.text = v;
      });
      for (const item of options.library.texts())
        option(list, item.id, item.name, picked.text, (v) => {
          picked.text = v;
        });
    } else if (tool === 'table') {
      const list = group(t('palette.chooseTable'));
      list.classList.add('table-grid');
      list.style.setProperty('--u6-columns', String(TABLE_PICKER.columns));
      const [rows, columns] = picked.table.split('x').map(Number) as [
        number,
        number,
      ];
      const label = document.createElement('p');
      label.className = 'draw-choices-size';
      label.textContent = t('textx.table.size', {
        rows: String(rows),
        columns: String(columns),
      });
      for (let r = 1; r <= TABLE_PICKER.rows; r++)
        for (let c = 1; c <= TABLE_PICKER.columns; c++) {
          const cell = option(
            list,
            `${r}x${c}`,
            t('textx.table.size', { rows: String(r), columns: String(c) }),
            picked.table,
            (v) => {
              picked.table = v;
            },
            '<span class="draw-cell"></span>',
          );
          cell.classList.toggle('on', r <= rows && c <= columns);
          cell.classList.add('draw-table-cell');
        }
      choices.append(label);
    }
  };

  const choose = (id: PaletteTool) => {
    if (id === 'signature') {
      options.openSignature();
      return;
    }
    tool = id;
    placing = null;
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
    const placingTool = open && PLACE_TOOLS.includes(tool);
    options.drawPanel.hidden = tool !== 'draw';
    choices.hidden = !placingTool;
    if (placingTool && choices.dataset.tool !== tool) renderChoices();
    if (!placingTool) delete choices.dataset.tool;
    flyout.hidden = !open || !(tool === 'draw' || placingTool);
    if (!placingTool) hideGhost();
    canvas.classList.toggle('placing', placingTool);
  };

  // --- Placing ---------------------------------------------------------------
  let placing: { kind: PlaceKind; start: Point2; end: Point2 } | null = null;
  const showPreview = () => {
    if (!placing) {
      preview.hidden = true;
      return;
    }
    const a = options.toCanvas(placing.start),
      b = options.toCanvas(placing.end);
    preview.hidden = false;
    preview.classList.toggle('line', placing.kind === 'line');
    if (placing.kind === 'line') {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
      Object.assign(preview.style, {
        left: `${canvas.offsetLeft + a[0]}px`,
        top: `${canvas.offsetTop + a[1]}px`,
        width: `${length}px`,
        height: '0px',
        transform: `rotate(${angle}rad)`,
      });
      return;
    }
    Object.assign(preview.style, {
      left: `${canvas.offsetLeft + Math.min(a[0], b[0])}px`,
      top: `${canvas.offsetTop + Math.min(a[1], b[1])}px`,
      width: `${Math.abs(b[0] - a[0])}px`,
      height: `${Math.abs(b[1] - a[1])}px`,
      transform: 'none',
    });
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
    if (['line', 'arrow'].includes(SHAPE_PRESETS[preset].kind)) {
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
  /** A library insert sized by the drag: text sets its width, a shape its
   *  box (a click keeps the item's own size, centred on the point). */
  const placeLibrary = (
    id: string,
    start: Point2,
    end: Point2,
    dragged: boolean,
  ) => {
    const centre: Point2 = dragged
      ? [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
      : start;
    const insert = options.library.insert(id, centre);
    if (!insert) return;
    if (dragged) {
      const create = insert.commands.find(
        (command) => command.type === 'CREATE_LAYER',
      ) as Extract<Command, { type: 'CREATE_LAYER' }> | undefined;
      const layer = create?.layer;
      const properties = layer?.properties as
        Record<string, { value: unknown } | undefined> | undefined;
      const width = Number(properties?.width?.value);
      const height = Number(properties?.height?.value);
      const dragWidth = Math.max(8, Math.abs(end[0] - start[0]));
      const dragHeight = Math.max(8, Math.abs(end[1] - start[1]));
      if (layer && Number.isFinite(width) && width > 0) {
        if (layer.type === 'text') {
          properties!.width = number(dragWidth);
          layer.transform.position = vector2(
            Math.min(start[0], end[0]),
            layer.transform.position.value[1]!,
          );
        } else if (Number.isFinite(height) && height > 0) {
          layer.transform.scale = vector2(
            dragWidth / width,
            dragHeight / height,
          );
          layer.transform.position = vector2(
            Math.min(start[0], end[0]),
            Math.min(start[1], end[1]),
          );
        }
      }
    }
    session.setPlaying(false);
    engine.commands.transaction(insert.label, insert.commands);
    if (insert.layerId) session.select(insert.layerId);
  };
  const commit = (kind: PlaceKind, start: Point2, end: Point2) => {
    const dragged = Math.hypot(end[0] - start[0], end[1] - start[1]) >= 6;
    if (kind === 'shape') {
      const choice = picked.shape;
      if (SHAPE_PRESET_CHOICES.includes(choice as ShapePreset)) {
        // A click places the preset's own size, centred on the point.
        const preset = choice as ShapePreset;
        const { width, height } = SHAPE_PRESETS[preset];
        if (!dragged)
          placeShape(
            preset,
            [start[0] - width / 2, start[1] - height / 2],
            [start[0] + width / 2, start[1] + height / 2],
          );
        else placeShape(preset, start, end);
      } else placeLibrary(choice, start, end, dragged);
    } else if (kind === 'line') {
      const preset = picked.line as ShapePreset;
      if (!dragged)
        placeShape(
          preset,
          [start[0] - 120, start[1]],
          [start[0] + 120, start[1]],
        );
      else placeShape(preset, start, end);
    } else if (kind === 'sticky') {
      const insert = stickyNoteCommands(
        session.source,
        start,
        session.currentTime,
        t('palette.stickyText'),
        t('palette.sticky'),
        picked.sticky,
      );
      session.setPlaying(false);
      engine.commands.transaction(insert.label, insert.commands);
      if (insert.layerId) session.select(insert.layerId);
    } else if (kind === 'table') {
      const [rows, columns] = picked.table.split('x').map(Number) as [
        number,
        number,
      ];
      options.insertTable(rows, columns, start);
    } else if (picked.text === 'textbox') {
      const width = dragged ? Math.abs(end[0] - start[0]) : undefined;
      const centre: Point2 = dragged
        ? [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
        : start;
      options.insertTextBox(centre, width);
    } else placeLibrary(picked.text, start, end, dragged);
    // Canva: after placing, the palette returns to Select.
    tool = 'select';
    sync();
  };
  const place: PlaceTool = {
    get armed() {
      return open && PLACE_TOOLS.includes(tool);
    },
    get active() {
      return placing !== null;
    },
    begin(at) {
      placing = { kind: tool as PlaceKind, start: at, end: at };
      showPreview();
    },
    update(at) {
      if (!placing) return;
      placing.end = at;
      showPreview();
    },
    finish() {
      const done = placing;
      placing = null;
      showPreview();
      if (done) safely(() => commit(done.kind, done.start, done.end));
      options.changed();
    },
    cancel() {
      placing = null;
      showPreview();
    },
  };

  // Esc cancels a placing drag; with none, it puts the tool away.
  const onEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !open || !PLACE_TOOLS.includes(tool)) return;
    if (placing) place.cancel();
    else {
      tool = 'select';
      sync();
    }
    event.stopPropagation();
  };
  document.addEventListener('keydown', onEscape, true);

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
      placing = null;
      showPreview();
      bar.hidden = true;
      session.setDrawBrush(null);
      sync();
      if (leftWasOpen) options.setLeftOpen(true);
      options.changed();
    },
    sync,
    place,
  };
  return palette;
}
