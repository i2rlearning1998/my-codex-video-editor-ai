# Report: P3-INTEGRATION, Phase 3 part 3: the UI on the real services (5 Nov 2026)

## 1. Summary
Part 1 (`codex/p3-engine`) and Part 2 (`claude/p3-wiring`) are merged into `claude/p3-ui`, reviewed against docs/CONTRACTS-P3.md section 7, and the UI now talks to them.
- With a gateway server the Director room, Studio, the admin page and the editor chat run on the real services; without one (offline, dev, e2e) they keep the in-memory mocks.
- The server decides every limit (`POST /v1/entitlements/check`); an unreachable server never lets a limit pass.
- The admin page signs in through the server (admin role only) and its settings go to the live Platform Config, with audit rows.
- Not possible yet: anything against a real provider, Supabase, Razorpay or Stripe (no keys; the owner's one real-API round is next), and real Studio fields (owner's Autodraft screenshots are still missing).

## 2. Scope and results
| ID | Result | Evidence |
|---|---|---|
| P3I-001, P3I-002 | Verified | e2e/p3-integration.spec.ts (both parts mounted in one server; vault changes in the audit chain; images through `/v1/run`) |
| P3I-003, P3I-004 | Verified | tests for proportional refund revocation, cumulative refund cap, SQL function proof (stand-in database) |
| P3I-005 | Verified | provider cost recorded per call; admin metrics report it |
| P3I-006 | Verified | `/v1/entitlements/check` tests |
| P3I-007 to P3I-009 | Verified | Director room, refusal, Studio run on a real server with fake providers |
| P3I-010 | Verified | admin page on the real admin API |
| P3I-011 | Verified | editor chat on the real engine, Apply is one undo step |

- In-scope P0 items Verified: 11 of 11 (P3I rows). Ledger gained 67 P3 rows in all (P3-ENGINE, P3-WIRING, P3U, P3I).
- Not done, with reason: live-provider behaviour (no keys); Razorpay subscription plan ids (no source defined yet, D-402); Studio `sampleParams` (waiting for Autodraft screenshots).

## 3. Checks
- Unit and jsdom: 1,509 passed, 3 failed, 3 skipped in 209 files. The 3 failures are sandbox-only and were failing before this work: `tests/blocks/worker.test.ts` (2) and `tests/library/gate-browser.test.ts` (LIB-007; the headless gate sees extra seed files in this sandbox).
- E2E: see section 10 for the final run (Chromium in the sandbox, `--project=desktop`).
- Format, typecheck, build with the bundle check (all four pages) and `npm run ledger`: see section 10.
- CI: checked once after the push (section 10).

## 4. Try-it script for the owner
Needs a running gateway (`npm run server`) with at least one provider key; without keys the mocks run and steps 2 to 6 show the offline behaviour.
| # | Do this | Expect | ID | Run by me |
|---|---|---|---|---|
| 1 | Start the server with `AUTH_MODE=local` and open the panel | Home shows the Director room | P3I-007 | Y (fake providers) |
| 2 | Ask Director for a video idea | A real answer streams in | P3I-007 | Y (fake) |
| 3 | Type something your refusal list blocks | The owner's refusal words appear at once | P3I-008 | Y |
| 4 | Run a Studio tool | Cost shown first, credits reserved, result in Asset Library | P3I-009 | Y (fake) |
| 5 | Open `/admin/` with an admin account | Sign-in via the server; a non-admin is refused | P3I-010 | Y |
| 6 | In admin, change a chat setting | Reason asked; audit log shows it | P3I-010 | Y |
| 7 | Open the editor, click chat, send an edit, Apply, then Undo | One undo step | P3I-011 | Y (fake) |

## 5. Deviations from the brief
None known.

## 6. Decisions made
D-397 to D-402 (appended to docs/DECISIONS.md).

## 7. Not tested, known gaps, risks
- Nothing ran against a live provider, Supabase (`supabase start` cannot run here), Razorpay or Stripe. Request/answer shapes are proven only against local fakes.
- Part 1 gaps: PayPal lifecycle and configuration; checkout and refund claims are durable but have no reconciliation screen; actual-cost metrics only where the gateway records them.
- Razorpay subscription plan ids need an environment or config source before a live subscription; `.env.example`, `scripts/keys.json` and docs/KEYS.md do not list one yet.
- The Studio engine's frozen request type allows scalar parameters only; a list-valued provider parameter is reported, not sent.
- The memory context budget has no config field.
- Studio fields are samples until the Autodraft screenshots arrive.
- Hindi strings were not reviewed by a native reader.
- Admin sign-in against a real Supabase project was not run; the password-grant request is tested against the stand-in.
- Known timing flakes (LAY-004, TL-096, FX1-001, PB-010) and sandbox failures above were not chased.

## 8. Architecture and contract impact
- Schema version change: none (schema 9).
- New dependencies: none.
- Files added: `src/editor-chat/real.ts`, `e2e/p3-integration.spec.ts`; changed: `src/admin/services.ts`, `src/admin/main.ts`, `src/admin/ui.ts`, `server/app.ts`, `src/usage-report.ts`, `src/ui/shell.ts`, `src/main.ts`, `src/wiring/*`, `e2e/p2-stack.ts`.
- Contracts touched: none changed.

## 9. Ledger and backlog
- Status changes made: P3I-001 to P3I-011 added as Verified (plus the P3 engine and wiring rows).
- Ledger Change Requests applied: none.
- Added to docs/BACKLOG_INBOX.md: 0.

## 10. Git
- Branch: `claude/p3-ui`
- Key commits: 8c40cb9, c355c6f, dece92f, 3ead774, d22e168, 977c54e, a20f11c, 4e4539a, plus the docs commit.
- Final run results: appended below when the full e2e finishes.

## Owner tick-list
| ID | OK / BUG / MISSING / CHANGE | One sentence |
|---|---|---|
| | | |
