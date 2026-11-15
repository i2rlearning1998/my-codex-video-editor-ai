// ROUND-C2 (2.1): where the Claude connector joins the existing server.
// server/app.ts hands every /mcp, /oauth and /.well-known path here after
// its origin check and per-address rate limit. This file decides who is
// calling, applies the owner's switches, and answers.
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PlatformConfig } from '../../src/platform-config';
import type { Store } from '../store';
import { createCardHost } from './card';
import { createFrameStore } from './frames';
import {
  buildServer,
  handleMcp,
  type McpToolSpec,
  type ToolReply,
} from './index';
import {
  getFrames,
  proofExportCard,
  submitFrames,
  type FrameCtx,
} from './proof-tools';

/** Bodies of /mcp may carry plans and sample frames. */
export const MCP_MAX_BODY = 8 * 1024 * 1024;

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
  readonly log?: (line: string) => void;
}

async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit)
      throw new McpHttpError(413, 'too-large', 'The request is too large.');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new McpHttpError(
      400,
      'bad-request',
      'The request is not valid JSON.',
    );
  }
}

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
  const origin = (req: IncomingMessage) =>
    (
      d.env.MCP_PUBLIC_URL ?? `http://${req.headers.host ?? '127.0.0.1'}`
    ).replace(/\/$/, '');

  /** The developer token (2.2): off unless MCP_DEV_TOKEN is set. */
  const devUser = (header: string | undefined): string | null => {
    const token = d.env.MCP_DEV_TOKEN;
    if (!token || token.length < 16) return null;
    if (
      d.env.AUTH_MODE === 'supabase' &&
      d.env.MCP_DEV_TOKEN_IN_SUPABASE !== '1'
    )
      return null;
    return header === `Bearer ${token}`
      ? (d.env.MCP_DEV_USER ?? '00000000-0000-4000-8000-00000000dev1')
      : null;
  };

  const toolsFor = (config: PlatformConfig): McpToolSpec<FrameCtx>[] => [
    ...(config.mcp.proofTools ? [proofExportCard] : []),
    submitFrames,
    getFrames,
  ];

  return {
    card,
    frames,
    resourceMetadataUrl: (req: IncomingMessage) =>
      `${origin(req)}/.well-known/oauth-protected-resource/mcp`,
    owns: (p: string) => p === '/mcp' || p.startsWith('/mcp/'),
    async handle(req: IncomingMessage, res: ServerResponse, p: string) {
      if (await card.serve(req, res, p)) return;
      if (p !== '/mcp') throw new McpHttpError(404, 'not-found', 'Not found.');
      if (req.method === 'GET' || req.method === 'DELETE') {
        res.setHeader('allow', 'POST');
        throw new McpHttpError(
          405,
          'method',
          'This connector answers POST only (no sessions).',
        );
      }
      if (req.method !== 'POST')
        throw new McpHttpError(405, 'method', 'Only POST.');
      const config = await d.config();
      const userId = devUser(req.headers.authorization);
      if (!userId)
        throw new McpHttpError(
          401,
          'auth',
          'This connector is not connected. Ask the person to connect it again in the panel.',
        );
      const body = await readJson(req, MCP_MAX_BODY);
      const ctx: FrameCtx = { userId, card, frames, origin: origin(req) };
      const server = buildServer({
        tools: toolsFor(config),
        ctx,
        instructions: 'Call start_here first.',
        card,
        origin: origin(req),
        guard: async (_tool, call): Promise<ToolReply> => call(),
      });
      await handleMcp(server, req, res, body);
    },
  };
}
export type McpMount = ReturnType<typeof createMcpMount>;
