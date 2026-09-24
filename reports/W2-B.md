# Report: Wave 2 continuation W2-B, one clip model, locks, no overlaps and proof debt (2026-09-24)

## 1. Summary
The timeline now has one model: every layer is a clip on a track. The built-in example and older saves are converted when opened, so the confusing legacy free-layer rows from the Wave 2 QA are gone. Canvas drops, duplicates and groups always create clips.

A locked track now blocks every edit to its clips, including Delete (the bug known since Wave 0). Locked clips look locked, and refused edits show a toast.

Clips can no longer overlap on a track. Dropping or moving onto occupied time inserts the clip and pushes the later clips right, and a marker and dashed outlines preview this before you release. Keyboard nudges stop at neighbours.

17 of the 18 Claimed items the brief listed now have real browser tests. One, CV-008, turned out to be half-built: Alt resize from center is missing. It is now recorded as a Bug.

## 2. Scope and results
| ID | Result | Evidence (test title, e2e unless noted) |
|---|---|---|
| TL-001 | Verified | `[TL-001] every layer is a clip on a track: example, canvas drops and groups create no legacy rows`; unit `tests/clip-model.test.ts` |
| TL-004 | Verified (was Bug) | `[TL-004] a locked track blocks delete, drag, trim, split and keyboard edits with visible feedback`; the old `test.fail` was removed |
| TL-020, TL-030 | Verified | `[TL-020][TL-030] a drop onto occupied time inserts, previews the push and never overlaps`; unit insert-rule tests |
| TL-009 | Verified | `[TL-009] clicking or dragging the ruler moves the playhead and the canvas shows that time live` |
| TL-012 | Verified | `[TL-012] zoom-in and zoom-out buttons change the horizontal time scale` |
| TL-014 | Verified | `[TL-014] wheel, Shift+wheel and trackpad scroll horizontally; vertical scroll keeps headers aligned` |
| TL-016 | Verified | `[TL-016] dragging a clip within a track and across tracks is one undo step each` |
| TL-023 | Verified | `[TL-023] Ctrl+D and the Duplicate button create an independent copy` |
| TL-028 | Verified | `[TL-028] clip moves land on the frame grid; snapping to the playhead shows a line` and `[TL-057][TL-028] …` |
| TL-035 | Verified | `[TL-035] the Marker button adds a marker at the playhead` |
| PB-002 | Verified | `[PB-002] playback follows the wall clock even when frames are dropped` |
| CV-002 | Verified | `[CV-002] Shift or Ctrl click toggles layers in the multi-selection` |
| CV-003 | Verified | `[CV-003] a marquee drag on empty canvas selects the layers it touches` |
| CV-006 | Verified | `[CV-006] arrow keys nudge the selection by 1 px and Shift+arrow by 10 px` |
| CV-008 | **Bug** | Single-axis part proven by `[CV-008] an edge handle resizes on one axis only`. `test.fail('[CV-008] Alt+edge drag resizes from the center (not built)')` |
| CV-009 | Verified | `[CV-009] the rotation handle rotates around the visual center` |
| CV-016 | Verified | `[CV-016] Fit, plus and minus change the canvas view scale` |
| LYR-001 | Verified | `[LYR-001] the layer list, canvas and timeline share one selection` |
| LYR-002 | Verified | `[LYR-002] the layer list shows layers and groups in stacking order` (back to front; see §7) |
| INS-009 | Verified | `[INS-009] the keyframe diamond toggles a keyframe for its property` |
| INS-010 | Verified | `[INS-010] the Timing section shows the selected clip start time and duration` |

- In-scope P0 items Verified: 21 of 22.
- Not done, with reason: CV-008. Its Alt-from-center half is not built, and the fix belongs to the frozen transform-interaction contract. It is recorded as Bug (D-042).

## 3. Checks (real output tails; the full log was `e2e-results/W2-B-verify.log`, which is gitignored)
- `npm run verify`: exit 0. Format: `All matched files use Prettier code style!`. Typecheck: exit 0.
- Build: `✓ built in 797ms`; JS 236.62 kB (gzip 69.22), CSS 30.65 kB (gzip 5.90).
- Unit and jsdom: `Test Files 19 passed (19)`, `Tests 301 passed (301)` = 160 unit (7 new in `tests/clip-model.test.ts`) + 141 jsdom.
- E2E: `55 passed (1.1m)` = 53 normal passes + 2 expected failures (the DEV-006 guard probe and the CV-008 Alt reproduction). Zero unexpected, flaky or skipped. Browser: Chromium 141.0.7390.37 (fallback, D-030).
- Hook: `assert-no-test-hook: OK`. Ledger: `Ledger: 494 items | Verified 69 | Claimed 20 | Todo 404 | Bug 1` and `Ledger OK`.
- CI: the first GitHub Actions run ever was a manual (`workflow_dispatch`) run of Verify on `f74bc6b`: **success** in about 2½ minutes, on GitHub's Ubuntu runner with Playwright's Chromium. It is https://github.com/i2rlearning1998/my-codex-video-editor-ai/actions/runs/35926723652. Automatic push and pull_request runs had never been created; see the CI section of the PR.

