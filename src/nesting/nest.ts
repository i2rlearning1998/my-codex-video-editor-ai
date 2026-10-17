// NEST (D-271): nested (compound) clips. A nested clip is a group layer
// with one clip on the parent timeline whose `metadata.nested` keeps the
// clips its children had (src/core/nesting.ts). Nest and flatten return
// ordinary commands for one transaction (one undo step); the core keeps the
// children in the nested clip's own time frame on moves, trims and speed
// changes, and the render adapter plays them through the outer clip's trim
// and speed. DOM-free; no schema change.
import {
  createLayer,
  laneGroupOfLayer,
  MAX_CLIP_SPEED,
  MAX_NEST_DEPTH,
  NESTED_KEY,
  nestedAnchor,
  nestedInfo,
  sortedLanes,
  trackTypeForGroup,
  type Clip,
  type Command,
  type Composition,
  type DeepReadonly,
  type Layer,
  type NestedClipRecord,
  type NestedInfo,
  type Project,
  type Property,
  type Track,
} from '../core';

export interface NestResult {
  readonly label: string;
  readonly commands: Command[];
  /** The nested clip's group layer and clip. */
  readonly groupId: string;
  readonly clipId: string;
}
export interface FlattenResult {
  readonly label: string;
  readonly commands: Command[];
  /** The children back as loose layers, front order kept. */
  readonly layerIds: string[];
  /** Children the outer clip's trim cut away entirely (not restored). */
  readonly dropped: string[];
}
export interface NestOptions {
  readonly groupId?: string;
  readonly name?: string;
}

// Inputs are read only; plain types keep the checker fast (never mutated).
type ReadonlyComposition = Composition;
type ReadonlyLayer = Layer;

function compositionOf(
  project: DeepReadonly<Project>,
  compositionId: string,
): ReadonlyComposition {
  const composition = (project as unknown as Project).compositions.find(
    (c) => c.id === compositionId,
  );
  if (!composition) throw new Error(`Unknown composition: ${compositionId}`);
  return composition;
}
function locate(composition: ReadonlyComposition, clipId: string) {
  for (const track of composition.tracks) {
    const clip = track.clips.find((item) => item.id === clipId);
    if (clip) return { track, clip };
  }
  throw new Error(`Unknown clip: ${clipId}`);
}
function allIds(input: DeepReadonly<Project>): Set<string> {
  const project = input as unknown as Project;
  const ids = new Set<string>([project.id]);
  project.assets.forEach((asset) => ids.add(asset.id));
  const visit = (layers: readonly ReadonlyLayer[]) =>
    layers.forEach((layer) => {
      ids.add(layer.id);
      visit(layer.children);
    });
  for (const composition of project.compositions) {
    ids.add(composition.id);
    composition.markers.forEach((marker) => ids.add(marker.id));
    composition.tracks.forEach((track) => {
      ids.add(track.id);
      track.clips.forEach((clip) => {
        ids.add(clip.id);
        // Clips kept inside nested clips keep their ids reserved.
        nestedInfo(clip)?.clips.forEach((record) => ids.add(record.clip.id));
      });
    });
    visit(composition.layers);
  }
  return ids;
}
function freshId(ids: Set<string>, base: string): string {
  let id = base.slice(0, 120);
  for (let n = 1; ids.has(id); n++) id = `${base.slice(0, 116)}-${n}`;
  ids.add(id);
  return id;
}

/**
 * How deep nesting goes inside `layer` (0: no nested clip). Rejects a
 * malformed tree that repeats a layer (a cycle) with an Error.
 */
export function nestedDepth(
  layer: ReadonlyLayer,
  clipOf: (layerId: string) => { readonly metadata: object } | undefined,
  seen: Set<string> = new Set(),
): number {
  if (seen.has(layer.id))
    throw new Error(`Nesting cycle: layer ${layer.id} contains itself`);
  seen.add(layer.id);
  const info =
    layer.type === 'group'
      ? nestedInfo(clipOf(layer.id) ?? { metadata: {} })
      : null;
  const inner = info
    ? new Map(info.clips.map((record) => [record.clip.layerId, record.clip]))
    : null;
  let depth = 0;
  for (const child of layer.children)
    depth = Math.max(
      depth,
      nestedDepth(child, inner ? (id) => inner.get(id) : clipOf, seen),
    );
  seen.delete(layer.id);
  return info ? depth + 1 : depth;
}

/**
 * The commands that nest `clipIds` (top-level clips, any lanes, not audio)
 * into one nested clip on the parent timeline: a group of their layers with
 * one clip spanning them, on a new lane at the topmost selected lane's
 * place. Their clips are kept inside the nested clip. Run as one transaction.
 */
