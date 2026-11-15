# Report: Round C2, Claude as Director: the MCP connector, OAuth, export inside the chat, Admin (2026-11-15)

## 1. Summary

- The person's own Claude (claude.ai, desktop, phone) can connect to the platform as a second Director through an MCP connector. Allowing it takes two clicks: Claude's own "Connect" button, then Allow on the panel's consent page.
- Claude gets the same rulebook, playbooks and process as the in-panel Director. Both read one text built by one function (`buildManual`), and the owner edits that text in Admin › Rules & Playbooks.
- Claude works on the same Projects and Videos as the person. It can make a Project and a Video, ask the Brief questions, import media, submit a plan, show its cost, build after a yes, edit the video, keep memory and export. What Claude makes shows in the panel as "Made with Claude", and Claude's steps show in AI mode's chat list.
- Export happens inside the chat: a card renders the video on the person's own device, plays it and saves it.
- Admin has two new tabs: Rules & Playbooks, and MCP (master switch, per-tool on/off and price, connections, revoke, last calls). The panel has Door 4 ("Create with your own Claude") and downloadable skill and plugin zips.
- **Nothing ran against a real Claude, a real Supabase or a public address.** All of it is proven against the real server process with the official MCP SDK client and a host harness that embeds the card the way the MCP Apps spec says hosts do. A real Claude, its real sandbox and its download support are not proven.
- A video with code graphics cannot be exported in the chat yet. That waits for an owner decision (D-447).

## 2. Scope and results

| ID | Result | Evidence |
|---|---|---|
| RDC2-001 | Verified | e2e/round-c2-spike.spec.ts (6 tests), reports/ROUND-C2-SPIKE.md |
| RDC2-002 to RDC2-009 | Verified | tests/round-c2/mcp-auth.test.ts |
| RDC2-010 to RDC2-020 | Verified | tests/round-c2/mcp-tools.test.ts |
| RDC2-021, RDC2-022 | Verified | e2e/round-c2-export.spec.ts |
| RDC2-023 | Verified | tests/round-c2/mcp-tools.test.ts |
| RDC2-030, RDC2-031 | Verified | e2e/round-c2-admin.spec.ts |
| RDC2-040 to RDC2-042 | Verified | e2e/round-c2-panel.spec.ts |
| RDC2-043 | Verified | tests/round-c2/claude-sync.test.ts, e2e/round-c2-panel.spec.ts |
| RDC2-050 | Verified | tests/round-c2/bundle.test.ts |
| RDC1-100 to RDC1-103 (Editor guard) | Verified at desktop sizes | e2e/editor-guard.spec.ts: 5 passed; 390 px cases skipped by the owner's rule |

- In-scope P0 items Verified: 30 of 30 ledger rows (RDC2-001 to RDC2-023, 030, 031, 040 to 043, 050). "Verified" means proven in the sandbox harness, not against a real Claude. See section 7.
- Blocked (external reasons): a real Claude connection (needs a public address and claude.ai); a real Supabase run of the migration and store methods; MP4 out of the card (the sandbox Chromium has no AAC encoder); code graphics in a chat export (owner decision, D-447).

## 3. Checks

LIMIT MODE: by the brief, `npm run verify` and the full e2e suite were **not** run locally. Only the specs each part touched were run.

- `npm run verify`: not run (LIMIT MODE).
- Format: `prettier --check` on the changed files passes. Typecheck: `tsc --noEmit` (app) and `tsc -p tsconfig.e2e.json` both pass.
- Build: passes. "Editor first load 9 chunks, 5993414 bytes (JS and CSS), no AI mode, panel, website or gateway code; with its lazy chunks 54 chunks, 8631207 bytes." That is 1,488 bytes more than Round C1 (5,991,926), still under the 6,026,000 cap. The added bytes come from moving the export frame loop into a shared module. The card is a separate build (`dist/mcp-card`, 3,526,407 bytes including fonts) and is never loaded by the editor.
- Unit tests (Vitest, Node): tests/round-c2: 23 passed in 4 files. tests/round-c1 plus tests/round-c2: 102 passed in 16 files (before RDC2-043), plus 1 for RDC2-043. The Round C1 planner and tools tests were updated for the new defaults.
- jsdom tests: none added.
- E2E (Playwright Chromium 153.0.8010.12, Linux sandbox, not Google Chrome): round-c2-spike 6, round-c2-export 2, round-c2-admin 2, round-c2-panel 4 (all passed), and editor-guard 5 passed (2.2 min). TR-018 failed once because the dev server reloaded, then passed when run alone.
- Ledger validation: `Ledger OK`.
- CI: checked once after the last push (see the PR).

