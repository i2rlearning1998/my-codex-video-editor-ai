import {
  layerSchema,
  clipSchema,
  clipSourceTime,
  clipTimeEffects,
  clipTrimBounds,
  effectiveLayerTiming,
  clipLinkId,
  createLayer,
  findClip,
  findClipByLayer,
  frameToTime,
  findFreeTrack,
  nextTrackName,
  planInsert,
  retimeClip,
  trackAcceptsLayer,
  trackTypeForLayer,
  type Clip,
  type Composition,
  type DeepReadonly,
  type Track,
  type ClipLocation,
  type Command,
  type EditorEngine,
  type Layer,
} from '../core';
import {
  locateLayer,
  type RenderSource,
  type SceneLayer,
} from '../render/adapter';
import type { EditorSession } from './session';

import { describeSelection, selectionRoots } from './selection-context';
import { ungroupBlocker, ungroupCommands } from './ungroup';
export { selectionRoots };
export function cloneLayer(
  layer: SceneLayer,
  id = () => crypto.randomUUID(),
): Layer {
  const copy = layerSchema.parse(layer as unknown);
  const visit = (item: Layer) => {
    item.id = id();
    item.children.forEach(visit);
  };
  visit(copy);
  return copy;
}
export type EditAction =
  | 'duplicate'
  | 'delete'
  | 'split'
  | 'group'
  | 'marker'
  | 'delete-marker'
  | 'toggle-enabled'
  | 'speed'
  | 'reverse'
  | 'freeze'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'link'
  | 'unlink'
  | 'detach-audio'
  | 'ungroup';
