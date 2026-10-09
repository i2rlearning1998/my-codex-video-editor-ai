# Report: T-ALL (P1 to P6) (2026-10-09)

## 1. Summary

- **P1 layout:**
  - The editor opens on Media, and new projects are white.
  - The Media empty state has an illustration.
  - The right panel follows the selection.
  - The panel buttons sit in each panel's header.
  - The left rail and panel run full height.
- **P2 timeline:** follows spec 1 to 3 and 10.
  - The empty timeline shows one drop lane, and ghost lanes appear around a single lane.
  - A blocked drop shows only the blocked cursor.
  - The "+" line follows the pointer.
  - The playhead is always on top, and the ruler band follows a clip drag.
- **P3:** the view pages while playing zoomed in. The scroll range is fixed, the lanes are centred and the preview keeps a minimum height.
- **P4 frame range:** fields take five digits and the lanes dim outside the range. First and Last frame go to Start and End, and playback loops in the range.
- **P5 Layers outliner (schema 7):** a column beside the lanes, closed by default.
  - Nested collections can be renamed and dragged, per scene.
  - The outliner only organises: proven by unchanged canvas pixels and layers.
  - Selection syncs both ways, and selecting reveals the clip in the timeline.
  - Each element row has eye, lock, solo and mute.
- **P6 FX:** Codex's FX library (PR #19) is copied unchanged and wired in.
  - Filters, effects, colour adjustments, blend modes and 21 pixel transitions.
  - Each change is one undo step and is saved with the project.
  - Preview and export share one render path.
- **Still missing:**
  - FX thumbnails and hover previews.
  - Effect parameters beyond intensity and amount.
  - Keyframable effects.
  - Real-time performance with heavy effects.

## 2. Scope and results

| ID                                              | Result                                                       | Evidence                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| LAY-060, LAY-061, LAY-062                       | Verified                                                     | e2e/tall-p1.spec.ts                                                       |
| TL-088, TL-089, TL-090, TL-065                  | Verified                                                     | e2e/tall-p2.spec.ts, e2e/j8-empty.spec.ts                                 |
| TL-091, TL-092, TL-055                          | Verified                                                     | e2e/tall-p3.spec.ts, e2e/timeline-w2.spec.ts                              |
| PB-016 (reworded)                               | Verified                                                     | e2e/u6-frames.spec.ts                                                     |
| LYR-016, LYR-017                                | Verified                                                     | e2e/tall-p5.spec.ts; tests/outliner.test.ts (schema 7, migration, undo)   |
| FX-004, FX-015, FX-010, TR-004, TR-012          | Verified                                                     | e2e/tall-p6.spec.ts                                                       |
| CLR-001                                         | Claimed: 4 of 11 colour controls                             | e2e/tall-p6.spec.ts (exposure)                                            |
| MSK-001                                         | Claimed: 16 library modes, no "Add"; stored but not pixel-tested | e2e/tall-p6.spec.ts                                                   |
| FX-001, FX-002 (reorder, copy), FX-003, FX-012  | Not done: no thumbnails, reorder, keyframes or performance work | —                                                                      |

- In-scope P0 items Verified: every new row except CLR-001 and MSK-001 (Claimed, above).
- Not done, with reason: the FX thumbnails, hover previews and keyframable parameters were outside the "simplest implementation" budget of this brief.

## 3. Checks

