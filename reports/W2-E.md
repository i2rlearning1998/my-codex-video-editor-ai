# Report: Wave 2 part E (W2-E): context toolbar, Draw tool and Copy style (2026-09-24)

## 1. Summary

This builds the "Context toolbar" gap from the master UX spec (section 4.1), plus freehand drawing and Copy style:

- **Context toolbar.** Selecting a text, image, video, shape or drawing shows a toolbar floating over the top of the canvas.
  - The controls that work edit the layer, one undo step each: Position, Scale, Rotate, Flip, Opacity, text Size and Color, shape Fill, and a drawing's Color and Brush size.
  - The controls not built yet (Crop, Blend, Animate, Replace, Font, Weight, Align, Spacing, Effects, Stroke, Width, Corners, Boolean) are greyed out. Their tooltip says which wave builds them, as you asked.
- **Draw.** A new **Draw** category in the left rail offers Pen, Marker and Highlighter, with size, color and opacity. Dragging on the canvas draws, and each stroke becomes its own layer and clip. It can be selected, moved, resized, restyled, saved, and exported like any layer. Esc, V or **Stop drawing** leaves draw mode.
- **Copy style and Paste style** are in the right-click menu and the palette.
- **Add link** was dropped, as you decided, and is in the backlog.

## 2. Scope and results

| ID      | Result   | Evidence (e2e unless noted)                                                                                                        |
| ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| CV-035  | Verified | `[CV-035][CV-037][CV-038] the toolbar follows the selection…`: shown for text and shape; hidden for none, a group and multi-selection; the canvas does not move |
| CV-036  | Verified | `[CV-036] image and video toolbar…`: X, Scale, Opacity and Rotate, then undo; Flip keeps the visual center; Crop and Replace disabled with their wave |
| CV-037  | Verified | Same test as CV-035: text Size 60 and Color, each one undo step; Font disabled "planned for Wave 3 (TXT-006)"                            |
| CV-038  | Verified | Shape Fill, and Stroke disabled "Wave 5 (SHP-005)". A drawing's Color and Brush size: `[SHP-019][CV-038] a highlighter stroke…`. Unit: brush size keeps points in place |
| CV-039  | Verified | `[CV-039] Copy style from text and Paste style onto a shape and a text in one undo step`. Unit: only compatible properties apply            |
| SHP-018 | Verified | `[SHP-018][SHP-019] the Marker draws a stroke…`: brush choice, color and pixels on the canvas; clicks draw and do not select; Esc leaves, then a click selects |
| SHP-019 | Verified | One layer and clip at the playhead, one undo; the highlighter is 40% opaque; move; toolbar edits; survives a save and reload. Unit: renderer path and dot rejection |

- In-scope P0 items Verified: 7 of 7.
- Not done: none.

## 3. Checks (real output tails)

- `npm run verify`: exit 0.
- Build: `dist/assets/index-*.js 309.70 kB │ gzip: 92.52 kB` (about +20 kB).
- Unit and jsdom tests: `Test Files 22 passed (22)`, `Tests 327 passed (327)`. That is 4 new drawing and style tests, plus the updated rail and KEY-001 tests.
- E2E: `106 passed (3.1m)` = 105 normal passes (5 new) + 1 expected failure (the DEV-006 guard probe). Browser: Chromium 141 (sandbox fallback).
  - The new spec also ran twice more: `10 passed`.
- Ledger: `502 items | Verified 119 | Claimed 11 | Todo 372`, `Ledger OK`.
- **Also fixed in this session: PR #3 CI (commit `13d75e7`).** CI failed PB-011 and TL-047 because a test helper read the timeline ruler's box while the timeline was replacing it (`boundingBox()` returned null).
  - A shared `rulerBox()` helper now waits for the attached ruler.
  - This is test-only; 13 call sites were changed.

## 4. Try-it script (about 8 minutes, in Chrome)

