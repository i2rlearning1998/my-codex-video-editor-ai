// The gateway: checks, reserves at the maximum, calls the adapter, settles at
// what was used and refunds the rest; any failure refunds everything. Every
// call leaves a usage row.
import {
  modelById,
  providerById,
  type Plan,
  type PlatformConfig,
} from '../platform-config';
import { preCheck, type LimitedAction, type LimitUsage } from './checks';
import { creditsOf } from './cost';
import type { CreditLedger } from './ledger';
import {
  GatewayError,
  type AdapterResult,
  type GatewayRequest,
  type ProviderAdapter,
} from './types';
import type { UsageLog } from './usage';

export interface GatewayDeps {
  readonly config: () => PlatformConfig;
  readonly adapters: Partial<Record<ProviderAdapter['kind'], ProviderAdapter>>;
  readonly ledger: (userId: string) => CreditLedger;
  readonly usageLog: UsageLog;
  /** Counts the checks need (exports, storage, projects...). */
  readonly limits: (
    userId: string,
  ) => Omit<LimitUsage, 'callsLastMinute' | 'creditsToday'>;
  readonly now?: () => number;
}
export interface RunInput {
  readonly userId: string;
  readonly plan: Plan;
  readonly role: string;
  readonly modelId: string;
  readonly request: GatewayRequest;
  /** Credits of the work besides the model (the cost table). */
  readonly workCredits?: number;
  /** The most this run may cost: reserved before the call. */
  readonly maxCredits: number;
  readonly key: string;
  readonly toolId?: string;
  readonly requires?: readonly string[];
  readonly action?: LimitedAction;
  readonly videoCredits?: number;
  /** Checks the answer; returns an error sentence to refuse it. */
  readonly accept?: (r: AdapterResult) => string | null;
}
export interface RunResult {
  readonly result: AdapterResult;
  readonly credits: number;
  readonly reservationId: string;
}

