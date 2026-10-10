// V5 (spec 6): the selected cut marker, shared by the timeline (which draws
// it selected) and the right panel (which shows its Transition panel). It
// names the clip the transition leads into; transient, never saved.
export const transitionFocus: { clipId: string | null } = { clipId: null };