/** TL-027 in-app clipboard: transient snapshots, never saved, no history. */
interface ClipboardItem {
  readonly layer: SceneLayer;
  readonly clip: Clip;
  readonly trackId: string;
  /** Seconds after the earliest copied clip. */
  readonly offset: number;
}
let clipboard: readonly ClipboardItem[] = [];
export const hasClipboard = (): boolean => clipboard.length > 0;
export function clearClipboard(): void {
  clipboard = [];
}
/** Selected layer ids plus the layers of clips linked to them (TL-032). */
export function withLinked(
  source: RenderSource,
  ids: readonly string[],
): string[] {
  const links = new Set(
    selectionRoots(source, ids).flatMap((layer) => {
      const found = findClipByLayer(source.composition, layer.id);
      const link = found ? clipLinkId(found.clip) : null;
      return link ? [link] : [];
    }),
  );
  if (!links.size) return [...ids];
  const partners = source.composition.tracks.flatMap((track) =>
    track.clips
      .filter((clip) => links.has(clipLinkId(clip) ?? ''))
      .map((clip) => clip.layerId),
  );
  return [...new Set([...ids, ...partners])];
}
export interface ClipLanding {
  /** Structural so new (not yet created) clips can be planned too. */
  readonly clip: {
    readonly id: string;
    readonly startTime: number;
    readonly duration: number;
  };
  readonly trackId: string;
  readonly startTime: number;
}
/** TL-030 plan for clips landing on tracks: final starts, pushed clips, markers. */
export function planLanding(
  composition: DeepReadonly<Composition>,
  landings: readonly ClipLanding[],
) {
  const moving = new Set(landings.map((item) => item.clip.id));
  const placed = new Map<string, number>();
  const pushed = new Map<string, { trackId: string; startTime: number }>();
  const insertions: { trackId: string; time: number }[] = [];
  for (const trackId of new Set(landings.map((item) => item.trackId))) {
    const track = composition.tracks.find((item) => item.id === trackId);
    if (!track) throw new Error('Unknown track');
    const plan = planInsert(
      track.clips.filter((clip) => !moving.has(clip.id)),
      landings
        .filter((item) => item.trackId === trackId)
        .map((item) => ({
          id: item.clip.id,
          startTime: item.startTime,
          duration: item.clip.duration,
        })),
    );
    plan.placed.forEach((time, id) => placed.set(id, time));
    plan.pushed.forEach((time, id) =>
      pushed.set(id, { trackId, startTime: time }),
    );
    insertions.push(...plan.insertions.map((time) => ({ trackId, time })));
  }
  return { placed, pushed, insertions };
}
/** Commands that land clips (MOVE_CLIP + timing) and push later clips. */
export function landingCommands(
  composition: DeepReadonly<Composition>,
  landings: readonly ClipLanding[],
): Command[] {
  const plan = planLanding(composition, landings);
  const commands: Command[] = [];
  for (const item of landings) {
    const from = findClip(composition, item.clip.id)!;
    if (from.track.id !== item.trackId)
      commands.push({
        type: 'MOVE_CLIP',
        compositionId: composition.id,
        clipId: item.clip.id,
        trackId: item.trackId,
      });
    const startTime = plan.placed.get(item.clip.id)!;
    if (startTime !== item.clip.startTime)
      commands.push({
        type: 'SET_CLIP_TIMING',
        compositionId: composition.id,
        clipId: item.clip.id,
        startTime,
        duration: item.clip.duration,
      });
  }
  plan.pushed.forEach(({ startTime }, clipId) => {
    const clip = findClip(composition, clipId)!.clip;
    commands.push({
      type: 'SET_CLIP_TIMING',
      compositionId: composition.id,
      clipId,
      startTime,
      duration: clip.duration,
    });
  });
  return commands;
}
/** A free compatible track for [start, end), or commands creating a new one. */
export function trackForNewClip(
  composition: DeepReadonly<Composition>,
  layerType: string,
  startTime: number,
  endTime: number,
  excludedClipIds: readonly string[] = [],
): { trackId: string; commands: Command[] } {
  const free = findFreeTrack(
    composition,
    layerType,
    startTime,
    endTime,
    excludedClipIds,
  );
  if (free) return { trackId: free.id, commands: [] };
  const type = trackTypeForLayer(layerType);
  const trackId = crypto.randomUUID();
  return {
    trackId,
    commands: [
      {
        type: 'CREATE_TRACK',
        compositionId: composition.id,
        track: {
          id: trackId,
          name: nextTrackName(composition, type),
          type,
          order: composition.tracks.length,
          enabled: true,
          locked: false,
          muted: false,
          clips: [],
        },
      },
    ],
  };
}
/** Speed presets offered by the clip menus (the command accepts 0.1x to 8x). */
export const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 4] as const;
/** Clip locations for the selection roots; empty unless every root is a clip. */
export function selectedClips(
  source: RenderSource,
  ids: readonly string[],
): ClipLocation[] {
  const layers = selectionRoots(source, ids);
  const clips = layers.map((layer) =>
    findClipByLayer(source.composition, layer.id),
  );
  return layers.length && clips.every(Boolean) ? (clips as ClipLocation[]) : [];
}
export function contextActions(
  source: RenderSource,
  ids: readonly string[],
  time: number,
  markerId?: string,
): EditAction[] {
  if (markerId) return ['delete-marker'];
  const layers = selectionRoots(source, ids);
  if (!layers.length) return hasClipboard() ? ['marker', 'paste'] : ['marker'];
  const actions: EditAction[] = ['duplicate', 'delete'];
  // W2-F1: an action is offered only when every selected item supports it, so
  // clip-only actions never reach a selection that mixes in images or shapes.
  const selection = describeSelection(source, ids);
  const clips = selectedClips(source, ids);
  if (selection.every('clip')) {
    actions.push('toggle-enabled');
    if (selection.every('time-effects'))
      actions.push('speed', 'reverse', 'freeze');
    actions.push('cut', 'copy');
    if (hasClipboard()) actions.push('paste');
    const links = clips.map(({ clip }) => clipLinkId(clip));
    if (clips.length > 1 && !(links[0] && links.every((l) => l === links[0])))
      actions.push('link');
    if (links.some(Boolean)) actions.push('unlink');
    if (selection.every('detach-audio')) actions.push('detach-audio');
  }
  if (
    layers.every(
      (layer) =>
        layer.type !== 'group' &&
        effectiveLayerTiming(source.composition, layer).startTime < time &&
        time <
          effectiveLayerTiming(source.composition, layer).startTime +
            effectiveLayerTiming(source.composition, layer).duration,
    )
  )
    actions.unshift('split');
  const parents = layers.map(
    (layer) =>
      locateLayer(source.composition.layers, layer.id)!.parent?.id ?? null,
  );
  if (layers.length > 1 && parents.every((parent) => parent === parents[0]))
    actions.push('group');
  if (selection.every('group') && !ungroupBlocker(source, ids))
    actions.push('ungroup');
  return actions;
}
export function performEdit(
  engine: EditorEngine,
  session: EditorSession,
  action: EditAction,
  markerId?: string,
): void {
  session.setPlaying(false);
  const source = session.source,
    compositionId = source.composition.id;
  if (
    !contextActions(
      source,
      session.selectedIds,
      session.currentTime,
      markerId,
    ).includes(action)
  )
    throw new Error('Action unavailable for this selection or time');
  if (
    ['copy', 'cut', 'paste', 'link', 'unlink', 'detach-audio'].includes(action)
  )
    return clipAction(engine, session, action);
  if (action === 'ungroup') {
    const plan = ungroupCommands(source, session.selectedIds);
    engine.commands.transaction('Ungroup', plan.commands);
    session.selectMany(plan.selected);
    return;
  }
  // TL-032: linked partners delete, split and duplicate together. A partner that
  // does not span the playhead is left out of a split.
  const expanded = ['delete', 'split', 'duplicate'].includes(action)
    ? withLinked(source, session.selectedIds).filter((id) => {
        if (action !== 'split' || session.selectedIds.includes(id)) return true;
        const timing = effectiveLayerTiming(
          source.composition,
          locateLayer(source.composition.layers, id)!.layer,
        );
        return (
          timing.startTime < session.currentTime &&
          session.currentTime < timing.startTime + timing.duration
        );
      })
    : session.selectedIds;
  // New pieces of a linked group share a fresh link id (not the original's).
  const relinked = new Map<string, string>();
  const relink = (clip: Clip) => {
    const link = clipLinkId(clip);
    if (!link) return;
    if (!relinked.has(link)) relinked.set(link, crypto.randomUUID());
    clip.metadata.linkId = relinked.get(link)!;
  };
  const layers = selectionRoots(source, expanded),
    commands: Command[] = [],
    selected: string[] = [];
  // Duplicates land right after their originals under the insert rule (TL-030).
  const duplicates: {
    original: DeepReadonly<Clip>;
    copy: Clip;
    trackId: string;
  }[] = [];
  if (action === 'marker')
    commands.push({
      type: 'ADD_MARKER',
      compositionId,
      marker: {
        id: crypto.randomUUID(),
        time: session.currentTime,
        label: 'Marker',
      },
    });
  else if (action === 'delete-marker')
    commands.push({
      type: 'DELETE_MARKER',
      compositionId,
      markerId: markerId!,
    });
  else if (action === 'speed')
    throw new Error('Choose a speed from the Speed menu');
  else if (action === 'reverse' || action === 'freeze') {
    const clips = selectedClips(source, session.selectedIds);
    const allOn = clips.every(({ clip }) =>
      action === 'reverse'
        ? clipTimeEffects(clip).reversed
        : clipTimeEffects(clip).freezeFrame !== null,
    );
    for (const { clip } of clips)
      commands.push(
        action === 'reverse'
          ? {
              type: 'SET_CLIP_REVERSED',
              compositionId,
              clipId: clip.id,
              reversed: !allOn,
            }
          : {
              type: 'SET_CLIP_FREEZE_FRAME',
              compositionId,
              clipId: clip.id,
              // Hold the frame under the playhead, else the first shown frame.
              sourceTime: allOn
                ? null
                : clipSourceTime(
                    clip,
                    session.currentTime >= clip.startTime &&
                      session.currentTime < clip.startTime + clip.duration
                      ? session.currentTime
                      : clip.startTime,
                  ),
            },
      );
  } else if (action === 'toggle-enabled')
    for (const layer of layers) {
      const clip = findClipByLayer(source.composition, layer.id)!;
      commands.push({
        type: 'SET_CLIP_ENABLED',
        compositionId,
        clipId: clip.clip.id,
        enabled: !clip.clip.enabled,
      });
    }
  else if (action === 'group') {
    const groupId = crypto.randomUUID();
    // TL-001: children fold their clip timing into the layer and the group gets
    // one clip spanning them, so the group is the only clip on the timeline.
    const childClips = layers.flatMap((layer) => {
      const found = findClipByLayer(source.composition, layer.id);
      return found ? [found] : [];
    });
    for (const { clip } of childClips)
      commands.push(
        { type: 'DELETE_CLIP', compositionId, clipId: clip.id },
        {
          type: 'SET_LAYER_TIMING',
          compositionId,
          layerId: clip.layerId,
          startTime: clip.startTime,
          duration: clip.duration,
        },
      );
    commands.push({
      type: 'GROUP',
      compositionId,
      layerIds: layers.map((layer) => layer.id),
      groupId,
      name: 'Group',
    });
    const topLevel = source.composition.layers.some(
      (layer) => layer.id === layers[0]!.id,
    );
    if (topLevel) {
      const timings = layers.map((layer) =>
        effectiveLayerTiming(source.composition, layer),
      );
      const start = Math.min(...timings.map((item) => item.startTime));
      const end = Math.max(
        ...timings.map((item) => item.startTime + item.duration),
      );
      const target = trackForNewClip(
        source.composition,
        'group',
        start,
        end,
        childClips.map(({ clip }) => clip.id),
      );
      commands.push(...target.commands, {
        type: 'CREATE_CLIP',
        compositionId,
        trackId: target.trackId,
        clip: {
          id: crypto.randomUUID(),
          name: 'Group',
          layerId: groupId,
          assetId: null,
          startTime: start,
          duration: end - start,
          sourceIn: 0,
          sourceOut: end - start,
          enabled: true,
          speed: 1,
          transitionMetadata: {},
          effectMetadata: {},
          metadata: {},
        },
      });
    }
    selected.push(groupId);
  } else
    for (const layer of layers) {
      if (action === 'delete') {
        commands.push({
          type: 'DELETE_LAYER',
          compositionId,
          layerId: layer.id,
        });
        continue;
      }
      const parent = locateLayer(source.composition.layers, layer.id)!.parent;
      const copy = cloneLayer(layer);
      const clipLocation = findClipByLayer(source.composition, layer.id);
      const timing = effectiveLayerTiming(source.composition, layer);
      if (action === 'split') {
        const end = timing.startTime + timing.duration;
        copy.startTime = session.currentTime;
        copy.duration = end - session.currentTime;
        commands.push(
          clipLocation
            ? {
                type: 'SET_CLIP_TIMING',
                compositionId,
                clipId: clipLocation.clip.id,
                // Right trim of the first piece; reverse-aware source edges.
                ...retimeClip(
                  clipLocation.clip,
                  timing.startTime,
                  session.currentTime - timing.startTime,
                  'right',
                ),
              }
            : {
                type: 'SET_LAYER_TIMING',
                compositionId,
                layerId: layer.id,
                startTime: timing.startTime,
                duration: session.currentTime - timing.startTime,
              },
        );
      }
      commands.push({
        type: 'CREATE_LAYER',
        compositionId,
        parentId: parent?.id ?? null,
        layer: copy,
      });
      if (clipLocation) {
        const clipCopy = clipSchema.parse(clipLocation.clip);
        clipCopy.id = crypto.randomUUID();
        relink(clipCopy);
        clipCopy.layerId = copy.id;
        clipCopy.startTime =
          action === 'split' ? session.currentTime : timing.startTime;
        clipCopy.duration =
          action === 'split'
            ? timing.startTime + timing.duration - session.currentTime
            : timing.duration;
        if (action === 'split') {
          const second = retimeClip(
            clipLocation.clip,
            session.currentTime,
            clipCopy.duration,
            'left',
          );
          clipCopy.sourceIn = second.sourceIn;
          clipCopy.sourceOut = second.sourceOut;
        }
        if (action === 'duplicate')
          duplicates.push({
            original: clipLocation.clip,
            copy: clipCopy,
            trackId: clipLocation.track.id,
          });
        else
          commands.push({
            type: 'CREATE_CLIP',
            compositionId,
            trackId: clipLocation.track.id,
            clip: clipCopy,
          });
      }
      selected.push(copy.id);
    }
  if (duplicates.length) {
    // Sequentially per track: each copy lands at its original's (pushed) end.
    const lanes = new Map<
      string,
      { id: string; startTime: number; duration: number }[]
    >();
    const final = new Map<string, number>();
    for (const item of [...duplicates].sort(
      (a, b) => a.original.startTime - b.original.startTime,
    )) {
      const track = source.composition.tracks.find(
        (entry) => entry.id === item.trackId,
      )!;
      const lane =
        lanes.get(item.trackId) ??
        track.clips.map((clip) => ({
          id: clip.id,
          startTime: clip.startTime,
          duration: clip.duration,
        }));
      lanes.set(item.trackId, lane);
      const original = lane.find((clip) => clip.id === item.original.id)!;
      const plan = planInsert(lane, [
        {
          id: item.copy.id,
          startTime: original.startTime + original.duration,
          duration: item.copy.duration,
        },
      ]);
      for (const clip of lane)
        if (plan.pushed.has(clip.id))
          clip.startTime = plan.pushed.get(clip.id)!;
      const at = plan.placed.get(item.copy.id)!;
      lane.push({
        id: item.copy.id,
        startTime: at,
        duration: item.copy.duration,
      });
      item.copy.startTime = at;
    }
    for (const [trackId, lane] of lanes)
      for (const clip of lane) {
        const current = source.composition.tracks
          .find((entry) => entry.id === trackId)!
          .clips.find((entry) => entry.id === clip.id);
        if (current && current.startTime !== clip.startTime)
          final.set(clip.id, clip.startTime);
      }
    final.forEach((startTime, clipId) =>
      commands.push({
        type: 'SET_CLIP_TIMING',
        compositionId,
        clipId,
        startTime,
        duration: findClip(source.composition, clipId)!.clip.duration,
      }),
    );
    for (const item of duplicates)
      commands.push({
        type: 'CREATE_CLIP',
        compositionId,
        trackId: item.trackId,
        clip: item.copy,
      });
  }
  if (commands.length)
    engine.commands.transaction(
      action === 'reverse'
        ? 'Reverse clip'
        : action === 'freeze'
          ? 'Freeze frame'
          : action[0]!.toUpperCase() + action.slice(1),
      commands,
    );
  if (selected.length) session.selectMany(selected);
}
export function setClipSpeed(
  engine: EditorEngine,
  session: EditorSession,
  speed: number,
): void {
  session.setPlaying(false);
  const clips = selectedClips(session.source, session.selectedIds);
  if (!clips.length) throw new Error('Select a clip to change its speed');
  if (
    !describeSelection(session.source, session.selectedIds).every(
      'time-effects',
    )
  )
    throw new Error('Speed applies to video and audio clips only');
  const commands: Command[] = clips
    .filter(({ clip }) => clip.speed !== speed)
    .map(({ clip }) => ({
      type: 'SET_CLIP_SPEED',
      compositionId: session.source.composition.id,
      clipId: clip.id,
      speed,
    }));
  if (commands.length) engine.commands.transaction('Change speed', commands);
}
/** Next slower or faster preset from the first selected clip's speed. */
export function stepClipSpeed(
  engine: EditorEngine,
  session: EditorSession,
  direction: -1 | 1,
): void {
  const clip = selectedClips(session.source, session.selectedIds)[0]?.clip;
  if (!clip) throw new Error('Select a clip to change its speed');
  const next =
    direction > 0
      ? SPEED_PRESETS.find((value) => value > clip.speed + 1e-9)
      : [...SPEED_PRESETS].reverse().find((value) => value < clip.speed - 1e-9);
  if (next !== undefined) setClipSpeed(engine, session, next);
}
const assetDuration = (source: RenderSource, assetId: string | null) =>
  source.assets.find((asset) => asset.id === assetId)?.duration;
