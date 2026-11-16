# Report: Round C3, Claude as a full Director, and the Readymade Style structure (2026-11-16)

## 1. Summary

- Videos with code graphics (drawing blocks and free-code scenes) now export inside the chat. The card draws them in a separate locked-down frame that has no network.
- Connecting Claude works for a new person (Sign up), a person whose browser was cleared (Log in), and a sign-up that needs email confirmation. A server restart no longer ends a waiting connection request. The website and the panel's Home have a "Connect Claude" page.
- Claude now does the same work as the in-panel Director with the same logic:
  - the whole Brief in one list;
  - file notes;
  - the plan cost scene by scene, with the rewrites left;
  - new scenes and new graphics charged only after a yes;
  - previews of a change before it is saved;
  - the Video sheet written by the server.
- Claude also gets:
  - the assets step: every file the plan needs and every way to get it, including outside files;
  - the Project style and the Style chat;
  - the upgrade step ("Extra ideas"), which the Director now shows too.
- Claude can make, read, rewrite and tune code graphics. A capability matrix lists every editor feature and how Claude reaches it, and a test fails when a new feature has no row.
- A video Claude makes opens in the editor and in AI mode with its graphics in the Video's AI library, its sheet and its file notes.
- Readymade Styles have a structure (template, slots, looks, tests) and a check. People see published Styles only; the owner also sees Draft and Tested ones.
- **Nothing ran against a real Claude, a real Supabase or a public address.** Everything is proven against the real server with the official MCP client and a host harness. Section 7 lists what only a real Claude can prove.

## 2. Scope and results

| ID | Result | Evidence |
|---|---|---|
| RDC3-001 to 004 | Verified | e2e/round-c3-code-export.spec.ts |
| RDC3-005 | Verified | tests/round-c3/oauth-store.test.ts |
| RDC3-006 to 009, RDC3-052 | Verified | e2e/round-c3-login.spec.ts |
| RDC3-010 to 017 | Verified | tests/round-c3/director-shared.test.ts |
| RDC3-020 to 024 | Verified | tests/round-c3/assets.test.ts |
| RDC3-030 to 033 | Verified | tests/round-c3/style.test.ts |
| RDC3-034 | Verified | e2e/round-c3-director.spec.ts |
| RDC3-040, 042, 043 | Verified | tests/round-c3/graphics.test.ts |
| RDC3-041 | Verified | tests/round-c3/capability-matrix.test.ts |
| RDC3-050 | Verified | e2e/round-c3-tool-video.spec.ts |
| RDC3-051 | Verified | tests/round-c3/sync.test.ts |
| RDC3-060, 061 | Verified | tests/round-c3/readymade.test.ts |
| RDC3-062 | Verified | e2e/round-c3-readymade.spec.ts |
| RDC3-070 | Verified | tests/round-c3/texts.test.ts |
| RDC3-071 | Verified | e2e/round-c3-admin.spec.ts |

- In-scope items Verified: 39 of 39 ledger rows. "Verified" means proven in the harness, not with a real Claude.
- Blocked, external reasons:
  - A real host allowing the card's nested frame (needs a real Claude).
  - A real Supabase run of the new `mcp_grants` table and the confirmation email's return (needs a real Supabase).
  - Claude actually following the guidance in a chat (needs a real Claude).

## 3. Checks

LIMIT MODE: the full e2e suite and `npm run verify` were not run locally. Only each part's specs were run.

- Format (`prettier --check` on changed files): passes. Typecheck (app and e2e): passes.
- Build: passes. The editor's first load is 5,994,353 bytes: 939 more than Round C2 (5,993,414), within the +5,000 allowed. The card build adds `sandbox-frame.js` (3.7 KB) and loads its runtimes as separate chunks.
- Unit tests (Vitest): tests/round-c3 29 passed in 9 files. tests/round-c1 and tests/round-c2 also pass after the C2 wording updates (RDC2-007, 009, 013, 014, 017, 023), and so do the 40 config and Director test files.
- E2E (Playwright Chromium, Linux sandbox, not Google Chrome):
  - round-c3 specs: 12 passed.
  - C2 specs touched: round-c2-export (2), round-c2-panel (4), round-c2-admin (2), p2-accounts, round-b-director (11): all passed.
  - Editor guard and the editor's own export spec: see section 10.
- Measured: a 60 s 9:16 video with six code graphics (3 Tier B, 3 Tier C) took 82 s from opening the card to Download (reports/round-c3/code-export-timing.json).
- Ledger: `Ledger OK`.
- CI of 64aa5c6 (Part 0.1): 840 passed, 4 failed. All 4 are the DEV-012 screenshot baselines, older and BLOCKED until the UI phase (D-430). CI of this branch is checked once after the last push.

## 4. Try-it script for the owner (a tunnel test with a real Claude)

