// FIX7: what a saved scene is made of. A scene template in My Templates is a
// whole scene (layers, clips, assets). This module lists its top-level layers
// as parts, each in its real format, tells where each one came from (made by
// AI from a plan, a code animation, a file from Media, or the editor's own
// text and shapes), turns one part into a saved-item record that can be
// added or dragged on its own, and swaps a part's media file inside the
// saved scene without rebuilding anything.
import type { Asset, Layer } from '../core';
import type { MineClip, MineItem, MineKind } from './my-library';
import type { MyTemplate } from './my-templates';

export type PartOrigin = 'ai' | 'code' | 'media' | 'own';

export interface ScenePart {
  readonly layer: Layer;
  readonly origin: PartOrigin;
  readonly kind: MineKind;
  /** The media file the part plays (null for text, shapes, code). */
  readonly asset: Asset | null;
  /** The id a part is added or dragged under (a transient record). */
  readonly itemId: string;
}

export interface SceneCounts {
  readonly ai: number;
  readonly code: number;
  readonly media: number;
  readonly own: number;
}

const kindOf = (layer: Layer): MineKind => {
  if (layer.code) return 'animation';
  switch (layer.type) {
    case 'text':
      return 'text';
    case 'video':
    case 'audio':
      return 'video';
    case 'image':
      return 'image';
    case 'group':
      return 'group';
    default:
      return 'shape';
  }
};

const planned = (layer: Layer) =>
  typeof layer.properties.planRef?.value === 'string';

export function partOrigin(layer: Layer): PartOrigin {
  if (layer.code) return 'code';
  if (planned(layer)) return 'ai';
  if (layer.assetId) return 'media';
  return 'own';
}

export const partItemId = (template: MyTemplate, layer: Layer) =>
  `${template.id}::${layer.id}`;

/** The scene's top-level layers, front to back as the scene draws them. */
export function sceneParts(template: MyTemplate): ScenePart[] {
  return template.scene.layers.map((layer) => ({
    layer,
    origin: partOrigin(layer),
    kind: kindOf(layer),
    asset: layer.assetId
      ? (template.assets.find((a) => a.id === layer.assetId) ?? null)
      : null,
    itemId: partItemId(template, layer),
  }));
}

export function sceneCounts(parts: readonly ScenePart[]): SceneCounts {
  const count = (origin: PartOrigin) =>
    parts.filter((part) => part.origin === origin).length;
  return {
    ai: count('ai'),
    code: count('code'),
    media: count('media'),
    own: count('own'),
  };
}

/** One part as a record the single-item commands can place. */
export function partItem(template: MyTemplate, part: ScenePart): MineItem {
  const clips: MineClip[] = template.scene.tracks.flatMap((track) =>
    track.clips
      .filter((clip) => clip.layerId === part.layer.id)
      .map((clip) => ({
        layerId: clip.layerId,
        startTime: clip.startTime,
        duration: clip.duration,
        sourceIn: clip.sourceIn,
        sourceOut: clip.sourceOut,
        speed: clip.speed,
        metadata: structuredClone(clip.metadata ?? {}) as Record<
          string,
          unknown
        >,
      })),
  );
  return {
    id: part.itemId,
    name: part.layer.name,
    kind: part.kind,
    createdAt: template.createdAt,
    layers: [part.layer],
    clips,
    origin: part.layer.startTime,
    assets: part.asset ? [part.asset] : [],
  };
}

/** Media a part plays that the scene template cannot show any more. */
export function swappable(parts: readonly ScenePart[]): ScenePart[] {
  return parts.filter((part) => part.layer.assetId && !part.layer.code);
}

const sameKind = (a: Asset, b: Asset) => a.type === b.type;

/**
 * The template with `layerId` playing `asset` instead: the layer and its
 * clips point at the new file, the clip never reads past the new file's end,
 * the asset list keeps only what some layer still plays. Position, size and
 * animation stay. Returns null when the new file is another kind of media.
 */
export function swapPartAsset(
  template: MyTemplate,
  layerId: string,
  asset: Asset,
): MyTemplate | null {
  const layer = template.scene.layers.find((item) => item.id === layerId);
  const old = layer?.assetId
    ? template.assets.find((a) => a.id === layer.assetId)
    : undefined;
  if (!layer || (old && !sameKind(old, asset))) return null;
  const limit = asset.duration && asset.duration > 0 ? asset.duration : null;
  const layers = template.scene.layers.map((item) =>
    item.id === layerId ? { ...item, assetId: asset.id } : item,
  );
  const tracks = template.scene.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.layerId !== layerId) return clip;
      const sourceIn = Math.min(clip.sourceIn, limit ? limit - 0.1 : Infinity);
      const sourceOut = limit
        ? Math.min(clip.sourceOut, limit)
        : clip.sourceOut;
      return {
        ...clip,
        assetId: asset.id,
        sourceIn: Math.max(0, sourceIn),
        sourceOut,
        duration: Math.min(clip.duration, sourceOut - Math.max(0, sourceIn)),
      };
    }),
  }));
  const used = new Set(layers.map((item) => item.assetId).filter(Boolean));
  const assets = [
    ...template.assets.filter((a) => used.has(a.id) && a.id !== asset.id),
    asset,
  ];
  return {
    ...template,
    scene: { ...template.scene, layers, tracks },
    assets,
  };
}

/** The format a single layer really is (what Save should offer). */
export const recommendedKind = (layer: Layer): MineKind => kindOf(layer);

/**
 * The formats a layer may be saved as without surprise. A shape may be a
 * background, a sticker or an annotation; a picture a sticker or a
 * background; text only text. Anything else is a mismatch the person is
 * told about (and may still save).
 */
export function acceptableKinds(layer: Layer): readonly MineKind[] {
  const real = kindOf(layer);
  switch (real) {
    case 'text':
      return ['text', 'animation'];
    case 'shape':
      return ['shape', 'background', 'annotation', 'sticker', 'animation'];
    case 'image':
      return ['image', 'sticker', 'background', 'animation'];
    case 'video':
      return ['video', 'background', 'animation'];
    case 'animation':
      return ['animation', 'background'];
    default:
      return [real, 'shape', 'sticker', 'annotation', 'animation'];
  }
}

export const kindMismatch = (layer: Layer, chosen: MineKind): boolean =>
  !acceptableKinds(layer).includes(chosen);