## 4. Try-it script for the owner (about 10 minutes, needs a tunnel)

| # | Do this | Expect | ID | Ran it here (Y/N) | Screenshot |
|---|---|---|---|---|---|
| 1 | `npm run build`, then start the server with `LOCAL_AUTH_SECRET` and `MCP_SECRET` set (docs/MCP.md) | The server starts on 4400 | RDC2-002 | Y (harness) | — |
| 2 | `cloudflared tunnel --url http://127.0.0.1:4400`, then restart the server with `MCP_PUBLIC_URL` set to the tunnel address | The tunnel address answers /mcp with 401 | RDC2-003 | N (no public address) | — |
| 3 | Panel › New project › Create with your own Claude | Door 4 shows Not connected, Copy address, three zips, three starter lines | RDC2-040 | Y | — |
| 4 | claude.ai › Settings › Connectors › Add custom connector › paste the address | The panel's consent page opens; press Allow | RDC2-003, 041 | N (harness only) | — |
| 5 | Open Door 4 again | Connected, Not used yet, Disconnect | RDC2-040 | Y | — |
| 6 | In Claude: "Make a 30 second video about why the sky is blue." | Claude calls start_here, asks one question at a time, shows the plan and its cost, waits for your yes | RDC2-007, 014, 016, 017 | N (real Claude) | — |
| 7 | Say yes | Credits drop by the cost shown once | RDC2-017 | Y (harness) | — |
| 8 | "Export it." | The card renders in the chat; Play works; Download saves the file | RDC2-021 | Y (harness) | reports/round-c2/spike-h264-frame.png |
| 9 | Panel › Projects | The new Project shows "Made with Claude" | RDC2-042 | Y | — |
| 10 | Open the Video in AI mode › the chats button | Claude's steps are listed, newest first | RDC2-043 | Y | — |
| 11 | Change one text on the canvas by hand, then ask Claude to change the title | Claude is told the video changed and reads it again; your edit stays | RDC2-018 | Y (harness) | — |
| 12 | Admin › Rules & Playbooks: add "Always end with a question for the viewer.", Save | Preview shows it in the manual | RDC2-030 | Y | — |
| 13 | Ask Claude for another video | It follows the new rule | RDC2-007 | N (real Claude) | — |
| 14 | Admin › MCP › master switch off | Claude's next call gets one plain sentence | RDC2-010, 031 | Y (harness) | — |
| 15 | Admin › MCP › Revoke all (with a fresh code) | Door 4 says Not connected | RDC2-031 | Y | — |

## 5. Deviations from the brief

- The Editor guard's 390 px cases are skipped, by the owner's rule in the brief ("phone layout is not needed now, owner 2026-11-15"). One BACKLOG line was added.
- The video-type playbooks were mapped to existing type ids by closest name. No new type was needed (D-439).
- In the plugin zip, the rules ship as a skill (`talking-to-people`) as well as RULES.md, because a plugin's root CLAUDE.md is not loaded (D-448).

## 6. Decisions made

D-437 to D-448 in docs/DECISIONS.md: the in-page export card (D-437); TEXTS as config defaults (D-438); playbook mapping and new config (D-439); one manual (D-440); OAuth 2.1 (D-441); connector switches (D-442); Claude's workspace on the server (D-443); plans and edits (D-444); export limits (D-445); Admin tabs (D-446); code graphics waiting for the owner (D-447); Door 4 and the bundles (D-448).

## 7. Not tested, known gaps, risks

