// H3: the canvas menu's object actions that are not plain edits (Canva):
// Lock (CV-024), Set image as background, Alternative text, Info and Resize
// canvas to selection. Each change is one undo step through the Command Bus.
import type { Command, EditorEngine } from '../core';
import { formatNumber, t } from '../i18n';
import { layerSize, locateLayer, type SceneLayer } from '../render/adapter';
import { selectionBounds } from '../render/selection';
import { transformPoint } from '../core';
import { layerGeometry } from './geometry';
import type { RenderSource } from '../render/adapter';
import { isLocked } from '../render/transform-capabilities';
import { canvasSizeCommands, shiftLayerCommand } from './canvas-size';
import { selectionRoots } from './selection-context';
import type { EditorSession } from './session';
import { buildTransformCommands } from './transform-commands';

const plain = <T extends 'boolean' | 'string'>(
  type: T,
  value: T extends 'boolean' ? boolean : string,
) => ({ type, value, animated: false, keyframes: [], constraints: [] });
const propertyCommand = (
  compositionId: string,
  layerId: string,
  key: string,
  property: object,
): Command =>
  ({
    type: 'SET_PROPERTY',
    compositionId,
    layerId,
    target: { kind: 'property', key },
    property,
  }) as Command;

/** The axis-aligned box a layer covers in the composition (drawn size). */
export function worldBox(
  source: RenderSource,
  id: string,
): { x: number; y: number; width: number; height: number } | null {
  const selected = selectionBounds(source, id);
  if (!selected) return null;
  const { bounds, matrix } = selected;
  const points = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x + bounds.width, bounds.y + bounds.height],
    [bounds.x, bounds.y + bounds.height],
  ].map((point) => transformPoint(matrix, point as [number, number]));
  const xs = points.map((point) => point[0]),
    ys = points.map((point) => point[1]);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** True when every selected layer is locked. */
export const selectionLocked = (session: EditorSession) => {
  const roots = selectionRoots(session.source, session.selectedIds);
  return roots.length > 0 && roots.every(isLocked);
};

/** CV-024: locks or unlocks every selected layer, one undo step. */
export function setLocked(
  engine: EditorEngine,
  session: EditorSession,
  locked: boolean,
): void {
  const compositionId = session.source.composition.id;
  const commands = selectionRoots(session.source, session.selectedIds)
    .filter((layer) => isLocked(layer) !== locked)
    .map((layer) =>
      propertyCommand(
        compositionId,
        layer.id,
        'locked',
        plain('boolean', locked),
      ),
    );
  if (commands.length)
    engine.commands.transaction(locked ? 'Lock' : 'Unlock', commands);
}

const single = (session: EditorSession): SceneLayer | null =>
  session.selectedIds.length === 1 && session.selectedId
    ? (locateLayer(session.source.composition.layers, session.selectedId)
        ?.layer ?? null)
    : null;

/** A top-level picture or video that is not locked can become the background. */
export function canSetBackground(session: EditorSession): boolean {
  const layer = single(session);
  if (!layer || (layer.type !== 'image' && layer.type !== 'video'))
    return false;
  const found = locateLayer(session.source.composition.layers, layer.id);
  return !found?.parent && !isLocked(layer);
}
/**
 * Canva's "Set image as background": the picture covers the whole canvas
 * (centred, unrotated, aspect kept) and goes to the back, one undo step.
 */
export function setAsBackground(
  engine: EditorEngine,
  session: EditorSession,
): void {
  const layer = single(session);
  if (!layer || !canSetBackground(session)) return;
  const source = session.source;
  const size = layerSize(layer, source.assets);
  if (!size || size.width <= 0 || size.height <= 0) return;
  const { width, height, id: compositionId } = source.composition;
  const scale = Math.max(width / size.width, height / size.height);
  const commands: Command[] = [
    ...buildTransformCommands(
      compositionId,
      layer,
      {
        position: {
          value: [
            (width - size.width * scale) / 2,
            (height - size.height * scale) / 2,
          ],
        },
        scale: { value: [scale, scale] },
        rotation: { value: 0 },
        opacity: { value: layer.transform.opacity.value },
      },
      undefined,
      session.currentTime,
    ),
  ];
  if (source.composition.layers[0]?.id !== layer.id)
    commands.push({
      type: 'MOVE_LAYER',
      compositionId,
      layerId: layer.id,
      parentId: null,
      index: 0,
    } as Command);
  if (commands.length)
    engine.commands.transaction('Set image as background', commands);
}

