// FINAL3 V2.2: scene lengths. A scene lasts max(voice + 0.4 s, its hint);
// without a hint the pacing picks one, and without a voice the narration is
// timed at a speaking rate, so a silent build is as long as a voiced one.
import type { PlanScene, VideoPlan } from './schema';

export const VOICE_TAIL = 0.4;
/** Words per second when no voice is measured. */
export const WORDS_PER_SECOND = 2.5;
const PACING_HINT = { slow: 6, medium: 4.5, fast: 3 } as const;

const layerEnd = (scene: PlanScene) =>
  Math.max(
    0,
    ...scene.layers.map((layer) =>
      layer.duration !== undefined ? (layer.start ?? 0) + layer.duration : 0,
    ),
  );
/** Spoken length of a narration at the speaking rate (seconds). */
export const spokenSeconds = (narration: string | undefined) =>
  narration?.trim()
    ? narration.trim().split(/\s+/).length / WORDS_PER_SECOND
    : 0;
/** The scene's length before any voice exists. */
export function estimateSceneDuration(
  scene: PlanScene,
  pacing: NonNullable<VideoPlan['feel']>['pacing'] = 'medium',
): number {
  return sceneDuration(scene, null, pacing);
}
/** The scene's length with a measured voice (seconds) or without one. */
export function sceneDuration(
  scene: PlanScene,
  voice: number | null,
  pacing: NonNullable<VideoPlan['feel']>['pacing'] = 'medium',
): number {
  const hint = scene.durationHint ?? PACING_HINT[pacing ?? 'medium'];
  const speech = voice ?? spokenSeconds(scene.narration);
  const raw = Math.max(
    hint,
    speech ? speech + VOICE_TAIL : 0,
    layerEnd(scene),
    1,
  );
  // Whole frames at 60 fps (also whole at 30), so every scene cut is exact.
  return Math.ceil(raw * 60 - 1e-6) / 60;
}