/** Keyboard move: shift selected clips by whole frames (one undo step). */
export function nudgeClips(
  engine: EditorEngine,
  session: EditorSession,
  frames: number,
): void {
  session.setPlaying(false);
  const source = session.source;
  // Linked partners nudge together (TL-032).
  const clips = selectedClips(source, withLinked(source, session.selectedIds));
  if (!clips.length) throw new Error('Select a clip to move it');
  // Nudges stop at neighbouring clips instead of pushing them (TL-020).
  const moving = new Set(clips.map(({ clip }) => clip.id));
  let delta = frameToTime(frames, source.composition.fps);
  for (const { clip, track } of clips) {
    const end = clip.startTime + clip.duration;
    const others = track.clips.filter((other) => !moving.has(other.id));
    if (delta < 0)
      delta = Math.max(
        delta,
        Math.max(
          0,
          ...others
            .map((other) => other.startTime + other.duration)
            .filter((otherEnd) => otherEnd <= clip.startTime + 1e-9),
        ) - clip.startTime,
      );
    else
      delta = Math.min(
        delta,
        Math.min(
          Infinity,
          ...others
            .map((other) => other.startTime)
            .filter((start) => start >= end - 1e-9),
        ) - end,
      );
  }
  if (Math.abs(delta) < 1e-9) return;
  engine.commands.transaction(
    'Move clip',
    clips.map(({ clip }) => ({
      type: 'SET_CLIP_TIMING',
      compositionId: source.composition.id,
      clipId: clip.id,
      startTime: clip.startTime + delta,
      duration: clip.duration,
    })),
  );
}
/** Keyboard cross-track move to the nearest compatible, unlocked track. */
export function moveClipsToAdjacentTrack(
  engine: EditorEngine,
  session: EditorSession,
  direction: -1 | 1,
): void {
  session.setPlaying(false);
  const source = session.source;
  const clips = selectedClips(source, session.selectedIds);
  if (!clips.length) throw new Error('Select a clip to move it');
  const tracks = [...source.composition.tracks].sort(
    (a, b) => a.order - b.order,
  );
  const landings: ClipLanding[] = clips.map(({ clip, track }) => {
    const layer = locateLayer(source.composition.layers, clip.layerId)!.layer;
    let index = tracks.findIndex((item) => item.id === track.id) + direction;
    while (
      tracks[index] &&
      (tracks[index]!.locked ||
        !trackAcceptsLayer(tracks[index]!.type, layer.type))
    )
      index += direction;
    const destination = tracks[index];
    if (!destination)
      throw new Error(
        direction < 0
          ? 'No compatible track above'
          : 'No compatible track below',
      );
    return { clip, trackId: destination.id, startTime: clip.startTime };
  });
  engine.commands.transaction(
    'Move clip',
    landingCommands(source.composition, landings),
  );
}
/** Keyboard trim: move the selected clip's start or end to the playhead, clamped
 * to one frame, the neighbouring clips and the source media. */
