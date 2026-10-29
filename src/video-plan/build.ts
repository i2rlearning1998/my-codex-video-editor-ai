// FINAL3 V2: the auto-builder. A Video Plan v2 becomes scenes in one pass:
// media are found (resolve.ts), narration is spoken (when a voice key
// exists), scene lengths follow the voice, layers are laid out by anchor,
// the starter kit adds its pieces, and the result is built through the
// Composition Spec adapter (one validated path to layers, clips, slots,
// scene transitions and captions). Then fonts, enter and exit animations,
// camera shots, audio roles (music ducks under speech) and the plan's keys
// are set on the built layers. DOM-free: media, speech and sound come from
// the caller. Deterministic for the same plan and services.
import {
  EditorEngine,
  findClipByLayer,
  type Asset,
  type Command,
  type Project,
} from '../core';
import { buildProjectFromComposition } from '../composition';
import type { SlotFill } from '../composition/slots';
import type { Theme } from '../themes/themes';
import { createCaptionsHook } from '../captions/hook';
import { toCaptionCues, type CaptionCue } from '../speech/captions';
import type { WordTiming } from '../speech/types';
import { cameraShotsCommands } from '../camera/shot-commands';
import type { CameraShotPlan } from '../camera/shots';
import { registerAudioCommands, defaultAudioSettings } from '../audio/settings';
import {
  layerKey,
  type PlanLayer,
  type PlanScene,
  type VideoPlan,
} from './schema';
import { validatePlan } from './validate';
import { kitCaptionStyle, transitionId, type SpecItem } from './kit';
import {
  layoutLayer,
  type Emitted,
  type Post,
  type PlacedRole,
} from './layout';
import { setLayerMasks } from '../masks/commands';
import { KIT_BACKGROUNDS } from './kit-ids';
import {
  mayUse,
  resolveMedia,
  type MediaCandidate,
  type ResolveServices,
} from './resolve';
import { sceneDuration } from './timing';

export { anchorBox } from './layout';

export const BUILD_STEPS = [
  'check',
  'media',
  'voice',
  'layout',
  'captions',
  'camera',
  'sound',
] as const;
export type BuildStep = (typeof BUILD_STEPS)[number];
export interface BuildProgress {
  readonly step: BuildStep;
  readonly state: 'running' | 'done' | 'skipped' | 'failed';
  readonly detail?: string | undefined;
}
export interface SpokenNarration {
  readonly asset: Asset;
  readonly duration: number;
  /** Word timings in seconds from the clip's start, when the voice gave them. */
  readonly words?: readonly WordTiming[];
}
export interface PlanBuildDeps {
  readonly resolve: ResolveServices;
  /** Imports a media candidate as an editor asset (stock is downloaded). */
  importCandidate(
    candidate: MediaCandidate,
    signal?: AbortSignal,
  ): Promise<Asset>;
  /** Speaks a narration; null when no voice is available (built silent). */
  voice?(
    text: string,
    lang: string,
    signal?: AbortSignal,
  ): Promise<SpokenNarration | null>;
  /** Finds music or a sound effect by words; null when none. */
  sound?(
    query: string,
    kind: 'music' | 'sfx',
    signal?: AbortSignal,
  ): Promise<{ asset: Asset; duration: number } | null>;
  /** The plan's theme (meta.themeId), when found. */
  readonly theme?: Theme | null;
  /** Why the voice is off (shown as a banner), when it is known up front. */
  readonly voiceUnavailable?: string;
}
export interface PlanFlag {
  readonly key: string;
  readonly reason: string;
  /** FIX7: the file the plan expects (its query) and what kind it is. */
  readonly name?: string;
  readonly type?: 'photo' | 'video' | 'audio' | 'icon' | 'emoji';
}
export interface PlanBuildResult {
  readonly project: Project | null;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly flags: readonly PlanFlag[];
  /** Layer key → the chosen candidate's key (kept for rebuilds). */
  readonly resolved: Readonly<Record<string, string>>;
  readonly alternatives: Readonly<Record<string, readonly MediaCandidate[]>>;
  /** The voice was not available: the video is silent (banner text). */
  readonly silent: string | null;
  readonly durations: readonly number[];
  /** The plan with `resolved` written in (for export and rebuilds). */
  readonly plan: VideoPlan | null;
}

const ASPECTS = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
} as const;
const DEVANAGARI = /[ऀ-ॿ]/;
const specId = (title: string) =>
  `plan-${
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'video'
  }`;

