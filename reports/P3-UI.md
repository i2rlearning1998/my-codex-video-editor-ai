# Report: P3-UI, Phase 3 UI (5 Nov 2026)

## 1. Summary
The whole user-facing UI of Phase 3 is built on `claude/p3-ui`, against the frozen contracts in `src/contracts/p3.ts`, with in-memory mock services standing in for Parts 1 and 2.
- Home is the Director room: an Orb that thinks, speaks and rests, streamed answers with chips, refusals in the owner's words, visible and removable project memory.
- Studio forms follow the chosen model, check fields and show the cost before Run. My Styles, Style review, Credits & Plan, Settings, Brand Kit preview, Learn and Asset Library are restyled.
- A new admin page (`/admin/`) and an editor chat dock exist. Both run on mocks that are available on dev and e2e pages only.
- Not possible yet: real answers, real admin sign-in, real credits (waiting for `codex/p3-engine` and `claude/p3-wiring`), and real Studio fields (waiting for the owner's Autodraft screenshots; the fields are samples).

## 2. Scope and results
| ID | Result | Evidence |
|---|---|---|
| P3U-001 to P3U-005 | Verified | e2e/p3u-director-room (Orb, stream, refusal, failure, animations Off, Home is the room) |
| P3U-006 to P3U-010 | Verified | e2e/p3u-studio (model-driven form, validation, cost, Run, Improve, phone fit) |
| P3U-011 to P3U-014 | Verified | e2e/p3u-mine (memory, Make this my Style, empty states, phone fit) |
| P3U-015, P3U-016 | Verified | Credits & Plan hero, plan lines, meters, checkout, phone |
| P3U-017 to P3U-025 | Verified | e2e/p3u-admin (sign-in, dashboard, people, reasons and audit, flags, broken chain, emergency, settings, Hindi, phone) |
| P3U-026, P3U-027 | Verified | e2e/p3u-site (pricing lines, CTA, footer, Hindi, phone) |
| P3U-028 to P3U-031 | Verified | e2e/p3u-chat-dock (chips, stream, proposal, Apply, Discard, Stop, refusal, owner cap and off, Hindi, Escape) |
| P3U-032, P3U-033 | Verified | e2e/p3u-panel-polish (Settings cards, Learn numbers, Asset Library to Studio, Brand preview and teaser) |
| P3U-034 | Verified | e2e/p3u-sweep: every panel, website and admin screen at 1440 and 390 px, no sideways scroll, no error state |
| P3U-035 | Verified | e2e/p3u-sweep: phone bottom navigation fits, Studio tools two per row (found by the screenshot review) |

- In-scope P0 items Verified: 35 of 35
- Not done, with reason: real services (Parts 1 and 2 not merged yet); Studio `sampleParams` (owner's Autodraft screenshots not received); real admin sign-in (needs Part 1's HTTP `AdminClient`).

## 3. Checks
- `npm run check`: format OK, typecheck OK (after fixing a `Page` import in three e2e files), build OK with the bundle check ("Editor page 18 chunks without panel, website or gateway code; panel and website without the editor", admin rules in `scripts/assert-editor-bundle.mjs`). Unit run: 1401 passed, 4 failed; 1 of the 4 was mine (the page-isolation test did not know the admin page; fixed, now passes). The other 3 (`tests/blocks/worker.test.ts` x2, `tests/library/gate-browser.test.ts` x1) fail the same way on the clean base without my changes (sandbox worker and headless browser), so they are not caused by this round.
- E2E: the P3U specs were run file by file in the sandbox Chromium (`--project=desktop`); the full `npm run verify` e2e run was not done in this session.
- Ledger validation: `Ledger OK` (P3U-001 to P3U-035 all proven by active tests).
- CI: checked once after the push (see section 10).

## 4. Try-it script for the owner
| # | Do this | Expect | ID | Run by me | Screenshot |
|---|---|---|---|---|---|
| 1 | Sign up on the website, land on Home | The Orb, greeting and a message box; Styles and Continue below | P3U-005 | Y | reports/p3-ui/panel-home-1440.png |
| 2 | Type an idea and send | The Orb thinks, the answer streams, chips appear | P3U-001 | Y | |
| 3 | Open Studio, pick a tool | A form; cost shown before Run | P3U-006/007 | Y | panel-studio-1440.png |
| 4 | Open Credits & Plan | Balance ring, plan cards with what each includes | P3U-015 | Y | panel-credits-1440.png |
| 5 | Open Brand Kit on Free, then Pro | Teaser; then a live preview | P3U-033 | Y | panel-brand-1440.png |
| 6 | Open `/admin/`, sign in with the demo login shown | Dashboard with revenue, cost, margin | P3U-017/018 | Y | admin-dashboard-1440.png |
| 7 | In admin, People, adjust a person's credits | A reason is asked; the audit log shows it | P3U-020 | Y | |
| 8 | In admin, Chat & memory: set daily messages to 1 | Saved with a reason | P3U-024 | Y | |
| 9 | Open the editor (dev), click the chat icon | Dock with the selection chips; send, then Apply | P3U-028 | Y | |
| 10 | Make the browser 390 px wide, open Home | Bottom nav fits; Studio tools two per row | P3U-035 | Y | |

## 5. Deviations from the brief
None known. The Orb is canvas-drawn, still when Animations is Off.

## 6. Decisions made
D-390 to D-396 (appended to docs/DECISIONS.md). Notably D-393: admin is a fourth page whose client exists only on dev and e2e pages; a production build says no admin server is connected.

## 7. Not tested, known gaps, risks
- Nothing has run against a real model, the real gateway, Supabase or a real admin server; every answer, price and credit in these screens comes from mocks.
- Apply being "one undo step" in the chat dock is the real engine's duty (Part 2); the dock only calls `apply`. Not proven until the real engine exists.
- The daily chat cap in the dock is a count kept in this browser; the real cap must be the server's.
- Studio fields are samples until the Autodraft screenshots arrive.
- Hindi strings were written by me and not reviewed by a native reader.
- Screenshots were reviewed at 1440 for Home, Studio, Credits and Admin dashboard, and at 390 for Home; the other screens were checked by the sweep test for overflow and error states only, not by eye.
- Full e2e suite and CI timing flakes (LAY-004, TL-096, FX1-001, D-316) were not re-run here.
- Voice typing, file attach and the real model picker in the Director room use the existing P2-R3 composer and were not re-tested beyond the existing tests.

## 8. Architecture and contract impact
- Schema version change: none (schema 9).
- New dependencies: none.
- Files added: `src/admin/*`, `src/ui/chat-dock*.ts/css`, `src/panel/polish.css`, `src/contracts/p3-mock-admin.ts`, mocks in `p3-mocks.ts`, e2e `p3u-*.spec.ts`. Changed: `src/ui/shell.ts` (optional chat mount), `src/main.ts` (DEV-only mock chat), `scripts/assert-editor-bundle.mjs`, `vite.config.ts` (admin input), `tests/panel/isolation.test.ts` (admin is a page of its own).
- Contracts touched: none changed; `src/contracts/p3.ts` is only consumed.

## 9. Ledger and backlog
- Status changes made: P3U-001 to P3U-035 added as Verified.
- Ledger Change Requests applied: none.
- Added to docs/BACKLOG_INBOX.md: 0.

## 10. Git
- Branch: `claude/p3-ui`
- Key commits: `f3960ba` admin, `cb916e4` site, `74ef6fb` chat dock, `d7e054e` panel polish, plus this round's sweep, phone fixes, docs and report.

## Owner tick-list
| ID | OK / BUG / MISSING / CHANGE | One sentence |
|---|---|---|
| | | |
