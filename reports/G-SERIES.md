# Report: G-series, G1 to G5 (2026-09-28)

Branch `claude/g-series`, draft PR #13 to `main`. This report is written part by part; the summary, checks and git sections are completed at the end of the series.

## 1. Summary

_Completed at the end of the series._

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

