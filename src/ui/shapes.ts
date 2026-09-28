// W5-D shapes: adding shapes from the Elements panel (SHP-001), editing
// their fill, stroke and corners (SHP-003, SHP-005, SHP-006), and combining
// closed shapes with boolean operations (SHP-015).
import clipping from 'polygon-clipping';
import {
  createLayer,
  findClipByLayer,
  number,
  propertySchema,
  vector2,
  type Command,
  type EditorEngine,
} from '../core';
import { t } from '../i18n';
import {
  deriveRenderItems,
  type RenderSource,
  type SceneLayer,
} from '../render/adapter';
import {
  MAX_RADIUS,
  MAX_STROKE,
  STROKE_CAPS,
  STROKE_DASHES,
  STROKE_JOINS,
  formatPolygons,
  isClosedKind,
  shapeOf,
  shapePolygons,
  type MultiPolygon,
  type ShapeKind,
} from '../render/shapes';
import { DRAWING_DURATION } from './draw-tool';
import { iconSvg } from './icons';
import { trackForNewClip } from './editing';
import { describeSelection, selectionRoots } from './selection-context';
import type { EditorSession } from './session';

/** The Elements panel's shapes: kind, size and corner radius. */
export const SHAPE_PRESETS = {
  rectangle: { kind: 'rectangle', width: 240, height: 160, radius: 0 },
  rounded: { kind: 'rectangle', width: 240, height: 160, radius: 32 },
  ellipse: { kind: 'ellipse', width: 200, height: 200, radius: 0 },
  line: { kind: 'line', width: 240, height: 24, radius: 0 },
  arrow: { kind: 'arrow', width: 240, height: 36, radius: 0 },
} as const satisfies Record<
  string,
  { kind: ShapeKind; width: number; height: number; radius: number }
>;
export type ShapePreset = keyof typeof SHAPE_PRESETS;
export const DEFAULT_SHAPE_FILL = '#8b6cff';
export const DEFAULT_LINE_COLOR = '#272b29';

const property = <T extends 'string' | 'color' | 'boolean'>(
  type: T,
  value: T extends 'boolean' ? boolean : string,
) => ({
  type,
  value,
  animated: false,
  keyframes: [],
  constraints: [],
});

/** Adds a shape centered on the canvas with a clip at the playhead. */
export function addShapeCommands(
  source: RenderSource,
  preset: ShapePreset,
  time: number,
): Command[] {
  const composition = source.composition;
  const spec = SHAPE_PRESETS[preset];
  const name = t(`shape.${preset}`);
  const layer = createLayer(
    crypto.randomUUID(),
    'shape',
    name,
    DRAWING_DURATION,
  );
  layer.startTime = time;
  layer.transform.position = vector2(
    (composition.width - spec.width) / 2,
    (composition.height - spec.height) / 2,
  );
  const open = !isClosedKind(spec.kind);
  layer.properties = {
    width: number(spec.width),
    height: number(spec.height),
    shapeKind: property('string', spec.kind),
    ...(open
      ? {
          stroke: property('color', DEFAULT_LINE_COLOR),
          strokeWidth: number(6),
        }
      : { fill: property('color', DEFAULT_SHAPE_FILL) }),
    ...(spec.radius ? { cornerRadius: number(spec.radius) } : {}),
  } as never;
  const target = trackForNewClip(
    composition,
    'shape',
    time,
    time + DRAWING_DURATION,
  );
  return [
    ...target.commands,
    {
      type: 'CREATE_LAYER',
      compositionId: composition.id,
      parentId: null,
      layer,
    },
    {
      type: 'CREATE_CLIP',
      compositionId: composition.id,
      trackId: target.trackId,
      clip: {
        id: crypto.randomUUID(),
        name,
        layerId: layer.id,
        assetId: null,
        startTime: time,
        duration: DRAWING_DURATION,
        sourceIn: 0,
        sourceOut: DRAWING_DURATION,
        enabled: true,
        speed: 1,
        transitionMetadata: {},
        effectMetadata: {},
        metadata: {},
      },
    },
  ];
}

export function addShape(
  engine: EditorEngine,
  session: EditorSession,
  preset: ShapePreset,
): void {
  const commands = addShapeCommands(
    session.source,
    preset,
    session.currentTime,
  );
  engine.commands.transaction('Add shape', commands);
  const created = commands.find((command) => command.type === 'CREATE_LAYER');
  if (created?.type === 'CREATE_LAYER') session.select(created.layer.id);
}

