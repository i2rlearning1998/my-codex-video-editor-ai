import { z } from 'zod';
import {
  assertJson,
  assetSchema,
  compositionSchema,
  clipSchema,
  createLayer,
  idSchema,
  layerSchema,
  nameSchema,
  propertySchema,
  trackSchema,
  type Project,
} from './model';
import {
  childrenOf,
  compositionById,
  findLayer,
  insert,
  requireLayer,
} from './scene';

const location = { compositionId: idSchema };
const placement = {
  parentId: idSchema.nullable(),
  index: z.number().int().nonnegative().optional(),
};
const marker = z
  .object({
    id: idSchema,
    time: z.number().finite().nonnegative(),
    label: z.string().max(256),
  })
  .strict();
export const commandSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('SET_PROJECT_NAME'),
      name: nameSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('CREATE_TRACK'),
      ...location,
      track: trackSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('DELETE_TRACK'),
      ...location,
      trackId: idSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('SET_TRACK_STATE'),
      ...location,
      trackId: idSchema,
      enabled: z.boolean(),
      locked: z.boolean(),
      muted: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('MOVE_TRACK'),
      ...location,
      trackId: idSchema,
      index: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal('CREATE_CLIP'),
      ...location,
      trackId: idSchema,
      clip: clipSchema,
      index: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('DELETE_CLIP'),
      ...location,
      clipId: idSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('SET_CLIP_TIMING'),
      ...location,
      clipId: idSchema,
      startTime: z.number().finite().nonnegative(),
      duration: z.number().finite().positive(),
      sourceIn: z.number().finite().nonnegative().optional(),
      sourceOut: z.number().finite().positive().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('MOVE_CLIP'),
      ...location,
      clipId: idSchema,
      trackId: idSchema,
      index: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('SET_CLIP_ENABLED'),
      ...location,
      clipId: idSchema,
      enabled: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal('ADD_MARKER'), ...location, marker }).strict(),
  z.object({ type: z.literal('UPDATE_MARKER'), ...location, marker }).strict(),
  z
    .object({
      type: z.literal('DELETE_MARKER'),
      ...location,
      markerId: idSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('SET_KEYFRAME'),
      ...location,
      layerId: idSchema,
      key: z.enum(['position', 'scale', 'rotation', 'opacity']),
      time: z.number().finite().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal('REMOVE_KEYFRAME'),
      ...location,
      layerId: idSchema,
      key: z.enum(['position', 'scale', 'rotation', 'opacity']),
      time: z.number().finite().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal('SET_LAYER_TIMING'),
      ...location,
      layerId: idSchema,
      startTime: z.number().finite().nonnegative(),
      duration: z.number().finite().positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal('CREATE_COMPOSITION'),
      composition: compositionSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('CREATE_LAYER'),
      ...location,
      ...placement,
      layer: layerSchema,
    })
    .strict(),
  z
    .object({ type: z.literal('DELETE_LAYER'), ...location, layerId: idSchema })
    .strict(),
  z
    .object({
      type: z.literal('MOVE_LAYER'),
      ...location,
      ...placement,
      layerId: idSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('SET_PROPERTY'),
      ...location,
      layerId: idSchema,
      target: z.discriminatedUnion('kind', [
        z
          .object({
            kind: z.literal('transform'),
            key: z.enum(['position', 'rotation', 'scale', 'opacity']),
          })
          .strict(),
        z.object({ kind: z.literal('property'), key: idSchema }).strict(),
      ]),
      property: propertySchema,
    })
    .strict(),
  z.object({ type: z.literal('ADD_ASSET'), asset: assetSchema }).strict(),
  z
    .object({
      type: z.literal('REPLACE_ASSET'),
      assetId: idSchema,
      asset: assetSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('GROUP'),
      ...location,
      layerIds: z.array(idSchema).min(1),
      groupId: idSchema,
      name: z.string().trim().min(1).max(256),
    })
    .strict(),
  z
    .object({ type: z.literal('UNGROUP'), ...location, groupId: idSchema })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export function validateCommand(input: unknown): Command {
  assertJson(input);
  return commandSchema.parse(input);
}