- `npm run verify`: exit 0 (second full run; the first had 3 failures, LAY-035, MED-039 and MED-041, fixed in the last commit; see section 5).
- Format, typecheck and build: passed.
- Unit and jsdom tests: 643 passed in 49 files (233 of them are FX library tests from PR #19).
- E2E: 356 passed (including the expected DEV-006 probe), sandbox Chromium (pre-installed, D-030).
- Ledger: 652 items, Verified 330, Claimed 14, Todo 308, Ledger OK.
- CI: not checked, by owner instruction.

## 4. Try-it script for the owner

| #   | Do this | Expect | ID | Ran it (Y/N) | Screenshot |
| --- | ------- | ------ | -- | ------------ | ---------- |
| 1 | Reload the editor | The Media panel is open; the right panel is empty until you select something | LAY-060, LAY-062 | Y (e2e) | — |
| 2 | File › New project | The canvas is white | LAY-061 | Y (e2e) | — |
| 3 | Delete every clip | One drop lane with "+"; the transport is disabled | TL-088 | Y (e2e) | — |
| 4 | Drag media over the lanes, above and below them | Only same-group content shares a lane; a blocked lane shows only the blocked cursor | TL-089 | Y (e2e) | — |
| 5 | Zoom in and press Play | The view pages so the playhead stays visible | TL-091 | Y (e2e) | — |
| 6 | Set Start 30 and End 90 in the frame row, then Play | The lanes dim outside; playback loops from 90 back to 30 | PB-016 | Y (e2e) | — |
| 7 | Open Layers (the chevron at the timeline's left), click +, double-click it, rename it, drag an element onto it | The collection nests; the canvas does not change | LYR-016 | Y (e2e) | — |
| 8 | Click an element on the canvas | Its row is highlighted; a closed collection opens | LYR-017 | Y (e2e) | — |
| 9 | Select a picture › Filters › Black and white, then set intensity 0 | It turns grey, then returns to the original | FX-004 | Y (e2e) | — |
| 10 | Adjust colors › Exposure 100, Blend mode Multiply, then Reset | It brightens; Reset restores it | CLR-001 | Y (e2e) | — |
| 11 | Effects › Pixelation, then reload | It is still applied | FX-015 | Y (e2e) | — |
| 12 | Add a transition between two touching pictures › More › Burn; play across the cut; export | It darkens at the cut, in the preview and the export | TR-012, FX-010 | Y (e2e) | test-results/…/burn.png |

## 5. Deviations from the brief

- Two full verify runs instead of one: the first was red on three tests (the closed outliner took 40 px of lane width; two tests still stated P1/P2's old rules), so a second run was needed before the PR could be ready.

- **Lane headers kept (P5):** the outliner sits beside the lane headers, not in their place, and is closed by default. Removing the headers moved every timeline coordinate and broke many earlier tests (D-187).
- **No FX thumbnails (P6):** the item names are shown instead. The FX item names are in English in the Hindi catalog too.
- **Fewer tests than the brief listed:** one test was written for each item group, not one for each of the 101 FX items. Of the library's items, only Black and white, Exposure, Multiply, Pixelation and Burn were exercised in the real editor.

## 6. Decisions made

- D-183 to D-185: the P1 to P3 layout, lane and scrolling rules.
- D-186: P4 frame range, plus taller default timelines for the frame row.
- D-187: P5 outliner and schema 7.
- D-188: P6 FX library import, unchanged.
- D-189: P6 FX wiring.

## 7. Not tested, known gaps, risks

- **FX items not tried in the editor:** 96 of the 101 FX items were never applied in the real editor; only their unit tests from PR #19 cover them. Expect visual surprises, especially the keying effects, the motion effects and the 2.5D transitions.
- **FX performance:** each FX layer is processed on the CPU in every preview frame, so playback with heavy effects (Swirl, blurs) will drop frames.
- **FX on groups:** a group's stack is applied to each child separately, not to the group as a whole.
- **FX on the canvas edge:** spatial effects work in canvas pixels and clip at the canvas edge.
- **Outliner:**
  - Keyboard tree navigation (arrow keys) is not built.
  - Dragging a row into another scene is not built.
  - The organisation is per scene only.
- **Sandbox flakes:** PB-010 (known) and HIS-004 run close to their timeouts under parallel load. Both pass when run alone.

## 8. Architecture and contract impact

- **Schema:** v6 to v7 (an optional `outliner` field per composition).
  - The migration only bumps the version.
  - Fixture: `tests/fixtures/projects/v6-outliner.json`.
- **New dependencies:** none.
- **Files added:**
  - `src/fx/*`, `tests/fx/*`, `fx-gallery/*` and `docs/FX-LIBRARY.md`, copied from PR #19.
  - `src/core/fx.ts`, `src/render/fx.ts` and `src/ui/outliner.ts`.
- **New commands (additive):** `SET_OUTLINER` and `SET_CLIP_FX`.
- **Contracts touched:** none. The transform contract and the renderer's transform helpers are unchanged.

## 9. Ledger and backlog

- **Status changes:**
  - Verified: FX-004, FX-010, TR-004.
  - Claimed: CLR-001, MSK-001.
- **LCRs applied:**
  - Added: LYR-016, LYR-017, FX-015 and TR-012.
  - Reworded: PB-016 and TR-011.
  - Also added, from P1 to P3: LAY-060 to LAY-062 and TL-088 to TL-092.
- **Added to the backlog:** 0.

## 10. Git

- **Branch:** `claude/t-all`, draft PR #22 into `claude/u-series`. No tag yet; the owner tags after acceptance.
- **Commits:** see `git log --oneline claude/u-series..claude/t-all`.

## Owner tick-list

| ID  | OK / BUG / MISSING / CHANGE | One sentence |
| --- | --------------------------- | ------------ |
|     |                             |              |
