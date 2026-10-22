// FINAL3 V1 and V3 (docs/video-plan.md): Video Plan v2 and v3. A plan says what a video
// is (scenes with narration, layers by role and anchor, what media each
// needs, camera, transitions, sound and captions); the auto-builder turns it
// into scenes. It never names slots: media are described by intent and found
// by the builder. DOM-free; zod only.
import { z } from 'zod';
import { CAMERA_EASINGS, CONTROLLERS } from '../ai-spec/camera-names';
import { KIT_CAPTION_STYLES, KIT_TRANSITIONS } from './kit-ids';

export const PLAN_FORMAT = 'video-plan';
export const PLAN_VERSION = 3;
/** v2 plans still read: v3 only adds optional fields and higher limits. */
export const PLAN_VERSIONS = [2, 3] as const;
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
] as const;
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
      type: z.enum(KIT_TRANSITIONS),
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
    version: z.union([z.literal(2), z.literal(3)]),
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
    }),
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
    }).optional(),
    music: obj({
      query: text(80),
      volume: z.number().finite().min(0).max(1).default(0.35),
      ducking: z.boolean().default(true),
    }).optional(),
    voice: obj({
      voiceId: z.string().min(1).max(100).optional(),
      speed: z.number().finite().min(0.5).max(2).optional(),
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
/** Whether some JSON looks like a v2 plan (else a v1 composition). */
export const isPlanV2 = (value: unknown): boolean =>
  !!value &&
  typeof value === 'object' &&
  (value as { format?: unknown }).format === PLAN_FORMAT &&
  (PLAN_VERSIONS as readonly unknown[]).includes(
    (value as { version?: unknown }).version,
  );