/** Shape style properties the toolbar edits, with their checks. */
const SHAPE_KEYS = {
  fillOpacity: (value: unknown) =>
    typeof value === 'number' && value >= 0 && value <= 1,
  fillEnabled: (value: unknown) => typeof value === 'boolean',
  stroke: (value: unknown) =>
    typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value),
  strokeWidth: (value: unknown) =>
    typeof value === 'number' && value >= 0 && value <= MAX_STROKE,
  strokeDash: (value: unknown) =>
    (STROKE_DASHES as readonly unknown[]).includes(value),
  strokeCap: (value: unknown) =>
    (STROKE_CAPS as readonly unknown[]).includes(value),
  strokeJoin: (value: unknown) =>
    (STROKE_JOINS as readonly unknown[]).includes(value),
  cornerRadius: (value: unknown) =>
    typeof value === 'number' && value >= 0 && value <= MAX_RADIUS,
} as const;
export type ShapeKey = keyof typeof SHAPE_KEYS;
const SHAPE_KEY_TYPES: Record<
  ShapeKey,
  'number' | 'color' | 'string' | 'boolean'
> = {
  fillOpacity: 'number',
  fillEnabled: 'boolean',
  stroke: 'color',
  strokeWidth: 'number',
  strokeDash: 'string',
  strokeCap: 'string',
  strokeJoin: 'string',
  cornerRadius: 'number',
};

/** One shape style property, or null when unchanged or not applicable. */
export function shapeStyleCommand(
  compositionId: string,
  layer: SceneLayer,
  key: ShapeKey,
  value: number | string | boolean,
): Command | null {
  const shape = shapeOf(layer);
  if (!shape) return null;
  if (!SHAPE_KEYS[key](value)) throw new RangeError(t('toolbar.shapeRange'));
  if (key === 'cornerRadius' && shape.kind !== 'rectangle') return null;
  const current = layer.properties[key];
  if (current && current.value === value) return null;
  const type = SHAPE_KEY_TYPES[key];
  const base =
    current && current.type === type
      ? propertySchema.parse(current as unknown)
      : type === 'number'
        ? number(0)
        : property(type as 'string', '');
  return {
    type: 'SET_PROPERTY',
    compositionId,
    layerId: layer.id,
    target: { kind: 'property', key },
    property: { ...base, value },
  } as Command;
}

/** The source without a playhead, so shapes outside it are laid out too. */
const timeless = (source: RenderSource): RenderSource => {
  const copy: { -readonly [K in keyof RenderSource]: RenderSource[K] } = {
    ...source,
  };
  delete copy.currentTime;
  return copy;
};

export const BOOLEAN_OPS = [
  'union',
  'subtract',
  'intersect',
  'exclude',
] as const;
export type BooleanOp = (typeof BOOLEAN_OPS)[number];
const BOOLEAN_LABELS: Record<BooleanOp, string> = {
  union: 'Union shapes',
  subtract: 'Subtract shapes',
  intersect: 'Intersect shapes',
  exclude: 'Exclude shapes',
};

/** Two or more top-level closed shapes, each with a clip. */
export function canCombine(source: RenderSource, ids: readonly string[]) {
  const roots = selectionRoots(source, ids);
  return (
    roots.length >= 2 &&
    roots.length === ids.length &&
    describeSelection(source, ids).every('closed-shape') &&
    describeSelection(source, ids).every('clip') &&
    roots.every((layer) =>
      source.composition.layers.some((item) => item.id === layer.id),
    )
  );
}

/**
 * Replaces the selected shapes with one shape outlining the result. It takes
 * the bottom-most shape's style, place in the stack, track and timing;
 * Subtract removes every other shape from the bottom-most one.
 */
