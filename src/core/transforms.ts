import type { DeepReadonly, Transform } from './model';

/** Readonly field projection, not another model: avoids traversing unrelated recursive property metadata. */
export type TransformValues = {
  readonly [K in keyof Transform]: {
    readonly value: DeepReadonly<Transform[K]['value']>;
  };
};
interface TransformNode {
  readonly id: string;
  readonly transform: TransformValues;
  readonly children: readonly TransformNode[];
}

/** Column-vector affine matrix: [a c e; b d f; 0 0 1]. See TRANSFORM_CONTRACT.md. */
export type AffineMatrix = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
];
export type Point2 = readonly [number, number];
export interface WorldTransform {
  readonly matrix: AffineMatrix;
  readonly opacity: number;
}

export const IDENTITY_MATRIX: AffineMatrix = Object.freeze([1, 0, 0, 1, 0, 0]);
/** Relative determinant cutoff after normalizing the linear block by its largest entry. */
export const INVERSE_DETERMINANT_EPSILON = 1e-12;

function finite(...values: number[]): void {
  if (!values.every(Number.isFinite))
    throw new RangeError(
      'Transform calculation requires finite numbers and results',
    );
}
function matrix(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
): AffineMatrix {
  finite(a, b, c, d, e, f);
  return Object.freeze([
    a === 0 ? 0 : a,
    b === 0 ? 0 : b,
    c === 0 ? 0 : c,
    d === 0 ? 0 : d,
    e === 0 ? 0 : e,
    f === 0 ? 0 : f,
  ]);
}

/** A * B: apply B first, then A. No rounding or decomposition. */
export function multiplyMatrices(
  a: AffineMatrix,
  b: AffineMatrix,
): AffineMatrix {
  finite(...a, ...b);
  return matrix(
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  );
}

/** Stored base values only: T(position) * R(clockwise degrees) * S(scale), fixed anchor (0,0). */
export function localTransformMatrix(transform: TransformValues): AffineMatrix {
  const [x, y] = transform.position.value;
  const [sx, sy] = transform.scale.value;
  const rotation = transform.rotation.value;
  finite(x, y, sx, sy, rotation);
  // Reduce before converting to radians, including very large finite degree values.
  const angle = rotation % 360;
  let cosine: number;
  let sine: number;
  // Exact cardinal values, without epsilon-snapping nearby angles.
  if (angle === 0) {
    cosine = 1;
    sine = 0;
  } else if (angle === 90 || angle === -270) {
    cosine = 0;
    sine = 1;
  } else if (angle === 180 || angle === -180) {
    cosine = -1;
    sine = 0;
  } else if (angle === 270 || angle === -90) {
    cosine = 0;
    sine = -1;
  } else {
    const radians = angle * (Math.PI / 180);
    cosine = Math.cos(radians);
    sine = Math.sin(radians);
  }
  return matrix(cosine * sx, sine * sx, -sine * sy, cosine * sy, x, y);
}

export function transformPoint(transform: AffineMatrix, point: Point2): Point2 {
  finite(...transform, ...point);
  const x = transform[0] * point[0] + transform[2] * point[1] + transform[4];
  const y = transform[1] * point[0] + transform[3] * point[1] + transform[5];
  finite(x, y);
  return Object.freeze([x === 0 ? 0 : x, y === 0 ? 0 : y]);
}

/** Null means singular or numerically unsafe; nonfinite input/output throws. Never returns a pseudo-inverse. */
export function invertMatrix(value: AffineMatrix): AffineMatrix | null {
  finite(...value);
  const scale = Math.max(
    Math.abs(value[0]),
    Math.abs(value[1]),
    Math.abs(value[2]),
    Math.abs(value[3]),
  );
  if (scale === 0) return null;
  const a = value[0] / scale,
    b = value[1] / scale,
    c = value[2] / scale,
    d = value[3] / scale;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) <= INVERSE_DETERMINANT_EPSILON) return null;
  const ia = d / determinant / scale,
    ib = -b / determinant / scale;
  const ic = -c / determinant / scale,
    id = a / determinant / scale;
  return matrix(
    ia,
    ib,
    ic,
    id,
    -(ia * value[4] + ic * value[5]),
    -(ib * value[4] + id * value[5]),
  );
}

function layerPath(
  layers: readonly TransformNode[],
  id: string,
): readonly TransformNode[] | undefined {
  for (const layer of layers) {
    if (layer.id === id) return [layer];
    const path = layerPath(layer.children, id);
    if (path) return [layer, ...path];
  }
  return undefined;
}

