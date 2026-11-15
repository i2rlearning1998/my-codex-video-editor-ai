// ROUND-C2 (2.1, 2.2): where the Claude connector joins the existing server.
// server/app.ts hands /mcp, /oauth, /.well-known/oauth-* and /v1/mcp/*
// here after its origin check and per-address rate limit. This file decides
// who is calling, applies the owner's switches (Platform Config `mcp`, the
// emergency switch `mcpOff`, a suspended person), and answers.
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PlatformConfig } from '../../src/platform-config';
import type { Caller } from '../auth';
import type { Store } from '../store';
import { createCardHost } from './card';
import { createFrameStore } from './frames';
import { buildServer, handleMcp } from './index';
import { createOAuth, OAuthError } from './oauth';
import { createMcpTools, type McpServices } from './tools';

/** Bodies of /mcp may carry plans and sample frames. */
export const MCP_MAX_BODY = 8 * 1024 * 1024;
const SMALL_BODY = 64 * 1024;

export class McpHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface McpMountDeps {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly now: () => number;
  readonly store: Store;
  readonly config: () => Promise<PlatformConfig>;
  /** The panel's sign-in (for the consent page and Door 4). */
  readonly authenticate: (header: string | undefined) => Promise<Caller>;
  /** The rest of the server the tools use (credits, usage, the shared tools). */
  readonly services: Omit<McpServices, 'card' | 'frames' | 'store' | 'now'>;
  readonly log?: (line: string) => void;
}

async function readText(req: IncomingMessage, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit)
      throw new McpHttpError(413, 'too-large', 'The request is too large.');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}
const json = (text: string): Record<string, unknown> => {
  try {
    const v = JSON.parse(text || '{}') as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v))
      return v as Record<string, unknown>;
  } catch {
    /* below */
  }
  throw new McpHttpError(400, 'bad-request', 'The request is not valid JSON.');
};
const reply = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
};

