// W5-C animation presets stored on a clip (ANI-007, ANI-008). They live in
// `clip.metadata.animation` (D-033 pattern, schema unchanged), validated here at
// the command boundary and read defensively everywhere else.
import { z } from 'zod';

export const IN_OUT_PRESETS = [
  'fade',
  'slide',
  'zoom',
  'pop',
  'wipe',
  'typewriter',
] as const;
export const LOOP_PRESETS = ['pulse', 'float', 'spin', 'wiggle'] as const;
export const SLIDE_DIRECTIONS = ['up', 'down', 'left', 'right'] as const;

const inOut = z
  .object({
    preset: z.enum(IN_OUT_PRESETS),
    duration: z.number().finite().min(0.1).max(5),
    direction: z.enum(SLIDE_DIRECTIONS).optional(),
  })
  .strict();
const loop = z
  .object({
    preset: z.enum(LOOP_PRESETS),
    period: z.number().finite().min(0.5).max(5),
  })
  .strict();
const kenBurns = z.object({ zoom: z.enum(['in', 'out']) }).strict();

export const clipAnimationSlots = { in: inOut, out: inOut, loop, kenBurns };
export type ClipAnimationSlot = keyof typeof clipAnimationSlots;
export const clipAnimationSchema = z
  .object({
    in: inOut.optional(),
    out: inOut.optional(),
    loop: loop.optional(),
    kenBurns: kenBurns.optional(),
  })
  .strict();
export type ClipAnimation = z.infer<typeof clipAnimationSchema>;
export type InOutPreset = z.infer<typeof inOut>;
export type LoopPreset = z.infer<typeof loop>;

/** The clip's presets, or an empty record when absent or invalid. */
export function clipAnimation(clip: {
  readonly metadata: object;
}): ClipAnimation {
  const value = (clip.metadata as Record<string, unknown>).animation;
  const parsed = clipAnimationSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}
