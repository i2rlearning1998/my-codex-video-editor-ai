// G2.1: one definition of what the user sees as an object's size and place.
// X, Y, W and H are composition pixels of the object's own box as drawn: W
// and H are its width and height (before rotation), and X and Y are the
// top-left of that box before rotation (its center minus half its size), so an
// unrotated object's X and Y are its top-left corner. The Inspector, the
// toolbar and the Position panel all use these, so they always agree.
import {
  IDENTITY_MATRIX,
  invertMatrix,
  localTransformMatrix,
  multiplyMatrices,
  transformPoint,
  worldTransform,
  type Point2,
  type TransformValues,
} from '../core';
import {
  layerSize,
  locateLayer,
  type RenderSource,
  type SceneLayer,
} from '../render/adapter';
import { drawingOf } from '../render/drawing';
import { multiSelectionFrame, selectionBounds } from '../render/selection';

export type GeometryField = 'X' | 'Y' | 'W' | 'H';
export const isGeometryField = (field: string): field is GeometryField =>
  field === 'X' || field === 'Y' || field === 'W' || field === 'H';
export interface Geometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Degrees, as drawn in the composition. */
  readonly rotation: number;
}

/** The geometry of one layer, including a transform being dragged. */
export function layerGeometry(
  source: RenderSource,
  id: string,
): Geometry | null {
  const selected = selectionBounds(source, id);
  if (!selected) return null;
  const { matrix, bounds } = selected;
  const width = bounds.width * Math.hypot(matrix[0], matrix[1]);
  const height = bounds.height * Math.hypot(matrix[2], matrix[3]);
  const center = transformPoint(matrix, [
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  ]);
  return {
    x: center[0] - width / 2,
    y: center[1] - height / 2,
    width,
    height,
    rotation: (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI,
  };
}

/** The dashed box of a multi-selection, or the single layer's geometry. */
export function selectionGeometry(source: RenderSource): Geometry | null {
  const ids = source.selectedIds ?? [];
  if (ids.length < 2) return ids[0] ? layerGeometry(source, ids[0]) : null;
  const frame = multiSelectionFrame(source);
  if (!frame) return null;
  const [topLeft, topRight, , bottomLeft] = frame as readonly Point2[];
  const width = Math.hypot(
    topRight![0] - topLeft![0],
    topRight![1] - topLeft![1],
  );
  const height = Math.hypot(
    bottomLeft![0] - topLeft![0],
    bottomLeft![1] - topLeft![1],
  );
  const center: Point2 = [
    (topLeft![0] + frame[2]![0]) / 2,
    (topLeft![1] + frame[2]![1]) / 2,
  ];
  return {
    x: center[0] - width / 2,
    y: center[1] - height / 2,
    width,
    height,
    rotation:
      (Math.atan2(topRight![1] - topLeft![1], topRight![0] - topLeft![0]) *
        180) /
      Math.PI,
  };
}

/** Whether W and H must keep their ratio whatever the lock says. */
export function ratioForced(layer: SceneLayer): boolean {
  // Groups and freehand drawings would distort text, images or brush shapes.
  return layer.type === 'group' || !!drawingOf(layer);
}
/** Text boxes change their width only; their height follows the text. */
export function heightEditable(layer: SceneLayer): boolean {
  return layer.type !== 'text';
}

/** The lock-ratio toggle: transient UI state, on by default, like Canva. */
let ratioLocked = true;
export const isRatioLocked = () => ratioLocked;
export function setRatioLocked(locked: boolean): void {
  ratioLocked = locked;
}

export interface GeometryEdit {
  readonly layer: SceneLayer;
  readonly transform: TransformValues;
  /** A text box's new width (and its unchanged height). */
  readonly textBox?: { readonly width: number; readonly height: number };
}

/** The transform that gives one layer a new X, Y, W or H. */
export function geometryEdit(
  source: RenderSource,
  id: string,
  field: GeometryField,
  value: number,
  locked = ratioLocked,
  /** With field X: also moves Y to this value (one edit for both). */
  alsoY?: number,
): GeometryEdit | null {
  if (!Number.isFinite(value)) throw new RangeError('Enter a number.');
  const found = locateLayer(source.composition.layers, id);
  const selected = selectionBounds(source, id);
  const geometry = layerGeometry(source, id);
  if (!found || !selected || !geometry) return null;
  const layer = found.layer;
  const base = layer.transform as TransformValues;
  const parent = found.parent
    ? worldTransform(source.composition, found.parent.id).matrix
    : IDENTITY_MATRIX;
  const inverse = invertMatrix(parent);
  if (!inverse) return null;
  // Moves the transform so the box's center lands on a world point.
  const bounds = selected.bounds;
  const localCenter: Point2 = [
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  ];
  const centerAt = (transform: TransformValues, target: Point2) => {
    const world = multiplyMatrices(parent, localTransformMatrix(transform));
    const now = transformPoint(world, localCenter);
    const dx = target[0] - now[0],
      dy = target[1] - now[1];
    const [x, y] = transform.position.value;
    return {
      ...transform,
      position: {
        value: [
          x + inverse[0] * dx + inverse[2] * dy,
          y + inverse[1] * dx + inverse[3] * dy,
        ] as [number, number],
      },
    };
  };
  if (field === 'X' || field === 'Y') {
    const x = field === 'X' ? value : geometry.x;
    const y = field === 'Y' ? value : (alsoY ?? geometry.y);
    return {
      layer,
      transform: centerAt(base, [
        x + geometry.width / 2,
        y + geometry.height / 2,
      ]),
    };
  }
  if (!(value > 0)) throw new RangeError('The size must be above 0.');
  if (layer.type === 'text') {
    if (field === 'H') return null;
    // The text box gets wider or narrower and the text rewraps (no stretch).
    const scaleX = Math.hypot(selected.matrix[0], selected.matrix[1]);
    const size = layerSize(layer, source.assets);
    if (!size || !(scaleX > 0)) return null;
    return {
      layer,
      transform: base,
      textBox: { width: value / scaleX, height: size.height },
    };
  }
  const current = field === 'W' ? geometry.width : geometry.height;
  if (!(current > 0)) return null;
  const factor = value / current;
  const [sx, sy] = base.scale.value;
  const uniform = locked || ratioForced(layer);
  const scaled: TransformValues = {
    ...base,
    scale: {
      value: uniform
        ? [sx * factor, sy * factor]
        : field === 'W'
          ? [sx * factor, sy]
          : [sx, sy * factor],
    },
  };
  // X and Y stay where they are: the box grows from its top-left.
  const width =
    uniform || field === 'W' ? geometry.width * factor : geometry.width;
  const height =
    uniform || field === 'H' ? geometry.height * factor : geometry.height;
  return {
    layer,
    transform: centerAt(scaled, [
      geometry.x + width / 2,
      geometry.y + height / 2,
    ]),
  };
}

/** Moving a multi-selection by X or Y moves every selected layer as one. */
export function multiMoveEdits(
  source: RenderSource,
  field: 'X' | 'Y',
  value: number,
): GeometryEdit[] {
  const box = selectionGeometry(source);
  if (!box || !Number.isFinite(value)) return [];
  const dx = field === 'X' ? value - box.x : 0;
  const dy = field === 'Y' ? value - box.y : 0;
  return (source.selectedIds ?? []).flatMap((id) => {
    const own = layerGeometry(source, id);
    const edit =
      own && geometryEdit(source, id, 'X', own.x + dx, true, own.y + dy);
    return edit ? [edit] : [];
  });
}
