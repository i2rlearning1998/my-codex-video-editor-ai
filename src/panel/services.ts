// Everything the panel talks to, behind interfaces: the Platform Config, the
// account backend (CloudBackend: local now, Supabase later), the gateway with
// its ledger and usage log, and this person's panel data.
import { localAccountBackend, indexedBlobStore } from '../cloud/local';
import type { CloudBackend, CloudUser } from '../cloud/backend';
import {
  CreditLedger,
  anthropicAdapter,
  createGateway,
  googleAdapter,
  mockAdapter,
  openaiAdapter,
  openaiCompatibleAdapter,
  storageLedgerStore,
  storageUsageLog,
  xaiAdapter,
  type Gateway,
  type GatewayRequest,
  type MockFailure,
  type UsageLog,
} from '../gateway';
import {
  localConfigSource,
  planFor,
  type Plan,
  type PlatformConfig,
} from '../platform-config';
import { IdbBackend, ProjectLibrary } from '../persistence/projects';
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
    lastResetCode(email: string): string | null;
  };
  readonly gateway: Gateway;
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

/** Readable answers from the offline mock model (it stands in for a real one). */
function mockText(req: GatewayRequest): string {
  const input = req.messages
    .map((m) => m.content)
    .join(' ')
    .trim();
  switch (req.system) {
    case 'studio:write':
      return `${input}\n\n${input.split(/\s+/).slice(0, 12).join(' ')}: a short draft written by the test model.`;
    case 'studio:youtube-pack':
      return `Title: ${input.split('\n')[0]}\nDescription: ${input}\nTags: video, explainer, learning`;
    default:
      return input || 'ok';
  }
}

export async function createServices(
  storage: KV,
  options: {
    mockFailure?: MockFailure | ((r: GatewayRequest) => MockFailure);
    latencyMs?: number;
  } = {},
): Promise<Services> {
  const source = localConfigSource(storage);
  const live = await source.getLive();
  const config = live.config;
  const account = localAccountBackend({ storage, blobs: indexedBlobStore() });
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
  const projects = new ProjectLibrary(new IdbBackend());
  let projectCount = 0;
  void projects
    .list()
    .then((l) => (projectCount = l.length))
    .catch(() => undefined);
  const services: Services = {
    config,
    configFallback:
      live.version === 0 && storage.getItem('aive.platformConfig') !== null,
    account,
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
    gateway: undefined as unknown as Gateway,
  };
  const gateway = createGateway({
    config: () => config,
    adapters: {
      mock: mockAdapter({
        latencyMs: options.latencyMs ?? 150,
        respond: mockText,
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
        exportsThisMonth: 0,
        storageMb: Math.ceil(mine.reduce((s, a) => s + a.bytes, 0) / 1_048_576),
        voiceClones: mine.filter(
          (a) => a.studioId === 'voice' && a.name.includes('clone'),
        ).length,
        projects: projectCount,
      };
    },
  });
  (services as { gateway: Gateway }).gateway = gateway;
  return services;
}
export type { CloudUser };
