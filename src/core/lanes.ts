// J7: the lane model (Clipchamp). Every track (lane) belongs to one of three
// groups, top to bottom: text and shapes, visuals, audio. A clip never
// leaves its group. Lane order is the canvas's stacking order (the top lane
// is in front), so the canvas draws top-level clip layers by lane.
import type { Track } from './model';

export type LaneGroup = 'text' | 'visual' | 'audio';
/** Top to bottom on the timeline (front to back on the canvas). */
export const LANE_GROUPS: readonly LaneGroup[] = ['text', 'visual', 'audio'];

export function laneGroupOfTrack(type: Track['type']): LaneGroup {
  return type === 'audio' ? 'audio' : type === 'video' ? 'visual' : 'text';
}
/** The track type a new lane of a group gets. */
export function trackTypeForGroup(group: LaneGroup): Track['type'] {
  return group === 'audio' ? 'audio' : group === 'visual' ? 'video' : 'text';
}

/** Enough of a layer to decide its group (works on drafts and snapshots). */
export interface LaneLayer {
  readonly type: string;
  readonly properties?: Readonly<
    Record<string, { readonly type: string; readonly value: unknown }>
  >;
  readonly children?: readonly LaneLayer[];
}
const stringProperty = (layer: LaneLayer, key: string) => {
  const property = layer.properties?.[key];
  return property?.type === 'string' ? String(property.value) : '';
};
/** A background (library backgrounds and template backdrops) is a visual. */
const isBackground = (layer: LaneLayer) =>
  stringProperty(layer, 'role') === 'background';
/**
 * The group a layer's clip belongs to. Video, image and backgrounds are
 * visuals; text, shapes and drawings (annotations over the picture) are text
 * and shapes; a group is text and shapes when everything in it is, else a
 * visual.
 */
export function laneGroupOfLayer(layer: LaneLayer | string): LaneGroup {
  if (typeof layer === 'string')
    return layer === 'audio'
      ? 'audio'
      : layer === 'video' || layer === 'image'
        ? 'visual'
        : 'text';
  if (layer.type === 'audio') return 'audio';
  if (layer.type === 'video' || layer.type === 'image') return 'visual';
  if (isBackground(layer)) return 'visual';
  if (layer.type === 'shape') return 'text';
  if (layer.type === 'group') {
    const textual = (item: LaneLayer): boolean =>
      item.type === 'text' ||
      (item.type === 'shape' && !isBackground(item)) ||
      (item.type === 'group' && (item.children ?? []).every(textual));
    return (layer.children ?? []).every(textual) ? 'text' : 'visual';
  }
  return 'text';
}
/** J7: a lane accepts the layers of its own group only. */
export function laneAccepts(
  trackType: Track['type'],
  layer: LaneLayer | string,
) {
  return laneGroupOfTrack(trackType) === laneGroupOfLayer(layer);
}

interface OrderedTrack {
  readonly id: string;
  readonly type: Track['type'];
  readonly order: number;
}
/** Lanes top to bottom, in their own order (U1: no fixed group order). */
export function sortedLanes<T extends OrderedTrack>(tracks: readonly T[]): T[] {
  return [...tracks].sort((a, b) => a.order - b.order);
}
/**
 * Where a new lane of a group goes (an index for MOVE_TRACK): above the
 * group's top lane ('top') or below its bottom lane ('bottom'); with no lane
 * of the group yet, at the top (audio: at the bottom).
 */
export function laneInsertIndex(
  tracks: readonly OrderedTrack[],
  group: LaneGroup,
  position: 'top' | 'bottom' = 'top',
): number {
  const lanes = sortedLanes(tracks);
  const indices = lanes
    .map((lane, index) => (laneGroupOfTrack(lane.type) === group ? index : -1))
    .filter((index) => index >= 0);
  if (!indices.length) return group === 'audio' ? lanes.length : 0;
  return position === 'top' ? indices[0]! : indices.at(-1)! + 1;
}

interface ClipOf {
  readonly layerId: string;
}
/**
 * Top-level layers in drawing order (back to front): the bottom lane first,
 * the top lane last; layers on one lane (never at the same time) and layers
 * without a clip keep their array order, the latter behind every lane.
 */
