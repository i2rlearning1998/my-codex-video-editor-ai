// ROUND-A A1: the server's record of a person's Projects and Videos, so the
// plan's limits (projects, videos per project) are decided by the server and
// not by the browser. With no gateway (offline demo) the panel applies the
// same rules to its own workspace. Only ids and Trash state are kept; names, styles and the
// editor files stay where they were. Pure functions over the stored record;
// server/app.ts reads and writes it through the Store.
import type { Plan, PlatformConfig } from '../platform-config';

/** A plan limit was reached: the owner's sentence (the server answers 403). */
export class LimitError extends Error {
  constructor(
    readonly code: 'limit-projects' | 'limit-videos',
    message: string,
    readonly detail: Record<string, number>,
  ) {
    super(message);
    this.name = 'LimitError';
  }
}
import { workspaceRules } from '../platform-config';

export interface Registry {
  projects: Record<
    string,
    { trashed: boolean; videos: Record<string, { trashed: boolean }> }
  >;
}
export const emptyRegistry = (): Registry => ({ projects: {} });

const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
export const validId = (v: unknown): v is string =>
  typeof v === 'string' && ID.test(v);

const live = (r: Registry) =>
  Object.values(r.projects).filter((p) => !p.trashed).length;
const liveVideos = (r: Registry, projectId: string) =>
  Object.values(r.projects[projectId]?.videos ?? {}).filter((v) => !v.trashed)
    .length;

function said(
  c: PlatformConfig,
  key: 'projects' | 'videos',
  n: number,
  locale: 'en' | 'hi',
  fallback: string,
) {
  const m = c.limitMessages?.[key];
  const t = m ? (locale === 'hi' && m.hi) || m.en : fallback;
  return t.replace(/\{n\}/g, String(n));
}

/** Throws the owner's sentence when one more Project would pass the plan. */
export function checkProject(
  r: Registry,
  c: PlatformConfig,
  plan: Plan,
  locale: 'en' | 'hi',
) {
  const max = plan.limits.projects;
  if (max !== null && live(r) >= max)
    throw new LimitError(
      'limit-projects',
      said(c, 'projects', max, locale, `Your plan allows ${max} projects.`),
      { limit: max, upgrade: 1 },
    );
}
/** Throws the owner's sentence when one more Video would pass the plan. */
export function checkVideo(
  r: Registry,
  projectId: string,
  c: PlatformConfig,
  plan: Plan,
  locale: 'en' | 'hi',
) {
  const max = workspaceRules(c, plan.id).videosPerProject;
  if (max !== null && liveVideos(r, projectId) >= max)
    throw new LimitError(
      'limit-videos',
      said(
        c,
        'videos',
        max,
        locale,
        `Your plan allows ${max} videos in one project.`,
      ),
      { limit: max, upgrade: 1 },
    );
}

/**
 * Registers a new Project or Video after the plan check. A Video of a
 * Project the server has not seen registers that Project first (with the
 * project check), so a browser can never skip it.
 */
export function claim(
  r: Registry,
  input: { kind: 'project' | 'video'; id: string; projectId?: string },
  c: PlatformConfig,
  plan: Plan,
  locale: 'en' | 'hi',
): Registry {
  const next: Registry = structuredClone(r);
  if (input.kind === 'project') {
    if (next.projects[input.id]) return next;
    checkProject(next, c, plan, locale);
    next.projects[input.id] = { trashed: false, videos: {} };
    return next;
  }
  const pid = input.projectId!;
  if (!next.projects[pid]) {
    checkProject(next, c, plan, locale);
    next.projects[pid] = { trashed: false, videos: {} };
  }
  if (next.projects[pid]!.videos[input.id]) return next;
  checkVideo(next, pid, c, plan, locale);
  next.projects[pid]!.videos[input.id] = { trashed: false };
  return next;
}

/** Trash, Restore (checked against the plan again) or Delete for good. */
export function change(
  r: Registry,
  input: {
    kind: 'project' | 'video';
    id: string;
    projectId?: string;
    to: 'trash' | 'restore' | 'forget';
  },
  c: PlatformConfig,
  plan: Plan,
  locale: 'en' | 'hi',
): Registry {
  const next: Registry = structuredClone(r);
  if (input.kind === 'project') {
    const p = next.projects[input.id];
    if (!p) return next;
    if (input.to === 'forget') delete next.projects[input.id];
    else if (input.to === 'trash') p.trashed = true;
    else if (p.trashed) {
      checkProject(next, c, plan, locale);
      p.trashed = false;
    }
    return next;
  }
  const p = next.projects[input.projectId ?? ''];
  const v = p?.videos[input.id];
  if (!p || !v) return next;
  if (input.to === 'forget') delete p.videos[input.id];
  else if (input.to === 'trash') v.trashed = true;
  else if (v.trashed) {
    if (p.trashed) {
      checkProject(next, c, plan, locale);
      p.trashed = false;
    }
    checkVideo(next, input.projectId!, c, plan, locale);
    v.trashed = false;
  }
  return next;
}

/**
 * The browser tells the server what it already holds (data made before this
 * round, or on another computer). Anything new is added WITHOUT a check
 * (it already exists, and adding only makes later checks stricter); nothing
 * is removed here.
 */
export function merge(
  r: Registry,
  known: {
    id: string;
    trashed: boolean;
    videos: { id: string; trashed: boolean }[];
  }[],
): Registry {
  const next: Registry = structuredClone(r);
  for (const p of known.slice(0, 2000)) {
    if (!validId(p.id)) continue;
    const have = (next.projects[p.id] ??= {
      trashed: !!p.trashed,
      videos: {},
    });
    for (const v of p.videos.slice(0, 2000))
      if (validId(v.id) && !have.videos[v.id])
        have.videos[v.id] = { trashed: !!v.trashed };
  }
  return next;
}

/** The registry a workspace document implies (the browser's view, no gateway). */
export function fromWorkspace(doc: {
  projects: readonly { id: string; trashedAt: string | null }[];
  videos: readonly {
    id: string;
    projectId: string;
    trashedAt: string | null;
  }[];
}): Registry {
  const r = emptyRegistry();
  for (const p of doc.projects)
    r.projects[p.id] = { trashed: !!p.trashedAt, videos: {} };
  for (const v of doc.videos) {
    const p = (r.projects[v.projectId] ??= { trashed: false, videos: {} });
    p.videos[v.id] = { trashed: !!v.trashedAt };
  }
  return r;
}
