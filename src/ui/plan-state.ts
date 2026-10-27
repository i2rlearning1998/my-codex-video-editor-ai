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
// FIX6: every built plan keeps its own state (by title), so a second import
// no longer turns the first card into "Not built" or takes its Review away.
const allKey = (projectId: string) => `aive.videoPlans.${projectId}`;
function readAll(projectId: string): Record<string, PlanState> {
  try {
    const text = localStorage.getItem(allKey(projectId));
    return text ? (JSON.parse(text) as Record<string, PlanState>) : {};
  } catch {
    return {};
  }
}
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
    localStorage.setItem(
      allKey(projectId),
      JSON.stringify({ ...readAll(projectId), [state.plan.meta.title]: state }),
    );
  } catch {
    // Browser storage full or off: Review still works for this session.
  }
  memory.set(projectId, state);
  (
    memoryAll.get(projectId) ??
    memoryAll.set(projectId, new Map()).get(projectId)!
  ).set(state.plan.meta.title, state);
}
const memory = new Map<string, PlanState>();
const memoryAll = new Map<string, Map<string, PlanState>>();
/**
 * The plan state, also when browser storage refused it: the one built for
 * `title`, else the latest one built in this project.
 */
export const planState = (projectId: string, title?: string) =>
  title === undefined
    ? (memory.get(projectId) ?? loadPlanState(projectId))
    : (memoryAll.get(projectId)?.get(title) ??
      readAll(projectId)[title] ??
      null);
