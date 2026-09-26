import {
  boundsCorners,
  invertMatrix,
  multiplyMatrices,
  rotationHandlePoint,
  handlePoint,
  resizeCursorAxis,
  selectionHandleMatrix,
  type Edge,
  transformPoint,
  worldTransform,
  type AffineMatrix,
  type Corner,
  type Point2,
  type TransformBounds,
} from '../core';
import {
  deriveRenderItems,
  layerSize,
  locateLayer,
  type RenderSource,
} from './adapter';
import { transformCapabilities } from './transform-capabilities';

export function selectionBounds(
  source: RenderSource,
  id: string,
): { bounds: TransformBounds; matrix: AffineMatrix } | null {
  const found = locateLayer(source.composition.layers, id);
  if (!found) return null;
  try {
    const matrix = worldTransform(
      source.composition,
      id,
      source.previews ?? source.preview,
    ).matrix;
    const size = layerSize(found.layer, source.assets, source.preview);
    if (size)
      return {
        matrix,
        bounds: { x: 0, y: 0, width: size.width, height: size.height },
      };
    const inverse = invertMatrix(matrix);
    if (!inverse) return null;
    // Bounds are the resting geometry: animation presets never move handles (D-072).
    const points = deriveRenderItems({ ...source, animate: false })
      .items.filter((item) => item.ancestors.includes(id))
      .flatMap((item) =>
        boundsCorners({ x: 0, y: 0, ...item.size }).map((point) =>
          transformPoint(multiplyMatrices(inverse, item.matrix), point),
        ),
      );
    if (!points.length) return null;
    const xs = points.map((point) => point[0]),
      ys = points.map((point) => point[1]);
    const x = Math.min(...xs),
      y = Math.min(...ys);
    return {
      matrix,
      bounds: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y },
    };
  } catch {
    return null;
  }
}
export function selectionGeometry(
  source: RenderSource,
  id: string | null,
  view: AffineMatrix,
) {
  if (!id) return null;
  if (
    source.currentTime !== undefined &&
    !deriveRenderItems(source).items.some(
      (item) => item.id === id || item.ancestors.includes(id),
    )
  )
    return null;
  const selected = selectionBounds(source, id);
  if (!selected) return null;
  try {
    const matrix = multiplyMatrices(view, selected.matrix);
    const corners = boundsCorners(selected.bounds).map((point) =>
      transformPoint(matrix, point),
    );
    const center: Point2 = [
      (corners[0]![0] + corners[2]![0]) / 2,
      (corners[0]![1] + corners[2]![1]) / 2,
    ];
    const top: Point2 = [
      (corners[0]![0] + corners[1]![0]) / 2,
      (corners[0]![1] + corners[1]![1]) / 2,
    ];
    const layer = locateLayer(source.composition.layers, id)!.layer;
    const capabilities = transformCapabilities(layer.type, source.capabilities);
    const interactive =
      !!invertMatrix(selected.matrix) &&
      selected.bounds.width > 0 &&
      selected.bounds.height > 0;
    const rotation = rotationHandlePoint(top, corners[1]!, center, 34);
    const handles: SelectionHandle[] = [];
    const add = (
      id: TransformHandle,
      point: Point2,
      kind: SelectionHandle['kind'],
    ) =>
      handles.push({
        id,
        point,
        kind,
        matrix: selectionHandleMatrix(matrix, point),
        radius: kind === 'rotate' ? 12 : 10,
        cursor:
          kind === 'rotate'
            ? 'grab'
            : ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][
                resizeCursorAxis(center, point)
              ]!,
      });
    if (interactive) {
      if (capabilities.rotate) add('rotate', rotation, 'rotate');
      if (capabilities.corners)
        corners.forEach((point, index) =>
          add(index as Corner, point, 'corner'),
        );
      if (capabilities.edges)
        for (const edge of ['top', 'right', 'bottom', 'left'] as const)
          add(
            edge,
            transformPoint(matrix, handlePoint(selected.bounds, edge)),
            'edge',
          );
      if (capabilities.textWidth)
        for (const side of ['left', 'right'] as const)
          add(
            `text-${side}`,
            transformPoint(matrix, handlePoint(selected.bounds, side)),
            'text-width',
          );
    }
    return {
      ...selected,
      corners,
      top,
      rotation,
      center,
      handles,
      capabilities,
      anchor: transformPoint(matrix, [0, 0]),
      interactive,
    };
  } catch {
    return null;
  }
}
/**
 * W2-F1 (CV-040): the outer box of a multi-selection, axis-aligned in view
 * space around every selected item's own box. Null for fewer than two items.
 */
export function multiSelectionBox(
  source: RenderSource,
  view: AffineMatrix,
): { corners: readonly Point2[]; center: Point2 } | null {
  const ids = source.selectedIds ?? [];
  if (ids.length < 2) return null;
  const points = ids.flatMap(
    (id) => selectionGeometry(source, id, view)?.corners ?? [],
  );
  if (!points.length) return null;
  const xs = points.map((point) => point[0]),
    ys = points.map((point) => point[1]);
  const left = Math.min(...xs),
    top = Math.min(...ys),
    right = Math.max(...xs),
    bottom = Math.max(...ys);
  return {
    corners: [
      [left, top],
      [right, top],
      [right, bottom],
      [left, bottom],
    ],
    center: [(left + right) / 2, (top + bottom) / 2],
  };
}
export type TransformHandle =
  Corner | Edge | 'rotate' | 'text-left' | 'text-right';
export interface SelectionHandle {
  readonly id: TransformHandle;
  readonly point: Point2;
  readonly kind: 'corner' | 'edge' | 'rotate' | 'text-width';
  readonly radius: number;
  readonly matrix: AffineMatrix;
  readonly cursor: string;
}
export type SelectionOverlay = NonNullable<
  ReturnType<typeof selectionGeometry>
>;
export function hitHandle(
  source: RenderSource,
  id: string | null,
  view: AffineMatrix,
  point: Point2,
): TransformHandle | null {
  if (!point.every(Number.isFinite)) return null;
  // Overlay order is the shared rotation > resize > text-width priority.
  return (
    selectionGeometry(source, id, view)?.handles.find(
      (handle) =>
        Math.hypot(point[0] - handle.point[0], point[1] - handle.point[1]) <=
        handle.radius,
    )?.id ?? null
  );
}
