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
  formatPath,
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
  TEXT_CASES,
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

export type ToolbarKind = 'media' | 'text' | 'shape' | 'drawing';
/** A control not built yet: its label key, ledger item and wave. */
type Later = readonly [label: string, id: string, wave: number];
const LATER: Record<string, Later> = {
  crop: ['toolbar.crop', 'VID-003', 4],
  blend: ['toolbar.blend', 'MSK-001', 6],
  replace: ['toolbar.replace', 'VID-009', 4],
  effects: ['toolbar.effects', 'TXT-019', 3],
};
/** The spec's control order per type; strings name live controls or LATER keys. */
const LAYOUT: Record<ToolbarKind, readonly string[]> = {
  media: [
    'x',
    'y',
    'scale',
    'rotate',
    'crop',
    'flip',
    'opacity',
    'blend',
    'animate',
    'replace',
    'position',
  ],
  text: [
    'font',
    'size',
    'weight',
    'italic',
    'color',
    'align',
    'spacing',
    'effects',
    'animate',
    'position',
  ],
  shape: [
    'fill',
    'fill-opacity',
    'no-fill',
    'stroke',
    'width',
    'stroke-style',
    'corners',
    'boolean',
    'animate',
    'position',
  ],
  drawing: ['color', 'brush', 'opacity', 'animate', 'position'],
};

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
  const resized = resizeBrush(drawing.points, drawing.width, value);
  const matrix = localTransformMatrix({
    ...(layer.transform as TransformValues),
    position: { value: [0, 0] },
  });
  const shift = transformPoint(matrix, [resized.shift, resized.shift]);
  const [x, y] = layer.transform.position.value;
  // An animated position moves by the same offset at every keyframe.
  const position = layer.transform.position;
  const moved = isAnimated(position)
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
      withValue(layer, 'path', formatPath(resized.points), 'string'),
    ),
    setProperty(
      compositionId,
      layer,
      'strokeWidth',
      withValue(layer, 'strokeWidth', value, 'number'),
    ),
    setProperty(
      compositionId,
      layer,
      'width',
      withValue(layer, 'width', resized.width, 'number'),
    ),
    setProperty(
      compositionId,
      layer,
      'height',
      withValue(layer, 'height', resized.height, 'number'),
    ),
  ];
}

const round = (value: number, digits = 3) =>
  Number(value.toFixed(digits)).toString();

