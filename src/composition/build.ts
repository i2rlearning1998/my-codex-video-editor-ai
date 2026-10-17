// J: the composition adapter. An AI-authored Creator Pack `composition`
// (a Composition Spec v1 plus slots, a voice-over and captions) becomes a
// real, validated project through the ordinary Command Bus, headless. It
// reuses what exists: the spec's build plan (src/ai-spec), the Tier A
// importer (src/code-layer/tier-a.ts: text, shapes, code blocks), the library
// insert (src/ui/library-insert.ts, DOM-free), clip effects (SET_CLIP_FX),
// scene transitions (the reserved marker of D-199) and themes
// (applyThemeCommands). What the editor cannot build is reported, never
// silently dropped or faked. Deterministic: the same input gives the same
// project, ids included. No schema change.
import {
  createComposition,
  createLayer,
  EditorEngine,
  maxSceneTransition,
  sceneTransitionLabel,
  SCHEMA_VERSION,
  validateProject,
  type Asset,
  type Command,
  type DeepReadonly,
  type Project,
} from '../core';
import { clipFxSchema } from '../core/fx';
import { transitionSchema } from '../core/transitions';
import type { Scalar } from '../ai-spec/schema';
import {
  compositionDataSchema,
  type CompositionData,
  type StyleData,
} from '../creator-pack/schemas';
import { projectComposition } from '../creator-pack/composition';
import type { LibraryItem } from '../library/schema';
import {
  applyThemeCommands,
  BUILT_IN_THEMES,
  themeSchema,
  type Theme,
} from '../themes/themes';
import {
  compositionSlots,
  fillProblem,
  VOICE_OVER_SLOT,
  type CompositionSlot,
  type SlotFill,
  type SlotFills,
} from './slots';

export interface CompositionScene {
  readonly compositionId: string;
  /** Where the scene starts in the joined video (seconds). */
  readonly start: number;
  readonly duration: number;
}
/** What a captions engine gets: the built project and the voice-over. */
export interface CaptionsContext {
  readonly project: DeepReadonly<Project>;
  readonly scenes: readonly CompositionScene[];
  readonly voiceOver: { readonly assetId: string } | null;
}
/**
 * A thin hook for the captions engine (not part of this adapter): it returns
 * the commands that add captions, which run in the same build.
 */
export type CaptionsHook = (context: CaptionsContext) => readonly Command[];

export interface BuildOptions {
  /** Slot id → fill; a `SlotFills` (createSlotFills) is accepted too. */
  readonly slotFills?: Readonly<Record<string, SlotFill>> | SlotFills;
  readonly style?: DeepReadonly<StyleData> | null;
  readonly theme?: Theme | null;
  /** Values for the spec's editable parameters. */
  readonly parameters?: Readonly<Record<string, Scalar>>;
  /** Finds an editor library item (built-in or My library) by id. */
  readonly library?: (id: string) => LibraryItem | undefined;
  readonly captions?: CaptionsHook;
  /** The project's name (default: the spec's title). */
  readonly name?: string;
  /** The project's created and updated time (fixed for determinism). */
  readonly now?: string;
}
export interface BuildWarning {
  readonly code:
    | 'library-missing'
    | 'library-unsupported'
    | 'slot-optional-empty'
    | 'slot-fill-rejected'
    | 'fx-rejected'
    | 'transition-clamped'
    | 'transition-rejected'
    | 'style-mismatch'
    | 'not-built'
    | 'voice-over-longer';
  readonly message: string;
}
export type BuildMissing =
  | { readonly kind: 'slot'; readonly slot: CompositionSlot }
  | {
      readonly kind: 'voice-over';
      readonly slot: CompositionSlot;
      /** What to give the speech engine (src/speech synthesizeToMedia). */
      readonly request: {
        readonly text: string;
        readonly lang: string;
        readonly voiceId?: string;
      };
    }
  | { readonly kind: 'captions'; readonly reason: string }
  | {
      readonly kind: 'feature';
      readonly path: string;
      readonly reason: string;
    };
export interface BuildResult {
  /** The built project, or null when the composition itself is invalid. */
  readonly project: Project | null;
  readonly warnings: readonly BuildWarning[];
  readonly missing: readonly BuildMissing[];
  /** Why the composition is invalid (path: message); empty when valid. */
  readonly errors: readonly string[];
}

