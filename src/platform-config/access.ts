// ROUND-C5 Part 3: who gets a feature or a limit. One pure function for the
// server, the panel and Claude. Order (the brief's): emergency and global
// off, then a personal override that has not ended, then cohort overrides,
// then beta and rollout, then the plan. A config with no `features` and no
// overrides gives exactly the plan, as today.
import type { Feature, Plan, PlatformConfig } from './schema';
import { c5 } from './texts/c5';

export const LIMIT_KEYS = [
  'exportsPerMonth',
  'maxExportHeight',
  'storageMb',
  'voiceClones',
  'projects',
  'videosPerProject',
  'callsPerMinute',
  'creditsPerDay',
] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

/** One override: a feature on or off, or one limit's value. */
export interface AccessOverride {
  readonly id: string;
  /** A person (userId) or a cohort id ("cohort:<id>"). */
  readonly who: string;
  readonly feature?: string;
  readonly on?: boolean;
  readonly limit?: LimitKey;
  readonly value?: number | null;
  /** ISO time; absent: no end. */
  readonly expiresAt?: string;
  readonly note: string;
  readonly by: string;
  readonly at: string;
}
export interface Cohort {
  readonly id: string;
  readonly name: string;
  /** Lower-case emails (at most 500). */
  readonly emails: readonly string[];
}
export interface AccessRules {
  overrides: AccessOverride[];
  cohorts: Cohort[];
}
export const emptyAccess = (): AccessRules => ({ overrides: [], cohorts: [] });

export interface Person {
  readonly userId: string;
  readonly email?: string;
  readonly plan: Plan;
}
export type Because =
  | { kind: 'emergency' }
  | { kind: 'off' }
  | { kind: 'override'; id: string; note: string; on: boolean }
  | { kind: 'cohort'; cohort: string; on: boolean }
  | { kind: 'beta'; percent: number; inGroup: boolean }
  | { kind: 'rollout'; percent: number; inGroup: boolean }
  | { kind: 'plan'; plan: string; on: boolean };

/** A stable bucket 0..99 for a person and a feature (FNV-1a). */
export function rolloutBucket(userId: string, key: string): number {
  let h = 2166136261;
  const s = `${userId}:${key}`;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 100;
}
const live = (o: AccessOverride, now: number) =>
  !o.expiresAt || Date.parse(o.expiresAt) > now;
const cohortsOf = (rules: AccessRules, email?: string) =>
  email
    ? rules.cohorts.filter((c) => c.emails.includes(email.toLowerCase()))
    : [];

/** Whether a person has a feature now, and why. */
export function featureFor(
  c: Pick<PlatformConfig, 'features'>,
  rules: AccessRules,
  p: Person,
  key: string,
  now: number,
  emergencyOff = false,
): { on: boolean; because: Because } {
  if (emergencyOff) return { on: false, because: { kind: 'emergency' } };
  const f: Feature | undefined = c.features?.find((x) => x.key === key);
  if (f && !f.on) return { on: false, because: { kind: 'off' } };
  const mine = rules.overrides.filter(
    (o) => o.who === p.userId && o.feature === key && live(o, now),
  );
  const last = mine.at(-1);
  if (last && last.on !== undefined)
    return {
      on: last.on,
      because: { kind: 'override', id: last.id, note: last.note, on: last.on },
    };
  for (const co of cohortsOf(rules, p.email)) {
    const o = rules.overrides
      .filter(
        (x) => x.who === `cohort:${co.id}` && x.feature === key && live(x, now),
      )
      .at(-1);
    if (o && o.on !== undefined)
      return { on: o.on, because: { kind: 'cohort', cohort: co.id, on: o.on } };
  }
  const inPlan = p.plan.features.includes(key);
  if (f) {
    const inGroup = rolloutBucket(p.userId, key) < f.rollout;
    if (f.beta)
      return {
        on: inGroup,
        because: { kind: 'beta', percent: f.rollout, inGroup },
      };
    if (f.rollout < 100 && !inGroup)
      return {
        on: false,
        because: { kind: 'rollout', percent: f.rollout, inGroup },
      };
    if (f.rollout < 100 && inPlan)
      return {
        on: true,
        because: { kind: 'rollout', percent: f.rollout, inGroup },
      };
  }
  return { on: inPlan, because: { kind: 'plan', plan: p.plan.id, on: inPlan } };
}

