// J12: transitions between two touching clips on one lane. A transition is
// stored on the incoming (later) clip, in its existing `transitionMetadata`
// record as `in: { type, duration }` (schema unchanged). It plays across the
// cut, half before and half after, and only while the clips touch.
import { z } from 'zod';

/** Transitions that are drawn (preview and export). */
export const TRANSITION_TYPES = [
  'crossfade',
  'fade-black',
  'fade-white',
  'wipe-left',
  'wipe-right',
  'slide-left',
  'slide-right',
] as const;
export type TransitionType = (typeof TRANSITION_TYPES)[number];
export const MIN_TRANSITION = 0.1;
export const MAX_TRANSITION = 5;
export const DEFAULT_TRANSITION = 1;

export const transitionSchema = z
  .object({
    // T-ALL P6: or a pixel transition of the FX library (`transition.*`).
    type: z.union([
      z.enum(TRANSITION_TYPES),
      z.string().regex(/^transition\.[a-z0-9-]+$/),
    ]),
    duration: z.number().finite().min(MIN_TRANSITION).max(MAX_TRANSITION),
    params: z
      .record(
        z.string().max(32),
        z.union([z.number().finite(), z.boolean(), z.string().max(64)]),
      )
      .optional(),
  })
  .strict();
export type Transition = z.infer<typeof transitionSchema>;

/** The transition into a clip, read defensively (null when none is valid). */
export function clipTransition(clip: {
  readonly transitionMetadata: Readonly<Record<string, unknown>>;
}): Transition | null {
  const parsed = transitionSchema.safeParse(clip.transitionMetadata.in);
  return parsed.success ? parsed.data : null;
}

interface CutClip {
  readonly id: string;
  readonly startTime: number;
  readonly duration: number;
}
/** The clip that ends exactly where `clip` starts on the same lane, if any. */
export function previousTouching<C extends CutClip>(
  clips: readonly C[],
  clip: CutClip,
): C | undefined {
  return clips.find(
    (other) =>
      other.id !== clip.id &&
      Math.abs(other.startTime + other.duration - clip.startTime) < 1e-6,
  );
}
/** The longest transition two clips allow: each gives at most its half. */
export function maxTransition(a: CutClip, b: CutClip): number {
  return Math.min(MAX_TRANSITION, 2 * a.duration, 2 * b.duration);
}