export function drawOrder<L extends { readonly id: string }>(composition: {
  readonly layers: readonly L[];
  readonly tracks: readonly (OrderedTrack & {
    readonly clips: readonly ClipOf[];
  })[];
}): L[] {
  const lanes = sortedLanes(composition.tracks);
  const rank = new Map<string, number>();
  lanes.forEach((lane, index) =>
    lane.clips.forEach((clip) => rank.set(clip.layerId, index)),
  );
  const back = lanes.length;
  return composition.layers
    .map((layer, index) => ({ layer, index, rank: rank.get(layer.id) ?? back }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map((item) => item.layer);
}

/**
 * J7: audio has a single lane. The start nearest to `start` (ties go later)
 * where a clip of `duration` fits between `clips`.
 */
export function nearestFreeStart(
  clips: readonly { readonly startTime: number; readonly duration: number }[],
  start: number,
  duration: number,
): number {
  const spans = [...clips].sort((a, b) => a.startTime - b.startTime);
  const fits = (at: number) =>
    at >= 0 &&
    spans.every(
      (clip) =>
        clip.startTime + clip.duration <= at + 1e-9 ||
        clip.startTime >= at + duration - 1e-9,
    );
  if (fits(start)) return start;
  const candidates = [0];
  for (const clip of spans) {
    candidates.push(clip.startTime + clip.duration);
    candidates.push(clip.startTime - duration);
  }
  return candidates
    .filter(fits)
    .sort((a, b) => Math.abs(a - start) - Math.abs(b - start) || b - a)[0]!;
}

/**
 * J7: what the validator lets a track hold, by group (the UI places by the
 * finer `laneAccepts`). Text-and-shape lanes hold text, shapes and groups;
 * visual lanes hold pictures, backgrounds (shapes) and groups; audio, audio.
 */
export function trackHolds(trackType: Track['type'], layerType: string) {
  return trackType === 'audio'
    ? layerType === 'audio'
    : trackType === 'video'
      ? ['video', 'image', 'shape', 'group'].includes(layerType)
      : ['text', 'shape', 'group'].includes(layerType);
}

interface SyncComposition<L extends { readonly id: string }> {
  layers: L[];
  tracks: (OrderedTrack & { order: number; clips: readonly ClipOf[] })[];
}
/**
 * J7, U1: keeps a composition's lane order numbers dense (lanes may sit in
 * any order) and its top-level layers in lane order, so the top lane paints
 * in front. Mutates a draft.
 */
export function syncLanes<L extends { readonly id: string }>(
  composition: SyncComposition<L>,
): void {
  composition.tracks = sortedLanes(composition.tracks);
  composition.tracks.forEach((track, order) => (track.order = order));
  composition.layers = drawOrder(composition);
}

interface PackClip {
  readonly layerId: string;
  readonly startTime: number;
  readonly duration: number;
}
interface PackTrack<C extends PackClip> {
  readonly id: string;
  readonly type: Track['type'];
  order: number;
  clips: C[];
}
const overlapping = (a: PackClip, b: PackClip) =>
  a.startTime < b.startTime + b.duration - 1e-9 &&
  b.startTime < a.startTime + a.duration - 1e-9;
/**
 * J7: the layers array decides who is in front where two clips overlap in
 * time. When a group's lanes disagree with it (an older document), the
 * group's clips are packed again, front to back: each clip takes the first
 * lane below every overlapping clip in front of it. Lanes are reused in order
 * and `makeLane` adds more at the group's bottom. Mutates a draft; returns
 * whether anything moved.
 */
export function packLanesByOrder<C extends PackClip, T extends PackTrack<C>>(
  composition: { layers: readonly { readonly id: string }[]; tracks: T[] },
  makeLane: (group: LaneGroup) => T,
): boolean {
  const z = new Map(
    composition.layers.map((layer, index) => [layer.id, index]),
  );
  let changed = false;
  for (const group of LANE_GROUPS) {
    const lanes = sortedLanes(composition.tracks).filter(
      (track) => laneGroupOfTrack(track.type) === group,
    );
    const clips = lanes.flatMap((lane, rank) =>
      lane.clips
        .filter((clip) => z.has(clip.layerId))
        .map((clip) => ({ clip, rank })),
    );
    const consistent = clips.every(({ clip: a, rank: ra }) =>
      clips.every(
        ({ clip: b, rank: rb }) =>
          a === b ||
          !overlapping(a, b) ||
          z.get(a.layerId)! > z.get(b.layerId)! === ra < rb,
      ),
    );
    if (consistent) continue;
    changed = true;
    const moving = new Set(clips.map(({ clip }) => clip));
    for (const lane of lanes)
      lane.clips = lane.clips.filter((clip) => !moving.has(clip));
    const placed: { clip: C; rank: number }[] = [];
    const frontToBack = [...moving].sort(
      (a, b) => z.get(b.layerId)! - z.get(a.layerId)!,
    );
    for (const clip of frontToBack) {
      const bound = Math.max(
        -1,
        ...placed
          .filter((item) => overlapping(item.clip, clip))
          .map((item) => item.rank),
      );
      let rank = bound + 1;
      while (
        lanes[rank] &&
        lanes[rank]!.clips.some((other) => overlapping(other, clip))
      )
        rank++;
      if (!lanes[rank]) {
        const lane = makeLane(group);
        lane.order =
          Math.max(-1, ...composition.tracks.map((track) => track.order)) + 1;
        composition.tracks.push(lane);
        lanes.push(lane);
        rank = lanes.length - 1;
      }
      lanes[rank]!.clips.push(clip);
      placed.push({ clip, rank });
    }
    for (const lane of lanes)
      lane.clips.sort((a, b) => a.startTime - b.startTime);
  }
  return changed;
}
