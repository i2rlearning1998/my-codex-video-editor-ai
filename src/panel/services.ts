// Everything the panel talks to, behind interfaces: the Platform Config, the
// account backend (CloudBackend: local now, Supabase later), the gateway with
// its ledger and usage log, and this person's panel data.
import { localAccountBackend, indexedBlobStore } from '../cloud/local';
import {
  cloudConfig,
  type CloudBackend,
  type CloudUser,
} from '../cloud/backend';
import { createSupabaseBackend } from '../cloud/supabase';
import { paymentProviders } from '../payments';
import { gatewayBase, liveConfig } from './live-config';
import { remoteGateway, type PanelGateway, type RemoteGateway } from './remote';
import {
  CreditLedger,
  anthropicAdapter,
  createGateway,
  googleAdapter,
  mockAdapter,
  mockRespond,
  openaiAdapter,
  openaiCompatibleAdapter,
  storageLedgerStore,
  storageUsageLog,
  xaiAdapter,
  estimateDirector,
  type GatewayRequest,
  type MockFailure,
  type UsageLog,
  preCheck,
} from '../gateway';
import { EXPORTS_KEY, LIMITS_KEY } from '../usage-report';
import { planFor, type Plan, type PlatformConfig } from '../platform-config';
import { IdbBackend, ProjectLibrary } from '../persistence/projects';
import { claimLocalData } from '../auth-gate';
import type { Answers } from '../platform-config';

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface BrandKit {
  colors: string[];
  headingFont: string;
  bodyFont: string;
  logo: string;
}
export interface Prefs {
  plan: string;
  locale: 'en' | 'hi';
  theme: 'dark' | 'light';
  name: string;
  currency: 'INR' | 'USD';
  brandKit: BrandKit;
  drafts: Record<string, Answers>;
  model: string;
  trash: string[];
}
export interface Asset {
  id: string;
  userId: string;
  projectId: string;
  kind: 'text' | 'audio' | 'image' | 'video' | 'captions' | 'pack';
  name: string;
  studioId: string;
  text?: string;
  dataUrl?: string;
  bytes: number;
  createdAt: string;
}

export interface Services {
  readonly config: PlatformConfig;
  readonly configFallback: boolean;
  readonly account: CloudBackend & {
    lastResetCode?(email: string): string | null;
  };
  /** The in-browser mock gateway, or the server (VITE_GATEWAY_URL). */
  readonly gateway: PanelGateway;
  /** The server client when VITE_GATEWAY_URL is set, else null. */
  readonly remote: RemoteGateway | null;
  /** Reads plan, credits and usage again (the server's, when used). */
  sync(userId: string): Promise<void>;
  /** Test-mode plan switch (mock payment); real payments come with Admin. */
  switchPlan(userId: string, planId: string): Promise<void>;
  topUp(
    userId: string,
    packId: string,
    currency: 'INR' | 'USD',
  ): Promise<{ ok: true; credits: number } | { ok: false; message: string }>;
  /** Whether a model can be called now (the server knows which keys it has). */
  connected(modelId: string): boolean;
  /** The Plan card's numbers: the server's estimate when it is used. */
  estimate(
    modelId: string,
    methods: readonly string[],
    briefChars: number,
  ): Promise<ReturnType<typeof estimateDirector> | null>;
  /** P2B-26: null when the plan allows it, else the owner's sentence. */
  checkLimit(
    userId: string,
    action: 'export' | 'store' | 'voice-clone' | 'project',
    addMb?: number,
  ): Promise<string | null>;
  readonly usageLog: UsageLog;
  readonly projects: ProjectLibrary;
  ledger(userId: string): CreditLedger;
  prefs(userId: string): Prefs;
  savePrefs(userId: string, p: Prefs): void;
  planOf(userId: string): Plan;
  /** This month's plan credits, given once per plan and month. */
  monthlyGrant(userId: string): void;
  assets(userId: string): Asset[];
  saveAsset(a: Asset): void;
  now(): Date;
}

const DEFAULT_PREFS = (c: PlatformConfig): Prefs => ({
  plan: planFor(c, undefined).id,
  locale: c.brand.defaultLocale,
  theme: 'dark',
  name: '',
  currency: 'INR',
  brandKit: { colors: [], headingFont: '', bodyFont: '', logo: '' },
  drafts: {},
  model: '',
  trash: [],
});

export { gatewayBase } from './live-config';

