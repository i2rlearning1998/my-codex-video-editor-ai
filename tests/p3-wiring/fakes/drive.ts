// A local FAKE of the Google Drive REST v3 endpoints the drive backend uses
// (files.list with q, files.create for a folder, multipart upload, media
// update, alt=media download, delete). It is not Google Drive.
import { createServer, type IncomingMessage } from 'node:http';

interface DriveFile {
  id: string;
  name: string;
  parents: string[];
  mimeType: string;
  bytes: Buffer;
}
export interface FakeDrive {
  readonly url: string;
  readonly token: string;
  readonly files: Map<string, DriveFile>;
  readonly seen: string[];
  close(): Promise<void>;
}
const body = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
};

export async function startFakeDrive(
  token = 'drive-token-xyz',
): Promise<FakeDrive> {
  const files = new Map<string, DriveFile>();
  const seen: string[] = [];
  let n = 0;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    seen.push(`${req.method} ${url.pathname}`);
    const json = (status: number, v: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(v));
    };
    if (req.headers.authorization !== `Bearer ${token}`)
      return json(401, {
        error: { code: 401, message: 'Invalid Credentials' },
      });
    const raw = await body(req);
    const p = url.pathname;
    const id = /\/files\/([^/]+)$/.exec(p)?.[1];
    if (req.method === 'GET' && p === '/drive/v3/files') {
      const q = url.searchParams.get('q') ?? '';
      const name = /name='((?:\\'|[^'])*)'/.exec(q)?.[1]?.replace(/\\'/g, "'");
      const parent = /'([^']+)' in parents/.exec(q)?.[1];
      const folderOnly = q.includes(
        "mimeType='application/vnd.google-apps.folder'",
      );
      let list = [...files.values()].filter(
        (f) =>
          (!name || f.name === name) &&
          (!parent || f.parents.includes(parent)) &&
          (!folderOnly || f.mimeType === 'application/vnd.google-apps.folder'),
      );
      const size = Number(url.searchParams.get('pageSize') ?? 100);
      const start = Number(url.searchParams.get('pageToken') ?? 0);
      const page = list.slice(start, start + Math.min(size, 2)); // small pages
      list = page;
      return json(200, {
        files: list.map((f) => ({
          id: f.id,
          name: f.name,
          size: String(f.bytes.length),
        })),
        ...(start + page.length <
        [...files.values()].filter(
          (f) =>
            (!name || f.name === name) &&
            (!parent || f.parents.includes(parent)),
        ).length
          ? { nextPageToken: String(start + page.length) }
          : {}),
      });
    }
    if (req.method === 'POST' && p === '/drive/v3/files') {
      const meta = JSON.parse(raw.toString('utf8')) as {
        name: string;
        mimeType: string;
      };
      const f = {
        id: `f${++n}`,
        name: meta.name,
        parents: [],
        mimeType: meta.mimeType,
        bytes: Buffer.alloc(0),
      };
      files.set(f.id, f);
      return json(200, { id: f.id });
    }
    if (req.method === 'POST' && p === '/upload/drive/v3/files') {
      if (url.searchParams.get('uploadType') !== 'multipart')
        return json(400, {});
      const boundary = /boundary=([^;]+)/.exec(
        String(req.headers['content-type']),
      )?.[1];
      if (!boundary) return json(400, {});
      const text = raw.toString('latin1');
      const parts = text.split(`--${boundary}`).slice(1, -1);
      const [metaPart, dataPart] = parts.map((x) => {
        const i = x.indexOf('\r\n\r\n');
        return { head: x.slice(0, i), data: x.slice(i + 4, -2) };
      });
      const meta = JSON.parse(
        Buffer.from(metaPart!.data, 'latin1').toString('utf8'),
      ) as {
        name: string;
        parents: string[];
      };
      const mime = /content-type: ([^\r\n]+)/i.exec(dataPart!.head)?.[1] ?? '';
      const f = {
        id: `f${++n}`,
        name: meta.name,
        parents: meta.parents ?? [],
        mimeType: mime,
        bytes: Buffer.from(dataPart!.data, 'latin1'),
      };
      files.set(f.id, f);
      return json(200, { id: f.id });
    }
    if (req.method === 'PATCH' && id && p.startsWith('/upload/')) {
      const f = files.get(id);
      if (!f) return json(404, {});
      f.bytes = raw;
      return json(200, { id });
    }
    if (req.method === 'GET' && id && url.searchParams.get('alt') === 'media') {
      const f = files.get(id);
      if (!f) return json(404, {});
      res.writeHead(200, { 'content-type': f.mimeType });
      return res.end(f.bytes);
    }
    if (req.method === 'DELETE' && id) {
      files.delete(id);
      res.writeHead(204);
      return res.end();
    }
    return json(404, { error: { message: 'not found' } });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    url,
    token,
    files,
    seen,
    close: () => new Promise((r) => server.close(() => r())),
  };
}
