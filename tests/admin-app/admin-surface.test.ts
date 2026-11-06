// P4 Part 3: the user server has no admin route; the Owner App's admin API is
// behind the owner's login, CSRF and re-authentication, and writes an audit row.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServerApp } from '../../server/app';
import { fileStore } from '../../server/store';
import { signLocalToken, createAuth } from '../../server/auth';
import { adminSurface, isAdminRoute, userSurface } from '../../server/surfaces';
import {
  startAdminBridge,
  type AdminBridge,
} from '../../owner/server/admin-bridge';
import { Accounts, base32Encode, totp } from '../../owner/server/auth';
import {
  createOwnerApp,
  listen,
  adminNeedsReauth,
} from '../../owner/server/app';
import { generateKeys } from '../../owner/catalog/keys';
import { seedCatalog } from '../../owner/catalog/seed';
import { defaultSeedSources } from '../../owner/catalog/sources';
import { p3Settings } from '../../src/platform-config';

const root = mkdtempSync(path.join(tmpdir(), 'aive-admin-'));
const SECRET = base32Encode(Buffer.from('12345678901234567890'));
const EMAIL = 'owner@example.com';
const PASSWORD = 'correct horse battery';
const LOCAL = 'a-long-local-secret-for-the-test';
let clock = Date.parse('2026-11-07T10:00:00Z');
let userServer: Server;
let userBase = '';
let ownerServer: Server;
let ownerBase = '';
let bridge: AdminBridge;
let adminToken = '';

beforeAll(async () => {
  const env = {
    AUTH_MODE: 'local',
    LOCAL_AUTH_SECRET: LOCAL,
    ENTITLEMENT_SECRET: 'entitlement-secret-for-the-test',
    KEY_VAULT_SECRET: 'vault-secret-for-the-test-only',
    SERVER_DATA: path.join(root, 'server-data'),
  };
  const store = fileStore(path.join(root, 'server-data', 'store.json'));
  // The user server, exactly as `npm run server` builds it.
  const app: ReturnType<typeof createServerApp> = createServerApp({
    store,
    env,
    authenticate: createAuth({ mode: 'local', hsSecret: LOCAL }),
    p3Settings: () => p3Settings(app.config.current().config),
  });
  await app.config.refresh();
  const handler = userSurface(app.handler);
  userServer = createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => userServer.listen(0, '127.0.0.1', () => r()));
  userBase = `http://127.0.0.1:${(userServer.address() as { port: number }).port}`;
  // The owner's admin API on its own port.
  bridge = await startAdminBridge({ env, store });
  const dataDir = path.join(root, 'data');
  const outDir = path.join(root, 'out');
  const keysDir = path.join(root, 'keys');
  seedCatalog(defaultSeedSources(), {
    dataDir,
    outDir,
    keys: generateKeys(keysDir),
  });
  const port = 44_000 + Math.floor(Math.random() * 1000);
  ownerBase = `http://127.0.0.1:${port}`;
  const owner = createOwnerApp({
    dataDir,
    outDir,
    keysDir,
    port,
    catalogUrl: 'http://127.0.0.1:4310/',
    openBrowser: () => Promise.reject(new Error('not here')),
    now: () => clock,
    admin: bridge,
  });
  new Accounts(dataDir).create(EMAIL, PASSWORD, SECRET);
  ownerServer = owner.server;
  await listen(ownerServer, port);
  adminToken = signLocalToken(LOCAL, {
    sub: '99999999-0000-0000-0000-000000000000',
    email: 'x@example.com',
    app_metadata: { role: 'admin' },
  });
});
afterAll(async () => {
  bridge.close();
  await new Promise((r) => userServer.close(r));
  await new Promise((r) => ownerServer.close(r));
  rmSync(root, { recursive: true, force: true });
});

const code = () => totp(Buffer.from('12345678901234567890'), clock);
async function owner(
  method: string,
  url: string,
  o: {
    body?: unknown;
    cookie?: string;
    csrf?: string;
    origin?: string | null;
  } = {},
) {
  const res = await fetch(`${ownerBase}${url}`, {
    method,
    headers: {
      ...(o.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(o.cookie ? { cookie: o.cookie } : {}),
      ...(o.csrf ? { 'x-csrf-token': o.csrf } : {}),
      ...(o.origin === null ? {} : { origin: o.origin ?? ownerBase }),
    },
    ...(o.body !== undefined ? { body: JSON.stringify(o.body) } : {}),
  });
  const text = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    body: text.startsWith('{') ? JSON.parse(text) : text,
  };
}
async function login() {
  const r = await owner('POST', '/api/login', {
    body: { email: EMAIL, password: PASSWORD, code: code() },
  });
  expect(r.status).toBe(200);
  return {
    cookie: r.headers.get('set-cookie')!.split(';')[0]!,
    csrf: r.body.csrf as string,
  };
}

