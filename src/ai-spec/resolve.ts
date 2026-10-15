import { validateSpec, formatIssues, CATALOG_VERSION } from './validate';
import type { Scalar } from './schema';
import { frozen } from './json';
import { blockData } from './catalogs/data';
import { compileBlock } from './vendor/blocks/sandbox/compile';
export const COMMAND_NAMES = [
  'CREATE_COMPOSITION',
  'CREATE_LAYER',
  'SET_PROPERTY',
  'CREATE_TRACK',
  'CREATE_CLIP',
  'ADD_EFFECT',
  'CREATE_TRANSITION',
] as const;
export type CommandName = (typeof COMMAND_NAMES)[number];
export type Readiness = 'mapped' | 'needs-asset' | 'blocked';
export interface Operation {
  sequence: number;
  status: Readiness;
  reason: string | null;
  command: { type: CommandName; [key: string]: unknown };
}
export interface BuildPlan {
  version: 1;
  specId: string;
  catalogVersion: string;
  executable: false;
  duration: number;
  scenes: {
    id: string;
    compositionId: string;
    timelineStart: number;
    duration: number;
  }[];
  editableParameters: unknown[];
  bindings: ReadonlyArray<{ path: string; param: string }>;
  operations: Operation[];
  requirements: { path: string; reason: string; details?: unknown }[];
  assets: unknown[];
  itemMap: {
    sceneId: string;
    itemId: string;
    layerId: string;
    clipId: string;
  }[];
}
const property = (type: string, value: unknown) => ({
  type,
  value,
  animated: false,
  keyframes: [],
  constraints: [],
});
const identity = () => ({
  position: property('vector2', [0, 0]),
  scale: property('vector2', [1, 1]),
  rotation: property('number', 0),
  opacity: property('number', 1),
});
export function resolveSpec(
  input: unknown,
  overrides: Record<string, Scalar> = {},
): BuildPlan {
  const result = validateSpec(input, overrides);
  if (!result.ok) throw new Error(formatIssues(result));
  const { spec, bindings } = result;
  const plan: BuildPlan = {
    version: 1,
    specId: spec.id,
    catalogVersion: CATALOG_VERSION,
    executable: false,
    duration: 0,
    scenes: [],
    editableParameters: structuredClone(spec.parameters),
    bindings,
    operations: [],
    requirements: [],
    assets: structuredClone(spec.assets),
    itemMap: [],
  };
  const emit = (
    type: CommandName,
    args: Record<string, unknown>,
    status: Readiness = 'mapped',
    reason: string | null = null,
  ) => {
    plan.operations.push({
      sequence: plan.operations.length,
      status,
      reason,
      command: { type, ...args },
    });
  };
  const set = (
    compositionId: string,
    layerId: string,
    key: string,
    type: string,
    value: unknown,
    status: Readiness,
    reason: string | null,
  ) =>
    emit(
      'SET_PROPERTY',
      {
        compositionId,
        layerId,
        target: { kind: 'property', key },
        property: property(type, value),
      },
      status,
      reason,
    );
  const layer = (
    id: string,
    name: string,
    type: string,
    start: number,
    duration: number,
    assetId: string | null = null,
  ) => ({
    id,
    name,
    type,
    startTime: start,
    duration,
    transform: identity(),
    properties: {},
    effects: [],
    masks: [],
    assetId,
    children: [],
  });
  for (const [si, scene] of spec.scenes.entries()) {
    const compositionId = `ais_${spec.id}_s${si}`,
      scenePath = `/scenes/${si}`;
    plan.scenes.push({
      id: scene.id,
      compositionId,
      timelineStart: plan.duration,
      duration: scene.duration,
    });
    plan.duration += scene.duration;
    emit('CREATE_COMPOSITION', {
      composition: {
        id: compositionId,
        name: scene.name,
        ...spec.canvas,
        duration: scene.duration,
        layers: [],
        tracks: [],
        markers: [],
        audioTracks: [],
      },
    });
    // Explicit native background preserves the requested scene length and color;
    // main has one project background, not independent composition backgrounds.
    const backgroundId = compositionId + '_bg';
    emit('CREATE_LAYER', {
      compositionId,
      parentId: null,
      layer: layer(
        backgroundId,
        'Scene background',
        'shape',
        0,
        scene.duration,
      ),
    });
    for (const [key, type, value] of [
      ['width', 'number', spec.canvas.width],
      ['height', 'number', spec.canvas.height],
      ['shapeKind', 'string', 'rectangle'],
      ['fill', 'color', scene.background],
    ] as const)
      set(compositionId, backgroundId, key, type, value, 'mapped', null);
    for (const [ii, item] of scene.items.entries()) {
      const id = compositionId + `_i${ii}`,
        layerId = id + '_layer',
        trackId = id + '_track',
        clipId = id + '_clip',
        path = scenePath + `/items/${ii}`;
      const asset =
        'slot' in item
          ? spec.assets.find((a) => a.id === item.slot)
          : undefined;
      const native = item.kind === 'text' || item.kind === 'shape';
      const status: Readiness =
        item.kind === 'code-block'
          ? 'blocked'
          : native
            ? 'mapped'
            : 'needs-asset';
      const reason =
        item.kind === 'code-block'
          ? 'Code layer type/command integration is absent on main'
          : native
            ? null
            : asset?.assetId
              ? 'Host must verify the uploaded asset id, kind, duration and local bytes'
              : 'Owner must supply a local asset for slot ' +
                ('slot' in item ? item.slot : '');
      plan.itemMap.push({
        sceneId: scene.id,
        itemId: item.id,
        layerId,
        clipId,
      });
      if (reason)
        plan.requirements.push({
          path,
          reason,
          ...('slot' in item
            ? {
                details: {
                  slot: item.slot,
                  description: asset!.description,
                  ...(item.kind === 'image-placeholder'
                    ? { prompt: item.prompt }
                    : {}),
                },
              }
            : {}),
        });
      const type =
        item.kind === 'code-block'
          ? 'code'
          : item.kind === 'text'
            ? 'text'
            : item.kind === 'shape'
              ? 'shape'
              : asset!.kind;
      const trackType =
        type === 'text'
          ? 'text'
          : type === 'shape' || type === 'code'
            ? 'object'
            : type === 'audio'
              ? 'audio'
              : 'video';
      emit(
        'CREATE_LAYER',
        {
          compositionId,
          parentId: null,
          layer: layer(
            layerId,
            item.name,
            type,
            item.start,
            item.duration,
            asset?.assetId ?? null,
          ),
        },
        status,
        reason,
      );
      for (const [key, type, value] of [
        ['position', 'vector2', [item.transform.x, item.transform.y]],
        ['scale', 'vector2', [item.transform.scale, item.transform.scale]],
        ['rotation', 'number', item.transform.rotation],
        ['opacity', 'number', item.transform.opacity],
      ] as const)
        emit(
          'SET_PROPERTY',
          {
            compositionId,
            layerId,
            target: { kind: 'transform', key },
            property: property(type, value),
          },
          status,
          reason,
        );
      if ('width' in item) {
        set(
          compositionId,
          layerId,
          'width',
          'number',
          item.width,
          status,
          reason,
        );
        set(
          compositionId,
          layerId,
          'height',
          'number',
          item.height,
          status,
          reason,
        );
      }
      if (item.kind === 'text') {
        set(
          compositionId,
          layerId,
          'text',
          'string',
          item.text,
          status,
          reason,
        );
        set(
          compositionId,
          layerId,
          'fontSize',
          'number',
          item.fontSize,
          status,
          reason,
        );
        set(
          compositionId,
          layerId,
          'fontFamily',
          'string',
          item.fontFamily,
          status,
          reason,
        );
        set(compositionId, layerId, 'fill', 'color', item.fill, status, reason);
      } else if (item.kind === 'shape') {
        set(
          compositionId,
          layerId,
          'shapeKind',
          'string',
          item.shape,
          status,
          reason,
        );
        set(compositionId, layerId, 'fill', 'color', item.fill, status, reason);
      } else if (item.kind === 'code-block') {
        set(
          compositionId,
          layerId,
          'block_id',
          'string',
          item.blockId,
          status,
          reason,
        );
        set(
          compositionId,
          layerId,
          'block_version',
          'string',
          item.blockVersion,
          status,
          reason,
        );
        set(
          compositionId,
          layerId,
          'block_seed',
          'number',
          item.seed,
          status,
          reason,
        );
        const source = spec.blocks.find((b) => b.id === item.blockId)?.source;
        if (source)
          set(
            compositionId,
            layerId,
            'block_source',
            'string',
            source,
            status,
            reason,
          );
        const compiled = source ? compileBlock(source) : undefined;
        const paramSpecs = compiled?.ok
          ? compiled.value.info.params
          : blockData.find((b) => b.id === item.blockId)!.params;
        for (const key of Object.keys(item.params).sort()) {
          const v = item.params[key];
          set(
            compositionId,
            layerId,
            'block_' + key,
            paramSpecs.find((p) => p.name === key)?.type === 'color'
              ? 'color'
              : typeof v === 'number'
                ? 'number'
                : typeof v === 'boolean'
                  ? 'boolean'
                  : 'string',
            v,
            status,
            reason,
          );
        }
      }
      if (item.depth !== 1 || scene.cameraMoves.length) {
        const why = 'Camera/parallax renderer integration is absent on main';
        set(
          compositionId,
          layerId,
          'camera_depth',
          'number',
          item.depth,
          'blocked',
          why,
        );
        plan.requirements.push({ path: path + '/depth', reason: why });
      }
      emit(
        'CREATE_TRACK',
        {
          compositionId,
          track: {
            id: trackId,
            name: item.name,
            type: trackType,
            order: ii,
            enabled: true,
            locked: false,
            muted: false,
            clips: [],
          },
        },
        status,
        reason,
      );
      const sourceIn = 'sourceIn' in item ? item.sourceIn : 0;
      emit(
        'CREATE_CLIP',
        {
          compositionId,
          trackId,
          clip: {
            id: clipId,
            name: item.name,
            layerId,
            assetId: asset?.assetId ?? null,
            startTime: item.start,
            duration: item.duration,
            sourceIn,
            sourceOut: sourceIn + item.duration,
            enabled: true,
            speed: 1,
            transitionMetadata: {},
            effectMetadata: {},
            metadata: {},
          },
        },
        status,
        reason,
      );
      for (const effect of item.fx) {
        const why =
          'ADD_EFFECT is documented future vocabulary; no command or FX wiring exists on main';
        emit(
          'ADD_EFFECT',
          { compositionId, layerId, clipId, effect },
          'blocked',
          why,
        );
        plan.requirements.push({ path: path + '/fx', reason: why });
      }
    }
    for (const [mi, move] of scene.cameraMoves.entries()) {
      const layerId = compositionId + `_camera${mi}`,
        why =
          'Camera layer, active-camera selection and shake are not wired on main';
      emit(
        'CREATE_LAYER',
        {
          compositionId,
          parentId: null,
          layer: layer(
            layerId,
            'Camera ' + move.id,
            'camera',
            move.start,
            move.duration,
          ),
        },
        'blocked',
        why,
      );
      for (const key of ['x', 'y', 'zoom', 'rotation'] as const) {
        emit(
          'SET_PROPERTY',
          {
            compositionId,
            layerId,
            target: { kind: 'property', key: 'camera_' + key },
            property: {
              type: 'number',
              value: move.from[key],
              animated: true,
              constraints: [],
              keyframes: [
                {
                  time: move.start,
                  value: move.from[key],
                  easing: move.easing,
                },
                { time: move.start + move.duration, value: move.to[key] },
              ],
            },
          },
          'blocked',
          why,
        );
      }
      for (const key of ['amplitude', 'frequency'] as const)
        emit(
          'SET_PROPERTY',
          {
            compositionId,
            layerId,
            target: { kind: 'property', key: 'camera_shake_' + key },
            property: {
              type: 'number',
              value: move.from.shake[key],
              animated: true,
              constraints: [],
              keyframes: [
                {
                  time: move.start,
                  value: move.from.shake[key],
                  easing: move.easing,
                },
                { time: move.start + move.duration, value: move.to.shake[key] },
              ],
            },
          },
          'blocked',
          why,
        );
      set(
        compositionId,
        layerId,
        'camera_shake_seed',
        'number',
        move.from.shake.seed,
        'blocked',
        why,
      );
      plan.requirements.push({
        path: scenePath + `/cameraMoves/${mi}`,
        reason: why,
      });
    }
    if (scene.transition) {
      const why =
        'CREATE_TRANSITION is documented future vocabulary; scene transition integration is absent on main';
      emit(
        'CREATE_TRANSITION',
        {
          fromCompositionId: compositionId,
          toCompositionId: `ais_${spec.id}_s${si + 1}`,
          boundary: plan.duration,
          ...scene.transition,
        },
        'blocked',
        why,
      );
      plan.requirements.push({ path: scenePath + '/transition', reason: why });
    }
  }
  return frozen(plan) as BuildPlan;
}
