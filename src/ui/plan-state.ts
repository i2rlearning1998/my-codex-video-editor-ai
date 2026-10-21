// FINAL3 V2.7 and V3: what a plan build leaves for Review and rebuilds:
// the plan (with the chosen media in `resolved` and edited narration), the
// alternatives per media layer, the flags, and which scenes it made. Kept
// in this browser per project (`aive.videoPlan.<projectId>`), never in the
// project or the history, like My Templates (D-144).
import type { MediaCandidate, PlanFlag, VideoPlan } from '../video-plan';

export interface PlanState {
  plan: VideoPlan;
  alternatives: Record<string, MediaCandidate[]>;
  flags: PlanFlag[];
  silent: string | null;
  /** The built scenes' ids, in plan order (null: deleted). */
  sceneIds: (string | null)[];
  /** Further stock pages already fetched per layer. */
  pages: Record<string, number>;
}
const key = (projectId: string) => `aive.videoPlan.${projectId}`;
export function loadPlanState(projectId: string): PlanState | null {
  try {
    const text = localStorage.getItem(key(projectId));
    return text ? (JSON.parse(text) as PlanState) : null;
  } catch {
    return null;
  }
}
export function savePlanState(projectId: string, state: PlanState): void {
  try {
    localStorage.setItem(key(projectId), JSON.stringify(state));
  } catch {
    // Browser storage full or off: Review still works for this session.
  }
  memory.set(projectId, state);
}
const memory = new Map<string, PlanState>();
/** The plan state, also when browser storage refused it. */
export const planState = (projectId: string) =>
  memory.get(projectId) ?? loadPlanState(projectId);
