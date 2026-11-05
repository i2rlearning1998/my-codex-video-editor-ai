// P3-WIRING (W6): mounts the key vault in the gateway server. server/app.ts
// calls these from its P3-WIRING blocks only:
//   p3Setup     the vault, and the server env where provider keys read the
//               vault first, then the environment;
//   p3KeyRoutes /v1/admin/keys (GET list, PUT set, DELETE remove, POST test),
//               admin only;
//   p3ReadBody  JSON bodies for PUT and DELETE (the server read POST only).
import type { IncomingMessage } from 'node:http';
import type { PlatformConfig } from '../../src/platform-config';
import { serverAdapters } from '../adapters';
import type { Caller } from '../auth';
import type { ServerOptions } from '../app';
import {
  createKeyVault,
  hasSecretMethods,
  memorySecretStore,
  VaultError,
  type Vault,
  type VaultAudit,
} from './index';

export function p3Setup(
  o: ServerOptions,
  config: () => PlatformConfig,
  log: (line: string) => void,
  // Part 1 provides the real, chained audit log; until it is merged the rows
  // go to the server log (names and reasons only, never a value).
  audit: (row: VaultAudit) => void | Promise<void> = (row) =>
    log(
      `audit ${row.action} ${row.target} by ${row.actor.slice(0, 8)} ${JSON.stringify(row.detail)}`,
    ),
): { vault: Vault; options: ServerOptions } {
  // The Store's secret methods are Part 1's (rev 1.2). Until they are
  // merged, sealed values live in memory and are lost on restart.
  const store = hasSecretMethods(o.store) ? o.store : memorySecretStore();
  if (store !== o.store)
    log(
      'key vault: the Store has no secret methods yet; keys last until restart',
    );
  const vault = createKeyVault(store, o.env.KEY_VAULT_SECRET ?? '', audit, {
    config,
    env: o.env,
    adapters: (env) =>
      serverAdapters({
        env,
        ...(o.fetch ? { fetch: o.fetch } : {}),
        ...(o.adapterOptions ?? {}),
      }),
  });
  void vault.load().then(() => {
    if (vault.state() === 'wrong-secret')
      log(
        'key vault: the stored keys cannot be read with this KEY_VAULT_SECRET',
      );
  });
  return { vault, options: { ...o, env: vault.env() } };
}

type Handler = (b: Record<string, unknown>, c: Caller) => Promise<unknown>;
type HttpErrorCtor = new (
  status: number,
  code: string,
  message: string,
) => Error;

export function p3KeyRoutes(
  vault: Vault,
  HttpError: HttpErrorCtor,
): Record<string, Handler> {
  const admin = (c: Caller) => {
    if (!c.admin)
      throw new HttpError(403, 'admin', 'Only the owner can manage keys.');
    return vault.as(c.userId);
  };
  const text = (v: unknown, max: number, what: string) => {
    if (typeof v !== 'string' || !v.trim() || v.length > max)
      throw new HttpError(
        400,
        'bad-request',
        `${what} is missing or too long.`,
      );
    return v;
  };
  const wrap =
    (fn: Handler): Handler =>
    async (b, c) => {
      try {
        return await fn(b, c);
      } catch (e) {
        if (e instanceof VaultError)
          throw new HttpError(400, `key-${e.code}`, e.message);
        throw e;
      }
    };
  return {
    'GET /v1/admin/keys': wrap(async (_b, c) => ({
      keys: await admin(c).list(),
    })),
    'PUT /v1/admin/keys': wrap(async (b, c) => {
      const v = admin(c);
      await v.set(
        text(b.name, 64, 'The key name'),
        text(b.value, 4096, 'The key'),
        text(b.reason, 300, 'The reason'),
      );
      return { ok: true };
    }),
    'DELETE /v1/admin/keys': wrap(async (b, c) => {
      const v = admin(c);
      await v.remove(
        text(b.name, 64, 'The key name'),
        text(b.reason, 300, 'The reason'),
      );
      return { ok: true };
    }),
    'POST /v1/admin/keys': wrap(async (b, c) => ({
      lastTest: await admin(c).test(text(b.name, 64, 'The key name')),
    })),
  };
}

export async function p3ReadBody(
  req: IncomingMessage,
  max: number,
  invalid: () => Error,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > max) throw invalid();
    chunks.push(chunk as Buffer);
  }
  if (!size) return {};
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw invalid();
  }
}
