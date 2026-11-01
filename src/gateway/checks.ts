// P2-14: every check the gateway makes before it calls a model, whatever the
// caller or the model says. Each refusal has a code and one plain sentence.
import {
  canUse,
  modelAvailability,
  toolDecision,
  type Plan,
  type PlatformConfig,
} from '../platform-config';
import { GatewayError } from './types';

/** What the person has used so far (from storage, the ledger and the usage log). */
export interface LimitUsage {
  exportsThisMonth: number;
  storageMb: number;
  voiceClones: number;
  projects: number;
  callsLastMinute: number;
  creditsToday: number;
}
export type LimitedAction = 'export' | 'store' | 'voice-clone' | 'project';
export interface PreCheck {
  readonly config: PlatformConfig;
  readonly plan: Plan;
  readonly modelId?: string;
  readonly toolId?: string;
  /** Plan features the work needs (a studio's `requires`). */
  readonly requires?: readonly string[];
  readonly action?: LimitedAction;
  /** Extra megabytes the action stores. */
  readonly addMb?: number;
  readonly maxCredits: number;
  /** Credits for a whole video (Director budget), when this is one. */
  readonly videoCredits?: number;
  readonly usage: LimitUsage;
  /** The language of the owner's limit sentences (default English). */
  readonly locale?: 'en' | 'hi';
}

const refuse = (
  code: ConstructorParameters<typeof GatewayError>[0],
  msg: string,
  detail: Record<string, string | number> = {},
): never => {
  throw new GatewayError(code, msg, detail);
};

/** Throws a GatewayError when the call must not happen. */
export function preCheck(x: PreCheck): void {
  const { config: c, plan, usage: u } = x;
  const L = plan.limits;
  // P2B-26: the owner's sentence from the config, else the built-in one.
  const said = (
    k: 'exports' | 'storage' | 'voiceClones' | 'projects',
    n: number,
    fallback: string,
  ) => {
    const m = c.limitMessages?.[k];
    const t = m ? (x.locale === 'hi' && m.hi) || m.en : fallback;
    return t.replace(/\{n\}/g, String(n));
  };
  if (x.modelId) {
    const a = modelAvailability(c, plan, x.modelId);
    if (!a.ok) {
      const map = {
        unknown: ['model-unknown', 'That model does not exist.'],
        disabled: ['model-disabled', 'That model is switched off.'],
        'provider-off': [
          'provider-off',
          'The service behind that model is switched off.',
        ],
        plan: ['model-plan', 'Your plan does not include that model.'],
      } as const;
      const [code, msg] = map[a.reason];
      refuse(code, msg);
    }
  }
  if (x.toolId) {
    const d = toolDecision(c.director, plan, x.toolId);
    if (!d.ok) {
      const map = {
        'unknown-tool': [
          'tool-unknown',
          'Director is not allowed to use that tool.',
        ],
        disabled: ['tool-disabled', 'That tool is switched off.'],
        plan: ['tool-plan', 'Your plan does not include that tool.'],
      } as const;
      const [code, msg] = map[d.reason];
      refuse(code, msg);
    } else if (d.maxCredits !== null && x.maxCredits > d.maxCredits)
      refuse(
        'tool-cap',
        `That tool may use at most ${d.maxCredits} credits at a time.`,
        { cap: d.maxCredits },
      );
  }
  if (x.requires && !canUse(plan, x.requires))
    refuse('tool-plan', 'Your plan does not include that tool.');
  if (
    x.action === 'export' &&
    L.exportsPerMonth !== null &&
    u.exportsThisMonth >= L.exportsPerMonth
  )
    refuse(
      'limit-exports',
      said(
        'exports',
        L.exportsPerMonth,
        `Your plan allows ${L.exportsPerMonth} exports a month.`,
      ),
      { limit: L.exportsPerMonth, upgrade: 1 },
    );
  if (x.action === 'voice-clone' && u.voiceClones >= L.voiceClones)
    refuse(
      'limit-voice-clones',
      said(
        'voiceClones',
        L.voiceClones,
        `Your plan allows ${L.voiceClones} cloned voices.`,
      ),
      { limit: L.voiceClones, upgrade: 1 },
    );
  if (x.action === 'project' && L.projects !== null && u.projects >= L.projects)
    refuse(
      'limit-projects',
      said('projects', L.projects, `Your plan allows ${L.projects} projects.`),
      { limit: L.projects, upgrade: 1 },
    );
  if (
    (x.action === 'store' || (x.addMb ?? 0) > 0) &&
    u.storageMb + (x.addMb ?? 0) > L.storageMb
  )
    refuse(
      'limit-storage',
      said(
        'storage',
        L.storageMb,
        `Your plan has ${L.storageMb} MB of storage.`,
      ),
      { limit: L.storageMb, upgrade: 1 },
    );
  const budget = c.director.budget.maxCreditsPerVideo;
  if (
    x.videoCredits !== undefined &&
    budget !== null &&
    x.videoCredits > budget
  )
    refuse('budget-video', `A video may use at most ${budget} credits.`, {
      limit: budget,
    });
  if (
    L.creditsPerDay !== null &&
    u.creditsToday + x.maxCredits > L.creditsPerDay
  )
    refuse('budget-day', `Your plan allows ${L.creditsPerDay} credits a day.`, {
      limit: L.creditsPerDay,
    });
  if (u.callsLastMinute >= L.callsPerMinute)
    refuse(
      'rate-limit',
      'Too many requests in a minute. Wait a moment and try again.',
      { limit: L.callsPerMinute },
    );
}
