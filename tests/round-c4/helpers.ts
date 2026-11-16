// ROUND-C4: the Owner App (its login, CSRF, re-authentication and audit
// log), its admin bridge and the user server with the Claude connector, all
// in this process on ONE store, so a Style the owner publishes is what the
// panel's /v1/config and Claude's list_styles read next.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import {
  startAdminBridge,
  type AdminBridge,
} from '../../owner/server/admin-bridge';
import { Accounts, base32Encode, totp } from '../../owner/server/auth';
import { createOwnerApp, listen } from '../../owner/server/app';
import { generateKeys } from '../../owner/catalog/keys';
import { startC2, type C2 } from '../round-c2/helpers';
import type { PlatformConfig } from '../../src/platform-config';

const SECRET_BYTES = Buffer.from('12345678901234567890');
export const OWNER_EMAIL = 'owner@example.com';
const PASSWORD = 'correct horse battery';

export interface C4 {
  readonly s: C2;
  readonly bridge: AdminBridge;
  readonly ownerBase: string;
  readonly root: string;
  readonly audit: () => { action: string; target?: string; ok: boolean }[];
  /** One call to the Owner App as the logged-in owner. */
  owner(
    method: string,
    url: string,
    o?: {
      body?: unknown;
      raw?: Buffer;
      name?: string;
      csrf?: string | null;
      cookie?: string | null;
      reauth?: boolean;
    },
  ): Promise<{ status: number; body: any; bytes: Buffer; headers: Headers }>;
  close(): Promise<void>;
}

export async function startC4(
  edit: (c: PlatformConfig) => void = () => {},
): Promise<C4> {
  const s = await startC2({ CONFIG_TTL_MS: '0' }, edit);
  // The same config the C2 helper publishes is live first.
  await s.publish(() => {});
  const root = mkdtempSync(path.join(tmpdir(), 'aive-c4-'));
  const bridge = await startAdminBridge({
    store: s.store,
    env: {
      KEY_VAULT_SECRET: 'vault-secret-for-the-test-only',
      ENTITLEMENT_SECRET: 'entitlement-secret-for-the-test',
      CONFIG_TTL_MS: '0',
    },
  });
  const dataDir = path.join(root, 'data');
  const outDir = path.join(root, 'out');
  const keysDir = path.join(root, 'keys');
  generateKeys(keysDir);
  // The Owner App's clock: each step without a fresh code is 6 minutes
  // later, so the re-authentication window (5 minutes) has passed.
  let clock = Date.now();
  const port = 45_000 + Math.floor(Math.random() * 3000);
  const ownerBase = `http://127.0.0.1:${port}`;
  const app = createOwnerApp({
    dataDir,
    outDir,
    keysDir,
    port,
    catalogUrl: 'http://127.0.0.1:4310/',
    openBrowser: () => Promise.reject(new Error('not here')),
    admin: bridge,
    now: () => clock,
  });
  new Accounts(dataDir).create(
    OWNER_EMAIL,
    PASSWORD,
    base32Encode(SECRET_BYTES),
  );
  const server: Server = app.server;
  await listen(server, port);
  const code = () => totp(SECRET_BYTES, clock);
  let cookie = '';
  let csrf = '';
  const logIn = async () => {
    const login = await fetch(`${ownerBase}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ownerBase },
      body: JSON.stringify({
        email: OWNER_EMAIL,
        password: PASSWORD,
        code: code(),
      }),
    });
    cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    csrf = ((await login.json()) as { csrf: string }).csrf;
  };
  await logIn();
  const call: C4['owner'] = async (method, url, o = {}) => {
    if (method !== 'GET') {
      clock += 6 * 60 * 1000;
      // A session lasts 8 hours of this clock: log in again when it ends.
      if (
        (await fetch(`${ownerBase}/api/session`, { headers: { cookie } }))
          .status === 401
      )
        await logIn();
    }
    const headers: Record<string, string> = { origin: ownerBase };
    if (o.cookie !== null) headers.cookie = o.cookie ?? cookie;
    if (o.csrf !== null) headers['x-csrf-token'] = o.csrf ?? csrf;
    if (o.raw) {
      headers['content-type'] = 'application/octet-stream';
      headers['x-file-name'] = encodeURIComponent(o.name ?? 'file');
    } else if (o.body !== undefined)
      headers['content-type'] = 'application/json';
    if (o.reauth && method !== 'GET') {
      await fetch(`${ownerBase}/api/reauth`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ password: PASSWORD, code: code() }),
      });
    }
    const res = await fetch(`${ownerBase}${url}`, {
      method,
      headers,
      ...(o.raw
        ? { body: o.raw }
        : o.body !== undefined
          ? { body: JSON.stringify(o.body) }
          : {}),
    });
    const bytes = Buffer.from(await res.arrayBuffer());
    const text = bytes.toString('utf8');
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* a file */
    }
    return { status: res.status, body, bytes, headers: res.headers };
  };
  return {
    s,
    bridge,
    ownerBase,
    root,
    audit: () => app.audit.rows() as never,
    owner: call,
    async close() {
      bridge.close();
      await new Promise((r) => server.close(r));
      await s.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
