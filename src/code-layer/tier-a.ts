// X2 (spec sections 1 and 2): Tier A. A valid Composition Spec v1 becomes
// ordinary layers through the Command Bus in one undo step, into new scenes
// after the open one or into the open scene. The build plan of
// `resolveSpec` is adapted here: its ids get a fresh suffix (so an import can
// repeat), code-block items become code layers (Tier B), and the parts the
// editor cannot build yet (media slots without files, FX, transitions,
// camera moves) are left out and named, never silently.
import type { Command, Composition, DeepReadonly, Project } from '../core';
import type { BlockInfo } from '../blocks/types';
import { blockMeta, MAX_CODE_DURATION } from './meta';
import { codeRecord } from './layer';

export const STARTER_PREFIX = '@block:';

export interface TierAOptions {
  readonly project: DeepReadonly<Project>;
  readonly current: DeepReadonly<Composition>;
  readonly mode: 'new' | 'current';
  /** The param values the user chose (the spec's parameters). */
  readonly overrides?: Readonly<Record<string, number | string | boolean>>;
  /** Mode 'current': where the spec's time 0 lands (seconds). */
  readonly at?: number;
  /** Fresh id suffix (tests pass a fixed one). */
  readonly suffix?: string;
  /**
   * J (composition adapter): decides an item before it is built. `skip`
   * leaves it out; `{ assetId }` fills a media slot with an asset already in
   * the project; `{ placeholder }` builds an empty-slot frame (a shape layer
   * with these properties) in the slot's place. Undefined keeps the default
   * (media slots without a file are left out and named).
   */
  readonly item?: (item: TierAItem) => TierAItemDecision | undefined;
}
export interface TierAItem {
  readonly id: string;
  readonly kind: string;
  readonly slot?: string;
  /** Scene-local start and the item's length (seconds). */
  readonly start: number;
  readonly duration: number;
  /** The layer this item becomes (with the suffix). */
  readonly layerId: string;
  readonly clipId: string;
  readonly compositionId: string;
}
export type TierAItemDecision =
  | 'skip'
  | { readonly assetId: string }
  | { readonly placeholder: Readonly<Record<string, unknown>> };
export interface TierAResult {
  readonly commands: Command[];
  /** New scenes, in order (mode 'new'). */
  readonly compositionIds: string[];
  /** What was not built, in plain words (path: reason). */
  readonly notBuilt: string[];
}

interface PlannedCommand {
  type: string;
  [key: string]: unknown;
}
interface SpecItem {
  id: string;
  kind: string;
  slot?: string;
  start: number;
  duration: number;
  blockId?: string;
  params?: Record<string, number | string | boolean>;
  seed?: number;
  depth?: number;
}