/** The selected layer's alternative text (images, video, shapes, text). */
export const altTextOf = (layer: SceneLayer): string =>
  layer.properties.altText?.type === 'string'
    ? layer.properties.altText.value
    : '';
export const ALT_TEXT_LIMIT = 500;
export function setAltText(
  engine: EditorEngine,
  session: EditorSession,
  text: string,
): void {
  const layer = single(session);
  if (!layer) return;
  const value = text.trim();
  if (value.length > ALT_TEXT_LIMIT)
    throw new RangeError(t('altText.tooLong', { limit: ALT_TEXT_LIMIT }));
  if (value === altTextOf(layer)) return;
  engine.commands.transaction('Set alternative text', [
    propertyCommand(
      session.source.composition.id,
      layer.id,
      'altText',
      plain('string', value),
    ),
  ]);
}

/** Info: what the selected layer is, its drawn size and its media. */
export function layerInfo(session: EditorSession): string[] {
  const layer = single(session);
  if (!layer) return [];
  const bounds = layerGeometry(session.source, layer.id);
  const asset = session.source.assets.find((item) => item.id === layer.assetId);
  return [
    t('info.name', { name: layer.name }),
    t('info.type', { type: t(`info.kind.${layer.type}`) }),
    ...(bounds
      ? [
          t('info.size', {
            width: formatNumber(Math.round(bounds.width)),
            height: formatNumber(Math.round(bounds.height)),
          }),
        ]
      : []),
    ...(asset ? [t('info.media', { name: asset.name })] : []),
    ...(isLocked(layer) ? [t('info.locked')] : []),
  ];
}

/**
 * Canva's "Resize canvas to selection": this scene gets the selection's size
 * (whole pixels) and its layers move together so the selection fills it.
 * Other scenes keep their own size (J1). One undo step.
 */
/** J6: the whole-pixel size Resize canvas to selection would give. */
export function selectionSize(
  session: EditorSession,
): { width: number; height: number } | null {
  const boxes = session.selectedIds
    .map((id) => worldBox(session.source, id))
    .filter((box): box is NonNullable<typeof box> => !!box);
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((box) => box.x)),
    top = Math.min(...boxes.map((box) => box.y)),
    right = Math.max(...boxes.map((box) => box.x + box.width)),
    bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return {
    width: Math.max(16, Math.round(right - left)),
    height: Math.max(16, Math.round(bottom - top)),
  };
}
export function resizeCanvasToSelection(
  engine: EditorEngine,
  session: EditorSession,
): boolean {
  const source = session.source;
  const boxes = session.selectedIds
    .map((id) => worldBox(source, id))
    .filter((box): box is NonNullable<typeof box> => !!box);
  if (!boxes.length) return false;
  const left = Math.min(...boxes.map((box) => box.x)),
    top = Math.min(...boxes.map((box) => box.y)),
    right = Math.max(...boxes.map((box) => box.x + box.width)),
    bottom = Math.max(...boxes.map((box) => box.y + box.height));
  const width = Math.max(16, Math.round(right - left)),
    height = Math.max(16, Math.round(bottom - top));
  const current = source.composition.id;
  const commands = canvasSizeCommands(engine.state, current, width, height);
  const composition = engine.state.compositions.find(
    (item) => item.id === current,
  )!;
  for (const layer of composition.layers as readonly SceneLayer[]) {
    const command = shiftLayerCommand(current, layer, -left, -top);
    if (command) commands.push(command);
  }
  if (!commands.length) return false;
  engine.commands.transaction('Resize canvas to selection', commands);
  return true;
}
