// FINAL3 V1: Video Plan v2 (docs/video-plan.md). A plan says what a video
// is (scenes with narration, layers by role and anchor, what media each
// needs, camera, transitions, sound and captions); the auto-builder turns it
// into scenes. It never names slots: media are described by intent and found
// by the builder. DOM-free; zod only.
import { z } from 'zod';
import { CAMERA_EASINGS, CONTROLLERS } from '../ai-spec/camera-names';
import { KIT_CAPTION_STYLES, KIT_TRANSITIONS } from './kit-ids';

export const PLAN_FORMAT = 'video-plan';
export const PLAN_VERSION = 2;
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
export const PLAN_LAYER_KINDS = ['title', 'text', 'media', 'kit'] as const;
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
  'none',
] as const;
export const PLAN_MEDIA_TYPES = ['photo', 'video', 'icon', 'emoji'] as const;
export const PLAN_TENDENCIES = ['still', 'gentle', 'dynamic'] as const;
export const PLAN_PACING = ['slow', 'medium', 'fast'] as const;
export const PLAN_LIMITS = Object.freeze({
  scenes: 12,
  layers: 16,
  narration: 2000,
  text: 280,
  duration: 180,
});

const id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,47}$/, 'use a-z, 0-9 and "-" (at most 48)');
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'use a colour like #1a2b3c');
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
    start: z.number().finite().min(0).max(60).optional(),
    duration: z.number().finite().min(0.2).max(60).optional(),
  });
  const camera = obj({
    controller: z.enum(CONTROLLERS),
    strength: z.number().finite().min(0).max(2).optional(),
    easing: z.enum(CAMERA_EASINGS).optional(),
    target: id.optional(),
  });
  const scene = obj({
    id,
    title: text(100).optional(),
    narration: text(PLAN_LIMITS.narration).optional(),
    durationHint: z.number().finite().min(0.5).max(60).optional(),
    background: color.optional(),
    layers: z.array(layer).max(PLAN_LIMITS.layers).default([]),
    camera: camera.optional(),
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
    version: z.literal(PLAN_VERSION),
    meta: obj({
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
  (value as { version?: unknown }).version === PLAN_VERSION;