## 4. Try-it script for the owner (about 10 minutes)
| # | Do this | Expect | ID | Claude ran it (Y/N) | Screenshot |
|---|---|---|---|---|---|
| 1 | Reload the app (built-in example) | The timeline shows Text 1…, Graphics 1… tracks with one clip per layer and no loose layer rows | TL-001 | Y (automated) | `test-results/clip-model-*TL-001*/example-as-clips.png` |
| 2 | Open `nle-example.json`; drag "Footage 1080p" from the left panel onto the canvas | A new clip appears on Video 3 (the free track), not as a loose row | TL-001 | Y (automated) | — |
| 3 | Shift-click clip-a and clip-b, then right-click → Group | One "Group" clip appears on a new Graphics 1 track; the two clips are gone from Video 1 | TL-001 | Y (automated) | — |
| 4 | Undo. Lock Video 1, click clip-a, press Delete; try dragging, trimming, S, Alt+→ | Clip-a is hatched. Clicking is quiet; each edit shows "Track is locked" and nothing changes | TL-004 | Y (automated) | — |
| 5 | Unlock. Drag clip-a right until it sits over clip-b, and hold | A yellow insertion marker appears at the drop time and clip-b shows dashed, pushed right | TL-030 | Y (automated) | `…TL-020-TL-030*/insert-push.png` |
| 6 | Release; then Undo | Clip-a lands at 2.5 s and clip-b moves to 4.5 s with no overlap; one Undo restores both | TL-020 | Y (automated) | — |
| 7 | Select clip-a, press Ctrl+D | The copy lands right after clip-a (2–4 s); clip-b moves to 4 s | TL-023, TL-030 | Y (automated) | — |
| 8 | Select clip-b, press Shift+Alt+← several times | Clip-b stops at 2 s, touching clip-a, and never overlaps it | TL-020 | Y (automated) | — |
| 9 | Click the ruler at 1 s, then at 3.5 s; drag along the ruler | The canvas changes live (the orange box appears only from 3 s) | TL-009 | Y (automated) | — |
| 10 | Timeline: horizontal wheel, Shift+wheel, then vertical wheel (example project) | It scrolls sideways with headers pinned left, then down with headers aligned to their rows | TL-014 | Y (automated) | — |
| 11 | Canvas: click the headline, Shift-click the subtitle, Ctrl-click the headline | Selection goes to both, then to the subtitle only | CV-002 | Y (automated) | — |
| 12 | Drag a box from the canvas's bottom-right empty corner over "01 — 04" | The edition number is selected | CV-003 | Y (automated) | — |
| 13 | Select "Accent label" and drag its right-edge handle; then drag the round handle above it | Width grows while the height stays the same; the rotation turns around the label's centre | CV-008, CV-009 | Y (automated) | — |
| 14 | Hold Alt while dragging the right-edge handle | **Known gap:** it does not resize from the centre | CV-008 | Y (expected failure) | — |
| 15 | Select the headline → Properties → click the diamond next to Position X twice | A keyframe is added, then removed | INS-009 | Y (automated) | — |

Every step above ran as an automated Playwright test in Chromium, and I inspected the example-as-clips screenshot by eye. No Windows Chrome run and no manual hand test were done.

## 5. Deviations from the brief
- **CV-008** was listed as safe but is only half-built, so it is Bug, not Verified (D-042).
- **Click versus drag on locked clips:** clicking a locked clip no longer throws; only a drag does. This is a small UX change made while proving TL-004 (D-041).
- **One jsdom test updated:** `tests/workspace.test.ts` pinned the old overlapping-drop result. Its expectation now follows the approved insert rule.
- **Tag:** as before, `w2-b` is to be created at merge. The branch was restarted from `main` after PR #2 merged.

## 6. Decisions made
D-038 to D-042 in `docs/DECISIONS.md`:
- D-038: the LCR.
- D-039: clip-first TL-001 (owner decision).
- D-040: the insert-and-push rule (owner decision).
- D-041: lock rule and feedback.
- D-042: CV-008 set to Bug.

