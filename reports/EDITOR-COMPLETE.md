# Report: AUDIT-EDITOR, EDITOR-COMPLETE and Phase 1 (2026-10-25)

## 1. Summary
- Every unfinished ledger row (327 Todo or Claimed) was checked against the code and in the browser: 115 work, 90 work partly, 70 are not built, 52 belong to the owner's later scope (now `Deferred`). Details and proof per row: reports/AUDIT-EDITOR.md.
- The rows the Editor really needs now were built: a project library in this browser (File › Projects), crash and reload safety, Undo and Redo that name their step, the timeline ruler, ripple delete, Alt-drag copy, markers, Snapping and Loop, Fit / Fill / Stretch, rotate 90°, scale content to a new canvas size, tool keys V, T, R, E and more (32 rows newly Verified).
- Phase 1: log in, Save to cloud and Open from cloud (with media) through Supabase. Proven against a stand-in server here; the real local Supabase could not start in the sandbox (image downloads refused).
- Not done: marker colour (needs schema 10), Shift-constrained drag, Alt-drag duplicate on the canvas and 15° rotation snap (frozen contract, D-325), and the rows listed as partial or not built in the audit.

## 2. Scope and results
| ID | Result | Evidence (test title or file) |
|---|---|---|
| Audit (327 rows) | Done | reports/AUDIT-EDITOR.md; e2e/audit-editor.spec.ts; IDs added to the titles of existing tests that prove a row |
| PRJ-015, PRJ-016, PRJ-017, APP-006 to APP-008, PRJ-010 | Verified | e2e/editor-complete.spec.ts `[PRJ-015]…`, `[PRJ-016]…`, `[PRJ-017]…` |
| APP-002, APP-009, APP-010, APP-014, APP-017, APP-018, APP-004 | Verified | editor-complete.spec.ts |
| KEY-011, KEY-015 | Verified | editor-complete.spec.ts |
| TL-008, TL-022, TL-024, TL-026, TL-029, PB-006 | Verified | editor-complete.spec.ts |
| TL-037 | Claimed (marker colour blocked by schema 9) | `[TL-037]` covers rename, jumps, list, clear |
| VID-004, CV-021, CV-027, PRJ-007 | Verified | editor-complete.spec.ts |
| MED-016, REL-002, REL-007, LAY-005 | Verified | editor-complete.spec.ts |
| CV-005, CV-010 | Not done | frozen TRANSFORM_INTERACTION_CONTRACT.md (D-325) |
| APP-020 | Verified | e2e/phase1-cloud.spec.ts (3 tests) |
| Phase 1 database rules | Done | `npm run cloud:test` (supabase/tests/policies.sql) |

- The audit's "REALLY NEEDED NOW" checklist: every item ticked except TL-037 colour and CV-005/CV-010 (blocked, reasons in reports/AUDIT-EDITOR.md).
- Ledger now: 692 Verified, 9 Claimed, 118 Todo, 52 Deferred, 5 Dropped, 0 Bug.

