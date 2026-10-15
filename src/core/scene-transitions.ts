// V7 (Clipchamp clone spec 10.5): transitions between neighbouring scenes.
// Schema 7 has no scene field for them, so a scene transition is stored as
// one reserved marker at time 0 of the INCOMING scene, whose label holds the
// transition as JSON (D-199). The marker is never shown or snapped to. It
// plays across the scene cut, half before and half after, like a clip
// transition: no scene is shortened.
import {
  MAX_TRANSITION,
  MIN_TRANSITION,
  transitionSchema,
  type Transition,
} from './transitions';

export const SCENE_TRANSITION_PREFIX = 'aive:scene-transition ';

interface MarkerLike {
  readonly id: string;
  readonly time: number;
  readonly label: string;
}
interface SceneLike {
  readonly id: string;
  readonly duration: number;
  readonly markers: readonly MarkerLike[];
}

export const isSceneTransitionMarker = (marker: { readonly label: string }) =>
  marker.label.startsWith(SCENE_TRANSITION_PREFIX);
/**
 * T1: every reserved marker ('aive:' labels: scene transitions and the
 * project's themes) is data, never a marker the user sees, snaps to or that
 * sets a scene's length.
 */
export const isReservedMarker = (marker: { readonly label: string }) =>
  marker.label.startsWith('aive:');

/** The reserved marker of a scene's incoming transition, if any. */
export function sceneTransitionMarker<M extends MarkerLike>(scene: {
  readonly markers: readonly M[];
}): M | undefined {
  return scene.markers.find(isSceneTransitionMarker);
}

/** The transition into a scene, read defensively. */
export function sceneTransitionOf(scene: {
  readonly markers: readonly MarkerLike[];
}): Transition | null {
  const marker = sceneTransitionMarker(scene);
  if (!marker) return null;
  try {
    const parsed = transitionSchema.safeParse(
      JSON.parse(marker.label.slice(SCENE_TRANSITION_PREFIX.length)),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const sceneTransitionLabel = (transition: Transition) =>
  `${SCENE_TRANSITION_PREFIX}${JSON.stringify(transition)}`;

/** The longest transition two scenes allow: each gives at most its half. */
export const maxSceneTransition = (a: SceneLike, b: SceneLike) =>
  Math.max(
    MIN_TRANSITION,
    Math.min(MAX_TRANSITION, 2 * a.duration, 2 * b.duration),
  );

export interface SceneCut {
  /** The cut, in the time of the drawn (or joined) composition. */
  readonly time: number;
  readonly transition: Transition;
}

/**
 * The cuts of scenes played end to end (export join): each scene after the
 * first with a transition into it.
 */
export function sceneCuts(scenes: readonly SceneLike[]): SceneCut[] {
  const cuts: SceneCut[] = [];
  let offset = 0;
  scenes.forEach((scene, index) => {
    const transition = index ? sceneTransitionOf(scene) : null;
    if (transition) cuts.push({ time: offset, transition });
    offset += scene.duration;
  });
  return cuts;
}

/**
 * The cuts that touch one open scene (preview): its incoming transition at
 * time 0 and the next scene's at its end.
 */
export function cutsAround(
  scenes: readonly SceneLike[],
  sceneId: string,
): SceneCut[] {
  const index = scenes.findIndex((scene) => scene.id === sceneId);
  if (index < 0) return [];
  const cuts: SceneCut[] = [];
  const incoming = index ? sceneTransitionOf(scenes[index]!) : null;
  if (incoming) cuts.push({ time: 0, transition: incoming });
  const next = scenes[index + 1];
  const outgoing = next ? sceneTransitionOf(next) : null;
  if (outgoing)
    cuts.push({ time: scenes[index]!.duration, transition: outgoing });
  return cuts;
}

/** The cut in play at `time`, with its eased-free progress 0 to 1. */
export function activeCut(
  cuts: readonly SceneCut[],
  time: number,
): { cut: SceneCut; p: number } | null {
  for (const cut of cuts) {
    const half = cut.transition.duration / 2;
    if (time >= cut.time - half && time < cut.time + half)
      return {
        cut,
        p: Math.min(
          1,
          Math.max(0, (time - (cut.time - half)) / cut.transition.duration),
        ),
      };
  }
  return null;
}