/** The fixed time a build stamps when `now` is not given. */
export const BUILD_EPOCH = '2026-01-01T00:00:00.000Z';
const SUFFIX = 'c';
const BASE_ID = 'composition-base';

/** An empty-slot frame: a dashed outline over a faint fill (shape props). */
export function emptySlotProperties(slot: CompositionSlot) {
  const prop = (type: string, value: unknown) => ({
    type,
    value,
    animated: false,
    keyframes: [],
    constraints: [],
  });
  return {
    shapeKind: prop('string', 'rectangle'),
    fill: prop('color', '#8a8f9e'),
    fillOpacity: prop('number', 0.18),
    stroke: prop('color', '#8a8f9e'),
    strokeWidth: prop('number', 4),
    strokeDash: prop('string', 'dash'),
    compositionSlot: prop('string', slot.id),
  };
}

/** Reads a composition: a Creator Pack item, its data, or a bare spec. */
export function compositionDataOf(input: unknown): CompositionData {
  const value = input as Record<string, unknown> | null;
  if (value && typeof value === 'object') {
    if (value.type === 'composition' && 'data' in value)
      return compositionDataSchema.parse(value.data);
    if ('spec' in value) return compositionDataSchema.parse(value);
    if (value.version === 1 && 'scenes' in value)
      return compositionDataSchema.parse({ spec: value });
  }
  return compositionDataSchema.parse(input);
}

/** Seeded uuid-shaped ids, so library inserts and history ids repeat. */
function seededIds(seed: string) {
  let hash = 2166136261;
  for (const char of seed)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const prefix = (hash >>> 0).toString(16).padStart(8, '0');
  let counter = 0;
  return () =>
    `${prefix}-0000-4000-8000-${(++counter).toString(16).padStart(12, '0')}`;
}
function withIds<T>(seed: string, run: () => T): T {
  const crypto = globalThis.crypto as Crypto & { randomUUID: () => string };
  const own = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
  Object.defineProperty(crypto, 'randomUUID', {
    value: seededIds(seed),
    configurable: true,
    writable: true,
  });
  try {
    return run();
  } finally {
    if (own) Object.defineProperty(crypto, 'randomUUID', own);
    else delete (crypto as { randomUUID?: unknown }).randomUUID;
  }
}

interface SpecItem {
  id: string;
  name?: string;
  kind: string;
  slot?: string;
  start: number;
  duration: number;
  width?: number;
  height?: number;
  transform: { x: number; y: number; scale: number };
  fx: { id: string; params: Record<string, Scalar> }[];
}
interface SpecScene {
  id: string;
  duration: number;
  items: SpecItem[];
  cameraMoves: { id: string }[];
  transition?: { id: string; duration: number };
}

/**
 * Builds a project from a composition. Never throws for an empty slot, a
 * missing library item or a feature the editor lacks: those are in
 * `missing` and `warnings`. An invalid composition gives `project: null`
 * and its `errors`.
 */
