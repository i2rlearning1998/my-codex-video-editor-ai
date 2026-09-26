import {
  IDENTITY_MATRIX,
  boundsCenter,
  decomposeMatrix,
  multiplyMatrices,
  rotateAroundCenter,
  resizePointer,
  resizeTextWidth,
  localTransformMatrix,
  invertMatrix,
  moveTransform,
  resizeTransform,
  rotationDelta,
  transformPoint,
  worldTransform,
  type AffineMatrix,
  type EditorEngine,
  type Point2,
  type TransformBounds,
  type TransformValues,
} from '../core';
import {
  locateLayer,
  textLayoutForWidth,
  type LayerPreview,
  type SceneLayer,
} from '../render/adapter';
import { transformCapabilities } from '../render/transform-capabilities';
import {
  multiSelectionFrame,
  multiSelectionStretchable,
  selectionBounds,
  type MultiHandle,
  type TransformHandle,
} from '../render/selection';
import type { EditorSession } from './session';
import { selectionRoots } from './editing';
import {
  snapTargets,
  solveSnap,
  unionBox,
  worldBox,
  type Box,
  type SnapGuide,
  type SnapTargets,
} from './snapping';
import {
  buildTransformCommands,
  inspectorTransform,
  type InspectorField,
} from './transform-commands';

export type GestureKind = 'move' | TransformHandle;
interface Gesture {
  members?: {
    layer: SceneLayer;
    inverse: AffineMatrix;
    start: Point2;
    value: TransformValues;
  }[];
  kind: GestureKind;
  layer: SceneLayer;
  compositionId: string;
  inverseParent: AffineMatrix;
  start: Point2;
  previous: Point2;
  bounds: TransformBounds;
  angle: number;
  pivot: Point2;
  textBox?: { width: number; height: number };
  value: TransformValues;
  /** CV-013: fixed at gesture start (revision 5). */
  targets: SnapTargets;
  guides: readonly SnapGuide[];
}
/**
 * CV-041 (revision 6): resizing or rotating a multi-selection. The world delta
 * `affine` is applied to every selected root: local' = parent⁻¹ · affine ·
 * parent · local, decomposed back into position, rotation and scale.
 */
