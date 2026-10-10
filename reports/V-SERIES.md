# Report: V-series, Clipchamp clone (V1 to V5) (2026-10-10)

## 1. Summary

- The editor's regions are separate cards; the right rail and panel appear only when something is selected and leave no empty column.
- The timeline works like Clipchamp's: no lane headers, a click on any empty space deselects (and seeks), a marquee from anywhere, lanes centred live, the edge drag snaps then collapses, the frame-range dim is always live, a gap before the first clip can be deleted, duplicates and pastes land on a new lane above.
- The left Scene category is a Blender-style outliner with collections (create, rename, nest by drag, delete, duplicate, copy and paste, search, eye, lock, mute); it never changes the canvas.
- Filters (49 looks) and Effects are tile grids with live thumbnails of your picture, hover previews and settings under the tile; Adjust colors is a simple slider list.
- A "+" on a cut adds a transition; its lavender marker opens the right Transition panel (swap, duration, remove); the left Transitions category applies to the selected cut.
- Not done: Animate tiles in Clipchamp's style (the earlier Animate panel stays), dragging a transition tile onto a cut, dragging the band's edges, Background removal.

## 2. Scope and results

| ID                                  | Result                    | Evidence (test title or file)                                                                    |
| ----------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| LAY-063                             | Verified                  | e2e/v1-shell.spec.ts `[LAY-063] nothing selected: no right rail or panel…`                       |
| LAY-064                             | Verified                  | e2e/v1-shell.spec.ts `[LAY-064] regions are separate cards…`; tests/v1-regions.test.ts           |
| TL-093                              | Verified                  | e2e/v2-timeline.spec.ts `[TL-093]` (8 empty places)                                              |
| TL-094                              | Verified                  | e2e/v2-timeline.spec.ts `[TL-094]` (marquee from 6 empty starts, auto-scroll)                    |
| TL-095                              | Verified                  | e2e/v2-timeline.spec.ts `[TL-095]` (during the drag, 1, 3 and 14 lanes)                          |
| TL-096                              | Verified                  | e2e/v2-timeline.spec.ts `[TL-096]`                                                               |
| TL-097                              | Verified                  | e2e/v2-timeline.spec.ts `[TL-097]`                                                               |
| TL-098                              | Verified                  | e2e/v2-timeline.spec.ts `[TL-098]` (B22)                                                         |
| TL-099                              | Verified                  | e2e/v2-timeline.spec.ts `[TL-099]` (B23, canvas pixels compared)                                 |
| TL-100                              | Verified                  | e2e/v2-timeline.spec.ts `[TL-100]`; tests/v2-toast.test.ts (B6)                                  |
| LYR-016, LYR-017 (reworded)         | Verified                  | e2e/v3-outliner.spec.ts (pixel-identical canvas after every move)                                |
| FX-016, FX-017                      | Verified                  | e2e/v4-fx.spec.ts; tests/v4-fx-panels.test.ts                                                    |
| FX-018                              | Verified                  | e2e/v4-fx.spec.ts sweeps (49 filters, 28 effects; preview and PNG export); contact sheets        |
| TR-013, TR-014, TR-015, TR-016      | Verified                  | e2e/v5-transitions.spec.ts (28 transitions swept; contact sheet)                                 |
| TL-092, TR-010, TR-011 (reworded)   | Verified                  | e2e/tall-p3.spec.ts, e2e/i2-browse.spec.ts, e2e/j12-transitions.spec.ts                          |
| Spec 5 Animate tiles                | Not done (Claimed: old)   | The U5 Animate panel (cards with motion previews) stays; no Both/In/Out tile grid                |

- Spec 7 bugs B1 to B23: closed by TL-093 to TL-100, LAY-063, LAY-064 and V3 (B4, B10, B18 by removal). B13, B14, B15, B17 (duration chip, project length, tooltip placement) are covered by the earlier T-ALL tests and were not changed; not re-proven separately.
- In-scope P0 items Verified: all new rows above except the Animate tiles.

## 3. Checks

