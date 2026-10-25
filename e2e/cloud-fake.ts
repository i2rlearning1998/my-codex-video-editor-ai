// Phase 1: a stand-in for a local Supabase (Auth, PostgREST, Storage) at
// http://127.0.0.1:54321, answered by Playwright in this process. It speaks
// the requests @supabase/supabase-js sends for the editor's CloudBackend
// and applies the same owner rule as the SQL policies (a person sees only
// their own rows and files). The real database and its policies are
// tested by `npm run cloud:test` (supabase/tests/policies.sql); a real
// `supabase start` replaces this when Docker can pull its images.
import type { BrowserContext, Route } from '@playwright/test';

export const CLOUD_URL = 'http://127.0.0.1:54321';
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'access-control-expose-headers': '*',
};
interface Row {
  id: string;
  owner_id: string;
  name: string;
  schema_version: number;
  document: string;
  revision: number;
  thumbnail: string | null;
  updated_at: string;
}
export interface FakeCloud {
  users: Map<string, { id: string; email: string; password: string }>;
  projects: Row[];
  media: { owner_id: string; fingerprint: string; name: string }[];
  files: Map<string, Buffer>;
  requests: string[];
}
const b64 = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    headers: { ...cors, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
/** The file part of a multipart body (the editor uploads a Blob). */
function filePart(body: Buffer, type: string): Buffer {
  const boundary = /boundary=(.+)$/.exec(type)?.[1];
  if (!boundary) return body;
  const marker = Buffer.from(`--${boundary}`);
  let at = body.indexOf(marker);
  let best = Buffer.alloc(0);
  while (at >= 0) {
    const next = body.indexOf(marker, at + marker.length);
    if (next < 0) break;
    const part = body.subarray(at + marker.length + 2, next - 2);
    const split = part.indexOf('\r\n\r\n');
    const content = part.subarray(split + 4);
    if (content.length > best.length) best = content;
    at = next;
  }
  return Buffer.from(best);
}

export async function fakeCloud(
  context: BrowserContext,
  cloud: FakeCloud = {
    users: new Map(),
    projects: [],
    media: [],
    files: new Map(),
    requests: [],
  },
): Promise<FakeCloud> {
  await context.addInitScript((url) => {
    (
      window as { __AIVE_CLOUD_CONFIG__?: { url: string; anonKey: string } }
    ).__AIVE_CLOUD_CONFIG__ = { url, anonKey: 'e2e-anon-key' };
  }, CLOUD_URL);
  const session = (user: { id: string; email: string }) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    return {
      access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp })}.e2e`,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: exp,
      refresh_token: `refresh-${user.id}`,
      user: {
        id: user.id,
        aud: 'authenticated',
        role: 'authenticated',
        email: user.email,
        app_metadata: { provider: 'email' },
        user_metadata: {},
        created_at: new Date().toISOString(),
      },
    };
  };
  const caller = (route: Route) => {
    const token = /Bearer (.+)$/.exec(
      route.request().headers()['authorization'] ?? '',
    )?.[1];
    const payload = token?.split('.')[1];
    if (!payload) return null;
    try {
      return (
        (
          JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
            sub?: string;
          }
        ).sub ?? null
      );
    } catch {
      return null;
    }
  };
  await context.route(`${CLOUD_URL}/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: cors });
    const url = new URL(request.url());
    cloud.requests.push(`${request.method()} ${url.pathname}`);
    const body = () => request.postDataJSON() as Record<string, unknown>;
    // Auth (GoTrue).
    if (url.pathname === '/auth/v1/signup') {
      const { email, password } = body() as { email: string; password: string };
      if ([...cloud.users.values()].some((user) => user.email === email))
        return json(route, 200, { error: 'exists' });
      const user = { id: crypto.randomUUID(), email, password };
      cloud.users.set(user.id, user);
      return json(route, 200, session(user));
    }
    if (url.pathname === '/auth/v1/token') {
      const grant = url.searchParams.get('grant_type');
      const user =
        grant === 'refresh_token'
          ? cloud.users.get(
              String(body().refresh_token).replace(/^refresh-/, ''),
            )
          : [...cloud.users.values()].find(
              (each) =>
                each.email === body().email &&
                each.password === body().password,
            );
      // An unknown login answers like GoTrue, without a 4xx in the log.
      if (!user)
        return json(route, 200, {
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
        });
      return json(route, 200, session(user));
    }
    if (url.pathname === '/auth/v1/user') {
      const user = cloud.users.get(caller(route) ?? '');
      return json(route, 200, user ? session(user).user : {});
    }
    if (url.pathname === '/auth/v1/logout') return json(route, 200, {});
    const owner = caller(route);
    // Storage: <bucket>/<owner>/<fingerprint>, owner folder only.
    const object =
      /^\/storage\/v1\/object\/media\/([^/]+)\/([0-9a-f]{32})$/.exec(
        url.pathname,
      );
    if (object) {
      if (object[1] !== owner) return json(route, 200, {});
      const key = `${object[1]}/${object[2]}`;
      if (request.method() === 'POST' || request.method() === 'PUT') {
        cloud.files.set(
          key,
          filePart(
            request.postDataBuffer() ?? Buffer.alloc(0),
            request.headers()['content-type'] ?? '',
          ),
        );
        return json(route, 200, { Key: `media/${key}`, Id: key });
      }
      const file = cloud.files.get(key);
      return route.fulfill({
        status: 200,
        headers: { ...cors, 'content-type': 'application/octet-stream' },
        body: file ?? Buffer.alloc(0),
      });
    }
    // PostgREST, with the row-level rule: owner_id = the caller.
    const single = (request.headers()['accept'] ?? '').includes(
      'vnd.pgrst.object',
    );
    const eq = (name: string) =>
      url.searchParams.get(name)?.replace(/^eq\./, '') ?? null;
    if (url.pathname === '/rest/v1/projects') {
      const mine = cloud.projects.filter((row) => row.owner_id === owner);
      const summary = ({
        document: _document,
        owner_id: _owner,
        ...rest
      }: Row) => rest;
      const pick = (row: Row) =>
        url.searchParams.get('select')?.includes('document')
          ? { ...summary(row), document: row.document }
          : summary(row);
      const match = (row: Row) =>
        (!eq('id') || row.id === eq('id')) &&
        (!eq('revision') || row.revision === Number(eq('revision')));
      const answer = (rows: Row[], status = 200) =>
        url.searchParams.has('select')
          ? json(route, status, single ? pick(rows[0]!) : rows.map(pick))
          : route.fulfill({ status: 200, headers: cors, body: '' });
      if (request.method() === 'GET')
        return answer(
          mine
            .filter(match)
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
        );
      if (request.method() === 'POST') {
        const input = body() as Partial<Row>;
        const row: Row = {
          id: crypto.randomUUID(),
          owner_id: owner!,
          name: String(input.name),
          schema_version: Number(input.schema_version),
          document: String(input.document),
          thumbnail: input.thumbnail ?? null,
          revision: 1,
          updated_at: new Date().toISOString(),
        };
        cloud.projects.push(row);
        return answer([row], 201);
      }
      if (request.method() === 'PATCH') {
        const rows = mine.filter(match);
        for (const row of rows) {
          Object.assign(row, body(), {
            revision: row.revision + 1,
            updated_at: new Date().toISOString(),
          });
        }
        return answer(rows);
      }
      if (request.method() === 'DELETE') {
        cloud.projects = cloud.projects.filter(
          (row) => !(row.owner_id === owner && match(row)),
        );
        return route.fulfill({ status: 200, headers: cors, body: '' });
      }
    }
    if (url.pathname === '/rest/v1/media') {
      if (request.method() === 'GET') {
        const wanted = (url.searchParams.get('fingerprint') ?? '')
          .replace(/^in\.\(|\)$/g, '')
          .split(',')
          .map((value) => value.replace(/"/g, ''));
        return json(
          route,
          200,
          cloud.media
            .filter(
              (row) =>
                row.owner_id === owner && wanted.includes(row.fingerprint),
            )
            .map((row) => ({ fingerprint: row.fingerprint })),
        );
      }
      const input = body() as { fingerprint: string; name: string };
      if (
        !cloud.media.some(
          (row) =>
            row.owner_id === owner && row.fingerprint === input.fingerprint,
        )
      )
        cloud.media.push({ owner_id: owner!, ...input });
      return route.fulfill({ status: 201, headers: cors, body: '' });
    }
    return json(route, 200, {});
  });
  return cloud;
}
