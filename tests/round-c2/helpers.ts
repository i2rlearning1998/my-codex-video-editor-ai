// ROUND-C2: the server in this process with the Claude connector, the OAuth
// handshake a hosted Claude does, and an MCP SDK client that plays Claude.
// Loopback HTTP only; providers are local fakes.
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { defaultConfig, type PlatformConfig } from '../../src/platform-config';
import { memoryStore, type Store } from '../../server/store';
import { startServer, type Started } from '../server/helpers';
import {
  fakeProvider,
  startFakeRest,
  type FakeRest,
} from '../round-c1/fake-rest';

export const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
export interface C2 extends Started {
  readonly fake: FakeRest;
  readonly store: Store;
  admin: string;
  publish(edit: (c: PlatformConfig) => void): Promise<void>;
  /** The full OAuth dance for a person; returns the tokens. */
  connect(
    person: string,
  ): Promise<{ access: string; refresh: string; clientId: string }>;
  claude(token: string): Promise<Client>;
  /** One tool call; the text of its answer. */
  call(
    client: Client,
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{ text: string; isError: boolean; raw: unknown }>;
  close(): Promise<void>;
}
const VIDEO = readFileSync(
  'tests/fixtures/media/video_testsrc_720p_2s_vp9_opus.webm',
);
const PHOTO = readFileSync('tests/fixtures/media/image_testsrc_1200x800.jpg');

export async function startC2(
  env: Record<string, string> = {},
  edit: (c: PlatformConfig) => void = () => {},
): Promise<C2> {
  const fake = await startFakeRest();
  const store = memoryStore();
  const s = await startServer(
    { FAKESTOCK_KEY: 'server-only-key', MCP_TEST_MODE: '1', ...env },
    store,
    {
      toolRuntime: {
        // Downloads of the fake provider's files answer with real bytes.
        fetch: async (url, init) => {
          const u = new URL(url);
          if (u.pathname === '/files/101.mp4')
            return new Response(VIDEO, {
              headers: { 'content-type': 'video/webm' },
            }) as never;
          if (u.pathname.startsWith('/files/'))
            return new Response(PHOTO, {
              headers: { 'content-type': 'image/jpeg' },
            }) as never;
          return fake.fetch(url, init);
        },
        resolve: fake.resolve,
      },
    },
  );
  const admin = s.token('admin-0000', { app_metadata: { role: 'admin' } });
  const c2: C2 = {
    ...s,
    fake,
    store,
    admin,
    async publish(e) {
      const c = defaultConfig();
      c.mediaProviders.push(fakeProvider());
      edit(c);
      e(c);
      const r = await s.api('/v1/config', {
        token: admin,
        body: { config: c, note: 'c2', publish: true },
      });
      if (r.status !== 200) throw new Error(JSON.stringify(r.body));
    },
    async connect(person) {
      const reg = await fetch(`${s.url}/oauth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Claude',
          redirect_uris: [CALLBACK],
          token_endpoint_auth_method: 'none',
        }),
      });
      const clientId = ((await reg.json()) as { client_id: string }).client_id;
      const verifier = randomBytes(32).toString('base64url');
      const challenge = createHash('sha256')
        .update(verifier)
        .digest('base64url');
      const q = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: CALLBACK,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: 'st',
        scope: 'mcp',
      });
      const auth = await fetch(`${s.url}/oauth/authorize?${q}`, {
        redirect: 'manual',
      });
      const request = /request=([0-9a-f-]+)/.exec(
        auth.headers.get('location') ?? '',
      )![1]!;
      const ok = await s.api('/v1/mcp/consent', {
        token: s.token(person),
        body: { request, allow: true },
      });
      const code = new URL(ok.body.redirect as string).searchParams.get(
        'code',
      )!;
      const tok = await fetch(`${s.url}/oauth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: CALLBACK,
          client_id: clientId,
          code_verifier: verifier,
        }),
      });
      const t = (await tok.json()) as {
        access_token: string;
        refresh_token: string;
      };
      return { access: t.access_token, refresh: t.refresh_token, clientId };
    },
    async claude(token) {
      const client = new Client({ name: 'claude-test', version: '1.0.0' });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${s.url}/mcp`), {
          requestInit: { headers: { authorization: `Bearer ${token}` } },
        }),
      );
      return client;
    },
    async call(client, name, args = {}) {
      const r = await client.callTool({ name, arguments: args });
      const text = (r.content as { type: string; text?: string }[])
        .filter((x) => x.type === 'text')
        .map((x) => x.text)
        .join('\n');
      return { text, isError: r.isError === true, raw: r };
    },
    async close() {
      await s.close();
      await fake.close();
    },
  };
  await c2.publish(() => {});
  return c2;
}
