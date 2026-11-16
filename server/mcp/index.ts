// ROUND-C2 (2.1): the Claude connector. Stateless Streamable HTTP at
// POST /mcp: every request gets a new McpServer and transport (no
// sessions), so a server restart or a second Claude tab never loses
// anything. Who is calling is decided before this runs (server/mcp/auth.ts);
// the tools themselves live in server/mcp/tools.ts and call the same code
// as the in-panel Director.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { z } from 'zod';
import { CARD_MIME, CARD_URI, type CardHost } from './card';

export interface ToolAnnotations {
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  readonly openWorldHint: boolean;
}
export interface ToolReply {
  /** Plain sentences (never raw JSON). */
  readonly text: string;
  /** Pictures for Claude to look at (get_frames). */
  readonly images?: readonly { data: string; mimeType: string }[];
  /** Data only the card reads (never shown to the model as text). */
  readonly meta?: Record<string, unknown>;
  readonly isError?: boolean;
}
export interface McpToolSpec<Ctx> {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly input: z.ZodRawShape;
  readonly annotations: ToolAnnotations;
  /** Only the card may call it (MCP Apps visibility "app"). */
  readonly appOnly?: boolean;
  /** Its answer shows the export card. */
  readonly card?: boolean;
  run(args: Record<string, unknown>, ctx: Ctx): Promise<ToolReply>;
}

/** Builds one request's server with the tools the caller may use. */
export function buildServer<Ctx>(o: {
  readonly tools: readonly McpToolSpec<Ctx>[];
  readonly ctx: Ctx;
  readonly instructions: string;
  readonly card: CardHost;
  readonly origin: string;
  /** Runs around every tool call (switches, limits, the usage row). */
  readonly guard: (
    tool: McpToolSpec<Ctx>,
    call: () => Promise<ToolReply>,
  ) => Promise<ToolReply>;
}): McpServer {
  const server = new McpServer(
    { name: 'aive-video', version: '1.0.0' },
    { instructions: o.instructions },
  );
  const cardMeta = {
    ui: {
      // ROUND-C3 (0.2): frameDomains lets the card open the nested sandbox
      // for code graphics (our sandbox page, connect-src 'none').
      csp: {
        connectDomains: [o.origin],
        resourceDomains: [o.origin],
        frameDomains: [o.origin],
      },
      prefersBorder: true,
    },
  };
  server.registerResource(
    'export-card',
    CARD_URI,
    {
      title: 'Video export',
      description: 'Renders the video on this device and plays it here.',
      mimeType: CARD_MIME,
      _meta: cardMeta,
    },
    async () => ({
      contents: [
        {
          uri: CARD_URI,
          mimeType: CARD_MIME,
          text: o.card.html(o.origin),
          _meta: cardMeta,
        },
      ],
    }),
  );
  for (const tool of o.tools) {
    const meta: Record<string, unknown> = {};
    if (tool.card || tool.appOnly)
      meta.ui = {
        ...(tool.card ? { resourceUri: CARD_URI } : {}),
        ...(tool.appOnly ? { visibility: ['app'] } : {}),
      };
    if (tool.card) meta['ui/resourceUri'] = CARD_URI;
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: { title: tool.title, ...tool.annotations },
        ...(Object.keys(meta).length ? { _meta: meta } : {}),
      },
      async (args: Record<string, unknown>) => {
        const reply = await o.guard(tool, () => tool.run(args, o.ctx));
        return {
          content: [
            { type: 'text' as const, text: reply.text },
            ...(reply.images ?? []).map((i) => ({
              type: 'image' as const,
              data: i.data,
              mimeType: i.mimeType,
            })),
          ],
          ...(reply.meta ? { _meta: reply.meta } : {}),
          ...(reply.isError ? { isError: true } : {}),
        };
      },
    );
  }
  return server;
}

/** Answers one POST /mcp with a new server and transport. */
export async function handleMcp(
  server: McpServer,
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
): Promise<void> {
  // No sessionIdGenerator: stateless (no Mcp-Session-Id, no GET stream).
  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}
