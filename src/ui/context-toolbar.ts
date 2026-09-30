// CV-035 to CV-038 context toolbar (UX spec 4.1): the selected layer's most used
// controls above the canvas. Controls whose systems are not built are shown
// disabled with the wave that builds them (D-068); nothing behind them exists.
import {
  localTransformMatrix,
  number,
  propertySchema,
  transformPoint,
  type Command,
  type EditorEngine,
  type Point2,
  type TransformValues,
} from '../core';
import { formatNumber, t } from '../i18n';
import { locateLayer, type SceneLayer } from '../render/adapter';
import {
  MAX_BRUSH,
  MIN_BRUSH,
  drawingOf,
  formatStrokes,
  resizeBrush,
} from '../render/drawing';
import { selectionBounds } from '../render/selection';
import { layoutParagraphs } from '../render/text-layout';
import {
  STROKE_CAPS,
  STROKE_DASHES,
  STROKE_JOINS,
  shapeOf,
} from '../render/shapes';
import { shapeStyleCommand, type ShapeKey } from './shapes';
import {
  FONT_WEIGHTS,
  SYSTEM_FONTS,
  TEXT_ALIGNS,
  TEXT_ANCHORS,
  TEXT_CASES,
  TEXT_DECORATIONS,
  TEXT_LIMITS,
  textStyleOf,
} from '../render/text-style';
import { iconSvg } from './icons';
import { createColorField } from './components/color-picker';
import {
  createNumberField,
  restoreFieldFocus,
} from './components/number-field';
import { createSelect } from './components/select';
import { openPopover, type PopoverHandle } from './components/popover';
import type { SidePanels } from './side-panel';
import type { EditorSession } from './session';
import {
  buildTransformCommands,
  type InspectorField,
} from './transform-commands';
import { copyProperty, isAnimated, withValueAt } from './keyframes';
import type { GeometryField } from './geometry';
import { sceneLengthCommands } from './scene-length';
import { documentColors } from './palette';
import { CANVAS_LIMITS, CANVAS_PRESETS, ratioLabel } from './canvas-size';
import { pictureOf } from '../render/picture';
import { canCopyStyle, copyStyle } from './style-clipboard';
import { showToast } from './components/toast';
import { describeSelection, selectionRoots } from './selection-context';
import { contextActions, performEdit } from './editing';
import { ungroupBlocker } from './ungroup';
import { selectionLocked, setLocked } from './layer-actions';
import { guardCommands } from './editor-mode';

export type ToolbarKind = 'media' | 'text' | 'shape' | 'drawing';
export function toolbarKind(layer: SceneLayer | null): ToolbarKind | null {
  if (!layer) return null;
  if (layer.type === 'image' || layer.type === 'video') return 'media';
  if (layer.type === 'text') return 'text';
  if (layer.type === 'shape') return drawingOf(layer) ? 'drawing' : 'shape';
  return null;
}

/** Negates one scale axis, keeping the visual center in place (CV-036). */
export function flipTransform(
  base: TransformValues,
  center: Point2,
  axis: 'horizontal' | 'vertical',
): TransformValues {
  const [sx, sy] = base.scale.value;
  const after: TransformValues = {
    ...base,
    scale: { value: axis === 'horizontal' ? [-sx, sy] : [sx, -sy] },
  };
  const fixed = transformPoint(localTransformMatrix(base), center);
  const moved = transformPoint(
    localTransformMatrix({ ...after, position: { value: [0, 0] } }),
    center,
  );
  return {
    ...after,
    position: { value: [fixed[0] - moved[0], fixed[1] - moved[1]] },
  };
}

const setProperty = (
  compositionId: string,
  layer: SceneLayer,
  key: string,
  property: Command extends infer C
    ? C extends { type: 'SET_PROPERTY'; property: infer P }
      ? P
      : never
    : never,
): Command =>
  ({
    type: 'SET_PROPERTY',
    compositionId,
    layerId: layer.id,
    target: { kind: 'property', key },
    property,
  }) as Command;
