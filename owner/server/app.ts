// Phase 1 library manager (P1-12 to P1-14): the owner app, its own small
// server (node:http, no framework). It binds to 127.0.0.1 only, sends no
// CORS headers (the editor can never call it), checks the Host and Origin
// headers, uses an HttpOnly SameSite=Strict session cookie, a CSRF token
// on every change, a fresh re-authentication (5 minutes) for dangerous
// actions, and writes every action to the append-only audit log.
import { readFileSync } from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { AuditLog } from './audit';
import { Accounts, Sessions, csrfOk, reauthFresh, type Session } from './auth';
import { OwnerLibrary, type LibraryConfig } from './library';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const COOKIE = 'aive_owner';
const JSON_LIMIT = 1024 * 1024;
const UPLOAD_LIMIT = 600 * 1024 * 1024;
/** Actions that need a password and code from the last 5 minutes. */
export const DANGEROUS = new Set([
  'unpublish',
  'delete',
  'rollback',
  'rotate-key',
]);

export interface OwnerAppConfig extends LibraryConfig {
  readonly port: number;
  /** The catalog server's address (the preview links and the CSP). */
  readonly catalogUrl: string;
  readonly secureCookie?: boolean;
  readonly now?: () => number;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** The owner UI, transpiled from TypeScript once at start (no bundler). */
function uiScript(): string {
  const source = readFileSync(path.join(root, 'owner/ui/app.ts'), 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
}

export function securityHeaders(catalogUrl: string): Record<string, string> {
  const catalog = new URL(catalogUrl).origin;
  return {
    'content-security-policy': [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      `img-src 'self' data: ${catalog}`,
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
    ].join('; '),
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'cache-control': 'no-store',
  };
}

const readBody = (request: IncomingMessage, limit: number) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'The upload is too large.'));
        request.destroy();
      } else chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
const cookieOf = (request: IncomingMessage) =>
  (request.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim().split('='))
    .find(([key]) => key === COOKIE)?.[1];

