# Report: Wave 5 part C (W5-C): animation presets, fades, Ken Burns and the easing library (2026-09-24)

## 1. Summary

The toolbar's **Animate** button (greyed out since W2-E) is now live. It opens a panel of one-click presets:

- **In:** fade, slide (up, down, left or right), zoom, pop, wipe, typewriter.
- **Out:** the same six.
- **Loop:** pulse, float, spin, wiggle.
- **Pan & zoom:** Ken Burns, for images only.

Durations and loop speeds are adjustable. Presets belong to the clip, so a fade-out always ends with the clip even after a trim. They look the same in the exported video, and a clip with presets shows a badge on the timeline.

For keyframes, the Inspector now has an **easing library**: seven named curves (Smooth, Gentle, Snappy, Slow start, Slow end, Anticipate, Overshoot), each drawn as a curve with a dot that slides with that timing on hover. One click applies a curve.

This completes the animation part of Wave 5. Shapes (W5-D) are not started.

## 2. Scope and results

| ID      | Result   | Evidence                                                                                                                                                                                                                                                                                         |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ANI-007 | Verified | Two e2e tests plus an export test:<br>- `[ANI-007] one click fades a layer in; duration is adjustable; undo removes it` (canvas pixels, the clip badge, one undo per change)<br>- `[ANI-007] slide out, pulse loop and typewriter, and presets follow a trimmed clip`<br>- `[ANI-007] an exported frame with an animation preset matches the preview` (mean difference under 4 of 255; the frame is half-faded)<br>Unit tests cover all presets, proportional shrinking, command validation and centered scaling |
| ANI-008 | Verified | `[ANI-008] Ken Burns slowly zooms and pans an image clip`: offered only for images, and the image covers more of the canvas at the end than at the start. Unit test for the zoom and pan maths                                                                                                          |
| ANI-010 | Verified | `[ANI-010] the easing library previews named curves and applies one to the selected keyframes`: 7 drawn curves; Overshoot sets its cubic, and the half-way value overshoots the linear one                                                                                                               |

- In-scope P0 items Verified: 3 of 3.
- Not done: none.

## 3. Checks (real output tails)

- `npm run verify`: exit 0.
- Build: `dist/assets/index-*.js 358.00 kB │ gzip: 107.12 kB` (about +13 kB).
- Unit and jsdom: `Test Files 25 passed (25)`, `Tests 343 passed (343)` (3 new).
- E2E: `124 passed (4.2m)` = 123 normal passes (5 new) + 1 expected failure (the DEV-006 guard probe). Browser: Chromium 141.
- Ledger: `502 items | Verified 140 | Claimed 9 | Todo 353`, `Ledger OK`.

## 4. Try-it script (about 8 minutes, in Chrome)

| #   | Do this                                                                                                   | Expect                                                                                   | ID      | Claude ran it | Screenshot           |
| --- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------- | ------------- | -------------------- |
| 1   | Select the lavender label; click **Animate** in the floating toolbar                                       | A panel with In, Out and Loop tabs and preset cards                                      | ANI-007 | Y             | `animate-panel.png`  |
| 2   | In → **Fade**; set Duration to 1; press Play from 0                                                        | The label fades in over one second; a small badge appears on its clip                   | ANI-007 | Y             | —                    |
| 3   | Out → **Slide**, direction Up; play the last second                                                        | The label slides up and fades out at the end of its clip                                 | ANI-007 | Y             | —                    |
| 4   | Shorten the clip (Timing → Duration 5) and play near 5 s                                                   | The slide-out now happens at 5 s                                                        | ANI-007 | Y             | —                    |
| 5   | Loop → **Pulse**                                                                                           | The label gently grows and shrinks                                                       | ANI-007 | Y             | —                    |
| 6   | Select the headline; In → **Typewriter**, Duration 2; play from 0                                          | The text types out                                                                       | ANI-007 | Y             | —                    |
| 7   | Import a photo, add it, open Animate → **Pan & zoom** → Zoom in                                            | The photo slowly zooms and drifts across its clip                                        | ANI-008 | Y (placeholder image) | `ken-burns.png` |
| 8   | Animate a position with two keyframes; click the first diamond; in the Inspector hover the easing presets  | Each preset shows its curve; the dot runs with that timing                               | ANI-010 | Y             | `easing-library.png` |
| 9   | Click **Overshoot** and scrub                                                                              | The motion passes its target and settles                                                 | ANI-010 | Y             | —                    |
| 10  | Export 0–1 s with a fade in                                                                                | The file fades in exactly like the preview                                              | ANI-007 | Y (WebM here) | —                    |

## 5. Deviations from the brief

- **Slide Out direction.** An early version reused the In offset for Out, so "up" would leave downward. It was fixed so that Out leaves in the chosen direction, and a unit test locks this in.
- **"Adjustable duration"** is a range slider plus a number field. The change applies on release or Enter, as one undo step.

## 6. Decisions made

- D-071: presets are clip settings (`clip.metadata.animation`, the new `SET_CLIP_ANIMATION` command); the LCR rewording CV-036 to CV-038.
- D-072: presets are applied only when drawing; editing and handles use the resting geometry; Wipe is a drawn reveal, not a mask.

## 7. Not tested, known gaps, risks

- **Handles during a preset.** Selection handles show the resting position while a preset moves the layer, which is deliberate (D-072). Clicking the moving picture during a slide may therefore miss it.
- **Typewriter** reveals characters without per-character motion (that is ANI-012). Wipe is left-to-right only.
- **Group children** have no clip, so presets apply to top-level layers only; clicking Animate on a child does nothing (the button is not greyed out yet; noted in the backlog).
- **Presets are not keyframes,** so they cannot be edited point by point.
- **Not tested:**
  - Ken Burns on a real photo (the sandbox test uses the fixture's image placeholder; the maths is shared);
  - many presets on long projects (performance);
  - RTL layout of the panel;
  - MP4 export with presets (the CI `export-mp4` job runs the new export test on this PR).

## 8. Architecture and contract impact

- **Schema:** unchanged (5). **Dependencies:** none.
- **Contracts:** unchanged. The presets produce ordinary transform values, with the contract's center compensation.
- **New files:**
  - `src/core/clip-animation.ts` and `src/render/presets.ts`;
  - `src/ui/animate-panel.ts` and `src/ui/easing-library.ts`;
  - `tests/presets.test.ts` and `e2e/presets.spec.ts`;
  - two new tests in `e2e/export.spec.ts`.
- **Changed:**
  - A new `SET_CLIP_ANIMATION` command.
  - `RenderSource.animate`: set by the preview renderer, the PNG frame and the export worker, never by picking.
  - A `reveal` render item for Wipe.
  - Selection bounds always use resting geometry.
  - The toolbar's Animate control is live.
  - The timeline shows an animation badge.

## 9. Ledger and backlog

- **LCR:** CV-036, CV-037 and CV-038 reworded (Animate is live).
- **Status changes:** ANI-007, ANI-008 and ANI-010 Todo → Verified.

## 10. Git

- Branch `claude/wave-5-presets`, PR #6, stacked on PR #5 (`claude/wave-5-animation`). Tag `w5-c` at merge.

## Owner tick-list

| ID      | OK / BUG / MISSING / CHANGE | One sentence |
| ------- | --------------------------- | ------------ |
| ANI-007 |                             |              |
| ANI-008 |                             |              |
| ANI-010 |                             |              |
