// Helpers every reader uses, so no screen re-implements a rule.
import type { P3AdminSettings } from '../contracts/p3';
import type {
  BriefField,
  Campaign,
  StyleCap,
  Cost,
  DirectorRules,
  LText,
  Model,
  NewProjectOption,
  Plan,
  PlatformConfig,
  Provider,
  Studio,
  Style,
} from './schema';

export type Locale = 'en' | 'hi';
export const text = (t: LText | undefined, locale: Locale = 'en'): string =>
  t ? ((locale === 'hi' ? t.hi : undefined) ?? t.en) : '';

export const planById = (c: PlatformConfig, id: string): Plan | undefined =>
  c.plans.find((p) => p.id === id);
/** The plan to use for a user: theirs, else the first plan (the free one). */
export const planFor = (c: PlatformConfig, planId: string | undefined): Plan =>
  (planId ? planById(c, planId) : undefined) ??
  [...c.plans].sort((a, b) => a.sortOrder - b.sortOrder)[0]!;
export const publicPlans = (c: PlatformConfig): Plan[] =>
  c.plans.filter((p) => p.public).sort((a, b) => a.sortOrder - b.sortOrder);
export const canUse = (plan: Plan, requires: readonly string[]): boolean =>
  requires.every((f) => plan.features.includes(f));
export const costById = (c: PlatformConfig, id: string): Cost | undefined =>
  c.costs.find((x) => x.id === id);
export const styleById = (c: PlatformConfig, id: string): Style | undefined =>
  c.styles.find((s) => s.id === id);
export const enabledStyles = (c: PlatformConfig): Style[] =>
  c.styles.filter((s) => s.enabled).sort((a, b) => a.order - b.order);

/** Credits for `qty` units at the low or high end of the owner's range. */
export function costOf(
  c: PlatformConfig,
  id: string,
  qty = 1,
  end: 'min' | 'max' = 'max',
): number {
  const x = costById(c, id);
  return x ? x[end] * qty : 0;
}

export type ToolDecision =
  | { ok: true; needsApproval: boolean; maxCredits: number | null }
  | { ok: false; reason: 'unknown-tool' | 'disabled' | 'plan' };

/** The gateway calls this before every Director tool call, whatever the model says. */
export function toolDecision(
  d: DirectorRules,
  plan: Plan,
  toolId: string,
): ToolDecision {
  const t = d.tools.find((x) => x.id === toolId);
  if (!t) return { ok: false, reason: 'unknown-tool' };
  if (!t.enabled) return { ok: false, reason: 'disabled' };
  if (!canUse(plan, t.requires)) return { ok: false, reason: 'plan' };
  return {
    ok: true,
    needsApproval: t.needsApproval,
    maxCredits: t.maxCreditsPerRun,
  };
}
/** Whether Director may attempt `action`; otherwise the refusal to show. */
export const inScope = (d: DirectorRules, action: string): boolean =>
  d.scope.includes(action);

// P2-05: providers and models.
export const providerById = (
  c: PlatformConfig,
  id: string,
): Provider | undefined => c.providers.find((p) => p.id === id);
export const modelById = (c: PlatformConfig, id: string): Model | undefined =>
  c.models.find((m) => m.id === id);

export type ModelAvailability =
  | { ok: true }
  | { ok: false; reason: 'unknown' | 'disabled' | 'provider-off' | 'plan' };
/** Whether `plan` may use the model right now. */
export function modelAvailability(
  c: PlatformConfig,
  plan: Plan,
  modelId: string,
): ModelAvailability {
  const m = modelById(c, modelId);
  if (!m) return { ok: false, reason: 'unknown' };
  if (!m.enabled) return { ok: false, reason: 'disabled' };
  if (!providerById(c, m.providerId)?.enabled)
    return { ok: false, reason: 'provider-off' };
  if (!canUse(plan, m.requires)) return { ok: false, reason: 'plan' };
  return { ok: true };
}
/** Enabled models (provider on) that serve `role`, in the owner's order. */
export const modelsForRole = (c: PlatformConfig, role: string): Model[] =>
  c.models
    .filter(
      (m) =>
        m.enabled &&
        m.roles.includes(role) &&
        providerById(c, m.providerId)?.enabled,
    )
    .sort(
      (a, b) =>
        Number(c.assignments?.[role] === b.id) -
          Number(c.assignments?.[role] === a.id) || a.order - b.order,
    );