export function createMcpMount(d: McpMountDeps) {
  const fallbackSecret = randomBytes(32).toString('hex');
  const secret = () =>
    d.env.MCP_SECRET ?? d.env.LOCAL_AUTH_SECRET ?? fallbackSecret;
  const card = createCardHost({
    secret,
    now: d.now,
    cardDir: d.env.MCP_CARD_DIR ?? path.resolve('dist/mcp-card'),
  });
  const frames = createFrameStore(d.now);
  const oauth = createOAuth({
    store: d.store,
    now: d.now,
    secret,
    testMode: () => d.env.MCP_TEST_MODE === '1',
  });
  const origin = (req: IncomingMessage) =>
    (
      d.env.MCP_PUBLIC_URL ?? `http://${req.headers.host ?? '127.0.0.1'}`
    ).replace(/\/$/, '');
  const panelUrl = () =>
    (
      d.env.MCP_PANEL_URL ??
      (d.env.SERVER_ORIGINS ?? 'http://127.0.0.1:5173').split(',')[0]!
    ).replace(/\/$/, '');
  const tools = createMcpTools({
    ...d.services,
    store: d.store,
    now: d.now,
    card,
    frames,
  });

  /** The developer token (2.2): off unless MCP_DEV_TOKEN is set. */
  const devUser = (header: string | undefined): string | null => {
    const token = d.env.MCP_DEV_TOKEN;
    if (!token || token.length < 16) return null;
    // Never in a hosted build unless explicitly allowed there too.
    if (
      d.env.AUTH_MODE === 'supabase' &&
      d.env.MCP_DEV_TOKEN_IN_SUPABASE !== '1'
    )
      return null;
    return header === `Bearer ${token}`
      ? (d.env.MCP_DEV_USER ?? '00000000-0000-4000-8000-00000000d0e1')
      : null;
  };

  /** Who calls /mcp, after every switch (one request, one decision). */
  async function caller(req: IncomingMessage, config: PlatformConfig) {
    let userId = devUser(req.headers.authorization);
    if (!userId)
      try {
        userId = (await oauth.verify(req.headers.authorization)).userId;
      } catch (e) {
        throw e instanceof OAuthError
          ? new McpHttpError(401, 'auth', e.message)
          : e;
      }
    const emergency = await d.store.emergency();
    if (!config.mcp.enabled || emergency.mcpOff)
      throw new McpHttpError(
        503,
        'mcp-off',
        'The video platform has paused its Claude connection for now. Tell the person to try again later; nothing was changed or charged.',
      );
    if ((await d.store.profile(userId))?.suspended)
      throw new McpHttpError(
        403,
        'suspended',
        'This account is paused. The person can contact support from the panel.',
      );
    return userId;
  }

  const owns = (p: string) =>
    p === '/mcp' ||
    p.startsWith('/mcp/') ||
    p.startsWith('/oauth/') ||
    p.startsWith('/.well-known/oauth-') ||
    p.startsWith('/v1/mcp/');

  async function handle(req: IncomingMessage, res: ServerResponse, p: string) {
    if (await card.serve(req, res, p)) return;
    const o = origin(req);
    const method = req.method ?? 'GET';
    try {
      // Discovery (RFC 9728, RFC 8414).
      if (
        method === 'GET' &&
        (p === '/.well-known/oauth-protected-resource' ||
          p === '/.well-known/oauth-protected-resource/mcp')
      )
        return reply(res, 200, oauth.protectedResource(o));
      if (method === 'GET' && p === '/.well-known/oauth-authorization-server')
        return reply(res, 200, oauth.authorizationServer(o));
      if (method === 'POST' && p === '/oauth/register')
        return reply(
          res,
          201,
          await oauth.register(json(await readText(req, SMALL_BODY))),
        );
      if (method === 'GET' && p === '/oauth/authorize') {
        const q = new URL(req.url ?? '/', 'http://x').searchParams;
        const id = await oauth.authorize(q);
        res.statusCode = 302;
        res.setHeader(
          'location',
          `${panelUrl()}/panel/#/connect-claude?request=${id}`,
        );
        return void res.end();
      }
      if (method === 'POST' && p === '/oauth/token')
        return reply(
          res,
          200,
          await oauth.token(
            new URLSearchParams(await readText(req, SMALL_BODY)),
          ),
        );
      if (method === 'POST' && p === '/oauth/revoke') {
        await oauth.revoke(
          new URLSearchParams(await readText(req, SMALL_BODY)),
        );
        return reply(res, 200, {});
      }
    } catch (e) {
      if (e instanceof OAuthError)
        return reply(res, e.status, {
          error: e.error,
          error_description: e.message,
        });
      throw e;
    }
    // The panel's side: the consent page and Door 4 (the person's sign-in).
    if (p.startsWith('/v1/mcp/')) {
      const person = await d.authenticate(req.headers.authorization);
      const body =
        method === 'POST' ? json(await readText(req, SMALL_BODY)) : {};
      if (method === 'GET' && p === '/v1/mcp/consent') {
        const id = new URL(req.url ?? '/', 'http://x').searchParams.get(
          'request',
        );
        const info = id ? oauth.consentInfo(id) : null;
        if (!info)
          throw new McpHttpError(
            404,
            'expired',
            'This request has expired. Go back to Claude and connect again.',
          );
        return reply(res, 200, info);
      }
      if (method === 'POST' && p === '/v1/mcp/consent') {
        if (typeof body.request !== 'string' || typeof body.allow !== 'boolean')
          throw new McpHttpError(400, 'bad-request', 'The answer is missing.');
        try {
          return reply(res, 200, {
            redirect: oauth.consent(body.request, person.userId, body.allow),
          });
        } catch (e) {
          if (e instanceof OAuthError)
            throw new McpHttpError(e.status, e.error, e.message);
          throw e;
        }
      }
      if (method === 'GET' && p === '/v1/mcp/connections') {
        const list = await d.store.mcpConnections(person.userId);
        return reply(res, 200, {
          address: `${o}/mcp`,
          connections: list
            .filter((c) => !c.revokedAt)
            .map((c) => ({
              id: c.id,
              client: c.clientName,
              createdAt: c.createdAt,
              lastUsedAt: c.lastUsedAt,
            })),
        });
      }
      if (method === 'POST' && p === '/v1/mcp/connections/revoke') {
        const id = typeof body.id === 'string' ? body.id : null;
        return reply(res, 200, {
          revoked: await oauth.revokeConnection(id, person.userId),
        });
      }
      // Part 3: a Claude video's media bytes for the panel (local mode).
      const media = /^\/v1\/mcp\/media\/([0-9a-f]{32})$/.exec(p);
      if (method === 'GET' && media) {
        const rec = await d.store.mediaRecord(person.userId, media[1]!);
        const bytes = rec
          ? await d.store.mediaBytes(person.userId, media[1]!)
          : null;
        if (!rec || !bytes)
          throw new McpHttpError(404, 'not-found', 'This file is missing.');
        res.statusCode = 200;
        res.setHeader('content-type', rec.mimeType);
        res.setHeader('cache-control', 'no-store');
        return void res.end(Buffer.from(bytes));
      }
      // Part 3: the panel reads what Claude made (Projects, Videos, sheet).
      const panel = await tools.panelRoute(method, p, body, person.userId);
      if (panel !== undefined) return reply(res, 200, panel);
      throw new McpHttpError(404, 'not-found', 'Not found.');
    }
    if (p !== '/mcp') throw new McpHttpError(404, 'not-found', 'Not found.');
    if (method === 'GET' || method === 'DELETE') {
      res.setHeader('allow', 'POST');
      throw new McpHttpError(
        405,
        'method',
        'This connector answers POST only (no sessions).',
      );
    }
    if (method !== 'POST') throw new McpHttpError(405, 'method', 'Only POST.');
    const config = await d.config();
    const userId = await caller(req, config);
    const text = await readText(req, MCP_MAX_BODY);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new McpHttpError(400, 'bad-request', 'The request is not JSON.');
    }
    const ctx = await tools.context(userId, config, o);
    const server = buildServer({
      tools: tools.list(config),
      ctx,
      instructions: tools.instructions,
      card,
      origin: o,
      guard: (tool, call) => tools.guard(tool, ctx, call),
    });
    await handleMcp(server, req, res, body);
  }

  return {
    card,
    frames,
    oauth,
    owns,
    handle,
    tools,
    resourceMetadataUrl: (req: IncomingMessage) =>
      `${origin(req)}/.well-known/oauth-protected-resource/mcp`,
  };
}
export type McpMount = ReturnType<typeof createMcpMount>;