export function trimClipToPlayhead(
  engine: EditorEngine,
  session: EditorSession,
  edge: 'left' | 'right',
): void {
  session.setPlaying(false);
  const source = session.source;
  const clips = selectedClips(source, session.selectedIds);
  if (clips.length !== 1) throw new Error('Select one clip to trim');
  const { clip } = clips[0]!;
  const frame = Math.min(frameToTime(1, source.composition.fps), clip.duration);
  const end = clip.startTime + clip.duration;
  const bounds = clipTrimBounds(
    source.composition,
    clip.id,
    assetDuration(source, clip.assetId),
  );
  const time = session.currentTime;
  const timing =
    edge === 'left'
      ? (() => {
          const start = Math.max(bounds.minStart, Math.min(end - frame, time));
          return retimeClip(clip, start, end - start, 'left');
        })()
      : (() => {
          const next = Math.min(
            bounds.maxEnd,
            Math.max(clip.startTime + frame, time),
          );
          return retimeClip(
            clip,
            clip.startTime,
            next - clip.startTime,
            'right',
          );
        })();
  if (timing.startTime === clip.startTime && timing.duration === clip.duration)
    return;
  engine.commands.transaction('Trim clip', [
    {
      type: 'SET_CLIP_TIMING',
      compositionId: source.composition.id,
      clipId: clip.id,
      ...timing,
    },
  ]);
}
/** Up/Down: move the playhead to the previous or next cut (clip edge or marker). */
export function jumpToCut(session: EditorSession, direction: -1 | 1): void {
  session.setPlaying(false);
  const { composition } = session.source;
  const time = session.currentTime;
  const cuts = [
    0,
    composition.duration,
    ...composition.markers.map((marker) => marker.time),
    ...composition.tracks.flatMap((track) =>
      track.clips.flatMap((clip) => [
        clip.startTime,
        clip.startTime + clip.duration,
      ]),
    ),
  ].filter((cut) => (direction > 0 ? cut > time + 1e-9 : cut < time - 1e-9));
  if (cuts.length)
    session.setCurrentTime(
      direction > 0 ? Math.min(...cuts) : Math.max(...cuts),
    );
}

