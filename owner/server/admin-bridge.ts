// P4 Part 3: the Admin API of the Owner App. It runs the gateway's admin
// routes (users, credits, flags, refunds, audit, emergency, metrics, the key
// vault and Platform Config publishing) on its OWN internal 127.0.0.1 port,
// behind the owner's login. The user server (npm run server) has none of these
// routes (server/surfaces.ts). The internal port is closed to the network, and
// it accepts only a per-start secret the Owner App adds after it has checked
// the owner's session, so nothing but a logged-in owner reaches it.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import type { Server } from 'node:http';
import { createServerApp } from '../../server/app';
import { adminSurface } from '../../server/surfaces';
import { fileStore, type Store } from '../../server/store';
import { AuthError, type Caller } from '../../server/auth';
import { p3Settings } from '../../src/platform-config';

export interface AdminBridge {
  /** One call to the admin surface; `path` starts with /v1. */
  call(
    method: string,
    path: string,
    body: string | undefined,
    actor: string,
  ): Promise<{ status: number; body: string }>;
  close(): void;
}

export interface AdminBridgeOptions {
  readonly env?: Record<string, string | undefined>;
  /** Tests give their own store. */
  readonly store?: Store;
  readonly now?: () => number;
}

export async function startAdminBridge(
  options: AdminBridgeOptions = {},
): Promise<AdminBridge> {
  const env = options.env ?? process.env;
  const secret = randomBytes(32).toString('base64url');
  const secretBytes = Buffer.from(secret);
  let store: Store;
  if (options.store) store = options.store;
  else if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const { supabaseStore } = await import('../../server/supabase-store');
    store = supabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  } else
    store = fileStore(
      path.resolve(env.SERVER_DATA ?? 'server-data', 'store.json'),
    );
  const authenticate = async (header: string | undefined): Promise<Caller> => {
    const given = Buffer.from((header ?? '').replace(/^Bearer /, ''));
    if (
      given.length !== secretBytes.length ||
      !timingSafeEqual(given, secretBytes)
    )
      throw new AuthError('Only the Owner App may call the admin API.');
    // The acting owner is named per call in `x-owner` for the audit rows.
    return { userId: 'owner', email: 'owner', admin: true };
  };
  const app: ReturnType<typeof createServerApp> = createServerApp({
    store,
    env: env as never,
    authenticate,
    p3Settings: () => p3Settings(app.config.current().config),
    ...(options.now ? { now: options.now } : {}),
  });
  await app.config.refresh();
  const { createServer } = await import('node:http');
  const handler = adminSurface(app.handler);
  const server: Server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  const port = (server.address() as { port: number }).port;
  return {
    async call(method, requestPath, body, actor) {
      const response = await fetch(`http://127.0.0.1:${port}${requestPath}`, {
        method,
        headers: {
          authorization: `Bearer ${secret}`,
          'x-owner': actor,
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body } : {}),
      });
      return { status: response.status, body: await response.text() };
    },
    close: () => void server.close(),
  };
}
