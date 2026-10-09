import {
  LANE_GROUPS,
  laneAccepts,
  laneGroupOfLayer,
  laneGroupOfTrack,
  packLanesByOrder,
  sortedLanes,
  syncLanes,
  trackTypeForGroup,
  type LaneLayer,
} from './lanes';
import {
  validateProject,
  type Clip,
  type Composition,
  type DeepReadonly,
  type Layer,
  type Project,
  type Track,
} from './model';

export interface ClipLocation {
  readonly clip: DeepReadonly<Clip>;
  readonly track: DeepReadonly<Track>;
  readonly index: number;
}

export function findClip(
  composition: DeepReadonly<Composition>,
  clipId: string,
): ClipLocation | null {
  for (const track of composition.tracks) {
    const index = track.clips.findIndex((clip) => clip.id === clipId);
    if (index >= 0) return { clip: track.clips[index]!, track, index };
  }
  return null;
}

export function findClipByLayer(
  composition: DeepReadonly<Composition>,
  layerId: string,
): ClipLocation | null {
  for (const track of composition.tracks) {
    const index = track.clips.findIndex((clip) => clip.layerId === layerId);
    if (index >= 0) return { clip: track.clips[index]!, track, index };
  }
  return null;
}

export function effectiveLayerTiming(
  composition: DeepReadonly<Composition>,
  layer: {
    readonly id: string;
    readonly startTime: number;
    readonly duration: number;
  },
) {
  const location = findClipByLayer(composition, layer.id);
  return location
    ? {
        startTime: location.clip.startTime,
        duration: location.clip.duration,
        enabled: location.clip.enabled && location.track.enabled,
      }
    : { startTime: layer.startTime, duration: layer.duration, enabled: true };
}

/** Speed range accepted by SET_CLIP_SPEED (the schema itself allows up to 16). */
export const MIN_CLIP_SPEED = 0.1;
// J15: the Speed slider reaches 16x (its ticks: 0.1, 1, 2, 4, 16).
export const MAX_CLIP_SPEED = 16;
/** Clip time effects stored under schema 4: speed is a field; reverse and freeze
 * frame live in clip.metadata until a schema bump promotes them. Invalid metadata
 * values are ignored rather than trusted. */
export interface ClipTimeEffects {
  readonly speed: number;
  readonly reversed: boolean;
  readonly freezeFrame: number | null;
}
/** Structural clip shape for time maths; avoids deep DeepReadonly<JsonValue> expansion. */
export interface TimedClip {
  readonly startTime: number;
  readonly duration: number;
  readonly sourceIn: number;
  readonly sourceOut: number;
  readonly speed: number;
  readonly metadata: object;
}
export function clipTimeEffects(clip: TimedClip): ClipTimeEffects {
  // Widened on purpose: DeepReadonly<JsonValue> is too deep for the checker here.
  const metadata = clip.metadata as Readonly<Record<string, unknown>>;
  const freeze = metadata.freezeFrame;
  return {
    speed: clip.speed,
    reversed: metadata.reversed === true,
    freezeFrame:
      typeof freeze === 'number' && Number.isFinite(freeze)
        ? Math.max(clip.sourceIn, Math.min(clip.sourceOut, freeze))
        : null,
  };
}
/** Source-media time shown at composition `time` (clamped to the clip). */
export function clipSourceTime(clip: TimedClip, time: number): number {
  const effects = clipTimeEffects(clip);
  if (effects.freezeFrame !== null) return effects.freezeFrame;
  const local =
    Math.max(0, Math.min(clip.duration, time - clip.startTime)) * clip.speed;
  return Math.max(
    clip.sourceIn,
    Math.min(
      clip.sourceOut,
      effects.reversed ? clip.sourceOut - local : clip.sourceIn + local,
    ),
  );
}
export interface ClipTiming {
  readonly startTime: number;
  readonly duration: number;
  readonly sourceIn: number;
  readonly sourceOut: number;
}
/** New timing for a move or edge trim. The source edge that follows a timeline edge
 * depends on direction: a reversed clip's timeline start shows its source out-point. */
