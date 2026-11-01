// Starts the gateway server on a free port for a test.
import type { Server } from 'node:http';
import { createAuth, signLocalToken } from '../../server/auth';
import { createServerApp, listen } from '../../server/app';
import { memoryStore, type Store } from '../../server/store';

export const SECRET = 'test-secret-that-is-long-enough-1234567890';
export interface Started {
  url: string;
  store: Store;
  logs: string[];
  token(sub: string, extra?: Record<string, unknown>): string;
  api(
    path: string,
    opts?: {
      token?: string;
      body?: unknown;
      method?: string;
      headers?: Record<string, string>;
    },
  ): Promise<{ status: number; body: any; text: string; headers: Headers }>;
  close(): Promise<void>;
}
export async function startServer(
  env: Record<string, string> = {},
  store: Store = memoryStore(),
): Promise<Started> {
  const logs: string[] = [];
  const app = createServerApp({
    store,
    env: { AUTH_MODE: 'local', LOCAL_AUTH_SECRET: SECRET, ...env },
    authenticate: createAuth({ mode: 'local', hsSecret: SECRET }),
    log: (l) => logs.push(l),
    adapterOptions: {
      timeoutMs: 1500,
      retries: 1,
      sleep: async () => {},
      pollMs: 0,
    },
  });
  const server: Server = await listen(app.handler, 0);
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    url,
    store,
    logs,
    token: (sub, extra = {}) =>
      signLocalToken(SECRET, {
        sub,
        email: `${sub.slice(0, 6)}@example.com`,
        ...extra,
      }),
    async api(path, o = {}) {
      const res = await fetch(`${url}${path}`, {
        method: o.method ?? (o.body === undefined ? 'GET' : 'POST'),
        headers: {
          ...(o.token ? { authorization: `Bearer ${o.token}` } : {}),
          ...(o.body !== undefined
            ? { 'content-type': 'application/json' }
            : {}),
          ...(o.headers ?? {}),
        },
        ...(o.body !== undefined
          ? {
              body:
                typeof o.body === 'string' ? o.body : JSON.stringify(o.body),
            }
          : {}),
      });
      const text = await res.text();
      let body: unknown = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      return { status: res.status, body, text, headers: res.headers };
    },
    close: () => new Promise((r) => server.close(() => r())),
  };
}
