# Report: G-series, G1 to G5 (2026-09-28)

Branch `claude/g-series`, draft PR #13 to `main`. This report is written part by part; the summary, checks and git sections are completed at the end of the series.

## 1. Summary

- **Controls and panels (G1).** Every number, list and colour in the toolbar and Inspector now uses one set of Canva-style controls. Deep panels open on the left with Back, and right-click submenus open on hover.
- **Size and position (G2).** The Inspector, toolbar and Position panel show X, Y, W and H of what is drawn, and the values follow a drag live. Text, pictures and brush strokes are never stretched. The "2 selected" click bug is fixed.
- **Canvas view (G3).**
  - The canvas pans and zooms the way Canva and Figma do.
  - A marquee outlines what it will select, and layers outside the page stay visible and selectable.
  - With nothing selected, a scene bar sets the background and the scene length.
- **Draw (G4).** Pen, Marker, Highlighter, Glow pen and Eraser each draw differently and keep their own settings. The Eraser removes only the ink it passes over.
- **Scenes (G5).** Scenes live on a board: add, reorder, rename, delete, move layers between them. Playback and export run through all scenes.
- **Not built:**
  - a per-scene background and scene notes (they need a schema change);
  - shape assist (SHP-023);
  - transitions (Wave 6).

## 2. Scope and results

| Part | Ledger IDs                                                                                                  | Result                                                  | Evidence                                                                                                                     |
| ---- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| G1   | LAY-002, LAY-018, LAY-024, LAY-027 to LAY-030, INS-006, INS-007, SHP-005, CV-043                            | Verified                                                | `e2e/ui-foundation.spec.ts`, updated specs                                                                                   |
| G1   | LAY-022, LAY-023                                                                                            | Claimed (RGB/HSL/alpha entry; toggles not one module)   | `e2e/ui-foundation.spec.ts`                                                                                                  |
| G2   | CV-044, CV-045, INS-004, LYR-012, MED-015 (strengthened), CV-036, CV-041, CV-042 (updated)                  | Verified                                                | `e2e/transform-g2.spec.ts`, `e2e/ungroup-g2.spec.ts`, `tests/geometry.test.ts`                                               |
| G2   | CV-012                                                                                                      | Claimed (readout in panels, not on the canvas)          | `e2e/transform-g2.spec.ts`                                                                                                   |
| G3   | CV-003, CV-016, CV-018, CV-046, CV-047, CV-048                                                              | Verified                                                | `e2e/viewport-g3.spec.ts`, `tests/scenes.test.ts`                                                                            |
| G3   | CV-017                                                                                                      | Claimed (Fit, 100% and Fill are not one dropdown)       | `e2e/viewport-g3.spec.ts`                                                                                                    |
| G4   | SHP-018, SHP-019, SHP-020, SHP-021, SHP-022                                                                 | Verified                                                | `e2e/draw-g4.spec.ts`, `e2e/toolbar-draw.spec.ts`, `tests/drawing.test.ts`                                                   |
| G4   | SHP-023 (shape assist, stretch goal)                                                                        | Not done                                                | Todo in the ledger                                                                                                           |
| G5   | PRJ-013, PRJ-014, PRJ-020, PRJ-021, PRJ-022, EXP-019                                                        | Verified                                                | `e2e/scenes-g5.spec.ts`, `tests/scenes.test.ts`                                                                              |
| G3   | Per-scene background, scene Notes                                                                           | Not done (STOP: schema change)                          | Backlog, D-109                                                                                                               |

- Not done, with reason:
  - a per-scene background and scene Notes: schema 5 has no composition field for them (STOP rule);
  - shape assist: a stretch goal, left for later (SHP-023 Todo).

## 3. Checks

- `npm run verify`: exit code 0 (final run, after G5).
- Format: all files pass Prettier. Typecheck: clean. Build: `index` 482.50 kB (146.87 kB gzip), export `worker` 536.62 kB, CSS 54.73 kB.
- Unit and jsdom tests: 374 passed in 32 files.
- E2E: 179 passed plus the expected DEV-006 guard probe, in the sandbox Chromium 141.0.7390.37 (no Chrome or Edge in the sandbox, D-030). Node 22.22.2.
- Ledger: `Ledger OK`, 524 items: 180 Verified, 14 Claimed, 330 Todo.
- CI: see section 10.

