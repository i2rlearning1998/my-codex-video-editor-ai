// FIX1 F6: editing inside a nested clip on the timeline. `unpackNested`
// turns a nested clip's inside into an ordinary scene (a scratch project:
// its children are top-level layers again and its kept clips sit on their
// own lanes, in the nested clip's own time, 0 = the inside's start), so the
// timeline, the canvas tools and every edit work on it unchanged. After an
// edit, `packNested` writes the scratch scene back as one
// SET_NESTED_CONTENT command on the real project (one undo step), keeping
// the outer clip's trim and growing or shrinking it with the inside when it
// was untrimmed. Entering several levels deep unpacks level by level and
// packs back up the same way. Pure functions; DOM-free.
import {
  applyCommand,
  nestedAnchor,
  nestedInfo,
  sortedLanes,
  validateCommand,
  validateProject,
  type Clip,
  type Command,
  type Composition,
  type DeepReadonly,
  type Layer,
  type NestedClipRecord,
  type Project,
  type Property,
  type Track,
} from '../core';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Moves layers (their start, keyframes and children) by `delta` seconds. */
function shiftLayers(layers: Layer[], delta: number): void {
  if (delta === 0) return;
  const move = (property: Property): Property => {
    if (!property.keyframes.length) return property;
    const byTime = new Map<number, (typeof property.keyframes)[number]>();
    for (const frame of property.keyframes) {
      const time = Math.max(0, frame.time + delta);
      byTime.set(time, { ...frame, time });
    }
    return {
      ...property,
      keyframes: [...byTime.values()].sort((a, b) => a.time - b.time),
    } as Property;
  };
  for (const layer of layers) {
    layer.startTime = Math.max(0, layer.startTime + delta);
    layer.transform = Object.fromEntries(
      Object.entries(layer.transform).map(([k, v]) => [k, move(v)]),
    ) as Layer['transform'];
    layer.properties = Object.fromEntries(
      Object.entries(layer.properties).map(([k, v]) => [k, move(v)]),
    );
    shiftLayers(layer.children, delta);
  }
}

function nestedOf(composition: Composition, layerId: string) {
  const group = composition.layers.find((layer) => layer.id === layerId);
  const clip = composition.tracks
    .flatMap((track) => track.clips)
    .find((item) => item.layerId === layerId);
  const info = clip ? nestedInfo(clip) : null;
  if (!group || group.type !== 'group' || !clip || !info)
    throw new Error(`Layer ${layerId} is not a nested clip here`);
  return { group, clip, info };
}

/**
 * The scratch project for editing inside the nested clip `layerId`: the
 * composition `compositionId` holds only the nested clip's inside (its
 * children with their kept clips on their lanes, in inner time).
 */
export function unpackNested(
  input: DeepReadonly<Project>,
  compositionId: string,
  layerId: string,
): Project {
  const project = clone(input) as unknown as Project;
  const composition = project.compositions.find((c) => c.id === compositionId);
  if (!composition) throw new Error(`Unknown composition: ${compositionId}`);
  const { group, clip, info } = nestedOf(composition, layerId);
  const anchor = nestedAnchor(clip);
  const layers = clone(group.children);
  shiftLayers(layers, -anchor);
  const byRank = new Map<number, NestedClipRecord[]>();
  for (const record of info.clips)
    byRank.set(record.trackRank, [
      ...(byRank.get(record.trackRank) ?? []),
      record,
    ]);
  const tracks: Track[] = [...byRank.keys()]
    .sort((a, b) => a - b)
    .map((rank, order) => {
      const first = byRank.get(rank)![0]!;
      return {
        id: first.trackId,
        name: first.trackName,
        type: first.trackType,
        order,
        enabled: true,
        locked: false,
        muted: false,
        clips: byRank.get(rank)!.map((record) => clone(record.clip) as Clip),
      };
    });
  composition.layers = layers;
  composition.tracks = tracks;
  composition.markers = [];
  return validateProject(project);
}

/**
 * The SET_NESTED_CONTENT command writing `inside` (an edited scratch
 * composition) back into the nested clip `layerId` of `input`.
 */
