// P2-R2: the gateway server and the fake provider servers, started inside
// the Playwright worker for one test. Real HTTP everywhere; the "keys" are
// the fake server's, given to the gateway as environment variables (never
// to the browser).
import type { Page } from '@playwright/test';
import { createAuth } from '../server/auth';
import { createServerApp, listen } from '../server/app';
import { memoryStore } from '../server/store';
import {
  defaultConfig,
  p3Settings,
  type PlatformConfig,
} from '../src/platform-config';
import {
  fakeBase,
  startFakeProviders,
  type FakeProviders,
} from '../tests/fakes/providers';

export const STACK_SECRET = 'e2e-gateway-secret-0123456789abcdef';
const SECRET = STACK_SECRET;
export interface Stack {
  readonly url: string;
  readonly fake: FakeProviders;
  readonly logs: string[];
  /** The server's store (tests read counts and seed usage). */
  readonly store: ReturnType<typeof memoryStore>;
  /** Points the page at the gateway (before it loads). */
  use(page: Page): Promise<void>;
  close(): Promise<void>;
}
/**
 * `keys` names the providers whose key is set (ANTHROPIC_API_KEY, ...);
 * `edit` changes the Platform Config the owner publishes.
 */
export async function startStack(
  keys: string[] = [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'ELEVENLABS_API_KEY',
  ],
  edit: (c: PlatformConfig) => void = () => {},
): Promise<Stack> {
  const fake = await startFakeProviders();
  const logs: string[] = [];
  const env: Record<string, string> = {
    AUTH_MODE: 'local',
    LOCAL_AUTH_SECRET: SECRET,
    LOCAL_TOKENS: '1',
    ENTITLEMENT_SECRET: 'e2e-entitlement-secret-0123456789abcdef',
    SERVER_ORIGINS: `http://127.0.0.1:${process.env.E2E_PORT ?? 4173}`,
  };
  for (const k of keys) env[k] = fake.key;
  const store = memoryStore();
  const c = defaultConfig();
  for (const p of c.providers) {
    const b = fakeBase(fake.url)[p.kind as keyof ReturnType<typeof fakeBase>];
    if (b) p.baseUrl = b;
  }
  edit(c);
  await store.saveConfigVersion({
    version: 1,
    savedAt: new Date().toISOString(),
    note: 'e2e',
    config: c,
  });
  await store.setLiveConfig(1);
  const app = createServerApp({
    store,
    env,
    p3Settings: () => p3Settings(app.config.current().config),
    authenticate: createAuth({ mode: 'local', hsSecret: SECRET }),
    log: (l) => logs.push(l),
    adapterOptions: {
      timeoutMs: 5000,
      retries: 1,
      sleep: async () => {},
      pollMs: 0,
    },
  });
  await app.config.refresh();
  const server = await listen(app.handler, 0);
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    url,
    fake,
    logs,
    store,
    use: async (page) => {
      await page.addInitScript((u) => {
        (window as { __AIVE_GATEWAY_URL__?: string }).__AIVE_GATEWAY_URL__ = u;
      }, url);
    },
    close: async () => {
      await new Promise((r) => server.close(() => r(null)));
      await fake.close();
    },
  };
}