describe('P4 admin app: two surfaces', () => {
  it('[P4A-001] the user server answers 404 to every admin route, even for a real admin token', async () => {
    const paths: [string, string][] = [
      ['GET', '/v1/admin/users'],
      ['GET', '/v1/admin/metrics'],
      ['POST', '/v1/admin/emergency'],
      ['GET', '/v1/admin/keys'],
      ['PUT', '/v1/admin/keys'],
      ['POST', '/v1/config'],
      ['POST', '/v1/config/publish'],
      ['GET', '/v1/admin/users/'],
      ['GET', '/v1/ADMIN/users'],
      ['GET', '/v1//admin/users'],
    ];
    for (const [method, p] of paths) {
      const res = await fetch(userBase + p, {
        method,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'content-type': 'application/json',
        },
        ...(method === 'GET' ? {} : { body: '{}' }),
      });
      expect(`${method} ${p} ${res.status}`).toBe(`${method} ${p} 404`);
    }
    // The public config read and health stay.
    expect((await fetch(`${userBase}/v1/config`)).status).toBe(200);
    expect((await fetch(`${userBase}/v1/health`)).status).toBe(200);
    expect(isAdminRoute('POST', '/v1/config')).toBe(true);
    expect(isAdminRoute('GET', '/v1/config')).toBe(false);
  });

  it('[P4A-002] the admin surface serves only admin routes, the config read and health', async () => {
    const calls = await Promise.all(
      ['/v1/balance', '/v1/run', '/v1/me', '/v1/payments/checkout'].map((p) =>
        bridge.call('GET', p, undefined, 'owner'),
      ),
    );
    for (const c of calls) expect(c.status).toBe(404);
    expect(
      (await bridge.call('GET', '/v1/health', undefined, 'owner')).status,
    ).toBe(200);
    expect(adminSurface).toBeTypeOf('function');
  });

  it('[P4A-003] the admin API needs the owner login; a wrong CSRF token or a foreign origin is refused', async () => {
    expect((await owner('GET', '/api/admin/users')).status).toBe(401);
    expect((await owner('GET', '/api/admin/metrics')).status).toBe(401);
    const { cookie, csrf } = await login();
    const users = await owner('GET', '/api/admin/users', { cookie });
    expect(users.status).toBe(200);
    expect(Array.isArray(users.body.rows)).toBe(true);
    expect(
      (
        await owner('POST', '/api/admin/flags', {
          cookie,
          body: {},
          csrf: 'wrong',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await owner('POST', '/api/admin/flags', {
          cookie,
          csrf,
          body: {},
          origin: 'http://evil.example',
        })
      ).status,
    ).toBe(403);
    // Only listed admin paths pass.
    expect(
      (await owner('GET', '/api/admin/not-a-thing', { cookie })).status,
    ).toBe(404);
    expect(
      (await owner('GET', '/api/admin/users/../../balance', { cookie })).status,
    ).toBe(404);
  });

  it('[P4A-004] settings, keys and money need a fresh password and code; the key is stored sealed and never read back', async () => {
    const { cookie, csrf } = await login();
    const config = await owner('GET', '/api/admin/config', { cookie });
    expect(config.status).toBe(200);
    expect(config.body.config.plans.length).toBeGreaterThan(0);
    // 5 minutes later the session is no longer fresh.
    clock += 10 * 60_000;
    const refused = await owner('POST', '/api/admin/config', {
      cookie,
      csrf,
      body: { config: config.body.config, note: 'no change', publish: false },
    });
    expect(refused.status).toBe(403);
    expect(refused.body.reauth).toBe(true);
    const again = await owner('POST', '/api/reauth', {
      cookie,
      csrf,
      body: { password: PASSWORD, code: code() },
    });
    expect(again.status).toBe(200);
    const saved = await owner('POST', '/api/admin/config', {
      cookie,
      csrf,
      body: { config: config.body.config, note: 'no change', publish: true },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.version).toBeGreaterThan(0);
    const keyName = config.body.config.providers.find(
      (p: { kind: string; keyRef?: string }) => p.kind !== 'mock' && p.keyRef,
    ).keyRef as string;
    const put = await owner('PUT', '/api/admin/keys', {
      cookie,
      csrf,
      body: {
        name: keyName,
        value: 'sk-test-1234567890-secret',
        reason: 'first key',
      },
    });
    expect(put.status).toBe(200);
    const list = await owner('GET', '/api/admin/keys', { cookie });
    expect(JSON.stringify(list.body)).not.toContain(
      'sk-test-1234567890-secret',
    );
    expect(JSON.stringify(list.body)).toContain('cret');
    // The chained audit log has the changes and still verifies.
    const audit = await owner('GET', '/api/admin/audit', { cookie });
    expect(audit.status).toBe(200);
    const actions = (audit.body.rows as { action: string }[]).map(
      (r) => r.action,
    );
    expect(actions.some((a) => a.includes('config'))).toBe(true);
    const ownerAudit = await owner('GET', '/api/audit', { cookie });
    expect(ownerAudit.body.broken).toBeNull();
    expect(JSON.stringify(ownerAudit.body.rows)).not.toContain(
      'sk-test-1234567890-secret',
    );
  });

  it('[P4A-005] which admin calls need a fresh login is one small rule', () => {
    expect(adminNeedsReauth('GET', 'users')).toBe(false);
    expect(adminNeedsReauth('POST', 'users/abc/credits')).toBe(true);
    expect(adminNeedsReauth('PUT', 'keys')).toBe(true);
    expect(adminNeedsReauth('POST', 'config')).toBe(true);
    expect(adminNeedsReauth('POST', 'flags')).toBe(false);
  });
});
