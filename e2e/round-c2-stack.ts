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
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileStore, type Store } from '../server/store';
import { defaultConfig, type PlatformConfig } from '../src/platform-config';

export const C2_SECRET = 'e2e-c2-secret-0123456789abcdef0123';
export const DEV_TOKEN = 'e2e-mcp-dev-token-0123456789';

/** Builds the card engine once when it is missing (npm run build does it in CI). */
export function ensureCardBuild() {
  if (
    !existsSync('dist/mcp-card/card.js') ||
    !existsSync('dist/mcp-card/sandbox-frame.js')
  )
    execFileSync('npx', ['vite', 'build', '--config', 'vite.card.ts'], {
      stdio: 'ignore',
    });
}

/** The CSP an MCP Apps host applies (spec: the default plus declared origins). */
export function hostCsp(csp: {
  connectDomains?: string[];
  resourceDomains?: string[];
  frameDomains?: string[];
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
    csp.frameDomains?.length
      ? `frame-src ${csp.frameDomains.join(' ')}`
      : "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
}

export interface C2Stack {
  readonly url: string;
  readonly sandboxUrl: string;
  /** The server's file store (read here; the server process writes it). */
  readonly store: Store;
  readonly logs: string[];
  /** An MCP client that calls tools as Claude would. */
  claude(token?: string): Promise<Client>;
  /** Serves a card's HTML on the sandbox origin under the given CSP. */
  serveCard(html: string, csp: string): string;
  close(): Promise<void>;
}

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const p = (probe.address() as AddressInfo).port;
      probe.close(() => resolve(p));
    });
  });

/**
 * The real server process (`server/run.mjs /server/main.ts`, the way the
 * owner runs it) with a file store seeded with the given config.
 */
export async function startC2Stack(
  edit: (c: PlatformConfig) => void = () => {},
  env: Record<string, string> = {},
): Promise<C2Stack> {
  const dir = mkdtempSync(path.join(tmpdir(), 'aive-c2-'));
  const store = fileStore(path.join(dir, 'store.json'));
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
  const port = await freePort();
  const child: ChildProcess = spawn(
    process.execPath,
    ['server/run.mjs', '/server/main.ts'],
    {
      env: {
        ...process.env,
        SERVER_PORT: String(port),
        SERVER_DATA: dir,
        AUTH_MODE: 'local',
        LOCAL_AUTH_SECRET: C2_SECRET,
        LOCAL_TOKENS: '1',
        ENTITLEMENT_SECRET: 'e2e-entitlement-secret-0123456789abcdef',
        MCP_DEV_TOKEN: DEV_TOKEN,
        SERVER_ORIGINS: `http://127.0.0.1:${process.env.E2E_PORT ?? 4173}`,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`server did not start: ${logs.join('\n')}`)),
      60_000,
    );
    const read = (b: Buffer) => {
      for (const line of b.toString().split('\n').filter(Boolean)) {
        logs.push(line);
        if (line.startsWith('Gateway server on')) {
          clearTimeout(timer);
          resolve();
        }
      }
    };
    child.stdout!.on('data', read);
    child.stderr!.on('data', read);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited ${code}: ${logs.join('\n')}`));
    });
  });
  const url = `http://127.0.0.1:${port}`;
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
      child.kill();
      await new Promise((r) => sandbox.close(r));
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Shows a tool's card in the harness host page the way a chat host does
 * (another origin, the host CSP, the ext-apps bridge). Returns the frame.
 */
export async function mountCard(
  page: import('@playwright/test').Page,
  stack: C2Stack,
  claude: Client,
  toolResult: unknown,
  o: { sandbox?: string; downloadFile?: boolean; exposed?: boolean } = {},
) {
  const resource = await claude.readResource({
    uri: 'ui://aive/export-card.html',
  });
  const content = resource.contents[0] as unknown as {
    text: string;
    _meta: {
      ui: { csp: { connectDomains: string[]; resourceDomains: string[] } };
    };
  };
  const src = stack.serveCard(content.text, hostCsp(content._meta.ui.csp));
  if (!o.exposed)
    await page.exposeFunction('__callTool', (params: unknown) =>
      claude.callTool(params as never),
    );
  if (!page.url().includes('/e2e/mcp-host/host.html')) {
    await page.goto('/e2e/mcp-host/host.html');
    await page.waitForFunction(() => typeof window.startCard === 'function');
  }
  await page.evaluate((a) => window.startCard(a), {
    src,
    sandbox: o.sandbox ?? 'allow-scripts allow-same-origin',
    toolResult,
    downloadFile: o.downloadFile ?? true,
    updateModelContext: false,
  });
  let frame: import('@playwright/test').Frame | undefined;
  await (
    await import('@playwright/test')
  ).expect
    .poll(() => (frame = page.frames().find((f) => f.url() === src)))
    .toBeTruthy();
  return frame!;
}