## 5. Deviations from the brief

- **Background (G3.3).** It is stored in the project, not the composition: schema 5 has no composition background field, and a schema change is a STOP condition. It applies to every scene. Notes were skipped for the same reason.
- **Scene Duration (G3.3).** It works by retiming clips, because the validator derives a composition's duration from its content (D-109).
- **Line W (G2.1).** A line's W is its length; round caps reach past it, as in Figma. Fitting the caps inside would have made square caps look identical to flat ones.
- **The board (G5).** It is a scrolling row of cards, not a free zoomable canvas.
- **Template scenes (G5).** They use the one built-in layout; the template library is Wave 8.

## 6. Decisions made

D-100 to D-113 in `docs/DECISIONS.md`. D-111 supersedes D-079 (shared brush settings).

## 7. Not tested, known gaps, risks

- Every step of the try-it scripts below is covered by a Playwright test in the sandbox Chromium. Nothing was run by hand in Chrome or Edge on Windows. MP4 export in Chrome is proven only by the existing CI job `export-mp4`.
- The trackpad pinch is proven through Ctrl+wheel (Chromium reports a pinch that way); a real trackpad was not used.
- The eyedropper exists only where the browser has the EyeDropper API; the test does not use it.
- In one full e2e run the frame-exact export test (EXP-001) read one frame as the previous one; it passed on its re-run and in the final verify. Watch it in CI.
- CI showed a flake on some G-series runs: KEY-002, KEY-006 and CV-040 failed on one run and passed on the other run of the same commit.
  - Cause (from G1): the shortcut dispatcher ignored keys aimed at a menu, and a menu that has just closed keeps focus until the next frame. A shortcut pressed in that moment was lost, and a quick user could hit it too.
  - Fixed: keys are now ignored only while the menu is still shown (D-113).
  - A regression test sends the key in the same task as the menu click and fails on the old code.
- Each part below lists its own known gaps.

## 8. Architecture and contract impact

- **Schema:** unchanged (5).
- **New dependencies:** none.
- **Contracts:** `TRANSFORM_INTERACTION_CONTRACT.md` revision 7 (pre-authorised): handles per type, the size and position fields, live values, and the click rule. `TRANSFORM_CONTRACT.md` has a pointer note only.
- **New core commands (additive):** `SET_PROJECT_BACKGROUND`, `SET_COMPOSITION`, `MOVE_COMPOSITION`, `DELETE_COMPOSITION`.
- **New modules:**
  - `ui/components/*` (number field, select, colour picker, popover);
  - `ui/side-panel.ts`, `ui/geometry*.ts`, `ui/canvas-view.ts`, `ui/scene-length.ts`, `ui/scenes.ts`, `ui/scene-board.ts`;
  - `export/join.ts`.
- **Data inside existing properties:** a drawing's `path` may hold several sub-strokes separated by `;`, and `brush` may be `glow` (D-111).

## 9. Ledger and backlog

- **Rows added (LCR):**
  - CV-043 to CV-048;
  - LAY-027 to LAY-030;
  - SHP-021 to SHP-023;
  - PRJ-020 to PRJ-022;
  - EXP-019;
  - ANI-020.
