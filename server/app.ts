// P3-ENGINE:begin
import { z } from 'zod';
import { createEntitlementService, type EntitlementDeps } from './entitlements';
import { createPaymentGateways, type PaymentOptions } from './payments';
import { createPaymentRoutes, rawBody, writeReply } from './payments/routes';
import { PaymentAwarePeople } from './payments/people';
import { createAdminRoutes, ownsAdminPath } from './admin/routes';
import type { P3AdminSettings } from '../src/contracts/p3';
// P3-ENGINE:end
// P2-R2 (P2B-01, P2B-04, P2B-36): the gateway's HTTP API. JSON in and out,
// versioned under /v1. Every call but the public config needs a signed-in
// person; every rule of src/gateway runs here, on the server.
import { createHash, randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import {
  createGateway,
  estimateDirector,
  estimateStudio,
  GatewayError,
  preCheck,
  type GatewayRequest,
  type Job,
  type LimitedAction,
} from '../src/gateway';
import {
  defaultModelFor,
  modelAvailability,
  modelById,
  planFor,
  providerById,
  studioById,
  workspaceRules,
  type PlatformConfig,
} from '../src/platform-config';
import { mockPayment } from '../src/payments';
import { AuthError, signLocalToken, type Caller } from './auth';
import { providerConnected, serverAdapters, type Env } from './adapters';
import { storeConfig } from './config';
import { People } from './state';
import type { Profile, Store } from './store';
// P3-WIRING:begin
import { p3KeyRoutes, p3ReadBody, p3Setup } from './keys/mount';
// P3-WIRING:end

export const API_VERSION = 'v1';
const MAX_BODY = 256 * 1024;
// P3-INTEGRATION: a model request that carries pictures (vision) may be larger,
// but only for a signed-in person (checked before the body is read).
const MAX_RUN_BODY = 12 * 1024 * 1024;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const bad = (message = 'The request is not valid.') =>
  new HttpError(400, 'bad-request', message);

export interface ServerOptions {
  // P3-ENGINE:begin
  /** Trusted admin/config services; absence keeps the P3 endpoint unavailable. */
  readonly p3Entitlements?: Omit<
    EntitlementDeps,
    'store' | 'config' | 'secret' | 'now'
  >;
  readonly p3Settings?: () => P3AdminSettings;
  readonly paymentOptions?: Omit<
    PaymentOptions,
    'fetch' | 'now' | 'replayWindowSeconds'
  >;
  // P3-ENGINE:end
  readonly store: Store;
  readonly env: Env;
  readonly authenticate: (header: string | undefined) => Promise<Caller>;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly log?: (line: string) => void;
  /** Adapter tuning for tests (fast retries, polling). */
  readonly adapterOptions?: {
    timeoutMs?: number;
    retries?: number;
    sleep?: (ms: number) => Promise<void>;
    pollMs?: number;
  };
}

const STATUS: Record<string, number> = {
  shortage: 402,
  'not-connected': 503,
  'provider-error': 502,
  'bad-output': 502,
  timeout: 504,
  'rate-limited': 503,
  'rate-limit': 429,
  'model-unknown': 400,
  'tool-unknown': 403,
};
const statusOf = (code: string) => STATUS[code] ?? 403;
const month = (t: number) => new Date(t).toISOString().slice(0, 7);

/** Numbers from a request: finite, within range, else a plain 400. */
const n = (v: unknown, min: number, max: number, int = true): number => {
  if (
    typeof v !== 'number' ||
    !Number.isFinite(v) ||
    v < min ||
    v > max ||
    (int && !Number.isInteger(v))
  )
    throw bad('A number in the request is out of range.');
  return v;
};
const str = (v: unknown, max = 200): string => {
  if (typeof v !== 'string' || !v.length || v.length > max)
    throw bad('A text field in the request is missing or too long.');
  return v;
};
const ID = /^[A-Za-z0-9._:-]{1,120}$/;
const key = (v: unknown) => {
  const k = str(v, 120);
  if (!ID.test(k)) throw bad('The request key is not valid.');
  return k;
};

/** The settings a browser may see: no provider address, no secret name. */
export function publicConfig(c: PlatformConfig): PlatformConfig {
  return {
    ...c,
    providers: c.providers.map(({ baseUrl: _baseUrl, ...p }) => ({
      ...p,
      keyRef: 'SERVER_SECRET',
    })),
  };
}

export function createServerApp(o: ServerOptions) {
  const now = o.now ?? (() => Date.now());
  const log = o.log ?? (() => {});
  const cfg = storeConfig(o.store, now);
  // P3-ENGINE:begin
  const people = o.p3Settings
    ? new PaymentAwarePeople(o.store, now)
    : new People(o.store, now);
  const p3Payments = o.p3Settings
    ? createPaymentRoutes(
        {
          store: o.store,
          config: async () => (await cfg.get()).config,
          settings: o.p3Settings,
          gateways: createPaymentGateways(o.env, {
            ...o.paymentOptions,
            ...(o.fetch ? { fetch: o.fetch } : {}),
            now,
            replayWindowSeconds: () =>
              o.p3Settings!().webhookReplayWindowSeconds,
          }),
          returnOrigins: (o.env.SERVER_ORIGINS ?? '')
            .split(',')
            .filter(Boolean),
          now,
        },
        o.fetch,
      )
    : null;
  const p3Admin = p3Payments
    ? createAdminRoutes({
        store: o.store,
        config: async () => (await cfg.get()).config,
        payments: p3Payments.service,
        now,
      })
    : null;
  // P3-ENGINE:end
  const limits = new Map<
    string,
    {
      exportsThisMonth: number;
      storageMb: number;
      voiceClones: number;
      projects: number;
    }
  >();
  // P3-INTEGRATION: one entitlement service for the signed read and the check.
  const entitlementService = () =>
    createEntitlementService({
      settings: o.p3Settings ?? o.p3Entitlements!.settings,
      userState: async (userId) => ({
        flags: await o.store.flags(userId),
        suspended: (await o.store.profile(userId))?.suspended ?? false,
      }),
      emergency: () => o.store.emergency(),
      ...o.p3Entitlements,
      store: o.store,
      config: async () => (await cfg.get()).config,
      secret: () => o.env.ENTITLEMENT_SECRET,
      now,
    });
  // P3-WIRING:begin
  // P3-INTEGRATION: vault changes go to Part 1's chained audit log.
  const p3 = p3Setup(
    o,
    () => cfg.current().config,
    log,
    async (row) => {
      log(
        `audit ${row.action} ${row.target} by ${row.actor.slice(0, 8)} ${JSON.stringify(row.detail)}`,
      );
      await o.store.appendAudit(row);
    },
  );
  o = p3.options;
  // P3-WIRING:end
  const gateway = createGateway({
    config: () => cfg.current().config,
    adapters: serverAdapters({
      env: o.env,
      ...(o.fetch ? { fetch: o.fetch } : {}),
      ...(o.adapterOptions ?? {}),
    }),
    ledger: (u) => people.ledgerNow(u),
    usageLog: people.usageLog(),
    limits: (u) =>
      limits.get(u) ?? {
        exportsThisMonth: 0,
        storageMb: 0,
        voiceClones: 0,
        projects: 0,
      },
    now,
  });
  const jobs = new Map<
    string,
    { userId: string; job: Job; at: number; tools: string[] }
  >();
  const ipHits = new Map<string, { at: number; n: number }>();
  const ipPerMinute = Number(o.env.SERVER_IP_PER_MINUTE ?? 600) || 600;
  // P4 security: sign-in failures per address are limited more tightly, and
  // behind a proxy the real address is read from X-Forwarded-For (only when
  // the owner says the proxy is trusted).
  const badAuth = new Map<string, { at: number; n: number }>();
  const badAuthPerMinute = Number(o.env.SERVER_BAD_AUTH_PER_MINUTE ?? 30) || 30;
  const trustProxy = o.env.TRUST_PROXY === '1';
  const clientIp = (req: IncomingMessage) => {
    const forwarded = trustProxy
      ? String(req.headers['x-forwarded-for'] ?? '')
          .split(',')
          .at(-1)
          ?.trim()
      : '';
    return (forwarded || (req.socket.remoteAddress ?? '?')).replace(
      /^::ffff:/,
      '',
    );
  };
  /** Counts a hit in a one-minute window; old windows are dropped so the maps stay small. */
  const hitWindow = (
    map: Map<string, { at: number; n: number }>,
    id: string,
    max: number,
  ) => {
    const t = now();
    if (map.size > 5000)
      for (const [k, v] of map) if (t - v.at > 60_000) map.delete(k);
    const hit = map.get(id);
    if (!hit || t - hit.at > 60_000) {
      map.set(id, { at: t, n: 1 });
      return false;
    }
    return ++hit.n > max;
  };
  const origins = new Set(
    (
      o.env.SERVER_ORIGINS ??
      'http://127.0.0.1:4173,http://localhost:4173,http://127.0.0.1:5173,http://localhost:5173'
    )
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  );

  const connected = (c: PlatformConfig, modelId: string) => {
    const m = modelById(c, modelId);
    const p = m && providerById(c, m.providerId);
    return !!p && providerConnected(p, o.env);
  };
  const requireConnected = (c: PlatformConfig, modelId: string) => {
    if (!connected(c, modelId)) {
      const m = modelById(c, modelId);
      const p = m && providerById(c, m.providerId);
      throw new GatewayError(
        'not-connected',
        `${p?.name ?? 'That model'} is not connected yet.`,
      );
    }
  };

  async function profileOf(
    c: Caller,
    config: PlatformConfig,
  ): Promise<Profile> {
    let p = await o.store.profile(c.userId);
    if (!p) {
      p = {
        id: c.userId,
        email: c.email,
        plan: planFor(config, undefined).id,
        locale: config.brand.defaultLocale,
        brandKit: {},
        createdAt: new Date(now()).toISOString(),
      };
      await o.store.saveProfile(p);
    }
    // This month's plan credits, once per plan and month (P2B-11).
    const plan = planFor(config, p.plan);
    if (plan.monthlyCredits > 0)
      await people.withLedger(c.userId, (l) =>
        l.grant(
          plan.monthlyCredits,
          `grant:${plan.id}:${month(now())}`,
          `${plan.id} ${month(now())}`,
        ),
      );
    return p;
  }
  const locales = new Map<string, 'en' | 'hi'>();
  async function prepare(c: Caller) {
    const { config } = await cfg.get();
    const profile = await profileOf(c, config);
    await people.ready(c.userId);
    limits.set(c.userId, {
      exportsThisMonth: await o.store.exportsCount(c.userId, month(now())),
      storageMb: await o.store.counter(c.userId, 'storageMb'),
      voiceClones: await o.store.counter(c.userId, 'voiceClones'),
      projects: await o.store.counter(c.userId, 'projects'),
    });
    locales.set(c.userId, profile.locale);
    return { config, profile, plan: planFor(config, profile.plan) };
  }
  const localeOf = (u: string) => locales.get(u) ?? 'en';
  const sweep = async () => {
    for (const [id, j] of jobs)
      if (now() - j.at > 30 * 60_000) {
        jobs.delete(id);
        await people
          .withLedger(j.userId, () => j.job.fail())
          .catch(() => undefined);
      }
  };

  async function readBody(
    req: IncomingMessage,
    limit = MAX_BODY,
  ): Promise<Record<string, unknown>> {
    // P3-WIRING:begin
    if (req.method === 'PUT' || req.method === 'DELETE')
      return p3ReadBody(req, MAX_BODY, () =>
        bad('The request is not valid JSON.'),
      );
    // P3-WIRING:end
    if (req.method !== 'POST') return {};
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > limit)
        throw new HttpError(413, 'too-large', 'The request is too large.');
      chunks.push(chunk as Buffer);
    }
    if (!size) return {};
    try {
      const v = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
      return v as Record<string, unknown>;
    } catch {
      throw bad('The request is not valid JSON.');
    }
  }

  type Handler = (b: Record<string, unknown>, c: Caller) => Promise<unknown>;
  const routes: Record<string, Handler> = {
    'GET /v1/me': async (_b, c) => {
      const { profile, plan } = await prepare(c);
      const l = people.ledgerNow(c.userId);
      return {
        userId: c.userId,
        email: c.email,
        plan: plan.id,
        locale: profile.locale,
        balance: l.balance(),
        held: l.held(),
      };
    },
    'GET /v1/balance': async (_b, c) => {
      await prepare(c);
      const l = people.ledgerNow(c.userId);
      return { balance: l.balance(), held: l.held() };
    },
    'GET /v1/ledger': async (_b, c) => {
      await prepare(c);
      return { rows: [...people.ledgerNow(c.userId).history()].slice(-500) };
    },
    'GET /v1/usage': async (_b, c) => {
      const { plan } = await prepare(c);
      return {
        ...gateway.counts(c.userId),
        limits: plan.limits,
        plan: plan.id,
      };
    },
    'GET /v1/models': async (_b, c) => {
      const { config, plan } = await prepare(c);
      return {
        models: config.models
          .filter((m) => modelAvailability(config, plan, m.id).ok)
          .map((m) => ({
            id: m.id,
            name: m.name,
            kind: m.kind,
            tier: m.tier,
            roles: m.roles,
            recommended: m.recommendedForDirector,
            // P4: the roles the owner chose this model as the main one for.
            mainFor: Object.entries(config.assignments)
              .filter(([, id]) => id === m.id)
              .map(([role]) => role),
            connected: connected(config, m.id),
            tested: m.tested,
            // P3-INTEGRATION: a client prefers a real model to the offline one.
            mock: providerById(config, m.providerId)?.kind === 'mock',
          })),
      };
    },
    'POST /v1/estimate': async (b, c) => {
      const { config } = await prepare(c);
      const model = modelById(config, str(b.modelId, 60));
      if (!model)
        throw new GatewayError('model-unknown', 'That model does not exist.');
      if (b.kind === 'studio') {
        const s = studioById(config, str(b.studioId, 60));
        if (!s) throw bad('That tool does not exist.');
        return estimateStudio(
          config,
          s,
          model,
          (b.answers ?? {}) as Record<string, unknown>,
        );
      }
      const methods = Array.isArray(b.methods)
        ? b.methods.map((m) => str(m, 60))
        : [];
      if (!methods.length || methods.length > 40)
        throw bad('A plan needs 1 to 40 scenes.');
      return estimateDirector(config, model, {
        briefChars: n(b.briefChars, 0, 200_000),
        methods,
      });
    },
    'POST /v1/reserve': async (b, c) => {
      const { config, plan } = await prepare(c);
      await sweep();
      const modelId = str(b.modelId, 60);
      requireConnected(config, modelId);
      const tools = Array.isArray(b.tools)
        ? b.tools.map((t) => {
            const x = t as { id?: unknown; maxCredits?: unknown };
            return {
              id: str(x.id, 60),
              maxCredits: n(x.maxCredits, 0, 1_000_000),
            };
          })
        : [];
      const k = key(b.key);
      const job = await people.withLedger(c.userId, () =>
        gateway.startJob({
          userId: c.userId,
          plan,
          role: str(b.role, 60),
          modelId,
          maxCredits: n(b.maxCredits, 1, 1_000_000),
          ...(b.videoCredits !== undefined
            ? { videoCredits: n(b.videoCredits, 0, 1_000_000) }
            : {}),
          key: `${c.userId}:${k}`,
          tools,
        }),
      );
      const known = jobs.get(job.reservationId);
      if (!known)
        jobs.set(job.reservationId, {
          userId: c.userId,
          job,
          at: now(),
          tools: tools.map((t) => t.id),
        });
      await people.flushUsage(c.userId);
      return { jobId: job.reservationId, reserved: job.reserved };
    },
    'POST /v1/call': async (b, c) => {
      const { config, plan } = await prepare(c);
      const j = jobs.get(str(b.jobId, 120));
      if (!j || j.userId !== c.userId)
        throw new HttpError(404, 'no-job', 'That build is not open any more.');
      const modelId = str(b.modelId, 60);
      requireConnected(config, modelId);
      if (!modelAvailability(config, plan, modelId).ok)
        throw new GatewayError(
          'model-plan',
          'Your plan does not include that model.',
        );
      try {
        const r = await j.job.call(
          str(b.role, 60),
          modelId,
          request(b.request),
        );
        return { result: r };
      } finally {
        await people.flushUsage(c.userId);
      }
    },
    'POST /v1/settle': async (b, c) => {
      await prepare(c);
      const id = str(b.jobId, 120);
      const j = jobs.get(id);
      if (!j || j.userId !== c.userId)
        throw new HttpError(404, 'no-job', 'That build is not open any more.');
      jobs.delete(id);
      if (b.fail === true) {
        await people.withLedger(c.userId, () => j.job.fail());
        return { credits: 0, refunded: j.job.reserved };
      }
      const used = await people.withLedger(c.userId, () =>
        j.job.finish(n(b.workCredits, 0, 1_000_000)),
      );
      return { credits: used, refunded: j.job.reserved - used };
    },
    'POST /v1/run': async (b, c) => {
      const { config, plan } = await prepare(c);
      const modelId = str(b.modelId, 60);
      requireConnected(config, modelId);
      const action =
        b.action === undefined
          ? undefined
          : (str(b.action, 20) as LimitedAction);
      const k = key(b.key);
      const maxCredits = n(b.maxCredits, 1, 1_000_000);
      // Reserve under the lock; the provider call runs outside it.
      const job = await people.withLedger(c.userId, () => {
        preCheck({
          locale: localeOf(c.userId),
          config,
          plan,
          modelId,
          ...(b.toolId ? { toolId: str(b.toolId, 60) } : {}),
          ...(Array.isArray(b.requires)
            ? { requires: b.requires.map((x) => str(x, 60)) }
            : {}),
          ...(action ? { action } : {}),
          ...(b.addMb !== undefined
            ? { addMb: n(b.addMb, 0, 1_000_000, false) }
            : {}),
          maxCredits,
          usage: gateway.counts(c.userId),
        });
        return gateway.startJob({
          userId: c.userId,
          plan,
          role: str(b.role, 60),
          modelId,
          maxCredits,
          key: `${c.userId}:${k}`,
        });
      });
      try {
        const result = await job.call(
          str(b.role, 60),
          modelId,
          request(b.request),
        );
        const credits = await people.withLedger(c.userId, () =>
          job.finish(n(b.workCredits ?? 0, 0, 1_000_000)),
        );
        if (action === 'voice-clone')
          await o.store.setCounter(
            c.userId,
            'voiceClones',
            (await o.store.counter(c.userId, 'voiceClones')) + 1,
          );
        return { result, credits };
      } catch (e) {
        await people.withLedger(c.userId, () => job.fail());
        throw e;
      } finally {
        await people.flushUsage(c.userId);
      }
    },
    'POST /v1/limits/check': async (b, c) => {
      const { config, plan } = await prepare(c);
      const action = str(b.action, 20) as LimitedAction;
      if (!['export', 'store', 'voice-clone', 'project'].includes(action))
        throw bad('Unknown limit.');
      preCheck({
        locale: localeOf(c.userId),
        config,
        plan,
        action,
        ...(b.addMb !== undefined
          ? { addMb: n(b.addMb, 0, 1_000_000, false) }
          : {}),
        maxCredits: 0,
        usage: {
          ...gateway.counts(c.userId),
          callsLastMinute: 0,
          creditsToday: 0,
        },
      });
      return { ok: true };
    },
    'POST /v1/exports': async (b, c) => {
      const { config, plan } = await prepare(c);
      const kind = str(b.kind, 20);
      preCheck({
        locale: localeOf(c.userId),
        config,
        plan,
        action: 'export',
        maxCredits: 0,
        usage: {
          ...gateway.counts(c.userId),
          callsLastMinute: 0,
          creditsToday: 0,
        },
      });
      return { count: await o.store.addExport(c.userId, month(now()), kind) };
    },
    'POST /v1/usage/report': async (b, c) => {
      await prepare(c);
      // P4 security: where the server can measure what a person stores (the
      // database), the browser's numbers are ignored: it cannot hide usage.
      if (o.store.measureUsage) {
        const m = await o.store.measureUsage(c.userId);
        await o.store.setCounter(c.userId, 'projects', m.projects);
        await o.store.setCounter(c.userId, 'storageMb', m.storageMb);
        return { ok: true };
      }
      if (b.projects !== undefined)
        await o.store.setCounter(
          c.userId,
          'projects',
          n(b.projects, 0, 100_000),
        );
      if (b.storageMb !== undefined)
        await o.store.setCounter(
          c.userId,
          'storageMb',
          n(b.storageMb, 0, 10_000_000, false),
        );
      return { ok: true };
    },
    // P4: "Save to your styles" costs what the owner set (Admin › Projects &
    // Styles). The price and the plan check are the server's; the browser's
    // `credits` is ignored. The same key never charges twice.
    'POST /v1/workspace/style-fee': async (b, c) => {
      const { config, plan } = await prepare(c);
      const rules = workspaceRules(config, plan.id);
      if (!rules.styleAllowed)
        throw new GatewayError('model-plan', 'Your plan cannot save Styles.');
      const k = key(b.key);
      const fee = rules.styleCredits;
      if (fee > 0)
        await people.withLedger(c.userId, (l) => {
          const r = l.reserve(fee, `style-fee:${k}`, 'Save to your styles');
          l.settle(r.id, fee, `style-fee:${k}:settle`);
        });
      return { charged: fee, balance: people.ledgerNow(c.userId).balance() };
    },
    'POST /v1/plan': async (b, c) => {
      // P4 security: the offline test payment never runs on a live server.
      if (o.env.AUTH_MODE === 'supabase')
        throw new HttpError(
          403,
          'hosted-checkout',
          'Use hosted checkout to change a paid plan or buy credits.',
        );
      const { config, profile } = await prepare(c);
      const target = config.plans.find(
        (p) => p.id === str(b.plan, 60) && p.public,
      );
      if (!target) throw bad('That plan does not exist.');
      const pay = config.payments.find((p) => p.enabled && p.kind === 'mock');
      if (!pay)
        throw new GatewayError(
          'not-connected',
          'No payment method is switched on.',
        );
      const r = await mockPayment(pay).pay({
        credits: target.monthlyCredits || 1,
        amount: target.price.inr,
        currency: 'INR',
        key: key(b.paymentKey),
      });
      if (!r.ok) throw new HttpError(402, 'payment', r.message);
      await o.store.saveProfile({ ...profile, plan: target.id });
      await prepare(c);
      return { plan: target.id, balance: people.ledgerNow(c.userId).balance() };
    },
    'POST /v1/topup': async (b, c) => {
      if (o.env.AUTH_MODE === 'supabase')
        throw new HttpError(
          403,
          'hosted-checkout',
          'Use hosted checkout to change a paid plan or buy credits.',
        );
      const { config } = await prepare(c);
      const pack = config.topUps.find((t) => t.id === str(b.packId, 60));
      if (!pack) throw bad('That credit pack does not exist.');
      const cur = b.currency === 'USD' ? 'USD' : 'INR';
      const pay = config.payments.find(
        (p) => p.enabled && p.kind === 'mock' && p.currencies.includes(cur),
      );
      if (!pay)
        throw new GatewayError(
          'not-connected',
          'No payment method is switched on.',
        );
      const r = await mockPayment(pay).pay({
        credits: pack.credits,
        amount: cur === 'INR' ? pack.price.inr : pack.price.usd,
        currency: cur,
        key: key(b.paymentKey),
      });
      if (!r.ok) throw new HttpError(402, 'payment', r.message);
      const balance = await people.withLedger(c.userId, (l) => {
        l.grant(
          pack.credits,
          `topup:${c.userId}:${r.paymentId}`,
          `${pack.id} ${pay.id}`,
        );
        return l.balance();
      });
      return { balance };
    },
    'POST /v1/config': async (b, c) => {
      if (!c.admin)
        throw new HttpError(
          403,
          'admin',
          'Only the owner can change the settings.',
        );
      const v = await cfg
        .save(
          b.config,
          typeof b.note === 'string' ? b.note : '',
          b.publish === true,
        )
        .catch((e: Error) => {
          throw bad(e.message);
        });
      // P3-INTEGRATION: an owner's settings change is in the audit chain.
      await o.store.appendAudit({
        at: new Date(now()).toISOString(),
        actor: c.userId,
        action: 'config.save',
        target: `config:${v.version}`,
        detail: {
          reason: (typeof b.note === 'string' ? b.note : '').slice(0, 300),
          published: b.publish === true,
        },
      });
      return { version: v.version };
    },
    'POST /v1/config/publish': async (b, c) => {
      if (!c.admin)
        throw new HttpError(
          403,
          'admin',
          'Only the owner can change the settings.',
        );
      const live = await cfg.publish(n(b.version, 0, 1_000_000));
      await o.store.appendAudit({
        at: new Date(now()).toISOString(),
        actor: c.userId,
        action: 'config.publish',
        target: `config:${live.version}`,
        detail: {},
      });
      return { version: live.version };
    },
  };

  // P3-WIRING:begin
  Object.assign(routes, p3KeyRoutes(p3.vault, HttpError));
  // P3-WIRING:end

  function request(v: unknown): GatewayRequest {
    if (!v || typeof v !== 'object') throw bad('The model request is missing.');
    const r = v as Record<string, unknown>;
    const messages = Array.isArray(r.messages) ? r.messages : [];
    if (messages.length > 50) throw bad('Too many messages.');
    return {
      ...(typeof r.system === 'string'
        ? { system: r.system.slice(0, 60_000) }
        : {}),
      messages: messages.map((m) => {
        const x = m as { role?: unknown; content?: unknown };
        return {
          role: x.role === 'assistant' ? 'assistant' : 'user',
          content: str(x.content, 120_000),
        };
      }),
      ...(r.json === true ? { json: true } : {}),
      ...(r.maxOutputTokens !== undefined
        ? { maxOutputTokens: n(r.maxOutputTokens, 1, 64_000) }
        : {}),
      ...(r.units !== undefined ? { units: n(r.units, 0, 10_000, false) } : {}),
      ...(typeof r.prompt === 'string'
        ? { prompt: r.prompt.slice(0, 20_000) }
        : {}),
      // P3-INTEGRATION:begin
      ...p3Extras(r),
      // P3-INTEGRATION:end
    };
  }
  // P3-INTEGRATION:begin
  /** Pictures (vision) and a Studio form's provider parameters (Part 2). */
  function p3Extras(r: Record<string, unknown>) {
    let out: Record<string, unknown> = {};
    if (r.images !== undefined) {
      if (!Array.isArray(r.images) || r.images.length > 8)
        throw bad('At most 8 pictures can be sent.');
      const images = r.images.map((i) => {
        const x = (i ?? {}) as { mime?: unknown; base64?: unknown };
        if (
          typeof x.mime !== 'string' ||
          !/^image\/(png|jpeg|webp|gif)$/.test(x.mime) ||
          typeof x.base64 !== 'string' ||
          x.base64.length > 7 * 1024 * 1024 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(x.base64)
        )
          throw bad('A picture is not valid (PNG, JPEG, WebP or GIF).');
        return { mime: x.mime, base64: x.base64 };
      });
      if (images.length) out = { ...out, images };
    }
    if (r.params !== undefined) {
      const ps = r.params as Record<string, unknown>;
      const keys = Object.keys(ps ?? {});
      if (
        !ps ||
        typeof ps !== 'object' ||
        Array.isArray(ps) ||
        keys.length > 40
      )
        throw bad('The settings are not valid.');
      const params: Record<string, string | number | boolean> = {};
      for (const k of keys) {
        const v = ps[k];
        if (
          !/^[A-Za-z][A-Za-z0-9_.-]{0,59}$/.test(k) ||
          !(
            typeof v === 'boolean' ||
            (typeof v === 'number' && Number.isFinite(v)) ||
            (typeof v === 'string' && v.length <= 2000)
          )
        )
          throw bad('The settings are not valid.');
        params[k] = v;
      }
      if (keys.length) out = { ...out, params };
    }
    return out;
  }
  // P3-INTEGRATION:end

  const headers = (res: ServerResponse, origin: string | undefined) => {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader(
      'content-security-policy',
      "default-src 'none'; frame-ancestors 'none'",
    );
    res.setHeader('cross-origin-resource-policy', 'same-site');
    if (o.env.SERVER_HTTPS === '1')
      res.setHeader('strict-transport-security', 'max-age=31536000');
    if (origin && origins.has(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'Origin');
      res.setHeader(
        'access-control-allow-headers',
        'authorization, content-type',
      );
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      // P3-WIRING:begin
      res.setHeader(
        'access-control-allow-methods',
        'GET, POST, PUT, DELETE, OPTIONS',
      );
      // P3-WIRING:end
      res.setHeader('access-control-max-age', '600');
    }
  };
  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.end(JSON.stringify(body));
  };

  async function handler(req: IncomingMessage, res: ServerResponse) {
    const started = now();
    const origin = req.headers.origin;
    headers(res, origin);
    const path = (req.url ?? '/').split('?')[0]!;
    let status = 200;
    let who = '-';
    try {
      if (req.method === 'OPTIONS') {
        status = origin && origins.has(origin) ? 204 : 403;
        res.statusCode = status;
        return void res.end();
      }
      if (origin && !origins.has(origin))
        throw new HttpError(403, 'origin', 'This site may not use the server.');
      const ip = clientIp(req);
      if (hitWindow(ipHits, ip, ipPerMinute))
        throw new HttpError(
          429,
          'rate-limit',
          'Too many requests. Wait a moment and try again.',
        );
      if (
        (badAuth.get(ip)?.n ?? 0) > badAuthPerMinute &&
        now() - badAuth.get(ip)!.at <= 60_000
      )
        throw new HttpError(
          429,
          'rate-limit',
          'Too many failed sign-ins. Wait a minute and try again.',
        );
      // P3-ENGINE:begin
      if (req.method === 'POST' && path.startsWith('/v1/payments/webhook/')) {
        if (!p3Payments)
          return send(res, 503, {
            error: {
              code: 'not-connected',
              message: 'Payments are not configured.',
            },
          });
        const headers = Object.fromEntries(
          Object.entries(req.headers).filter(
            (e): e is [string, string] => typeof e[1] === 'string',
          ),
        );
        const result = await p3Payments.webhook(
          path.slice('/v1/payments/webhook/'.length),
          await rawBody(req),
          headers,
        );
        return writeReply(res, result);
      }
      // P3-ENGINE:end
      // P3-INTEGRATION:begin
      if (req.method === 'POST' && path === '/v1/run')
        await o.authenticate(req.headers.authorization);
      // P3-INTEGRATION:end
      const body = await readBody(
        req,
        req.method === 'POST' && path === '/v1/run' ? MAX_RUN_BODY : MAX_BODY,
      );
      if (req.method === 'GET' && path === '/v1/health')
        return send(res, 200, { ok: true, api: API_VERSION });
      if (req.method === 'GET' && path === '/v1/config') {
        const live = await cfg.get();
        // P4 security: everyone may read the live settings, but a provider's
        // address and key name are for the owner only.
        let owner = false;
        if (req.headers.authorization)
          owner = await o
            .authenticate(req.headers.authorization)
            .then((c) => c.admin === true)
            .catch(() => false);
        return send(res, 200, {
          version: live.version,
          config: owner ? live.config : publicConfig(live.config),
        });
      }
      if (req.method === 'POST' && path === '/v1/local/token') {
        if (
          o.env.AUTH_MODE !== 'local' ||
          o.env.LOCAL_TOKENS !== '1' ||
          !o.env.LOCAL_AUTH_SECRET
        )
          throw new HttpError(404, 'not-found', 'Not found.');
        const email = str(body.email, 200).toLowerCase();
        const sub = createHash('sha256')
          .update(email)
          .digest('hex')
          .slice(0, 32);
        const id = `${sub.slice(0, 8)}-${sub.slice(8, 12)}-${sub.slice(12, 16)}-${sub.slice(16, 20)}-${sub.slice(20, 32)}`;
        return send(res, 200, {
          token: signLocalToken(
            o.env.LOCAL_AUTH_SECRET,
            { sub: id, email },
            Math.floor(now() / 1000),
          ),
        });
      }
      // P3-ENGINE:begin
      if (
        p3Payments &&
        req.method === 'POST' &&
        (path === '/v1/topup' || path === '/v1/plan')
      )
        return send(res, 403, {
          error: {
            code: 'hosted-checkout',
            message:
              'Use hosted checkout to change a paid plan or buy credits.',
          },
        });
      if (ownsAdminPath(path)) {
        const caller = await o.authenticate(req.headers.authorization);
        if (!p3Admin)
          return send(res, 503, {
            error: {
              code: 'not-connected',
              message: 'Admin services are not configured.',
            },
          });
        const result = await p3Admin(
          path,
          req.method ?? '',
          body,
          caller,
          new URL(req.url ?? '/', 'http://server.local').searchParams,
        );
        if (result) return writeReply(res, result);
      }
      if (path === '/v1/payments/checkout' || path === '/v1/payments/me') {
        const caller = await o.authenticate(req.headers.authorization);
        if (!p3Payments)
          return send(res, 503, {
            error: {
              code: 'not-connected',
              message: 'Payments are not configured.',
            },
          });
        const result = await p3Payments.authenticated(
          path,
          req.method ?? '',
          body,
          caller,
        );
        if (result) return writeReply(res, result);
      }
      if (req.method === 'GET' && path === '/v1/entitlements') {
        const caller = await o.authenticate(req.headers.authorization);
        who = caller.userId.slice(0, 8);
        if ((!o.p3Entitlements && !o.p3Settings) || !o.env.ENTITLEMENT_SECRET)
          throw new HttpError(
            503,
            'not-connected',
            'Entitlements are not configured.',
          );
        await prepare(caller); // a new person gets a profile first
        const service = entitlementService();
        return send(res, 200, await service.resolve(caller.userId));
      }
      // P3-INTEGRATION: the browser asks the server to decide a limit (the
      // ONLY place a limit is decided, EntitlementService.check).
      if (req.method === 'POST' && path === '/v1/entitlements/check') {
        const caller = await o.authenticate(req.headers.authorization);
        who = caller.userId.slice(0, 8);
        if ((!o.p3Entitlements && !o.p3Settings) || !o.env.ENTITLEMENT_SECRET)
          throw new HttpError(
            503,
            'not-connected',
            'Entitlements are not configured.',
          );
        const b = z
          .object({
            action: z.enum([
              'export',
              'store',
              'voice-clone',
              'project',
              'ai-call',
              'chat-message',
              'attach',
              'vision',
            ]),
            amount: z.number().finite().nonnegative().optional(),
          })
          .strict()
          .safeParse(body);
        if (!b.success)
          throw new HttpError(400, 'bad-request', 'That check is not valid.');
        await prepare(caller); // a new person gets a profile first
        return send(
          res,
          200,
          await entitlementService().check(
            caller.userId,
            b.data.action,
            b.data.amount,
          ),
        );
      }
      // P3-ENGINE:end
      const route = routes[`${req.method} ${path}`];
      if (!route) throw new HttpError(404, 'not-found', 'Not found.');
      const caller = await o.authenticate(req.headers.authorization);
      who = caller.userId.slice(0, 8);
      const out = await route(body, caller);
      return send(res, 200, out);
    } catch (e) {
      // P3-ENGINE:begin
      if (p3Admin && ownsAdminPath(path)) {
        await o.store
          .appendAudit({
            actor: 'unauthenticated',
            action: 'admin.refused',
            target: '',
            at: new Date(now()).toISOString(),
            detail: { code: e instanceof AuthError ? 'auth' : 'request' },
          })
          .catch(() => undefined);
      }
      // P3-ENGINE:end
      if (e instanceof AuthError)
        hitWindow(badAuth, clientIp(req), badAuthPerMinute);
      if (e instanceof HttpError) status = e.status;
      else if (e instanceof AuthError) status = 401;
      else if (e instanceof GatewayError) status = statusOf(e.code);
      else status = 500;
      const code =
        e instanceof HttpError
          ? e.code
          : e instanceof GatewayError
            ? e.code
            : e instanceof AuthError
              ? 'auth'
              : 'server';
      const message =
        status === 500
          ? 'The server had a problem. Try again.'
          : (e as Error).message;
      const detail = e instanceof GatewayError ? e.detail : {};
      if (status === 500)
        log(
          `error ${randomUUID().slice(0, 8)} ${(e as Error)?.name ?? 'Error'}`,
        );
      return send(res, status, { error: { code, message, detail } });
    } finally {
      log(
        `${req.method} ${path} ${res.statusCode || status} ${who} ${Math.round(now() - started)}ms`,
      );
    }
  }

  return { handler, config: cfg, defaultModelFor };
}

/** Starts the HTTP server on a port (0 picks a free one). */
export function listen(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  port: number,
  host = '127.0.0.1',
): Promise<Server> {
  const server = createServer((req, res) => void handler(req, res));
  // P4 security: a slow or stalled client cannot hold a connection open.
  server.headersTimeout = 15_000;
  server.requestTimeout = 60_000;
  server.keepAliveTimeout = 10_000;
  return new Promise((resolve) =>
    server.listen(port, host, () => resolve(server)),
  );
}