/** A person's limit now (a personal override, then a cohort's, then the plan). */
export function limitFor(
  rules: AccessRules,
  p: Person,
  limit: LimitKey,
  now: number,
): number | null {
  const pick = (who: string) =>
    rules.overrides
      .filter((o) => o.who === who && o.limit === limit && live(o, now))
      .at(-1);
  const o =
    pick(p.userId) ??
    cohortsOf(rules, p.email)
      .map((co) => pick(`cohort:${co.id}`))
      .find(Boolean);
  if (o && o.value !== undefined) return o.value;
  return (p.plan.limits as Record<LimitKey, number | null>)[limit];
}

/**
 * The plan a person effectively has: its features and limits after every
 * switch, rollout and override. Code that reads `plan.features` and
 * `plan.limits` (canUse, preCheck, the panel's locks) follows it unchanged.
 */
export function effectivePlan(
  c: Pick<PlatformConfig, 'features'>,
  rules: AccessRules,
  p: Person,
  now: number,
  emergencyOff = false,
): Plan {
  const keys = new Set([
    ...p.plan.features,
    ...(c.features ?? []).map((f) => f.key),
    ...rules.overrides.filter((o) => o.feature).map((o) => o.feature!),
  ]);
  const features = [...keys].filter(
    (k) => featureFor(c, rules, p, k, now, emergencyOff).on,
  );
  const limits = { ...p.plan.limits } as Record<LimitKey, number | null>;
  for (const k of LIMIT_KEYS) limits[k] = limitFor(rules, p, k, now);
  return { ...p.plan, features, limits: limits as Plan['limits'] };
}

/** The owner's "Who has this?" sentence for one reason. */
export function becauseText(
  b: Because,
  c: Pick<PlatformConfig, 'plans'>,
  lang: 'en' | 'hi' = 'en',
): string {
  switch (b.kind) {
    case 'emergency':
    case 'off':
      return c5('who-has-this-off', lang);
    case 'override':
      return `${b.on ? 'On' : 'Off'} for this person: ${b.note}`;
    case 'cohort':
      return `${b.on ? 'On' : 'Off'} for the group ${b.cohort}.`;
    case 'beta':
    case 'rollout':
      return b.inGroup
        ? c5('who-has-this-rollout', lang, { percent: b.percent })
        : c5('who-has-this-not-yet', lang);
    case 'plan': {
      const plan = c.plans.find((x) => x.id === b.plan);
      const name = plan
        ? ((lang === 'hi' ? plan.name.hi : undefined) ?? plan.name.en)
        : b.plan;
      return b.on
        ? c5('who-has-this-plan', lang, { plan: name })
        : c5('feature-locked', lang);
    }
  }
}

/** Checks an override before it is saved (plain sentences). */
export function checkOverride(
  o: Partial<AccessOverride>,
  lang: 'en' | 'hi' = 'en',
): string[] {
  const out: string[] = [];
  if (!o.note?.trim()) out.push(c5('override-note-required', lang));
  if (!o.who) out.push('Choose a person or a group.');
  if (!o.feature && !o.limit) out.push('Choose a feature or a limit.');
  if (o.feature && o.on === undefined) out.push('Say on or off.');
  if (o.limit && !(LIMIT_KEYS as readonly string[]).includes(o.limit))
    out.push('That is not a limit.');
  if (
    o.limit &&
    o.value !== null &&
    (typeof o.value !== 'number' || o.value < 0 || !Number.isInteger(o.value))
  )
    out.push('A limit is a whole number (or empty for no limit).');
  if (o.expiresAt && !Number.isFinite(Date.parse(o.expiresAt)))
    out.push('The end is not a date.');
  return out;
}
