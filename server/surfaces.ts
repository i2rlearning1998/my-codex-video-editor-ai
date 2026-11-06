// P4 Part 3: two servers, two surfaces. The user server (the one the editor,
// the panel and the website talk to) has NO admin route at all: no users, no
// credits, no config publishing, no key vault. Those live only on the admin
// surface, which the Owner App starts on its own 127.0.0.1 port behind its
// own login. One list says which paths are admin, and both wrappers use it.
import type { IncomingMessage, ServerResponse } from 'node:http';

type Handler = (req: IncomingMessage, res: ServerResponse) => unknown;

/** True for every path or method+path that is the owner's, not a user's. */
export function isAdminRoute(method: string, path: string): boolean {
  if (path === '/v1/admin' || path.startsWith('/v1/admin/')) return true;
  if (method === 'POST' && path === '/v1/config') return true;
  if (method === 'POST' && path === '/v1/config/publish') return true;
  return false;
}
/** What the admin surface may serve besides the admin routes. */
export function isAdminReadable(method: string, path: string): boolean {
  return (
    isAdminRoute(method, path) ||
    (method === 'GET' && (path === '/v1/config' || path === '/v1/health')) ||
    method === 'OPTIONS'
  );
}
const notFound = (res: ServerResponse) => {
  res.statusCode = 404;
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      error: { code: 'not-found', message: 'Not found.', detail: {} },
    }),
  );
};
const parts = (req: IncomingMessage) => ({
  method: (req.method ?? 'GET').toUpperCase(),
  path: (req.url ?? '/').split('?')[0]!.replace(/\/{2,}/g, '/'),
});

/** The user server: admin routes answer 404, as if they did not exist. */
export function userSurface(handler: Handler): Handler {
  return (req, res) => {
    const { method, path } = parts(req);
    // Case and trailing-slash tricks never reach the real router.
    if (isAdminRoute(method, path.toLowerCase().replace(/\/$/, '')))
      return notFound(res);
    return handler(req, res);
  };
}
/** The admin server: only admin routes, the live config read and health. */
export function adminSurface(handler: Handler): Handler {
  return (req, res) => {
    const { method, path } = parts(req);
    if (!isAdminReadable(method, path)) return notFound(res);
    return handler(req, res);
  };
}
