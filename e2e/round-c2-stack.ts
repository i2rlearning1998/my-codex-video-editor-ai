// ROUND-C2: the gateway server with the Claude connector, in the test
// process, plus a "sandbox origin" that serves the export card the way a
// chat host does (its own origin, the host's CSP), and an MCP client that
// plays Claude. No network beyond 127.0.0.1.
import { createServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createAuth } from '../server/auth';
import { createServerApp, listen } from '../server/app';
import { memoryStore } from '../server/store';
import {
  defaultConfig,
  p3Settings,
  type PlatformConfig,
} from '../src/platform-config';

export const C2_SECRET = 'e2e-c2-secret-0123456789abcdef0123';
export const DEV_TOKEN = 'e2e-mcp-dev-token-0123456789';
const port = () => Number(process.env.E2E_PORT ?? 4173);

/** Builds the card engine once when it is missing (npm run build does it in CI). */
export function ensureCardBuild() {
  if (!existsSync('dist/mcp-card/card.js'))
    execFileSync('npx', ['vite', 'build', '--config', 'vite.card.ts'], {
      stdio: 'ignore',
    });
}

/** The CSP an MCP Apps host applies (spec: the default plus declared origins). */
export function hostCsp(csp: {
  connectDomains?: string[];
  resourceDomains?: string[];
}) {
  const res = (csp.resourceDomains ?? []).join(' ');
  const con = (csp.connectDomains ?? []).join(' ');
  return [
    "default-src 'none'",
    `script-src 'self' 'unsafe-inline' ${res}`,
    `style-src 'self' 'unsafe-inline' ${res}`,
    `img-src 'self' data: ${res}`,
    `font-src 'self' ${res}`,
    `media-src 'self' data: ${res}`,
    `connect-src 'self' ${con}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
}

export interface C2Stack {
  readonly url: string;
  readonly sandboxUrl: string;
  readonly store: ReturnType<typeof memoryStore>;
  readonly logs: string[];
  /** An MCP client that calls tools as Claude would. */
  claude(token?: string): Promise<Client>;
  /** Serves a card's HTML on the sandbox origin under the given CSP. */
  serveCard(html: string, csp: string): string;
  close(): Promise<void>;
}

export async function startC2Stack(
  edit: (c: PlatformConfig) => void = () => {},
  env: Record<string, string> = {},
): Promise<C2Stack> {
  const store = memoryStore();
  const logs: string[] = [];
  const c = defaultConfig();
  edit(c);
  await store.saveConfigVersion({
    version: 1,
    savedAt: new Date().toISOString(),
    note: 'e2e',
    config: c,
  });
  await store.setLiveConfig(1);
  // The sandbox origin first, so the server knows it.
  const pages = new Map<string, { html: string; csp: string }>();
  const sandbox: Server = createServer((req, res) => {
    const page = pages.get((req.url ?? '/').split('?')[0]!);
    if (!page) {
      res.statusCode = 404;
      return void res.end();
    }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('content-security-policy', page.csp);
    res.end(page.html);
  });
  await new Promise<void>((r) => sandbox.listen(0, '127.0.0.1', r));
  const sandboxUrl = `http://127.0.0.1:${(sandbox.address() as AddressInfo).port}`;
  const app = createServerApp({
    store,
    env: {
      AUTH_MODE: 'local',
      LOCAL_AUTH_SECRET: C2_SECRET,
      LOCAL_TOKENS: '1',
      ENTITLEMENT_SECRET: 'e2e-entitlement-secret-0123456789abcdef',
      MCP_DEV_TOKEN: DEV_TOKEN,
      SERVER_ORIGINS: `http://127.0.0.1:${port()}`,
      ...env,
    },
    p3Settings: () => p3Settings(app.config.current().config),
    authenticate: createAuth({ mode: 'local', hsSecret: C2_SECRET }),
    log: (l) => logs.push(l),
  });
  await app.config.refresh();
  const server = await listen(app.handler, 0);
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const clients: Client[] = [];
  return {
    url,
    sandboxUrl,
    store,
    logs,
    async claude(token = DEV_TOKEN) {
      const client = new Client({ name: 'claude-e2e', version: '1.0.0' });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
          requestInit: { headers: { authorization: `Bearer ${token}` } },
        }),
      );
      clients.push(client);
      return client;
    },
    serveCard(html, csp) {
      const p = `/card-${pages.size}.html`;
      pages.set(p, { html, csp });
      return `${sandboxUrl}${p}`;
    },
    async close() {
      for (const cl of clients) await cl.close().catch(() => undefined);
      await new Promise((r) => server.close(r));
      await new Promise((r) => sandbox.close(r));
    },
  };
}
