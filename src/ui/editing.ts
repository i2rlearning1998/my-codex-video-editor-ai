import {
  layerSchema,
  clipSchema,
  effectiveLayerTiming,
  findClipByLayer,
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

/** Top-level selection roots prevent double-moving/deleting a selected descendant. */
export function selectionRoots(
  source: RenderSource,
  ids: readonly string[],
): SceneLayer[] {
  const selected = new Set(ids),
    result: SceneLayer[] = [];
  const visit = (layers: readonly SceneLayer[]) => {
    for (const layer of layers) {
      if (selected.has(layer.id)) result.push(layer);
      else visit(layer.children);
    }
  };
  visit(source.composition.layers);
  return result;
}
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
  | 'toggle-enabled';
export function contextActions(
  source: RenderSource,
  ids: readonly string[],
  time: number,
  markerId?: string,
): EditAction[] {
  if (markerId) return ['delete-marker'];
  const layers = selectionRoots(source, ids);
  if (!layers.length) return ['marker'];
  const actions: EditAction[] = ['duplicate', 'delete'];
  if (layers.every((layer) => findClipByLayer(source.composition, layer.id)))
    actions.push('toggle-enabled');
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
  const layers = selectionRoots(source, session.selectedIds),
    commands: Command[] = [],
    selected: string[] = [];
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
  else if (action === 'toggle-enabled')
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
    commands.push({
      type: 'GROUP',
      compositionId,
      layerIds: layers.map((layer) => layer.id),
      groupId,
      name: 'Group',
    });
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
                startTime: timing.startTime,
                duration: session.currentTime - timing.startTime,
                sourceIn: clipLocation.clip.sourceIn,
                sourceOut:
                  clipLocation.clip.sourceIn +
                  (session.currentTime - timing.startTime) *
                    clipLocation.clip.speed,
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
        clipCopy.layerId = copy.id;
        clipCopy.startTime =
          action === 'split' ? session.currentTime : timing.startTime;
        clipCopy.duration =
          action === 'split'
            ? timing.startTime + timing.duration - session.currentTime
            : timing.duration;
        if (action === 'split')
          clipCopy.sourceIn =
            clipLocation.clip.sourceIn +
            (session.currentTime - timing.startTime) * clipLocation.clip.speed;
        commands.push({
          type: 'CREATE_CLIP',
          compositionId,
          trackId: clipLocation.track.id,
          clip: clipCopy,
        });
      }
      selected.push(copy.id);
    }
  if (commands.length)
    engine.commands.transaction(
      action[0]!.toUpperCase() + action.slice(1),
      commands,
    );
  if (selected.length) session.selectMany(selected);
}
