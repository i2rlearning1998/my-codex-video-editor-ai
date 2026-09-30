import type { SceneLayer } from './adapter';
import { drawingOf } from './drawing';
import { shapeOf } from './shapes';

/** Interaction policy only. Does not register engine commands or activate future crop tools. */
export interface TransformCapabilities {
  readonly move: boolean;
  readonly rotate: boolean;
  readonly corners: boolean;
  readonly edges: boolean;
  readonly textWidth: boolean;
  /**
   * G2 (interaction contract revision 7): which edge handles show when
   * `edges` is on; all four when absent.
   */
  readonly edgeSides?: readonly ('top' | 'right' | 'bottom' | 'left')[];
}
const generic: TransformCapabilities = Object.freeze({
  move: true,
  rotate: true,
  corners: true,
  edges: true,
  textWidth: false,
});
/** Corners and rotation only: side handles would distort the content. */
const cornersOnly: TransformCapabilities = Object.freeze({
  ...generic,
  edges: false,
});
export const DEFAULT_TRANSFORM_CAPABILITIES: Readonly<
  Record<string, TransformCapabilities>
> = Object.freeze({
  shape: generic,
  image: generic,
  video: generic,
  // G2: a group's side handles would stretch the text and images inside it,
  // so groups resize proportionally from their corners, like Canva.
  group: cornersOnly,
  audio: generic,
  text: Object.freeze({ ...generic, edges: false, textWidth: true }),
});
const none: TransformCapabilities = Object.freeze({
  move: false,
  rotate: false,
  corners: false,
  edges: false,
  textWidth: false,
});
/** Explicit immutable policy injection allows additional consumers/types without a global registry. */
export function transformCapabilities(
  type: string,
  definitions: Readonly<
    Record<string, TransformCapabilities>
  > = DEFAULT_TRANSFORM_CAPABILITIES,
): TransformCapabilities {
  return definitions[type] ?? none;
}

/**
 * G2: the capabilities of one layer. Freehand drawings keep their brush
 * shape (corners only); lines and arrows lengthen from their ends only.
 */
export function layerTransformCapabilities(
  layer: SceneLayer,
  definitions?: Readonly<Record<string, TransformCapabilities>>,
): TransformCapabilities {
  const base = transformCapabilities(layer.type, definitions);
  if (layer.type !== 'shape' || !base.edges) return base;
  if (drawingOf(layer)) return { ...base, edges: false };
  const kind = shapeOf(layer)?.kind;
  if (kind === 'line' || kind === 'arrow')
    return { ...base, corners: false, edgeSides: ['left', 'right'] };
  return base;
}
