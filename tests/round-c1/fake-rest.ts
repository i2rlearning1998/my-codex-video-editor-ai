// ROUND-C1: a fake REST stock provider on a real local HTTP server. The
// gateway's guard sees its public-looking host name; the test transport
// sends the request to 127.0.0.1 (the only seam: production uses fetch and
// real DNS).
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { HttpFetch, Resolver } from '../../src/tools/net-guard';
import type { MediaProvider } from '../../src/platform-config';

export const FAKE_HOST = 'stock.fake-provider.test';
export const PUBLIC_IP = '93.184.216.34';
export interface FakeRest {
  readonly url: string;
  readonly calls: string[];
  readonly fetch: HttpFetch;
  readonly resolve: Resolver;
  close(): Promise<void>;
}
const ITEMS = [
  {
    pid: 101,
    caption: 'River delta at dawn',
    w: 1920,
    h: 1080,
    secs: 18,
    lic: 'free',
    by: 'Asha',
    thumb: 'small/101.jpg',
    file: 'files/101.mp4',
    kw: 'river,delta',
  },
  {
    pid: 102,
    caption: 'Old stone fort',
    w: 2400,
    h: 1600,
    secs: 0,
    lic: 'free',
    by: 'Ravi',
    thumb: 'small/102.jpg',
    file: 'files/102.jpg',
    kw: 'fort,history',
  },
  {
    pid: 103,
    caption: 'Fort gate',
    w: 2400,
    h: 1600,
    secs: 0,
    lic: 'editorial',
    by: 'Mo',
    thumb: 'small/103.jpg',
    file: 'files/103.jpg',
    kw: 'fort',
  },
];
export async function startFakeRest(): Promise<FakeRest> {
  const calls: string[] = [];
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    calls.push(
      `${url.pathname}${url.search}|${req.headers['x-api-key'] ?? ''}`,
    );
    const q = (url.searchParams.get('term') ?? '').toLowerCase();
    const json = (body: unknown, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === '/v2/search') {
      if (q === 'nothing') return json({ data: { hits: [] } });
      if (q === 'badformat') return json({ data: { hits: 'oops' } });
      if (q === 'notjson') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end('<html>hello</html>');
      }
      if (q === 'huge') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(
          JSON.stringify({
            data: { hits: [], pad: 'x'.repeat(3 * 1024 * 1024) },
          }),
        );
      }
      if (q === 'error') return json({ message: 'down' }, 500);
      if (q === 'slow')
        return void setTimeout(() => json({ data: { hits: [] } }), 3000);
      if (q === 'private') {
        res.writeHead(302, { location: 'https://10.0.0.7/steal' });
        return res.end();
      }
      if (q === 'sneaky') {
        res.writeHead(302, { location: `https://inside.fake-provider.test/x` });
        return res.end();
      }
      const hits = ITEMS.filter((i) =>
        q
          .split(/\s+/)
          .some((w) => i.kw.includes(w) || i.caption.toLowerCase().includes(w)),
      );
      return json({
        data: {
          hits: hits.map((i) => ({
            pid: i.pid,
            caption: i.caption,
            size: { w: i.w, h: i.h },
            secs: i.secs,
            lic: i.lic,
            credit: { name: i.by },
            links: {
              thumb: `https://${FAKE_HOST}/${i.thumb}`,
              file: `https://${FAKE_HOST}/${i.file}`,
            },
            kw: i.kw,
          })),
        },
      });
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  return {
    url: base,
    calls,
    fetch: (url, init) => {
      const u = new URL(url);
      return fetch(`${base}${u.pathname}${u.search}`, init as RequestInit);
    },
    resolve: async (host) =>
      host === FAKE_HOST
        ? [PUBLIC_IP]
        : host === `inside.${FAKE_HOST.split('.').slice(1).join('.')}`
          ? ['127.0.0.1']
          : host.endsWith('.test')
            ? [PUBLIC_IP]
            : ['10.1.1.1'],
    close: () => new Promise((r) => server.close(() => r())),
  };
}
/** The provider entry the owner adds in Platform Config (no code change). */
export const fakeProvider = (
  over: Partial<MediaProvider> = {},
): MediaProvider => ({
  id: 'fakestock',
  name: 'Fake Stock',
  kinds: ['stock-photo', 'stock-video'],
  enabled: true,
  plans: [],
  costPerCall: 0,
  rateLimit: { perMinute: 60 },
  hint: {
    en: 'Documentary footage and photos.',
    hi: 'डॉक्यूमेंट्री फ़ुटेज और तस्वीरें।',
  },
  licences: [],
  adapter: {
    type: 'rest',
    descriptor: {
      baseUrl: `https://${FAKE_HOST}`,
      searchPath: '/v2/search',
      auth: {
        style: 'header',
        name: 'x-api-key',
        prefix: '',
        keyRef: 'FAKESTOCK_KEY',
      },
      request: {
        query: 'term',
        orientation: 'orient',
        page: 'p',
        limit: 'n',
        fixed: {},
        orientationValues: {
          landscape: 'wide',
          portrait: 'tall',
          square: 'square',
        },
      },
      response: {
        items: 'data.hits',
        id: 'pid',
        title: 'caption',
        thumbnail: 'links.thumb',
        download: 'links.file',
        width: 'size.w',
        height: 'size.h',
        duration: 'secs',
        licence: 'lic',
        attribution: 'credit.name',
        tags: 'kw',
      },
      defaultLicence: 'provider-licence',
      timeoutMs: 1000,
      maxBytes: 1024 * 1024,
      maxItems: 40,
    },
  },
  ...over,
});