- `npm run verify`: exit 0 (third run; the first two runs found 6 and then 1 failure, each fixed: the first layout no longer animates, a 24 px transition marker, layout-settled view tests, the Export More options test).
- Format: OK. Typecheck: OK. Build: OK (built in 4.99 s). Test hook absent from the production build.
- Unit and jsdom tests: 650 passed in 52 files.
- E2E tests: 374 passed (29.0 min), 0 failed, in the sandbox Chromium (Playwright's pre-installed build; not Chrome or Edge, so MP4 export falls back to WebM).
- Ledger validation: 669 items, Verified 347, Claimed 14, Todo 308, Ledger OK.
- CI: not checked (owner rule: no CI polling).

## 4. Try-it script for the owner (about 10 minutes)

| #   | Do this                                                                                      | Expect                                                                                    | ID             | Ran it | Screenshot                                     |
| --- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------- | ------ | ---------------------------------------------- |
| 1   | Open the editor with nothing selected                                                        | No right rail or panel; separate cards with gaps                                          | LAY-063/064    | Y      | test-results (v1-shell)                        |
| 2   | Click a text layer, then the empty stage                                                     | The right side slides in, then away, the canvas recentres                                 | LAY-063        | Y      | —                                              |
| 3   | Click empty space between lanes, then drag a box over two clips                              | Deselects and moves the playhead; the box selects both                                    | TL-093/094     | Y      | —                                              |
| 4   | Drag the timeline's top edge down slowly                                                     | Snaps at its default, follows, then collapses to the player                               | TL-096         | Y      | —                                              |
| 5   | Ctrl+D on a clip                                                                             | The copy appears on a new lane above, same start                                          | TL-099         | Y      | —                                              |
| 6   | Right-click empty lane space                                                                 | Lock, Hide, Solo/Mute and lane moves                                                      | TL-100         | Y      | —                                              |
| 7   | Scene category: + to add a collection, drag a layer row onto it, double-click to rename      | Nested, renamed; the canvas does not change                                               | LYR-016        | Y      | —                                              |
| 8   | Select a picture, open Filters, hover then click Retro, drag Intensity                       | Hover shows nothing on the canvas; click applies; Intensity under the row                 | FX-016         | Y      | contact-filters.png                            |
| 9   | Effects: click VHS and Blur, change VHS noise, click None                                    | Both apply; settings under the row; None clears                                           | FX-017         | Y      | contact-effects.png                            |
| 10  | Put two pictures end to end; hover their cut and click "+"                                   | Fade through black, a lavender marker and band; the Transition panel opens                 | TR-013         | Y      | —                                              |
| 11  | Pick Cross fade, set Duration 2, then None                                                   | Swaps, the band widens, removed                                                           | TR-013         | Y      | —                                              |
| 12  | Play across the cut with Fade through white                                                  | The picture goes white at the cut and back                                                | TR-014         | Y      | —                                              |

## 5. Deviations from the brief

- Spec 5 names 51 filters but lists 49; all 49 listed are built.
- Filter Intensity defaults to 100 % (the library's full look), not 50 %.
- Video keeps an Animate tab (before Captions): removing it would remove working presets (AGENTS 3).
- Animate tiles (Both|In|Out, name tiles) were not rebuilt; the U5 Animate panel stays.
- Adjust colors' Transparency keeps the shared toolbar control (with a number box).
- Transitions: drag a tile onto a cut and drag the band's edges are not built (marked D in the spec).
- The FX sweep checks Crash zoom near the clip's end and Black/white removal on white with a high threshold (D-195).

## 6. Decisions made

D-190 (V1 shell), D-191 (V2 timeline and test rewrites), D-192 (V3 outliner), D-193 (V4 FX panels), D-194 (V5 transitions), D-195 (FX sweeps). See docs/DECISIONS.md.

## 7. Not tested, known gaps, risks

- Light theme region tones and the 101-item FX visuals were checked only through the contact sheets (dark theme); owner review is pending.
- Hover previews run on the main thread (160 x 90, 12.5 fps); heavy effects (Kaleidoscope, Glass) may stutter on slow machines; not measured.
- Thumbnails refresh when the selected picture changes; a moving video frame is sampled at the playhead only.
- The sandbox-only flakes PB-009, PB-010, VID-010 (audio and frame timing under load), EXP-001 (one duplicated frame under load) and HIS-004 (timing) recur under 4 parallel workers; they pass when run alone (owner decision on PB-010, 2026-09-24).
- MP4/AAC remain unproven in the sandbox Chromium (WebM fallback), as before.

## 8. Architecture and contract impact

- Schema version change: none (still 7).
- New dependencies: none.
- Files added: src/ui/scene-outliner.ts, src/ui/right-panel/fx-panels.ts, src/ui/right-panel/transition-tiles.ts, src/ui/transition-focus.ts, e2e/v1-shell, v2-timeline, v3-outliner, v4-fx, v5-transitions specs, e2e/fx-helpers.ts, tests/v1-regions, v2-toast, v4-fx-panels. Removed: src/ui/outliner.ts (timeline column), src/ui/transition-panel.ts (left Transition side panel), e2e/tall-p5.spec.ts (its IDs are proven by v3-outliner).
- Contracts touched: none.

## 9. Ledger and backlog

- New rows by LCR: LAY-063, LAY-064, TL-093 to TL-100, FX-016 to FX-018, TR-013 to TR-016. Reworded: LYR-016, LYR-017, TL-092, TR-010, TR-011.
- Added to docs/BACKLOG_INBOX.md: 0.

## 10. Git

- Branch: `claude/v-series` (stacked on `claude/t-all`, PR #22). No tag (the series is not accepted yet).
- Commits: V1 eac4036, V2 e2c4cf9 and the test rewrites, V3 2e8f40d, V4 0c966f5, V5 54411d0, docs.
