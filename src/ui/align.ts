// CV-025 align and distribute: world-space deltas converted to each layer's
// parent space, committed as one transaction of ordinary position edits.
import {
  IDENTITY_MATRIX,
  invertMatrix,
  moveTransform,
  transformPoint,
  worldTransform,
  type Command,
  type EditorEngine,
  type Point2,
  type TransformValues,
} from '../core';
import {
  locateLayer,
  type RenderSource,
  type SceneLayer,
} from '../render/adapter';
import { selectionRoots } from './editing';
import type { EditorSession } from './session';
import { unionBox, worldBox, type Box } from './snapping';
import { buildTransformCommands } from './transform-commands';

export const ALIGN_EDGES = [
  'left',
  'center',
  'right',
  'top',
  'middle',
  'bottom',
] as const;
export type AlignEdge = (typeof ALIGN_EDGES)[number];
export type DistributeAxis = 'horizontal' | 'vertical';

interface Placed {
  layer: SceneLayer;
  box: Box;
}
function placed(source: RenderSource, ids: readonly string[]): Placed[] {
  return selectionRoots(source, ids).flatMap((layer) => {
    const box = worldBox(source, layer.id);
    return box ? [{ layer, box }] : [];
  });
}
/** A position edit that moves the layer by a world-space delta. */
function moveBy(
  source: RenderSource,
  layer: SceneLayer,
  delta: Point2,
): Command[] {
  if (delta[0] === 0 && delta[1] === 0) return [];
  const parent = locateLayer(source.composition.layers, layer.id)?.parent;
  const inverse = invertMatrix(
    parent
      ? worldTransform(source.composition, parent.id).matrix
      : IDENTITY_MATRIX,
  );
  if (!inverse)
    throw new Error('Cannot align a layer under a collapsed parent');
  const value = moveTransform(
    layer.transform as TransformValues,
    transformPoint(inverse, [0, 0]),
    transformPoint(inverse, delta),
  );
  return buildTransformCommands(
    source.composition.id,
    layer,
    value,
    undefined,
    source.currentTime,
  );
}

/** One layer aligns to the canvas; several align to their combined bounds unless `toCanvas`. */
export function alignCommands(
  source: RenderSource,
  ids: readonly string[],
  edge: AlignEdge,
  toCanvas: boolean,
): Command[] {
  const items = placed(source, ids);
  if (!items.length) return [];
  const reference =
    toCanvas || items.length === 1
      ? {
          minX: 0,
          minY: 0,
          maxX: source.composition.width,
          maxY: source.composition.height,
        }
      : unionBox(items.map((item) => item.box))!;
  return items.flatMap(({ layer, box }) => {
    const dx =
      edge === 'left'
        ? reference.minX - box.minX
        : edge === 'right'
          ? reference.maxX - box.maxX
          : edge === 'center'
            ? (reference.minX + reference.maxX) / 2 - (box.minX + box.maxX) / 2
            : 0;
    const dy =
      edge === 'top'
        ? reference.minY - box.minY
        : edge === 'bottom'
          ? reference.maxY - box.maxY
          : edge === 'middle'
            ? (reference.minY + reference.maxY) / 2 - (box.minY + box.maxY) / 2
            : 0;
    return moveBy(source, layer, [dx, dy]);
  });
}

/** Three or more layers: the outermost stay, the others get equal gaps. */
export function distributeCommands(
  source: RenderSource,
  ids: readonly string[],
  axis: DistributeAxis,
): Command[] {
  const items = placed(source, ids);
  if (items.length < 3) return [];
  const min = (box: Box) => (axis === 'horizontal' ? box.minX : box.minY);
  const max = (box: Box) => (axis === 'horizontal' ? box.maxX : box.maxY);
  const sorted = [...items].sort(
    (a, b) => min(a.box) + max(a.box) - (min(b.box) + max(b.box)),
  );
  const first = sorted[0]!.box,
    last = sorted.at(-1)!.box;
  const sizes = sorted.reduce(
    (total, item) => total + max(item.box) - min(item.box),
    0,
  );
  const gap = (max(last) - min(first) - sizes) / (sorted.length - 1);
  let cursor = max(first) + gap;
  return sorted.slice(1, -1).flatMap(({ layer, box }) => {
    const shift = cursor - min(box);
    cursor += max(box) - min(box) + gap;
    return moveBy(
      source,
      layer,
      axis === 'horizontal' ? [shift, 0] : [0, shift],
    );
  });
}

export const canDistribute = (session: EditorSession) =>
  selectionRoots(session.source, session.selectedIds).length >= 3;

export function alignSelection(
  engine: EditorEngine,
  session: EditorSession,
  edge: AlignEdge,
): void {
  const commands = alignCommands(
    session.source,
    session.selectedIds,
    edge,
    session.alignToCanvas,
  );
  if (commands.length) engine.commands.transaction('Align layers', commands);
}
export function distributeSelection(
  engine: EditorEngine,
  session: EditorSession,
  axis: DistributeAxis,
): void {
  const commands = distributeCommands(
    session.source,
    session.selectedIds,
    axis,
  );
  if (commands.length)
    engine.commands.transaction('Distribute layers', commands);
}
