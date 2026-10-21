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
import {
  isKitId,
  kitCaptionStyle,
  kitItems,
  transitionId,
  type SpecItem,
} from './kit';
import { KIT_BACKGROUNDS } from './kit-ids';
import {
  resolveMedia,
  type MediaCandidate,
  type ResolveServices,
} from './resolve';
import { sceneDuration } from './timing';

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
const SIZE = { small: 0.3, medium: 0.5, large: 0.75, full: 1 } as const;
const specId = (title: string) =>
  `plan-${
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'video'
  }`;

/** A box for a layer at its anchor (canvas px, top-left origin). */
export function anchorBox(
  layer: Pick<PlanLayer, 'anchor' | 'size'>,
  width: number,
  height: number,
  boxWidth: number,
  boxHeight: number,
): { x: number; y: number } {
  const marginX = width * 0.06,
    marginY = height * 0.08;
  const left = marginX,
    right = width - marginX - boxWidth,
    midX = (width - boxWidth) / 2;
  const top = marginY,
    bottom = height - marginY - boxHeight,
    midY = (height - boxHeight) / 2;
  if (layer.size === 'full') return { x: midX, y: midY };
  switch (layer.anchor) {
    case 'top':
      return { x: midX, y: top };
    case 'bottom':
      return { x: midX, y: bottom };
    case 'left':
      return { x: left, y: midY };
    case 'right':
      return { x: right, y: midY };
    case 'top-left':
      return { x: left, y: top };
    case 'top-right':
      return { x: right, y: top };
    case 'bottom-left':
      return { x: left, y: bottom };
    case 'bottom-right':
      return { x: right, y: bottom };
    case 'lower-third':
      return { x: left, y: height * 0.72 };
    default:
      return { x: midX, y: midY };
  }
}

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
  readonly sceneIndex: number;
  readonly itemIndex: number;
  readonly key: string;
  readonly role:
    'title' | 'body' | 'media' | 'kit' | 'fallback' | 'voice' | 'music' | 'sfx';
  readonly enter?: string;
  readonly exit?: string;
  readonly flag?: string;
}

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
  const hindi =
    plan.meta.language.startsWith('hi') ||
    plan.scenes.some((scene) =>
      DEVANAGARI.test(
        `${scene.narration ?? ''} ${scene.layers.map((l) => l.text ?? '').join(' ')}`,
      ),
    );
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
  let found = 0,
    wanted = 0;
  for (const scene of plan.scenes)
    for (const layer of scene.layers) {
      if (layer.kind !== 'media') continue;
      stop();
      wanted++;
      const key = layerKey(scene, layer);
      const choice = await resolveMedia(
        layer,
        deps.resolve,
        plan.resolved?.[key],
      );
      alternatives[key] = choice.alternatives;
      let asset: Asset | null = null;
      for (const candidate of choice.alternatives) {
        try {
          asset = await deps.importCandidate(candidate, signal);
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
            choice.reason ??
            `Nothing usable for "${layer.mediaIntent?.query}".`,
        });
      onProgress({
        step: 'media',
        state: 'running',
        detail: `${found}/${wanted}`,
      });
    }
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
  if (narrated && (!deps.voice || deps.voiceUnavailable))
    silent = deps.voiceUnavailable ?? 'No voice is available.';
  for (const scene of plan.scenes) {
    stop();
    if (!scene.narration?.trim() || silent) {
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
  const short = Math.min(width, height);
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
  let music: { asset: Asset; duration: number } | null = null;
  const sfx = new Map<string, { asset: Asset; duration: number }>();
  if (plan.music || plan.scenes.some((scene) => scene.sfx.length))
    onProgress({ step: 'sound', state: 'running' });
  if (plan.music && deps.sound)
    try {
      music = await deps.sound(plan.music.query, 'music', signal);
      if (!music) warnings.push(`No music found for "${plan.music.query}".`);
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
  let offset = 0;
  const scenes = plan.scenes.map((scene, si) => {
    const duration = durations[si]!;
    const items: SpecItem[] = [];
    const push = (
      item: SpecItem,
      place: Omit<Placed, 'sceneIndex' | 'itemIndex'>,
    ) => {
      placed.push({ ...place, sceneIndex: si, itemIndex: items.length });
      items.push(item);
    };
    const timing = (layer: PlanLayer) => {
      const start = Math.min(layer.start ?? 0, Math.max(0, duration - 0.2));
      return {
        start,
        duration: Math.max(
          0.2,
          Math.min(layer.duration ?? duration - start, duration - start),
        ),
      };
    };
    // Order: kit backgrounds, then media, then everything else (on top).
    const order = [...scene.layers].sort((a, b) => {
      const rank = (l: PlanLayer) =>
        l.kind === 'kit' &&
        (KIT_BACKGROUNDS as readonly string[]).includes(l.kit ?? '')
          ? 0
          : l.kind === 'media'
            ? 1
            : 2;
      return rank(a) - rank(b);
    });
    for (const layer of order) {
      const key = layerKey(scene, layer);
      const when = timing(layer);
      const prefix = `L${si}x${layer.id.replace(/[^A-Za-z0-9]/g, '')}`.slice(
        0,
        40,
      );
      if (layer.kind === 'media') {
        const asset = assets.get(key);
        const frac = SIZE[layer.size];
        const icon =
          layer.mediaIntent?.type === 'icon' ||
          layer.mediaIntent?.type === 'emoji';
        const aspect =
          asset?.width && asset.height ? asset.width / asset.height : 16 / 9;
        let w = layer.size === 'full' ? width : width * frac * (icon ? 0.6 : 1);
        let h = w / aspect;
        if (layer.size === 'full') {
          // Cover the canvas.
          const k = Math.max(width / w, height / h);
          w *= k;
          h *= k;
        } else if (h > height * 0.9) {
          h = height * 0.9;
          w = h * aspect;
        }
        const at = anchorBox(layer, width, height, w, h);
        if (asset) {
          const slotId =
            `m${si}x${layer.id.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 60);
          addSlot(
            slotId,
            asset.type === 'video' ? 'video' : 'image',
            layer.mediaIntent!.query,
            asset,
          );
          push(
            {
              id: `${prefix}m`,
              name: layer.mediaIntent!.query.slice(0, 100),
              kind: 'media-slot',
              slot: slotId,
              ...when,
              transform: { x: at.x, y: at.y },
              width: w,
              height: h,
            },
            { key, role: 'media', enter: layer.enter, exit: layer.exit },
          );
        } else {
          // Fallback card: a soft panel naming what is needed.
          push(
            {
              id: `${prefix}f`,
              name: `Needs: ${layer.mediaIntent?.query ?? 'media'}`.slice(
                0,
                100,
              ),
              kind: 'shape',
              shape: 'rectangle',
              fill: palette.accent,
              ...when,
              transform: { x: at.x, y: at.y, opacity: 0.35 },
              width: w,
              height: h,
            },
            {
              key,
              role: 'fallback',
              enter: layer.enter,
              exit: layer.exit,
              flag: 'needs-asset',
            },
          );
          push(
            {
              id: `${prefix}t`,
              name: 'Needs asset',
              kind: 'text',
              text: `Needs: ${layer.mediaIntent?.query ?? 'media'}`.slice(
                0,
                1000,
              ),
              fontSize: Math.round(short * 0.035),
              fill: palette.text,
              ...when,
              transform: { x: at.x + w * 0.05, y: at.y + h / 2 - short * 0.03 },
              width: w * 0.9,
              height: short * 0.06,
            },
            { key: `${key}#label`, role: 'fallback', flag: 'needs-asset' },
          );
        }
        continue;
      }
      if (layer.kind === 'kit') {
        const built =
          layer.kit && isKitId(layer.kit)
            ? kitItems(layer.kit, {
                width,
                height,
                palette,
                text: layer.text ?? '',
                ...when,
                idPrefix: `${prefix}k`,
              })
            : null;
        if (!built) continue;
        built.forEach((item, n) =>
          push(item, {
            key: n ? `${key}#${n}` : key,
            role: 'kit',
            enter: layer.enter,
            exit: layer.exit,
          }),
        );
        continue;
      }
      // Title and text.
      const title = layer.kind === 'title';
      const size = Math.round(
        short *
          (title ? 0.08 : 0.045) *
          (layer.size === 'large' ? 1.3 : layer.size === 'small' ? 0.75 : 1),
      );
      const w =
        width *
        Math.min(
          0.88,
          SIZE[layer.size === 'full' ? 'large' : layer.size] + 0.3,
        );
      const lineCount = Math.max(
        1,
        Math.ceil(((layer.text ?? '').length * size * 0.55) / w),
      );
      const h = size * 1.25 * lineCount;
      const at = anchorBox(layer, width, height, w, h);
      push(
        {
          id: `${prefix}x`,
          name: (layer.text ?? layer.id).slice(0, 100),
          kind: 'text',
          text: (layer.text ?? '').slice(0, 1000) || ' ',
          fontSize: size,
          fill: palette.text,
          ...when,
          transform: { x: at.x, y: at.y },
          width: w,
          height: h,
        },
        {
          key,
          role: title ? 'title' : 'body',
          enter: layer.enter,
          exit: layer.exit,
        },
      );
    }
    const voice = spoken[si];
    if (voice) {
      const slotId = `v${si}`;
      addSlot(slotId, 'audio', `Narration ${si + 1}`, voice.asset);
      push(
        {
          id: `V${si}`,
          name: `Narration ${si + 1}`,
          kind: 'audio-slot',
          slot: slotId,
          start: 0,
          duration: Math.min(duration, voice.duration),
        },
        { key: `${scene.id}#voice`, role: 'voice' },
      );
    }
    if (music) {
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
          sourceIn: music.duration > 0 ? offset % music.duration : 0,
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
          start,
          duration: Math.max(
            0.1,
            Math.min(got.duration || 1, duration - start),
          ),
        },
        { key: `${scene.id}#sfx${k}`, role: 'sfx' },
      );
    });
    offset += duration;
    const kitTransition =
      scene.transitionOut?.type ?? plan.feel?.transition ?? 'crossfade';
    const transition =
      si < plan.scenes.length - 1 ? transitionId(kitTransition) : null;
    return {
      id: `S${si}`,
      name: (scene.title ?? `Scene ${si + 1}`).slice(0, 100),
      duration,
      background: scene.background ?? palette.background,
      items,
      ...(transition
        ? {
            transition: {
              id: transition,
              duration: Math.min(
                scene.transitionOut?.duration ?? 0.6,
                duration / 2,
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
  if (!result.project)
    return {
      project: null,
      errors: result.errors.map((error) => `The build failed: ${error}`),
      warnings,
      flags,
      resolved,
      alternatives,
      silent,
      durations,
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
  const sceneLayers = (si: number) => {
    const composition = engine.state.compositions[si];
    return composition ? { composition, prefix: `ais_${id}_s${si}_i` } : null;
  };
  const layerOf = (place: Placed) => {
    const found = sceneLayers(place.sceneIndex);
    if (!found) return null;
    const layer = found.composition.layers.find((item) =>
      item.id.startsWith(`${found.prefix}${place.itemIndex}_`),
    );
    return layer ? { composition: found.composition, layer } : null;
  };
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
    run('Plan layer', commands);
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
        preset.preset === 'typewriter' && layer.type !== 'text'
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
    run('Plan animation', animation);
    if (place.role === 'voice' || place.role === 'music') {
      const settings = defaultAudioSettings();
      run('Plan sound', [
        {
          type: 'plugin:audio:SET',
          input: {
            compositionId: composition.id,
            clipId: clip.id,
            settings:
              place.role === 'voice'
                ? { ...settings, role: 'speech' }
                : {
                    ...settings,
                    role: 'music',
                    volume: plan.music?.volume ?? 0.35,
                    duck: {
                      ...settings.duck,
                      enabled:
                        plan.music?.ducking !== false && clip.duration <= 300,
                    },
                  },
          },
        } as unknown as Command,
      ]);
    }
  }
  // Camera: the scene's own shot, else the feel's tendency.
  const shots: CameraShotPlan[] = [];
  let shotIds = 0;
  plan.scenes.forEach((scene, si) => {
    const composition = engine.state.compositions[si];
    if (!composition) return;
    const controller =
      scene.camera?.controller ?? tendencyShot(plan.feel?.cameraTendency, si);
    if (!controller) return;
    const target = scene.camera?.target
      ? placed.find(
          (place) =>
            place.sceneIndex === si &&
            place.key === `${scene.id}/${scene.camera!.target}`,
        )
      : undefined;
    const targetLayer = target ? layerOf(target)?.layer.id : undefined;
    shots.push({
      sceneId: composition.id,
      start: 0,
      duration: durations[si]!,
      controller,
      params: {
        ...(scene.camera?.strength !== undefined
          ? { strength: scene.camera.strength }
          : plan.feel?.cameraTendency === 'gentle'
            ? { strength: 0.5 }
            : {}),
        ...(scene.camera?.easing ? { easing: scene.camera.easing } : {}),
        ...(targetLayer ? { target: targetLayer } : {}),
      },
    });
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
    durations,
    plan: { ...plan, resolved },
  };
}