export async function tierACommands(
  raw: unknown,
  options: TierAOptions,
): Promise<TierAResult> {
  const [{ validateSpec }, { resolveSpec }, { compileBlock }, { getBlock }] =
    await Promise.all([
      import('../ai-spec/validate'),
      import('../ai-spec/resolve'),
      import('../blocks/sandbox/compile'),
      import('../blocks/starters'),
    ]);
  const overrides = { ...(options.overrides ?? {}) };
  const validated = validateSpec(raw, overrides);
  if (!validated.ok)
    throw new Error(
      validated.errors.map((e) => `${e.path}: ${e.message}`).join('\n'),
    );
  const spec = validated.spec as unknown as {
    canvas: { width: number; height: number };
    blocks: { id: string; source: string }[];
    scenes: { id: string; items: SpecItem[] }[];
  };
  const plan = resolveSpec(raw, overrides);
  const suffix = options.suffix ?? crypto.randomUUID().slice(0, 8);
  // Every id the plan made gets the suffix.
  const known = new Set<string>();
  for (const op of plan.operations) {
    const c = op.command as PlannedCommand;
    for (const key of ['composition', 'layer', 'track', 'clip'] as const) {
      const value = c[key] as { id?: string } | undefined;
      if (value?.id) known.add(value.id);
    }
  }
  const scenes = new Map(
    plan.scenes.map((scene) => [scene.compositionId, scene]),
  );
  const current = options.mode === 'current';
  const rename = (id: string) =>
    current && scenes.has(id) ? options.current.id : `${id}_${suffix}`;
  const remap = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value), (_key, item: unknown) =>
      typeof item === 'string' && known.has(item) ? rename(item) : item,
    ) as T;
  const items = new Map(
    plan.itemMap.map((entry) => {
      const scene = spec.scenes.find((s) => s.id === entry.sceneId)!;
      return [
        entry.layerId,
        scene.items.find((item) => item.id === entry.itemId)!,
      ] as const;
    }),
  );
  /** Layers (plan ids) that are not built, and why. */
  const skipped = new Map<string, string>();
  const decisions = new Map<string, TierAItemDecision | undefined>();
  const decide = (layer: string, item: SpecItem) => {
    if (!options.item) return undefined;
    if (!decisions.has(layer)) {
      const entry = plan.itemMap.find((e) => e.layerId === layer)!;
      const scene = plan.scenes.find((s) => s.id === entry.sceneId)!;
      decisions.set(
        layer,
        options.item({
          id: item.id,
          kind: item.kind,
          ...(item.slot ? { slot: item.slot } : {}),
          start: item.start,
          duration: item.duration,
          layerId: rename(layer),
          clipId: rename(entry.clipId),
          compositionId: rename(scene.compositionId),
        }),
      );
    }
    return decisions.get(layer);
  };
  const notBuilt = plan.requirements.flatMap((r) =>
    r.reason.startsWith('Code layer') || r.reason.startsWith('Camera/parallax')
      ? []
      : [`${r.path}: ${r.reason}`],
  );
  const commands: Command[] = [];
  const compositionIds: string[] = [];
  let order = current ? options.current.tracks.length : 0;
  let insertAt =
    options.project.compositions.findIndex(
      (item) => item.id === options.current.id,
    ) + 1;
  const offsetOf = (compositionId: unknown) =>
    current
      ? (options.at ?? 0) +
        (scenes.get(String(compositionId))?.timelineStart ?? 0)
      : 0;
  for (const op of plan.operations) {
    const c = structuredClone(op.command) as PlannedCommand;
    const layerId = (c.layer as { id?: string } | undefined)?.id ?? c.layerId;
    const clipLayer = (c.clip as { layerId?: string } | undefined)?.layerId;
    const trackOf = (c.track as { id?: string } | undefined)?.id;
    const itemLayer =
      (typeof layerId === 'string' && layerId) ||
      clipLayer ||
      (trackOf ? trackOf.replace(/_track$/, '_layer') : undefined);
    if (itemLayer && skipped.has(itemLayer)) continue;
    const item = itemLayer ? items.get(itemLayer) : undefined;
    if (c.type === 'CREATE_COMPOSITION') {
      if (current) continue;
      const composition = c.composition as Record<string, unknown>;
      composition.backgroundColor = options.project.settings.backgroundColor;
      commands.push(remap(c) as unknown as Command);
      const id = rename(String(composition.id));
      compositionIds.push(id);
      commands.push({
        type: 'MOVE_COMPOSITION',
        compositionId: id,
        index: insertAt++,
      } as Command);
      continue;
    }
    const decision = itemLayer && item ? decide(itemLayer, item) : undefined;
    if (decision === 'skip') {
      skipped.set(itemLayer!, 'skip');
      continue;
    }
    if (op.status === 'needs-asset') {
      if (decision && 'assetId' in decision) {
        if (c.type === 'CREATE_LAYER')
          (c.layer as Record<string, unknown>).assetId = decision.assetId;
        if (c.type === 'CREATE_CLIP')
          (c.clip as Record<string, unknown>).assetId = decision.assetId;
      } else if (decision && 'placeholder' in decision) {
        if (c.type === 'CREATE_LAYER') {
          const layer = c.layer as Record<string, unknown>;
          layer.type = 'shape';
          layer.assetId = null;
          layer.properties = {
            ...(layer.properties as object),
            ...decision.placeholder,
          };
        }
      } else {
        if (itemLayer) skipped.set(itemLayer, 'needs-asset');
        continue;
      }
    }
    if (
      op.command.type === 'ADD_EFFECT' ||
      op.command.type === 'CREATE_TRANSITION'
    )
      continue;
    const key = (c.target as { key?: string } | undefined)?.key ?? '';
    if (key.startsWith('camera_')) continue;
    if (op.status === 'blocked' && item?.kind !== 'code-block') {
      if (itemLayer) skipped.set(itemLayer, 'blocked');
      continue;
    }
    if (item?.kind === 'code-block') {
      // Block params are stored in the code record, not as properties.
      if (c.type === 'SET_PROPERTY' && key.startsWith('block_')) continue;
      if (c.type === 'CREATE_LAYER') {
        const inline = spec.blocks.find((b) => b.id === item.blockId)?.source;
        let info: BlockInfo | undefined;
        let source = inline;
        if (inline) {
          const compiled = compileBlock(inline);
          if (compiled.ok) info = compiled.value.info;
        } else if (item.blockId && getBlock(item.blockId)) {
          info = getBlock(item.blockId);
          source = `${STARTER_PREFIX}${item.blockId}`;
        }
        if (!info || !source) {
          skipped.set(itemLayer!, 'blocked');
          notBuilt.push(
            `${item.id}: the block "${item.blockId}" is not available in this editor`,
          );
          continue;
        }
        const meta = blockMeta(info);
        const layer = c.layer as Record<string, unknown>;
        const duration = Math.min(
          MAX_CODE_DURATION,
          Number(layer.duration) || meta.duration,
        );
        layer.type = 'video';
        layer.properties = {
          width: number(spec.canvas.width),
          height: number(spec.canvas.height),
        };
        layer.code = codeRecord({
          tier: 'B',
          source,
          meta: {
            ...(meta as unknown as Record<string, unknown>),
            duration,
            ...(typeof item.seed === 'number' ? { seed: item.seed } : {}),
          },
          params: item.params ?? {},
        });
      }
      if (c.type === 'CREATE_TRACK')
        (c.track as Record<string, unknown>).type = 'video';
    }
    if (c.type === 'CREATE_TRACK')
      (c.track as Record<string, unknown>).order = order++;
    if (current) {
      const offset = offsetOf(c.compositionId);
      if (c.type === 'CREATE_LAYER')
        (c.layer as { startTime: number }).startTime += offset;
      if (c.type === 'CREATE_CLIP')
        (c.clip as { startTime: number }).startTime += offset;
    }
    commands.push(remap(c) as unknown as Command);
  }
  return { commands, compositionIds, notBuilt };
}

function number(value: number) {
  return {
    type: 'number',
    value,
    animated: false,
    keyframes: [],
    constraints: [],
  };
}
