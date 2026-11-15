// FINAL3 V1 and V3 (docs/video-plan.md): Video Plan v2 and v3. A plan says what a video
// is (scenes with narration, layers by role and anchor, what media each
// needs, camera, transitions, sound and captions); the auto-builder turns it
// into scenes. It never names slots: media are described by intent and found
// by the builder. DOM-free; zod only.
import { z } from 'zod';
import { CAMERA_EASINGS, CONTROLLERS } from '../ai-spec/camera-names';
import { KIT_CAPTION_STYLES, KIT_TRANSITIONS } from './kit-ids';

export const PLAN_FORMAT = 'video-plan';
export const PLAN_VERSION = 4;
/** v2 and v3 plans still read: v3 and v4 only add optional fields. */
export const PLAN_VERSIONS = [2, 3, 4] as const;
export const PLAN_BUILDS = ['scenes', 'timeline'] as const;
export const PLAN_ASPECTS = ['16:9', '9:16', '1:1', '4:5'] as const;
export const PLAN_ANCHORS = [
  'center',
  'top',
  'bottom',
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'lower-third',
] as const;
export const PLAN_LAYER_KINDS = [
  'title',
  'text',
  'media',
  'kit',
  'shape',
  'bubble',
  'block',
] as const;
export const PLAN_SHAPES = [
  'rectangle',
  'ellipse',
  'line',
  'arrow',
  'arc',
  'protractor',
] as const;
export const PLAN_DASHES = ['solid', 'dash', 'dot'] as const;
export const PLAN_LOOPS = ['pulse', 'float', 'spin', 'wiggle'] as const;
export const PLAN_BUBBLES = ['speech', 'thought'] as const;
export const PLAN_TAILS = ['left', 'right', 'none'] as const;
export const PLAN_SIZES = ['small', 'medium', 'large', 'full'] as const;
export const PLAN_ENTERS = [
  'fade',
  'slide-up',
  'slide-down',
  'slide-left',
  'slide-right',
  'zoom',
  'pop',
  'typewriter',
  'wipe',
  'words',
  'none',
] as const;
export const PLAN_MEDIA_TYPES = [
  'photo',
  'video',
  'icon',
  'emoji',
  'audio',
  // V4: a sticker by kind (the registry's `sticker` providers).
  'sticker',
] as const;
/** V4: how a picture or video fills its box. */
export const PLAN_FITS = ['fit', 'fill', 'stretch'] as const;
/** V4: properties a plan keyframe may animate. */
export const PLAN_KEYFRAME_PROPS = [
  'x',
  'y',
  'scale',
  'rotation',
  'opacity',
] as const;
export const PLAN_EASINGS = [
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'hold',
] as const;
export const PLAN_ASSET_SOURCES = ['mine', 'library', 'stock', 'ai'] as const;
export const PLAN_DEF_LIMITS = Object.freeze({
  defs: 40,
  source: 32768,
  params: 32,
});
export const PLAN_TENDENCIES = ['still', 'gentle', 'dynamic'] as const;
export const PLAN_PACING = ['slow', 'medium', 'fast'] as const;
export const PLAN_LIMITS = Object.freeze({
  scenes: 40,
  layers: 400,
  overlays: 12,
  poses: 24,
  narration: 4000,
  text: 280,
  duration: 1800,
  fx: 16,
  keyframes: 64,
  queries: 4,
});

const id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,47}$/, 'use a-z, 0-9 and "-" (at most 48)');
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'use a colour like #1a2b3c');
const pct = z.number().finite().min(-50).max(150);
const text = (max: number) => z.string().min(1).max(max);