export function booleanCommands(
  source: RenderSource,
  ids: readonly string[],
  op: BooleanOp,
): Command[] {
  if (!canCombine(source, ids)) throw new Error(t('shape.combineNeeds'));
  const composition = source.composition;
  const selected = new Set(ids);
  const ordered = composition.layers.filter((layer) => selected.has(layer.id));
  const items = new Map(
    deriveRenderItems(timeless(source)).items.map((item) => [item.id, item]),
  );
  const geometry = ordered.map((layer) => {
    const item = items.get(layer.id);
    const polygons =
      item?.shape &&
      shapePolygons(item.shape, item.size.width, item.size.height, item.matrix);
    if (!polygons) throw new Error(t('shape.combineNeeds'));
    return polygons as unknown as clipping.MultiPolygon;
  });
  const [first, ...rest] = geometry as [
    clipping.MultiPolygon,
    ...clipping.MultiPolygon[],
  ];
  const result =
    op === 'union'
      ? clipping.union(first, ...rest)
      : op === 'subtract'
        ? clipping.difference(first, ...rest)
        : op === 'intersect'
          ? clipping.intersection(first, ...rest)
          : clipping.xor(first, ...rest);
  const points = result.flat(2);
  if (!points.length) throw new Error(t('shape.combineEmpty'));
  const xs = points.map((point) => point[0]),
    ys = points.map((point) => point[1]);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  const width = Math.max(...xs) - x,
    height = Math.max(...ys) - y;
  if (!(width > 0 && height > 0)) throw new Error(t('shape.combineEmpty'));
  const local: MultiPolygon = result.map((polygon) =>
    polygon.map((ring) => ring.map(([px, py]) => [px - x, py - y] as const)),
  );
  const bottom = ordered[0]!;
  const clip = findClipByLayer(composition, bottom.id)!;
  const layer = createLayer(
    crypto.randomUUID(),
    'shape',
    t(`shape.${op}Name`),
    clip.clip.duration,
  );
  layer.startTime = clip.clip.startTime;
  layer.transform.position = vector2(x, y);
  layer.transform.opacity = number(bottom.transform.opacity.value);
  const copied = Object.fromEntries(
    [
      'fill',
      'fillOpacity',
      'fillEnabled',
      'stroke',
      'strokeWidth',
      'strokeDash',
      'strokeCap',
      'strokeJoin',
    ].flatMap((key) =>
      bottom.properties[key]
        ? [[key, propertySchema.parse(bottom.properties[key] as unknown)]]
        : [],
    ),
  );
  layer.properties = {
    ...copied,
    width: number(width),
    height: number(height),
    shapeKind: property('string', 'path'),
    polygon: property('string', formatPolygons(local)),
  } as never;
  const index = composition.layers
    .slice(
      0,
      composition.layers.findIndex((item) => item.id === bottom.id),
    )
    .filter((item) => !selected.has(item.id)).length;
  return [
    ...ordered.map((item): Command => ({
      type: 'DELETE_LAYER',
      compositionId: composition.id,
      layerId: item.id,
    })),
    {
      type: 'CREATE_LAYER',
      compositionId: composition.id,
      parentId: null,
      index,
      layer,
    } as Command,
    {
      type: 'CREATE_CLIP',
      compositionId: composition.id,
      trackId: clip.track.id,
      clip: {
        id: crypto.randomUUID(),
        name: layer.name,
        layerId: layer.id,
        assetId: null,
        startTime: clip.clip.startTime,
        duration: clip.clip.duration,
        sourceIn: 0,
        sourceOut: clip.clip.duration,
        enabled: true,
        speed: 1,
        transitionMetadata: {},
        effectMetadata: {},
        metadata: {},
      },
    },
  ];
}

export function combineShapes(
  engine: EditorEngine,
  session: EditorSession,
  op: BooleanOp,
): void {
  const commands = booleanCommands(session.source, session.selectedIds, op);
  engine.commands.transaction(BOOLEAN_LABELS[op], commands);
  const created = commands.find((command) => command.type === 'CREATE_LAYER');
  if (created?.type === 'CREATE_LAYER') session.select(created.layer.id);
}

/** SHP-001 Elements panel: one button per shape preset. */
export function mountShapesPanel(
  panel: HTMLElement,
  add: (preset: ShapePreset) => void,
) {
  const title = document.createElement('h3');
  title.className = 'draw-title';
  title.textContent = t('shape.title');
  const hint = document.createElement('p');
  hint.className = 'draw-hint';
  hint.textContent = t('shape.hint');
  const grid = document.createElement('div');
  grid.className = 'draw-brushes shape-presets';
  for (const preset of Object.keys(SHAPE_PRESETS) as ShapePreset[]) {
    const item = document.createElement('button');
    item.type = 'button';
    item.dataset.shape = preset;
    item.title = t(`shape.${preset}`);
    item.innerHTML = iconSvg(`shape-${preset}`);
    const label = document.createElement('span');
    label.textContent = t(`shape.${preset}`);
    item.append(label);
    item.onclick = () => add(preset);
    grid.append(item);
  }
  panel.replaceChildren(title, hint, grid);
}
