// Phase 1 library (P1-15): the read-only static server that stands in for
// the CDN. GET and HEAD only, files from the catalog folder only (no owner
// data, no API), on its own port. manifest.json is revalidated (ETag,
// no-cache); everything under files/ is immutable. Any origin may read it,
// as from a CDN.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import path from 'node:path';

const TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};
const ALLOWED =
  /^\/(manifest\.json|files\/[0-9a-f]{64}\.[a-z0-9]{1,5}|versions\/\d+(\.items)?\.json)$/;

export const etagOf = (bytes: Uint8Array) =>
  `"${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}"`;

export interface CatalogResponse {
  status: number;
  headers: Record<string, string>;
  body?: Uint8Array;
}

/** Answers one request (shared by the server and the dev middleware). */
export function catalogResponse(
  dir: string,
  method: string,
  url: string,
  headers: { 'if-none-match'?: string | undefined; range?: string | undefined },
): CatalogResponse {
  const base = {
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'etag, content-length, content-range',
    'x-content-type-options': 'nosniff',
  };
  if (method === 'OPTIONS')
    return {
      status: 204,
      headers: {
        ...base,
        'access-control-allow-methods': 'GET, HEAD',
        'access-control-allow-headers': 'if-none-match, range',
      },
    };
  if (method !== 'GET' && method !== 'HEAD')
    return { status: 405, headers: { ...base, allow: 'GET, HEAD' } };
  const pathname = decodeURIComponent(new URL(url, 'http://catalog').pathname);
  if (!ALLOWED.test(pathname)) return { status: 404, headers: base };
  const file = path.join(dir, pathname);
  if (!existsSync(file) || !statSync(file).isFile())
    return { status: 404, headers: base };
  const bytes = readFileSync(file);
  const etag = etagOf(bytes);
  const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
  const cache =
    pathname === '/manifest.json'
      ? 'no-cache'
      : 'public, max-age=31536000, immutable';
  const common = {
    ...base,
    etag,
    'cache-control': cache,
    'content-type': type,
    'accept-ranges': 'bytes',
  };
  if (headers['if-none-match'] === etag)
    return { status: 304, headers: common };
  const range = /^bytes=(\d*)-(\d*)$/.exec(headers.range ?? '');
  if (range && (range[1] || range[2])) {
    const start = range[1]
      ? Number(range[1])
      : Math.max(0, bytes.length - Number(range[2]));
    const end =
      range[1] && range[2]
        ? Math.min(bytes.length - 1, Number(range[2]))
        : bytes.length - 1;
    if (start >= bytes.length || start > end)
      return {
        status: 416,
        headers: { ...common, 'content-range': `bytes */${bytes.length}` },
      };
    const body = bytes.subarray(start, end + 1);
    return {
      status: 206,
      headers: {
        ...common,
        'content-range': `bytes ${start}-${end}/${bytes.length}`,
        'content-length': String(body.length),
      },
      ...(method === 'GET' ? { body } : {}),
    };
  }
  return {
    status: 200,
    headers: { ...common, 'content-length': String(bytes.length) },
    ...(method === 'GET' ? { body: bytes } : {}),
  };
}

export function startCatalogServer(
  dir: string,
  port: number,
  host = '127.0.0.1',
): Promise<Server> {
  const server = createServer((request, response) => {
    const answer = catalogResponse(
      dir,
      request.method ?? 'GET',
      request.url ?? '/',
      {
        'if-none-match': request.headers['if-none-match'],
        range: request.headers.range,
      },
    );
    response.writeHead(answer.status, answer.headers);
    response.end(answer.body ?? undefined);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}