export function mountContextToolbar(
  bar: HTMLElement,
  engine: EditorEngine,
  session: EditorSession,
  edit: (field: InspectorField, value: number) => void,
  report: (error: unknown) => void,
  /** W5-C: opens the Animate presets panel. */
  animate?: () => void,
  /** W2-F3: toggles the Position panel (CV-042). */
  position?: () => void,
  /** G1.5: the left side panel hosting Colour and Stroke style. */
  panels?: SidePanels,
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
  /** G1.5: the Spacing popover stays open across re-renders. */
  let spacingPopover: PopoverHandle | null = null;
  /** The layer and control the side panel's colour picker edits. */
  let colourFor: { layerId: string; control: string } | null = null;
  const run = (label: string, commands: (Command | null)[]) => {
    const list = commands.filter((command): command is Command => !!command);
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
  const designColors = () => {
    const colors: string[] = [];
    const visit = (layers: readonly SceneLayer[]) => {
      for (const layer of layers) {
        for (const property of Object.values(layer.properties))
          if (property?.type === 'color')
            colors.push(property.value.slice(0, 7).toLowerCase());
        visit(layer.children);
      }
    };
    visit(session.source.composition.layers);
    return colors;
  };
  const colorField = (
    id: string,
    label: string,
    value: string | null,
    commit: (value: string) => void,
    none?: () => void,
  ) =>
    createColorField({
      id: `toolbar-${id}`,
      label,
      value,
      compact: true,
      data: { control: id },
      documentColors: designColors,
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
    fonts = false,
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
        ...(fonts ? { font: `"${option}"` } : {}),
      })),
      onChange: (next) => safely(() => commit(next)),
    });
  const button = (
    id: string,
    label: string,
    icon: string,
    onClick?: () => void,
  ) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'toolbar-button';
    item.dataset.control = id;
    item.setAttribute('aria-label', label);
    item.innerHTML = `${iconSvg(icon, 16)}<span>${label}</span>`;
    item.title = label;
    if (onClick) item.onclick = () => safely(onClick);
    return item;
  };
  const later = (id: string) => {
    const [label, ledger, wave] = LATER[id]!;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'toolbar-button';
    item.dataset.control = id;
    item.setAttribute('aria-disabled', 'true');
    item.textContent = t(label);
    item.title = t('toolbar.later', { wave: String(wave), id: ledger });
    item.setAttribute(
      'aria-label',
      `${t(label)}: ${t('toolbar.later', { wave: String(wave), id: ledger })}`,
    );
    return item;
  };
  /** Keeps the Spacing popover and the side panels in step with the toolbar. */
  const refreshAttached = (layer: SceneLayer | null) => {
    if (spacingPopover) {
      const content = spacingContent();
      const anchor = bar.querySelector<HTMLElement>('[data-control="spacing"]');
      if (!content || !anchor) spacingPopover.close();
      else {
        spacingPopover.retarget(anchor);
        spacingPopover.element.replaceChildren(content);
        restoreFieldFocus(spacingPopover.element);
      }
    }
    if (panels?.openId === 'stroke-style') panels.refresh();
    if (panels?.openId === 'colour' && colourFor) {
      const trigger = bar.querySelector<HTMLElement>(
        `#toolbar-${colourFor.control}`,
      );
      if (!layer || layer.id !== colourFor.layerId || !trigger) panels.close();
      else trigger.click();
    }
  };
  /** G1.5 quick choice: line height, letter and paragraph spacing, case. */
  const spacingContent = () => {
    const layer = selected();
    if (!layer || layer.type !== 'text') return null;
    const style = textStyleOf(layer);
    const compositionId = session.source.composition.id;
    const wrap = document.createElement('div');
    wrap.className = 'toolbar-popover-body';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', t('toolbar.spacing'));
    const styleRun = (
      label: string,
      key: TextStyleKey,
      value: number | string,
    ) =>
      run(
        label,
        textStyleCommands(compositionId, selected() ?? layer, key, value),
      );
    wrap.append(
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
        'letter-spacing',
        t('toolbar.letterSpacing'),
        round(style.letterSpacing, 2),
        (value) => styleRun('Set letter spacing', 'letterSpacing', value),
        'px',
        '',
        { min: -50, max: 200, slider: true },
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
    );
    return wrap;
  };
  /** G1.5 deep panel: the shape's stroke colour, width, dash, caps and joins. */
  const strokeContent = () => {
    const layer = selected();
    const shape = layer ? shapeOf(layer) : null;
    if (!layer || !shape) return null;
    const compositionId = session.source.composition.id;
    const shapeRun = (label: string, key: ShapeKey, value: number | string) =>
      run(label, [
        shapeStyleCommand(compositionId, selected() ?? layer, key, value),
      ]);
    const wrap = document.createElement('div');
    wrap.className = 'side-panel-form';
    wrap.append(
      field(
        'panel-stroke-width',
        t('toolbar.strokeWidth'),
        round(shape.strokeWidth, 2),
        (value) => shapeRun('Set stroke width', 'strokeWidth', value),
        'px',
        '',
        { min: 0, max: 200, slider: true, presets: [0, 1, 2, 4, 8, 16] },
      ),
      select(
        'dash',
        t('toolbar.dash'),
        STROKE_DASHES.map((dash) => [dash, t(`shape.dash.${dash}`)] as const),
        shape.dash,
        (value) => shapeRun('Set stroke dash', 'strokeDash', value),
      ),
      select(
        'cap',
        t('toolbar.cap'),
        STROKE_CAPS.map((cap) => [cap, t(`shape.cap.${cap}`)] as const),
        shape.cap,
        (value) => shapeRun('Set stroke caps', 'strokeCap', value),
      ),
      select(
        'join',
        t('toolbar.join'),
        STROKE_JOINS.map((join) => [join, t(`shape.join.${join}`)] as const),
        shape.join,
        (value) => shapeRun('Set stroke joins', 'strokeJoin', value),
      ),
    );
    return wrap;
  };
  // D-031 pattern: a focused field commits on blur, which re-renders; blur it
  // first and drop this render if that commit already re-rendered.
  let renders = 0;
  const render = () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && bar.contains(active)) {
      const before = renders;
      active.blur();
      if (renders !== before) return;
    }
    renders++;
    const layer = selected();
    const kind = toolbarKind(layer);
    bar.hidden = !kind;
    bar.dataset.kind = kind ?? '';
    if (!layer || !kind) {
      bar.replaceChildren();
      return;
    }
    const compositionId = session.source.composition.id;
    const [sx, sy] = layer.transform.scale.value;
    const opacity = layer.transform.opacity.value;
    const colorOf = (key: string) => {
      const property = layer.properties[key];
      return property?.type === 'color'
        ? property.value.slice(0, 7)
        : '#000000';
    };
    const drawing = drawingOf(layer);
    const shape = shapeOf(layer);
    const shapeCommand = (key: ShapeKey, value: number | string | boolean) =>
      shapeStyleCommand(compositionId, selected() ?? layer, key, value);
    const controls = LAYOUT[kind].map((id) => {
      if (LATER[id]) return later(id);
      switch (id) {
        case 'animate': {
          const item = button(id, t('toolbar.animate'), 'animate', () =>
            animate?.(),
          );
          item.disabled = !animate;
          item.setAttribute('aria-haspopup', 'dialog');
          return item;
        }
        case 'position': {
          const item = button(id, t('toolbar.position'), 'layers', () =>
            position?.(),
          );
          item.disabled = !position;
          item.setAttribute('aria-haspopup', 'dialog');
          return item;
        }
        case 'x':
        case 'y':
          return field(
            id,
            t(id === 'x' ? 'toolbar.x' : 'toolbar.y'),
            round(layer.transform.position.value[id === 'x' ? 0 : 1]),
            (value) => edit(id === 'x' ? 'Position X' : 'Position Y', value),
          );
        case 'scale':
          return field(
            id,
            t('toolbar.scale'),
            round(Math.abs(sx) * 100, 1),
            (value) => {
              if (!(value > 0)) throw new RangeError(t('toolbar.scaleRange'));
              const factor = value / 100 / Math.abs(sx);
              run(
                'Set scale',
                buildTransformCommands(
                  compositionId,
                  layer,
                  {
                    ...(layer.transform as TransformValues),
                    scale: { value: [sx * factor, sy * factor] },
                  },
                  undefined,
                  session.currentTime,
                ),
              );
            },
            '%',
            '',
            { min: 1, max: 10000, presets: [25, 50, 100, 150, 200] },
          );
        case 'rotate':
          return field(
            id,
            t('toolbar.rotate'),
            round(layer.transform.rotation.value, 2),
            (value) => edit('Rotation', value),
            '°',
            '',
            { min: -360, max: 360, slider: true, presets: [0, 45, 90, 180] },
          );
        case 'opacity':
          return field(
            id,
            t('toolbar.opacity'),
            round(opacity * 100, 1),
            (value) => {
              if (!(value >= 0 && value <= 100))
                throw new RangeError(t('toolbar.opacityRange'));
              edit('Opacity', value / 100);
            },
            '%',
            '',
            { min: 0, max: 100, slider: true, presets: [0, 25, 50, 75, 100] },
          );
        case 'flip': {
          const group = document.createElement('div');
          group.className = 'toolbar-group';
          for (const axis of ['horizontal', 'vertical'] as const)
            group.append(
              button(
                `flip-${axis}`,
                t(axis === 'horizontal' ? 'toolbar.flipH' : 'toolbar.flipV'),
                axis === 'horizontal' ? 'flipH' : 'flipV',
                () => {
                  const bounds = selectionBounds(
                    session.source,
                    layer.id,
                  )?.bounds;
                  if (!bounds) return;
                  run(
                    axis === 'horizontal' ? 'Flip horizontal' : 'Flip vertical',
                    buildTransformCommands(
                      compositionId,
                      layer,
                      flipTransform(
                        layer.transform as TransformValues,
                        [
                          bounds.x + bounds.width / 2,
                          bounds.y + bounds.height / 2,
                        ],
                        axis,
                      ),
                      undefined,
                      session.currentTime,
                    ),
                  );
                },
              ),
            );
          return group;
        }
        case 'fill-opacity': {
          const item = field(
            id,
            t('toolbar.fillOpacity'),
            percent(shape?.fillOpacity ?? 1),
            (value) =>
              run('Set fill opacity', [
                shapeCommand('fillOpacity', value / 100),
              ]),
            '%',
            '',
            { min: 0, max: 100, slider: true, presets: [0, 25, 50, 75, 100] },
          );
          item.querySelector('input')!.disabled = !shape?.fill;
          return item;
        }
        case 'no-fill': {
          const none = !!shape && !shape.fill;
          const item = button(id, t('toolbar.noFill'), 'noFill', () =>
            run(none ? 'Show fill' : 'Remove fill', [
              shapeCommand('fillEnabled', none),
            ]),
          );
          item.setAttribute('aria-pressed', String(none));
          item.disabled =
            !shape || shape.kind === 'line' || shape.kind === 'arrow';
          return item;
        }
        case 'stroke':
          return colorField(
            id,
            t('toolbar.stroke'),
            shape?.stroke ?? colorOf('stroke'),
            (value) => {
              // A stroke color on a shape with no stroke also gives it a width.
              run('Set stroke', [
                shapeCommand('stroke', value),
                shape && !shape.strokeWidth
                  ? shapeCommand('strokeWidth', 4)
                  : null,
              ]);
            },
          );
        case 'width':
          return field(
            id,
            t('toolbar.strokeWidth'),
            round(shape?.strokeWidth ?? 0, 2),
            (value) =>
              run('Set stroke width', [shapeCommand('strokeWidth', value)]),
            'px',
            '',
            { min: 0, max: 200, slider: true, presets: [0, 1, 2, 4, 8, 16] },
          );
        case 'stroke-style': {
          const item = button(
            id,
            t('toolbar.strokeStyle'),
            'strokeStyle',
            () =>
              panels?.openId === 'stroke-style'
                ? panels.close()
                : panels?.show(
                    'stroke-style',
                    t('toolbar.strokeStyle'),
                    strokeContent,
                  ),
          );
          item.disabled = !panels;
          item.setAttribute('aria-haspopup', 'dialog');
          item.setAttribute(
            'aria-expanded',
            String(panels?.openId === 'stroke-style'),
          );
          return item;
        }
        case 'corners': {
          const item = field(
            id,
            t('toolbar.corners'),
            round(shape?.radius ?? 0, 2),
            (value) =>
              run('Set corner radius', [shapeCommand('cornerRadius', value)]),
          );
          item.querySelector('input')!.disabled = shape?.kind !== 'rectangle';
          return item;
        }
        case 'boolean': {
          // SHP-015 works on two or more shapes, so it lives in the canvas
          // menu's Combine shapes submenu; this button says how to reach it.
          const item = button(id, t('toolbar.boolean'), 'combine');
          item.setAttribute('aria-disabled', 'true');
          item.title = t('shape.combineHint');
          item.setAttribute(
            'aria-label',
            `${t('toolbar.boolean')}: ${t('shape.combineHint')}`,
          );
          return item;
        }
        case 'font':
          return select(
            id,
            t('toolbar.font'),
            SYSTEM_FONTS.map(([name]) => [name, name] as const),
            textStyleOf(layer).family,
            (value) =>
              run(
                'Set font',
                textStyleCommands(compositionId, layer, 'fontFamily', value),
              ),
            true,
          );
        case 'weight':
          return select(
            id,
            t('toolbar.weight'),
            FONT_WEIGHTS.map(
              (weight) => [String(weight), t(`text.weight${weight}`)] as const,
            ),
            String(textStyleOf(layer).weight),
            (value) =>
              run(
                'Set font weight',
                textStyleCommands(
                  compositionId,
                  layer,
                  'fontWeight',
                  Number(value),
                ),
              ),
          );
        case 'italic': {
          const italic = textStyleOf(layer).italic;
          const item = button(id, t('toolbar.italic'), 'italic', () =>
            run(
              'Set italic',
              textStyleCommands(
                compositionId,
                layer,
                'fontStyle',
                italic ? 'normal' : 'italic',
              ),
            ),
          );
          item.setAttribute('aria-pressed', String(italic));
          return item;
        }
        case 'align':
          return select(
            id,
            t('toolbar.textAlign'),
            TEXT_ALIGNS.map(
              (align) => [align, t(`text.align.${align}`)] as const,
            ),
            textStyleOf(layer).align,
            (value) =>
              run(
                'Set text alignment',
                textStyleCommands(compositionId, layer, 'textAlign', value),
              ),
          );
        case 'spacing': {
          const item = button(id, t('toolbar.spacing'), 'spacing', () => {
            if (spacingPopover) return spacingPopover.close();
            const content = spacingContent();
            if (!content) return;
            spacingPopover = openPopover(item, content, {
              label: t('toolbar.spacing'),
              className: 'toolbar-popover',
              onClose: () => {
                spacingPopover = null;
              },
            });
          });
          item.setAttribute('aria-haspopup', 'dialog');
          item.setAttribute('aria-expanded', String(!!spacingPopover));
          return item;
        }
        case 'size': {
          const size = layer.properties.fontSize;
          return field(
            id,
            t('toolbar.size'),
            round(size?.type === 'number' ? size.value : 32, 2),
            (value) =>
              run('Set text size', [
                fontSizeCommand(
                  compositionId,
                  layer,
                  value,
                  session.currentTime,
                ),
              ]),
          );
        }
        case 'color':
        case 'fill': {
          const item = colorField(
            id,
            t(id === 'fill' ? 'toolbar.fill' : 'toolbar.color'),
            // A shape with No fill shows the empty swatch.
            shape && !shape.fill && id === 'fill'
              ? null
              : colorOf(kind === 'drawing' ? 'stroke' : 'fill'),
            (value) =>
              run('Set color', [
                colorCommand(
                  compositionId,
                  selected() ?? layer,
                  value,
                  session.currentTime,
                ),
                // Picking a colour for a shape with No fill turns fill back on.
                shape && !shape.fill && id === 'fill'
                  ? shapeCommand('fillEnabled', true)
                  : null,
              ]),
            id === 'fill' && shape
              ? () => run('Remove fill', [shapeCommand('fillEnabled', false)])
              : undefined,
          );
          // Lines and arrows have no fill; their color is the stroke.
          if (shape && (shape.kind === 'line' || shape.kind === 'arrow'))
            item.querySelector('button')!.disabled = true;
          return item;
        }
        case 'brush':
          return field(
            id,
            t('toolbar.brushSize'),
            round(drawing && drawing !== 'invalid' ? drawing.width : 0, 2),
            (value) =>
              run(
                'Set brush size',
                brushSizeCommands(compositionId, layer, value),
              ),
          );
      }
      throw new Error(`Unknown toolbar control ${id}`);
    });
    bar.replaceChildren(...controls);
    restoreFieldFocus(bar);
    refreshAttached(layer);
  };
  render();
  return { render };
}

/** Formats a percentage for display (no raw floats in the UI). */
export const percent = (value: number) => formatNumber(Math.round(value * 100));
