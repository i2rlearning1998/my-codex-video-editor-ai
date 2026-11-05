// A real gateway, ledger and the real server adapters (wrapped for vision),
// talking over localhost HTTP to the FAKE provider servers. Nothing here is
// a live provider.
import {
  CreditLedger,
  createGateway,
  memoryLedgerStore,
  memoryUsageLog,
} from '../../src/gateway';
import {
  defaultConfig,
  planFor,
  type PlatformConfig,
} from '../../src/platform-config';
import { serverAdapters } from '../../server/adapters';
import { createWiringStore, memoryBackend } from '../../src/wiring/store';
import { fakeBase, type FakeProviders } from '../fakes/providers';

export const ENV_NAMES = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'XAI_API_KEY',
  'ELEVENLABS_API_KEY',
];
export function fakeConfig(fake: FakeProviders): PlatformConfig {
  const c = defaultConfig();
  for (const p of c.providers) {
    const b = fakeBase(fake.url)[p.kind as keyof ReturnType<typeof fakeBase>];
    if (b) p.baseUrl = b;
  }
  return c;
}

export function harness(
  fake: FakeProviders,
  o: { plan?: string; credits?: number; config?: PlatformConfig } = {},
) {
  const config = o.config ?? fakeConfig(fake);
  const env = Object.fromEntries(ENV_NAMES.map((k) => [k, fake.key]));
  const fast = { timeoutMs: 2000, retries: 0, sleep: async () => {} };
  // The real server adapters; images and form params are added by them.
  const adapters = serverAdapters({ env, ...fast });
  const ledgers = new Map<string, CreditLedger>();
  const ledger = (u: string) => {
    if (!ledgers.has(u)) {
      const l = new CreditLedger(memoryLedgerStore());
      l.grant(o.credits ?? 1000, `grant:${u}`);
      ledgers.set(u, l);
    }
    return ledgers.get(u)!;
  };
  const usageLog = memoryUsageLog();
  const gateway = createGateway({
    config: () => config,
    adapters,
    ledger,
    usageLog,
    limits: () => ({
      exportsThisMonth: 0,
      storageMb: 0,
      voiceClones: 0,
      projects: 0,
    }),
  });
  const plan = planFor(config, o.plan ?? 'pro');
  let user: string | null = 'u1';
  const store = createWiringStore({
    backend: memoryBackend(),
    owner: () => user,
    config: () => config,
    planId: () => plan.id,
  });
  return {
    config,
    gateway,
    ledger,
    usageLog,
    plan,
    store,
    adapters,
    user: () => user,
    as: (u: string | null) => (user = u),
  };
}

/** Collects every event of a stream. */
export async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const e of it) out.push(e);
  return out;
}
/** Requests the fake servers saw for text models. */
export const modelRequests = (fake: FakeProviders) =>
  fake.seen.filter((s) =>
    ['anthropic', 'openai', 'google', 'xai'].includes(s.provider),
  ).length;