/** Cues for one scene's narration, in video time. */
function sceneCues(
  scene: PlanScene,
  index: number,
  start: number,
  duration: number,
  spoken: SpokenNarration | null,
  language: string,
  style: ReturnType<typeof kitCaptionStyle>,
): CaptionCue[] {
  const text = scene.narration?.trim();
  if (!text) return [];
  let words: WordTiming[];
  if (spoken?.words?.length)
    words = spoken.words.map((word) => ({
      text: word.text,
      start: start + word.start,
      end: start + word.end,
    }));
  else {
    // Proportional: each word gets time by its length over the spoken part.
    const list = text.split(/\s+/);
    const span = Math.max(0.5, (spoken?.duration ?? duration - 0.4) - 0.1);
    const weights = list.map((word) => word.length + 1);
    const sum = weights.reduce((a, b) => a + b, 0);
    let at = start + 0.05;
    words = list.map((word, i) => {
      const length = (weights[i]! / sum) * span;
      const timing = { text: word, start: at, end: at + length };
      at += length;
      return timing;
    });
  }
  return toCaptionCues(
    { text, language, segments: [], words },
    { maxCharsPerLine: style.maxCharsPerLine, maxLines: style.maxLines },
  ).map((cue) => ({
    ...cue,
    id: `s${index + 1}-${cue.id}`,
    end: Math.min(cue.end, start + duration - 1 / 60),
  }));
}

const plain = (value: string) => ({
  type: 'string' as const,
  value,
  animated: false,
  keyframes: [] as [],
  constraints: [],
});
const setString = (
  compositionId: string,
  layerId: string,
  key: string,
  value: string,
): Command =>
  ({
    type: 'SET_PROPERTY',
    compositionId,
    layerId,
    target: { kind: 'property', key },
    property: plain(value),
  }) as Command;
const ENTER: Record<string, { preset: string; direction?: string } | null> = {
  fade: { preset: 'fade' },
  'slide-up': { preset: 'slide', direction: 'up' },
  'slide-down': { preset: 'slide', direction: 'down' },
  'slide-left': { preset: 'slide', direction: 'left' },
  'slide-right': { preset: 'slide', direction: 'right' },
  zoom: { preset: 'zoom' },
  pop: { preset: 'pop' },
  typewriter: { preset: 'typewriter' },
  wipe: { preset: 'wipe' },
  words: { preset: 'words' },
  none: null,
};
/** The camera a scene gets from the feel when it names none. */
function tendencyShot(
  tendency: NonNullable<VideoPlan['feel']>['cameraTendency'],
  index: number,
): CameraShotPlan['controller'] | null {
  if (!tendency || tendency === 'still') return null;
  const gentle = ['push-in', 'parallax-drift', 'pull-out'] as const;
  const dynamic = ['push-in', 'pan-right', 'dolly-zoom', 'pan-left'] as const;
  const list = tendency === 'gentle' ? gentle : dynamic;
  return list[index % list.length]!;
}

interface Placed {
  /** The composition (a scene, or the one timeline) the item is in. */
  readonly sceneIndex: number;
  readonly itemIndex: number;
  readonly key: string;
  readonly role: PlacedRole;
  readonly enter?: string | undefined;
  readonly exit?: string | undefined;
  readonly flag?: string | undefined;
  readonly post?: Post | undefined;
  readonly volume?: number;
}

const numberProperty = (value: number) => ({
  type: 'number' as const,
  value,
  animated: false,
  keyframes: [] as [],
  constraints: [],
});
const colorProperty = (value: string) => ({
  type: 'color' as const,
  value,
  animated: false,
  keyframes: [] as [],
  constraints: [],
});
const booleanProperty = (value: boolean) => ({
  type: 'boolean' as const,
  value,
  animated: false,
  keyframes: [] as [],
  constraints: [],
});
const LOOP_PERIOD = { pulse: 2, float: 3, wiggle: 1.2, spin: 8 } as const;
/** The shape a media key resolves under: layers, poses, overlays, narration. */
const OVERLAY = { id: 'overlay' };

