import {
  IDENTITY_MATRIX,
  boundsCenter,
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
import { selectionBounds, type TransformHandle } from '../render/selection';
import type { EditorSession } from './session';
import { selectionRoots } from './editing';
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
}
export class TransformInteraction {
  #gesture: Gesture | null = null;
  #hoveredHandle: TransformHandle | null = null;
  get hoveredHandle(): TransformHandle | null {
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
    return this.#gesture !== null;
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
  get previews(): readonly LayerPreview[] | undefined {
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
      throw new Error('Select one layer to resize or rotate');
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
    };
    return true;
  }
  update(point: Point2, proportional = false, fromCenter = false): void {
    const gesture = this.#gesture;
    if (!gesture) return;
    try {
      const current = transformPoint(gesture.inverseParent, point);
      if (gesture.kind === 'move')
        gesture.value = moveTransform(
          gesture.layer.transform,
          gesture.start,
          current,
        );
      else if (gesture.kind === 'rotate') {
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
      } else if (
        gesture.kind === 'text-left' ||
        gesture.kind === 'text-right'
      ) {
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
      } else {
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
      }
      if (gesture.members)
        for (const member of gesture.members)
          member.value = moveTransform(
            member.layer.transform,
            member.start,
            transformPoint(member.inverse, point),
          );
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
  finish(): void {
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
            ),
          )
        : buildTransformCommands(
            gesture.compositionId,
            gesture.layer,
            gesture.value,
            gesture.textBox,
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
    if (this.#gesture) {
      this.#gesture = null;
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
    );
    if (commands.length)
      this.engine.commands.transaction(`Set ${field}`, commands);
  }
  dispose(): void {
    this.cancel();
    this.#unsubscribe();
  }
}