/** Land brand-new clips (paste, detach) under the insert rule; returns push commands. */
function landNewClips(
  composition: DeepReadonly<Composition>,
  items: { clip: Clip; trackId: string }[],
): Command[] {
  const existing = items.filter((item) =>
    composition.tracks.some((track) => track.id === item.trackId),
  );
  const commands: Command[] = [];
  if (existing.length) {
    const plan = planLanding(
      composition,
      existing.map((item) => ({
        clip: item.clip,
        trackId: item.trackId,
        startTime: item.clip.startTime,
      })),
    );
    for (const item of existing)
      item.clip.startTime = plan.placed.get(item.clip.id)!;
    plan.pushed.forEach(({ startTime }, clipId) =>
      commands.push({
        type: 'SET_CLIP_TIMING',
        compositionId: composition.id,
        clipId,
        startTime,
        duration: findClip(composition, clipId)!.clip.duration,
      }),
    );
  }
  // Tracks created in the same transaction start empty: only incoming clips meet.
  const fresh = items.filter((item) => !existing.includes(item));
  for (const trackId of new Set(fresh.map((item) => item.trackId))) {
    const lane = fresh.filter((item) => item.trackId === trackId);
    const plan = planInsert(
      [],
      lane.map((item) => ({
        id: item.clip.id,
        startTime: item.clip.startTime,
        duration: item.clip.duration,
      })),
    );
    for (const item of lane)
      item.clip.startTime = plan.placed.get(item.clip.id)!;
  }
  return commands;
}
/** TL-027 clipboard and TL-032 link, unlink and detach audio. */
function clipAction(
  engine: EditorEngine,
  session: EditorSession,
  action: EditAction,
): void {
  const source = session.source,
    composition = source.composition,
    compositionId = composition.id;
  const commands: Command[] = [];
  if (action === 'copy' || action === 'cut') {
    const ids = withLinked(source, session.selectedIds);
    const clips = selectedClips(source, ids);
    if (!clips.length) throw new Error('Select a clip to copy');
    const start = Math.min(...clips.map(({ clip }) => clip.startTime));
    const snapshot = clips.map(({ clip, track }) => ({
      layer: layerSchema.parse(
        locateLayer(composition.layers, clip.layerId)!.layer as unknown,
      ) as unknown as SceneLayer,
      clip: clipSchema.parse(clip as unknown),
      trackId: track.id,
      offset: clip.startTime - start,
    }));
    if (action === 'copy') {
      clipboard = snapshot;
      return;
    }
    for (const { clip } of clips)
      commands.push({
        type: 'DELETE_LAYER',
        compositionId,
        layerId: clip.layerId,
      });
    engine.commands.transaction('Cut', commands);
    // Only a committed cut replaces the clipboard (a locked refusal keeps it).
    clipboard = snapshot;
    return;
  }
  if (action === 'paste') {
    if (!clipboard.length) throw new Error('Nothing to paste');
    const target = selectedClips(source, session.selectedIds)[0]?.track;
    const singleTrack =
      new Set(clipboard.map((item) => item.trackId)).size === 1;
    const relinked = new Map<string, string>();
    const created = new Map<string, string>();
    const landings: { clip: Clip; trackId: string }[] = [];
    const selected: string[] = [];
    for (const item of clipboard) {
      const layer = cloneLayer(item.layer);
      layer.startTime = session.currentTime + item.offset;
      const clip = clipSchema.parse(item.clip);
      clip.id = crypto.randomUUID();
      clip.layerId = layer.id;
      clip.startTime = layer.startTime;
      const link = clipLinkId(clip);
      if (link) {
        if (!relinked.has(link)) relinked.set(link, crypto.randomUUID());
        clip.metadata.linkId = relinked.get(link)!;
      }
      const usable = (track: DeepReadonly<Track> | undefined) =>
        track && !track.locked && trackAcceptsLayer(track.type, layer.type);
      const original = composition.tracks.find(
        (track) => track.id === item.trackId,
      );
      let trackId =
        singleTrack && usable(target)
          ? target!.id
          : usable(original)
            ? original!.id
            : created.get(trackTypeForLayer(layer.type));
      if (!trackId) {
        const fresh = trackForNewClip(
          composition,
          layer.type,
          clip.startTime,
          clip.startTime + clip.duration,
        );
        trackId = fresh.trackId;
        commands.push(...fresh.commands);
        if (fresh.commands.length)
          created.set(trackTypeForLayer(layer.type), trackId);
      }
      commands.push({
        type: 'CREATE_LAYER',
        compositionId,
        parentId: null,
        layer,
      });
      landings.push({ clip, trackId });
      selected.push(layer.id);
    }
    commands.push(...landNewClips(composition, landings));
    for (const { clip, trackId } of landings) {
      const layer = commands.find(
        (command) =>
          command.type === 'CREATE_LAYER' && command.layer.id === clip.layerId,
      ) as Extract<Command, { type: 'CREATE_LAYER' }>;
      layer.layer.startTime = clip.startTime;
      commands.push({ type: 'CREATE_CLIP', compositionId, trackId, clip });
    }
    engine.commands.transaction('Paste', commands);
    session.selectMany(selected);
    return;
  }
  const clips = selectedClips(source, session.selectedIds);
  if (!clips.length) throw new Error('Select clips first');
  if (action === 'link') {
    const linkId = crypto.randomUUID();
    for (const { clip } of clips)
      commands.push({
        type: 'SET_CLIP_LINK',
        compositionId,
        clipId: clip.id,
        linkId,
      });
    engine.commands.transaction('Link clips', commands);
    return;
  }
  if (action === 'unlink') {
    const groups = new Set(
      clips.map(({ clip }) => clipLinkId(clip)).filter(Boolean),
    );
    for (const track of composition.tracks)
      for (const clip of track.clips)
        if (groups.has(clipLinkId(clip)))
          commands.push({
            type: 'SET_CLIP_LINK',
            compositionId,
            clipId: clip.id,
            linkId: null,
          });
    engine.commands.transaction('Unlink clips', commands);
    return;
  }
  // detach-audio
  const derived = new Map<string, string>();
  const landings: { clip: Clip; trackId: string }[] = [];
  let audioTrack: string | undefined;
  for (const { clip } of clips) {
    if (!describeSelection(source, [clip.layerId]).every('detach-audio'))
      throw new Error('Only video clips with their own audio can be detached');
    const asset = source.assets.find((item) => item.id === clip.assetId)!;
    const reference = `audio-of:${asset.id}`;
    let assetId =
      derived.get(asset.id) ??
      source.assets.find(
        (item) =>
          item.source.kind === 'generated' &&
          item.source.reference === reference,
      )?.id;
    if (!assetId) {
      assetId = crypto.randomUUID();
      derived.set(asset.id, assetId);
      commands.push({
        type: 'ADD_ASSET',
        asset: {
          id: assetId,
          name: `${asset.name} (audio)`,
          type: 'audio',
          source: { kind: 'generated', reference },
          metadata: { derivedFrom: asset.id },
          ...(asset.duration === undefined ? {} : { duration: asset.duration }),
        },
      });
    }
    const layerName = locateLayer(composition.layers, clip.layerId)!.layer.name;
    const layer = createLayer(
      crypto.randomUUID(),
      'audio',
      `${layerName} audio`,
      clip.duration,
    );
    layer.startTime = clip.startTime;
    layer.assetId = assetId;
    commands.push({
      type: 'CREATE_LAYER',
      compositionId,
      parentId: null,
      layer,
    });
    if (!audioTrack) {
      const target = trackForNewClip(
        composition,
        'audio',
        Math.min(...clips.map(({ clip: item }) => item.startTime)),
        Math.max(
          ...clips.map(({ clip: item }) => item.startTime + item.duration),
        ),
      );
      audioTrack = target.trackId;
      commands.push(...target.commands);
    }
    const metadata: Clip['metadata'] = { detachedFrom: clip.id };
    if (clipTimeEffects(clip).reversed) metadata.reversed = true;
    landings.push({
      trackId: audioTrack,
      clip: {
        id: crypto.randomUUID(),
        name: `${clip.name} audio`,
        layerId: layer.id,
        assetId,
        startTime: clip.startTime,
        duration: clip.duration,
        sourceIn: clip.sourceIn,
        sourceOut: clip.sourceOut,
        enabled: true,
        speed: clip.speed,
        transitionMetadata: {},
        effectMetadata: {},
        metadata,
      },
    });
    commands.push({
      type: 'SET_CLIP_AUDIO_DETACHED',
      compositionId,
      clipId: clip.id,
      detached: true,
    });
  }
  commands.push(...landNewClips(composition, landings));
  for (const { clip, trackId } of landings)
    commands.push({ type: 'CREATE_CLIP', compositionId, trackId, clip });
  engine.commands.transaction('Detach audio', commands);
}