| # | Do this | Expect | ID | Ran here | Screenshot |
|---|---|---|---|---|---|
| 1 | `npm run build`; start the server with `MCP_PUBLIC_URL` set to the tunnel address (docs/MCP.md) | The server answers | RDC3-009 | Y (harness) | — |
| 2 | Log out of the panel. In claude.ai add the connector (`<tunnel>/mcp`) and press Connect | The website's Sign up opens, saying you go on to Allow | RDC3-006 | Y (harness) | — |
| 3 | Sign up (confirm the email if asked), then press Allow | You land back in Claude | RDC3-006, 008 | Y (harness) | — |
| 4 | New chat: "Make a 40 second video about how volcanoes work, in Hindi." | Claude shows ALL the Brief fields in one message, filled where it understood | RDC3-011 | N (real Claude) | — |
| 5 | Answer the missing ones | Claude shows the plan scene by scene with credits and 1 or 2 "Extra ideas" | RDC3-013, 033 | N | — |
| 6 | Say yes; then ask for the assets | Claude lists each file with all the ways (give, Studio with cost, prompt, library, later, its own) | RDC3-020 | N | — |
| 7 | Give one outside picture (paste or link) | It is added with its source; nothing is charged | RDC3-023 | Y (harness) | — |
| 8 | "Make the eruption a code animation" | Claude adds a graphic (cost first), checks it, rewrites it if a check fails | RDC3-040, 043 | Y (harness) | — |
| 9 | "Export it" | The card draws the code graphic on your device; Play; Download | RDC3-001 | Y (harness) | — |
| 10 | Panel › Projects | The Project with "Made with Claude"; Asset Library › the Video › AI Libraries lists the graphic | RDC3-050 | Y | — |
| 11 | Open the Video in the editor, then the AI category | The same layers; the graphic in AI | RDC3-050 | Y | — |
| 12 | Open it in AI mode | Claude's steps in the chat list; the Director continues from the sheet | RDC3-051 | Y (unit) | — |
| 13 | Clear the browser, press Connect in Claude again, Log in | Allow; your videos are back | RDC3-007, 052 | Y (harness) | — |
| 14 | Admin › Rules: set a rule to "The person's Claude only", preview | It shows in Claude's view, not the Director's | RDC3-071 | Y | — |
| 15 | Admin › MCP: write a note in "What changed", save; ask Claude anything new | Claude mentions the note from start_here | RDC3-042 | Y (harness) | — |

## 5. Deviations from the brief

- The Readymade template marker is `{{slot}}`. A string that is only one marker of a number (such as `"{{length}}"`) becomes a number.
- The three sample Styles got their looks, inputs and kit, but no template (6.3). This keeps the Director's behaviour for them exactly as before, as the brief requires.
- The 4.5 check-and-fix loop is proven through the MCP client against the in-process server (the bad graphic is refused by its checks, then the fixed one is accepted and checked). The card harness is not used for it, because the loop does not need the card.
- Six C2 tests had to change, each because this brief changes the behaviour they checked. RDC2-007, 009, 013, 014, 017 and 023 now state the new rules (D-450, D-453, D-457, D-459).

## 6. Decisions made

D-449 to D-460 in docs/DECISIONS.md. D-447 is superseded by D-450.

## 7. Not tested, known gaps, risks

- **Real Claude:**
  - whether its host allows `frameDomains` and the nested frame (if not, the card says so in one sentence);
  - whether Claude follows the guidance with a real model (the whole Brief in one message, offering every asset way, rewriting graphics after checks);
  - the phone and desktop apps.
- **Real Supabase:** `mcp_grants` and the Supabase store methods are written, never run. The confirmation email's real return link is untested; the stand-in only proves the address that is sent.
- **Card export versus editor export:** equal by construction (the same file and the same render job). No pixel comparison was run.
- **Panel lists:** the published-only rule is proven on the Styles page and Home. The New project dialog uses the same function but has no test of its own.
- **Studios through the connector:** proven only with the offline mock models (test mode). A real Studio model never ran.
- **Owner App:** there is no editor for the new Style fields yet; they are edited in the config (BACKLOG).
- **Language:** the Hindi names of the sample looks are copies of the English ones (BACKLOG).
- **Phone layout:** the Editor guard's 390 px cases stay skipped by the owner's rule.
- **Full suite:** not run locally (LIMIT MODE).

## 8. Architecture and contract impact

- Schema version change: none (schema 9). `src/core` is unchanged.
- New dependencies: none.
- Files added:
  - `src/mcp-card/{nested-sandbox,sandbox-frame}.ts`
  - `src/director/{plan-costs,capability-matrix,style-check}.ts`
  - `server/mcp/{assets,style}.ts`
  - `src/platform-config/texts/c3.ts`
  - `docs/CAPABILITY-MATRIX.md`
  - the tests listed in section 2
- Export: `RenderIo` and the card's in-page option gain an optional `codeStore`. The editor's export path is unchanged.
- Contracts touched: none. Additive only: new MCP tools and edit ops, `/v1/mcp/public`, and optional Platform Config fields.

## 9. Ledger and backlog

- RDC3-001 to RDC3-071 added (39 rows), all Verified.
- AGENTS.md section 3 gains the owner's capability-matrix rule (approved by the brief).
- 4 lines added to docs/BACKLOG_INBOX.md.

## 10. Git

- Branch `claude/round-c3-parity`, draft PR #56 to `claude/round-c2-mcp`. No tag.
- The Editor guard and the editor's own export spec were run at the end (desktop sizes); their result is in the closing message to the owner.

## Owner tick-list

| ID | OK / BUG / MISSING / CHANGE | One sentence |
|---|---|---|
| RDC3-001 | | |
| RDC3-006 | | |
| RDC3-011 | | |
| RDC3-020 | | |
| RDC3-040 | | |
| RDC3-050 | | |
| RDC3-062 | | |
| RDC3-071 | | |