export async function buildProjectFromComposition(
  input: unknown,
  options: BuildOptions = {},
): Promise<BuildResult> {
  const warnings: BuildWarning[] = [];
  const missing: BuildMissing[] = [];
  const warn = (code: BuildWarning['code'], message: string) =>
    warnings.push({ code, message });
  let data: CompositionData;
  let projected: ReturnType<typeof projectComposition>;
  try {
    data = compositionDataOf(input);
    projected = projectComposition(data.spec);
  } catch (error) {
    return failed([(error as Error).message]);
  }
  const [{ validateSpec }, { resolveSpec }, { tierACommands }, insert] =
    await Promise.all([
      import('../ai-spec/validate'),
      import('../ai-spec/resolve'),
      import('../code-layer/tier-a'),
      import('../ui/library-insert'),
    ]);
  const parameters = { ...(options.parameters ?? {}) };
  const validated = validateSpec(projected.spec, parameters);
  if (!validated.ok)
    return failed(validated.errors.map((e) => `${e.path}: ${e.message}`));
  const spec = validated.spec as unknown as {
    id: string;
    title: string;
    canvas: { width: number; height: number; fps: number };
    scenes: SpecScene[];
  };
  const plan = resolveSpec(projected.spec, parameters);
  const renamed = (id: string) => `${id}_${SUFFIX}`;
  const scenes: CompositionScene[] = plan.scenes.map((scene) => ({
    compositionId: renamed(scene.compositionId),
    start: scene.timelineStart,
    duration: scene.duration,
  }));

  // Slots and their fills.
  const slots = compositionSlots(data);
  const given: Readonly<Record<string, SlotFill>> =
    options.slotFills && 'toRecord' in options.slotFills
      ? (options.slotFills as SlotFills).toRecord()
      : ((options.slotFills as Readonly<Record<string, SlotFill>>) ?? {});
  const fills = new Map<string, SlotFill>();
  for (const slot of slots) {
    const fill = given[slot.id];
    if (!fill) continue;
    const problem = fillProblem(slot, fill);
    if (problem) warn('slot-fill-rejected', problem);
    else fills.set(slot.id, fill);
  }
  for (const id of Object.keys(given))
    if (!slots.some((slot) => slot.id === id))
      warn('slot-fill-rejected', `No slot "${id}" in this composition.`);
  for (const slot of slots) {
    if (fills.has(slot.id)) continue;
    if (slot.id === VOICE_OVER_SLOT && data.voiceOver) {
      if (slot.required)
        missing.push({
          kind: 'voice-over',
          slot,
          request: {
            text: data.voiceOver.text,
            lang: data.voiceOver.lang,
            ...(data.voiceOver.voiceId
              ? { voiceId: data.voiceOver.voiceId }
              : {}),
          },
        });
      continue;
    }
    if (slot.required) missing.push({ kind: 'slot', slot });
    else
      warn(
        'slot-optional-empty',
        `Optional slot "${slot.id}" (${slot.hint}) is empty; its items are left out.`,
      );
  }

  // Theme: the one given, the style's built-in theme, or none.
  const style = options.style ?? null;
  const theme =
    options.theme ??
    (style?.look.themeId
      ? BUILT_IN_THEMES.find((item) => item.id === style.look.themeId)
      : undefined) ??
    null;
  if (style) {
    const ratio = spec.canvas.width / spec.canvas.height;
    const [w, h] = style.output.aspect.split(':').map(Number) as [
      number,
      number,
    ];
    if (Math.abs(ratio - w / h) > 0.01)
      warn(
        'style-mismatch',
        `The style asks for ${style.output.aspect}; the composition is ${spec.canvas.width} × ${spec.canvas.height}.`,
      );
    if (style.output.fps !== spec.canvas.fps)
      warn(
        'style-mismatch',
        `The style asks for ${style.output.fps} fps; the composition is ${spec.canvas.fps} fps.`,
      );
  }
  const background =
    theme?.palette.background ?? style?.look.palette?.background ?? '#000000';

  // The base project: one placeholder scene, removed once the spec's exist.
  const now = options.now ?? BUILD_EPOCH;
  const base: Project = validateProject({
    schemaVersion: SCHEMA_VERSION,
    id: `composition-${spec.id}`.slice(0, 128),
    metadata: {
      name: (options.name ?? spec.title).slice(0, 200),
      createdAt: now,
      updatedAt: now,
    },
    settings: { backgroundColor: background, audioSampleRate: 48000 },
    compositions: [
      createComposition({
        id: BASE_ID,
        name: 'Base',
        width: spec.canvas.width,
        height: spec.canvas.height,
        fps: spec.canvas.fps,
        backgroundColor: background,
      }),
    ],
    assets: [],
  });

  // Tier A builds text, shapes, code blocks and the filled media slots.
  const libraryAt: {
    item: SpecItem;
    sceneIndex: number;
    library: string;
    whole: boolean;
  }[] = [];
  const builtClips = new Map<string, string>(); // item key → clip id
  const references = new Map(
    projected.references.map((ref) => [`${ref.sceneIndex}/${ref.itemId}`, ref]),
  );
  const sceneIndexOf = (compositionId: string) =>
    scenes.findIndex((scene) => scene.compositionId === compositionId);
  const readonlyBase = base as unknown as DeepReadonly<Project>;
  const tier = await tierACommands(projected.spec, {
    project: readonlyBase,
    current: readonlyBase.compositions[0]!,
    mode: 'new',
    overrides: parameters,
    suffix: SUFFIX,
    item: (item) => {
      const sceneIndex = sceneIndexOf(item.compositionId);
      const specItem = spec.scenes[sceneIndex]!.items.find(
        (entry) => entry.id === item.id,
      )!;
      const ref = references.get(`${sceneIndex}/${item.id}`);
      if (ref) {
        libraryAt.push({
          item: specItem,
          sceneIndex,
          library: ref.library,
          whole: true,
        });
        return 'skip';
      }
      builtClips.set(`${sceneIndex}/${item.id}`, item.clipId);
      if (!item.slot) return undefined;
      const slot = slots.find((s) => s.id === item.slot)!;
      const fill = fills.get(slot.id);
      if (fill?.kind === 'library') {
        builtClips.delete(`${sceneIndex}/${item.id}`);
        libraryAt.push({
          item: specItem,
          sceneIndex,
          library: fill.id,
          whole: false,
        });
        return 'skip';
      }
      if (fill) return { assetId: fill.asset.id };
      if (!slot.required || slot.type === 'audio') {
        builtClips.delete(`${sceneIndex}/${item.id}`);
        return 'skip';
      }
      return { placeholder: emptySlotProperties(slot) };
    },
  });
  for (const line of tier.notBuilt)
    if (
      !/supply a local asset|verify the uploaded asset|ADD_EFFECT|CREATE_TRANSITION|Camera layer/.test(
        line,
      )
    )
      warn('not-built', line);

  const project = withIds(spec.id, () => {
    const engine = new EditorEngine(base, { now: () => now });
    const run = (label: string, commands: readonly Command[]) => {
      if (commands.length) engine.commands.transaction(label, commands);
    };
    // Assets of the filled slots.
    const added = new Set<string>();
    for (const fill of fills.values()) {
      if (fill.kind === 'library' || added.has(fill.asset.id)) continue;
      added.add(fill.asset.id);
      const asset = JSON.parse(JSON.stringify(fill.asset)) as Asset;
      if (fill.kind === 'stock')
        asset.metadata = {
          ...asset.metadata,
          stock: { provider: fill.provider, itemId: fill.itemId },
        };
      run('Add asset', [{ type: 'ADD_ASSET', asset }]);
    }
    run('Build composition', tier.commands);
    run('Remove base scene', [
      { type: 'DELETE_COMPOSITION', compositionId: BASE_ID },
    ]);

    // Effects on the built items (the clip's id seeds them, not the spec's).
    spec.scenes.forEach((scene, sceneIndex) => {
      for (const item of scene.items) {
        const clipId = builtClips.get(`${sceneIndex}/${item.id}`);
        if (!clipId || !item.fx.length) continue;
        const fx = clipFxSchema.safeParse({
          version: 1,
          stack: item.fx.map((entry) => ({
            id: entry.id,
            params: entry.params,
          })),
        });
        if (!fx.success) {
          warn(
            'fx-rejected',
            `Scene "${scene.id}" item "${item.id}": its effects do not fit the editor's effect stack.`,
          );
          continue;
        }
        run('Effects', [
          {
            type: 'SET_CLIP_FX',
            compositionId: scenes[sceneIndex]!.compositionId,
            clipId,
            fx: fx.data,
          },
        ]);
      }
      // Camera moves: the camera exists (src/camera) but is not in projects.
      for (const move of scene.cameraMoves)
        missing.push({
          kind: 'feature',
          path: `scenes/${scene.id}/cameraMoves/${move.id}`,
          reason:
            'Camera moves are not part of the project yet (no camera layer or command); the move is left out.',
        });
    });

    // Scene transitions: the reserved marker on the incoming scene (D-199).
    spec.scenes.forEach((scene, sceneIndex) => {
      const next = scenes[sceneIndex + 1];
      if (!scene.transition || !next) return;
      const limit = maxSceneTransition(
        { id: '', markers: [], duration: scenes[sceneIndex]!.duration },
        { id: '', markers: [], duration: next.duration },
      );
      const duration = Math.min(scene.transition.duration, limit);
      if (duration < scene.transition.duration)
        warn(
          'transition-clamped',
          `Transition after "${scene.id}" shortened to ${duration} s.`,
        );
      const transition = transitionSchema.safeParse({
        type: scene.transition.id,
        duration,
      });
      if (!transition.success) {
        warn(
          'transition-rejected',
          `Transition "${scene.transition.id}" after "${scene.id}" is not an editor transition.`,
        );
        return;
      }
      run('Scene transition', [
        {
          type: 'ADD_MARKER',
          compositionId: next.compositionId,
          marker: {
            id: `scene-transition-${sceneIndex + 1}`,
            time: 0,
            label: sceneTransitionLabel(transition.data),
          },
        },
      ]);
    });

    // Library references and library-filled slots.
    for (const entry of libraryAt) {
      const item = options.library?.(entry.library);
      if (!item) {
        warn(
          'library-missing',
          `Library item "${entry.library}" (${entry.item.name ?? entry.item.id}) is not in this editor's library; left out.`,
        );
        continue;
      }
      if (item.type === 'template') {
        warn(
          'library-unsupported',
          `Library item "${entry.library}" is a template (a whole scene); it cannot sit inside a scene. Left out.`,
        );
        continue;
      }
      const scene = scenes[entry.sceneIndex]!;
      const state = engine.state;
      const composition = state.compositions.find(
        (c) => c.id === scene.compositionId,
      )!;
      const at: [number, number] | undefined = entry.whole
        ? undefined
        : [
            entry.item.transform.x +
              ((entry.item.width ?? 0) * entry.item.transform.scale) / 2,
            entry.item.transform.y +
              ((entry.item.height ?? 0) * entry.item.transform.scale) / 2,
          ];
      const built = insert.libraryCommands(
        state,
        {
          composition,
          assets: state.assets,
          background: composition.backgroundColor,
        },
        item,
        entry.item.start,
        at ? { at } : {},
      );
      run(built.label, built.commands);
    }

    // Voice-over: one clip per scene, cut from the narration in order.
    const voice = fills.get(VOICE_OVER_SLOT);
    if (voice && voice.kind !== 'library') {
      const length =
        voice.asset.duration ??
        scenes.reduce((sum, scene) => sum + scene.duration, 0);
      const total = scenes.reduce((sum, scene) => sum + scene.duration, 0);
      if (length > total + 1e-6)
        warn(
          'voice-over-longer',
          `The voice-over is ${length.toFixed(1)} s; the video is ${total.toFixed(1)} s. The end is cut.`,
        );
      scenes.forEach((scene, index) => {
        const sourceIn = scene.start;
        const duration = Math.min(scene.duration, length - sourceIn);
        if (duration <= 1e-6) return;
        const layer = createLayer(
          `voice-over-${index + 1}`,
          'audio',
          'Voice-over',
          duration,
        );
        layer.assetId = voice.asset.id;
        run('Voice-over', [
          {
            type: 'CREATE_LAYER',
            compositionId: scene.compositionId,
            parentId: null,
            layer,
          },
          {
            type: 'CREATE_TRACK',
            compositionId: scene.compositionId,
            track: {
              id: `voice-over-${index + 1}_track`,
              name: 'Voice-over',
              type: 'audio',
              order: 1000,
              enabled: true,
              locked: false,
              muted: false,
              clips: [],
            },
          },
          {
            type: 'CREATE_CLIP',
            compositionId: scene.compositionId,
            trackId: `voice-over-${index + 1}_track`,
            clip: {
              id: `voice-over-${index + 1}_clip`,
              name: 'Voice-over',
              layerId: layer.id,
              assetId: voice.asset.id,
              startTime: 0,
              duration,
              sourceIn,
              sourceOut: sourceIn + duration,
              enabled: true,
              speed: 1,
              transitionMetadata: {},
              effectMetadata: {},
              metadata: { role: 'voice-over' },
            },
          },
        ]);
      });
    }

    // Captions: only through the captions engine's hook.
    if (data.captions) {
      if (options.captions)
        run(
          'Captions',
          options.captions({
            project: engine.state,
            scenes,
            voiceOver:
              voice && voice.kind !== 'library'
                ? { assetId: voice.asset.id }
                : null,
          }),
        );
      else
        missing.push({
          kind: 'captions',
          reason:
            'No captions engine is connected; pass options.captions to add them.',
        });
    }

    // Theme last, so it sees every layer.
    if (theme) {
      const parsed = themeSchema.parse(theme);
      const commands = applyThemeCommands(
        engine.state.compositions.map((composition) => ({
          id: composition.id,
          backgroundColor: composition.backgroundColor,
          layers: composition.layers,
          markers: composition.markers,
        })),
        parsed,
      ).map((command) =>
        command.type === 'ADD_MARKER'
          ? {
              ...command,
              marker: {
                ...(command.marker as object),
                id: `theme-current-${parsed.id}`.slice(0, 128),
              },
            }
          : command,
      );
      run('Apply theme', commands as unknown as Command[]);
    }
    return validateProject(structuredClone(engine.state));
  });
  return { project, warnings, missing, errors: [] };
}

function failed(errors: string[]): BuildResult {
  return { project: null, warnings: [], missing: [], errors };
}
