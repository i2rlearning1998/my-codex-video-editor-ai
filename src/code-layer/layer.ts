// X1 (spec section 5): a code animation on the timeline is a full-canvas,
// transparent, picture-less `video` layer carrying `code`, with a clip on a
// new visual lane at the top of the visual group. Move, trim, speed, reverse,
// fades, effects, transitions and presets then work as on any video clip.
import {
  createLayer,
  laneInsertIndex,
  nextTrackName,
  number,
  type CodeLayer,
  type Command,
  type Composition,
  type DeepReadonly,
} from '../core';
import { bakeKeyOf, codeMeta, type CodeData } from './meta';
export type { CodeData };

export interface NewCodeLayer {
  readonly tier: CodeData['tier'];
  readonly source: string;
  readonly meta: Readonly<Record<string, unknown>>;
  readonly params: Readonly<Record<string, unknown>>;
  readonly templateId?: string | undefined;
  readonly name?: string | undefined;
}

/** The stored `code` record (the bake key derived from its content). */
export function codeRecord(input: NewCodeLayer): CodeLayer {
  const base = {
    tier: input.tier,
    source: input.source,
    meta: structuredClone(input.meta) as Record<string, unknown>,
    params: structuredClone(input.params) as Record<string, unknown>,
  };
  return {
    ...base,
    bakeKey: bakeKeyOf(base),
    ...(input.templateId ? { templateId: input.templateId } : {}),
  } as CodeLayer;
}

/** The commands adding a code layer at `time` (one undo step). */
export function codeLayerCommands(
  composition: DeepReadonly<Composition>,
  input: NewCodeLayer,
  time: number,
  ids: { layer: string; clip: string; track: string } = {
    layer: crypto.randomUUID(),
    clip: crypto.randomUUID(),
    track: crypto.randomUUID(),
  },
): { commands: Command[]; layerId: string } {
  const code = codeRecord(input);
  const duration = codeMeta(code).duration;
  const name = (input.name ?? codeMeta(code).name).slice(0, 200) || 'Code';
  const layer = createLayer(ids.layer, 'video', name, duration);
  layer.startTime = time;
  layer.properties.width = number(composition.width);
  layer.properties.height = number(composition.height);
  layer.code = structuredClone(code) as typeof layer.code;
  return {
    layerId: ids.layer,
    commands: [
      {
        type: 'CREATE_TRACK',
        compositionId: composition.id,
        track: {
          id: ids.track,
          name: nextTrackName(composition, 'video'),
          type: 'video',
          order: composition.tracks.length,
          enabled: true,
          locked: false,
          muted: false,
          clips: [],
        },
      },
      {
        type: 'MOVE_TRACK',
        compositionId: composition.id,
        trackId: ids.track,
        index: laneInsertIndex(composition.tracks, 'visual', 'top'),
      },
      {
        type: 'CREATE_LAYER',
        compositionId: composition.id,
        parentId: null,
        layer,
      },
      {
        type: 'CREATE_CLIP',
        compositionId: composition.id,
        trackId: ids.track,
        clip: {
          id: ids.clip,
          name,
          layerId: ids.layer,
          assetId: null,
          startTime: time,
          duration,
          sourceIn: 0,
          sourceOut: duration,
          enabled: true,
          speed: 1,
          transitionMetadata: {},
          effectMetadata: {},
          metadata: {},
        },
      },
    ],
  };
}
