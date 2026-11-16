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

- (Round C3) Code graphics now export in the chat: the card bakes them in a nested sandbox frame (D-450). A host that refuses nested frames gets one plain sentence instead; that a real Claude allows it is not proven.
- Chat exports stop at `mcp.exportMaxSeconds` (default 120 s) and 100 MB, the largest sizes measured (reports/ROUND-C2-SPIKE.md).
- OAuth codes and pending consents live in the server's memory. A server restart ends a consent that is still open; already-connected people are not affected.

## Round C3: Claude as a full Director

Claude does the same work as the in-panel Director (same Projects, Videos, Style, memory and credits), in its own way: the Director is bound by the owner's rules; for the person's Claude the rulebook and playbooks are guidance, and the only hard limits are what the connector enforces (security, credits and limits, the owner's tool switches, the emergency switch, never showing the plan or project structure).

### Tools added in Round C3

| Tool                                                                                       | What it does                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_brief_fields` (changed)                                                               | Every Brief field at once, with what the message and the Project style already answer, what is still missing, "you decide"                                                        |
| `add_file_note`                                                                            | What Claude saw in one of the person's files (the Director's FileNote)                                                                                                            |
| `get_plan_cost` (changed)                                                                  | Scene by scene, each new graphic, media costs, the total, rewrites left, Extra ideas                                                                                              |
| `submit_plan` (changed)                                                                    | The Director's validate, repair once, refuse loop; `extra_ideas`; counts rewrites; saves new graphics to the Project's AI library                                                 |
| `edit_video` (changed)                                                                     | `dry_run`; new scenes and graphics charged after `confirm_scene`; ops `add_graphic`, `replace_graphic_code`, `set_graphic_params`, `set_frame`, `add_marker`, `set_master_volume` |
| `read_graphic`                                                                             | A graphic's code and settings (to rewrite it)                                                                                                                                     |
| `get_asset_needs`, `set_asset_choice`, `get_asset_cost`, `make_asset`, `add_media`         | The assets step: every file the plan needs and every way to get it                                                                                                                |
| `get_style`, `style_chat`, `apply_style_change`                                            | The Project's style (saved from the first approved video) and the Style chat                                                                                                      |
| `list_styles`, `get_style(style_id)`, `create_project(style_id)`, `start_video_from_style` | Readymade Styles                                                                                                                                                                  |
| `list_modes`, `create_video(mode)`                                                         | Video modes (today: the Editor)                                                                                                                                                   |
| `start_here` (changed)                                                                     | Claude's view of the manual, then live data: a version, what Claude can reach, modes, Studios, Styles, what changed since the version this person saw, the owner's note           |

The connector lists its tools itself at the start of every chat; the skill only points to `start_here`, so a new tool, mode, Studio or Style needs no new skill upload.

### The capability matrix

docs/CAPABILITY-MATRIX.md (generated from src/director/capability-matrix.ts) lists every editor command family and every Video Plan v4 field with Claude's way to reach it. A unit test fails when the editor gains a command or a plan field without a row (AGENTS.md section 3). Editor-only bookkeeping that never changes the exported video (nesting, clip links, lane state, the outliner, the playback range, the project's file name) has no connector way, with that reason in the matrix.

### Logging in through Connect

- No account: Claude's Connect opens the consent page; a logged-out person goes to Sign up with the consent page kept as `next`, then lands on it and presses Allow.
- An account, but a cleared browser: the same page links to Log in, with `next` kept. The Claude connection and what Claude made are the server's; they come back after logging in.
- Sign-up with email confirmation: the consent request waits 30 minutes (and survives a server restart); the confirmation email returns to Log in with `next`. If the page is gone by then, the person presses Connect in Claude again.
- The website's Connect Claude page and the panel's Home button explain the two steps and give the address and the zips; the person's own Claude plan is used for the chat.

### Not proven in Round C3 (needs a real Claude, a real Supabase or a public address)

- That a real host allows the card's nested sandbox frame (`frameDomains`).
- A real Supabase run of `mcp_grants` and the confirmation email's return address.
- Claude following the guidance (the whole Brief in one message, asking for the asset choice, rewriting a graphic after a check) with a real model.