export function retimeClip(
  clip: TimedClip,
  startTime: number,
  duration: number,
  edge: 'move' | 'left' | 'right',
): ClipTiming {
  const { speed, reversed } = clipTimeEffects(clip);
  let { sourceIn, sourceOut } = clip;
  if (edge === 'left') {
    const shift = (startTime - clip.startTime) * speed;
    if (reversed) sourceOut -= shift;
    else sourceIn += shift;
  } else if (edge === 'right') {
    if (reversed) sourceIn = sourceOut - duration * speed;
    else sourceOut = sourceIn + duration * speed;
  }
  return {
    startTime,
    duration,
    sourceIn: Math.max(0, sourceIn),
    sourceOut: Math.max(Math.max(0, sourceIn) + 1e-9, sourceOut),
  };
}
/** Timeline limits for trimming: never into a neighbour on the same track, never
 * past the source media. `sourceDuration` is undefined for generated clips. */
export function clipTrimBounds(
  composition: DeepReadonly<Composition>,
  clipId: string,
  sourceDuration?: number,
  excludedClipIds: readonly string[] = [],
): { readonly minStart: number; readonly maxEnd: number } {
  const location = findClip(composition, clipId);
  if (!location) throw new Error('Unknown clip');
  const { clip, track } = location;
  const end = clip.startTime + clip.duration;
  const { speed, reversed } = clipTimeEffects(clip);
  const headRoom = clip.sourceIn / speed;
  const tailRoom =
    sourceDuration === undefined
      ? Infinity
      : Math.max(0, sourceDuration - clip.sourceOut) / speed;
  let minStart = Math.max(0, clip.startTime - (reversed ? tailRoom : headRoom));
  let maxEnd = end + (reversed ? headRoom : tailRoom);
  for (const other of track.clips) {
    if (other.id === clip.id || excludedClipIds.includes(other.id)) continue;
    const otherEnd = other.startTime + other.duration;
    if (other.startTime < clip.startTime)
      minStart = Math.max(minStart, Math.min(otherEnd, clip.startTime));
    else maxEnd = Math.min(maxEnd, Math.max(other.startTime, end));
  }
  return { minStart, maxEnd };
}

/**
 * J7: a lane accepts the layers of its own group (text and shapes, visuals,
 * audio). A layer type alone is enough for most callers; pass the layer when
 * it may be a background or a group of pictures.
 */
export function trackAcceptsLayer(
  trackType: Track['type'],
  layer: LaneLayer | string,
): boolean {
  return laneAccepts(trackType, layer);
}

/** TL-001, J7: the track type that holds clips of a layer. */
export function trackTypeForLayer(layer: LaneLayer | string): Track['type'] {
  const type = typeof layer === 'string' ? layer : layer.type;
  const group = laneGroupOfLayer(layer);
  return group === 'visual'
    ? 'video'
    : group === 'audio'
      ? 'audio'
      : type === 'text'
        ? 'text'
        : 'object';
}
const TRACK_LABELS: Record<Track['type'], string> = {
  video: 'Video',
  audio: 'Audio',
  text: 'Text',
  object: 'Graphics',
};
/** Default name for the next track of a type ("Text 2"); names are document data. */
export function nextTrackName(
  composition: { readonly tracks: readonly { readonly type: string }[] },
  type: Track['type'],
): string {
  return `${TRACK_LABELS[type]} ${composition.tracks.filter((track) => track.type === type).length + 1}`;
}
const EPSILON = 1e-9;
/** Structural track shape for placement helpers (works on drafts and snapshots). */
interface LaneTrack {
  readonly id: string;
  readonly order: number;
  readonly locked: boolean;
  readonly type: Track['type'];
  readonly clips: readonly ClipSpan[];
}
/** First unlocked track accepting `layerType` whose clips leave [start, end) free. */
export function findFreeTrack<T extends LaneTrack>(
  composition: { readonly tracks: readonly T[] },
  layerType: LaneLayer | string,
  startTime: number,
  endTime: number,
  excludedClipIds: readonly string[] = [],
): T | undefined {
  return [...composition.tracks]
    .sort((a, b) => a.order - b.order)
    .find(
      (track) =>
        !track.locked &&
        trackAcceptsLayer(track.type, layerType) &&
        track.clips.every(
          (clip) =>
            excludedClipIds.includes(clip.id) ||
            clip.startTime + clip.duration <= startTime + EPSILON ||
            clip.startTime >= endTime - EPSILON,
        ),
    );
}
/**
 * TL-001 one-time open conversion (schema stays 4): every top-level layer without
 * a clip gets one, keeping its timing, on a free compatible track or a new one.
 * Clips on nested layers are removed and their timing folded into the layer, so
 * group children live inside their group's clip. Returns a validated copy.
 */
