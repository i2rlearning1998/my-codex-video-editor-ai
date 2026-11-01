// Helpers every reader uses, so no screen re-implements a rule.
import type {
  Cost,
  DirectorRules,
  LText,
  Plan,
  PlatformConfig,
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
