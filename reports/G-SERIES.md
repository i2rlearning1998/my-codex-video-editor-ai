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
