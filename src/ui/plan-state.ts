// FINAL3 V2.7 and V3: what a plan build leaves for Review and rebuilds:
// the plan (with the chosen media in `resolved` and edited narration), the
// alternatives per media layer, the flags, and which scenes it made. Kept
// in this browser per project (`aive.videoPlan.<projectId>`), never in the
// project or the history, like My Templates (D-144).
import type { Composition, DeepReadonly, Project } from '../core';
import {
  layerKey,
  type MediaCandidate,
  type PlanFlag,
  type VideoPlan,
} from '../video-plan';

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

/** The open project, so a saved state can be matched with its scenes. */
let liveProject: (() => DeepReadonly<Project>) | null = null;
export const bindPlanProject = (getter: () => DeepReadonly<Project>): void => {
  liveProject = getter;
};

type Layerish = {
  properties: Readonly<Record<string, { value?: unknown }>>;
  children: readonly Layerish[];
};
const refsOf = (composition: DeepReadonly<Composition>): Set<string> => {
  const refs = new Set<string>();
  const visit = (layers: readonly Layerish[]) =>
    layers.forEach((layer) => {
      const ref = layer.properties.planRef?.value;
      if (typeof ref === 'string') refs.add(ref);
      visit(layer.children);
    });
  visit(composition.layers as unknown as Layerish[]);
  return refs;
};

/**
 * FIX9: a state's scene ids can fall out of step with the project (a scene
 * remade under a new id, a state saved by an older panel). The built layers
 * carry their plan reference, so a scene whose id is gone is found again by
 * those references. A scene the person deleted in Review stays deleted (null).
 */
function heal(projectId: string, state: PlanState): PlanState {
  const project = liveProject?.();
  if (!project || project.id !== projectId) return state;
  const timeline = state.plan.meta.build === 'timeline';
  const exists = (id: string | null | undefined) =>
    !!id && project.compositions.some((c) => c.id === id);
  const claimed = new Set(state.sceneIds.filter((id) => exists(id)));
  const slots = timeline ? 1 : state.plan.scenes.length;
  let changed = false;
  for (let slot = 0; slot < slots; slot++) {
    const id = state.sceneIds[slot];
    if (id === null || id === undefined || exists(id)) continue;
    const wanted = new Set<string>();
    const scenes = timeline ? state.plan.scenes : [state.plan.scenes[slot]!];
    for (const scene of scenes)
      for (const layer of scene.layers) wanted.add(layerKey(scene, layer));
    if (timeline)
      for (const layer of state.plan.overlays)
        wanted.add(layerKey({ id: 'overlay' }, layer));
    if (!wanted.size) continue;
    let best: string | null = null;
    let bestScore = 0;
    for (const composition of project.compositions) {
      if (claimed.has(composition.id)) continue;
      const have = refsOf(composition);
      let hit = 0;
      for (const ref of wanted) if (have.has(ref)) hit++;
      const score = hit / wanted.size;
      if (score >= 0.5 && score >= bestScore) {
        best = composition.id;
        bestScore = score;
      }
    }
    if (best) {
      state.sceneIds[slot] = best;
      claimed.add(best);
      changed = true;
    }
  }
  if (changed) {
    // Saved without making it the project's "latest" plan.
    if (memory.get(projectId) === state) savePlanState(projectId, state);
    else
      try {
        localStorage.setItem(
          allKey(projectId),
          JSON.stringify({
            ...readAll(projectId),
            [state.plan.meta.title]: state,
          }),
        );
      } catch {
        // Storage off: the healed ids stay in memory for this session.
      }
  }
  return state;
}

/** One object per built plan, whichever way it is asked for. */
function intern(projectId: string, state: PlanState): PlanState {
  const title = state.plan.meta.title;
  const all =
    memoryAll.get(projectId) ??
    memoryAll.set(projectId, new Map()).get(projectId)!;
  const known = all.get(title) ?? (memory.get(projectId)?.plan.meta.title === title ? memory.get(projectId) : undefined);
  if (known) {
    all.set(title, known);
    return known;
  }
  all.set(title, state);
  return state;
}

/**
 * The plan state, also when browser storage refused it: the one built for
 * `title`, else the latest one built in this project.
 */
export function planState(projectId: string, title?: string): PlanState | null {
  let found: PlanState | null;
  if (title === undefined) {
    found = memory.get(projectId) ?? loadPlanState(projectId);
    if (found) {
      found = intern(projectId, found);
      memory.set(projectId, found);
    }
  } else {
    found =
      memoryAll.get(projectId)?.get(title) ??
      readAll(projectId)[title] ??
      null;
    if (found) found = intern(projectId, found);
  }
  return found ? heal(projectId, found) : null;
}
