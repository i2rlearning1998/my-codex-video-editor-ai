// Q3 pivot (anchor). The transform contract keeps the stored anchor at local
// (0, 0) (TRANSFORM_CONTRACT.md); a layer may name a pivot in its box with
// the string property `pivot` (schema unchanged, read defensively). Rotation
// and scale then turn about that point: edits move the position so the
// pivot keeps its place, and animated rotation or scale is evaluated the same
// way (animation.ts), for the preview and the export alike (D-252).
import {
  localTransformMatrix,
  transformPoint,
  type Point2,
  type TransformValues,
} from './transforms';

export const PIVOTS = {
  'top-left': [0, 0],
  top: [0.5, 0],
  'top-right': [1, 0],
  left: [0, 0.5],
  center: [0.5, 0.5],
  right: [1, 0.5],
  'bottom-left': [0, 1],
  bottom: [0.5, 1],
  'bottom-right': [1, 1],
} as const satisfies Record<string, Point2>;
export type PivotName = keyof typeof PIVOTS;
export const PIVOT_NAMES = Object.keys(PIVOTS) as PivotName[];

type PropertyRecord = Readonly<
  Record<
    string,
    { readonly type?: string; readonly value?: unknown } | undefined
  >
>;
/** The layer's named pivot, or null when it has none (legacy behaviour). */
export function pivotName(properties: object): PivotName | null {
  const value = (properties as PropertyRecord).pivot;
  return value?.type === 'string' &&
    typeof value.value === 'string' &&
    value.value in PIVOTS
    ? (value.value as PivotName)
    : null;
}
/** The pivot as a local point of the layer's box (width × height). */
export function pivotPoint(
  properties: object,
  fallback?: PivotName,
): Point2 | null {
  const name = pivotName(properties) ?? fallback ?? null;
  if (!name) return null;
  const record = properties as PropertyRecord;
  const size = (key: string) => {
    const item = record[key];
    return item?.type === 'number' && typeof item.value === 'number'
      ? item.value
      : null;
  };
  const width = size('width'),
    height = size('height');
  if (width === null || height === null) return null;
  const [fx, fy] = PIVOTS[name];
  return [fx * width, fy * height];
}
/**
 * The transform with a new rotation and scale whose local `pivot` stays
 * where it was in the parent's frame.
 */
export function aroundPivot(
  base: TransformValues,
  pivot: Point2,
  rotation: number,
  scale: Point2,
): TransformValues {
  const world = transformPoint(localTransformMatrix(base), pivot);
  const turned = {
    ...base,
    rotation: { value: rotation },
    scale: { value: [scale[0], scale[1]] as Point2 },
    position: { value: [0, 0] as Point2 },
  };
  const offset = transformPoint(localTransformMatrix(turned), pivot);
  return {
    ...turned,
    position: { value: [world[0] - offset[0], world[1] - offset[1]] as Point2 },
  };
}
