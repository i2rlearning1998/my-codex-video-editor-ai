// ROUND-C2 Part 1 and 4: the export card's side of the server. A card in a
// chat renders on the person's device; it may only reach our origin (the
// host's CSP lists it in connectDomains and resourceDomains). Here:
// - the card resource (a small HTML shell that loads the engine from us),
// - `/mcp/card/<file>`: the engine bundle and fonts (dist/mcp-card),
// - `/mcp/card/job/<ticket>`: one export job (the project, the settings,
//   the credit lines), and `/mcp/card/media/<ticket>/<fp>`: its media.
// Tickets are signed, short-lived and name one export; the sandboxed
// frame's origin is opaque ("null"), so these answers carry
// `Access-Control-Allow-Origin: *` and never use cookies.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const CARD_URI = 'ui://aive/export-card.html';
export const CARD_MIME = 'text/html;profile=mcp-app';

export interface CardMedia {
  readonly mime: string;
  /** A file on disk, or the bytes. */
  readonly file?: string;
  readonly bytes?: () => Promise<Uint8Array | null>;
}
export interface CardJob {
  readonly exportId: string;
  readonly userId: string;
  readonly videoId: string;
  readonly project: {
    readonly composition: unknown;
    readonly assets: readonly unknown[];
    readonly background: string;
    readonly masterVolume?: number;
  };
  readonly settings: {
    readonly width: number;
    readonly height: number;
    readonly fps: number;
    readonly quality: 'low' | 'medium' | 'high';
    readonly start: number;
    readonly end: number;
    readonly fileName: string;
  };
  /** Plain credit lines (provider, licence, attribution). */
  readonly credits: readonly string[];
  readonly media: Readonly<Record<string, CardMedia>>;
  /** Spike mode: the card also measures and reports (RDC2-001). */
  readonly spike?: boolean;
  readonly createdAt: number;
}

const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
};

export function createCardHost(o: {
  readonly secret: () => string;
  readonly now: () => number;
  readonly cardDir: string;
  /** How long a ticket works (ms). */
  readonly ttlMs?: number;
}) {
  const ttl = o.ttlMs ?? 2 * 60 * 60_000;
  const jobs = new Map<string, CardJob>();
  const sign = (body: string) =>
    createHmac('sha256', o.secret()).update(body).digest('base64url');
  const sweep = () => {
    for (const [id, j] of jobs)
      if (o.now() - j.createdAt > ttl) jobs.delete(id);
  };
  const open = (ticket: string): CardJob | null => {
    const m =
      /^([A-Za-z0-9-]{8,64})\.(\d{10,14})\.([A-Za-z0-9_-]{20,80})$/.exec(
        ticket,
      );
    if (!m) return null;
    const want = Buffer.from(sign(`${m[1]}.${m[2]}`));
    const got = Buffer.from(m[3]!);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    if (Number(m[2]) < o.now()) return null;
    return jobs.get(m[1]!) ?? null;
  };
  const cors = (res: ServerResponse) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('cross-origin-resource-policy', 'cross-origin');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('timing-allow-origin', '*');
  };
  const fail = (res: ServerResponse, status: number, message: string) => {
    cors(res);
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'card', message } }));
  };
  return {
    /** Registers a job; returns its ticket. */
    add(job: Omit<CardJob, 'exportId' | 'createdAt'>): {
      exportId: string;
      ticket: string;
    } {
      sweep();
      const exportId = randomUUID();
      jobs.set(exportId, { ...job, exportId, createdAt: o.now() });
      const exp = String(o.now() + ttl);
      return {
        exportId,
        ticket: `${exportId}.${exp}.${sign(`${exportId}.${exp}`)}`,
      };
    },
    job: (exportId: string) => jobs.get(exportId) ?? null,
    /** The card's HTML: a shell that loads the engine from our origin. */
    html(origin: string): string {
      return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{color-scheme:light dark;--bg:#ffffff;--fg:#1a1c23;--muted:#5d6170;--line:#dcdfe8;--accent:#5b37f0;--accent-fill:#7c5cff;--radius:12px;--gap:12px;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
@media (prefers-color-scheme:dark){:root{--bg:#1a1c23;--fg:#eceef4;--muted:#a3a8b8;--line:#2e3240;--accent:#a591ff}}
body{margin:0;background:var(--bg);color:var(--fg)}#card{padding:var(--gap);display:grid;gap:var(--gap)}
.bar{height:8px;border-radius:999px;background:var(--line);overflow:hidden}.bar>i{display:block;height:100%;width:0;background:var(--accent-fill)}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.muted{color:var(--muted);font-size:12px}
button{font:inherit;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--fg);padding:6px 14px;cursor:pointer}
button.primary{background:var(--accent-fill);border-color:var(--accent-fill);color:#fff}video{width:100%;max-height:70vh;border-radius:var(--radius);background:#000}
</style></head><body><div id="card" aria-live="polite"><div class="muted" id="status">…</div></div>
<script type="module" src="${origin}/mcp/card/card.js"></script></body></html>`;
    },
    /** Serves /mcp/card/*; returns false for other paths. */
    async serve(
      req: IncomingMessage,
      res: ServerResponse,
      url: string,
    ): Promise<boolean> {
      if (!url.startsWith('/mcp/card/')) return false;
      if (req.method === 'OPTIONS') {
        cors(res);
        res.setHeader('access-control-allow-methods', 'GET');
        res.statusCode = 204;
        res.end();
        return true;
      }
      if (req.method !== 'GET') {
        fail(res, 405, 'Only GET.');
        return true;
      }
      const rest = url.slice('/mcp/card/'.length);
      const job = /^job\/([^/]+)$/.exec(rest);
      if (job) {
        const j = open(decodeURIComponent(job[1]!));
        if (!j) {
          fail(res, 404, 'This export has ended. Ask for the export again.');
          return true;
        }
        cors(res);
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            exportId: j.exportId,
            project: j.project,
            settings: j.settings,
            credits: j.credits,
            spike: j.spike === true,
          }),
        );
        return true;
      }
      const media = /^media\/([^/]+)\/([0-9a-f]{32})$/.exec(rest);
      if (media) {
        const j = open(decodeURIComponent(media[1]!));
        const m = j?.media[media[2]!];
        if (!j || !m) {
          fail(res, 404, 'This file is not part of the export.');
          return true;
        }
        cors(res);
        res.setHeader('content-type', m.mime);
        if (m.file) {
          res.setHeader('content-length', String(statSync(m.file).size));
          createReadStream(m.file).pipe(res);
        } else {
          const bytes = await m.bytes?.();
          if (!bytes) {
            fail(res, 404, 'This file is missing.');
            return true;
          }
          res.end(Buffer.from(bytes));
        }
        return true;
      }
      // The engine bundle, its chunks and fonts.
      const file = path.resolve(o.cardDir, rest.split('?')[0]!);
      if (
        !file.startsWith(path.resolve(o.cardDir) + path.sep) ||
        !existsSync(file) ||
        !statSync(file).isFile()
      ) {
        fail(res, 404, 'Not found.');
        return true;
      }
      cors(res);
      res.setHeader(
        'content-type',
        TYPES[path.extname(file)] ?? 'application/octet-stream',
      );
      res.end(await readFile(file));
      return true;
    },
  };
}
export type CardHost = ReturnType<typeof createCardHost>;
