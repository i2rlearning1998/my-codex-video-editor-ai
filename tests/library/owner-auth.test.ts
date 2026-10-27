// Phase 1 library manager, Part C: the owner app's security (P1-12, P1-13,
// P1-18) and its audit log (P1-19), against the real node:http server.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { request as httpRequest, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Accounts,
  LOCK_MS,
  MAX_FAILURES,
  REAUTH_MS,
  base32Encode,
  hashPassword,
  safeEqual,
  totp,
  verifyPassword,
} from '../../owner/server/auth';
import { AuditLog } from '../../owner/server/audit';
import { createOwnerApp, listen } from '../../owner/server/app';
import { generateKeys } from '../../owner/catalog/keys';
import { seedCatalog } from '../../owner/catalog/seed';
import { defaultSeedSources } from '../../owner/catalog/sources';

const root = mkdtempSync(path.join(tmpdir(), 'aive-owner-'));
const dataDir = path.join(root, 'data');
const outDir = path.join(root, 'out');
const keysDir = path.join(root, 'keys');
const port = 43_000 + Math.floor(Math.random() * 1500);
const base = `http://127.0.0.1:${port}`;
const SECRET = base32Encode(Buffer.from('12345678901234567890'));
const EMAIL = 'owner@example.com';
const PASSWORD = 'correct horse battery';
let clock = Date.parse('2026-10-26T10:00:00Z');
let server: Server;
let app: ReturnType<typeof createOwnerApp>;

beforeAll(async () => {
  const keys = generateKeys(keysDir);
  seedCatalog(defaultSeedSources(), { dataDir, outDir, keys });
  app = createOwnerApp({
    dataDir,
    outDir,
    keysDir,
    port,
    catalogUrl: 'http://127.0.0.1:4310/',
    openBrowser: () => Promise.reject(new Error('not in this test')),
    now: () => clock,
  });
  new Accounts(dataDir).create(EMAIL, PASSWORD, SECRET);
  server = app.server;
  await listen(server, port);
});
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(root, { recursive: true, force: true });
});