export function nestClips(
  project: DeepReadonly<Project>,
  compositionId: string,
  clipIds: readonly string[],
  options: NestOptions = {},
): NestResult {
  const composition = compositionOf(project, compositionId);
  if (!clipIds.length) throw new Error('Choose at least one clip to nest');
  if (new Set(clipIds).size !== clipIds.length)
    throw new Error('A clip is chosen twice');
  const lanes = sortedLanes(composition.tracks);
  const picked = clipIds.map((id) => locate(composition, id));
  const layers = new Map(composition.layers.map((l, i) => [l.id, { l, i }]));
  const clipOf = (layerId: string) => {
    for (const track of composition.tracks)
      for (const clip of track.clips) if (clip.layerId === layerId) return clip;
    return undefined;
  };
  for (const { track, clip } of picked) {
    if (track.locked) throw new Error(`Track ${track.name} is locked`);
    const layer = layers.get(clip.layerId)?.l;
    if (!layer) throw new Error(`Clip ${clip.id} is not a top-level clip`);
    if (layer.type === 'audio' || track.type === 'audio')
      throw new Error('Audio clips cannot be nested yet');
  }
  // Cycles and depth: the new clip is one level above the deepest inside.
  const seen = new Set<string>();
  let depth = 0;
  for (const { clip } of picked)
    depth = Math.max(
      depth,
      nestedDepth(layers.get(clip.layerId)!.l, clipOf, seen),
    );
  if (depth + 1 > MAX_NEST_DEPTH)
    throw new Error(
      `Nesting is limited to ${MAX_NEST_DEPTH} levels; this would make ${depth + 1}`,
    );
  const start = Math.min(...picked.map(({ clip }) => clip.startTime));
  const end = Math.max(
    ...picked.map(({ clip }) => clip.startTime + clip.duration),
  );
  const ids = allIds(project);
  const groupId = options.groupId ?? freshId(ids, 'nested');
  if (options.groupId) {
    if (ids.has(groupId)) throw new Error(`The id ${groupId} is taken`);
    ids.add(groupId);
  }
  const clipId = freshId(ids, `${groupId}_clip`);
  const trackId = freshId(ids, `${groupId}_track`);
  const name = options.name ?? 'Nested clip';
  // Track ranks: the selected lanes top to bottom.
  const tracks = [...new Set(picked.map(({ track }) => track.id))].sort(
    (a, b) =>
      lanes.findIndex((t) => t.id === a) - lanes.findIndex((t) => t.id === b),
  );
  const records: NestedClipRecord[] = picked.map(({ track, clip }) => ({
    trackId: track.id,
    trackName: track.name,
    trackType: track.type,
    trackRank: tracks.indexOf(track.id),
    clip: {
      ...(JSON.parse(JSON.stringify(clip)) as NestedClipRecord['clip']),
      startTime: clip.startTime - start,
    },
  }));
  const duration = end - start;
  const nested: NestedInfo = { version: 1, duration, clips: records };
  // The lane group of the result: text and shapes unless a picture is in.
  const preview = createLayer('preview', 'group', name);
  preview.children = picked.map(
    ({ clip }) => layers.get(clip.layerId)!.l as unknown as Layer,
  );
  const trackType = trackTypeForGroup(laneGroupOfLayer(preview));
  const topIndex = lanes.findIndex((track) => track.id === tracks[0]);
  const commands: Command[] = [
    {
      type: 'GROUP',
      compositionId,
      layerIds: picked.map(({ clip }) => clip.layerId),
      groupId,
      name,
    },
    {
      type: 'SET_LAYER_TIMING',
      compositionId,
      layerId: groupId,
      startTime: start,
      duration,
    },
    ...picked.map(({ clip }): Command => ({
      type: 'DELETE_CLIP',
      compositionId,
      clipId: clip.id,
    })),
    {
      type: 'CREATE_TRACK',
      compositionId,
      track: {
        id: trackId,
        name,
        type: trackType,
        order: 1_000_000,
        enabled: true,
        locked: false,
        muted: false,
        clips: [],
      },
    },
    { type: 'MOVE_TRACK', compositionId, trackId, index: topIndex },
    {
      type: 'CREATE_CLIP',
      compositionId,
      trackId,
      clip: {
        id: clipId,
        name,
        layerId: groupId,
        assetId: null,
        startTime: start,
        duration,
        sourceIn: 0,
        sourceOut: duration,
        enabled: true,
        speed: 1,
        transitionMetadata: {},
        effectMetadata: {},
        metadata: { [NESTED_KEY]: nested as never },
      },
    },
  ];
  return { label: 'Nest clips', commands, groupId, clipId };
}

