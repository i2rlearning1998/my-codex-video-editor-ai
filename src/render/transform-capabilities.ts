/** Interaction policy only. Does not register engine commands or activate future crop tools. */
export interface TransformCapabilities {
  readonly move: boolean;
  readonly rotate: boolean;
  readonly corners: boolean;
  readonly edges: boolean;
  readonly textWidth: boolean;
}
const generic: TransformCapabilities = Object.freeze({
  move: true,
  rotate: true,
  corners: true,
  edges: true,
  textWidth: false,
});
export const DEFAULT_TRANSFORM_CAPABILITIES: Readonly<
  Record<string, TransformCapabilities>
> = Object.freeze({
  shape: generic,
  image: generic,
  video: generic,
  group: generic,
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
