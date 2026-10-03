// CV-026 layer order: bring to front, bring forward, send backward, send to
// back. Later layers in a sibling list paint on top. A run is one undo step.
// J7: a top-level element's place is its lane (the top lane paints in front),
// so it moves between the lanes of its group: forward and backward to the
// next lane (a new lane when that one is busy at its time), front and back to
// the group's top or bottom lane. Group children move among their siblings.
import {
  laneGroupOfTrack,
  nextTrackName,
  sortedLanes,
  trackTypeForLayer,
  type Command,
  type EditorEngine,
  type Track,
} from '../core';
import { locateLayer } from '../render/adapter';
import type { EditorSession } from './session';
import { selectionRoots } from './selection-context';

export const ARRANGE_ACTIONS = [
  'front',
  'forward',
  'backward',
  'back',
] as const;
export type ArrangeAction = (typeof ARRANGE_ACTIONS)[number];
export const ARRANGE_LABELS: Record<ArrangeAction, string> = {
  front: 'Bring to front',
  forward: 'Bring forward',
  backward: 'Send backward',
  back: 'Send to back',
};

/** The new sibling order (bottom to top) for one arrange action. */
export function arrangeOrder(
  order: readonly string[],
  selected: ReadonlySet<string>,
  action: ArrangeAction,
): string[] {
  const moving = order.filter((id) => selected.has(id)),
    resting = order.filter((id) => !selected.has(id));
  if (action === 'front') return [...resting, ...moving];
  if (action === 'back') return [...moving, ...resting];
  const next = [...order];
  // Forward walks from the top so a block of selected layers moves together.
  const indices = next.map((_, index) => index);
  if (action === 'forward') indices.reverse();
  for (const index of indices) {
    if (!selected.has(next[index]!)) continue;
    const target = action === 'forward' ? index + 1 : index - 1;
    if (target < 0 || target >= next.length || selected.has(next[target]!))
      continue;
    [next[index], next[target]] = [next[target]!, next[index]!];
  }
  return next;
}

export function arrangeCommands(
  session: EditorSession,
  action: ArrangeAction,
): Command[] {
  const source = session.source,
    compositionId = source.composition.id;
  const roots = selectionRoots(source, session.selectedIds);
  const byParent = new Map<string | null, Set<string>>();
  for (const layer of roots) {
    const parent =
      locateLayer(source.composition.layers, layer.id)!.parent?.id ?? null;
    byParent.set(parent, (byParent.get(parent) ?? new Set()).add(layer.id));
  }
  const commands: Command[] = laneCommands(session, action, byParent.get(null));
  byParent.delete(null);
  for (const [parentId, selected] of byParent) {
    const siblings = parentId
      ? locateLayer(source.composition.layers, parentId)!.layer.children
      : source.composition.layers;
    const current = siblings.map((layer) => layer.id);
    const target = arrangeOrder(current, selected, action);
    for (let index = 0; index < target.length; index++) {
      if (current[index] === target[index]) continue;
      const from = current.indexOf(target[index]!);
      current.splice(from, 1);
      current.splice(index, 0, target[index]!);
      commands.push({
        type: 'MOVE_LAYER',
        compositionId,
        layerId: target[index]!,
        parentId,
        index,
      });
    }
  }
  return commands;
}

interface Lane {
  id: string;
  type: Track['type'];
  locked: boolean;
  clips: { id: string; layerId: string; start: number; end: number }[];
}
/** J7: lane moves for top-level selected layers with clips. */
function laneCommands(
  session: EditorSession,
  action: ArrangeAction,
  selected: ReadonlySet<string> | undefined,
): Command[] {
  if (!selected?.size) return [];
  const composition = session.source.composition,
    compositionId = composition.id;
  const lanes: Lane[] = sortedLanes(composition.tracks).map((track) => ({
    id: track.id,
    type: track.type,
    locked: track.locked,
    clips: track.clips.map((clip) => ({
      id: clip.id,
      layerId: clip.layerId,
      start: clip.startTime,
      end: clip.startTime + clip.duration,
    })),
  }));
  const commands: Command[] = [];
  const laneOf = (layerId: string) =>
    lanes.findIndex((lane) =>
      lane.clips.some((clip) => clip.layerId === layerId),
    );
  const free = (lane: Lane, clip: Lane['clips'][number]) =>
    !lane.locked &&
    lane.clips.every(
      (other) =>
        other.id === clip.id ||
        other.end <= clip.start + 1e-9 ||
        other.start >= clip.end - 1e-9,
    );
  // A block keeps its order: forward and back take the upper one first
  // (it moves up a lane before the next fills its place; it reaches the
  // bottom first and the next lands below it), backward and front the lower.
  const ids = [...selected].sort((a, b) =>
    action === 'forward' || action === 'back'
      ? laneOf(a) - laneOf(b)
      : laneOf(b) - laneOf(a),
  );
  for (const layerId of ids) {
    const from = laneOf(layerId);
    if (from < 0) continue;
    const lane = lanes[from]!;
    if (lane.locked) continue;
    const clip = lane.clips.find((item) => item.layerId === layerId)!;
    const group = laneGroupOfTrack(lane.type);
    const members = lanes
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => laneGroupOfTrack(item.type) === group)
      .map(({ index }) => index);
    const top = members[0]!,
      bottom = members.at(-1)!;
    const up = action === 'forward' || action === 'front';
    if ((up && from === top) || (!up && from === bottom)) continue;
    // The lane to land on, and where a new lane goes when it is busy: above
    // it when going up, below it when going down.
    const target =
      action === 'forward'
        ? from - 1
        : action === 'backward'
          ? from + 1
          : action === 'front'
            ? top
            : bottom;
    let index = target;
    if (!free(lanes[target]!, clip)) {
      const type = trackTypeForLayer(
        composition.layers.find((layer) => layer.id === layerId) ?? 'shape',
      );
      const fresh: Lane = {
        id: crypto.randomUUID(),
        type,
        locked: false,
        clips: [],
      };
      index = up ? target : target + 1;
      commands.push(
        {
          type: 'CREATE_TRACK',
          compositionId,
          track: {
            id: fresh.id,
            name: nextTrackName(
              { tracks: lanes.map((item) => ({ type: item.type })) },
              type,
            ),
            type,
            order: lanes.length,
            enabled: true,
            locked: false,
            muted: false,
            clips: [],
          },
        },
        { type: 'MOVE_TRACK', compositionId, trackId: fresh.id, index },
      );
      lanes.splice(index, 0, fresh);
    }
    const source = lanes.indexOf(lane);
    const destination = lanes[index]!;
    lane.clips.splice(lane.clips.indexOf(clip), 1);
    destination.clips.push(clip);
    commands.push({
      type: 'MOVE_CLIP',
      compositionId,
      clipId: clip.id,
      trackId: destination.id,
    });
    // A lane emptied by the move goes (lanes are made on demand).
    if (!lane.clips.length) {
      commands.push({ type: 'DELETE_TRACK', compositionId, trackId: lane.id });
      lanes.splice(source, 1);
    }
  }
  return commands;
}

/** Whether the action would change anything for the current selection. */
export const canArrange = (session: EditorSession, action: ArrangeAction) =>
  arrangeCommands(session, action).length > 0;

export function arrangeSelection(
  engine: EditorEngine,
  session: EditorSession,
  action: ArrangeAction,
): void {
  const commands = arrangeCommands(session, action);
  if (commands.length)
    engine.commands.transaction(ARRANGE_LABELS[action], commands);
}