- **Reworded:** SHP-018 and SHP-020 (owner's G4 brief).
- **Status changes:**
  - to Verified: LAY-002, LAY-018, LAY-024, INS-004, INS-006, INS-007, CV-018, PRJ-013, PRJ-014;
  - to Claimed: LAY-022, LAY-023, CV-012, CV-017.
- **Backlog:** lines for native controls still in dialogs, the per-scene background and notes, the zoom dropdown, and the board's gaps.

## 10. Git

- Branch `claude/g-series`, draft PR #13 to `main` (marked ready after this report). Not merged.
- Review patch: run `npm run patch -- origin/main HEAD G-SERIES`. It writes `reports/G-SERIES.patch` and `reports/G-SERIES.stat.txt`, which are git-ignored, so they are generated locally and not committed.
- Commits: see `git log --oneline origin/main..HEAD`. The G1 to G5 feature commits are listed in the PR.

## Part G1: UI foundation

### What changed

- One set of shared controls (D-100):
  - a number field: drag the label to scrub, type, use arrows, see units; values clamp with a message; a chevron opens a slider and presets;
  - a custom select that previews fonts in their own face;
  - a colour picker: square, hue, hex, eyedropper, recent, design and default colours, and No fill;
  - anchored popovers that can nest.
  - The toolbar, the Inspector and the Animate panel use them.
- Position, Animate, Colour and Stroke style open in the left side panel with Back. Spacing is a popover under the toolbar. Stroke style no longer adds a second toolbar row (D-101).
- Right-click menus:
  - submenus open on hover after 150 ms and survive a diagonal move;
  - the keyboard works at every level, and there is no scrollbar;
  - Link clips and Enable/disable clip no longer show on the canvas, and Copy style is always visible (D-102).
- Hover, pressed and focus states on buttons; thin themed scrollbars.
- Stroke caps and joins change the exported frame, not just the stored value.
- Refresh bug: after a reload, each rail category shows only its own panel (D-103).

### Try it (G1)

| #   | Do this                                                                    | Expect                                                                       | ID             |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------- |
| 1   | Reload the page, then click Media, Text and Scene in the rail              | Each shows only its own panel, also right after the reload                   | LAY-002        |
| 2   | Select the headline; in the Inspector drag the "Position X" label sideways | The value scrubs and the layer moves; one undo step on release               | INS-006        |
| 3   | Type 150 in Opacity and press Enter                                        | It clamps to 100 with a short message                                        | INS-006        |
| 4   | Open the toolbar's Font list and move with the arrow keys                  | A custom list; each font is shown in its own face; Enter picks               | LAY-018        |
| 5   | Click the text colour swatch                                               | The Colour panel opens on the left with Back; pick a swatch; one undo step   | LAY-022        |
| 6   | Right-click a layer and hover "Align"                                      | The submenu opens beside the menu; the menu has no scrollbar                 | LAY-030        |
| 7   | Add a line from Elements, open Stroke style, set Square caps               | The line's ends change on the canvas and in an exported PNG                  | SHP-005        |
| 8   | Tab through the top bar                                                    | A visible focus ring on each button                                          | LAY-029        |

### Known gaps (G1)

- The export dialog, the New project form, the composition picker and the keyframe easing select still use native controls (backlog).
- LAY-022 stays Claimed: the picker has no RGB, HSL or alpha entry.
- LAY-023 stays Claimed: segmented controls, toggles and tooltips are not yet one module.

## Part G2: transform correctness

### What changed

- **Size and position fields (CV-044, INS-004, D-105).**
  - The Inspector, the image and video toolbar and the Position panel all show X, Y, W and H of the drawn box in pixels, plus a ratio lock that is on by default.
  - The three surfaces share one module, so they always agree.
  - The values follow a handle drag live and are committed once on release.
  - W and H keep X and Y.
  - For text, W is the box width (the text rewraps) and H follows the text.
  - Groups and drawings always keep their ratio.
  - For a multi-selection, X and Y move every layer together.
  - The old stored values (anchor position, scale, rotation, opacity) stay below, as secondary rows.
- **Handles per type (CV-045, D-106).** This is contract revision 7.
  - Groups and freehand drawings resize from their corners only.
  - Lines and arrows lengthen from their two ends.
  - A multi-selection box offers side handles only when every layer is a plain shape.
  - Glyphs, pictures and brush strokes are never stretched.
- **Ungroup (D-107).** It still removes one level (unchanged).
  - Verified: a nested group can be ungrouped directly, its children become the selection and keep their drawn boxes, and the Layers tab shows nesting with the group icon.
  - The "2 selected" report reproduced: after Ungroup, a click on one freed child kept both selected. A click now selects just that child; a drag still moves both.
- **Media cards (MED-015).** A real mouse drag of an imported card onto the canvas refers to the existing asset: no new asset and no new stored bytes.

### Try it (G2)

| #   | Do this                                                                            | Expect                                                                          | ID             |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------- |
| 1   | Select the headline                                                                | Inspector starts with X, Y, W, H; X and Y are the box's top-left                | CV-044         |
| 2   | Drag the headline's bottom-right corner slowly                                     | W and H change while you drag; letters grow evenly, never stretched             | CV-044, CV-045 |
| 3   | Type 300 in W for the badge                                                        | It grows to 300 wide, the height follows (lock on), the top-left stays          | INS-004        |
| 4   | Turn the lock off and type a new H                                                 | Only the height changes                                                         | INS-004        |
| 5   | Select the card group; hover its sides                                             | No side handles, only corners and rotate                                        | CV-045         |
| 6   | Add a line from Elements                                                           | Only two end handles; dragging one makes the line longer                        | CV-045         |
| 7   | Shift-click the badge and the subtitle; type a new X                               | Both move together, one undo step                                               | CV-044         |
| 8   | Select the card group, press Ctrl+Shift+G, then click one of the freed cards once  | Ungroup frees two layers; the click selects only the one card ("1" not "2")     | LYR-012        |
| 9   | Open Position (from the action cluster) and the Layers tab                         | The group has its icon and its layers are indented under it                     | LYR-008        |
| 10  | Import a picture and drag its card onto the canvas twice                           | Two layers, but the Media tab still has one card                                | MED-015        |

### Known gaps (G2)

- CV-012 stays Claimed: the live readout is in the panels, not a label on the canvas.
- Text and shape toolbars do not show X, Y, W and H; they reach them through the Position button (as in Canva).
- For a layer inside a non-uniformly scaled, rotated group, W and H are measured along the layer's own axes; the drawn shape may be skewed.
- Layers tab rows for group children can be selected but not dragged (LYR-004 is still Todo).

## Part G3: viewport and canvas

### What changed

- **Marquee (CV-003, CV-046).** A drag from empty space, inside or outside the artboard, outlines the layers it will select while it grows; release selects them.
- **Pan (CV-018, CV-047, D-108).** Pan with:
  - Space-drag, the middle button, or the new hand tool (H, beside the zoom buttons);
  - wheel or trackpad scroll, with Shift+wheel for sideways.
  - Space without a drag still plays and pauses.
- **Zoom (CV-016, CV-017, D-108).** The view zooms:
  - toward the pointer with Ctrl+wheel (or a trackpad pinch);
  - around the view's centre with the buttons, the new % field (100 = actual pixels; presets 25 to 400), the 100% button and Ctrl+= / Ctrl+- / Ctrl+1;
  - Fit (Ctrl+0) also resets the pan, and "Zoom to fill" is in the palette.
- **Outside the artboard (CV-047).** Parts of layers outside the artboard are drawn at 30% in the editor (never in export) and can be clicked.
- **Scene bar (CV-048, D-109).** With nothing selected, the toolbar shows:
  - the scene's name;
  - Background (applies to every scene, see known gaps);
  - Scene length: longer extends the clips that end with the scene, shorter trims clips past the new end, one undo step, and a length that would cut a clip away is refused with a message;
  - Animate, disabled and naming Wave 8 (ANI-020).
- **New commands (D-110).** Four small scene commands (background, rename, reorder, delete), with no schema change.

### Try it (G3)

| #   | Do this                                                                  | Expect                                                                         | ID             |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | -------------- |
| 1   | Drag from the grey area left of the page across the badge and subtitle   | Both get an outline while you drag; releasing selects them                     | CV-046         |
| 2   | Hold Space and drag on the canvas                                        | The page moves with the pointer; nothing is selected or moved                  | CV-018         |
| 3   | Tap Space once over the canvas                                           | Playback starts; tap again to pause                                            | KEY-006        |
| 4   | Hold Ctrl and scroll up with the pointer over the headline               | The view zooms in and the headline stays under the pointer                     | CV-017         |
| 5   | Type 100 in the zoom % field                                             | Actual size; then press Ctrl+0 to fit again (pan resets)                       | CV-017         |
| 6   | Click the hand icon and drag the headline                                | The view pans; the headline does not move. Press H to leave                    | CV-047         |
| 7   | Set the badge's X to -240, zoom out twice, click the faded badge         | It shows faintly outside the page and becomes selected                         | CV-047         |
| 8   | Click empty canvas                                                       | The toolbar shows the scene name, Background, Scene length and a grey Animate  | CV-048         |
| 9   | Change Background, then Scene length to a larger number                  | The page colour changes; the timeline gets longer; Ctrl+Z undoes each          | CV-048         |

### Known gaps (G3)

- Background applies to all scenes. A per-scene background and scene Notes need a new composition field (schema 6), so they were not built (STOP rule; backlog).
- CV-017 stays Claimed: Fit, 100% and Fill are not in one dropdown.
- The view is not remembered across reloads (transient, like selection).

## Part G4: Draw rebuilt

### What changed

- **Five tools (SHP-018, SHP-021, D-111):** Pen, Marker, Highlighter, Glow pen and Eraser. Each brush draws differently:
  - Pen: a solid round line;
  - Marker: a softer, lighter rim around a solid core;
  - Highlighter: flat (chisel) ends, translucent, multiplying with what is under it so text stays readable;
  - Glow pen: a bright white core with a halo of its colour.
  - Every stroke records its brush, and preview and export draw it the same way.
- **Own settings per brush (SHP-018, D-111).** Each brush keeps its own size, colour and opacity; this replaces the shared settings of D-079.
  - Size and opacity run 1 to 100, each with a number field, slider and presets.
  - Colour comes from the design's colours, the full picker or the eyedropper.
  - The Eraser has only a size.
- **Drawing aids (SHP-022):** smoothed strokes; Shift for a straight line from the start point; a circle the size of the brush follows the pointer.
- **Area eraser (SHP-020, D-111).** It removes only the ink it passes over:
  - a stroke it crosses is cut into parts, which stay one layer with one clip;
  - a stroke it covers completely is deleted;
  - the ink either side stays where it was, and each drag is one undo step.
- **Strokes stay ordinary layers:** selectable, movable and resizable from their corners (G2).

### Try it (G4)

| #   | Do this                                                                             | Expect                                                                         | ID      |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------- |
| 1   | Open Draw; draw one line each with Pen, Marker, Highlighter and Glow pen            | Four clearly different looks: solid, soft rim, flat translucent, glowing       | SHP-021 |
| 2   | Draw the Highlighter across some text                                               | The text stays readable under it                                               | SHP-021 |
| 3   | Pick the Marker, set Size 20 and Opacity 60, then pick the Pen                      | The Pen still has its own size and opacity; back to Marker: 20 and 60 again    | SHP-018 |
| 4   | Open the colour, click a colour listed under "In this design"                       | The brush takes that colour                                                    | SHP-018 |
| 5   | Hover the canvas with a brush                                                       | A circle the size of the brush follows the pointer                             | SHP-022 |
| 6   | Hold Shift and draw a zigzag                                                        | A straight line from where you started to where you let go                     | SHP-022 |
| 7   | Pick the Eraser and drag across the middle of a stroke                              | Only the part under the eraser disappears; the two ends stay; Ctrl+Z restores  | SHP-020 |
| 8   | Press V, click a stroke and drag its corner                                         | It is selected and grows evenly                                                | SHP-019 |

### Known gaps (G4)

- Shape assist (turning a rough line, rectangle or ellipse into a clean shape) is not built: SHP-023 stays Todo.
- The eraser works on the stroke's centre line (plus a quarter of its width), so a sliver of a very wide stroke can remain at the eraser's edge.
- The Glow pen's halo and the Marker's rim reach slightly past the layer's box, like a line's round caps.
- In one full e2e run in the sandbox, the frame-exact export test (EXP-001) read one exported frame as the previous one; the whole export spec passed on a re-run (9 of 9). The test's video has no drawings, so G4 does not touch it. It is recorded here as a possible sandbox load flake, to watch in CI.

## Part G5: scenes board

### What changed

- **Scenes board (PRJ-014, PRJ-020, D-112).** A **Scenes** button above the canvas opens a board: every scene in one row, in playback order.
  - Each card shows a poster (the scene at its start), its name and its length.
  - A transition chip sits between scenes; it is disabled and names Wave 6.
  - Double-click (or Enter) opens a scene, and the timeline then shows that scene only. Esc closes the board.
- **Managing scenes (PRJ-013), one undo step each:**
  - drag cards to reorder;
  - Rename, Duplicate and Delete on each card;
  - "+" adds a blank scene, a copy of this scene, or the example layout, right after the current scene.
- **Moving layers (PRJ-021).** Drag a layer from the Scene list (or the Position panel's Layers tab) onto a scene card and it moves there with its clip, at the same time. Hold Alt to copy it instead.
- **Playback (PRJ-022).** At the end of a scene, playback continues into the next one.
- **Export (EXP-019).**
  - By default the export joins all scenes one after another; "This scene only" exports the open scene.
  - Scenes of different sizes can only be exported one at a time.
- **Fix (CV-048).** Scene length now also retimes layers inside groups; before, a group's children kept the scene at its old length.

### Try it (G5)

| #   | Do this                                                                        | Expect                                                                         | ID      |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------- |
| 1   | Click **Scenes** above the canvas                                              | One card with a poster, name and length                                        | PRJ-020 |
| 2   | Click "+", choose "Duplicate this scene"                                       | A second card; it opens; a grey transition chip sits between the cards         | PRJ-013 |
| 3   | Open Scenes again, click "+", choose "From a layout"                           | A third scene with the example design                                          | PRJ-013 |
| 4   | Drag the last card onto the first                                              | It moves to the front; Ctrl+Z puts it back                                     | PRJ-013 |
| 5   | Rename a scene with its pencil button, then delete one with the bin            | The name changes; the scene goes; Ctrl+Z restores it                           | PRJ-013 |
| 6   | Drag a layer from the Scene list onto another scene's card; then hold Alt      | It moves to that scene; with Alt a copy is made and the original stays         | PRJ-021 |
| 7   | Double-click a card                                                            | That scene opens; the timeline shows only its clips                            | PRJ-020 |
| 8   | Seek near the end of the first scene and press Play                            | Playback carries on into the next scene                                        | PRJ-022 |
| 9   | Export                                                                         | "Scenes: All scenes" is chosen; the end time is the total of all scenes        | EXP-019 |

### Known gaps (G5)

- Scenes that are not open show video and images as placeholders on the board until their media has been shown once.
- The board is a scrolling row of cards, not a zoomable canvas. Zooming out from the canvas does not open it; the Scenes button does.
- Transitions between scenes are not built (Wave 6).
- A per-scene background needs a schema change (see G3).
- Moving a linked clip to another scene drops its link.

## Owner tick-list (owner fills this in and sends it to Claude)

| ID | OK / BUG / MISSING / CHANGE | One sentence |
| --- | --- | --- |
| LAY-002 | | |
| INS-006 | | |
| LAY-018 | | |
| LAY-022 | | |
| LAY-030 | | |
| LAY-028 | | |
| SHP-005 | | |
| CV-044 | | |
| CV-045 | | |
| INS-004 | | |
| LYR-012 | | |
| MED-015 | | |
| CV-046 | | |
| CV-018 | | |
| CV-017 | | |
| CV-047 | | |
| CV-048 | | |
| SHP-018 | | |
| SHP-020 | | |
| SHP-021 | | |
| SHP-022 | | |
| PRJ-013 | | |
| PRJ-020 | | |
| PRJ-021 | | |
| PRJ-022 | | |
| EXP-019 | | |
