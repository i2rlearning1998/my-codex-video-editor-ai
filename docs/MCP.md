# The Claude connector (MCP): Claude as Director (Round C2)

The person's own Claude (claude.ai, the desktop app, the phone app) becomes a second Director. It reads the same rulebook, playbooks and process as the in-panel Director, because both get the text from one function, `buildManual` (src/director-rules/manual.ts). The owner edits that text in Admin › Rules & Playbooks, and the change binds both Directors at once.

The connector is the "hands": Claude sends each tool only what the tool asks for. The server builds, edits and saves the project. Export happens inside the chat, in an MCP App card that renders the video on the person's own device.

## What runs where

| Part                                                                                         | Where                                                                         | Files                                       |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- |
| `POST /mcp` (stateless Streamable HTTP, a new server per request; `GET`/`DELETE` answer 405) | the existing server (`npm run server`)                                        | server/mcp/index.ts, mount.ts               |
| OAuth 2.1 (metadata, dynamic registration, PKCE S256, rotating refresh tokens, revoke)       | the same server                                                               | server/mcp/oauth.ts                         |
| Consent page (Allow / Cancel)                                                                | the panel, `#/connect-claude`                                                 | src/panel/screens/claude.ts                 |
| Tools (start_here, get_credits, projects, brief, media, plans, edits, memory, export)        | the same server                                                               | server/mcp/tools.ts, proof-tools.ts         |
| Export card (`ui://aive/export-card.html`)                                                   | the person's device, inside the chat                                          | src/mcp-card/, vite.card.ts → dist/mcp-card |
| Admin › Rules & Playbooks, Admin › MCP                                                       | the Owner App                                                                 | owner/ui/admin.ts                           |
| Door 4 ("Create with your own Claude")                                                       | the panel, New project and + New video                                        | src/panel/screens/claude.ts                 |
| Skill and plugin zips                                                                        | `npm run mcp:bundle` → dist/claude-bundle, served at `/mcp/bundle/<file>.zip` | scripts/mcp-bundle.mjs                      |

## Run it locally

```
npm run build                       # also builds the card, the references and the zips
LOCAL_AUTH_SECRET=<long random text> MCP_SECRET=<long random text> npm run server
VITE_GATEWAY_URL=http://127.0.0.1:4400 npm run dev
```

Environment (all optional except the secrets):

| Variable                                         | Use                                                                                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MCP_SECRET`                                     | Signs access tokens and export-card tickets (falls back to `LOCAL_AUTH_SECRET`).                                                                   |
| `MCP_PUBLIC_URL`                                 | The address Claude reaches (the tunnel's https address). The card loads its engine from here.                                                      |
| `MCP_PANEL_URL`                                  | Where the consent page is (default: the first `SERVER_ORIGINS` entry).                                                                             |
| `MCP_TEST_MODE=1`                                | Allows loopback redirect URIs (Claude Code). Off by default.                                                                                       |
| `MCP_DEV_TOKEN` (16+ characters), `MCP_DEV_USER` | A developer token for loopback or tunnel tests. Off unless set; never accepted with `AUTH_MODE=supabase` unless `MCP_DEV_TOKEN_IN_SUPABASE=1` too. |
| `MCP_CARD_DIR`, `MCP_BUNDLE_DIR`                 | Where the built card and zips are (default dist/mcp-card, dist/claude-bundle).                                                                     |

## Test it with a real Claude (owner try-it)

1. `npm run build`, then start the server as above.
2. `cloudflared tunnel --url http://127.0.0.1:4400` and copy the https address.
3. Restart the server with `MCP_PUBLIC_URL=<that address>` (and `MCP_PANEL_URL` set to the panel's address).
4. In the panel: New project › Create with your own Claude › Copy address.
5. claude.ai › Settings › Connectors › Add custom connector › paste `<address>/mcp`.
6. The consent page opens in the panel: press Allow. The card in Door 4 now says Connected.
7. In a new chat: "Make a 30 second video about why the sky is blue." Claude should call `start_here` first, ask you one question at a time, show the plan and its cost, and wait for your yes.
8. Say yes. Then "Export it." The card renders the video in the chat; press play, then Download.
9. In the panel, the Project shows "Made with Claude"; open the video in AI mode and look at the chat list for Claude's steps.
10. Admin › Rules & Playbooks: add a rule at the top ("Always end with a question for the viewer."), save, then ask Claude for another video. It should follow the new rule.

## What is proven and what is not

Proven in this sandbox, with tests named in docs/FEATURES.md (RDC2-001 to RDC2-050 (RDC2-043: AI mode lists Claude's steps)):

- The OAuth flow and its refusals, run against the real server with the MCP SDK client.
- Every tool, run the same way.
- The export card in a harness that embeds it the way a host does: a sandboxed iframe on another origin, the CSP the spec gives hosts, and the ext-apps bridge.
- The Admin tabs and the panel screens in Chromium.

Not proven (needs things this sandbox does not have):

- A real Claude (claude.ai, desktop, phone) connecting, its real CSP and sandbox, and its download support.
- A real Supabase. The migration `20261116000000_round_c2_mcp.sql` and the Supabase store methods are written but were never run.
- A public address.
- MP4 out of the card. The sandbox Chromium has no AAC encoder, so the card made WebM here. Chrome on Windows should make MP4, but that was not measured.

Known limits:

- A video with code graphics (Tier B or C) cannot be exported in the chat, because their frames are baked in a worker and the card cannot start one. The owner decides whether that code may run in the card's page (D-447).
- Chat exports stop at `mcp.exportMaxSeconds` (default 120 s) and 100 MB, the largest sizes measured (reports/ROUND-C2-SPIKE.md).
- OAuth codes and pending consents live in the server's memory. A server restart ends a consent that is still open; already-connected people are not affected.
