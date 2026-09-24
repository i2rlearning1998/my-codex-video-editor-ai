// CV-013 smart guides: snap targets, moving features and the linear pointer
// correction of TRANSFORM_INTERACTION_CONTRACT.md revision 5.
import { boundsCorners, transformPoint, type Point2 } from '../core';
import {
  deriveRenderItems,
  locateLayer,
  type RenderSource,
  type SceneLayer,
} from '../render/adapter';
import { selectionBounds } from '../render/selection';

export interface Box {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}
export interface SnapTargets {
  readonly x: readonly number[];
  readonly y: readonly number[];
}
/** A guide line across the composition at `value` on the given axis. */
export interface SnapGuide {
  readonly axis: 'x' | 'y';
  readonly value: number;
}
export type SnapMode = 'move' | 'resize';

/** Safe margin inset, as a fraction of the composition size. */
export const SAFE_MARGIN = 0.05;
/** Snap distance in CSS pixels, divided by the view scale before use. */
export const SNAP_PIXELS = 6;
const EXACT = 1e-6;
const FLAT = 1e-6;

/** Axis-aligned world bounds of a layer, or null when it has none. */
export function worldBox(source: RenderSource, id: string): Box | null {
  const selected = selectionBounds(source, id);
  if (!selected) return null;
  const points = boundsCorners(selected.bounds).map((point) =>
    transformPoint(selected.matrix, point),
  );
  const xs = points.map((point) => point[0]),
    ys = points.map((point) => point[1]);
  const box = {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
  return Object.values(box).every(Number.isFinite) ? box : null;
}
export function unionBox(boxes: readonly (Box | null)[]): Box | null {
  const present = boxes.filter((box): box is Box => box !== null);
  if (!present.length) return null;
  return {
    minX: Math.min(...present.map((box) => box.minX)),
    minY: Math.min(...present.map((box) => box.minY)),
    maxX: Math.max(...present.map((box) => box.maxX)),
    maxY: Math.max(...present.map((box) => box.maxY)),
  };
}
const contains = (layer: SceneLayer, id: string): boolean =>
  layer.id === id || layer.children.some((child) => contains(child, id));

/**
 * Canvas edges, center and safe margins, plus the bounds of every other
 * selectable layer drawn now (resolved like a canvas pick, CV-022).
 */
export function snapTargets(
  source: RenderSource,
  dragged: readonly string[],
  entered: string | null,
): SnapTargets {
  const { width, height } = source.composition;
  const x = [
    0,
    width * SAFE_MARGIN,
    width / 2,
    width * (1 - SAFE_MARGIN),
    width,
  ];
  const y = [
    0,
    height * SAFE_MARGIN,
    height / 2,
    height * (1 - SAFE_MARGIN),
    height,
  ];
  const layers = source.composition.layers;
  const related = (id: string) => {
    const layer = locateLayer(layers, id)?.layer;
    return dragged.some((other) => {
      const draggedLayer = locateLayer(layers, other)?.layer;
      return (
        (layer && contains(layer, other)) ||
        (draggedLayer && contains(draggedLayer, id))
      );
    });
  };
  const seen = new Set<string>();
  for (const item of deriveRenderItems(source).items) {
    const path = [...item.ancestors, item.id];
    const at = entered ? path.indexOf(entered) : -1;
    const id = at >= 0 && at < path.length - 1 ? path[at + 1]! : path[0]!;
    if (seen.has(id)) continue;
    seen.add(id);
    if (related(id)) continue;
    const box = worldBox(source, id);
    if (!box) continue;
    x.push(box.minX, (box.minX + box.maxX) / 2, box.maxX);
    y.push(box.minY, (box.minY + box.maxY) / 2, box.maxY);
  }
  return { x, y };
}

const FEATURES = ['min', 'mid', 'max'] as const;
type Feature = (typeof FEATURES)[number];
const feature = (box: Box, axis: 'x' | 'y', which: Feature) => {
  const min = axis === 'x' ? box.minX : box.minY;
  const max = axis === 'x' ? box.maxX : box.maxY;
  return which === 'min' ? min : which === 'max' ? max : (min + max) / 2;
};
interface AxisSnap {
  axis: 'x' | 'y';
  distance: number;
  offset: number;
  which: Feature;
  target: number;
}

/**
 * Corrects the pointer so the closest moving feature lands exactly on a target,
 * per axis. `evaluate` previews the gesture for a pointer and returns its bounds;
 * the last call is always with the returned point, so the caller's preview matches.
 */
export function solveSnap(
  evaluate: (point: Point2) => Box | null,
  point: Point2,
  targets: SnapTargets,
  tolerance: number,
  mode: SnapMode,
): { point: Point2; guides: SnapGuide[] } {
  const base = evaluate(point);
  const probes = {
    x: evaluate([point[0] + 1, point[1]]),
    y: evaluate([point[0], point[1] + 1]),
  };
  const moving = (axis: 'x' | 'y', which: Feature) => {
    const probe = probes[axis];
    if (!base || !probe) return 0;
    if (mode === 'resize' && which === 'mid') return 0;
    return feature(probe, axis, which) - feature(base, axis, which);
  };
  const best = (axis: 'x' | 'y'): AxisSnap | null => {
    let found: AxisSnap | null = null;
    if (!base || !(tolerance > 0)) return null;
    for (const which of FEATURES) {
      const slope = moving(axis, which);
      if (Math.abs(slope) < FLAT) continue;
      for (const target of targets[axis]) {
        const distance = target - feature(base, axis, which);
        if (
          Math.abs(distance) <= tolerance &&
          (!found || Math.abs(distance) < Math.abs(found.distance))
        )
          found = {
            axis,
            distance,
            offset: distance / slope,
            which,
            target,
          };
      }
    }
    return found;
  };
  const holds = (box: Box | null, snap: AxisSnap) =>
    !!box &&
    Math.abs(feature(box, snap.axis, snap.which) - snap.target) <=
      EXACT * Math.max(1, Math.abs(snap.target));
  const shifted = (snaps: readonly AxisSnap[]): Point2 => [
    point[0] + (snaps.find((snap) => snap.axis === 'x')?.offset ?? 0),
    point[1] + (snaps.find((snap) => snap.axis === 'y')?.offset ?? 0),
  ];
  const found = [best('x'), best('y')]
    .filter((snap): snap is AxisSnap => snap !== null)
    .sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance));
  // Try both axes, then the closer one alone, then none.
  const attempts = [found, found.slice(0, 1), []];
  for (const snaps of attempts) {
    const candidate = shifted(snaps);
    const box = evaluate(candidate);
    if (snaps.every((snap) => holds(box, snap)))
      return {
        point: candidate,
        guides: guidesFor(box, targets, mode, moving),
      };
  }
  return { point, guides: [] };
}

/** Guides for every target a moving feature lands on exactly. */
function guidesFor(
  box: Box | null,
  targets: SnapTargets,
  mode: SnapMode,
  moving: (axis: 'x' | 'y', which: Feature) => number,
): SnapGuide[] {
  if (!box) return [];
  const guides: SnapGuide[] = [];
  for (const axis of ['x', 'y'] as const)
    for (const which of FEATURES) {
      if (mode === 'resize' && Math.abs(moving(axis, which)) < FLAT) continue;
      const value = feature(box, axis, which);
      for (const target of targets[axis])
        if (
          Math.abs(value - target) <= EXACT * Math.max(1, Math.abs(target)) &&
          !guides.some((guide) => guide.axis === axis && guide.value === target)
        )
          guides.push({ axis, value: target });
    }
  return guides;
}