- **Real Claude:** never connected. Not tested: claude.ai's real OAuth client, its real iframe sandbox and CSP, whether it offers `ui/download-file`, and the phone and desktop apps. The harness follows the MCP Apps spec, but a real host may differ.
- **Real Supabase:** the migration `20261116000000_round_c2_mcp.sql` and the Supabase store methods were written but never run. The SQL policy tests do not cover the new tables yet.
- **Public address:** never tried. Tunnel and CORS behaviour in front of a real proxy are untested.
- **MP4 from the card:** not measured. The sandbox Chromium made WebM. Chrome on Windows should make MP4.
- **Code graphics (Tier B or C) in a chat export:** refused with a plain sentence until the owner decides (D-447).
- **OAuth state:** codes and open consents are kept in one server process's memory. A restart ends an open consent; several server processes would need a store.
- **Claude Code:** its loopback redirect is allowed only with `MCP_TEST_MODE=1`.
- **Voice:** a plan built through the connector has no voice and says so; the person adds voice in the panel.
- **Language:** only the two new Admin tabs have keyed English and Hindi strings.
- **Phone layout:** the 390 px Editor guard cases were not run (owner rule).
- **Full suite:** the full e2e suite and `npm run verify` were not run locally (LIMIT MODE). CI is the only full run.

## 8. Architecture and contract impact

- Schema version change: none (schema 9). `src/core` and the frozen contracts are unchanged.
- New dependencies:
  - `@modelcontextprotocol/sdk` 1.32.2 (MIT): about 4.5 MB in node_modules, server only. It is the official MCP server and transport. Writing the Streamable HTTP and JSON-RPC protocol by hand was considered and rejected as riskier.
  - `@modelcontextprotocol/ext-apps` 1.7.5 (MIT, devDependency): about 1.4 MB, used only by the card build and the test harness. It is the official MCP Apps bridge. 2.x needs zod 4, and the project is on zod 3. Writing the postMessage bridge by hand was considered.
- Files added: `server/mcp/*`, `src/mcp-card/*`, `vite.card.ts`, `src/director-rules/*`, `src/platform-config/texts/*`, `src/panel/screens/claude.ts`, `src/panel/claude-sync.ts`, `scripts/mcp-bundle.mjs`, `scripts/mcp-references.mjs`, `scripts/creator-playbook-docs.mjs`, the Supabase migration, `docs/MCP.md`, and the tests. Moved: the export frame loop from `src/export/worker.ts` to `src/export/render-job.ts` (behaviour unchanged).
- Contracts touched: none. Additive only: new `/mcp`, `/oauth/*`, `/.well-known/*`, `/v1/mcp/*` and `/v1/admin/mcp/*` routes; existing `/v1` routes and `src/tools` signatures are unchanged.

## 9. Ledger and backlog

- Status changes: RDC2-001 to RDC2-023, 030, 031, 040 to 043 and 050 added as Verified.
- Ledger Change Requests applied: none.
- Added to docs/BACKLOG_INBOX.md: 5 lines.

## 10. Git

- Branch: `claude/round-c2-mcp`, draft PR #55 to `claude/round-c1-power`. No tag (the owner tags after accepting).
- `git log --oneline origin/claude/round-c1-power..HEAD`:
  - 797af13 test(panel): Claude's steps reach this browser and AI mode's chat list [RDC2-043]
  - cf3d87f feat(mcp): Claude skill and plugin bundle; Editor guard skips 390 px by owner rule [RDC2-050]
  - 2f61d6f feat(panel): Door 4, the consent page and Made with Claude [RDC2-040..042]
  - 4bbf780 feat(admin): Rules & Playbooks and MCP tabs [RDC2-030, RDC2-031]
  - 96d1709 feat(mcp): export inside the chat through the card [RDC2-021..023]
  - 0f7530a feat(mcp): the Director's tools for Claude on the same Projects and Videos [RDC2-010..020]
  - 0f90917 feat(mcp): connector endpoint, OAuth 2.1, the one manual and the tools [RDC2-002..009]
  - de2c87e feat(mcp): export card spike inside a sandboxed chat frame [RDC2-001]
  - 2edbb69 docs(round-c2): the C2 brief and its texts
- Review patch: not generated (no tag yet; the PR diff is the review).

## Owner tick-list (owner fills this in and sends it to Claude)

| ID | OK / BUG / MISSING / CHANGE | One sentence |
|---|---|---|
| RDC2-040 | | |
| RDC2-021 | | |
| RDC2-042 | | |
| RDC2-043 | | |
| RDC2-030 | | |
| RDC2-031 | | |