const code = (time = clock) => totp(Buffer.from('12345678901234567890'), time);
interface Call {
  status: number;
  body: Record<string, unknown>;
  headers: Headers;
}
async function call(
  method: string,
  url: string,
  options: {
    body?: unknown;
    cookie?: string;
    csrf?: string;
    origin?: string | null;
    host?: string;
  } = {},
): Promise<Call> {
  const response = await fetch(`${base}${url}`, {
    method,
    headers: {
      ...(options.body !== undefined
        ? { 'content-type': 'application/json' }
        : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.csrf ? { 'x-csrf-token': options.csrf } : {}),
      ...(options.origin === null ? {} : { origin: options.origin ?? base }),
    },
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text.startsWith('{')
      ? (JSON.parse(text) as Record<string, unknown>)
      : {},
  };
}
async function login() {
  const result = await call('POST', '/api/login', {
    body: { email: EMAIL, password: PASSWORD, code: code() },
  });
  expect(result.status).toBe(200);
  const cookie = result.headers.get('set-cookie')!.split(';')[0]!;
  return { cookie, csrf: result.body.csrf as string };
}

describe('Phase 1 owner app security', () => {
  it('[LIB-018] TOTP matches the RFC 6238 test vectors (SHA-1, SHA-256, SHA-512)', () => {
    const sha1 = Buffer.from('12345678901234567890');
    const sha256 = Buffer.from('12345678901234567890123456789012');
    const sha512 = Buffer.from(
      '1234567890123456789012345678901234567890123456789012345678901234',
    );
    const vectors: [number, string, string, string][] = [
      [59, '94287082', '46119246', '90693936'],
      [1111111109, '07081804', '68084774', '25091201'],
      [1111111111, '14050471', '67062674', '99943326'],
      [1234567890, '89005924', '91819424', '93441116'],
      [2000000000, '69279037', '90698825', '38618901'],
      [20000000000, '65353130', '77737706', '47863826'],
    ];
    for (const [seconds, a, b, c] of vectors) {
      expect(totp(sha1, seconds * 1000, { digits: 8 })).toBe(a);
      expect(
        totp(sha256, seconds * 1000, { digits: 8, algorithm: 'sha256' }),
      ).toBe(b);
      expect(
        totp(sha512, seconds * 1000, { digits: 8, algorithm: 'sha512' }),
      ).toBe(c);
    }
  });

  it('[LIB-018] scrypt hashes, constant-time compares; a wrong email, password or code is refused; five failures lock the account', async () => {
    const hash = hashPassword('a long password');
    expect(hash.startsWith('scrypt$16384$8$1$')).toBe(true);
    expect(verifyPassword('a long password', hash)).toBe(true);
    expect(verifyPassword('a long passwore', hash)).toBe(false);
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(
      readFileSync(path.join(dataDir, 'owner.json'), 'utf8'),
    ).not.toContain(PASSWORD);
    // There is no sign-up route.
    expect((await call('POST', '/api/signup', { body: {} })).status).toBe(401);
    for (const body of [
      { email: 'other@example.com', password: PASSWORD, code: code() },
      { email: EMAIL, password: 'wrong password!', code: code() },
      { email: EMAIL, password: PASSWORD, code: '000000' },
    ])
      expect((await call('POST', '/api/login', { body })).status).toBe(401);
    expect(
      (
        await call('POST', '/api/login', {
          body: { email: EMAIL, password: PASSWORD, code: code() },
        })
      ).status,
    ).toBe(200);
    for (let i = 0; i < MAX_FAILURES - 1; i++)
      expect(
        (
          await call('POST', '/api/login', {
            body: { email: EMAIL, password: 'nope nope nope', code: code() },
          })
        ).status,
      ).toBe(401);
    const locked = await call('POST', '/api/login', {
      body: { email: EMAIL, password: 'nope nope nope', code: code() },
    });
    expect(locked.status).toBe(423);
    // Locked: even the right details are refused, until 15 minutes pass.
    expect(
      (
        await call('POST', '/api/login', {
          body: { email: EMAIL, password: PASSWORD, code: code() },
        })
      ).status,
    ).toBe(423);
    clock += LOCK_MS + 1000;
    await login();
  });

  it("[LIB-018] CSRF: a change needs the session token and this app's own origin; logging out ends the session", async () => {
    const { cookie, csrf } = await login();
    expect((await call('GET', '/api/session', { cookie })).status).toBe(200);
    expect(
      (
        await call('POST', '/api/items/shape-star-5', {
          cookie,
          body: { featured: true },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call('POST', '/api/items/shape-star-5', {
          cookie,
          csrf: 'forged',
          body: { featured: true },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call('POST', '/api/items/shape-star-5', {
          cookie,
          csrf,
          origin: 'http://evil.example',
          body: { featured: true },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call('POST', '/api/items/shape-star-5', {
          cookie,
          csrf,
          origin: null,
          body: { featured: true },
        })
      ).status,
    ).toBe(403);
    const ok = await call('POST', '/api/items/shape-star-5', {
      cookie,
      csrf,
      body: { featured: true },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.catalogVersion).toBe(2);
    await call('POST', '/api/logout', { cookie, csrf, body: {} });
    expect((await call('GET', '/api/session', { cookie })).status).toBe(401);
  });

  it('[LIB-018] dangerous actions need a password and code from the last 5 minutes', async () => {
    const { cookie, csrf } = await login();
    clock += REAUTH_MS + 1000;
    const refused = await call('POST', '/api/items/shape-star-5/unpublish', {
      cookie,
      csrf,
      body: {},
    });
    expect(refused.status).toBe(403);
    expect(refused.body.reauth).toBe(true);
    expect(
      (await call('POST', '/api/rollback', { cookie, csrf, body: { to: 1 } }))
        .body.reauth,
    ).toBe(true);
    expect(
      (
        await call('POST', '/api/reauth', {
          cookie,
          csrf,
          body: { password: 'wrong wrong wrong', code: code() },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call('POST', '/api/reauth', {
          cookie,
          csrf,
          body: { password: PASSWORD, code: code() },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call('POST', '/api/items/shape-star-5/unpublish', {
          cookie,
          csrf,
          body: {},
        })
      ).status,
    ).toBe(200);
    expect(
      (await call('POST', '/api/rollback', { cookie, csrf, body: { to: 1 } }))
        .status,
    ).toBe(200);
  });

  it('[LIB-012] binds to 127.0.0.1 only, sends no CORS headers, refuses other host names, and the session cookie is HttpOnly and SameSite=Strict', async () => {
    const address = server.address();
    expect(typeof address === 'object' && address?.address).toBe('127.0.0.1');
    const page = await fetch(`${base}/`);
    expect(page.headers.get('access-control-allow-origin')).toBeNull();
    const preflight = await fetch(`${base}/api/items`, {
      method: 'OPTIONS',
      headers: { origin: 'http://127.0.0.1:4173' },
    });
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
    // A DNS-rebinding page arrives with another Host header.
    const rebinding = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(
        {
          host: '127.0.0.1',
          port,
          path: '/',
          headers: { host: 'evil.example' },
        },
        (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        },
      );
      request.on('error', reject);
      request.end();
    });
    expect(rebinding).toBe(421);
    const result = await call('POST', '/api/login', {
      body: { email: EMAIL, password: PASSWORD, code: code() },
    });
    const cookie = result.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('[LIB-013] every answer carries a strict CSP and the security headers', async () => {
    for (const url of ['/', '/app.js', '/api/session']) {
      const response = await fetch(`${base}${url}`);
      const csp = response.headers.get('content-security-policy')!;
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('[LIB-019] every action writes an audit row; the rows are chained, the app cannot edit them, and an edit on disk is found', async () => {
    const log = new AuditLog(dataDir);
    const rows = log.rows();
    const actions = rows.map((row) => row.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'login',
        'logout',
        'update',
        'reauth',
        'unpublish',
        'rollback',
        'csrf-refused',
      ]),
    );
    expect(
      rows.filter((row) => row.action === 'login' && !row.ok).length,
    ).toBeGreaterThanOrEqual(4);
    expect(log.verify()).toBeNull();
    const { cookie, csrf } = await login();
    // No route edits or deletes a row.
    for (const [method, url] of [
      ['POST', '/api/audit'],
      ['POST', '/api/audit/1'],
      ['POST', '/api/audit/1/delete'],
      ['DELETE', '/api/audit'],
    ] as const)
      expect((await call(method, url, { cookie, csrf, body: {} })).status).toBe(
        404,
      );
    const listed = await call('GET', '/api/audit', { cookie });
    expect((listed.body.rows as unknown[]).length).toBe(log.rows().length);
    expect(listed.body.broken).toBeNull();
    // Editing a row on disk breaks the chain at that row.
    const lines = readFileSync(log.file, 'utf8').trim().split('\n');
    lines[1] = lines[1]!.replace('"login"', '"logout"');
    writeFileSync(log.file, `${lines.join('\n')}\n`);
    expect(log.verify()).toBe(2);
  });
});
