# Brief W2-D: smart guides, snapping, align and distribute

Wave: 2 (continuation). Base: PR #3 head `c4b8720` (W4-C, unmerged). End tag: `w2-d` (created at merge). Branch: `claude/wave-2-timeline-clips-mwy1f3` (PR #3).
Authority: `AGENTS.md`, then this brief, then `docs/FEATURES.md`.

## 1. Goal

Layers dragged or resized on the canvas snap to useful lines, and pink guide lines show where they snapped. The lines are:

- the canvas edges and center;
- the safe margins;
- the edges and centers of other layers.

Holding Ctrl while dragging places freely. Several layers can be aligned (left, center, right, top, middle, bottom) or evenly distributed in one undo step, relative to the selection or to the canvas.

## 2. In scope (ledger IDs)

- CV-013: smart guides and snapping.
- CV-025: align and distribute.

## 3. Out of scope

- Rulers, user guides and the grid (CV-014).
- Safe-area overlays (CV-015). The safe margins act as snap lines only; no overlay is drawn when nothing snaps.
- The live size and position readout (CV-012).
- Shift-rotate 15° steps (CV-010). Rotation never snaps.
- The rest of the right-click layer menu (CV-020): lock, hide, order and flip stay as they are. Only an **Align ›** submenu is added.
- The context toolbar (W2-E) and timeline snapping (already built, unchanged).

## 4. Ledger Change Requests to apply first

None. Both IDs exist.

## 5. Contracts, schema and dependencies

- `TRANSFORM_INTERACTION_CONTRACT.md` goes to **revision 5**. The owner authorized it on 2026-09-24 as an additive change (D-066). It adds two things:
  1. **Snapping** for body moves, corner and edge resizes, and text-width grips.
  2. **Draw mode**, written into the contract now so that W2-E does not need another revision. It is not built in W2-D.

  Everything else in revision 4 stays unchanged, including rotation, history, cancel and the no-op rules.

- `TRANSFORM_CONTRACT.md` spatial semantics are unchanged. Alignment writes positions through the existing `SET_PROPERTY` commands.
- Schema stays 4. No new dependencies.
- Decision numbers continue from D-066, because PR #4 (W5-A, stacked) already uses D-062 to D-065.

## 6. Design notes

- **Snap targets (world/composition space).** Each target has an x and a y component:
  - **Canvas:** the left, center and right x; the top, middle and bottom y.
  - **Safe margins:** 5% inset from each canvas edge.
  - **Other layers:** every other selectable layer drawn at the playhead, resolved like a canvas pick (the top-level layer, or the child of the entered group). Its axis-aligned world bounds give left, center, right, top, middle and bottom. The layers being dragged, and their descendants, are excluded.
- **Moving features.** The dragged selection's axis-aligned world bounds give the features that snap:
  - a body move snaps the left, center and right x and the top, middle and bottom y;
  - resizes snap only the edges that the handle moves.
- **Tolerance:** 6 CSS pixels, converted with the current canvas zoom, so snapping feels the same at every zoom.
- **Per axis:** the closest feature-to-target pair within tolerance wins. Ties go to the earlier feature (min, then center, then max) and then to the earlier target.
- **Exactness:** the pointer is corrected along that axis so the feature lands exactly on the target. The correction is solved linearly, because moves and resizes are affine in the pointer. The snapped value is the exact double of the target; it is not rounded.
  - If snapping both axes at once cannot hold (a proportional corner whose multiplier comes from one axis), only the closer snap is kept.
  - A snap whose slope is zero, such as a fixed edge, is skipped.
- **Guides:** after the final position, every target that a feature lands on exactly (within 1e-6) draws a guide line across the whole composition, 1 CSS px wide, in the guide color. Guides exist only while a gesture is active. They are transient: no history, not saved.
- **Ctrl or Cmd** held on any pointer move disables snapping for that update. Keyboard nudges never snap.
- **Align** (Align ›: Left, Center, Right, Top, Middle, Bottom):
  - With 2 or more selectable roots, they align to the selection's combined world bounds, unless "Relative to canvas" is checked.
  - With 1 layer, it always aligns to the canvas.
  - Each layer moves by a world-space delta that is converted to its parent space, keeping rotation, scale and group structure.
  - One undo step ("Align layers"). Layers already in place create no command. If nothing changes, there is no history.
- **Distribute** (horizontal or vertical) needs 3 or more roots. The outermost two stay fixed; the others get equal gaps between bounds, in order of their current position. One undo step. It is disabled with fewer than three.
- **"Relative to canvas"** is a transient session toggle, unchecked by default, shown as a checkbox item in the Align submenu. It also applies to palette runs.
- **Locked layers:** as for any edit today, a refusal from the engine is shown as the usual error toast, and nothing changes.
- All 8 commands, plus the toggle, are registered commands (palette). They have no default shortcuts: the global shortcut matcher does not take Alt chords, and Ctrl chords are taken.

## 7. Steps

1. Brief, then contract revision 5 and D-066.
2. Pure snapping helpers: targets, features, linear solve and guides. Unit tests.
3. `TransformInteraction` snapping, guides in `RenderSource`, and guide drawing.
4. Align and distribute helpers, with unit tests. Commands, palette entries and the Align submenu.
5. Playwright tests.
6. Ledger, docs, report and verify. Push to PR #3.

## 8. Required tests

- **CV-013:**
  - Dragging a layer near the canvas center snaps its center exactly, and a vertical guide shows mid-drag.
  - Dragging near another layer's edge snaps edge to edge.
  - The same drag with Ctrl held lands off the line, with no guide.
  - A right-edge resize snaps to the safe margin.
  - The move is one undo step, and undo restores the exact start.
- **CV-025:**
  - Align left and align middle of 2 layers to the selection.
  - Align center of 1 layer to the canvas.
  - "Relative to canvas" moves 2 layers to the canvas edge.
  - Distribute horizontally 3 unequally spaced layers gives equal gaps.
  - Each is one undo step, and distribute is disabled for 2 layers.

## 9. Acceptance

- [ ] `npm run verify` exits 0
- [ ] CV-013 and CV-025 are Verified
- [ ] Report written, PR #3 updated, working tree clean

## 10. Stop rules

Stop if the work needs a schema bump, a new dependency, or any contract change beyond revision 5 as written.
