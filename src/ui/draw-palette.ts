// I2: the Draw rail item toggles a compact vertical palette at the canvas's
// left edge (Canva's whiteboard tools): Select; Draw (a flyout with the
// brushes, colour, weight and transparency: the existing Draw panel);
// Shape and Line (drag on the canvas); Sticky note and Text (click, or drag
// for a text box's width); Signature (the H6 panel); Table (planned). The
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
import type { EditorSession } from './session';
import { addShapeCommands, type ShapePreset } from './shapes';

export type PaletteTool =
  | 'select'
  | 'draw'
  | 'shape'
  | 'line'
  | 'sticky'
  | 'text'
  | 'signature'
  | 'table';
type PlaceKind = 'shape' | 'line' | 'sticky' | 'text';
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
  flyout.append(options.drawPanel);
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
    if (id === 'table') {
      const reason = t('toolbar.later', { wave: '8', id: 'SHP-025' });
      button.setAttribute('aria-disabled', 'true');
      button.title = reason;
      button.setAttribute('aria-label', `${label}: ${reason}`);
    } else {
      button.title = label;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', 'false');
    }
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
    if (id === 'table') return;
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
      if (button.dataset.paletteTool !== 'table')
        button.setAttribute(
          'aria-pressed',
          String(open && button.dataset.paletteTool === tool),
        );
    flyout.hidden = !open || tool !== 'draw';
    canvas.classList.toggle(
      'placing',
      open && ['shape', 'line', 'sticky', 'text'].includes(tool),
    );
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
    if (preset === 'line') {
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
  const commit = (kind: PlaceKind, start: Point2, end: Point2) => {
    const dragged = Math.hypot(end[0] - start[0], end[1] - start[1]) >= 6;
    if (kind === 'shape') {
      // A click places the preset's own size, centred on the point.
      if (!dragged)
        placeShape(
          'rectangle',
          [start[0] - 120, start[1] - 80],
          [start[0] + 120, start[1] + 80],
        );
      else placeShape('rectangle', start, end);
    } else if (kind === 'line') {
      if (!dragged)
        placeShape(
          'line',
          [start[0] - 120, start[1]],
          [start[0] + 120, start[1]],
        );
      else placeShape('line', start, end);
    } else if (kind === 'sticky') {
      const insert = stickyNoteCommands(
        session.source,
        start,
        session.currentTime,
        t('palette.stickyText'),
        t('palette.sticky'),
      );
      session.setPlaying(false);
      engine.commands.transaction(insert.label, insert.commands);
      if (insert.layerId) session.select(insert.layerId);
    } else {
      const width = dragged ? Math.abs(end[0] - start[0]) : undefined;
      const centre: Point2 = dragged
        ? [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
        : start;
      options.insertTextBox(centre, width);
    }
    // Canva: after placing, the palette returns to Select.
    tool = 'select';
    sync();
  };
  const place: PlaceTool = {
    get armed() {
      return open && ['shape', 'line', 'sticky', 'text'].includes(tool);
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
