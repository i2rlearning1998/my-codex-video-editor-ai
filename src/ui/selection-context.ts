// W2-F1: one description of "what is selected and what it can do", shared by
// the canvas right-click menu, the selection action cluster, the context
// toolbar and the timeline menu. Items are canvas layers today; a timeline
// clip context can add its own item kind and capabilities later without a
// second selection, menu or toolbar system.
import {
  clipAudioDetached,
  findClipByLayer,
  type ClipLocation,
  type DeepReadonly,
  type Clip,
} from '../core';
import {
  locateLayer,
  type RenderSource,
  type SceneLayer,
} from '../render/adapter';
import { isClosedKind, shapeOf } from '../render/shapes';

/** What one selected item supports. Menus offer an action only when every item has it. */
export type Capability =
  | 'edit' // duplicate, delete, copy style, arrange, align
  | 'clip' // has a timeline clip: cut, copy, enable, link
  | 'time-effects' // speed, reverse, freeze frame: video and audio clips only
  | 'detach-audio' // a video clip whose audio is still attached
  | 'group' // is a group, so it can be ungrouped
  | 'closed-shape' // a rectangle, ellipse or combined shape: boolean operations
  | 'transform'; // can be moved, resized and rotated on the canvas

export interface SelectionItem {
  readonly kind: 'layer';
  readonly id: string;
  readonly layer: SceneLayer;
  readonly clip: ClipLocation | null;
  readonly capabilities: ReadonlySet<Capability>;
}

export interface SelectionContext {
  readonly items: readonly SelectionItem[];
  /** True when every item has the capability (false for an empty selection). */
  every(capability: Capability): boolean;
  /** True when at least one item has the capability. */
  some(capability: Capability): boolean;
}

/** Clips whose timing effects mean something: those that play media over time. */
const TIMED_MEDIA = new Set(['video', 'audio']);

function isDetachable(source: RenderSource, clip: DeepReadonly<Clip>) {
  const layer = locateLayer(source.composition.layers, clip.layerId)?.layer;
  const asset = source.assets.find((item) => item.id === clip.assetId);
  return (
    layer?.type === 'video' &&
    asset?.type === 'video' &&
    !clipAudioDetached(clip)
  );
}

export function capabilitiesOf(
  source: RenderSource,
  layer: SceneLayer,
  clip: ClipLocation | null,
): ReadonlySet<Capability> {
  const capabilities = new Set<Capability>(['edit', 'transform']);
  if (layer.type === 'audio') capabilities.delete('transform');
  if (layer.type === 'group') capabilities.add('group');
  const shape = shapeOf(layer);
  if (shape && isClosedKind(shape.kind)) capabilities.add('closed-shape');
  if (clip) {
    capabilities.add('clip');
    if (TIMED_MEDIA.has(layer.type)) capabilities.add('time-effects');
    if (isDetachable(source, clip.clip)) capabilities.add('detach-audio');
  }
  return capabilities;
}

/** Top-level selection roots: a selected descendant of a selected group is not repeated. */
export function selectionRoots(
  source: RenderSource,
  ids: readonly string[],
): SceneLayer[] {
  const selected = new Set(ids),
    result: SceneLayer[] = [];
  const visit = (layers: readonly SceneLayer[]) => {
    for (const layer of layers) {
      if (selected.has(layer.id)) result.push(layer);
      else visit(layer.children);
    }
  };
  visit(source.composition.layers);
  return result;
}

export function describeSelection(
  source: RenderSource,
  ids: readonly string[],
): SelectionContext {
  const items = selectionRoots(source, ids).map((layer): SelectionItem => {
    const clip = findClipByLayer(source.composition, layer.id) ?? null;
    return Object.freeze({
      kind: 'layer',
      id: layer.id,
      layer,
      clip,
      capabilities: capabilitiesOf(source, layer, clip),
    });
  });
  return Object.freeze({
    items: Object.freeze(items),
    every: (capability: Capability) =>
      items.length > 0 &&
      items.every((item) => item.capabilities.has(capability)),
    some: (capability: Capability) =>
      items.some((item) => item.capabilities.has(capability)),
  });
}