export function createOwnerApp(config: OwnerAppConfig): {
  server: Server;
  accounts: Accounts;
  audit: AuditLog;
  sessions: Sessions;
} {
  const now = config.now ?? Date.now;
  const accounts = new Accounts(config.dataDir);
  const audit = new AuditLog(config.dataDir);
  const sessions = new Sessions();
  const library = new OwnerLibrary(config);
  const headers = securityHeaders(config.catalogUrl);
  const script = uiScript();
  const css = readFileSync(path.join(root, 'owner/ui/app.css'), 'utf8');
  const tokens = readFileSync(path.join(root, 'src/ui/tokens.css'), 'utf8');
  const page = readFileSync(
    path.join(root, 'owner/ui/index.html'),
    'utf8',
  ).replace('%CATALOG%', config.catalogUrl);
  const allowedHosts = new Set([
    `127.0.0.1:${config.port}`,
    `localhost:${config.port}`,
  ]);

  const send = (
    response: ServerResponse,
    status: number,
    body: string | Buffer,
    type: string,
    extra: Record<string, string> = {},
  ) => {
    response.writeHead(status, { ...headers, 'content-type': type, ...extra });
    response.end(body);
  };
  const json = (
    response: ServerResponse,
    status: number,
    value: unknown,
    extra: Record<string, string> = {},
  ) =>
    send(
      response,
      status,
      JSON.stringify(value),
      'application/json; charset=utf-8',
      extra,
    );

  const log = (
    session: Session | null,
    action: string,
    target?: string,
    detail?: string,
    ok = true,
  ) =>
    audit.append({
      actor: session?.email ?? 'anonymous',
      action,
      ...(target !== undefined ? { target } : {}),
      ...(detail !== undefined ? { detail } : {}),
      ok,
      time: new Date(now()).toISOString(),
    });

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const method = request.method ?? 'GET';
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${config.port}`);
    // DNS-rebinding guard: only our own host names.
    if (!allowedHosts.has(request.headers.host ?? ''))
      throw new HttpError(421, 'Unknown host.');
    if (method === 'GET' && url.pathname === '/')
      return send(response, 200, page, 'text/html; charset=utf-8');
    if (method === 'GET' && url.pathname === '/app.js')
      return send(response, 200, script, 'text/javascript; charset=utf-8');
    if (method === 'GET' && url.pathname === '/app.css')
      return send(response, 200, css, 'text/css; charset=utf-8');
    if (method === 'GET' && url.pathname === '/tokens.css')
      return send(response, 200, tokens, 'text/css; charset=utf-8');
    if (!url.pathname.startsWith('/api/'))
      throw new HttpError(404, 'Not found.');

    if (method !== 'GET') {
      // A change must come from this app's own page.
      const origin = request.headers.origin;
      if (!origin || !allowedHosts.has(new URL(origin).host))
        throw new HttpError(
          403,
          'This request did not come from the library manager.',
        );
    }
    const session = sessions.find(cookieOf(request), now());
    const route = `${method} ${url.pathname}`;

    if (route === 'POST /api/login') {
      if (
        !(request.headers['content-type'] ?? '').startsWith('application/json')
      )
        throw new HttpError(415, 'Send JSON.');
      const body = JSON.parse(
        (await readBody(request, JSON_LIMIT)).toString() || '{}',
      ) as {
        email?: string;
        password?: string;
        code?: string;
      };
      const result = accounts.check(
        body.email ?? '',
        body.password ?? '',
        body.code ?? '',
        now(),
      );
      if (!result.ok) {
        log(null, 'login', body.email, result.reason, false);
        throw new HttpError(
          result.reason === 'locked' ? 423 : 401,
          result.reason === 'locked'
            ? 'Too many wrong tries. Log in again after 15 minutes.'
            : 'The email, password or code is wrong.',
        );
      }
      const created = sessions.create(accounts.read()!.email, now());
      log(created, 'login');
      return json(
        response,
        200,
        { email: created.email, csrf: created.csrf },
        {
          'set-cookie': `${COOKIE}=${created.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${config.secureCookie ? '; Secure' : ''}`,
        },
      );
    }
    if (!session) throw new HttpError(401, 'Log in first.');
    if (
      method !== 'GET' &&
      !csrfOk(session, request.headers['x-csrf-token'] as string | undefined)
    ) {
      log(session, 'csrf-refused', route, undefined, false);
      throw new HttpError(
        403,
        'The page is out of date. Reload it and try again.',
      );
    }
    const body = async () =>
      JSON.parse(
        (await readBody(request, JSON_LIMIT)).toString() || '{}',
      ) as Record<string, unknown>;
    const fresh = (action: string, target?: string) => {
      if (!reauthFresh(session, now())) {
        log(session, action, target, 'needs re-authentication', false);
        throw new HttpError(403, 'Confirm your password and code to do this.', {
          reauth: true,
        });
      }
    };

    if (route === 'GET /api/session')
      return json(response, 200, { email: session.email, csrf: session.csrf });
    if (route === 'POST /api/logout') {
      sessions.remove(session.id);
      log(session, 'logout');
      return json(
        response,
        200,
        { ok: true },
        {
          'set-cookie': `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
        },
      );
    }
    if (route === 'POST /api/reauth') {
      const input = (await body()) as { password?: string; code?: string };
      const result = accounts.check(
        session.email,
        input.password ?? '',
        input.code ?? '',
        now(),
      );
      if (!result.ok) {
        log(session, 'reauth', undefined, result.reason, false);
        throw new HttpError(
          result.reason === 'locked' ? 423 : 401,
          'The password or code is wrong.',
        );
      }
      session.reauthAt = now();
      log(session, 'reauth');
      return json(response, 200, { ok: true });
    }
    if (route === 'GET /api/taxonomy')
      return json(response, 200, library.taxonomy());
    if (route === 'POST /api/taxonomy') {
      const input = await body();
      const { build, id } = library.taxonomyOp(input as never);
      log(
        session,
        'taxonomy',
        String(input.op),
        JSON.stringify(input).slice(0, 200),
      );
      return json(response, 200, { catalogVersion: build.catalogVersion, id });
    }
    if (route === 'GET /api/items')
      return json(response, 200, {
        categories: library.categories(),
        items: library.list({
          ...(url.searchParams.get('category')
            ? { category: url.searchParams.get('category')! }
            : {}),
          ...(url.searchParams.get('sub')
            ? { sub: url.searchParams.get('sub')! }
            : {}),
          ...(url.searchParams.get('section')
            ? { section: url.searchParams.get('section')! }
            : {}),
          ...(url.searchParams.get('q')
            ? { q: url.searchParams.get('q')! }
            : {}),
        }),
      });
    if (method === 'GET' && url.pathname.startsWith('/api/file/')) {
      const file = library.filePath(url.pathname.slice('/api/file/'.length));
      if (!file) throw new HttpError(404, 'Not found.');
      const ext = path.extname(file);
      const type = {
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.webp': 'image/webp',
      }[ext];
      if (!type) throw new HttpError(404, 'Not found.');
      return send(response, 200, readFileSync(file), type, {
        'cache-control': 'private, max-age=3600',
      });
    }
    if (route === 'POST /api/upload') {
      const name = decodeURIComponent(
        (request.headers['x-file-name'] as string | undefined) ?? '',
      );
      if (!name || name.includes('/') || name.includes('\\'))
        throw new HttpError(400, 'The file has no name.');
      const bytes = await readBody(request, UPLOAD_LIMIT);
      const license = url.searchParams.get('license')?.trim();
      const credit = url.searchParams.get('credit')?.trim();
      const placeCategory = url.searchParams.get('category');
      const place = placeCategory
        ? {
            category: placeCategory,
            sub: url.searchParams.get('sub') || null,
            section: url.searchParams.get('section') || null,
          }
        : undefined;
      const { result, lines } = await library.upload(
        [{ name, bytes }],
        license ? { name: license, ...(credit ? { credit } : {}) } : undefined,
        place,
      );
      log(
        session,
        'upload',
        name,
        lines.join(' '),
        result.gate.accepted.length > 0,
      );
      return json(response, 200, {
        lines,
        accepted: result.gate.accepted,
        rejected: result.gate.rejected,
        catalogVersion: result.build?.catalogVersion ?? null,
      });
    }
    const itemRoute =
      /^\/api\/items\/([a-z0-9-]{3,64})(?:\/(publish|unpublish|delete))?$/.exec(
        url.pathname,
      );
    if (method === 'POST' && itemRoute) {
      const [, id, action] = itemRoute as unknown as [
        string,
        string,
        string | undefined,
      ];
      if (action === 'delete') {
        fresh('delete', id);
        const build = library.remove(id);
        log(session, 'delete', id);
        return json(response, 200, { catalogVersion: build.catalogVersion });
      }
      if (action === 'unpublish') {
        fresh('unpublish', id);
        const { build } = library.update(id, { published: false });
        log(session, 'unpublish', id);
        return json(response, 200, { catalogVersion: build.catalogVersion });
      }
      if (action === 'publish') {
        const { build } = library.update(id, { published: true });
        log(session, 'publish', id);
        return json(response, 200, { catalogVersion: build.catalogVersion });
      }
      const change = await body();
      const { item, build } = library.update(id, change as never);
      log(session, 'update', id, Object.keys(change).join(', '));
      return json(response, 200, {
        item,
        catalogVersion: build.catalogVersion,
      });
    }
    if (route === 'GET /api/versions')
      return json(response, 200, { versions: library.versions() });
    if (route === 'POST /api/rollback') {
      const to = Number((await body()).to);
      fresh('rollback', String(to));
      const build = library.rollback(to);
      log(
        session,
        'rollback',
        String(to),
        `catalog version ${build.catalogVersion}`,
      );
      return json(response, 200, { catalogVersion: build.catalogVersion });
    }
    if (route === 'POST /api/rotate-key') {
      fresh('rotate-key');
      const rotated = library.rotateKey();
      log(session, 'rotate-key', rotated.keyId);
      return json(response, 200, {
        keyId: rotated.keyId,
        publicKey: rotated.publicKey,
        catalogVersion: rotated.build.catalogVersion,
      });
    }
    if (route === 'GET /api/audit')
      return json(response, 200, {
        rows: audit.rows(),
        broken: audit.verify(),
      });
    throw new HttpError(404, 'Not found.');
  }

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      const status = error instanceof HttpError ? error.status : 400;
      const message = error instanceof Error ? error.message : String(error);
      if (!response.headersSent)
        json(response, status, {
          error: message,
          ...(error instanceof HttpError ? error.extra : {}),
        });
      else response.end();
    });
  });
  return { server, accounts, audit, sessions };
}

export function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
}