export function applyCommand(project: Project, command: Command): void {
  switch (command.type) {
    case 'SET_PROJECT_NAME':
      project.metadata.name = command.name;
      return;
    case 'CREATE_COMPOSITION':
      project.compositions.push(command.composition);
      return;
    case 'ADD_ASSET': {
      if (project.assets.some((asset) => asset.id === command.asset.id))
        throw new Error('Asset ID already exists');
      project.assets.push(command.asset);
      return;
    }
    case 'REPLACE_ASSET': {
      const index = project.assets.findIndex(
        (asset) => asset.id === command.assetId,
      );
      if (index < 0) throw new Error('Unknown asset');
      if (command.asset.id !== command.assetId)
        throw new Error('Replacement must preserve asset ID');
      project.assets[index] = command.asset;
      return;
    }
  }
  const composition = compositionById(project, command.compositionId);
  const requireTrack = (id: string) => {
    const track = composition.tracks.find((item) => item.id === id);
    if (!track) throw new Error('Unknown track');
    return track;
  };
  const requireClip = (id: string) => {
    for (const track of composition.tracks) {
      const index = track.clips.findIndex((clip) => clip.id === id);
      if (index >= 0) return { track, index, clip: track.clips[index]! };
    }
    throw new Error('Unknown clip');
  };
  switch (command.type) {
    case 'CREATE_TRACK':
      composition.tracks.push(command.track);
      composition.tracks.sort((a, b) => a.order - b.order);
      return;
    case 'DELETE_TRACK': {
      const index = composition.tracks.findIndex(
        (track) => track.id === command.trackId,
      );
      if (index < 0) throw new Error('Unknown track');
      if (composition.tracks[index]!.clips.length)
        throw new Error('Delete clips before deleting their track');
      composition.tracks.splice(index, 1);
      composition.tracks.forEach((track, order) => (track.order = order));
      return;
    }
    case 'SET_TRACK_STATE': {
      const track = requireTrack(command.trackId);
      Object.assign(track, {
        enabled: command.enabled,
        locked: command.locked,
        muted: command.muted,
      });
      return;
    }
    case 'MOVE_TRACK': {
      const sourceIndex = composition.tracks.findIndex(
        (track) => track.id === command.trackId,
      );
      if (sourceIndex < 0) throw new Error('Unknown track');
      const [track] = composition.tracks.splice(sourceIndex, 1);
      composition.tracks.splice(
        Math.min(command.index, composition.tracks.length),
        0,
        track!,
      );
      composition.tracks.forEach((item, order) => (item.order = order));
      return;
    }
    case 'CREATE_CLIP': {
      const track = requireTrack(command.trackId);
      if (track.locked) throw new Error('Track is locked');
      track.clips.splice(
        Math.min(command.index ?? track.clips.length, track.clips.length),
        0,
        command.clip,
      );
      return;
    }
    case 'DELETE_CLIP': {
      const { track, index } = requireClip(command.clipId);
      if (track.locked) throw new Error('Track is locked');
      track.clips.splice(index, 1);
      return;
    }
    case 'SET_CLIP_TIMING': {
      const { track, clip } = requireClip(command.clipId);
      if (track.locked) throw new Error('Track is locked');
      if (!Number.isFinite(command.startTime + command.duration))
        throw new Error('Clip timing exceeds numerical limits');
      clip.startTime = command.startTime;
      clip.duration = command.duration;
      if (command.sourceIn !== undefined && command.sourceOut !== undefined) {
        clip.sourceIn = command.sourceIn;
        clip.sourceOut = command.sourceOut;
      } else if (
        command.sourceIn !== undefined ||
        command.sourceOut !== undefined
      )
        throw new Error('Clip source range must be updated together');
      return;
    }
    case 'MOVE_CLIP': {
      const source = requireClip(command.clipId);
      const destination = requireTrack(command.trackId);
      if (source.track.locked || destination.locked)
        throw new Error('Track is locked');
      source.track.clips.splice(source.index, 1);
      destination.clips.splice(
        Math.min(
          command.index ?? destination.clips.length,
          destination.clips.length,
        ),
        0,
        source.clip,
      );
      return;
    }
    case 'SET_CLIP_ENABLED': {
      const { track, clip } = requireClip(command.clipId);
      if (track.locked) throw new Error('Track is locked');
      clip.enabled = command.enabled;
      return;
    }
    case 'ADD_MARKER':
      if (command.marker.time > composition.duration)
        throw new Error('Marker exceeds composition');
      composition.markers.push(command.marker);
      return;
    case 'UPDATE_MARKER': {
      if (command.marker.time > composition.duration)
        throw new Error('Marker exceeds composition');
      const index = composition.markers.findIndex(
        (item) => item.id === command.marker.id,
      );
      if (index < 0) throw new Error('Unknown marker');
      composition.markers[index] = command.marker;
      return;
    }
    case 'DELETE_MARKER': {
      const index = composition.markers.findIndex(
        (item) => item.id === command.markerId,
      );
      if (index < 0) throw new Error('Unknown marker');
      composition.markers.splice(index, 1);
      return;
    }
    case 'SET_KEYFRAME':
    case 'REMOVE_KEYFRAME': {
      const property = requireLayer(composition, command.layerId).layer
        .transform[command.key];
      if (command.time > composition.duration)
        throw new Error('Keyframe exceeds composition');
      const keyframes = property.keyframes.filter(
        (frame) => frame.time !== command.time,
      );
      if (command.type === 'SET_KEYFRAME') {
        if (property.type === 'vector2')
          keyframes.push({ time: command.time, value: [...property.value] });
        else keyframes.push({ time: command.time, value: property.value });
      }
      keyframes.sort((a, b) => a.time - b.time);
      Object.assign(property, { keyframes, animated: keyframes.length > 0 });
      return;
    }
    case 'CREATE_LAYER':
      insert(
        childrenOf(composition, command.parentId),
        command.layer,
        command.index,
      );
      return;
    case 'DELETE_LAYER': {
      const { siblings, index } = requireLayer(composition, command.layerId);
      const removed = new Set<string>();
      const collect = (layer: (typeof siblings)[number]) => {
        removed.add(layer.id);
        layer.children.forEach(collect);
      };
      collect(siblings[index]!);
      for (const track of composition.tracks) {
        track.clips = track.clips.filter((clip) => !removed.has(clip.layerId));
      }
      siblings.splice(index, 1);
      return;
    }
    case 'MOVE_LAYER': {
      const { layer, siblings, index } = requireLayer(
        composition,
        command.layerId,
      );
      if (
        command.parentId === layer.id ||
        (command.parentId && findLayer(layer.children, command.parentId))
      )
        throw new Error('Cannot move a layer into itself or its descendants');
      const destination = childrenOf(composition, command.parentId);
      // Contract: preserve stored local values, even when world geometry/opacity changes.
      siblings.splice(index, 1);
      insert(destination, layer, command.index);
      return;
    }
    case 'SET_LAYER_TIMING': {
      if (!Number.isFinite(command.startTime + command.duration))
        throw new Error('Layer timing exceeds numerical limits');
      const { layer } = requireLayer(composition, command.layerId);
      layer.startTime = command.startTime;
      layer.duration = command.duration;
      return;
    }
    case 'SET_PROPERTY': {
      const { layer } = requireLayer(composition, command.layerId);
      if (command.target.kind === 'property') {
        const current = layer.properties[command.target.key];
        if (current && current.type !== command.property.type)
          throw new Error('Property type cannot change');
        layer.properties[command.target.key] = command.property;
      } else {
        const key = command.target.key;
        if (layer.transform[key].type !== command.property.type)
          throw new Error('Invalid transform property type');
        layer.transform = { ...layer.transform, [key]: command.property };
      }
      return;
    }
    case 'GROUP': {
      if (new Set(command.layerIds).size !== command.layerIds.length)
        throw new Error('Duplicate group selection');
      const selected = command.layerIds.map((id) =>
        requireLayer(composition, id),
      );
      const first = selected[0]!;
      if (selected.some((item) => item.siblings !== first.siblings))
        throw new Error('Grouped layers must be siblings');
      selected.sort((a, b) => a.index - b.index);
      const group = createLayer(
        command.groupId,
        'group',
        command.name,
        composition.duration,
      );
      group.children = selected.map((item) => item.layer);
      const index = selected[0]!.index;
      for (const item of [...selected].reverse())
        item.siblings.splice(item.index, 1);
      first.siblings.splice(index, 0, group);
      return;
    }
    case 'UNGROUP': {
      const { layer, siblings, index } = requireLayer(
        composition,
        command.groupId,
      );
      if (layer.type !== 'group')
        throw new Error('Only groups can be ungrouped');
      // Conservative stored-identity guard: affine products may include unrepresentable shear.
      // Do not broaden this to a numerical identity check; metadata must also be preserved.
      const identity = createLayer('identity', 'group', 'Identity').transform;
      if (
        JSON.stringify(layer.transform) !== JSON.stringify(identity) ||
        Object.keys(layer.properties).length
      )
        throw new Error(
          'Ungroup currently requires an identity transform and no group properties',
        );
      siblings.splice(index, 1, ...layer.children);
      return;
    }
  }
}
