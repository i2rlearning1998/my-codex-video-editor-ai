# Report: H-series, H1 to H6 (2026-09-30)

Branch `claude/h-series`, draft PR to `main`. This report is written part by part; the summary, checks and git sections are completed at the end of the series.

## 1. Summary

- **Bugs (H1).** The drag-select box is now painted. Rotated objects resize smoothly from their handles. Audio stays off the canvas. The wheel and panning can no longer lose the artboard. Side panels open and close from their rail category.
- (H2 to H6 are added as they are finished.)

## 2. Scope and results

| Part | Ledger IDs | Result | Evidence |
| ---- | ---------- | ------ | -------- |
| H1 | CV-003, CV-046 (strengthened), CV-049, CV-050, AUD-018, LAY-031, VID-006 (strengthened), CV-018 (updated) | Verified | `e2e/h1-marquee.spec.ts`, `e2e/h1-rotated.spec.ts`, `e2e/h1-audio.spec.ts`, `e2e/h1-wheel.spec.ts`, `e2e/h1-panels.spec.ts` |

## 3. Checks

(Completed at the end of the series.)

## 5. Deviations from the brief

- **H1.2 snapping.** Resizing a rotated object no longer snaps to guides (moves still snap). Snapping lined up the rotated object's axis-aligned bounds with a guide, and that pulled the corner off the pointer. Canva behaves the same way (D-115).

## 6. Decisions made

D-114 to D-118 in `docs/DECISIONS.md`.

## 7. Not tested, known gaps, risks

- Each part below lists its own known gaps.

## 8. Architecture and contract impact

- **Schema:** unchanged (5).
- **New dependencies:** none.
- **Contracts:** `TRANSFORM_INTERACTION_CONTRACT.md` revision 8 (pre-authorised).

## 9. Ledger and backlog

- **Rows added (LCR):** CV-049, CV-050, LAY-031, AUD-018.

## 10. Git

(Completed at the end of the series.)

## Part H1: bugs

Every fix below has a Playwright test in the sandbox Chromium that fails on the old code (checked by running it before the fix, or with the fix stashed).

### What changed

- **Drag-select box (CV-003, CV-046, D-114).**
  - Root cause: the box element was created, sized and moved, but it had no styles at all, so nothing was painted. The live outlines on the layers were already drawn, which made it look half-working.
  - The box is now a translucent accent rectangle with a 1 px border. It works from inside the artboard and from the dark stage, with or without a selection, at Fit and 100%, and at device pixel ratio 1, 1.25 and 1.5.
  - It touches a layer by its real, possibly rotated outline, not by its axis-aligned bounds. Before, a rotated group was selected when the box only reached its empty corner.
  - Shift adds, and a group counts as one.
- **Rotated objects (CV-049, D-115, contract revision 8).**
  - The resize maths was already exact. Two faults made it feel wrong:
    - resize snapping pulled the dragged corner up to 2 px away from the pointer at the first step (the template's Front card, 4 degrees in the world);
    - the floating action cluster could sit on top of a corner handle, so a press there hit the cluster instead.
  - Now rotated objects resize without snapping (moves still snap), and the cluster keeps clear of the box and every handle.
  - A chip beside the pointer shows W × H while resizing and the angle while rotating. Resize cursors turn with the object.
  - Proof: shapes, text, groups, pictures, nested groups and flipped shapes at 0, 4, 30, 45, 90, 135 and 200 degrees. Each drag is sampled over ten pointer steps. The opposite corner drifts less than 0.5 px, the size grows at every step, the corners stay square, the dragged corner stays on the pointer, and the Inspector's W and H equal the drawn box.
- **Audio (AUD-018, D-116).** Audio layers are no longer drawn as a box on the canvas, picked by a click or a marquee, or given a selection box. They stay on their audio tracks, in the Scene list and in the side panel. After Detach audio, the video clip's own sound is not played again, during playback or while scrubbing (this was already true for playback and is now proven for scrubbing too).
- **Wheel and pan (CV-050, D-117).**
  - Ctrl+wheel (and a pinch) zooms toward the pointer.
  - When the whole artboard fits, the wheel, Space-drag, the middle button and the hand tool never move it.
  - Zoomed in, they pan, but the artboard can never leave the view: at most 48 px of stage shows past its edge.
  - Below Fit the artboard stays centred. The smallest zoom is 10%.
- **Side panels (LAY-031, D-118).**
  - Clicking a rail category opens its panel, clicking the highlighted category again collapses it, and clicking another swaps the content.
  - The top-bar panel buttons show and change the same state; a collapsed panel now reopens from its category (the reported bug).
  - The right side works the same way.

### Try it (H1)

| # | Do this | Expect | ID |
| --- | --- | --- | --- |
| 1 | Drag from the grey area left of the page across the badge | A light purple box with a thin border follows the pointer; the badge and its text get an outline; releasing selects them | CV-046 |
| 2 | Select the headline, then drag from an empty part of the page over the edition number | The box shows again; only the edition number is selected afterwards | CV-003 |
| 3 | Scene list: select "Front card"; drag its bottom-right corner slowly | The opposite corner stays where it was, the card grows smoothly under the pointer, and a chip shows its size | CV-049 |
| 4 | Drag the round handle under the card | A chip shows the angle while you turn it | CV-049 |
| 5 | Type 135 in Rotation, then drag a side handle of a rectangle | Only that side moves; the other side stays put | CV-049 |
| 6 | Import a sound and drop it on the canvas | It appears on an audio track, not as a box on the page | AUD-018 |
| 7 | Scroll the mouse wheel over the page at Fit | Nothing moves | CV-050 |
| 8 | Ctrl+scroll up over the headline, then scroll down a lot | It zooms toward the pointer; scrolling stops with a small grey margin under the page | CV-050 |
| 9 | Click the highlighted rail category (Scene) | The left panel closes; click it again and it opens | LAY-031 |
| 10 | Close the left panel with the top-bar button, then click Media in the rail | The panel opens on Media | LAY-031 |

### Known gaps (H1)

- Rotated objects no longer snap while being resized (they still snap while being moved).
- The pinch gesture is proven through Ctrl+wheel (that is how Chromium reports it); no real trackpad was used.