export async function buildVideoFromPlan(
  input: unknown,
  deps: PlanBuildDeps,
  onProgress: (progress: BuildProgress) => void = () => undefined,
  signal?: AbortSignal,
): Promise<PlanBuildResult> {
  const stop = () => {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  };
  onProgress({ step: 'check', state: 'running' });
  const check = validatePlan(input);
  if (!check.ok || !check.plan) {
    onProgress({ step: 'check', state: 'failed', detail: check.errors[0] });
    return {
      project: null,
      errors: check.errors,
      warnings: check.warnings,
      flags: [],
      resolved: {},
      alternatives: {},
      silent: null,
      durations: [],
      plan: null,
    };
  }
  const plan = check.plan;
  const timeline = plan.meta.build === 'timeline';
  const warnings = [...check.warnings];
  onProgress({ step: 'check', state: 'done' });
  const [width, height] = ASPECTS[plan.meta.aspect];
  const theme = deps.theme ?? null;
  const palette = {
    background:
      plan.feel?.palette?.background ?? theme?.palette.background ?? '#101219',
    text: plan.feel?.palette?.text ?? theme?.palette.text ?? '#ffffff',
    accent: plan.feel?.palette?.accent ?? theme?.palette.accent ?? '#7c5cff',
  };
  const allLayers = [
    ...plan.scenes.flatMap((scene) => scene.layers),
    ...plan.overlays,
  ];
  const hindi =
    plan.meta.language.startsWith('hi') ||
    plan.scenes.some((scene) =>
      DEVANAGARI.test(
        `${scene.narration ?? ''} ${scene.layers.map((l) => l.text ?? '').join(' ')}`,
      ),
    ) ||
    plan.overlays.some((layer) => DEVANAGARI.test(layer.text ?? ''));
  void allLayers;
  const fonts = {
    heading:
      plan.feel?.headingFont ??
      theme?.fonts.heading ??
      (hindi ? 'Noto Sans Devanagari' : 'Poppins'),
    body:
      plan.feel?.bodyFont ??
      theme?.fonts.body ??
      (hindi ? 'Noto Sans Devanagari' : 'Inter'),
  };

  // --- media -----------------------------------------------------------
  onProgress({ step: 'media', state: 'running' });
  const resolved: Record<string, string> = {};
  const alternatives: Record<string, readonly MediaCandidate[]> = {};
  const assets = new Map<string, Asset>();
  const flags: PlanFlag[] = [];
  // The same picture asked for twice is found and added once.
  const importedBy = new Map<string, Asset>();
  let found = 0,
    wanted = 0;
  const findMedia = async (key: string, layer: PlanLayer) => {
    stop();
    wanted++;
    const choice = await resolveMedia(
      layer,
      deps.resolve,
      plan.resolved?.[key],
    );
    alternatives[key] = choice.alternatives;
    let asset: Asset | null = null;
    // Only a candidate that may be used on its own (see resolveMedia).
    const preferredKey = plan.resolved?.[key];
    for (const candidate of choice.alternatives.filter((item) =>
      mayUse(item, layer.mediaIntent?.query ?? '', preferredKey),
    )) {
      try {
        const known = importedBy.get(candidate.key);
        asset = known ?? (await deps.importCandidate(candidate, signal));
        importedBy.set(candidate.key, asset);
        resolved[key] = candidate.key;
        break;
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') throw error;
        warnings.push(
          `${key}: "${candidate.title}" could not be added (${(error as Error).message}); trying the next one.`,
        );
      }
    }
    if (asset) {
      assets.set(key, asset);
      found++;
    } else
      flags.push({
        key,
        reason:
          choice.reason ?? `Nothing usable for "${layer.mediaIntent?.query}".`,
        ...(layer.mediaIntent
          ? { name: layer.mediaIntent.query, type: layer.mediaIntent.type }
          : {}),
      });
    onProgress({
      step: 'media',
      state: 'running',
      detail: `${found}/${wanted}`,
    });
  };
  const mediaLayers = (owner: { id: string }, layers: readonly PlanLayer[]) =>
    layers.flatMap((layer) =>
      layer.kind !== 'media'
        ? []
        : [
            { key: layerKey(owner, layer), layer },
            ...(layer.poses ?? []).map((pose, n) => ({
              key: `${layerKey(owner, layer)}#p${n}`,
              layer: {
                ...layer,
                mediaIntent: {
                  ...(layer.mediaIntent ?? { type: 'photo' as const }),
                  query: pose.query,
                },
              } as PlanLayer,
            })),
          ],
    );
  for (const scene of plan.scenes)
    for (const entry of mediaLayers(scene, scene.layers))
      await findMedia(entry.key, entry.layer);
  for (const entry of mediaLayers(OVERLAY, plan.overlays))
    await findMedia(entry.key, entry.layer);
  if (plan.narrationTrack)
    await findMedia('narration', {
      id: 'narration',
      kind: 'media',
      anchor: 'center',
      size: 'medium',
      enter: 'none',
      exit: 'none',
      mediaIntent: { query: plan.narrationTrack.query, type: 'audio' },
    } as PlanLayer);
  onProgress({
    step: 'media',
    state: wanted ? 'done' : 'skipped',
    detail: wanted ? `${found}/${wanted}` : undefined,
  });

  // --- voice -----------------------------------------------------------
  onProgress({ step: 'voice', state: 'running' });
  const spoken: (SpokenNarration | null)[] = [];
  let silent: string | null = null;
  const narrated = plan.scenes.some((scene) => scene.narration?.trim());
  const ownVoice = narrated && !plan.narrationTrack;
  if (ownVoice && (!deps.voice || deps.voiceUnavailable))
    silent = deps.voiceUnavailable ?? 'No voice is available.';
  for (const scene of plan.scenes) {
    stop();
    if (!scene.narration?.trim() || silent || plan.narrationTrack) {
      spoken.push(null);
      continue;
    }
    try {
      const voice = await deps.voice!(
        scene.narration,
        plan.meta.language,
        signal,
      );
      if (!voice) silent ??= 'No voice is available.';
      spoken.push(voice);
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error;
      silent ??= `The voice failed: ${(error as Error).message}`;
      spoken.push(null);
    }
  }
  if (silent) spoken.fill(null);
  onProgress({
    step: 'voice',
    state: !narrated ? 'skipped' : silent ? 'failed' : 'done',
    detail: silent ?? undefined,
  });

  // --- layout ----------------------------------------------------------
  onProgress({ step: 'layout', state: 'running' });
  const durations = plan.scenes.map((scene, i) =>
    sceneDuration(scene, spoken[i]?.duration ?? null, plan.feel?.pacing),
  );
  const narration = plan.narrationTrack ? assets.get('narration') : undefined;
  if (plan.narrationTrack && narration?.duration) {
    // The video lasts at least as long as its narration.
    const total = durations.reduce((a, b) => a + b, 0);
    const need = plan.narrationTrack.start + narration.duration + 0.4;
    if (need > total + 1e-6) {
      const last = durations.length - 1;
      durations[last] = Math.ceil((durations[last]! + need - total) * 60) / 60;
    }
  }
  const short = Math.min(width, height);
  void short;
  const slots: {
    id: string;
    type: 'image' | 'video' | 'audio';
    hint: string;
    required: boolean;
  }[] = [];
  const specAssets: {
    id: string;
    kind: 'image' | 'video' | 'audio';
    description: string;
  }[] = [];
  const fills: Record<string, SlotFill> = {};
  const placed: Placed[] = [];
  const addSlot = (
    id: string,
    kind: 'image' | 'video' | 'audio',
    hint: string,
    asset: Asset,
  ) => {
    slots.push({ id, type: kind, hint, required: false });
    specAssets.push({ id, kind, description: hint.slice(0, 1000) });
    fills[id] = { kind: 'file', asset };
  };
  // One slot per asset: a logo used in every scene is one slot, not twelve.
  const slotOfAsset = new Map<string, string>();
  const slotFor = (asset: Asset, hint: string) => {
    const known = slotOfAsset.get(asset.id);
    if (known) return known;
    const id = `a${slotOfAsset.size + 1}`;
    slotOfAsset.set(asset.id, id);
    addSlot(
      id,
      asset.type === 'audio'
        ? 'audio'
        : asset.type === 'video'
          ? 'video'
          : 'image',
      hint,
      asset,
    );
    return id;
  };
  let music: { asset: Asset; duration: number } | null = null;
  const sfx = new Map<string, { asset: Asset; duration: number }>();
  if (plan.music || plan.scenes.some((scene) => scene.sfx.length))
    onProgress({ step: 'sound', state: 'running' });
  if (plan.music && deps.sound)
    try {
      music = await deps.sound(plan.music.query, 'music', signal);
      if (!music)
        flags.push({
          key: 'music',
          name: plan.music.query,
          type: 'audio',
          reason: `Missing: "${plan.music.query}". Add a file with this name to Media.`,
        });
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error;
      warnings.push(`Music could not be added: ${(error as Error).message}`);
    }
  for (const [si, scene] of plan.scenes.entries())
    for (const [k, effect] of scene.sfx.entries()) {
      if (!deps.sound) break;
      try {
        const got = await deps.sound(effect.query, 'sfx', signal);
        if (got) sfx.set(`${si}-${k}`, got);
        else warnings.push(`No sound found for "${effect.query}".`);
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') throw error;
        warnings.push(
          `Sound "${effect.query}" could not be added: ${(error as Error).message}`,
        );
      }
    }
  const id = specId(plan.meta.title);
  const env = {
    width,
    height,
    palette,
    assetOf: (key: string) => assets.get(key),
    slotFor,
  };
  // A timeline is ONE scene; otherwise each plan scene is its own scene.
  const groups = timeline
    ? [plan.scenes.map((_, i) => i)]
    : plan.scenes.map((_, i) => [i]);
  const sceneOffset: number[] = []; // each plan scene's start in its group
  const groupOf: number[] = [];
  const groupStart: number[] = [];
  let videoOffset = 0;
  groups.forEach((members, gi) => {
    groupStart.push(videoOffset);
    let within = 0;
    for (const si of members) {
      sceneOffset[si] = within;
      groupOf[si] = gi;
      within += durations[si]!;
    }
    videoOffset += within;
  });
  const scenes = groups.map((members, gi) => {
    const groupDuration = members.reduce((sum, si) => sum + durations[si]!, 0);
    const items: SpecItem[] = [];
    const push = (
      item: SpecItem,
      place: Omit<Placed, 'sceneIndex' | 'itemIndex'>,
    ) => {
      placed.push({ ...place, sceneIndex: gi, itemIndex: items.length });
      items.push(item);
    };
    const emit = (e: Emitted) =>
      push(e.item, {
        key: e.key,
        role: e.role,
        enter: e.enter,
        exit: e.exit,
        flag: e.flag,
        post: e.post,
      });
    // The editor stacks the first item of a scene on top. Order of pushing:
    // overlays first (on top), then the scenes last to first, and inside a
    // scene text and shapes, then media, then kit backgrounds (underneath).
    // A timeline keeps the author's order (bottom to top), so art can sit
    // above or below shapes and code graphics as written.
    const rank = (l: PlanLayer) =>
      timeline
        ? 0
        : l.kind === 'kit' &&
            (KIT_BACKGROUNDS as readonly string[]).includes(l.kit ?? '')
          ? 0
          : l.kind === 'media'
            ? 1
            : 2;
    const layout = (
      owner: { id: string },
      layers: readonly PlanLayer[],
      base: number,
      span: number,
      prefixOf: (layer: PlanLayer) => string,
    ) => {
      const order = [...layers].sort((a, b) => rank(a) - rank(b));
      for (const layer of [...order].reverse()) {
        const start = Math.min(layer.start ?? 0, Math.max(0, span - 0.2));
        const when = {
          start: base + start,
          duration: Math.max(
            0.2,
            Math.min(layer.duration ?? span - start, span - start),
          ),
        };
        for (const e of layoutLayer(
          layer,
          layerKey(owner, layer),
          prefixOf(layer),
          when,
          env,
        ))
          emit(e);
      }
    };
    // Overlays: the whole video in a timeline, each scene otherwise.
    layout(OVERLAY, plan.overlays, 0, groupDuration, (layer) =>
      `L${gi}o${layer.id.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 40),
    );
    for (const si of [...members].reverse()) {
      const scene = plan.scenes[si]!;
      const duration = durations[si]!;
      const base = sceneOffset[si]!;
      const voice = spoken[si];
      // Sound first: audio items do not stack.
      if (voice) {
        const slotId = `v${si}`;
        addSlot(slotId, 'audio', `Narration ${si + 1}`, voice.asset);
        push(
          {
            id: `V${si}`,
            name: `Narration ${si + 1}`,
            kind: 'audio-slot',
            slot: slotId,
            start: base,
            duration: Math.min(duration, voice.duration),
          },
          { key: `${scene.id}#voice`, role: 'voice' },
        );
      }
      if (music && !timeline) {
        if (!slots.some((slot) => slot.id === 'music'))
          addSlot('music', 'audio', plan.music!.query, music.asset);
        push(
          {
            id: `M${si}`,
            name: 'Music',
            kind: 'audio-slot',
            slot: 'music',
            start: 0,
            duration,
            sourceIn: music.duration > 0 ? groupStart[gi]! % music.duration : 0,
          },
          { key: `${scene.id}#music`, role: 'music' },
        );
      }
      scene.sfx.forEach((effect, k) => {
        const got = sfx.get(`${si}-${k}`);
        if (!got) return;
        const slotId = `x${si}x${k}`;
        addSlot(slotId, 'audio', effect.query, got.asset);
        const start = Math.min(effect.at, Math.max(0, duration - 0.1));
        push(
          {
            id: `X${si}x${k}`,
            name: effect.query.slice(0, 100),
            kind: 'audio-slot',
            slot: slotId,
            start: base + start,
            duration: Math.max(
              0.1,
              Math.min(got.duration || 1, duration - start),
            ),
          },
          { key: `${scene.id}#sfx${k}`, role: 'sfx' },
        );
      });
      layout(scene, scene.layers, base, duration, (layer) =>
        `L${si}x${layer.id.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 40),
      );
    }
    if (music && timeline) {
      addSlot('music', 'audio', plan.music!.query, music.asset);
      push(
        {
          id: 'M0',
          name: 'Music',
          kind: 'audio-slot',
          slot: 'music',
          start: 0,
          duration: Math.min(groupDuration, 3600),
          sourceIn: 0,
        },
        { key: 'music', role: 'music' },
      );
    }
    // The narration track: its part inside this scene.
    if (plan.narrationTrack && narration?.duration) {
      const trackStart = plan.narrationTrack.start;
      const from = Math.max(groupStart[gi]!, trackStart);
      const to = Math.min(
        groupStart[gi]! + groupDuration,
        trackStart + narration.duration,
      );
      if (to - from > 0.05) {
        const slotId = slotFor(narration, plan.narrationTrack.query);
        push(
          {
            id: `N${gi}`,
            name: 'Narration',
            kind: 'audio-slot',
            slot: slotId,
            start: from - groupStart[gi]!,
            duration: to - from,
            sourceIn: from - trackStart,
          },
          {
            key: 'narration',
            role: 'narration',
            volume: plan.narrationTrack.volume,
          },
        );
      }
    }
    const lastScene = members.at(-1)!;
    const scene = plan.scenes[lastScene]!;
    const kitTransition =
      scene.transitionOut?.type ?? plan.feel?.transition ?? 'crossfade';
    const transition =
      !timeline && gi < groups.length - 1 ? transitionId(kitTransition) : null;
    return {
      id: `S${gi}`,
      name: (timeline
        ? plan.meta.title
        : (scene.title ?? `Scene ${gi + 1}`)
      ).slice(0, 100),
      duration: groupDuration,
      background: scene.background ?? palette.background,
      items,
      ...(transition
        ? {
            transition: {
              id: transition,
              duration: Math.min(
                scene.transitionOut?.duration ?? 0.6,
                groupDuration / 2,
              ),
            },
          }
        : {}),
    };
  });
  onProgress({ step: 'layout', state: 'done' });

  // --- captions ----------------------------------------------------------
  const captionsOn = plan.captions?.enabled !== false && narrated;
  const style = kitCaptionStyle(
    plan.captions?.style ?? plan.feel?.captionStyle,
  );
  let start = 0;
  const cues: CaptionCue[] = [];
  if (captionsOn)
    plan.scenes.forEach((scene, si) => {
      cues.push(
        ...sceneCues(
          scene,
          si,
          start,
          durations[si]!,
          spoken[si] ?? null,
          plan.meta.language,
          style,
        ),
      );
      start += durations[si]!;
    });
  onProgress({
    step: 'captions',
    state: captionsOn && cues.length ? 'running' : 'skipped',
  });
  stop();
  const result = await buildProjectFromComposition(
    {
      spec: {
        version: 1,
        id,
        title: plan.meta.title,
        canvas: { width, height, fps: plan.meta.fps },
        assets: specAssets,
        scenes,
      },
      slots,
      ...(cues.length ? { captions: true } : {}),
    },
    {
      slotFills: fills,
      ...(theme ? { theme } : {}),
      ...(cues.length
        ? {
            captions: createCaptionsHook({
              cues,
              style,
              language: plan.meta.language,
            }),
          }
        : {}),
      name: plan.meta.title,
    },
  );
  const durationsOut = groups.map((members) =>
    members.reduce((sum, si) => sum + durations[si]!, 0),
  );
  if (!result.project)
    return {
      project: null,
      errors: result.errors.map((error) => `The build failed: ${error}`),
      warnings,
      flags,
      resolved,
      alternatives,
      silent,
      durations: durationsOut,
      plan: { ...plan, resolved },
    };
  for (const warning of result.warnings)
    if (warning.code !== 'slot-optional-empty') warnings.push(warning.message);
  if (cues.length) onProgress({ step: 'captions', state: 'done' });

  // --- finishing: keys, fonts, animation, camera, sound roles -------------
  onProgress({ step: 'camera', state: 'running' });
  const engine = new EditorEngine(result.project, {
    now: () => result.project!.metadata.updatedAt,
  });
  registerAudioCommands(engine);
  const run = (label: string, commands: Command[]) => {
    if (!commands.length) return;
    try {
      engine.commands.transaction(label, commands);
    } catch (error) {
      warnings.push(`${label}: ${(error as Error).message}`);
    }
  };
  const sceneLayers = (gi: number) => {
    const composition = engine.state.compositions[gi];
    return composition ? { composition, prefix: `ais_${id}_s${gi}_i` } : null;
  };
  const layerOf = (place: Placed) => {
    const found = sceneLayers(place.sceneIndex);
    if (!found) return null;
    const layer = found.composition.layers.find((item) =>
      item.id.startsWith(`${found.prefix}${place.itemIndex}_`),
    );
    return layer ? { composition: found.composition, layer } : null;
  };
  const property = (post: NonNullable<Post['props']>[number]) =>
    post.type === 'number'
      ? numberProperty(post.value as number)
      : post.type === 'color'
        ? colorProperty(post.value as string)
        : post.type === 'boolean'
          ? booleanProperty(post.value as boolean)
          : plain(post.value as string);
  for (const place of placed) {
    const hit = layerOf(place);
    if (!hit) continue;
    const { composition, layer } = hit;
    const commands: Command[] = [
      setString(composition.id, layer.id, 'planRef', place.key),
    ];
    if (place.flag)
      commands.push(
        setString(composition.id, layer.id, 'planFlag', place.flag),
      );
    if (layer.type === 'text') {
      commands.push(
        setString(
          composition.id,
          layer.id,
          'fontFamily',
          place.role === 'title' ? fonts.heading : fonts.body,
        ),
      );
      if (place.role === 'title' || place.role === 'body')
        commands.push(
          setString(composition.id, layer.id, 'textAlign', 'center'),
        );
    }
    for (const post of place.post?.props ?? [])
      commands.push({
        type: 'SET_PROPERTY',
        compositionId: composition.id,
        layerId: layer.id,
        target: { kind: 'property', key: post.key },
        property: property(post),
      } as Command);
    const move = place.post?.move;
    if (move)
      commands.push({
        type: 'SET_PROPERTY',
        compositionId: composition.id,
        layerId: layer.id,
        target: { kind: 'transform', key: 'position' },
        property: {
          type: 'vector2',
          value: [move.from[0], move.from[1]],
          animated: true,
          keyframes: [
            {
              time: move.start,
              value: [move.from[0], move.from[1]],
              easing: move.easing,
            },
            { time: move.end, value: [move.to[0], move.to[1]] },
          ],
          constraints: [],
        },
      } as unknown as Command);
    run('Plan layer', commands);
    const feather = place.post?.feather;
    if (feather) {
      const f = feather.px;
      const near = -f * 4;
      const [x1, y1, x2, y2] =
        feather.edge === 'top'
          ? [near, f, feather.width - near, feather.height - near]
          : feather.edge === 'bottom'
            ? [near, near, feather.width - near, feather.height - f]
            : feather.edge === 'left'
              ? [f, near, feather.width - near, feather.height - near]
              : feather.edge === 'right'
                ? [near, near, feather.width - f, feather.height - near]
                : [f / 2, f / 2, feather.width - f / 2, feather.height - f / 2];
      try {
        setLayerMasks(
          engine,
          {
            compositionId: composition.id,
            layerId: layer.id,
            masks: [
              {
                id: `feather-${layer.id}`.slice(0, 120),
                type: 'rect',
                geometry: [
                  [x1!, y1!],
                  [x2!, y2!],
                ],
                feather: f,
              },
            ],
          },
          'Plan soft edge',
        );
      } catch (error) {
        warnings.push(`Soft edge: ${(error as Error).message}`);
      }
    }
    const clip = findClipByLayer(
      engine.state.compositions[place.sceneIndex]!,
      layer.id,
    )?.clip;
    if (!clip) continue;
    const animation: Command[] = [];
    for (const [slot, name] of [
      ['in', place.enter],
      ['out', place.exit],
    ] as const) {
      const preset = name ? ENTER[name] : null;
      if (!preset) continue;
      const pick =
        (preset.preset === 'typewriter' || preset.preset === 'words') &&
        layer.type !== 'text'
          ? { preset: 'fade' }
          : preset;
      animation.push({
        type: 'SET_CLIP_ANIMATION',
        compositionId: composition.id,
        clipId: clip.id,
        slot,
        value: {
          preset: pick.preset,
          duration: Math.min(0.6, clip.duration / 3),
          ...(pick.direction ? { direction: pick.direction } : {}),
        },
      } as unknown as Command);
    }
    if (place.post?.loop)
      animation.push({
        type: 'SET_CLIP_ANIMATION',
        compositionId: composition.id,
        clipId: clip.id,
        slot: 'loop',
        value: {
          preset: place.post.loop,
          period: LOOP_PERIOD[place.post.loop],
        },
      } as unknown as Command);
    run('Plan animation', animation);
    if (
      place.role === 'voice' ||
      place.role === 'music' ||
      place.role === 'narration'
    ) {
      const settings = defaultAudioSettings();
      run('Plan sound', [
        {
          type: 'plugin:audio:SET',
          input: {
            compositionId: composition.id,
            clipId: clip.id,
            settings:
              place.role === 'music'
                ? {
                    ...settings,
                    role: 'music',
                    volume: plan.music?.volume ?? 0.35,
                    duck: {
                      ...settings.duck,
                      enabled:
                        plan.music?.ducking !== false && clip.duration <= 3600,
                    },
                  }
                : {
                    ...settings,
                    role: 'speech',
                    ...(place.volume !== undefined
                      ? { volume: place.volume }
                      : {}),
                  },
          },
        } as unknown as Command,
      ]);
    }
  }
  // Camera: each scene's shots (default: the feel's tendency), at the scene's
  // place in its composition.
  const shots: CameraShotPlan[] = [];
  let shotIds = 0;
  plan.scenes.forEach((scene, si) => {
    const gi = groupOf[si]!;
    const composition = engine.state.compositions[gi];
    if (!composition) return;
    const listed = [
      ...(scene.camera ? [scene.camera] : []),
      ...(scene.cameras ?? []),
    ];
    const defaults = tendencyShot(plan.feel?.cameraTendency, si);
    const list = listed.length
      ? listed
      : defaults
        ? [{ controller: defaults } as NonNullable<PlanScene['camera']>]
        : [];
    for (const shot of list) {
      const target = shot.target
        ? placed.find(
            (place) =>
              place.sceneIndex === gi &&
              place.key === `${scene.id}/${shot.target}`,
          )
        : undefined;
      const targetLayer = target ? layerOf(target)?.layer.id : undefined;
      const from = shot.start ?? 0;
      shots.push({
        sceneId: composition.id,
        start: sceneOffset[si]! + from,
        duration: Math.max(
          0.2,
          Math.min(
            shot.duration ?? durations[si]! - from,
            durations[si]! - from,
          ),
        ),
        controller: shot.controller,
        params: {
          ...(shot.strength !== undefined
            ? { strength: shot.strength }
            : plan.feel?.cameraTendency === 'gentle'
              ? { strength: 0.5 }
              : {}),
          ...(shot.easing ? { easing: shot.easing } : {}),
          ...(targetLayer ? { target: targetLayer } : {}),
        },
      });
    }
  });
  if (shots.length)
    try {
      run(
        'Plan camera',
        cameraShotsCommands(
          engine.state as never,
          shots,
          (prefix) => `${prefix}-${id}-${++shotIds}`,
        ),
      );
    } catch (error) {
      warnings.push(`Camera: ${(error as Error).message}`);
    }
  onProgress({ step: 'camera', state: shots.length ? 'done' : 'skipped' });
  onProgress({
    step: 'sound',
    state:
      music || sfx.size
        ? 'done'
        : plan.music || plan.scenes.some((s) => s.sfx.length)
          ? 'failed'
          : 'skipped',
  });
  for (const flag of flags)
    warnings.push(`${flag.key} needs an asset: ${flag.reason}`);
  return {
    project: engine.state as unknown as Project,
    errors: [],
    warnings,
    flags,
    resolved,
    alternatives,
    silent,
    durations: durationsOut,
    plan: { ...plan, resolved },
  };
}
