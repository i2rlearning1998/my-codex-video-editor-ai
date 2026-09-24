# Report: Wave 2 part D (W2-D): smart guides, snapping, align and distribute (2026-09-24)

## 1. Summary

When you drag or resize a layer on the canvas, it now snaps to:

- the canvas edges and center;
- the 5% safe margins;
- the edges and centers of other layers on screen.

A pink guide line shows each match, and holding Ctrl places the layer freely. In the right-click menu, **Align ›** has Align (left, center, right, top, middle, bottom) and Distribute (horizontal, vertical); both are also in the command palette. They work relative to the selection or, with the toggle, to the canvas.

Each drag, align or distribute is one undo step. You authorized interaction contract revision 5, which allows this snapping.

Not done here: rulers and grid (CV-014), safe-area overlays (CV-015), rotation snapping (CV-010), and the context toolbar (W2-E, next).

## 2. Scope and results

| ID     | Result   | Evidence                                                                                                                                                                                                                                                                           |
| ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CV-013 | Verified | Three e2e tests:<br>- `[CV-013] dragging near the canvas center snaps exactly and shows a guide; Ctrl places freely`<br>- `[CV-013] a layer snaps edge to edge with another layer`<br>- `[CV-013] a right-edge resize snaps to the safe margin`<br>Unit tests are in `tests/snapping.test.ts`. |
| CV-025 | Verified | Two e2e tests:<br>- `[CV-025] align two layers to their selection, and one layer to the canvas`<br>- `[CV-025] relative to canvas, distribute with equal gaps, and distribute needs three layers`<br>Plus a unit test.                                                                  |

- In-scope P0 items Verified: 2 of 2.
- Not done, with reason: none.

## 3. Checks (real output tails)

- `npm run verify`: exit 0.
- Build: `dist/assets/index-*.js 290.13 kB │ gzip: 86.35 kB` (about +6 kB).
- Unit and jsdom tests: `Test Files 21 passed (21)`, `Tests 323 passed (323)`. That is 4 new snapping and align tests, plus updates to the KEY-001 and hook tests.
- E2E: `101 passed (2.5m)` = 100 normal passes (5 new) + 1 expected failure (the DEV-006 guard probe).
  - The new spec was also run with each test repeated 3 times: `15 passed`.
  - Browser: Chromium 141 (sandbox fallback, D-030).
- Hook: `assert-no-test-hook: OK`. Ledger: `Verified 112 | Claimed 11 | Todo 372`, `Ledger OK`.
- CI: runs on push to PR #3.

**PB-010 in this sandbox.** In 4 of my 6 full e2e runs on this branch, the audio/video sync test `[PB-010]` measured a worst gap of 37–49 ms, above its one-frame limit of 33 ms.

- In the other 2 full runs, it passed, including the final `npm run verify`.
- The same test passed 35 of 35 times when its spec file was run alone, and 6 of 6 times together with every spec that runs before it.
- The base commit passed 2 of 2 full runs.
- During the test, the browser's renderer process sits at about 95% CPU in this 4-core sandbox.

I did not find a root cause. W2-D adds no work to playback: the renderer only checks an empty guide list each frame. I did not loosen the test.

Once in the same period, a VID-001 frame check also failed during a full run.

**MED-003 race fixed.** One full run showed a real race in the `[MED-003]` test. A background thumbnail for an earlier card was written between the test's two storage snapshots. The test now compares only `media/` byte keys, which is what "no bytes stored" means; thumbnails and waveforms are background caches (D-059). This is test-only.

## 4. Try-it script (about 5 minutes, in Chrome)

| #   | Do this                                                                                          | Expect                                                                                  | ID     | Claude ran it          | Screenshot (e2e output) |
| --- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------ | ---------------------- | ------------------------ |
| 1   | Drag any layer slowly across the middle of the canvas                                            | It clicks onto the center, and a pink vertical line shows while it is there             | CV-013 | Y (e2e)                | `center-guide.png`       |
| 2   | Drag the same layer again while holding Ctrl                                                     | No snapping, no line                                                                    | CV-013 | Y (e2e)                | —                        |
| 3   | Drag a layer's edge next to another layer's edge                                                 | The edges meet exactly, with a pink line                                                | CV-013 | Y (e2e)                | `edge-guide.png`         |
| 4   | Drag a layer's right-edge handle toward the right side                                           | It stops at the safe margin (a little inside the edge), then at the edge               | CV-013 | Y (e2e, margin)        | —                        |
| 5   | Select two layers (Ctrl+click in Scene), right-click one → **Align ›** → **Align left**          | Both left edges line up; one Undo reverts it                                            | CV-025 | Y (e2e)                | `align-menu.png`         |
| 6   | Select one layer → **Align ›** → **Align center**                                                | It centers horizontally on the canvas                                                   | CV-025 | Y (e2e)                | —                        |
| 7   | Select three layers → **Align ›** → **Distribute horizontally**                                  | The outer two stay; the middle one gets equal gaps                                      | CV-025 | Y (e2e)                | —                        |
| 8   | **Align ›** → tick **Relative to canvas**, then **Align right**                                  | All selected layers move to the canvas's right edge                                     | CV-025 | Y (e2e)                | —                        |

Screenshots are written by the e2e run under `test-results/` (not committed).

## 5. Deviations from the brief

None.

## 6. Decisions made

- D-066: interaction contract revision 5 (snapping, and the draw mode for W2-E).
- D-067: align and distribute semantics and the transient "Relative to canvas" toggle.

## 7. Not tested, known gaps, risks

- **Snapping targets:**
  - Guides use axis-aligned bounds. A rotated layer snaps by its bounding box, not its rotated edges.
  - Layers hidden at the playhead are not targets.
  - There is no equal-spacing snapping (Canva's distance guides).
- **Rotation:** a rotated or proportional-corner resize can match only one axis exactly at a time, by design.
- **PB-010:** intermittent in full sandbox runs (section 3). If CI shows it too, I will investigate further before anything else.
- **Not tested:** touch or pen input, 100-layer snapping performance (CV-032), and snapping inside an entered group, beyond its unit-level target rules.
- **Keyboard:** Align has no keyboard shortcuts (D-067).

## 8. Architecture and contract impact

- Schema: unchanged (4). New dependencies: none.
- `TRANSFORM_INTERACTION_CONTRACT.md` revision 5 (owner-authorized, additive). `TRANSFORM_CONTRACT.md` gets a pointer note only.
- New files:
  - `src/ui/snapping.ts`: targets, features and the linear pointer correction.
  - `src/ui/align.ts`.
  - `tests/snapping.test.ts`.
  - `e2e/guides-align.spec.ts`.
- Changed:
  - `TransformInteraction.update` takes an optional snap tolerance and exposes the transient `guides`.
  - `RenderSource.guides` is drawn by the canvas renderer.
  - The session gains `alignToCanvas`.
  - The test hook gains a read-only `getCanvas()` snapshot.
  - The registry gains 9 commands.

## 9. Ledger and backlog

- Status changes: CV-013 and CV-025 Todo → Verified.
- LCRs: none.
- Backlog: none added in W2-D.

## 10. Git

- Branch `claude/wave-2-timeline-clips-mwy1f3` (PR #3). Tag `w2-d` at merge.

## Owner tick-list

| ID     | OK / BUG / MISSING / CHANGE | One sentence |
| ------ | --------------------------- | ------------ |
| CV-013 |                             |              |
| CV-025 |                             |              |