export function adoptFreeLayers(
  // Structural `object`: DeepReadonly<Project> is too deep for the checker here.
  input: object,
  newId: () => string = () => crypto.randomUUID(),
): { project: Project; adopted: number } {
  const project = structuredClone(input) as Project;
  let adopted = 0;
  for (const composition of project.compositions) {
    const hadClips = composition.tracks.some((track) => track.clips.length);
    const topLevel = new Set(composition.layers.map((layer) => layer.id));
    const byId = new Map<string, Layer>();
    const collect = (layers: Layer[]) =>
      layers.forEach((layer) => {
        byId.set(layer.id, layer);
        collect(layer.children);
      });
    collect(composition.layers);
    for (const track of composition.tracks)
      track.clips = track.clips.filter((clip) => {
        if (topLevel.has(clip.layerId)) return true;
        const layer = byId.get(clip.layerId);
        if (layer) {
          layer.startTime = clip.startTime;
          layer.duration = clip.duration;
          adopted++;
        }
        return false;
      });
    const linked = new Set(
      composition.tracks.flatMap((track) =>
        track.clips.map((clip) => clip.layerId),
      ),
    );
    for (const layer of composition.layers) {
      if (linked.has(layer.id)) continue;
      const end = layer.startTime + layer.duration;
      let track = findFreeTrack(composition, layer, layer.startTime, end);
      if (!track) {
        const type = trackTypeForLayer(layer);
        track = {
          id: newId(),
          name: nextTrackName(composition, type),
          type,
          order: composition.tracks.length,
          enabled: true,
          locked: false,
          muted: false,
          clips: [],
        };
        composition.tracks.push(track);
      }
      const sourceDuration = project.assets.find(
        (asset) => asset.id === layer.assetId,
      )?.duration;
      track.clips.push({
        id: newId(),
        name: layer.name,
        layerId: layer.id,
        assetId: layer.assetId,
        startTime: layer.startTime,
        duration: layer.duration,
        sourceIn: 0,
        sourceOut:
          sourceDuration && sourceDuration > 0
            ? Math.min(layer.duration, sourceDuration)
            : layer.duration,
        enabled: true,
        speed: 1,
        transitionMetadata: {},
        effectMetadata: {},
        metadata: {},
      });
      track.clips.sort((a, b) => a.startTime - b.startTime);
      adopted++;
    }
    const occupied = new Set(
      composition.tracks
        .filter((track) => track.clips.length)
        .map((track) => track.id),
    );
    // J7: a clip on a lane of another group moves to a free lane of its own
    // group (or a new one at the bottom of it); then lanes and layers are put
    // in lane order.
    for (const track of [...composition.tracks])
      for (const clip of [...track.clips]) {
        const layer = byId.get(clip.layerId);
        if (!layer || laneAccepts(track.type, layer)) continue;
        track.clips.splice(track.clips.indexOf(clip), 1);
        const end = clip.startTime + clip.duration;
        let home = findFreeTrack(composition, layer, clip.startTime, end);
        if (!home) {
          const type = trackTypeForLayer(layer);
          home = {
            id: newId(),
            name: nextTrackName(composition, type),
            type,
            order: composition.tracks.length,
            enabled: true,
            locked: false,
            muted: false,
            clips: [],
          };
          composition.tracks.push(home);
        }
        home.clips.push(clip);
        home.clips.sort((a, b) => a.startTime - b.startTime);
      }
    // A document without clips (the example, a template) keeps its stacking
    // where clips overlap; one with clips keeps its lanes, and its stacking
    // follows them.
    if (!hadClips)
      packLanesByOrder(composition, (group) => {
        const type = trackTypeForGroup(group);
        return {
          id: newId(),
          name: nextTrackName(composition, type),
          type,
          order: 0,
          enabled: true,
          locked: false,
          muted: false,
          clips: [],
        };
      });
    // U1: lanes have no fixed group order, so a document without clips
    // puts the group holding its frontmost layer on top (a template's text
    // above its background); lanes keep their order within a group and
    // audio stays at the bottom.
    if (!hadClips) {
      const z = new Map(
        composition.layers.map((layer, index) => [layer.id, index]),
      );
      const front = (group: (typeof LANE_GROUPS)[number]) =>
        group === 'audio'
          ? -Infinity
          : Math.max(
              -1,
              ...composition.tracks
                .filter((track) => laneGroupOfTrack(track.type) === group)
                .flatMap((track) =>
                  track.clips.map((clip) => z.get(clip.layerId) ?? -1),
                ),
            );
      const rank = [...LANE_GROUPS].sort((a, b) => front(b) - front(a));
      sortedLanes(composition.tracks)
        .map((track, index) => ({ track, index }))
        .sort(
          (a, b) =>
            rank.indexOf(laneGroupOfTrack(a.track.type)) -
              rank.indexOf(laneGroupOfTrack(b.track.type)) || a.index - b.index,
        )
        .forEach(({ track }, order) => (track.order = order));
    }
    // Lanes that the moves emptied are left out.
    composition.tracks = composition.tracks.filter(
      (track) => track.clips.length || !occupied.has(track.id),
    );
    syncLanes(composition);
  }
  return { project: validateProject(project), adopted };
}
export interface ClipSpan {
  readonly id: string;
  readonly startTime: number;
  readonly duration: number;
}
/**
 * TL-030 insert rule. `incoming` clips land on a track holding `fixed` clips. A
 * landing point strictly inside a fixed clip moves to that clip's nearer edge
 * (nothing is split); fixed clips at or after the landing point shift right just
 * enough to make room, keeping their spacing. Returns new starts by clip id for
 * incoming (`placed`) and shifted fixed clips (`pushed`), plus insertion points.
 */