const IDENTITY = JSON.stringify(
  createLayer('identity', 'group', 'I').transform,
);

/**
 * The commands that turn a nested clip back into loose clips: its children
 * become top-level layers again with their kept clips, on their lanes (the
 * same ids when free), timed through the outer clip's trim and speed. Run as
 * one transaction. A nest followed by a flatten restores the layers, their
 * timing and their lanes.
 */
export function flattenNested(
  project: DeepReadonly<Project>,
  compositionId: string,
  clipId: string,
): FlattenResult {
  const composition = compositionOf(project, compositionId);
  const { track, clip } = locate(composition, clipId);
  const info = nestedInfo(clip);
  if (!info) throw new Error(`Clip ${clipId} is not a nested clip`);
  if (track.locked) throw new Error(`Track ${track.name} is locked`);
  const groupIndex = composition.layers.findIndex((l) => l.id === clip.layerId);
  const group = composition.layers[groupIndex];
  if (!group || group.type !== 'group')
    throw new Error('A nested clip must be a top-level group');
  if (JSON.stringify(group.transform) !== IDENTITY)
    throw new Error(
      "Reset the nested clip's position, rotation, scale and opacity before flattening it",
    );
  const metadata = clip.metadata as Readonly<Record<string, unknown>>;
  if (metadata.reversed === true || metadata.freezeFrame !== undefined)
    throw new Error(
      'Flatten needs a forward nested clip without a freeze frame',
    );
  const s = clip.speed;
  const anchor = nestedAnchor(clip);
  const identity = s === 1 && clip.sourceIn === 0;
  // Inner frame time → outer time.
  const map = (time: number) =>
    identity ? time : clip.startTime + (time - anchor - clip.sourceIn) / s;
  const windowStart = clip.startTime;
  const windowEnd = clip.startTime + clip.duration;
  const records = new Map(info.clips.map((r) => [r.clip.layerId, r]));
  const ids = allIds(project);
  // The kept clips' ids are free again once the nested clip is gone.
  info.clips.forEach((record) => ids.delete(record.clip.id));

  const mapProperty = (property: Property): Property => {
    const copy = JSON.parse(JSON.stringify(property)) as Property;
    if (identity || !copy.keyframes.length) return copy;
    const byTime = new Map<number, (typeof copy.keyframes)[number]>();
    for (const frame of copy.keyframes) {
      const time = Math.max(0, map(frame.time));
      byTime.set(time, { ...frame, time });
    }
    copy.keyframes = [...byTime.values()].sort(
      (a, b) => a.time - b.time,
    ) as never;
    return copy;
  };
  // Re-times a layer subtree from the inner frame to the outer timeline.
  // A nested clip inside keeps its own frame: only its own keyframes are
  // re-timed, and its children follow its anchor (`innerShift`).
  const bake = (layer: ReadonlyLayer, innerShift?: number): Layer => {
    const visit = (own: ReadonlyLayer, deep: boolean): Layer => {
      const node = JSON.parse(JSON.stringify(own)) as Layer;
      node.startTime = Math.max(0, map(own.startTime));
      node.duration = own.duration / (identity ? 1 : s);
      node.transform = Object.fromEntries(
        Object.entries(own.transform).map(([k, v]) => [k, mapProperty(v)]),
      ) as Layer['transform'];
      node.properties = Object.fromEntries(
        Object.entries(own.properties).map(([k, v]) => [k, mapProperty(v)]),
      );
      if (deep) node.children = own.children.map((c) => visit(c, true));
      return node;
    };
    if (innerShift === undefined) return visit(layer, true);
    const node = visit(layer, false);
    node.children = bakeNestedChild(layer, innerShift).children;
    return node;
  };

  const layersOut: Layer[] = [];
  const clipsOut: { record: NestedClipRecord; clip: Clip }[] = [];
  const dropped: string[] = [];
  for (const child of group.children) {
    const record = records.get(child.id);
    if (!record) {
      layersOut.push(bake(child));
      continue;
    }
    const kept = record.clip;
    const media = kept.assetId !== null || child.code !== undefined;
    const reversed =
      (kept.metadata as Record<string, unknown>).reversed === true;
    const speed = media && !identity ? kept.speed * s : kept.speed;
    if (speed > MAX_CLIP_SPEED + 1e-9)
      throw new Error(
        `Clip ${kept.name} would play faster than ${MAX_CLIP_SPEED}x when flattened`,
      );
    let from = map(anchor + kept.startTime);
    let to = map(anchor + kept.startTime + kept.duration);
    let { sourceIn, sourceOut } = kept;
    const head = Math.max(0, windowStart - from);
    const tail = Math.max(0, to - windowEnd);
    if (to - tail - (from + head) <= 1e-9) {
      dropped.push(child.id);
      continue;
    }
    from += head;
    to -= tail;
    const length = to - from;
    if (head || tail || !identity) {
      if (reversed) {
        sourceOut -= head * speed;
        sourceIn = sourceOut - length * speed;
      } else {
        sourceIn += head * speed;
        sourceOut = sourceIn + length * speed;
      }
    }
    // A nested clip inside keeps its frame: its children follow its anchor.
    const innerShift = nestedInfo(kept)
      ? from -
        sourceIn / speed -
        (anchor + kept.startTime - kept.sourceIn / kept.speed)
      : undefined;
    const layer = bake(child, innerShift);
    layer.startTime = from;
    layer.duration = length;
    layersOut.push(layer);
    const restored = JSON.parse(JSON.stringify(kept)) as Clip;
    restored.startTime = from;
    restored.duration = length;
    restored.sourceIn = Math.max(0, sourceIn);
    restored.sourceOut = Math.max(restored.sourceIn + 1e-9, sourceOut);
    restored.speed = speed;
    if (ids.has(restored.id)) restored.id = freshId(ids, restored.id);
    else ids.add(restored.id);
    clipsOut.push({ record, clip: restored });
  }

  const commands: Command[] = [
    { type: 'DELETE_CLIP', compositionId, clipId },
    { type: 'DELETE_LAYER', compositionId, layerId: group.id },
    ...layersOut.map((layer, i): Command => ({
      type: 'CREATE_LAYER',
      compositionId,
      parentId: null,
      index: groupIndex + i,
      layer,
    })),
  ];
  // Lanes: the kept lanes (by rank) at the nested clip's lane place.
  const lanes = sortedLanes(composition.tracks);
  const base = lanes.findIndex((t) => t.id === track.id);
  const byRank = new Map<number, { record: NestedClipRecord; clip: Clip }[]>();
  for (const item of clipsOut)
    byRank.set(item.record.trackRank, [
      ...(byRank.get(item.record.trackRank) ?? []),
      item,
    ]);
  let created = 0;
  for (const rank of [...byRank.keys()].sort((a, b) => a - b)) {
    const items = byRank.get(rank)!;
    const first = items[0]!.record;
    const existing = composition.tracks.find(
      (t) => t.id === first.trackId && t.id !== track.id,
    );
    const free =
      existing &&
      !existing.locked &&
      items.every(({ clip: c }) =>
        existing.clips.every(
          (other) =>
            other.startTime + other.duration <= c.startTime + 1e-9 ||
            other.startTime >= c.startTime + c.duration - 1e-9,
        ),
      );
    let target = existing && free ? existing.id : '';
    if (!target) {
      target = ids.has(first.trackId)
        ? freshId(ids, first.trackId)
        : (ids.add(first.trackId), first.trackId);
      commands.push(
        {
          type: 'CREATE_TRACK',
          compositionId,
          track: {
            id: target,
            name: first.trackName,
            type: first.trackType,
            order: 1_000_000 + created,
            enabled: true,
            locked: false,
            muted: false,
            clips: [],
          } satisfies Track,
        },
        {
          type: 'MOVE_TRACK',
          compositionId,
          trackId: target,
          index: base + created,
        },
      );
      created++;
    }
    for (const { clip: c } of items)
      commands.push({
        type: 'CREATE_CLIP',
        compositionId,
        trackId: target,
        clip: c,
      });
  }
  return {
    label: 'Flatten nested clip',
    commands,
    layerIds: layersOut.map((layer) => layer.id),
    dropped,
  };
}

/** A nested child group keeps its own frame: shift its children only. */
function bakeNestedChild(layer: ReadonlyLayer, shift: number): Layer {
  const copy = JSON.parse(JSON.stringify(layer)) as Layer;
  const move = (p: Property): Property =>
    shift === 0 || !p.keyframes.length
      ? p
      : ({
          ...p,
          keyframes: p.keyframes.map((k) => ({
            ...k,
            time: Math.max(0, k.time + shift),
          })),
        } as Property);
  const visit = (nodes: Layer[]) =>
    nodes.forEach((node) => {
      node.startTime = Math.max(0, node.startTime + shift);
      node.transform = Object.fromEntries(
        Object.entries(node.transform).map(([k, v]) => [k, move(v)]),
      ) as Layer['transform'];
      node.properties = Object.fromEntries(
        Object.entries(node.properties).map(([k, v]) => [k, move(v)]),
      );
      visit(node.children);
    });
  visit(copy.children);
  return copy;
}