## 3. Checks
- `npm run verify` (once, at commit a6670e8): exit 1. Format: pass. Typecheck (app and e2e): pass. Unit and jsdom: 1279 passed, 1 skipped in 142 files. Build: pass (33 s; the Supabase library is a separate lazy chunk). E2E: 668 passed, 7 failed, 5 skipped, plus the DEV-006 expected failure, in Chromium 153 (`/opt/pw-browsers/chromium-1243`, Playwright's Chromium; not Google Chrome), 1 worker, 1.5 h. Ledger step did not run (verify stops at the first failing step).
- The 7 failures, re-run alone after the fixes of D-328: FN3-018, CODE-012, FX-004/FX-015/CLR-001/MSK-001, LAY-055 (dark and light) were real and are fixed; F2-012 (recorder) and LAY-057 (menu wheel) passed alone with no change. Re-run: 6 of the 7 specs' tests plus t7-readable, shell, editor-complete, x5-security and t5-player: all passed (33 and 27 tests). Unit tests after the fixes: 1279 passed. `npm run ledger`: Ledger OK.
- Node 20 was used (`/opt/node20`); tests/blocks/worker.test.ts fails on Node 22 for an environment reason and passes on Node 20.
- CI: not checked (owner's instruction for this run).

## 4. Try-it script for the owner
| # | Do this | Expect | ID | Ran it (Y/N) | Screenshot |
|---|---|---|---|---|---|
| 1 | Main menu › File › Projects… | Cards of the projects in this browser; open, rename, duplicate, delete | PRJ-016 | Y (e2e) | test-results only |
| 2 | Make an edit, close the tab at once | The browser asks before leaving; reopen: the edit is there | APP-018, PRJ-015 | Y (e2e) | — |
| 3 | Look at the tab title after an edit | "• Name – AI-Native" until saved | APP-017 | Y (e2e) | — |
| 4 | Hover Undo after an edit | "Undo <step name>" | APP-014 | Y (e2e) | — |
| 5 | Timeline ruler at different zooms | m:ss labels; frame ticks when zoomed in | TL-008 | Y (e2e) | — |
| 6 | Select a clip, Shift+Delete | Later clips on that lane move left | TL-026 | Y (e2e) | — |
| 7 | Alt-drag a clip | A copy lands at the drop time on a new lane above | TL-024 | Y (e2e) | — |
| 8 | Press M twice at different times, right-click a marker | Rename, next/previous, list, clear | TL-037 | Y (e2e) | — |
| 9 | Player bar Loop and magnet buttons | Loop restarts the scene; snapping on/off | PB-006, TL-029 | Y (e2e) | — |
| 10 | Select a picture, toolbar Fit › Fill | The picture covers the canvas | VID-004 | Y (e2e) | — |
| 11 | Canvas size › tick Scale content to fit, pick 9:16 | Everything scales and stays centred, one Undo | PRJ-007 | Y (e2e) | — |
| 12 | Press T, R, E with nothing selected | Text box, rectangle, ellipse | KEY-015 | Y (e2e) | — |
| 13 | Cloud: follow reports/PHASE1-STATUS.md steps 1 to 7 | Account, save, open elsewhere with media | APP-020 | N (real Supabase blocked here; stand-in in e2e) | — |

No screenshots were saved for this report; the e2e traces and failure screenshots are in test-results/.

## 5. Deviations from the brief
- Real `supabase start` did not run (network policy refuses the Docker images). SQL tests ran on PostgreSQL 16 with stand-in auth and storage schemas; the browser test used a stand-in HTTP API (D-327).
- The full verify ran once; failures were fixed and re-run alone, as the brief says.

## 6. Decisions made
D-319 to D-328 in docs/DECISIONS.md (audit rules, local projects, keys, timeline, placement, safety, the frozen-contract stop, Phase 1 cloud, Phase 1 test path, final-verify fixes).

## 7. Not tested, known gaps, risks
- Real Supabase (Auth emails, real RLS through PostgREST, Storage limits) end to end: owner's PC.
- The cloud conflict dialog (two places saving the same project) is not driven by an e2e; the database side is tested.
- Google login: not wired to a button (interface ready).
- Large media uploads (hundreds of MB): one request per file, not tested.
- MP4/H.264 in Google Chrome on Windows: tested only in Playwright's Chromium 153, which decodes H.264 here.
- Performance rows (CV-032, TL-053, PB-012, FX-012, REL-005, EXP-010 at 30 min) need the reference PC.
- IndexedDB quota exhaustion with many large projects: not tested.
- F2-012 and LAY-057 failed once in the 1.5 h run and passed alone: possible timing flakes under a long run.
- Hindi strings for the new cloud and projects UI are machine-quality and need a native check.

## 8. Architecture and contract impact
- Schema version: none (9). Project JSON unchanged; projects now live in IndexedDB (D-320) with a one-time copy of the old localStorage slot.
- New dependency: `@supabase/supabase-js` 2.117.3 (MIT; about 650 KB unpacked, 9.1 MB with its `@supabase/*` parts; loaded lazily on the first account click). Reason: Auth with PKCE and token refresh, PostgREST and Storage in one maintained client. Alternative considered: hand-written fetch calls.
- Files added: src/persistence/projects.ts, src/ui/projects-dialog.ts, src/cloud/backend.ts, src/cloud/supabase.ts, src/ui/cloud-ui.ts, supabase/ (config, migration, SQL tests), scripts/cloud-sql-test.mjs, scripts/audit-editor-*.mjs, e2e/audit-editor.spec.ts, e2e/editor-complete.spec.ts, e2e/cloud-fake.ts, e2e/phase1-cloud.spec.ts, docs/PHASE1-PLAN.md, .env.example.
- Contracts touched: none. `src/core` gained only read-only `undoLabel` and `redoLabel` on the engine; no network code.

## 9. Ledger and backlog
- Status changes: 115 audit rows to Verified, 52 to Deferred, 32 Part B rows to Verified, APP-020 to Verified (reworded: it is live now).
- LCR applied: APP-020 wording (was "inert until accounts are built").
- Added to docs/BACKLOG_INBOX.md: 0 (gaps are listed in reports/AUDIT-EDITOR.md and reports/PHASE1-STATUS.md).

## 10. Git
- Branch: `claude/fix-5` (PR #48, draft, not merged). Tag: none (this run did not tag).
- `git log --oneline 6426240..HEAD`: a47e1b1 audit, 3c0889c editor items, a6670e8 Phase 1 cloud, plus the final-verify fixes commit.
- Review patch: not generated (no wave tag in this run).

## Owner tick-list
| ID | OK / BUG / MISSING / CHANGE | One sentence |
|---|---|---|
| | | |