export async function createServices(
  storage: KV,
  options: {
    mockFailure?: MockFailure | ((r: GatewayRequest) => MockFailure);
    latencyMs?: number;
  } = {},
): Promise<Services> {
  // P2B-14: the live config (server, else Supabase, else this browser).
  const gatewayUrl = gatewayBase();
  const cloud = cloudConfig();
  const live = await liveConfig(storage);
  const config = live.config;
  // P2B-12: Supabase accounts when its public settings exist, else local.
  const account = cloud
    ? createSupabaseBackend(cloud)
    : localAccountBackend({ storage, blobs: indexedBlobStore() });
  const usageLog = storageUsageLog(storage);
  const ledgers = new Map<string, CreditLedger>();
  const ledger = (u: string) => {
    if (!ledgers.has(u))
      ledgers.set(u, new CreditLedger(storageLedgerStore(storage, u)));
    return ledgers.get(u)!;
  };
  const prefsKey = (u: string) => `aive.panel.${u}`;
  const prefs = (u: string): Prefs => {
    try {
      const raw = JSON.parse(
        storage.getItem(prefsKey(u)) ?? 'null',
      ) as Partial<Prefs> | null;
      return { ...DEFAULT_PREFS(config), ...(raw ?? {}) };
    } catch {
      return DEFAULT_PREFS(config);
    }
  };
  const savePrefs = (u: string, p: Prefs) =>
    storage.setItem(prefsKey(u), JSON.stringify(p));
  const ASSETS = 'aive.panel.assets';
  const allAssets = (): Asset[] => {
    try {
      const v = JSON.parse(storage.getItem(ASSETS) ?? '[]') as unknown;
      return Array.isArray(v) ? (v as Asset[]) : [];
    } catch {
      return [];
    }
  };
  // P2B-13: projects belong to the person who made them.
  let ownerId = '';
  const projects = new ProjectLibrary(
    new IdbBackend(),
    undefined,
    undefined,
    () =>
      ownerId
        ? { id: ownerId, legacy: claimLocalData(storage, ownerId) }
        : null,
  );
  let projectCount = 0;
  void projects
    .list()
    .then((l) => (projectCount = l.length))
    .catch(() => undefined);
  // P2B-25: exports the editor made in this browser (no server).
  const exportsThisMonth = (u: string) => {
    try {
      const m = new Date().toISOString().slice(0, 7);
      return (
        JSON.parse(storage.getItem(EXPORTS_KEY(u)) ?? '[]') as { at: string }[]
      ).filter((e) => e.at.startsWith(m)).length;
    } catch {
      return 0;
    }
  };
  const storageMbOf = (u: string) =>
    Math.ceil(
      allAssets()
        .filter((a) => a.userId === u)
        .reduce((s, a) => s + a.bytes, 0) / 1_048_576,
    );
  const services: Services = {
    config,
    configFallback:
      live.version === 0 && storage.getItem('aive.platformConfig') !== null,
    account,
    remote: null,
    sync: async () => {},
    switchPlan: async () => {},
    topUp: async () => ({ ok: false, message: '' }),
    connected: () => true,
    estimate: async () => null,
    checkLimit: async () => null,
    usageLog,
    projects,
    ledger,
    prefs,
    savePrefs,
    planOf: (u) => planFor(config, prefs(u).plan),
    monthlyGrant: (u) => {
      const plan = planFor(config, prefs(u).plan);
      const month = new Date().toISOString().slice(0, 7);
      if (plan.monthlyCredits > 0)
        ledger(u).grant(
          plan.monthlyCredits,
          `grant:${plan.id}:${month}`,
          `${plan.id} ${month}`,
        );
    },
    assets: (u) => allAssets().filter((a) => a.userId === u),
    saveAsset: (a) =>
      storage.setItem(ASSETS, JSON.stringify([...allAssets(), a])),
    now: () => new Date(),
    gateway: undefined as unknown as PanelGateway,
  };
  const gateway = createGateway({
    config: () => config,
    adapters: {
      mock: mockAdapter({
        latencyMs: options.latencyMs ?? 150,
        respond: mockRespond,
        ...(options.mockFailure ? { failure: options.mockFailure } : {}),
      }),
      // Real adapters have no server transport this round: "not connected".
      anthropic: anthropicAdapter(),
      openai: openaiAdapter(),
      google: googleAdapter(),
      xai: xaiAdapter(),
      'openai-compatible': openaiCompatibleAdapter(),
    },
    ledger,
    usageLog,
    limits: (u) => {
      const mine = services.assets(u);
      return {
        exportsThisMonth: exportsThisMonth(u),
        storageMb: Math.ceil(mine.reduce((s, a) => s + a.bytes, 0) / 1_048_576),
        voiceClones: mine.filter(
          (a) => a.studioId === 'voice' && a.name.includes('clone'),
        ).length,
        projects: projectCount,
      };
    },
  });
  const local: PanelGateway = {
    remote: false,
    run: async (x) => gateway.run(x),
    startJob: async (x) => gateway.startJob(x),
    counts: (u) => gateway.counts(u),
  };
  const w = services as unknown as Record<string, unknown>;
  w.gateway = local;
  // P2B-26: the editor reads the plan's export limit from this bridge.
  const bridge = (u: string) => {
    const plan = services.planOf(u);
    const m = config.limitMessages.exports;
    const n = plan.limits.exportsPerMonth;
    storage.setItem(
      LIMITS_KEY(u),
      JSON.stringify({
        exportsPerMonth: n,
        message: (
          (m && ((services.prefs(u).locale === 'hi' && m.hi) || m.en)) ||
          'Your plan allows {n} exports a month.'
        ).replace(/\{n\}/g, String(n)),
      }),
    );
  };
  const projectsNow = async () =>
    (projectCount = (await projects.list().catch(() => [])).length);
  w.sync = async (u: string) => {
    ownerId = u;
    await projectsNow();
    bridge(u);
  };
  w.checkLimit = async (
    u: string,
    action: 'export' | 'store' | 'voice-clone' | 'project',
    addMb?: number,
  ) => {
    await projectsNow();
    try {
      preCheck({
        config,
        plan: services.planOf(u),
        action,
        ...(addMb !== undefined ? { addMb } : {}),
        maxCredits: 0,
        locale: services.prefs(u).locale,
        usage: { ...gateway.counts(u), callsLastMinute: 0, creditsToday: 0 },
      });
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };
  w.switchPlan = async (u: string, planId: string) => {
    services.savePrefs(u, { ...services.prefs(u), plan: planId });
    services.monthlyGrant(u);
  };
  w.topUp = async (u: string, packId: string, currency: 'INR' | 'USD') => {
    const pack = config.topUps.find((t) => t.id === packId);
    const provider = paymentProviders(config, currency)[0];
    if (!pack || !provider)
      return { ok: false, message: 'No payment method is switched on.' };
    const r = await provider.pay({
      credits: pack.credits,
      amount: currency === 'INR' ? pack.price.inr : pack.price.usd,
      currency,
      key: `${pack.id}-${Date.now().toString(36)}`,
    });
    if (!r.ok) return r;
    ledger(u).grant(
      pack.credits,
      `topup:${r.paymentId}`,
      `${pack.id} ${provider.id}`,
    );
    return { ok: true, credits: pack.credits };
  };
  // The offline mock gateway can only reach the mock models.
  w.connected = (modelId: string) =>
    config.models.find((m) => m.id === modelId)?.providerId === 'mock';
  w.estimate = async (
    modelId: string,
    methods: readonly string[],
    briefChars: number,
  ) => {
    const model = config.models.find((m) => m.id === modelId);
    return model
      ? estimateDirector(config, model, { briefChars, methods })
      : null;
  };
  if (gatewayUrl) {
    // P2B-08: the server holds the keys and the credits.
    let local: { email: string; token: string; exp: number } | null = null;
    const token = async () => {
      const jwt = await account.accessToken();
      if (jwt) return jwt;
      const me = await account.user();
      if (!me?.email) throw new Error('Please log in first.');
      if (
        !local ||
        local.email !== me.email ||
        local.exp < Date.now() / 1000 + 60
      ) {
        const res = await fetch(
          `${gatewayUrl.replace(/\/$/, '')}/v1/local/token`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: me.email }),
          },
        );
        const body = (await res.json().catch(() => ({}))) as { token?: string };
        if (!body.token) throw new Error('Please log in first.');
        local = {
          email: me.email,
          token: body.token,
          exp: JSON.parse(
            atob(
              body.token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'),
            ),
          ).exp,
        };
      }
      return local.token;
    };
    const remote = remoteGateway(gatewayUrl, token);
    w.remote = remote;
    w.gateway = remote.gateway;
    w.sync = async (u: string) => {
      ownerId = u;
      // P2B-27: the server keeps the real project count and storage.
      await remote
        .api('/usage/report', {
          projects: await projectsNow(),
          storageMb: storageMbOf(u),
        })
        .catch(() => undefined);
      await remote.sync();
      bridge(u);
    };
    w.checkLimit = async (
      _u: string,
      action: 'export' | 'store' | 'voice-clone' | 'project',
      addMb?: number,
    ) => {
      await remote
        .api('/usage/report', { projects: await projectsNow() })
        .catch(() => undefined);
      try {
        await remote.api('/limits/check', {
          action,
          ...(addMb !== undefined ? { addMb } : {}),
        });
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    };
    w.ledger = () => remote.ledger();
    w.planOf = (u: string) =>
      planFor(config, remote.plan() ?? services.prefs(u).plan);
    w.monthlyGrant = () => {};
    w.switchPlan = async (u: string, planId: string) => {
      await remote.api('/plan', {
        plan: planId,
        paymentKey: `plan-${planId}-${Date.now().toString(36)}`,
      });
      await services.sync(u);
    };
    w.topUp = async (u: string, packId: string, currency: 'INR' | 'USD') => {
      try {
        await remote.api('/topup', {
          packId,
          currency,
          paymentKey: `${packId}-${Date.now().toString(36)}`,
        });
        await services.sync(u);
        return {
          ok: true,
          credits: config.topUps.find((t) => t.id === packId)?.credits ?? 0,
        };
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    };
    w.connected = (modelId: string) =>
      remote.models().some((m) => m.id === modelId && m.connected);
    w.estimate = async (
      modelId: string,
      methods: readonly string[],
      briefChars: number,
    ) =>
      remote.api<ReturnType<typeof estimateDirector>>('/estimate', {
        modelId,
        methods,
        briefChars,
      });
  }
  return services;
}
export type { CloudUser };
