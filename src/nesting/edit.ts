// NEST (D-271): entering and leaving a nested clip to edit its children, and
// the time maps between the parent timeline and a nested clip's own frame.
// Pure state helpers: the path of entered nested clips is transient session
// state (like the entered group of D-050), never saved and never history.
import {
  nestedAnchor,
  nestedInfo,
  nestedTimeAt,
  type Clip,
  type DeepReadonly,
  type Layer,
  type Project,
  type TimedClip,
} from '../core';

/** The nested clips entered, outermost first (their group layer ids). */
export interface NestEditState {
  readonly compositionId: string | null;
  readonly path: readonly string[];
}
export const NOT_NESTED: NestEditState = Object.freeze({
  compositionId: null,
  path: Object.freeze([]) as readonly string[],
});

/** Outer (parent timeline) time → the nested clip's frame (render uses it). */
export const outerToInner = (clip: TimedClip, time: number) =>
  nestedTimeAt(clip, time);
/**
 * The nested clip's frame → outer time (forward clips; the inverse of
 * `outerToInner` inside the clip). Reversed clips map from the out point.
 */
export function innerToOuter(clip: TimedClip, time: number): number {
  const metadata = clip.metadata as Readonly<Record<string, unknown>>;
  if (clip.speed === 1 && clip.sourceIn === 0 && metadata.reversed !== true)
    return time;
  const source = time - nestedAnchor(clip);
  return metadata.reversed === true
    ? clip.startTime + (clip.sourceOut - source) / clip.speed
    : clip.startTime + (source - clip.sourceIn) / clip.speed;
}

interface Level {
  readonly group: Layer;
  readonly clip: TimedClip;
}
/** The nested clips along `path`, outermost first; throws when broken. */
export function resolveNestPath(
  input: DeepReadonly<Project>,
  compositionId: string,
  path: readonly string[],
): Level[] {
  const project = input as unknown as Project;
  const composition = project.compositions.find((c) => c.id === compositionId);
  if (!composition) throw new Error(`Unknown composition: ${compositionId}`);
  const levels: Level[] = [];
  let layers: Layer[] = composition.layers;
  let clipOf = (id: string): Clip | undefined =>
    composition.tracks.flatMap((t) => t.clips).find((c) => c.layerId === id);
  for (const id of path) {
    const group = layers.find((layer) => layer.id === id);
    const clip = group ? clipOf(id) : undefined;
    const info = clip ? nestedInfo(clip) : null;
    if (!group || !clip || !info)
      throw new Error(`Layer ${id} is not a nested clip here`);
    levels.push({ group, clip });
    layers = group.children;
    const anchor = nestedAnchor(clip);
    const inner = new Map(
      info.clips.map((r) => [
        r.clip.layerId,
        { ...r.clip, startTime: anchor + r.clip.startTime } as Clip,
      ]),
    );
    clipOf = (layerId) => inner.get(layerId);
  }
  return levels;
}

/** Enters the nested clip whose group layer is `layerId` (one level down). */
export function enterNested(
  project: DeepReadonly<Project>,
  state: NestEditState,
  compositionId: string,
  layerId: string,
): NestEditState {
  const path =
    state.compositionId === compositionId
      ? [...state.path, layerId]
      : [layerId];
  resolveNestPath(project, compositionId, path);
  return Object.freeze({ compositionId, path: Object.freeze(path) });
}
/** Leaves one level (to the parent timeline at the top). */
export function exitNested(state: NestEditState): NestEditState {
  if (state.path.length <= 1) return NOT_NESTED;
  return Object.freeze({
    compositionId: state.compositionId,
    path: Object.freeze(state.path.slice(0, -1)),
  });
}

/**
 * While editing inside nested clips: the children shown (the innermost
 * group's), and the time in their frame for the parent's playhead.
 */
export function nestedEditView(
  project: DeepReadonly<Project>,
  compositionId: string,
  state: NestEditState,
  outerTime: number,
): { readonly layers: readonly Layer[]; readonly time: number } {
  if (state.compositionId !== compositionId || !state.path.length) {
    const composition = (project as unknown as Project).compositions.find(
      (c) => c.id === compositionId,
    );
    if (!composition) throw new Error(`Unknown composition: ${compositionId}`);
    return { layers: composition.layers, time: outerTime };
  }
  const levels = resolveNestPath(project, compositionId, state.path);
  let time = outerTime;
  // Each level maps its parent's frame into its own.
  for (const level of levels) time = nestedTimeAt(level.clip, time);
  return { layers: levels.at(-1)!.group.children, time };
}

/** A kept child clip at its absolute time in its nested clip's frame. */
export function absoluteChildClip(
  nested: TimedClip & { readonly metadata: object },
  layerId: string,
): (TimedClip & { readonly id: string }) | null {
  const info = nestedInfo(nested);
  const record = info?.clips.find((r) => r.clip.layerId === layerId);
  if (!record) return null;
  return {
    ...record.clip,
    startTime: nestedAnchor(nested) + record.clip.startTime,
  };
}
