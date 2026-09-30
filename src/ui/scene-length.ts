// G3: a scene's length, set from the scene bar like Canva's page duration.
// Schema 5 derives a composition's duration from its content, so a new
// length is made by retiming clips: clips ending at the scene's end grow to
// the new end (as far as their media allows), and a shorter length trims every
// clip that runs past it. Nothing is deleted; a length that would cut a clip
// away entirely is refused with a message. One undo step.
import { clipTrimBounds, retimeClip, type Command } from '../core';
import { formatNumber, t } from '../i18n';
import type { RenderSource } from '../render/adapter';

export function sceneLengthCommands(
  source: RenderSource,
  length: number,
): Command[] {
  const { composition } = source;
  const frame = 1 / composition.fps;
  const end = composition.duration;
  if (!(length >= frame) || !Number.isFinite(length))
    throw new RangeError(t('scene.lengthRange'));
  if (Math.abs(length - end) < frame / 2) return [];
  const clips = composition.tracks.flatMap((track) =>
    track.locked ? [] : track.clips.map((clip) => clip),
  );
  if (!clips.length) throw new Error(t('scene.lengthEmpty'));
  const mediaDuration = (assetId: string | null) => {
    const asset = source.assets.find((item) => item.id === assetId);
    return asset && (asset.type === 'video' || asset.type === 'audio')
      ? (asset.duration ?? undefined)
      : undefined;
  };
  const commands: Command[] = [];
  for (const clip of clips) {
    const clipEnd = clip.startTime + clip.duration;
    let next: number;
    if (length > end) {
      if (Math.abs(clipEnd - end) >= frame / 2) continue;
      const bounds = clipTrimBounds(
        composition,
        clip.id,
        mediaDuration(clip.assetId),
      );
      next = Math.min(bounds.maxEnd, length);
    } else {
      if (clipEnd <= length + 1e-9) continue;
      if (clip.startTime >= length - frame / 2)
        throw new Error(
          t('scene.lengthCutsClip', {
            name: clip.name,
            time: formatNumber(Math.round(clip.startTime * 100) / 100),
          }),
        );
      next = length;
    }
    if (Math.abs(next - clipEnd) < 1e-9) continue;
    commands.push({
      type: 'SET_CLIP_TIMING',
      compositionId: composition.id,
      clipId: clip.id,
      ...retimeClip(clip, clip.startTime, next - clip.startTime, 'right'),
    });
  }
  // Layers without a clip of their own (children inside a group) have their
  // own times, which also make the scene's length: they follow the same rule.
  const linked = new Set(
    composition.tracks.flatMap((track) =>
      track.clips.map((clip) => clip.layerId),
    ),
  );
  const visit = (layers: RenderSource['composition']['layers']) => {
    for (const layer of layers) {
      if (!linked.has(layer.id)) {
        const layerEnd = layer.startTime + layer.duration;
        let next: number | null = null;
        if (length > end) {
          if (Math.abs(layerEnd - end) < frame / 2) next = length;
        } else if (layerEnd > length + 1e-9) {
          if (layer.startTime >= length - frame / 2)
            throw new Error(
              t('scene.lengthCutsClip', {
                name: layer.name,
                time: formatNumber(Math.round(layer.startTime * 100) / 100),
              }),
            );
          next = length;
        }
        if (next !== null && Math.abs(next - layerEnd) > 1e-9)
          commands.push({
            type: 'SET_LAYER_TIMING',
            compositionId: composition.id,
            layerId: layer.id,
            startTime: layer.startTime,
            duration: next - layer.startTime,
          });
      }
      visit(layer.children);
    }
  };
  visit(composition.layers);
  return commands;
}
