// T3: where something dragged over the timeline lands (Clipchamp's rules),
// for a library or Media item and for a clip being moved. Pure: the timeline
// passes the rows and clips it has drawn; the caller turns a target into
// commands with `laneDropCommands`.
import {
  findClip,
  laneGroupOfTrack,
  planInsert,
  type Command,
  type Composition,
  type DeepReadonly,
  type Track,
} from '../core';

export type LaneGroup = 'text' | 'visual' | 'audio';
const RANK: Record<LaneGroup, number> = { text: 0, visual: 1, audio: 2 };
/** Pixels from a lane's top or bottom edge that mean "a new lane here". */
export const LANE_EDGE = 6;
/** Height of the strip above the first lane and below the last that also
 *  means "a new lane here". */
export const LANE_STRIP = 14;

export interface DropRow {
  readonly trackId: string;
  readonly group: LaneGroup;
  readonly locked: boolean;
  readonly top: number;
  readonly bottom: number;
}
export interface DropClip {
  readonly clipId: string;
  readonly trackId: string;
  readonly left: number;
  readonly right: number;
}
export type LaneDropTarget =
  /** Empty time on a lane of the same group. */
  | { readonly mode: 'lane'; readonly trackId: string; readonly time: number }
  /** Over a clip: before it, after it (later clips ripple) or replacing it. */
  | {
      readonly mode: 'before' | 'after' | 'replace';
      readonly trackId: string;
      readonly clipId: string;
      readonly time: number;
    }
  /** A new lane at `index` (display order), from a "+" line. */
  | { readonly mode: 'new-lane'; readonly index: number; readonly time: number }
  /** A lane of another group (or locked): nothing happens on drop. */
  | {
      readonly mode: 'refused';
      readonly trackId: string;
      readonly time: number;
    };

/** Whether a new lane of `group` between two rows stays there (lanes are
 *  kept grouped, text and shapes above visuals above audio). */
export function newLaneFits(
  rows: readonly DropRow[],
  index: number,
  group: LaneGroup,
): boolean {
  const above = rows[index - 1];
  const below = rows[index];
  return (
    (!above || RANK[above.group] <= RANK[group]) &&
    (!below || RANK[group] <= RANK[below.group])
  );
}

/**
 * T3 rules, in order: a "+" line at a lane's top or bottom edge (or the strip
 * above the first lane or below the last) makes a new lane where it fits; a
 * lane of another group, or a locked one, refuses; over a clip, its left
 * third inserts before it, its right third after it and the middle replaces
 * it; empty time on the lane places the item at `time`.
 */
export function resolveLaneDrop(input: {
  readonly x: number;
  readonly y: number;
  readonly time: number;
  readonly group: LaneGroup;
  readonly rows: readonly DropRow[];
  readonly clips: readonly DropClip[];
  /** Clips being moved (never a target of their own move). */
  readonly exclude?: ReadonlySet<string>;
}): LaneDropTarget | null {
  const { x, y, time, group, rows } = input;
  if (!rows.length) return { mode: 'new-lane', index: 0, time };
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  let edge = -1;
  if (y < first.top + LANE_EDGE && y >= first.top - LANE_STRIP) edge = 0;
  else if (y > last.bottom - LANE_EDGE && y <= last.bottom + LANE_STRIP)
    edge = rows.length;
  const index = rows.findIndex((row) => y >= row.top && y < row.bottom);
  const row = rows[index];
  if (edge < 0 && row) {
    if (y - row.top < LANE_EDGE) edge = index;
    else if (row.bottom - y <= LANE_EDGE) edge = index + 1;
  }
  if (edge >= 0 && newLaneFits(rows, edge, group))
    return { mode: 'new-lane', index: edge, time };
  if (!row) return null;
  if (row.group !== group || row.locked)
    return { mode: 'refused', trackId: row.trackId, time };
  const clip = input.clips.find(
    (item) =>
      item.trackId === row.trackId &&
      !input.exclude?.has(item.clipId) &&
      x >= item.left &&
      x < item.right,
  );
  if (clip) {
    const third = (clip.right - clip.left) / 3;
    const mode =
      x < clip.left + third
        ? 'before'
        : x >= clip.right - third
          ? 'after'
          : 'replace';
    return { mode, trackId: row.trackId, clipId: clip.clipId, time };
  }
  return { mode: 'lane', trackId: row.trackId, time };
}

/**
 * Commands that put a clip of `duration` on the target: its lane (an
 * existing one, or new lane commands from `newLane`), its start, the later
 * clips it pushes (planInsert, on that lane only) and, for Replace, the
 * removed clip's layer. `moving` names a clip already on the timeline that
 * moves there (it is left out of the lane while planning).
 */
export function laneDropPlan(
  composition: DeepReadonly<Composition>,
  target: Exclude<LaneDropTarget, { mode: 'refused' }>,
  incoming: { readonly duration: number; readonly moving?: string },
): {
  readonly trackId: string | null;
  readonly startTime: number;
  readonly pushes: Command[];
  readonly removeLayerId?: string;
} {
  if (target.mode === 'new-lane')
    return { trackId: null, startTime: target.time, pushes: [] };
  const track = composition.tracks.find((item) => item.id === target.trackId);
  if (!track) throw new Error('Unknown track');
  const over =
    target.mode === 'lane'
      ? undefined
      : findClip(composition, target.clipId)?.clip;
  const startTime =
    target.mode === 'before' || target.mode === 'replace'
      ? (over?.startTime ?? target.time)
      : target.mode === 'after'
        ? over
          ? over.startTime + over.duration
          : target.time
        : target.time;
  const removed = target.mode === 'replace' ? over?.id : undefined;
  const fixed = track.clips
    .filter((clip) => clip.id !== incoming.moving && clip.id !== removed)
    .map((clip) => ({
      id: clip.id,
      startTime: clip.startTime,
      duration: clip.duration,
    }));
  const plan = planInsert(fixed, [
    { id: '__incoming', startTime, duration: incoming.duration },
  ]);
  const pushes: Command[] = [];
  plan.pushed.forEach((start, clipId) => {
    const clip = track.clips.find((item) => item.id === clipId)!;
    pushes.push({
      type: 'SET_CLIP_TIMING',
      compositionId: composition.id,
      clipId,
      startTime: start,
      duration: clip.duration,
    });
  });
  return {
    trackId: track.id,
    startTime: plan.placed.get('__incoming') ?? startTime,
    pushes,
    ...(over && removed ? { removeLayerId: over.layerId } : {}),
  };
}

/** The group a lane of `type` belongs to. */
export const groupOfTrack = (type: Track['type']): LaneGroup =>
  laneGroupOfTrack(type) as LaneGroup;
