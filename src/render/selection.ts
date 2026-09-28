import {
  IDENTITY_MATRIX,
  boundsCorners,
  decomposeMatrix,
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
  type SceneLayer,
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
 * CV-040/CV-041: the frame of a multi-selection as four world corners
 * (top-left, top-right, bottom-right, bottom-left). It is the axis-aligned
 * bounds of every selected item, or the frame being resized or rotated.
 */
export function multiSelectionFrame(
  source: RenderSource,
): readonly Point2[] | null {
  const ids = source.selectedIds ?? [];
  if (ids.length < 2) return null;
  if (source.selectionFrame) return source.selectionFrame;
  const points = ids.flatMap(
    (id) => selectionGeometry(source, id, IDENTITY_MATRIX)?.corners ?? [],
  );
  if (!points.length) return null;
  const xs = points.map((point) => point[0]),
    ys = points.map((point) => point[1]);
  const left = Math.min(...xs),
    top = Math.min(...ys),
    right = Math.max(...xs),
    bottom = Math.max(...ys);
  return [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ];
}

/**
 * CV-041 (revision 6): stretching a multi-selection along one axis is only
 * offered when every selected layer can keep the stretch without a skew,
 * i.e. when each one is straight (axis-aligned) in the composition.
 */
export function multiSelectionStretchable(source: RenderSource): boolean {
  const ids = source.selectedIds ?? [];
  // Stretching text would distort its glyphs; text uses its own width grips.
  const hasText = (layer: SceneLayer): boolean =>
    layer.type === 'text' || layer.children.some(hasText);
  return ids.every((id) => {
    const found = locateLayer(source.composition.layers, id);
    if (!found || hasText(found.layer)) return false;
    try {
      const world = worldTransform(
        source.composition,
        id,
        source.previews ?? source.preview,
      ).matrix;
      const parent = found.parent
        ? worldTransform(
            source.composition,
            found.parent.id,
            source.previews ?? source.preview,
          ).matrix
        : IDENTITY_MATRIX;
      const inverse = invertMatrix(parent);
      if (!inverse) return false;
      return (
        [
          [2, 0, 0, 1, 0, 0],
          [1, 0, 0, 2, 0, 0],
        ] as const
      ).every(
        (stretch) =>
          decomposeMatrix(
            multiplyMatrices(inverse, multiplyMatrices(stretch, world)),
          ) !== null,
      );
    } catch {
      return false;
    }
  });
}

export type MultiHandle = Corner | Edge | 'rotate';

/** CV-040/CV-041: the multi-selection box in view space, with its handles. */
export function multiSelectionGeometry(
  source: RenderSource,
  view: AffineMatrix,
) {
  const frame = multiSelectionFrame(source);
  if (!frame) return null;
  try {
    const corners = frame.map((point) => transformPoint(view, point));
    const mid = (a: Point2, b: Point2): Point2 => [
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
    ];
    const center = mid(corners[0]!, corners[2]!);
    const top = mid(corners[0]!, corners[1]!);
    const along = (a: Point2, b: Point2): [number, number] => {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    };
    const [ux, uy] = along(corners[0]!, corners[1]!),
      [vx, vy] = along(corners[0]!, corners[3]!);
    const orientation: AffineMatrix = [ux, uy, vx, vy, 0, 0];
    const rotation = rotationHandlePoint(top, corners[1]!, center, 34);
    const handles: SelectionHandle[] = [];
    const add = (
      id: MultiHandle,
      point: Point2,
      kind: 'corner' | 'edge' | 'rotate',
    ) =>
      handles.push({
        id,
        point,
        kind,
        matrix: selectionHandleMatrix(orientation, point),
        radius: kind === 'rotate' ? 12 : 10,
        cursor:
          kind === 'rotate'
            ? 'grab'
            : ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][
                resizeCursorAxis(center, point)
              ]!,
      });
    const sized =
      Math.hypot(
        corners[1]![0] - corners[0]![0],
        corners[1]![1] - corners[0]![1],
      ) > 0 &&
      Math.hypot(
        corners[3]![0] - corners[0]![0],
        corners[3]![1] - corners[0]![1],
      ) > 0;
    if (sized) {
      add('rotate', rotation, 'rotate');
      corners.forEach((point, index) => add(index as Corner, point, 'corner'));
      if (!source.selectionFrame && multiSelectionStretchable(source)) {
        add('top', top, 'edge');
        add('right', mid(corners[1]!, corners[2]!), 'edge');
        add('bottom', mid(corners[2]!, corners[3]!), 'edge');
        add('left', mid(corners[3]!, corners[0]!), 'edge');
      }
    }
    return { frame, corners, center, top, rotation, handles };
  } catch {
    return null;
  }
}

export function hitMultiHandle(
  source: RenderSource,
  view: AffineMatrix,
  point: Point2,
): MultiHandle | null {
  if (!point.every(Number.isFinite)) return null;
  return (
    (multiSelectionGeometry(source, view)?.handles.find(
      (handle) =>
        Math.hypot(point[0] - handle.point[0], point[1] - handle.point[1]) <=
        handle.radius,
    )?.id as MultiHandle | undefined) ?? null
  );
}

/** W2-F1 (CV-040): the outer box of a multi-selection in view space. */
export function multiSelectionBox(
  source: RenderSource,
  view: AffineMatrix,
): { corners: readonly Point2[]; center: Point2 } | null {
  const geometry = multiSelectionGeometry(source, view);
  return geometry
    ? { corners: geometry.corners, center: geometry.center }
    : null;
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
