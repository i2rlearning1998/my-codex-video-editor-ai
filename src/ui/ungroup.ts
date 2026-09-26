// W2-F1 Ungroup (LYR-012, CV-020). The core UNGROUP command only removes a
// group whose transform is the identity (frozen rule). The UI therefore bakes
// the group's position, scale, rotation and opacity into each child first,
// in the same transaction, when the result can be stored exactly (D-074).
import {
  createLayer,
  findClipByLayer,
  findFreeTrack,
  localTransformMatrix,
  multiplyMatrices,
  nextTrackName,
  trackTypeForLayer,
  type Command,
  type Composition,
  type TransformValues,
} from '../core';
import type { RenderSource, SceneLayer } from '../render/adapter';
import { selectionRoots } from './selection-context';

const IDENTITY = createLayer('identity', 'group', 'Identity').transform;
const TRANSFORM_KEYS = ['position', 'rotation', 'scale', 'opacity'] as const;

const isIdentity = (layer: SceneLayer) =>
  TRANSFORM_KEYS.every(
    (key) =>
      JSON.stringify(layer.transform[key]) === JSON.stringify(IDENTITY[key]),
  );
const animated = (layer: SceneLayer) =>
  TRANSFORM_KEYS.some((key) => layer.transform[key].keyframes.length > 0);
const clean = (value: number) => {
  const rounded = Math.round(value * 1e9) / 1e9;
  return rounded === 0 ? 0 : rounded;
};

/** The child's transform once its group's transform is folded in, or null if not exact. */
export function bakeTransform(
  group: TransformValues,
  child: TransformValues,
): TransformValues | null {
  const [a, b, c, d, e, f] = multiplyMatrices(
    localTransformMatrix(group),
    localTransformMatrix(child),
  );
  const sx = Math.hypot(a, b),
    column = Math.hypot(c, d);
  if (sx === 0 || column === 0) return null;
  // T * R * S only has orthogonal columns; anything else would need a skew.
  if (Math.abs(a * c + b * d) > 1e-9 * sx * column) return null;
  const sy = (a * d - b * c) / sx;
  let rotation = (Math.atan2(b, a) * 180) / Math.PI;
  if (rotation <= -180) rotation += 360;
  return {
    position: { value: [clean(e), clean(f)] },
    rotation: { value: clean(rotation) },
    scale: { value: [clean(sx), clean(sy)] },
    opacity: {
      value: clean(group.opacity.value * child.opacity.value),
    },
  };
}

/** Why the selected groups cannot be ungrouped, or null when they can. */
export function ungroupBlocker(
  source: RenderSource,
  ids: readonly string[],
): string | null {
  const groups = selectionRoots(source, ids);
  if (!groups.length || groups.some((layer) => layer.type !== 'group'))
    return 'Select a group to ungroup it';
  for (const group of groups) {
    if (Object.keys(group.properties).length)
      return 'This group has its own settings, so it cannot be ungrouped yet';
    const clip = findClipByLayer(source.composition, group.id);
    if (clip?.track.locked) return 'The group is on a locked track';
    const metadata =
      (clip?.clip as unknown as { metadata?: object } | undefined)?.metadata ??
      {};
    if (Object.keys(metadata).length)
      return 'Remove the group’s animation or clip effects before ungrouping';
    if (isIdentity(group)) continue;
    if (animated(group))
      return 'The group is animated, so it cannot be ungrouped';
    for (const child of group.children) {
      if (animated(child))
        return 'A child is animated and the group is transformed, so it cannot be ungrouped';
      if (
        !bakeTransform(
          group.transform as TransformValues,
          child.transform as TransformValues,
        )
      )
        return 'This group is stretched and rotated in a way its children cannot keep';
    }
  }
  return null;
}

/** The commands for one "Ungroup" step and the ids to select afterwards. */
export function ungroupCommands(
  source: RenderSource,
  ids: readonly string[],
): { commands: Command[]; selected: string[] } {
  const blocker = ungroupBlocker(source, ids);
  if (blocker) throw new Error(blocker);
  const compositionId = source.composition.id;
  const commands: Command[] = [];
  const selected: string[] = [];
  // A working copy of the tracks so several children never land on one lane.
  const draft = structuredClone(source.composition as unknown as Composition);
  const later: Command[] = [];
  for (const group of selectionRoots(source, ids)) {
    if (!isIdentity(group)) {
      for (const child of group.children) {
        const baked = bakeTransform(
          group.transform as TransformValues,
          child.transform as TransformValues,
        )!;
        for (const key of TRANSFORM_KEYS)
          commands.push({
            type: 'SET_PROPERTY',
            compositionId,
            layerId: child.id,
            target: { kind: 'transform', key },
            property: {
              ...(child.transform[key] as object),
              value: baked[key].value,
            },
          } as unknown as Command);
      }
      for (const key of TRANSFORM_KEYS)
        commands.push({
          type: 'SET_PROPERTY',
          compositionId,
          layerId: group.id,
          target: { kind: 'transform', key },
          property: IDENTITY[key],
        } as unknown as Command);
    }
    const clip = findClipByLayer(source.composition, group.id);
    if (clip) {
      commands.push({
        type: 'DELETE_CLIP',
        compositionId,
        clipId: clip.clip.id,
      });
      for (const track of draft.tracks)
        track.clips = track.clips.filter((item) => item.id !== clip.clip.id);
    }
    commands.push({ type: 'UNGROUP', compositionId, groupId: group.id });
    // TL-001: children of a top-level group become top-level layers with clips.
    if (clip)
      for (const child of group.children) {
        const end = child.startTime + child.duration;
        let track = findFreeTrack(draft, child.type, child.startTime, end);
        if (!track) {
          const type = trackTypeForLayer(child.type);
          track = {
            id: crypto.randomUUID(),
            name: nextTrackName(draft, type),
            type,
            order: draft.tracks.length,
            enabled: true,
            locked: false,
            muted: false,
            clips: [],
          };
          draft.tracks.push(track);
          later.push({
            type: 'CREATE_TRACK',
            compositionId,
            track: structuredClone(track),
          });
        }
        const asset = source.assets.find((item) => item.id === child.assetId);
        const created = {
          id: crypto.randomUUID(),
          name: child.name,
          layerId: child.id,
          assetId: child.assetId,
          startTime: child.startTime,
          duration: child.duration,
          sourceIn: 0,
          sourceOut:
            asset?.duration && asset.duration > 0
              ? Math.min(child.duration, asset.duration)
              : child.duration,
          enabled: true,
          speed: 1,
          transitionMetadata: {},
          effectMetadata: {},
          metadata: {},
        };
        track.clips.push(structuredClone(created));
        later.push({
          type: 'CREATE_CLIP',
          compositionId,
          trackId: track.id,
          clip: created,
        });
      }
    selected.push(...group.children.map((child) => child.id));
  }
  return { commands: [...commands, ...later], selected };
}