/** Strict schemas report unknown fields; the loose ones read the plan. */
function make(strict: boolean) {
  const obj = <T extends z.ZodRawShape>(shape: T) =>
    strict ? z.object(shape).strict() : z.object(shape);
  const mediaIntent = obj({
    query: text(120),
    type: z.enum(PLAN_MEDIA_TYPES).default('photo'),
    orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
  });
  const layer = obj({
    id,
    kind: z.enum(PLAN_LAYER_KINDS),
    text: text(PLAN_LIMITS.text).optional(),
    kit: z.string().min(1).max(48).optional(),
    anchor: z.enum(PLAN_ANCHORS).default('center'),
    size: z.enum(PLAN_SIZES).default('medium'),
    enter: z.enum(PLAN_ENTERS).default('fade'),
    exit: z.enum(PLAN_ENTERS).default('none'),
    mediaIntent: mediaIntent.optional(),
    /** Seconds after the scene starts (default 0) and how long it shows. */
    start: z.number().finite().min(0).max(PLAN_LIMITS.duration).optional(),
    duration: z.number().finite().min(0.2).max(PLAN_LIMITS.duration).optional(),
    // V3: exact place and look. All positions are percent of the canvas.
    at: obj({ x: pct, y: pct }).optional(),
    /** Width as a percent of the canvas width (instead of `size`). */
    width: z.number().finite().min(1).max(200).optional(),
    /** Height as a percent of the canvas height (shapes and bubbles). */
    height: z.number().finite().min(1).max(200).optional(),
    rotation: z.number().finite().min(-360).max(360).optional(),
    opacity: z.number().finite().min(0).max(1).optional(),
    /** Soft edge of a media layer, in px on a 1080 px canvas. */
    feather: z.number().finite().min(0).max(300).optional(),
    /** Which edges feather: all (default) or one side. */
    featherEdge: z.enum(['all', 'top', 'bottom', 'left', 'right']).optional(),
    loop: z.enum(PLAN_LOOPS).optional(),
    /** Slides the layer's centre to `to` (percent) over a time window of the layer. */
    move: obj({
      to: obj({ x: pct, y: pct }),
      start: z.number().finite().min(0).max(PLAN_LIMITS.duration).optional(),
      duration: z
        .number()
        .finite()
        .min(0.1)
        .max(PLAN_LIMITS.duration)
        .optional(),
      easing: z
        .enum(['linear', 'ease-in', 'ease-out', 'ease-in-out'])
        .default('ease-in-out'),
    }).optional(),
    /** Text colour, or the fill of a shape or bubble. */
    color: color.optional(),
    /** Text size in px on a 1080 px canvas (else by `size`). */
    fontSize: z.number().finite().min(8).max(400).optional(),
    weight: z.number().int().min(100).max(900).optional(),
    /** A highlight box behind the text, or its outline. */
    highlight: color.optional(),
    outline: color.optional(),
    /** V4: a registered graphics block (code layer) and its settings. */
    block: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/)
      .optional(),
    params: z
      .record(z.union([z.number(), z.string().max(200), z.boolean()]))
      .optional(),
    shape: z.enum(PLAN_SHAPES).optional(),
    from: obj({ x: pct, y: pct }).optional(),
    to: obj({ x: pct, y: pct }).optional(),
    stroke: color.optional(),
    strokeWidth: z.number().finite().min(1).max(80).optional(),
    dash: z.enum(PLAN_DASHES).optional(),
    arrowStart: z.boolean().optional(),
    /** Arc: radius in percent of the short side; angles in degrees (0 = right, clockwise). */
    radius: z.number().finite().min(1).max(200).optional(),
    startAngle: z.number().finite().min(-720).max(720).optional(),
    endAngle: z.number().finite().min(-720).max(720).optional(),
    bubble: z.enum(PLAN_BUBBLES).optional(),
    tail: z.enum(PLAN_TAILS).optional(),
    // --- V4 (docs/video-plan.md "Version 4"): what the editor can do -------
    /** The layer's name in the editor. */
    name: z.string().min(1).max(100).optional(),
    /** Effects, filters and adjustments of the FX library, in order. */
    fx: z
      .array(
        obj({
          id: z.string().regex(/^(adjust|filter|effect)\.[a-z0-9-]+$/),
          params: z
            .record(z.union([z.number(), z.boolean(), z.string().max(64)]))
            .optional(),
        }),
      )
      .max(PLAN_LIMITS.fx)
      .optional(),
    /** Colour grade: each value -100..100 (0 = unchanged). */
    grade: obj({
      exposure: z.number().finite().min(-100).max(100).optional(),
      contrast: z.number().finite().min(-100).max(100).optional(),
      saturation: z.number().finite().min(-100).max(100).optional(),
      temperature: z.number().finite().min(-100).max(100).optional(),
    }).optional(),
    /** A blend mode id of the FX library ("multiply" or "blend.multiply"). */
    blend: z.string().max(40).optional(),
    chromaKey: obj({
      color: color,
      similarity: z.number().finite().min(0).max(1).optional(),
      smoothness: z.number().finite().min(0).max(1).optional(),
      spill: z.number().finite().min(0).max(1).optional(),
    }).optional(),
    /** A mask in percent of the layer's own box. */
    mask: obj({
      shape: z.enum(['rect', 'ellipse']),
      x: z.number().finite().min(-100).max(200).default(0),
      y: z.number().finite().min(-100).max(200).default(0),
      width: z.number().finite().min(1).max(300).default(100),
      height: z.number().finite().min(1).max(300).default(100),
      feather: z.number().finite().min(0).max(300).optional(),
      invert: z.boolean().optional(),
    }).optional(),
    /** A transition into this clip from the clip before it on its lane. */
    transitionIn: obj({
      type: z.string().max(48),
      duration: z.number().finite().min(0.1).max(5).optional(),
    }).optional(),
    /** Keyframes in seconds from the layer's start; x, y in percent of the canvas. */
    keyframes: z
      .array(
        obj({
          property: z.enum(PLAN_KEYFRAME_PROPS),
          at: z.number().finite().min(0).max(PLAN_LIMITS.duration),
          value: z.number().finite().min(-10000).max(10000),
          easing: z.enum(PLAN_EASINGS).optional(),
        }),
      )
      .max(PLAN_LIMITS.keyframes)
      .optional(),
    /** A Creator preset from the Project's library, with control values. */
    preset: obj({
      id: z.string().min(1).max(64),
      controls: z
        .record(z.union([z.number(), z.boolean(), z.string().max(64)]))
        .optional(),
    }).optional(),
    /** Playback speed (0.1 to 8); `speedRamp` changes it at times. */
    speed: z.number().finite().min(0.1).max(8).optional(),
    reverse: z.boolean().optional(),
    /** Seconds into the source where the clip starts (footage, music). */
    sourceIn: z.number().finite().min(0).max(86400).optional(),
    /** Sound of this layer: volume 0..2, fades in seconds. */
    volume: z.number().finite().min(0).max(2).optional(),
    fadeIn: z.number().finite().min(0).max(30).optional(),
    fadeOut: z.number().finite().min(0).max(30).optional(),
    /** Text font family and letter spacing. */
    font: z.string().min(1).max(60).optional(),
    letterSpacing: z.number().finite().min(-20).max(100).optional(),
    fit: z.enum(PLAN_FITS).optional(),
    /** Layers sharing a group id become one group (nested). */
    group: id.optional(),
    /** Stacking within its scene: higher is on top (default by position). */
    order: z.number().int().min(-1000).max(1000).optional(),
    locked: z.boolean().optional(),
    /** Several searches for media, tried in order (instead of one query). */
    queries: z.array(text(120)).max(PLAN_LIMITS.queries).optional(),
    /** Footage must last at least this many seconds. */
    minDuration: z.number().finite().min(0).max(600).optional(),
    /** A media layer that changes picture: each pose shows from its time. */
    poses: z
      .array(
        obj({
          query: text(120),
          start: z.number().finite().min(0).max(PLAN_LIMITS.duration),
        }),
      )
      .max(PLAN_LIMITS.poses)
      .optional(),
  });
  const camera = obj({
    controller: z.enum(CONTROLLERS),
    strength: z.number().finite().min(0).max(2).optional(),
    easing: z.enum(CAMERA_EASINGS).optional(),
    target: id.optional(),
    /** V3: a shot inside the scene (seconds from the scene's start). */
    start: z.number().finite().min(0).max(PLAN_LIMITS.duration).optional(),
    duration: z.number().finite().min(0.2).max(PLAN_LIMITS.duration).optional(),
  });
  const scene = obj({
    id,
    title: text(100).optional(),
    narration: text(PLAN_LIMITS.narration).optional(),
    durationHint: z
      .number()
      .finite()
      .min(0.5)
      .max(PLAN_LIMITS.duration)
      .optional(),
    background: color.optional(),
    layers: z.array(layer).max(PLAN_LIMITS.layers).default([]),
    camera: camera.optional(),
    /** V3: more shots in one scene. */
    cameras: z.array(camera).max(32).optional(),
    transitionOut: obj({
      // V4: also a pixel transition of the FX library ("transition.<id>").
      type: z.union([
        z.enum(KIT_TRANSITIONS),
        z.string().regex(/^transition\.[a-z0-9-]+$/),
      ]),
      duration: z.number().finite().min(0.1).max(3).optional(),
    }).optional(),
    sfx: z
      .array(
        obj({
          query: text(80),
          at: z.number().finite().min(0).max(60).default(0),
          volume: z.number().finite().min(0).max(1).optional(),
        }),
      )
      .max(8)
      .default([]),
    notes: z.string().max(1000).optional(),
  });
  const feel = obj({
    palette: obj({ background: color, text: color, accent: color }).optional(),
    headingFont: text(40).optional(),
    bodyFont: text(40).optional(),
    captionStyle: z.enum(KIT_CAPTION_STYLES).optional(),
    transition: z.enum(KIT_TRANSITIONS).optional(),
    cameraTendency: z.enum(PLAN_TENDENCIES).optional(),
    pacing: z.enum(PLAN_PACING).optional(),
  });
  return obj({
    format: z.literal(PLAN_FORMAT),
    version: z.union([z.literal(2), z.literal(3), z.literal(4)]),
    meta: obj({
      /** V3: 'timeline' builds the whole video as ONE scene with layers. */
      build: z.enum(PLAN_BUILDS).default('scenes'),
      title: text(100),
      language: z.string().min(2).max(16).default('en'),
      aspect: z.enum(PLAN_ASPECTS).default('16:9'),
      fps: z
        .union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)])
        .default(30),
      themeId: z.string().min(1).max(64).optional(),
      /** V4: the video type of the Platform Config (documentary, reel, ...). */
      videoType: z.string().max(48).optional(),
      /** V4: where media may come from, in order, and the AI caps. */
      assets: obj({
        order: z
          .array(z.enum(PLAN_ASSET_SOURCES))
          .min(1)
          .max(4)
          .default(['mine', 'library', 'stock', 'ai']),
        aiImagesMax: z.number().int().min(0).max(100).default(0),
        aiVideosMax: z.number().int().min(0).max(20).default(0),
        /** "Use only my files": nothing from the library, stock or AI. */
        onlyMine: z.boolean().default(false),
      }).optional(),
    }),
    /** V4: custom graphics written for this plan (code layers). */
    defs: obj({
      blocks: z
        .array(
          obj({
            id: z
              .string()
              .regex(/^[a-z][a-z0-9-]{1,47}$/, 'use a-z, 0-9 and "-"'),
            tier: z.enum(['B', 'C']),
            source: z.string().min(1).max(PLAN_DEF_LIMITS.source),
            /** Tier C: name, duration and params; Tier B reads its own. */
            meta: z.record(z.unknown()).optional(),
            /** One line of what it shows (the Plan card). */
            summary: z.string().max(200).optional(),
          }),
        )
        .max(PLAN_DEF_LIMITS.defs)
        .default([]),
    }).optional(),
    feel: feel.optional(),
    scenes: z.array(scene).min(1).max(PLAN_LIMITS.scenes),
    /** V3: layers shown over the whole video (a logo, a title tag). */
    overlays: z.array(layer).max(PLAN_LIMITS.overlays).default([]),
    /** V3: one narration file under the whole video. */
    narrationTrack: obj({
      query: text(120),
      volume: z.number().finite().min(0).max(1).default(1),
      start: z.number().finite().min(0).max(PLAN_LIMITS.duration).default(0),
    }).optional(),
    captions: obj({
      enabled: z.boolean().default(true),
      style: z.enum(KIT_CAPTION_STYLES).optional(),
      /** V4 (ROUND-C1 F4): a speech-to-text provider of the registry times the words. */
      provider: z.string().max(48).optional(),
    }).optional(),
    music: obj({
      query: text(80),
      /** V4: start this many seconds into the track. */
      sourceIn: z.number().finite().min(0).max(3600).optional(),
      volume: z.number().finite().min(0).max(1).default(0.35),
      ducking: z.boolean().default(true),
    }).optional(),
    voice: obj({
      voiceId: z.string().min(1).max(100).optional(),
      speed: z.number().finite().min(0.5).max(2).optional(),
      /** V4 (ROUND-C1 F4): a text-to-speech provider of the registry speaks it. */
      provider: z.string().max(48).optional(),
    }).optional(),
    notes: z.string().max(4000).optional(),
    /** Written by the builder: each media layer's chosen candidate. */
    resolved: z.record(z.string().max(200)).optional(),
  });
}
export const strictPlanSchema = make(true);
export const videoPlanSchema = make(false);
export type VideoPlan = z.infer<typeof videoPlanSchema>;
export type PlanScene = VideoPlan['scenes'][number];
export type PlanLayer = PlanScene['layers'][number];
export type PlanFeel = NonNullable<VideoPlan['feel']>;
/** A layer's key in `resolved` and on built layers. */
export const layerKey = (scene: { id: string }, layer: { id: string }) =>
  `${scene.id}/${layer.id}`;
export type PlanDef = NonNullable<VideoPlan['defs']>['blocks'][number];
/** Whether some JSON looks like a v2 plan (else a v1 composition). */
export const isPlanV2 = (value: unknown): boolean =>
  !!value &&
  typeof value === 'object' &&
  (value as { format?: unknown }).format === PLAN_FORMAT &&
  (PLAN_VERSIONS as readonly unknown[]).includes(
    (value as { version?: unknown }).version,
  );