/** The model to use for a role: the recommended one the plan allows, else the first allowed. */
export function defaultModelFor(
  c: PlatformConfig,
  plan: Plan,
  role: string,
): Model | undefined {
  const allowed = modelsForRole(c, role).filter((m) =>
    canUse(plan, m.requires),
  );
  // The owner's main model for the role comes first (it sorts first), then the recommended one.
  const main = c.assignments?.[role];
  return (
    allowed.find((m) => m.id === main) ??
    allowed.find((m) => m.recommendedForDirector) ??
    allowed[0]
  );
}
/** Director's model for each tier the person may pick (Fast, Balanced, Best). */
export function tierModels(
  c: PlatformConfig,
  role: string,
): Record<Model['tier'], Model | undefined> {
  const list = modelsForRole(c, role);
  const pick = (tier: Model['tier']) =>
    list.find((m) => m.tier === tier && m.recommendedForDirector) ??
    list.find((m) => m.tier === tier);
  return { fast: pick('fast'), balanced: pick('balanced'), best: pick('best') };
}

// P2-07: studios.
export const studioById = (c: PlatformConfig, id: string): Studio | undefined =>
  c.studios.find((s) => s.id === id);
export const enabledStudios = (c: PlatformConfig): Studio[] =>
  c.studios.filter((s) => s.enabled).sort((a, b) => a.order - b.order);
/** Whether this run of a studio needs the consent tick. */
export function needsConsent(
  s: Studio,
  answers: Record<string, unknown>,
): boolean {
  if (!s.consent) return false;
  if (!s.consentIf) return true;
  const v = answers[s.consentIf.field];
  return typeof v === 'string' && s.consentIf.in.includes(v);
}
/** A studio's inputs as a Style-like object, so the Brief form code renders it. */
export function studioForm(s: Studio): Style {
  return {
    id: s.id,
    name: s.name,
    blurb: s.blurb ?? { en: '' },
    playbook: '',
    playbookText: '',
    enabled: s.enabled,
    cardArt: '',
    formats: ['16:9'],
    requires: s.requires,
    brief: { fields: s.inputs as BriefField[], groups: [] },
    interview: {
      maxQuestions: 0,
      questions: [],
      creativeUpgrade: false,
      followUps: [],
    },
    order: s.order,
  };
}
export const learnItems = (c: PlatformConfig) =>
  [...c.learn].sort((a, b) => a.order - b.order);

// P3-WIRING (W1): the owner's P3 settings, as the other parts read them.
export function p3Settings(c: PlatformConfig): P3AdminSettings {
  const p = c.p3;
  return {
    chat: { ...p.chat },
    vision: { ...p.vision },
    memory: { ...p.memory },
    entitlementTtlSeconds: p.entitlementTtlSeconds,
    webhookReplayWindowSeconds: p.webhookReplayWindowSeconds,
  };
}
/** Campaigns running at `now` (enabled, inside their window). */
export const activeCampaigns = (
  c: PlatformConfig,
  now: Date = new Date(),
  planId?: string,
): Campaign[] =>
  c.campaigns.filter(
    (k) =>
      k.enabled &&
      Date.parse(k.startsAt) <= now.getTime() &&
      now.getTime() < Date.parse(k.endsAt) &&
      (planId === undefined ||
        k.plans.length === 0 ||
        k.plans.includes(planId)),
  );
const NO_CAP: StyleCap = {
  maxStyles: null,
  maxProjects: null,
  maxChatsPerProject: null,
};
/** A plan's caps; a plan without an entry has none. */
export const capFor = (c: PlatformConfig, planId: string): StyleCap =>
  c.styleCaps[planId] ?? NO_CAP;
/** A combo's role → model map (enabled models only); null for an unknown or disabled combo. */
export function comboModels(
  c: PlatformConfig,
  comboId: string,
): Record<string, Model> | null {
  const combo = c.combos.find((x) => x.id === comboId && x.enabled);
  if (!combo) return null;
  const out: Record<string, Model> = {};
  for (const [role, modelId] of Object.entries(combo.models)) {
    const m = modelById(c, modelId);
    if (m && m.enabled) out[role] = m;
  }
  return out;
}
/** W8: the sign-in limits and password length (samples until set in Admin). */
export const loginLimits = (c: PlatformConfig) => ({ ...c.p3.login });

/** P4, ROUND-A: the workspace rules for one plan. */
export function workspaceRules(c: PlatformConfig, planId: string) {
  const w = c.workspace;
  const plan = c.plans.find((p) => p.id === planId);
  const old = w.startOptions[planId];
  const wanted: readonly NewProjectOption[] = w.newProjectOptions[planId] ?? [
    'style',
    'director',
    'editor',
    'claude',
  ];
  const options = wanted.filter(
    (o) =>
      (o !== 'claude' || w.claudeConnector) &&
      (!old ||
        ((o === 'editor' ? old.includes('blank') : true) &&
          (o === 'style' || o === 'director'
            ? old.includes('director')
            : true))),
  );
  return {
    trashDays: w.trashDays,
    /** Projects the plan may keep (null: no cap). */
    maxProjects: plan?.limits.projects ?? null,
    /** Videos one Project may hold (null: no cap). */
    videosPerProject:
      plan?.limits.videosPerProject ?? w.maxProjectsPerStyle[planId] ?? null,
    /** The New project options, in order. */
    newProjectOptions: options,
  };
}
