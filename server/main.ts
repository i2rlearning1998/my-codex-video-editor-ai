// P2-R2 (P2B-08): `npm run server` — the gateway server (127.0.0.1:4400).
// Environment (docs/KEYS.md):
//   SERVER_PORT, SERVER_HOST, SERVER_ORIGINS, SERVER_DATA (FileStore folder)
//   AUTH_MODE=supabase|local, SUPABASE_JWT_SECRET or SUPABASE_JWKS_URL,
//   LOCAL_AUTH_SECRET (+ LOCAL_TOKENS=1 to hand out dev tokens)
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY: use the Supabase store
//   provider keys by the names in the config (ANTHROPIC_API_KEY, ...)
import path from 'node:path';
import { createAuth } from './auth';
import { createServerApp, listen } from './app';
import { fileStore, type Store } from './store';

export async function main(): Promise<number> {
  const env = process.env;
  const port = Number(env.SERVER_PORT ?? 4400);
  const host = env.SERVER_HOST ?? '127.0.0.1';
  const mode = env.AUTH_MODE === 'supabase' ? 'supabase' : 'local';
  if (mode === 'local' && !env.LOCAL_AUTH_SECRET) {
    console.error(
      'Set LOCAL_AUTH_SECRET (any long random text), or AUTH_MODE=supabase with SUPABASE_JWT_SECRET or SUPABASE_JWKS_URL.',
    );
    return 2;
  }
  let store: Store;
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const { supabaseStore } = await import('./supabase-store');
    store = supabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  } else
    store = fileStore(
      path.resolve(env.SERVER_DATA ?? 'server-data', 'store.json'),
    );
  const authenticate = createAuth({
    mode,
    ...(mode === 'supabase'
      ? {
          ...(env.SUPABASE_JWT_SECRET
            ? { hsSecret: env.SUPABASE_JWT_SECRET }
            : {}),
          ...(env.SUPABASE_JWKS_URL ? { jwksUrl: env.SUPABASE_JWKS_URL } : {}),
          ...(env.SUPABASE_URL
            ? { issuer: `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1` }
            : {}),
        }
      : { hsSecret: env.LOCAL_AUTH_SECRET! }),
  });
  const app = createServerApp({
    store,
    env,
    authenticate,
    log: (line) => console.log(line),
  });
  await app.config.refresh();
  await listen(app.handler, port, host);
  console.log(
    `Gateway server on http://${host}:${port}/v1 (store: ${store.kind}, auth: ${mode})`,
  );
  // Runs until the process is stopped.
  await new Promise(() => {});
  return 0;
}