## 7. Not tested, known gaps, risks
- **Not tested** in Google Chrome, Edge or on Windows; only Chromium 141 on Linux.
- **Group children have no timeline rows.** Their timing is edited only in the Inspector. This is an intentional narrowing (D-039).
- **The TL-001 invariant is kept by code paths and tests, not the schema validator.** A future command that creates top-level layers must also create a clip. The unit test for idempotent conversion and the e2e test guard it.
- **Converting a legacy document changes it on its next save.** The previous browser save stays as the backup. A file you import is not rewritten on disk; only the in-app copy is converted.
- **Multi-track moves (TL-017, still a Group B item)** use the insert rule per destination track, but there is no dedicated browser proof.
- **LYR-002:** the layer list is back to front (first row = backmost). This matches paint order, but the owner may prefer front-first (backlog).
- **Other findings (backlog):** the Media tab doesn't show the asset cards, and the Inspector shows raw floats after frame nudges.
- **Not tested:** undo across the conversion (it happens at load, before history, by design), and very large documents' conversion speed.

## 8. Architecture and contract impact
- Schema: none (stays 4). No dependencies.
- New core functions in `src/core/timeline.ts`: `adoptFreeLayers`, `planInsert`, `findFreeTrack`, `trackTypeForLayer`, `nextTrackName`.
- Command rule: `DELETE_LAYER` refuses locked clips.
- New UI helpers in `editing.ts`: `planLanding`, `landingCommands`, `trackForNewClip`.
- Load paths in `main.ts` convert documents.
- Files added: `briefs/W2-B.md`, `tests/clip-model.test.ts`, `e2e/clip-model.spec.ts`, `e2e/proof-w2b.spec.ts`, this report. Removed: `e2e/bugs.spec.ts`, whose only remaining reproduction (TL-004) is fixed.
- Contracts: none changed.

## 9. Ledger and backlog
- LCR applied: TL-003 and TL-005 Claimed → Todo; the stale status line was replaced.
- Status changes:
  - To Verified: TL-001, TL-004, TL-020, TL-030, TL-009, TL-012, TL-014, TL-016, TL-023, TL-028, TL-035, PB-002, CV-002, CV-003, CV-006, CV-009, CV-016, LYR-001, LYR-002, INS-009, INS-010.
  - CV-008: Claimed → Bug.
- Backlog: 5 new lines (LYR-002 order, CV-008 Alt, the Media tab, raw floats in the Inspector, nested rows for group children).

## 10. Git
- Branch: `claude/wave-2-timeline-clips-mwy1f3` (restarted from `main` at `fe92fc5`). Tag: `w2-b` is to be created at merge.
- Commits: the brief and LCR, core, UI, model tests, proof-debt tests, and docs/report. See the PR.
- Review patch: `npm run patch -- fe92fc5 HEAD W2-B`. The output is gitignored, so the PR diff is the record.

## Owner tick-list
| ID | OK / BUG / MISSING / CHANGE | One sentence |
|---|---|---|
| TL-001 | | |
| TL-004 | | |
| TL-020 / TL-030 | | |
| TL-009 / TL-012 / TL-014 / TL-016 / TL-023 / TL-028 / TL-035 | | |
| PB-002 | | |
| CV-002 / CV-003 / CV-006 / CV-009 / CV-016 | | |
| CV-008 | | |
| LYR-001 / LYR-002 | | |
| INS-009 / INS-010 | | |

## Addendum: owner follow-ups (2026-09-24)
| Item | Result | Evidence |
|---|---|---|
| Layer list order | Changed to front-first: the topmost layer is the first row, and groups list front-first with children underneath (D-043) | `[LYR-002] the layer list shows layers and groups in stacking order, topmost first` |
| Inspector raw decimals | Fixed: the Timing fields are display-rounded to 3 decimals, stored values stay exact, and an untouched field commits nothing (D-046) | `[INS-010] regression: timing values are display-rounded after a frame nudge, stored exactly`. It failed on the old code with `2.966666666666667`. |
| Media tab without cards | **Pre-existing, not a TL-001 regression.** The hiding rule (`library-placeholder … hidden = isMedia \|\| isScene`) came in with Wave 1 commit `417bdaf` and is identical at `78c9652`, before any Wave 2 work. It is logged as a ledger Bug, MED-035 (P0, W4), with a reproduction; no fix yet (D-044). | `test.fail('[MED-035] the Media tab lists the project media cards')` in `e2e/known-bugs.spec.ts` |
| CV-008 Alt from center | Left untouched. It needs an explicit owner decision to open the frozen transform-interaction contract (D-045). | Existing `test.fail('[CV-008] …')` |