/** Derive from a validated canonical composition. No cache, stored matrix, or alternate hierarchy. */
export function worldTransform(
  composition: { readonly layers: readonly TransformNode[] },
  layerId: string,
  preview?: TransformPreview | readonly TransformPreview[],
): WorldTransform {
  const path = layerPath(composition.layers, layerId);
  if (!path) throw new Error(`Unknown layer: ${layerId}`);
  let result = IDENTITY_MATRIX;
  let opacity = 1;
  for (const layer of path) {
    const override = Array.isArray(preview)
      ? preview.find((item) => item.layerId === layer.id)
      : (preview as TransformPreview | undefined);
    const transform =
      override?.layerId === layer.id ? override.transform : layer.transform;
    result = multiplyMatrices(result, localTransformMatrix(transform));
    const localOpacity = transform.opacity.value;
    finite(localOpacity);
    if (localOpacity < 0 || localOpacity > 1)
      throw new RangeError('Opacity must be between 0 and 1');
    opacity *= localOpacity;
  }
  return Object.freeze({
    matrix: result,
    opacity: opacity === 0 ? 0 : opacity,
  });
}

/** One temporary numeric override, never a second tree or persisted state. */
export interface TransformPreview {
  readonly layerId: string;
  readonly transform: TransformValues;
}
export interface TransformBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export type Corner = 0 | 1 | 2 | 3;
export type Edge = 'top' | 'right' | 'bottom' | 'left';
export type ResizeHandle = Corner | Edge;
export function boundsCenter(bounds: TransformBounds): Point2 {
  const point: Point2 = [
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  ];
  finite(...point);
  return point;
}
export function handlePoint(
  bounds: TransformBounds,
  handle: ResizeHandle,
): Point2 {
  if (typeof handle === 'number') return boundsCorners(bounds)[handle]!;
  const center = boundsCenter(bounds);
  switch (handle) {
    case 'top':
      return [center[0], bounds.y];
    case 'right':
      return [bounds.x + bounds.width, center[1]];
    case 'bottom':
      return [center[0], bounds.y + bounds.height];
    case 'left':
      return [bounds.x, center[1]];
  }
}
export function oppositeHandle(handle: ResizeHandle): ResizeHandle {
  if (typeof handle === 'number') return ((handle + 2) % 4) as Corner;
  return (
    { top: 'bottom', right: 'left', bottom: 'top', left: 'right' } as const
  )[handle];
}
/** Preserve a local point's parent position while changing canonical rotation. */
export function rotateAroundCenter(
  base: TransformValues,
  bounds: TransformBounds,
  rotation: number,
): TransformValues {
  finite(rotation);
  if (rotation === base.rotation.value) return base;
  const pivot = boundsCenter(bounds);
  const center = transformPoint(localTransformMatrix(base), pivot);
  const rotated = {
    ...base,
    rotation: { value: rotation },
    position: { value: [0, 0] as Point2 },
  };
  const offset = transformPoint(localTransformMatrix(rotated), pivot);
  const position: Point2 = [center[0] - offset[0], center[1] - offset[1]];
  finite(...position);
  return { ...rotated, position: { value: position } };
}
/** Retain where inside a handle's hit area the pointer was grabbed. */
export function resizePointer(
  base: TransformValues,
  bounds: TransformBounds,
  handle: ResizeHandle,
  start: Point2,
  current: Point2,
): Point2 {
  const point = transformPoint(
    localTransformMatrix(base),
    handlePoint(bounds, handle),
  );
  const result: Point2 = [
    point[0] + current[0] - start[0],
    point[1] + current[1] - start[1],
  ];
  finite(...result);
  return result;
}
/** Width editing keeps scale/font metrics and the opposite top corner fixed. */
export function resizeTextWidth(
  base: TransformValues,
  width: number,
  side: 'left' | 'right',
  start: Point2,
  current: Point2,
): { width: number; transform: TransformValues } {
  const inverse = invertMatrix(localTransformMatrix(base));
  if (!inverse)
    throw new RangeError('Cannot resize text under a collapsed transform');
  const a = transformPoint(inverse, start),
    b = transformPoint(inverse, current);
  const rawWidth = width + (side === 'right' ? 1 : -1) * (b[0] - a[0]);
  finite(width, rawWidth);
  if (width <= 0) throw new RangeError('Text width must be positive');
  const next = Math.max(1, rawWidth);
  const position = transformPoint(localTransformMatrix(base), [
    side === 'left' ? width - next : 0,
    0,
  ]);
  return { width: next, transform: { ...base, position: { value: position } } };
}
/** Screen-space normal to the top edge, pointing away from the box center. */
export function rotationHandlePoint(
  top: Point2,
  edgeEnd: Point2,
  center: Point2,
  distance: number,
): Point2 {
  const dx = edgeEnd[0] - top[0],
    dy = edgeEnd[1] - top[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return offsetAway(top, center, distance);
  const sign =
    -dy * (top[0] - center[0]) + dx * (top[1] - center[1]) >= 0 ? 1 : -1;
  const point: Point2 = [
    top[0] - ((sign * dy) / length) * distance,
    top[1] + ((sign * dx) / length) * distance,
  ];
  finite(...point);
  return point;
}
export function resizeCursorAxis(center: Point2, point: Point2): number {
  finite(...center, ...point);
  return (
    ((Math.round(
      Math.atan2(point[1] - center[1], point[0] - center[0]) / (Math.PI / 4),
    ) %
      4) +
      4) %
    4
  );
}
/** Normalize each screen basis vector so handle graphics follow the box without zoom scaling. */
export function selectionHandleMatrix(
  worldToScreen: AffineMatrix,
  point: Point2,
): AffineMatrix {
  const x = Math.hypot(worldToScreen[0], worldToScreen[1]),
    y = Math.hypot(worldToScreen[2], worldToScreen[3]);
  if (x === 0 || y === 0) throw new RangeError('Collapsed handle axes');
  return matrix(
    worldToScreen[0] / x,
    worldToScreen[1] / x,
    worldToScreen[2] / y,
    worldToScreen[3] / y,
    point[0],
    point[1],
  );
}
export function boundsCorners(bounds: TransformBounds): readonly Point2[] {
  const { x, y, width, height } = bounds;
  finite(x, y, width, height, x + width, y + height);
  return [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
}
export function moveTransform(
  base: TransformValues,
  start: Point2,
  current: Point2,
): TransformValues {
  finite(...start, ...current);
  const value: Point2 = [
    base.position.value[0] + current[0] - start[0],
    base.position.value[1] + current[1] - start[1],
  ];
  finite(...value);
  return { ...base, position: { value } };
}
/** Keep the opposite corner fixed in parent space; scale in the layer's rotated axes. */
export function resizeTransform(
  base: TransformValues,
  bounds: TransformBounds,
  corner: ResizeHandle,
  current: Point2,
  proportional = false,
): TransformValues {
  finite(...current);
  if (bounds.width <= 0 || bounds.height <= 0)
    throw new RangeError('Cannot resize empty bounds');
  const fixed = handlePoint(bounds, oppositeHandle(corner)),
    moving = handlePoint(bounds, corner);
  const fixedParent = transformPoint(localTransformMatrix(base), fixed);
  const rotationOnly: TransformValues = {
    ...base,
    position: { value: [0, 0] },
    scale: { value: [1, 1] },
  };
  const inverseRotation = invertMatrix(localTransformMatrix(rotationOnly))!;
  const delta = transformPoint(inverseRotation, [
    current[0] - fixedParent[0],
    current[1] - fixedParent[1],
  ]);
  let sx =
      moving[0] === fixed[0]
        ? base.scale.value[0]
        : delta[0] / (moving[0] - fixed[0]),
    sy =
      moving[1] === fixed[1]
        ? base.scale.value[1]
        : delta[1] / (moving[1] - fixed[1]);
  if (proportional && typeof corner === 'number') {
    if (base.scale.value[0] === 0 || base.scale.value[1] === 0)
      throw new RangeError('Cannot proportionally resize a collapsed scale');
    const rx = sx / base.scale.value[0],
      ry = sy / base.scale.value[1];
    const ratio = Math.abs(rx - 1) >= Math.abs(ry - 1) ? rx : ry;
    sx = base.scale.value[0] * ratio;
    sy = base.scale.value[1] * ratio;
  }
  finite(sx, sy);
  // An edge ignores tangential movement; inverse arithmetic must not turn it into an edit.
  if (
    typeof corner === 'string' &&
    Math.abs(sx - base.scale.value[0]) <=
      1e-10 * Math.max(1, Math.abs(base.scale.value[0])) &&
    Math.abs(sy - base.scale.value[1]) <=
      1e-10 * Math.max(1, Math.abs(base.scale.value[1]))
  )
    return base;
  const offset = transformPoint(
    localTransformMatrix({ ...rotationOnly, scale: { value: [sx, sy] } }),
    fixed,
  );
  const position: Point2 = [
    fixedParent[0] - offset[0],
    fixedParent[1] - offset[1],
  ];
  finite(...position);
  return { ...base, position: { value: position }, scale: { value: [sx, sy] } };
}
/** Clockwise incremental angle in parent coordinates; shortest signed arc in [-180,180]. */
export function rotationDelta(
  origin: Point2,
  previous: Point2,
  current: Point2,
): number {
  finite(...origin, ...previous, ...current);
  const a: Point2 = [previous[0] - origin[0], previous[1] - origin[1]];
  const b: Point2 = [current[0] - origin[0], current[1] - origin[1]];
  finite(...a, ...b);
  if (Math.hypot(...a) < 1e-9 || Math.hypot(...b) < 1e-9)
    throw new RangeError('Rotation pointer is at the anchor');
  const angle = Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0]);
  return Math.atan2(Math.sin(angle), Math.cos(angle)) * (180 / Math.PI);
}
export function offsetAway(
  point: Point2,
  center: Point2,
  distance: number,
): Point2 {
  const dx = point[0] - center[0],
    dy = point[1] - center[1];
  const length = Math.hypot(dx, dy);
  finite(...point, ...center, distance, length);
  if (length === 0) return point;
  return [
    point[0] + (dx / length) * distance,
    point[1] + (dy / length) * distance,
  ];
}
