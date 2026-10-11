// V5 (spec 6): the selected cut marker, shared by the timeline (which draws
// it selected) and the right panel (which shows its Transition panel). It
// names the clip the transition leads into; transient, never saved.
// V7 (spec 10.5): or the scene a scene-to-scene transition leads into.
export const transitionFocus: {
  clipId: string | null;
  sceneId: string | null;
} = { clipId: null, sceneId: null };

/** The event a scene card's "+" or transition marker sends to the shell. */
export const SCENE_TRANSITION_EVENT = 'aive-scene-transition';