export function createGateway(d: GatewayDeps) {
  const now = d.now ?? (() => Date.now());
  const counts = (userId: string): LimitUsage => {
    const t = now();
    const rows = d.usageLog.list(userId);
    const day = new Date(t);
    day.setUTCHours(0, 0, 0, 0);
    return {
      ...d.limits(userId),
      callsLastMinute: rows.filter((r) => Date.parse(r.at) > t - 60_000).length,
      creditsToday: d.ledger(userId).usedSince(day.toISOString()),
    };
  };
  const log = (
    x: RunInput,
    started: number,
    outcome: 'ok' | 'failed' | 'refused',
    credits: number,
    code?: string,
  ) =>
    d.usageLog.append({
      id: `${x.key}:${outcome}`,
      at: new Date(now()).toISOString(),
      userId: x.userId,
      modelId: x.modelId,
      role: x.role,
      credits,
      ms: Math.max(0, now() - started),
      outcome,
      ...(code ? { code } : {}),
    });

  async function run(x: RunInput): Promise<RunResult> {
    const c = d.config();
    const started = now();
    const ledger = d.ledger(x.userId);
    try {
      preCheck({
        config: c,
        plan: x.plan,
        modelId: x.modelId,
        ...(x.toolId ? { toolId: x.toolId } : {}),
        ...(x.requires ? { requires: x.requires } : {}),
        ...(x.action ? { action: x.action } : {}),
        ...(x.videoCredits !== undefined
          ? { videoCredits: x.videoCredits }
          : {}),
        maxCredits: x.maxCredits,
        usage: counts(x.userId),
      });
    } catch (e) {
      log(x, started, 'refused', 0, (e as GatewayError).code);
      throw e;
    }
    const model = modelById(c, x.modelId)!;
    if (!model.roles.includes(x.role)) {
      log(x, started, 'refused', 0, 'model-unknown');
      throw new GatewayError('model-unknown', 'That model cannot do this job.');
    }
    const provider = providerById(c, model.providerId)!;
    const adapter = d.adapters[provider.kind];
    let res;
    try {
      res = ledger.reserve(x.maxCredits, `${x.key}:reserve`, x.role);
    } catch (e) {
      log(x, started, 'refused', 0, (e as GatewayError).code);
      throw e;
    }
    try {
      if (!adapter)
        throw new GatewayError(
          'not-connected',
          `${provider.name} is not connected.`,
        );
      const result = await adapter.call(x.request, { model, provider });
      const problem = x.accept?.(result) ?? null;
      if (problem) throw new GatewayError('bad-output', problem);
      const credits = Math.min(
        x.maxCredits,
        (x.workCredits ?? 0) + creditsOf(c, model, result.usage),
      );
      ledger.settle(res.id, credits, `${x.key}:settle`);
      log(x, started, 'ok', credits);
      return { result, credits, reservationId: res.id };
    } catch (e) {
      ledger.refund(res.id, `${x.key}:refund`);
      const code = e instanceof GatewayError ? e.code : 'provider-error';
      log(x, started, 'failed', 0, code);
      throw e instanceof GatewayError
        ? e
        : new GatewayError(
            'provider-error',
            'The model service had a problem.',
          );
    }
  }
  /**
   * A job: several calls under one reservation (a whole video). Checks run
   * once for the model and every tool, the maximum is reserved, each call is
   * logged, and the end settles at what was used or refunds everything.
   */
  function startJob(x: JobInput): Job {
    const c = d.config();
    const ledger = d.ledger(x.userId);
    const started = now();
    const base = {
      userId: x.userId,
      plan: x.plan,
      role: x.role,
      modelId: x.modelId,
      request: { messages: [] },
      maxCredits: x.maxCredits,
      key: x.key,
    } satisfies RunInput;
    try {
      const use = counts(x.userId);
      preCheck({
        config: c,
        plan: x.plan,
        modelId: x.modelId,
        maxCredits: x.maxCredits,
        ...(x.videoCredits !== undefined
          ? { videoCredits: x.videoCredits }
          : {}),
        usage: use,
      });
      for (const tool of x.tools ?? [])
        preCheck({
          config: c,
          plan: x.plan,
          toolId: tool.id,
          maxCredits: tool.maxCredits,
          usage: { ...use, callsLastMinute: 0, creditsToday: 0 },
        });
    } catch (e) {
      log(base, started, 'refused', 0, (e as GatewayError).code);
      throw e;
    }
    let res: ReturnType<CreditLedger['reserve']>;
    try {
      res = ledger.reserve(x.maxCredits, `${x.key}:reserve`, x.role);
    } catch (e) {
      log(base, started, 'refused', 0, (e as GatewayError).code);
      throw e;
    }
    let modelCredits = 0;
    let calls = 0;
    let closed = false;
    return {
      reservationId: res.id,
      reserved: res.amount,
      async call(role, modelId, request, accept) {
        if (closed) throw new Error('The job is closed.');
        const t0 = now();
        const n = ++calls;
        const model = modelById(c, modelId);
        const provider = model && providerById(c, model.providerId);
        const row = { ...base, role, modelId, key: `${x.key}:${n}` };
        try {
          if (!model || !provider || !model.roles.includes(role))
            throw new GatewayError(
              'model-unknown',
              'That model cannot do this job.',
            );
          const adapter = d.adapters[provider.kind];
          if (!adapter)
            throw new GatewayError(
              'not-connected',
              `${provider.name} is not connected.`,
            );
          const result = await adapter.call(request, { model, provider });
          const problem = accept?.(result) ?? null;
          if (problem) throw new GatewayError('bad-output', problem);
          const credits = creditsOf(c, model, result.usage);
          modelCredits += credits;
          log(row, t0, 'ok', credits);
          return result;
        } catch (e) {
          const code = e instanceof GatewayError ? e.code : 'provider-error';
          log(row, t0, 'failed', 0, code);
          throw e instanceof GatewayError
            ? e
            : new GatewayError(
                'provider-error',
                'The model service had a problem.',
              );
        }
      },
      finish(workCredits) {
        closed = true;
        const used = Math.min(res.amount, workCredits + modelCredits);
        ledger.settle(res.id, used, `${x.key}:settle`);
        return used;
      },
      fail() {
        closed = true;
        ledger.refund(res.id, `${x.key}:refund`);
      },
    };
  }
  return { run, counts, startJob };
}
export interface JobInput {
  readonly userId: string;
  readonly plan: Plan;
  readonly role: string;
  readonly modelId: string;
  readonly maxCredits: number;
  readonly key: string;
  readonly videoCredits?: number;
  /** Every tool the job will use, with its most credits per run. */
  readonly tools?: readonly { id: string; maxCredits: number }[];
}
export interface Job {
  readonly reservationId: string;
  readonly reserved: number;
  call(
    role: string,
    modelId: string,
    request: GatewayRequest,
    accept?: (r: AdapterResult) => string | null,
  ): Promise<AdapterResult>;
  /** Settles at work + model credits (never above the hold); returns them. */
  finish(workCredits: number): number;
  /** Gives the whole hold back. */
  fail(): void;
}
export type Gateway = ReturnType<typeof createGateway>;