export function packNested(
  input: DeepReadonly<Project>,
  compositionId: string,
  layerId: string,
  /** The edited scratch composition (read only). */
  inside: object,
): Command {
  const project = input as unknown as Project;
  const composition = project.compositions.find((c) => c.id === compositionId);
  if (!composition) throw new Error(`Unknown composition: ${compositionId}`);
  const { clip, info } = nestedOf(composition, layerId);
  const scratch = inside as unknown as Composition;
  const anchor = nestedAnchor(clip);
  const children = clone(scratch.layers);
  shiftLayers(children, anchor);
  const lanes = sortedLanes(scratch.tracks);
  const clips: NestedClipRecord[] = lanes.flatMap((track, rank) =>
    track.clips.map((item) => ({
      trackId: track.id,
      trackName: track.name,
      trackType: track.type,
      trackRank: rank,
      clip: clone(item) as NestedClipRecord['clip'],
    })),
  );
  if (!clips.length)
    throw new Error('A nested clip needs at least one clip inside');
  const duration = Math.max(
    ...clips.map((record) => record.clip.startTime + record.clip.duration),
  );
  // The outer clip follows the inside's length when it was untrimmed;
  // a trim is kept, clamped to the new inside.
  const untrimmed =
    clip.sourceIn <= 1e-9 && Math.abs(clip.sourceOut - info.duration) <= 1e-6;
  const sourceIn = untrimmed ? 0 : Math.min(clip.sourceIn, duration * 0.999);
  let sourceOut = untrimmed
    ? duration
    : Math.max(sourceIn + 1e-6, Math.min(clip.sourceOut, duration));
  // Growing never runs into the next clip on the nested clip's lane.
  const lane = composition.tracks.find((t) => t.clips.includes(clip));
  const next = Math.min(
    Infinity,
    ...(lane?.clips ?? [])
      .filter((other) => other !== clip && other.startTime >= clip.startTime)
      .map((other) => other.startTime),
  );
  if (clip.startTime + (sourceOut - sourceIn) / clip.speed > next + 1e-9)
    sourceOut = sourceIn + (next - clip.startTime) * clip.speed;
  return validateCommand({
    type: 'SET_NESTED_CONTENT',
    compositionId,
    layerId,
    children,
    nested: { version: 1, duration, clips },
    sourceIn,
    sourceOut,
    duration: (sourceOut - sourceIn) / clip.speed,
  });
}

/** `command` applied to a copy of `input` (validated), for scratch levels. */
export function applyScratch(
  input: object,
  commands: readonly Command[],
): Project {
  const draft = clone(input) as unknown as Project;
  for (const command of commands) applyCommand(draft, validateCommand(command));
  return validateProject(draft);
}

/** The scratch projects along `path`, outermost first (index 0 = level 1). */
export function unpackPath(
  input: DeepReadonly<Project>,
  compositionId: string,
  path: readonly string[],
): Project[] {
  const levels: Project[] = [];
  let current = input;
  for (const layerId of path) {
    const next = unpackNested(current, compositionId, layerId);
    levels.push(next);
    current = next as unknown as DeepReadonly<Project>;
  }
  return levels;
}

/**
 * The one command for the real project after the innermost scratch scene
 * became `edited`: packs each level back into its parent, up to the top.
 */
export function packPath(
  input: DeepReadonly<Project>,
  compositionId: string,
  path: readonly string[],
  levels: readonly Project[],
  edited: object,
): Command {
  let inside = (edited as unknown as Project).compositions.find(
    (c) => c.id === compositionId,
  )!;
  for (let depth = path.length - 1; depth >= 1; depth--) {
    const parent = levels[depth - 1]!;
    const command = packNested(
      parent as unknown as DeepReadonly<Project>,
      compositionId,
      path[depth]!,
      inside,
    );
    inside = applyScratch(parent, [command]).compositions.find(
      (c) => c.id === compositionId,
    )!;
  }
  return packNested(input, compositionId, path[0]!, inside);
}