| #   | Do this                                                                                        | Expect                                                                                     | ID              | Claude ran it | Screenshot           |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------- | ------------- | -------------------- |
| 1   | Click the big headline in the example                                                          | A toolbar floats above the canvas: Font (grey), Size, Weight (grey), Color, …              | CV-035, CV-037  | Y             | `text-toolbar.png`   |
| 2   | Hover **Font**                                                                                 | "Not built yet: planned for Wave 3 (TXT-006)"                                              | CV-037          | Y             | —                    |
| 3   | Type 60 in Size, press Enter; pick a new Color                                                 | The headline shrinks and recolours; each is one Undo                                       | CV-037          | Y             | —                    |
| 4   | Click the lavender label; change Fill                                                          | The label recolours; Stroke, Width, Corners and Boolean are grey                           | CV-038          | Y             | `shape-toolbar.png`  |
| 5   | Open a project with a video; select it; use Flip horizontal, Scale, Opacity                    | It mirrors in place, scales and fades; Crop, Blend, Animate and Replace are grey            | CV-036          | Y (fixture)   | `media-toolbar.png`  |
| 6   | Left rail → **Draw** → **Marker**, pick a color, drag on the canvas                            | A stroke in that color; a "Drawing 1" clip appears at the playhead                        | SHP-018, SHP-019| Y             | `marker-stroke.png`  |
| 7   | Press Esc, click the stroke, drag it                                                           | It is selected with handles, and moves                                                     | SHP-019         | Y             | —                    |
| 8   | With the stroke selected, change Brush size and Color in the toolbar                           | It gets thicker and recolours in place                                                     | CV-038          | Y             | —                    |
| 9   | **Draw** → **Highlighter**, drag across text                                                   | A translucent broad stroke                                                                 | SHP-019         | Y             | —                    |
| 10  | Right-click the headline → **Copy style**; select the label and subtitle → right-click → **Paste style** | Both take the headline color; the subtitle also takes its size; one Undo reverts  | CV-039          | Y             | `style-menu.png`     |
| 11  | Save (Ctrl+S) and reload                                                                       | The drawings are still there                                                               | SHP-019         | Y             | —                    |

Screenshots are written by the e2e run under `test-results/` (not committed).

## 5. Deviations from the brief

- **The toolbar floats over the top of the canvas stage instead of taking a row above it.** The first version was a row. Selecting a layer by clicking it then pushed the canvas down about 31 px between pointer-down and pointer-up, which turned the click into a "Move layer". The e2e test caught this.
  - The spec calls the toolbar "floating/fixed". A floating toolbar never moves the canvas.
  - A regression check asserts that the canvas box is unchanged and that a selecting click adds no history.

## 6. Decisions made

- D-068: the LCR adding CV-035 to CV-039, SHP-018 and SHP-019; greyed-out unbuilt controls; drawings as `shape` layers with path properties under schema 4; Add link dropped for now.

## 7. Not tested, known gaps, risks

- **Toolbar:** not shown for groups, multi-selections, audio layers or no selection (backlog).
- **Scale:** the toolbar's Scale scales from the top-left corner, like the Inspector's scale fields. Only Flip keeps the center.
- **Drawings:**
  - no eraser, point editing or pressure;
  - resizing a drawing scales its brush too;
  - long strokes are capped at 5,000 points.
- **Style:** Paste style skips groups' colors (groups have none) but applies opacity to them.
- **PB-010:** the sandbox issue from W2-D persists. It is intermittent in full sandbox runs, and passes on CI.
- **Not tested:** touch or pen input, RTL layout of the toolbar, and the drawing inside an export. The export shares the same renderer path; it is on PR #4, and the next merge into PR #4 will carry it.

## 8. Architecture and contract impact

- Schema: unchanged (4). New dependencies: none. Contracts: none; draw mode follows revision 5 (D-066).
- New files:
  - `src/render/drawing.ts`: path parse and format, and the brush defaults.
  - `src/ui/draw-tool.ts`, `src/ui/draw-panel.ts`, `src/ui/context-toolbar.ts` and `src/ui/style-clipboard.ts`.
  - `tests/drawing.test.ts` and `e2e/toolbar-draw.spec.ts`.
- Changed:
  - The render adapter adds a `path` item kind and the live `drawing` preview.
  - The canvas strokes drawings.
  - The session gains the brush and draw style.
  - The canvas interaction gains draw mode.
  - The registry gains Copy style and Paste style.
  - The shell gains the Draw rail category and the floating toolbar.

## 9. Ledger and backlog

- **LCR applied:** CV-035 to CV-039, SHP-018 and SHP-019 added.
- **Status changes:** all 7 Todo → Verified.
- **Backlog:** 2 lines:
  - Add link;
  - toolbar rows for group, multi-selection, audio and none.

## 10. Git

- Branch `claude/wave-2-timeline-clips-mwy1f3` (PR #3). Tag `w2-e` at merge. PR #4 is brought up to date by a merge.

## Owner tick-list

| ID              | OK / BUG / MISSING / CHANGE | One sentence |
| --------------- | --------------------------- | ------------ |
| CV-035 / CV-036 |                             |              |
| CV-037 / CV-038 |                             |              |
| CV-039          |                             |              |
| SHP-018         |                             |              |
| SHP-019         |                             |              |