/** An existing property with a new value, or a fresh one of that type. */
function withValue(
  layer: SceneLayer,
  key: string,
  value: number | string,
  type: 'number' | 'color' | 'string',
  time?: number,
) {
  const original = layer.properties[key];
  // ANI-006: an animated property gets a keyframe at the playhead.
  if (original && original.type === type && isAnimated(original))
    return withValueAt(original, value, time) as never;
  const base =
    original && original.type === type
      ? propertySchema.parse(original as unknown)
      : type === 'number'
        ? number(0)
        : {
            type,
            value: '',
            animated: false,
            keyframes: [] as [],
            constraints: [],
          };
  return { ...base, value } as never;
}
/** Color and property commands shared with Copy style (CV-039). */
export function colorCommand(
  compositionId: string,
  layer: SceneLayer,
  value: string,
  time?: number,
): Command | null {
  const key =
    toolbarKind(layer) === 'drawing'
      ? 'stroke'
      : layer.type === 'text' || layer.type === 'shape'
        ? 'fill'
        : null;
  if (!key || !/^#[0-9a-fA-F]{6}$/.test(value)) return null;
  const current = layer.properties[key];
  if (current?.type === 'color' && current.value === value) return null;
  return setProperty(
    compositionId,
    layer,
    key,
    withValue(layer, key, value, 'color', time),
  );
}
export function fontSizeCommand(
  compositionId: string,
  layer: SceneLayer,
  value: number,
  time?: number,
): Command | null {
  if (layer.type !== 'text') return null;
  if (!(value >= 1 && value <= 4096))
    throw new RangeError(t('toolbar.sizeRange'));
  const current = layer.properties.fontSize;
  if (current?.type === 'number' && current.value === value) return null;
  return setProperty(
    compositionId,
    layer,
    'fontSize',
    withValue(layer, 'fontSize', value, 'number', time),
  );
}
/** W2-F5: the text style properties the toolbar edits, with their checks. */
const TEXT_STYLE_KEYS = {
  fontFamily: (value: unknown) => SYSTEM_FONTS.some(([name]) => name === value),
  fontWeight: (value: unknown) =>
    (FONT_WEIGHTS as readonly unknown[]).includes(value),
  fontStyle: (value: unknown) => value === 'italic' || value === 'normal',
  textAlign: (value: unknown) =>
    (TEXT_ALIGNS as readonly unknown[]).includes(value),
  textCase: (value: unknown) =>
    (TEXT_CASES as readonly unknown[]).includes(value),
  lineHeight: (value: unknown) =>
    typeof value === 'number' &&
    value >= TEXT_LIMITS.lineHeight[0] &&
    value <= TEXT_LIMITS.lineHeight[1],
  letterSpacing: (value: unknown) =>
    typeof value === 'number' &&
    value >= TEXT_LIMITS.letterSpacing[0] &&
    value <= TEXT_LIMITS.letterSpacing[1],
  paragraphSpacing: (value: unknown) =>
    typeof value === 'number' &&
    value >= TEXT_LIMITS.paragraphSpacing[0] &&
    value <= TEXT_LIMITS.paragraphSpacing[1],
  // H3: underline and strikethrough, and the vertical anchor in the box.
  textDecoration: (value: unknown) =>
    (TEXT_DECORATIONS as readonly unknown[]).includes(value),
  textAnchor: (value: unknown) =>
    (TEXT_ANCHORS as readonly unknown[]).includes(value),
} as const;
export type TextStyleKey = keyof typeof TEXT_STYLE_KEYS;
/**
 * One text style property, or [] when it already has that value. An
 * unwrapped box that the new line height or paragraph spacing overflows
 * grows to fit in the same step, so the selection box matches the text.
 */
export function textStyleCommands(
  compositionId: string,
  layer: SceneLayer,
  key: TextStyleKey,
  value: number | string,
): Command[] {
  if (layer.type !== 'text') return [];
  if (!TEXT_STYLE_KEYS[key](value))
    throw new RangeError(t('toolbar.textStyleRange'));
  const current = layer.properties[key];
  if (current && current.value === value) return [];
  const property = withValue(
    layer,
    key,
    value,
    typeof value === 'number' ? 'number' : 'string',
  );
  const commands = [setProperty(compositionId, layer, key, property)];
  const wrap = layer.properties.textWrap;
  const height = layer.properties.height;
  if (
    !(wrap?.type === 'boolean' && wrap.value) &&
    height?.type === 'number' &&
    !isAnimated(height)
  ) {
    const text = layer.properties.text;
    const size = layer.properties.fontSize;
    const needed = layoutParagraphs(
      text?.type === 'string' ? text.value : layer.name,
      Math.min(size?.type === 'number' ? size.value : 32, 4096),
      textStyleOf({
        ...layer,
        properties: { ...layer.properties, [key]: property },
      }),
    ).height;
    if (needed > height.value)
      commands.push(
        setProperty(
          compositionId,
          layer,
          'height',
          withValue(layer, 'height', Math.ceil(needed), 'number'),
        ),
      );
  }
  return commands;
}
/** Brush size keeps the stroke in place: the path and box are re-padded. */
export function brushSizeCommands(
  compositionId: string,
  layer: SceneLayer,
  value: number,
): Command[] {
  const drawing = drawingOf(layer);
  if (!drawing || drawing === 'invalid') return [];
  if (!(value >= MIN_BRUSH && value <= MAX_BRUSH))
    throw new RangeError(t('toolbar.brushRange'));
  if (value === drawing.width) return [];
  const resized = resizeBrush(drawing.strokes, drawing.width, value);
  return [
    ...drawingPathCommands(
      compositionId,
      layer,
      resized.strokes,
      [resized.shift, resized.shift],
      resized.width,
      resized.height,
    ),
    setProperty(
      compositionId,
      layer,
      'strokeWidth',
      withValue(layer, 'strokeWidth', value, 'number'),
    ),
  ];
}
/**
 * A drawing's new local strokes and box. The points were moved by `shift`
 * (local units), so the layer moves back by the same amount in its parent
 * (every keyframe too) and the ink stays where it was on the canvas. Used by
 * the brush size and by the area eraser (G4).
 */
export function drawingPathCommands(
  compositionId: string,
  layer: SceneLayer,
  strokes: readonly (readonly Point2[])[],
  shiftBy: Point2,
  width: number,
  height: number,
): Command[] {
  const matrix = localTransformMatrix({
    ...(layer.transform as TransformValues),
    position: { value: [0, 0] },
  });
  const shift = transformPoint(matrix, shiftBy);
  const [x, y] = layer.transform.position.value;
  // An animated position moves by the same offset at every keyframe.
  const position = layer.transform.position;
  const moved =
    shift[0] === 0 && shift[1] === 0
      ? []
      : isAnimated(position)
        ? [
            {
              type: 'SET_PROPERTY',
              compositionId,
              layerId: layer.id,
              target: { kind: 'transform', key: 'position' },
              property: {
                ...copyProperty(position),
                value: [x - shift[0], y - shift[1]],
                keyframes: position.keyframes.map((frame) => ({
                  ...frame,
                  value: [frame.value[0] - shift[0], frame.value[1] - shift[1]],
                })),
              },
            } as Command,
          ]
        : buildTransformCommands(compositionId, layer, {
            ...(layer.transform as TransformValues),
            position: { value: [x - shift[0], y - shift[1]] },
          });
  return [
    ...moved,
    setProperty(
      compositionId,
      layer,
      'path',
      withValue(layer, 'path', formatStrokes(strokes), 'string'),
    ),
    setProperty(
      compositionId,
      layer,
      'width',
      withValue(layer, 'width', width, 'number'),
    ),
    setProperty(
      compositionId,
      layer,
      'height',
      withValue(layer, 'height', height, 'number'),
    ),
  ];
}

const round = (value: number, digits = 3) =>
  Number(value.toFixed(digits)).toString();

/** H3: what the floating toolbar reaches outside itself. */
export interface ToolbarHooks {
  /** Opens a left tool panel (font, effects, edit-image, replace). */
  openPanel?: (id: 'font' | 'effects' | 'edit-image' | 'replace') => void;
  /** Starts cropping the selected picture (and opens the Crop panel). */
  crop?: () => void;
  /** Opens the Scenes board. */
  scenes?: () => void;
  /** Applies a canvas size to every scene. */
  canvasSize?: (width: number, height: number) => void;
}
/** H3: the kinds of toolbar, from the selection. */
export type ToolbarMode =
  | 'scene'
  | 'image'
  | 'video'
  | 'text'
  | 'shape'
  | 'drawing'
  | 'group'
  | 'multi';
/** Disabled controls: their label key, icon, ledger item and wave. */
const PLANNED: Record<string, readonly [string, string, string, number]> = {
  'bg-remover': ['toolbar.bgRemover', 'magic', 'AI-007', 10],
  eraser: ['toolbar.magicEraser', 'eraser', 'AI-007', 10],
  transition: ['toolbar.transition', 'transitions', 'TR-001', 6],
  list: ['toolbar.list', 'list', 'TXT-024', 3],
  'scene-animate': ['toolbar.animate', 'animate', 'ANI-020', 8],
};

export function mountContextToolbar(
  bar: HTMLElement,
  engine: EditorEngine,
  session: EditorSession,
  edit: (field: InspectorField | GeometryField, value: number) => void,
  report: (error: unknown) => void,
  /** W5-C: opens the Animate presets panel. */
  animate?: () => void,
  /** W2-F3: toggles the Position panel (CV-042). */
  position?: () => void,
  /** G1.5: the left side panel hosting Colour. */
  panels?: SidePanels,
  hooks: ToolbarHooks = {},
) {
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', t('toolbar.label'));
  const selected = () => {
    const source = session.source;
    return session.selectedIds.length === 1 && session.selectedId
      ? (locateLayer(source.composition.layers, session.selectedId)?.layer ??
          null)
      : null;
  };
  /** H3: open popovers by control id; they follow re-renders. */
  const popovers = new Map<
    string,
    { handle: PopoverHandle; build: () => HTMLElement | null }
  >();
  /** The layer and control the side panel's colour picker edits. */
  let colourFor: { layerId: string; control: string } | null = null;
  const run = (label: string, commands: (Command | null)[]) => {
    const list = commands.filter((command): command is Command => !!command);
    // H4: keyframes are edited in 2D Animation only.
    guardCommands(session, list);
    if (list.length) engine.commands.transaction(label, list);
  };
  const safely = (action: () => void) => {
    try {
      action();
    } catch (error) {
      report(error);
      render();
    }
  };
  // G1: the toolbar's fields are the shared NumberField, Select and colour
  // picker, keyed by `toolbar-${id}` and data-control like before.
  const field = (
    id: string,
    label: string,
    value: string,
    commit: (value: number) => void,
    suffix = '',
    step = '',
    limits: {
      min?: number;
      max?: number;
      slider?: boolean;
      presets?: readonly number[];
      decimals?: number;
    } = {},
  ) =>
    createNumberField({
      id: `toolbar-${id}`,
      label,
      value: Number(value),
      ...(suffix ? { unit: suffix } : {}),
      ...(step && step !== 'any' ? { step: Number(step) } : {}),
      ...(step === 'any' || Number(step) < 1 ? { decimals: 2 } : {}),
      ...limits,
      className: 'toolbar-field',
      compact: true,
      data: { control: id },
      onCommit: (next) => safely(() => commit(next)),
      onInvalid: (message) => report(new RangeError(message)),
    });
  /** Every colour used in the composition, for the picker's design row. */
  const designColors = () => documentColors(session.source.composition);
  const colorField = (
    id: string,
    label: string,
    value: string | null,
    commit: (value: string) => void,
    none?: () => void,
    extra?: () => HTMLElement | null,
  ) =>
    createColorField({
      id: `toolbar-${id}`,
      label,
      value,
      compact: true,
      data: { control: id },
      documentColors: designColors,
      ...(extra ? { extra } : {}),
      ...(panels
        ? {
            host: (build: () => HTMLElement) => {
              const opening = panels.openId !== 'colour';
              colourFor = { layerId: session.selectedId ?? '', control: id };
              panels.show('colour', label, build);
              if (opening)
                document
                  .querySelector<HTMLInputElement>('#color-picker-hex')
                  ?.focus();
            },
          }
        : {}),
      ...(none ? { allowNone: true, onNone: () => safely(none) } : {}),
      onCommit: (next) => safely(() => commit(next)),
    });
  const select = (
    id: string,
    label: string,
    options: readonly (readonly [value: string, text: string])[],
    value: string,
    commit: (value: string) => void,
  ) =>
    createSelect({
      id: `toolbar-${id}`,
      label,
      value,
      compact: true,
      data: { control: id },
      options: options.map(([option, text]) => ({
        value: option,
        label: text,
      })),
      onChange: (next) => safely(() => commit(next)),
    });
  /**
   * One toolbar button. `text` shows the label beside the icon (primary
   * controls); otherwise it is icon-only with a tooltip.
   */
  const tool = (
    id: string,
    icon: string,
    label: string,
    onClick?: () => void,
    options: { text?: boolean; shortcut?: string; pressed?: boolean } = {},
  ) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `toolbar-button${options.text ? ' labelled' : ''}`;
    item.dataset.control = id;
    item.setAttribute('aria-label', label);
    item.innerHTML = `${iconSvg(icon, 18)}${options.text ? `<span>${label}</span>` : ''}`;
    item.title = options.shortcut ? `${label} (${options.shortcut})` : label;
    if (options.pressed !== undefined)
      item.setAttribute('aria-pressed', String(options.pressed));
    if (onClick) item.onclick = () => safely(onClick);
    return item;
  };
  const planned = (id: string) => {
    const [key, icon, ledger, wave] = PLANNED[id]!;
    const reason = t('toolbar.later', { wave: String(wave), id: ledger });
    const item = tool(id, icon, t(key));
    item.setAttribute('aria-disabled', 'true');
    item.title = reason;
    item.setAttribute('aria-label', `${t(key)}: ${reason}`);
    return item;
  };
  const divider = () => {
    const line = document.createElement('span');
    line.className = 'toolbar-divider';
    line.setAttribute('aria-hidden', 'true');
    return line;
  };
  /** A button that opens a small popover (at most 280 px) under itself. */
  const popTool = (
    id: string,
    icon: string,
    label: string,
    build: () => HTMLElement | null,
    options: { text?: boolean; listbox?: boolean } = {},
  ) => {
    const item = tool(id, icon, label, undefined, options);
    item.setAttribute('aria-haspopup', options.listbox ? 'listbox' : 'dialog');
    item.setAttribute('aria-expanded', String(popovers.has(id)));
    item.onclick = () =>
      safely(() => {
        const open = popovers.get(id);
        if (open) return open.handle.close();
        const content = build();
        if (!content) return;
        const handle = openPopover(item, content, {
          label,
          className: options.listbox
            ? 'select-popover toolbar-popover'
            : 'toolbar-popover',
          ...(options.listbox ? { role: 'listbox' as const } : {}),
          onClose: () => popovers.delete(id),
        });
        popovers.set(id, { handle, build });
        // A listbox takes focus, so Escape and arrows reach it.
        if (options.listbox)
          handle.element
            .querySelector<HTMLElement>(
              '[role="option"][aria-selected="true"], [role="option"]',
            )
            ?.focus();
      });
    // A listbox opens from the keyboard like the shared Select (LAY-018).
    if (options.listbox)
      item.onkeydown = (event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        if (!popovers.has(id)) item.click();
        popovers
          .get(id)
          ?.handle.element.querySelector<HTMLElement>(
            '[role="option"][aria-selected="true"], [role="option"]',
          )
          ?.focus();
      };
    return item;
  };
  /** A column of labelled controls inside a popover. */
  const form = (label: string, ...children: HTMLElement[]) => {
    const wrap = document.createElement('div');
    wrap.className = 'toolbar-popover-body';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', label);
    wrap.append(...children);
    return wrap;
  };
  /** Choices shown as a listbox (for example Align); `choose` helpers work. */
  const options = (
    items: readonly { value: string; label: string; icon?: string }[],
    current: string,
    commit: (value: string) => void,
    close: () => void,
  ) => {
    const list = document.createElement('div');
    list.className = 'toolbar-options';
    for (const item of items) {
      const option = document.createElement('div');
      option.className = 'select-option';
      option.setAttribute('role', 'option');
      option.tabIndex = -1;
      option.dataset.value = item.value;
      option.setAttribute('aria-selected', String(item.value === current));
      option.innerHTML = `${item.icon ? iconSvg(item.icon, 16) : ''}<span></span>`;
      option.querySelector('span')!.textContent = item.label;
      option.onclick = () =>
        safely(() => {
          close();
          commit(item.value);
        });
      list.append(option);
    }
    list.onkeydown = (event) => {
      const items = [...list.querySelectorAll<HTMLElement>('[role="option"]')];
      const index = items.indexOf(document.activeElement as HTMLElement);
      const move = (to: number) => {
        event.preventDefault();
        items[Math.max(0, Math.min(items.length - 1, to))]?.focus();
      };
      if (event.key === 'ArrowDown') move(index + 1);
      else if (event.key === 'ArrowUp') move(index - 1);
      else if (event.key === 'Home') move(0);
      else if (event.key === 'End') move(items.length - 1);
      else if ((event.key === 'Enter' || event.key === ' ') && index >= 0) {
        event.preventDefault();
        items[index]!.click();
      }
    };
    return list;
  };
  const closePopover = (id: string) => popovers.get(id)?.handle.close();

  // --- Shared controls -------------------------------------------------
  /** H3: the canvas size chip ("16:9 ▾") at the toolbar's left end. */
  const sizeChip = () => {
    const { width, height } = session.source.composition;
    const chip = popTool(
      'canvas-size',
      'chevronDown',
      t('canvasSize.title'),
      () => canvasSizeContent(),
    );
    chip.classList.add('toolbar-size-chip');
    chip.innerHTML = `<span>${ratioLabel(width, height)}</span>${iconSvg('chevronDown', 14)}`;
    chip.title = t('canvasSize.tip', {
      width: formatNumber(width),
      height: formatNumber(height),
    });
    return chip;
  };
  const canvasSizeContent = () => {
    const { width, height } = session.source.composition;
    const apply = (w: number, h: number) =>
      safely(() => {
        closePopover('canvas-size');
        hooks.canvasSize?.(w, h);
      });
    const list = document.createElement('div');
    list.className = 'canvas-size-list';
    for (const preset of CANVAS_PRESETS) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'canvas-size-preset';
      item.dataset.preset = preset.id;
      item.setAttribute(
        'aria-pressed',
        String(preset.width === width && preset.height === height),
      );
      item.innerHTML = `<span class="canvas-size-ratio"></span><span class="canvas-size-name"></span><span class="canvas-size-px"></span>`;
      item.querySelector('.canvas-size-ratio')!.textContent = preset.ratio;
      item.querySelector('.canvas-size-name')!.textContent = t(
        `canvasSize.${preset.id}`,
      );
      item.querySelector('.canvas-size-px')!.textContent =
        `${formatNumber(preset.width)} × ${formatNumber(preset.height)}`;
      item.onclick = () => apply(preset.width, preset.height);
      list.append(item);
    }
    let customWidth = width,
      customHeight = height;
    const custom = document.createElement('div');
    custom.className = 'canvas-size-custom';
    const heading = document.createElement('h4');
    heading.textContent = t('canvasSize.custom');
    const done = document.createElement('button');
    done.type = 'button';
    done.id = 'canvas-size-apply';
    done.className = 'primary sm';
    done.textContent = t('canvasSize.apply');
    done.onclick = () =>
      apply(Math.round(customWidth), Math.round(customHeight));
    custom.append(
      heading,
      createNumberField({
        id: 'canvas-size-w',
        label: 'W',
        value: width,
        unit: 'px',
        decimals: 0,
        min: CANVAS_LIMITS[0],
        max: CANVAS_LIMITS[1],
        compact: true,
        onCommit: (value) => (customWidth = value),
      }),
      createNumberField({
        id: 'canvas-size-h',
        label: 'H',
        value: height,
        unit: 'px',
        decimals: 0,
        min: CANVAS_LIMITS[0],
        max: CANVAS_LIMITS[1],
        compact: true,
        onCommit: (value) => (customHeight = value),
      }),
      done,
    );
    return form(t('canvasSize.title'), list, custom);
  };
  const animateTool = (enabled = true) => {
    const item = tool(
      'animate',
      'animate',
      t('toolbar.animate'),
      () => animate?.(),
      { text: true },
    );
    item.disabled = !animate || !enabled;
    if (!enabled) item.title = t('toolbar.animateOne');
    item.setAttribute('aria-haspopup', 'dialog');
    return item;
  };
  const positionTool = () => {
    const item = tool(
      'position',
      'layers',
      t('toolbar.position'),
      () => position?.(),
      { text: true },
    );
    item.disabled = !position;
    item.setAttribute('aria-haspopup', 'dialog');
    return item;
  };
  const copyStyleTool = () => {
    const item = tool(
      'copy-style',
      'brush',
      t('command.copyStyle'),
      () => {
        copyStyle(session);
        showToast(t('toolbar.styleCopied'), 'info', 2500);
      },
      { shortcut: 'Ctrl+Alt+C' },
    );
    item.disabled = !canCopyStyle(session);
    return item;
  };
  /** Transparency: the layer opacity (all selected layers for several). */
  const transparencyTool = (extra?: () => HTMLElement | null) =>
    popTool('transparency', 'transparency', t('toolbar.transparency'), () => {
      const layer = selected();
      const opacity = layer
        ? layer.transform.opacity.value
        : (selectionRoots(session.source, session.selectedIds)[0]?.transform
            .opacity.value ?? 1);
      const slider = field(
        'opacity',
        t('toolbar.opacity'),
        round(opacity * 100, 1),
        (value) => {
          if (!(value >= 0 && value <= 100))
            throw new RangeError(t('toolbar.opacityRange'));
          if (layer) edit('Opacity', value / 100);
          else
            run(
              'Set opacity',
              selectionRoots(session.source, session.selectedIds).flatMap(
                (root) =>
                  buildTransformCommands(
                    session.source.composition.id,
                    root,
                    {
                      ...(root.transform as TransformValues),
                      opacity: { value: value / 100 },
                    },
                    undefined,
                    session.currentTime,
                  ),
              ),
            );
        },
        '%',
        '',
        { min: 0, max: 100, slider: true, presets: [0, 25, 50, 75, 100] },
      );
      const more = extra?.();
      return form(t('toolbar.transparency'), slider, ...(more ? [more] : []));
    });
  const flipTool = (layer: SceneLayer) =>
    popTool('flip', 'flipH', t('toolbar.flip'), () => {
      const compositionId = session.source.composition.id;
      const flip = (axis: 'horizontal' | 'vertical') =>
        tool(
          `flip-${axis}`,
          axis === 'horizontal' ? 'flipH' : 'flipV',
          t(axis === 'horizontal' ? 'toolbar.flipH' : 'toolbar.flipV'),
          () => {
            const current = selected() ?? layer;
            const bounds = selectionBounds(session.source, current.id)?.bounds;
            if (!bounds) return;
            run(
              axis === 'horizontal' ? 'Flip horizontal' : 'Flip vertical',
              buildTransformCommands(
                compositionId,
                current,
                flipTransform(
                  current.transform as TransformValues,
                  [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2],
                  axis,
                ),
                undefined,
                session.currentTime,
              ),
            );
          },
          { text: true },
        );
      return form(t('toolbar.flip'), flip('horizontal'), flip('vertical'));
    });
  /** Stroke (shapes) or border (pictures): colour, width, style, ends. */
  const strokeContent = (picture: boolean) => {
    const layer = selected();
    if (!layer) return null;
    const compositionId = session.source.composition.id;
    const shape = shapeOf(layer);
    const border = picture ? pictureOf(layer)?.border : null;
    const color = picture
      ? (border?.color ??
        (layer.properties.stroke?.type === 'color'
          ? layer.properties.stroke.value.slice(0, 7)
          : '#000000'))
      : (shape?.stroke ?? '#000000');
    const width = picture ? (border?.width ?? 0) : (shape?.strokeWidth ?? 0);
    const dash = picture ? (border?.dash ?? 'solid') : (shape?.dash ?? 'solid');
    const set = (label: string, key: string, value: number | string) =>
      run(label, [
        picture
          ? setProperty(
              compositionId,
              selected() ?? layer,
              key,
              withValue(
                selected() ?? layer,
                key,
                value,
                typeof value === 'number'
                  ? 'number'
                  : key === 'stroke'
                    ? 'color'
                    : 'string',
              ),
            )
          : shapeStyleCommand(
              compositionId,
              selected() ?? layer,
              key as ShapeKey,
              value,
            ),
      ]);
    const styleChoice = document.createElement('div');
    styleChoice.className = 'segmented stroke-styles';
    styleChoice.setAttribute('role', 'radiogroup');
    styleChoice.setAttribute('aria-label', t('toolbar.strokeStyle'));
    for (const choice of ['none', ...STROKE_DASHES] as const) {
      const item = document.createElement('button');
      item.type = 'button';
      item.dataset.stroke = choice;
      item.setAttribute('role', 'radio');
      const current = width <= 0 ? 'none' : dash;
      item.setAttribute('aria-checked', String(current === choice));
      item.title = t(`shape.dash.${choice}`);
      item.setAttribute('aria-label', t(`shape.dash.${choice}`));
      item.innerHTML = iconSvg(
        choice === 'none'
          ? 'noFill'
          : choice === 'solid'
            ? 'minus'
            : 'strokeStyle',
        16,
      );
      item.onclick = () =>
        safely(() => {
          if (choice === 'none') return set('Remove stroke', 'strokeWidth', 0);
          const commands: (Command | null)[] = [];
          const target = selected() ?? layer;
          const key = 'strokeDash';
          commands.push(
            picture
              ? setProperty(
                  compositionId,
                  target,
                  key,
                  withValue(target, key, choice, 'string'),
                )
              : shapeStyleCommand(compositionId, target, key, choice),
          );
          if (width <= 0)
            commands.push(
              picture
                ? setProperty(
                    compositionId,
                    target,
                    'strokeWidth',
                    withValue(target, 'strokeWidth', 4, 'number'),
                  )
                : shapeStyleCommand(compositionId, target, 'strokeWidth', 4),
            );
          if (picture && !border)
            commands.push(
              setProperty(
                compositionId,
                target,
                'stroke',
                withValue(target, 'stroke', color, 'color'),
              ),
            );
          run('Set stroke style', commands);
        });
      styleChoice.append(item);
    }
    const colour = createColorField({
      id: 'toolbar-stroke',
      label: t('toolbar.stroke'),
      value: color,
      compact: true,
      data: { control: 'stroke' },
      documentColors: designColors,
      onCommit: (value) =>
        safely(() => {
          const target = selected() ?? layer;
          run('Set stroke', [
            picture
              ? setProperty(
                  compositionId,
                  target,
                  'stroke',
                  withValue(target, 'stroke', value, 'color'),
                )
              : shapeStyleCommand(compositionId, target, 'stroke', value),
            width <= 0
              ? picture
                ? setProperty(
                    compositionId,
                    target,
                    'strokeWidth',
                    withValue(target, 'strokeWidth', 4, 'number'),
                  )
                : shapeStyleCommand(compositionId, target, 'strokeWidth', 4)
              : null,
          ]);
        }),
    });
    const children: HTMLElement[] = [
      styleChoice,
      field(
        'width',
        t('toolbar.strokeWidth'),
        round(width, 2),
        (value) => set('Set stroke width', 'strokeWidth', value),
        'px',
        '',
        { min: 0, max: 200, slider: true, presets: [0, 1, 2, 4, 8, 16] },
      ),
      colour,
    ];
    if (!picture && shape) {
      children.push(
        select(
          'dash',
          t('toolbar.dash'),
          STROKE_DASHES.map((item) => [item, t(`shape.dash.${item}`)] as const),
          shape.dash,
          (value) => set('Set stroke dash', 'strokeDash', value),
        ),
        select(
          'cap',
          t('toolbar.cap'),
          STROKE_CAPS.map((cap) => [cap, t(`shape.cap.${cap}`)] as const),
          shape.cap,
          (value) => set('Set stroke caps', 'strokeCap', value),
        ),
        select(
          'join',
          t('toolbar.join'),
          STROKE_JOINS.map((join) => [join, t(`shape.join.${join}`)] as const),
          shape.join,
          (value) => set('Set stroke joins', 'strokeJoin', value),
        ),
      );
    }
    return form(t('toolbar.strokeStyle'), ...children);
  };
  const cornersTool = (layer: SceneLayer, picture: boolean) =>
    popTool('corners-menu', 'corners', t('toolbar.corners'), () => {
      const current = selected() ?? layer;
      const compositionId = session.source.composition.id;
      const shape = shapeOf(current);
      const value = picture
        ? (pictureOf(current)?.radius ?? 0)
        : (shape?.radius ?? 0);
      const item = field(
        'corners',
        t('toolbar.corners'),
        round(value, 2),
        (next) =>
          run('Set corner radius', [
            picture
              ? setProperty(
                  compositionId,
                  selected() ?? current,
                  'cornerRadius',
                  withValue(
                    selected() ?? current,
                    'cornerRadius',
                    next,
                    'number',
                  ),
                )
              : shapeCommandFor(selected() ?? current, 'cornerRadius', next),
          ]),
        'px',
        '',
        { min: 0, max: 500, slider: true, presets: [0, 8, 16, 32, 64] },
      );
      if (!picture && shape?.kind !== 'rectangle')
        item.querySelector('input')!.disabled = true;
      return form(t('toolbar.corners'), item);
    });
  const shapeCommandFor = (
    layer: SceneLayer,
    key: ShapeKey,
    value: number | string | boolean,
  ) => shapeStyleCommand(session.source.composition.id, layer, key, value);

  // --- The scene bar ------------------------------------------------------
  const renderScene = () => {
    const source = session.source;
    bar.dataset.kind = 'scene';
    const name = document.createElement('span');
    name.className = 'toolbar-scene-name';
    name.textContent = source.composition.name;
    return [
      sizeChip(),
      divider(),
      name,
      colorField(
        'background',
        t('scene.background'),
        source.background,
        (color) =>
          run('Set background', [{ type: 'SET_PROJECT_BACKGROUND', color }]),
      ),
      popTool(
        'duration',
        'timing',
        t('scene.duration'),
        () =>
          form(
            t('scene.duration'),
            field(
              'scene-length',
              t('scene.length'),
              round(session.source.composition.duration, 2),
              (value) =>
                run(
                  'Set scene length',
                  sceneLengthCommands(session.source, value),
                ),
              's',
              '0.1',
              { min: 0.1, max: 3600, presets: [3, 5, 10, 15, 30] },
            ),
          ),
        { text: true },
      ),
      planned('transition'),
      tool('scene-order', 'scenes', t('scene.order'), () => hooks.scenes?.(), {
        text: true,
      }),
      divider(),
      planned('scene-animate'),
    ];
  };

  // --- Per type -------------------------------------------------------------
  const imageControls = (layer: SceneLayer, video: boolean) => [
    sizeChip(),
    divider(),
    ...(video
      ? []
      : [
          tool(
            'edit-image',
            'edit',
            t('toolbar.editImage'),
            () => hooks.openPanel?.('edit-image'),
            { text: true },
          ),
        ]),
    tool(
      'replace',
      'replace',
      t('toolbar.replace'),
      () => hooks.openPanel?.('replace'),
      { text: !video },
    ),
    ...(video ? [] : [planned('bg-remover'), planned('eraser')]),
    divider(),
    ...(video
      ? []
      : [
          popTool('stroke-style', 'border', t('toolbar.border'), () =>
            strokeContent(true),
          ),
          cornersTool(layer, true),
        ]),
    tool('crop', 'crop', t('toolbar.crop'), () => hooks.crop?.(), {
      text: true,
    }),
    flipTool(layer),
    transparencyTool(),
    divider(),
    animateTool(),
    positionTool(),
    copyStyleTool(),
  ];
  const textControls = (layer: SceneLayer) => {
    const compositionId = session.source.composition.id;
    const style = textStyleOf(layer);
    const size = layer.properties.fontSize;
    const fontSize = size?.type === 'number' ? size.value : 32;
    const styleRun = (
      label: string,
      key: TextStyleKey,
      value: number | string,
    ) =>
      run(
        label,
        textStyleCommands(compositionId, selected() ?? layer, key, value),
      );
    const font = tool(
      'font',
      'text',
      style.family,
      () => hooks.openPanel?.('font'),
      { text: true },
    );
    font.id = 'toolbar-font';
    font.dataset.value = style.family;
    font.classList.add('toolbar-font');
    font.setAttribute('aria-label', t('toolbar.font'));
    font.title = t('toolbar.font');
    font.setAttribute('aria-haspopup', 'dialog');
    const setSize = (value: number) =>
      run('Set text size', [
        fontSizeCommand(
          compositionId,
          selected() ?? layer,
          value,
          session.currentTime,
        ),
      ]);
    const sizeGroup = document.createElement('div');
    sizeGroup.className = 'toolbar-group toolbar-size';
    sizeGroup.append(
      tool('size-down', 'minus', t('toolbar.sizeDown'), () =>
        setSize(Math.max(1, Math.round(fontSize) - 1)),
      ),
      field(
        'size',
        t('toolbar.size'),
        round(fontSize, 2),
        (value) => setSize(value),
        '',
        '',
        {
          min: 1,
          max: 4096,
          presets: [12, 14, 16, 18, 24, 32, 48, 64, 96, 128],
        },
      ),
      tool('size-up', 'plus', t('toolbar.sizeUp'), () =>
        setSize(Math.min(4096, Math.round(fontSize) + 1)),
      ),
    );
    const decoration = (underline: boolean, strike: boolean) =>
      underline && strike
        ? 'underline line-through'
        : underline
          ? 'underline'
          : strike
            ? 'line-through'
            : 'none';
    const alignIcons: Record<string, string> = {
      left: 'alignLeft',
      center: 'alignCenter',
      right: 'alignRight',
      justify: 'alignJustify',
    };
    const align = popTool(
      'align',
      alignIcons[style.align]!,
      t('toolbar.textAlign'),
      () =>
        options(
          TEXT_ALIGNS.map((value) => ({
            value,
            label: t(`text.align.${value}`),
            icon: alignIcons[value]!,
          })),
          textStyleOf(selected() ?? layer).align,
          (value) => styleRun('Set text alignment', 'textAlign', value),
          () => closePopover('align'),
        ),
      { listbox: true },
    );
    align.id = 'toolbar-align';
    align.dataset.value = style.align;
    return [
      sizeChip(),
      divider(),
      font,
      sizeGroup,
      colorField(
        'color',
        t('toolbar.color'),
        layer.properties.fill?.type === 'color'
          ? layer.properties.fill.value.slice(0, 7)
          : '#000000',
        (value) =>
          run('Set color', [
            colorCommand(
              compositionId,
              selected() ?? layer,
              value,
              session.currentTime,
            ),
          ]),
      ),
      divider(),
      tool(
        'bold',
        'bold',
        t('toolbar.bold'),
        () =>
          styleRun('Set bold', 'fontWeight', style.weight >= 700 ? 400 : 700),
        { pressed: style.weight >= 700, shortcut: 'Ctrl+B' },
      ),
      tool(
        'italic',
        'italic',
        t('toolbar.italic'),
        () =>
          styleRun(
            'Set italic',
            'fontStyle',
            style.italic ? 'normal' : 'italic',
          ),
        { pressed: style.italic, shortcut: 'Ctrl+I' },
      ),
      tool(
        'underline',
        'underline',
        t('toolbar.underline'),
        () =>
          styleRun(
            'Set underline',
            'textDecoration',
            decoration(!style.underline, style.strike),
          ),
        { pressed: style.underline, shortcut: 'Ctrl+U' },
      ),
      tool(
        'strike',
        'strike',
        t('toolbar.strike'),
        () =>
          styleRun(
            'Set strikethrough',
            'textDecoration',
            decoration(style.underline, !style.strike),
          ),
        { pressed: style.strike },
      ),
      tool(
        'uppercase',
        'uppercase',
        t('toolbar.uppercase'),
        () =>
          styleRun(
            'Set text case',
            'textCase',
            style.textCase === 'upper' ? 'none' : 'upper',
          ),
        { pressed: style.textCase === 'upper' },
      ),
      align,
      planned('list'),
      popTool('spacing', 'spacing', t('toolbar.advanced'), () =>
        advancedContent(),
      ),
      divider(),
      transparencyTool(),
      tool(
        'effects',
        'effects',
        t('toolbar.effects'),
        () => hooks.openPanel?.('effects'),
        { text: true },
      ),
      animateTool(),
      positionTool(),
      copyStyleTool(),
    ];
  };
  /** Advanced text settings: weight, spacing, case and vertical anchor. */
  const advancedContent = () => {
    const layer = selected();
    if (!layer || layer.type !== 'text') return null;
    const style = textStyleOf(layer);
    const compositionId = session.source.composition.id;
    const styleRun = (
      label: string,
      key: TextStyleKey,
      value: number | string,
    ) =>
      run(
        label,
        textStyleCommands(compositionId, selected() ?? layer, key, value),
      );
    const anchor = document.createElement('div');
    anchor.className = 'segmented';
    anchor.setAttribute('role', 'radiogroup');
    anchor.setAttribute('aria-label', t('toolbar.anchor'));
    for (const value of TEXT_ANCHORS) {
      const item = document.createElement('button');
      item.type = 'button';
      item.dataset.anchor = value;
      item.setAttribute('role', 'radio');
      item.setAttribute('aria-checked', String(style.anchor === value));
      item.textContent = t(`text.anchor.${value}`);
      item.onclick = () =>
        safely(() => styleRun('Set text anchor', 'textAnchor', value));
      anchor.append(item);
    }
    const anchorLabel = document.createElement('span');
    anchorLabel.className = 'toolbar-popover-label';
    anchorLabel.textContent = t('toolbar.anchor');
    return form(
      t('toolbar.advanced'),
      select(
        'weight',
        t('toolbar.weight'),
        FONT_WEIGHTS.map(
          (weight) => [String(weight), t(`text.weight${weight}`)] as const,
        ),
        String(style.weight),
        (value) => styleRun('Set font weight', 'fontWeight', Number(value)),
      ),
      field(
        'letter-spacing',
        t('toolbar.letterSpacing'),
        round(style.letterSpacing, 2),
        (value) => styleRun('Set letter spacing', 'letterSpacing', value),
        'px',
        '',
        { min: -50, max: 200, slider: true },
      ),
      field(
        'line-height',
        t('toolbar.lineHeight'),
        round(style.lineHeight, 2),
        (value) => styleRun('Set line height', 'lineHeight', value),
        '×',
        '0.1',
        { min: 0.5, max: 5, slider: true, decimals: 2 },
      ),
      field(
        'paragraph-spacing',
        t('toolbar.paragraphSpacing'),
        round(style.paragraphSpacing, 2),
        (value) => styleRun('Set paragraph spacing', 'paragraphSpacing', value),
        'px',
        '',
        { min: 0, max: 500, slider: true },
      ),
      select(
        'case',
        t('toolbar.textCase'),
        TEXT_CASES.map(
          (textCase) => [textCase, t(`text.case.${textCase}`)] as const,
        ),
        style.textCase,
        (value) => styleRun('Set text case', 'textCase', value),
      ),
      anchorLabel,
      anchor,
    );
  };
  const shapeControls = (layer: SceneLayer) => {
    const shape = shapeOf(layer);
    const compositionId = session.source.composition.id;
    const open = !!shape && (shape.kind === 'line' || shape.kind === 'arrow');
    const fillOpacity = () => {
      const current = selected() ?? layer;
      const style = shapeOf(current);
      if (!style || !style.fill) return null;
      return field(
        'fill-opacity',
        t('toolbar.fillOpacity'),
        percent(style.fillOpacity),
        (value) =>
          run('Set fill opacity', [
            shapeCommandFor(selected() ?? current, 'fillOpacity', value / 100),
          ]),
        '%',
        '',
        { min: 0, max: 100, slider: true, presets: [0, 25, 50, 75, 100] },
      );
    };
    const fill = colorField(
      'fill',
      t('toolbar.fill'),
      shape && !shape.fill ? null : (shape?.fill ?? '#000000'),
      (value) =>
        run('Set color', [
          colorCommand(
            compositionId,
            selected() ?? layer,
            value,
            session.currentTime,
          ),
          shape && !shape.fill
            ? shapeCommandFor(selected() ?? layer, 'fillEnabled', true)
            : null,
        ]),
      shape
        ? () =>
            run('Remove fill', [
              shapeCommandFor(selected() ?? layer, 'fillEnabled', false),
            ])
        : undefined,
      fillOpacity,
    );
    if (open) fill.querySelector('button')!.disabled = true;
    // Combining needs two or more shapes; the button says how (W5-D).
    const combine = popTool('boolean', 'combine', t('toolbar.boolean'), () => {
      const hint = document.createElement('p');
      hint.className = 'toolbar-popover-hint';
      hint.textContent = t('shape.combineHint');
      return form(t('toolbar.boolean'), hint);
    });
    combine.title = t('shape.combineHint');
    return [
      sizeChip(),
      divider(),
      fill,
      popTool('stroke-style', 'strokeStyle', t('toolbar.strokeStyle'), () =>
        strokeContent(false),
      ),
      cornersTool(layer, false),
      combine,
      divider(),
      transparencyTool(),
      animateTool(),
      positionTool(),
      copyStyleTool(),
    ];
  };
  const drawingControls = (layer: SceneLayer) => {
    const compositionId = session.source.composition.id;
    const drawing = drawingOf(layer);
    const stroke = layer.properties.stroke;
    return [
      sizeChip(),
      divider(),
      colorField(
        'color',
        t('toolbar.color'),
        stroke?.type === 'color' ? stroke.value.slice(0, 7) : '#000000',
        (value) =>
          run('Set color', [
            colorCommand(
              compositionId,
              selected() ?? layer,
              value,
              session.currentTime,
            ),
          ]),
      ),
      popTool('brush-size', 'brush', t('toolbar.brushSize'), () =>
        form(
          t('toolbar.brushSize'),
          field(
            'brush',
            t('toolbar.brushSize'),
            round(drawing && drawing !== 'invalid' ? drawing.width : 0, 2),
            (value) =>
              run(
                'Set brush size',
                brushSizeCommands(compositionId, selected() ?? layer, value),
              ),
            'px',
            '',
            { min: MIN_BRUSH, max: MAX_BRUSH, slider: true },
          ),
        ),
      ),
      divider(),
      transparencyTool(),
      animateTool(),
      positionTool(),
      copyStyleTool(),
    ];
  };
  const groupControls = (multi: boolean) => {
    const ids = session.selectedIds;
    const isGroup =
      !multi && describeSelection(session.source, ids).every('group');
    const actions = contextActions(session.source, ids, session.currentTime);
    const blocker = isGroup ? ungroupBlocker(session.source, ids) : null;
    const grouping = isGroup
      ? tool(
          'ungroup',
          'ungroup',
          t('command.ungroup'),
          () => performEdit(engine, session, 'ungroup'),
          { text: true, shortcut: 'Ctrl+Shift+G' },
        )
      : tool(
          'group',
          'group',
          t('command.group'),
          () => performEdit(engine, session, 'group'),
          { text: true, shortcut: 'Ctrl+G' },
        );
    if (isGroup && blocker) {
      grouping.setAttribute('aria-disabled', 'true');
      grouping.onclick = null;
      grouping.title = blocker;
    } else if (!isGroup && !actions.includes('group')) grouping.disabled = true;
    return [
      sizeChip(),
      divider(),
      grouping,
      divider(),
      positionTool(),
      transparencyTool(),
      animateTool(!multi),
      copyStyleTool(),
    ];
  };

  /** Keeps the open popovers and the colour panel in step with the toolbar. */
  const refreshAttached = (layer: SceneLayer | null) => {
    for (const [id, open] of [...popovers]) {
      const anchor = bar.querySelector<HTMLElement>(`[data-control="${id}"]`);
      const content = anchor ? open.build() : null;
      if (!anchor || !content) open.handle.close();
      else {
        open.handle.retarget(anchor);
        open.handle.element.replaceChildren(content);
        restoreFieldFocus(open.handle.element);
      }
    }
    if (panels?.openId === 'colour' && colourFor) {
      const trigger = bar.querySelector<HTMLElement>(
        `#toolbar-${colourFor.control}`,
      );
      // The scene bar's background has no layer (layerId '').
      if ((layer?.id ?? '') !== colourFor.layerId || !trigger) panels.close();
      else trigger.click();
    }
  };
  /** H3: which toolbar the selection shows (null hides it). */
  const modeOf = (): ToolbarMode | null => {
    const ids = session.selectedIds;
    if (!ids.length) return session.canvasSelected ? 'scene' : null;
    if (ids.length > 1) return 'multi';
    const layer = selected();
    if (!layer) return null;
    if (layer.type === 'group') return 'group';
    if (layer.type === 'audio') return null;
    if (layer.type === 'image') return 'image';
    if (layer.type === 'video') return 'video';
    const kind = toolbarKind(layer);
    return kind === 'media' ? 'image' : (kind as ToolbarMode | null);
  };
  let renders = 0;
  const render = () => {
    // D-031 pattern: a focused field commits on blur, which re-renders; blur
    // it first and drop this render if that commit already re-rendered.
    const active = document.activeElement;
    if (active instanceof HTMLElement && bar.contains(active)) {
      const before = renders;
      active.blur();
      if (renders !== before) return;
    }
    renders++;
    const mode = modeOf();
    const layer = selected();
    // The row stays reserved; an empty toolbar fades out.
    bar.hidden = !mode;
    bar.dataset.kind =
      mode === 'image' || mode === 'video' ? 'media' : (mode ?? '');
    if (mode) bar.dataset.mode = mode;
    else delete bar.dataset.mode;
    if (!mode) {
      overflow = [];
      bar.replaceChildren();
      refreshAttached(null);
      return;
    }
    // H3 (CV-051): a locked selection offers only Unlock (Canva).
    const locked = mode !== 'scene' && selectionLocked(session);
    const controls = locked
      ? [
          sizeChip(),
          divider(),
          tool(
            'unlock',
            'unlock',
            t('toolbar.unlock'),
            () => setLocked(engine, session, false),
            { text: true },
          ),
        ]
      : mode === 'scene'
        ? renderScene()
        : mode === 'image' || mode === 'video'
          ? imageControls(layer!, mode === 'video')
          : mode === 'text'
            ? textControls(layer!)
            : mode === 'shape'
              ? shapeControls(layer!)
              : mode === 'drawing'
                ? drawingControls(layer!)
                : groupControls(mode === 'multi');
    overflow = [];
    bar.replaceChildren(...controls);
    fit();
    restoreFieldFocus(bar);
    refreshAttached(mode === 'scene' ? null : layer);
  };
  /**
   * H3: the row never scrolls. When it is wider than the stage, labelled
   * buttons first drop their text, then trailing controls move into a More
   * popover (Canva).
   */
  let overflow: HTMLElement[] = [];
  const fit = () => {
    for (const item of overflow) bar.append(item);
    overflow = [];
    bar.querySelector('[data-control="toolbar-more"]')?.remove();
    bar.classList.remove('compact');
    const available = bar.parentElement?.clientWidth ?? 0;
    if (bar.hidden || available <= 0) return;
    const fits = () =>
      bar.scrollWidth <= Math.min(available, bar.clientWidth) + 1;
    if (fits()) return;
    bar.classList.add('compact');
    if (fits()) return;
    const more = popTool('toolbar-more', 'more', t('toolbar.more'), () => {
      const list = document.createElement('div');
      list.className = 'toolbar-overflow';
      list.append(...overflow);
      return list;
    });
    bar.append(more);
    const movable = () =>
      [...bar.children].filter(
        (child): child is HTMLElement =>
          child !== more && !child.matches('.toolbar-size-chip'),
      );
    while (!fits()) {
      const items = movable();
      const last = items[items.length - 1];
      if (!last || items.length <= 2) break;
      last.remove();
      if (!last.classList.contains('toolbar-divider')) overflow.unshift(last);
    }
    // No divider right before More.
    const before = more.previousElementSibling;
    if (before?.classList.contains('toolbar-divider')) before.remove();
  };
  if (typeof ResizeObserver !== 'undefined' && bar.parentElement)
    new ResizeObserver(() => {
      if (!bar.hidden) fit();
    }).observe(bar.parentElement);
  render();
  return { render };
}

/** Formats a percentage for display (no raw floats in the UI). */
export const percent = (value: number) => formatNumber(Math.round(value * 100));