interface MultiGesture {
  kind: MultiHandle;
  compositionId: string;
  members: {
    layer: SceneLayer;
    parent: AffineMatrix;
    inverseParent: AffineMatrix;
    local: AffineMatrix;
    value: TransformValues;
  }[];
  frame: readonly Point2[];
  center: Point2;
  start: Point2;
  previous: Point2;
  angle: number;
  affine: AffineMatrix;
}
const mid = (a: Point2, b: Point2): Point2 => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
];
/** The world delta for one pointer position of a multi-selection gesture. */
export function multiAffine(
  kind: MultiHandle,
  frame: readonly Point2[],
  pointer: Point2,
  fromCenter: boolean,
  angle = 0,
): AffineMatrix {
  const center = mid(frame[0]!, frame[2]!);
  if (kind === 'rotate') {
    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians),
      sin = Math.sin(radians);
    return [
      cos,
      sin,
      -sin,
      cos,
      center[0] - cos * center[0] + sin * center[1],
      center[1] - sin * center[0] - cos * center[1],
    ];
  }
  if (typeof kind === 'number') {
    // Corners scale uniformly: the pointer is projected onto the diagonal.
    const moving = frame[kind]!,
      fixed = fromCenter ? center : frame[(kind + 2) % 4]!;
    const vx = moving[0] - fixed[0],
      vy = moving[1] - fixed[1];
    const m =
      ((pointer[0] - fixed[0]) * vx + (pointer[1] - fixed[1]) * vy) /
      (vx * vx + vy * vy);
    return [m, 0, 0, m, fixed[0] - m * fixed[0], fixed[1] - m * fixed[1]];
  }
  const horizontal = kind === 'left' || kind === 'right';
  const axis = horizontal ? 0 : 1;
  const moving = (
    kind === 'left'
      ? frame[0]!
      : kind === 'right'
        ? frame[1]!
        : kind === 'top'
          ? frame[0]!
          : frame[3]!
  )[axis];
  const fixed = fromCenter
    ? center[axis]
    : (kind === 'left'
        ? frame[1]!
        : kind === 'right'
          ? frame[0]!
          : kind === 'top'
            ? frame[3]!
            : frame[0]!)[axis];
  const scale = (pointer[axis] - fixed) / (moving - fixed);
  return horizontal
    ? [scale, 0, 0, 1, fixed - scale * fixed, 0]
    : [1, 0, 0, scale, 0, fixed - scale * fixed];
}
export class TransformInteraction {
  #gesture: Gesture | null = null;
  #multi: MultiGesture | null = null;
  #hoveredHandle: TransformHandle | null = null;
  get hoveredHandle(): TransformHandle | null {
    if (this.#multi) return this.#multi.kind;
    return this.#gesture?.kind === 'move'
      ? null
      : (this.#gesture?.kind ?? this.#hoveredHandle);
  }
  hover(handle: TransformHandle | null): void {
    if (this.#hoveredHandle !== handle) {
      this.#hoveredHandle = handle;
      this.changed();
    }
  }
  #unsubscribe: () => void;
  constructor(
    private readonly engine: EditorEngine,
    private readonly session: EditorSession,
    private readonly changed: () => void,
  ) {
    // Session notifications include command changes/load/selection, invalidating in-flight baselines.
    this.#unsubscribe = session.onChange(() => {
      this.#hoveredHandle = null;
      this.cancel();
    });
  }
  get active(): boolean {
    return this.#gesture !== null || this.#multi !== null;
  }
  /** CV-041: the multi-selection frame (world corners) while it is transformed. */
  get frame(): readonly Point2[] | undefined {
    const multi = this.#multi;
    return multi
      ? multi.frame.map((point) => transformPoint(multi.affine, point))
      : undefined;
  }
  get preview(): LayerPreview | undefined {
    const gesture = this.#gesture;
    return gesture
      ? {
          layerId: gesture.layer.id,
          transform: gesture.value,
          ...(gesture.textBox ? { textBox: gesture.textBox } : {}),
        }
      : undefined;
  }
  /** CV-013: transient guide lines of the active gesture. */
  get guides(): readonly SnapGuide[] {
    return this.#gesture?.guides ?? [];
  }
  get previews(): readonly LayerPreview[] | undefined {
    if (this.#multi)
      return this.#multi.members.map((member) => ({
        layerId: member.layer.id,
        transform: member.value,
      }));
    return this.#gesture?.members?.map((member) => ({
      layerId: member.layer.id,
      transform: member.value,
    }));
  }
  begin(kind: GestureKind, point: Point2): boolean {
    this.cancel();
    this.session.setPlaying(false);
    const source = this.session.source;
    const found = this.session.selectedId
      ? locateLayer(source.composition.layers, this.session.selectedId)
      : null;
    if (!found || !point.every(Number.isFinite)) return false;
    if (this.session.selectedIds.length > 1 && kind !== 'move')
      return this.#beginMulti(kind, point);
    const capabilities = transformCapabilities(
      found.layer.type,
      source.capabilities,
    );
    const textWidth = kind === 'text-left' || kind === 'text-right';
    if (
      !(kind === 'move'
        ? capabilities.move
        : kind === 'rotate'
          ? capabilities.rotate
          : typeof kind === 'number'
            ? capabilities.corners
            : textWidth
              ? capabilities.textWidth
              : capabilities.edges)
    )
      return false;
    if (textWidth)
      for (const key of ['width', 'height', 'textWrap'] as const) {
        const property = found.layer.properties[key];
        if (
          property &&
          property.type !== (key === 'textWrap' ? 'boolean' : 'number')
        )
          throw new Error(
            `Cannot edit text box: ${key} has an incompatible property type`,
          );
      }
    const parent = found.parent
      ? worldTransform(source.composition, found.parent.id).matrix
      : IDENTITY_MATRIX;
    const inverseParent = invertMatrix(parent);
    const selected = selectionBounds(source, found.layer.id);
    if (!inverseParent || !selected) return false;
    const start = transformPoint(inverseParent, point);
    const members =
      kind === 'move' && this.session.selectedIds.length > 1
        ? selectionRoots(source, this.session.selectedIds).map((layer) => {
            const parent = locateLayer(
              source.composition.layers,
              layer.id,
            )!.parent;
            const inverse = invertMatrix(
              parent
                ? worldTransform(source.composition, parent.id).matrix
                : IDENTITY_MATRIX,
            );
            if (!inverse)
              throw new Error('Cannot move selection under a collapsed parent');
            return {
              layer,
              inverse,
              start: transformPoint(inverse, point),
              value: layer.transform as TransformValues,
            };
          })
        : undefined;
    this.#gesture = {
      ...(members ? { members } : {}),
      kind,
      layer: found.layer,
      compositionId: source.composition.id,
      inverseParent,
      start,
      previous: start,
      bounds: selected.bounds,
      angle: 0,
      pivot: transformPoint(
        localTransformMatrix(found.layer.transform),
        boundsCenter(selected.bounds),
      ),
      value: found.layer.transform,
      targets: snapTargets(
        source,
        members ? members.map((member) => member.layer.id) : [found.layer.id],
        this.session.enteredGroupId,
      ),
      guides: [],
    };
    return true;
  }
  /**
   * `snap` is the CV-013 tolerance in composition units; omit it (keyboard nudges,
   * Ctrl held) to place exactly at the pointer.
   */
  update(
    point: Point2,
    proportional = false,
    fromCenter = false,
    snap?: number,
  ): void {
    if (this.#multi) return this.#updateMulti(point, fromCenter);
    const gesture = this.#gesture;
    if (!gesture) return;
    try {
      let current: Point2;
      if (gesture.kind === 'rotate') {
        current = transformPoint(gesture.inverseParent, point);
        gesture.angle += rotationDelta(
          gesture.pivot,
          gesture.previous,
          current,
        );
        const value = gesture.layer.transform.rotation.value + gesture.angle;
        if (!Number.isFinite(value)) throw new RangeError('Invalid rotation');
        gesture.value = rotateAroundCenter(
          gesture.layer.transform,
          gesture.bounds,
          value,
        );
        gesture.guides = [];
      } else if (snap !== undefined) {
        const snapped = solveSnap(
          (candidate) => {
            this.#apply(gesture, candidate, proportional, fromCenter);
            return this.#box(gesture);
          },
          point,
          gesture.targets,
          snap,
          gesture.kind === 'move' ? 'move' : 'resize',
        );
        current = transformPoint(gesture.inverseParent, snapped.point);
        gesture.guides = snapped.guides;
      } else {
        current = this.#apply(gesture, point, proportional, fromCenter);
        gesture.guides = [];
      }
      gesture.previous = current;
      // Exact return to the start is an intentional no-op, not a floating-point edit.
      if (
        current[0] === gesture.start[0] &&
        current[1] === gesture.start[1] &&
        (gesture.kind !== 'rotate' || Math.abs(gesture.angle) < 1e-10)
      ) {
        gesture.value = gesture.layer.transform;
        delete gesture.textBox;
      }
      this.changed();
    } catch (error) {
      this.cancel();
      throw error;
    }
  }
  /** Previews a move or resize for one pointer; returns the parent-space pointer. */
  #apply(
    gesture: Gesture,
    point: Point2,
    proportional: boolean,
    fromCenter: boolean,
  ): Point2 {
    const current = transformPoint(gesture.inverseParent, point);
    if (gesture.kind === 'move')
      gesture.value = moveTransform(
        gesture.layer.transform,
        gesture.start,
        current,
      );
    else if (gesture.kind === 'text-left' || gesture.kind === 'text-right') {
      const result = resizeTextWidth(
        gesture.layer.transform,
        gesture.bounds.width,
        gesture.kind === 'text-left' ? 'left' : 'right',
        gesture.start,
        current,
      );
      if (
        Math.abs(result.width - gesture.bounds.width) <=
        1e-10 * Math.max(1, gesture.bounds.width)
      ) {
        gesture.value = gesture.layer.transform;
        delete gesture.textBox;
      } else {
        const layout = textLayoutForWidth(
          gesture.layer,
          result.width,
          this.session.source.measureText,
        );
        gesture.value = result.transform;
        gesture.textBox = { width: result.width, height: layout.height };
      }
    } else if (gesture.kind !== 'rotate')
      gesture.value = resizeTransform(
        gesture.layer.transform,
        gesture.bounds,
        gesture.kind,
        resizePointer(
          gesture.layer.transform,
          gesture.bounds,
          gesture.kind,
          gesture.start,
          current,
        ),
        typeof gesture.kind === 'number' || proportional,
        fromCenter,
      );
    if (gesture.members)
      for (const member of gesture.members)
        member.value = moveTransform(
          member.layer.transform,
          member.start,
          transformPoint(member.inverse, point),
        );
    return current;
  }
  /** World bounds of the previewed selection. */
  #box(gesture: Gesture): Box | null {
    const source = this.session.source;
    if (gesture.members)
      return unionBox(
        gesture.members.map((member) =>
          worldBox(
            {
              ...source,
              previews: gesture.members!.map((item) => ({
                layerId: item.layer.id,
                transform: item.value,
              })),
            },
            member.layer.id,
          ),
        ),
      );
    return worldBox(
      {
        ...source,
        preview: {
          layerId: gesture.layer.id,
          transform: gesture.value,
          ...(gesture.textBox ? { textBox: gesture.textBox } : {}),
        },
      },
      gesture.layer.id,
    );
  }
  finish(): void {
    if (this.#multi) return this.#finishMulti();
    const gesture = this.#gesture;
    if (!gesture) return;
    this.#gesture = null;
    try {
      const commands = gesture.members
        ? gesture.members.flatMap((member) =>
            buildTransformCommands(
              gesture.compositionId,
              member.layer,
              member.value,
              undefined,
              this.session.currentTime,
            ),
          )
        : buildTransformCommands(
            gesture.compositionId,
            gesture.layer,
            gesture.value,
            gesture.textBox,
            this.session.currentTime,
          );
      if (commands.length)
        this.engine.commands.transaction(
          gesture.kind === 'move'
            ? 'Move layer'
            : gesture.kind === 'rotate'
              ? 'Rotate layer'
              : gesture.kind === 'text-left' || gesture.kind === 'text-right'
                ? 'Resize text box'
                : 'Resize layer',
          commands,
        );
    } finally {
      this.changed();
    }
  }
  cancel(): void {
    if (this.#gesture || this.#multi) {
      this.#gesture = null;
      this.#multi = null;
      this.changed();
    }
  }
  #beginMulti(kind: GestureKind, point: Point2): boolean {
    if (kind === 'move' || kind === 'text-left' || kind === 'text-right')
      return false;
    const source = this.session.source;
    const frame = multiSelectionFrame(source);
    if (!frame) return false;
    if (typeof kind === 'string' && kind !== 'rotate') {
      if (!multiSelectionStretchable(source))
        throw new Error(
          'Stretching needs every selected layer to be straight; use a corner handle',
        );
    }
    const members = selectionRoots(source, this.session.selectedIds).map(
      (layer) => {
        const parentLayer = locateLayer(
          source.composition.layers,
          layer.id,
        )!.parent;
        const parent = parentLayer
          ? worldTransform(source.composition, parentLayer.id).matrix
          : IDENTITY_MATRIX;
        const inverseParent = invertMatrix(parent);
        if (!inverseParent)
          throw new Error('Cannot transform a layer under a collapsed group');
        return {
          layer,
          parent,
          inverseParent,
          local: localTransformMatrix(layer.transform as TransformValues),
          value: layer.transform as TransformValues,
        };
      },
    );
    this.#multi = {
      kind: kind as MultiHandle,
      compositionId: source.composition.id,
      members,
      frame,
      center: mid(frame[0]!, frame[2]!),
      start: point,
      previous: point,
      angle: 0,
      affine: IDENTITY_MATRIX,
    };
    return true;
  }
  #updateMulti(point: Point2, fromCenter: boolean): void {
    const multi = this.#multi!;
    try {
      if (multi.kind === 'rotate')
        multi.angle += rotationDelta(multi.center, multi.previous, point);
      multi.previous = point;
      const unchanged =
        multi.kind === 'rotate'
          ? Math.abs(multi.angle) < 1e-10
          : point[0] === multi.start[0] && point[1] === multi.start[1];
      multi.affine = unchanged
        ? IDENTITY_MATRIX
        : multiAffine(multi.kind, multi.frame, point, fromCenter, multi.angle);
      for (const member of multi.members) {
        if (unchanged) {
          member.value = member.layer.transform as TransformValues;
          continue;
        }
        const base = member.layer.transform as TransformValues;
        const parts = decomposeMatrix(
          multiplyMatrices(
            member.inverseParent,
            multiplyMatrices(
              multiplyMatrices(multi.affine, member.parent),
              member.local,
            ),
          ),
          { rotation: base.rotation.value, scaleX: base.scale.value[0] },
        );
        if (!parts)
          throw new RangeError(
            'A selected layer sits in a stretched group and cannot be transformed this way',
          );
        member.value = {
          ...base,
          position: { value: parts.position },
          rotation: { value: parts.rotation },
          scale: { value: parts.scale },
        };
      }
      this.changed();
    } catch (error) {
      this.cancel();
      throw error;
    }
  }
  #finishMulti(): void {
    const multi = this.#multi!;
    this.#multi = null;
    try {
      const commands = multi.members.flatMap((member) =>
        buildTransformCommands(
          multi.compositionId,
          member.layer,
          member.value,
          undefined,
          this.session.currentTime,
        ),
      );
      if (commands.length)
        this.engine.commands.transaction(
          multi.kind === 'rotate' ? 'Rotate layers' : 'Resize layers',
          commands,
        );
    } finally {
      this.changed();
    }
  }
  edit(field: InspectorField, value: number): void {
    this.cancel();
    const source = this.session.source;
    const found = this.session.selectedId
      ? locateLayer(source.composition.layers, this.session.selectedId)
      : null;
    if (!found) return;
    const commands = buildTransformCommands(
      source.composition.id,
      found.layer,
      inspectorTransform(
        found.layer,
        field,
        value,
        selectionBounds(source, found.layer.id)?.bounds,
      ),
      undefined,
      this.session.currentTime,
    );
    if (commands.length)
      this.engine.commands.transaction(`Set ${field}`, commands);
  }
  dispose(): void {
    this.cancel();
    this.#unsubscribe();
  }
}