export function planInsert(
  fixed: readonly ClipSpan[],
  incoming: readonly ClipSpan[],
): {
  placed: Map<string, number>;
  pushed: Map<string, number>;
  insertions: number[];
} {
  const lane = fixed.map((clip) => ({ ...clip, moved: false }));
  const placed = new Map<string, number>();
  const pushed = new Map<string, number>();
  const insertions: number[] = [];
  for (const item of [...incoming].sort((a, b) => a.startTime - b.startTime)) {
    let at = item.startTime;
    const inside = lane.find(
      (clip) =>
        clip.startTime < at - EPSILON &&
        at < clip.startTime + clip.duration - EPSILON,
    );
    // Incoming clips keep their relative order, so they always land after one another.
    if (inside)
      at =
        !inside.moved &&
        at - inside.startTime <= inside.startTime + inside.duration - at
          ? inside.startTime
          : inside.startTime + inside.duration;
    const later = lane.filter((clip) => clip.startTime >= at - EPSILON);
    const room = Math.min(Infinity, ...later.map((clip) => clip.startTime));
    const shift = Math.max(0, at + item.duration - room);
    if (shift > EPSILON) {
      insertions.push(at);
      for (const clip of later) {
        clip.startTime += shift;
        if (clip.moved) placed.set(clip.id, clip.startTime);
        else pushed.set(clip.id, clip.startTime);
      }
    }
    placed.set(item.id, at);
    lane.push({ ...item, startTime: at, moved: true });
  }
  return { placed, pushed, insertions };
}

/** TL-032 link group id stored in clip.metadata (schema 4); invalid values ignored. */
export function clipLinkId(clip: { readonly metadata: object }): string | null {
  const value = (clip.metadata as Readonly<Record<string, unknown>>).linkId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}
/** True once a video clip's own audio has been detached into a separate clip. */
export function clipAudioDetached(clip: {
  readonly metadata: object;
}): boolean {
  return (
    (clip.metadata as Readonly<Record<string, unknown>>).audioDetached === true
  );
}
