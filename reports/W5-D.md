# Report: Wave 5 part D (W5-D): shapes (2026-09-26)

## 1. Summary

- **Adding shapes:** the **Elements** category adds a rectangle, rounded rectangle, ellipse, line or arrow, centered on the canvas at the playhead.
- **The shape toolbar is now live:**
  - **Fill**, **Fill opacity** and **No fill**;
  - **Stroke** color and **Width**;
  - **Stroke style**: dashed or dotted, with flat, round or square caps and sharp, round or bevel joins;
  - **Corners** (rounded rectangles).
- **Combining shapes:** select two or more rectangles or ellipses, right-click and choose **Combine shapes**, then Union, Subtract, Intersect or Exclude. The shapes become one shape in one undo step, and Undo brings them back.
- **Still not possible:**
  - gradients, shadows and more shape kinds (triangles, stars);
  - editing the points of a combined shape;
  - emoji, stickers and icons in Elements.

## 2. Scope and results

| ID      | Result   | Evidence |
| ------- | -------- | -------- |
| SHP-001 | Verified | e2e `[SHP-001] the Elements panel adds a rectangle, rounded rectangle, ellipse, line and arrow at the playhead` (pixels: filled box, empty rounded and ellipse corners, a line through the middle, an arrowhead wider than the shaft; the clip starts at the playhead) |
| SHP-003 | Verified | e2e `[SHP-003][SHP-006] fill opacity, no fill and corner radius…` (50% blends, and No fill shows what is underneath) |
| SHP-005 | Verified | e2e `[SHP-005] stroke color, width, dash, caps and joins` (the stroke sits inside the box edge, a dashed stroke leaves gaps, and a round cap reaches past a line's end where a flat cap does not) |
| SHP-006 | Verified | e2e `[SHP-003][SHP-006] …` (radius 60 clears the corner; negative values are refused; ellipses have no radius) |
| SHP-015 | Verified | e2e `[SHP-015] two overlapping shapes combine by union, subtract, intersect and exclude, one undo step each` (the four results are checked by pixels, the result survives a reload, and lines are not offered). The ledger line's "freehand pen" is the W2-E Draw tool (SHP-018, SHP-019) |
| CV-038  | Verified | `[CV-035][CV-037][CV-038] …` updated: Stroke is live, and Boolean says how to combine |

- In-scope P0 items Verified: 4 of 4 (SHP-001, 003, 005, 006). P2: SHP-015 Verified.

## 3. Checks (real output tails)

- `npm run verify`: `EXIT 0`.
- Format and typecheck: passed.
- Build: `dist/assets/index-*.js 429.48 kB │ gzip: 129.40 kB`, about +41 kB (+13 kB gzip), mostly `polygon-clipping`.
- Unit and jsdom: `Test Files 28 passed (28)`, `Tests 358 passed (358)` (4 new).
- E2E: `144 passed (4.5m)` = 143 normal passes (4 new) + 1 expected failure (the DEV-006 guard probe). Browser: Chromium 141 (D-030).
- Ledger: `506 items | Verified 155 | Claimed 10 | Todo 341`, `Ledger OK`.

## 4. Try-it script (about 6 minutes, in Chrome)

| #   | Do this | Expect | ID | Claude ran it | Screenshot |
| --- | ------- | ------ | -- | ------------- | ---------- |
| 1   | Click **Elements** in the left rail, then each shape in turn (Ctrl+Z between them) | Each appears in the middle of the canvas, with a clip on the timeline | SHP-001 | Y | `arrow.png` |
| 2   | Add a Rectangle; set Fill opacity to 50 | It becomes see-through | SHP-003 | Y | — |
| 3   | Click **No fill** | Only the outline area remains (nothing, if there is no stroke) | SHP-003 | Y | — |
| 4   | Undo twice; set Corners to 60 | The corners round off | SHP-006 | Y | — |
| 5   | Pick a green Stroke; set Width to 12 | A green border inside the edge | SHP-005 | Y | `dashed.png` |
| 6   | Click **Stroke style**; Dash → Dashed | The border becomes dashed | SHP-005 | Y | `dashed.png` |
| 7   | Add a Line, Width 20; Caps → Flat, then Round | The round cap sticks out past the end | SHP-005 | Y | — |
| 8   | Add an Ellipse over the Rectangle; select both in the Scene list; right-click the canvas → Combine shapes → Subtract | The rectangle with a round hole | SHP-015 | Y | `subtract.png` |
| 9   | Ctrl+Z; repeat with Union, Intersect and Exclude | One merged shape, the lens, or the ring | SHP-015 | Y | — |

## 5. Deviations from the brief

None.

## 6. Decisions made

- **D-081:**
  - the dependency;
  - the property keys and the defensive reader (existing shapes draw exactly as before);
  - the stroke inside the box;
  - the Elements presets;
  - boolean operations in world space, taking the bottom-most shape's style, place, track and timing;
  - the `closed-shape` capability.

## 7. Not tested, known gaps, risks

- **Bundle size:** `polygon-clipping` loads with the app (+13 kB gzip). It could be loaded lazily later.
- **Combining is limited.** It works only on top-level shapes with clips: shapes inside groups cannot be combined yet. Animation presets and keyframes on the combined shapes are not carried over; the result is static.
- **Boolean results are approximated.** Curves become polygons: an ellipse has 64 segments and each rounded corner 8. A combined shape's dashes follow its polygon edges.
- **Style changes are not keyframed.** The toolbar's shape controls set plain values, even on a shape whose other properties are animated.
- **Copy style** carries only color and opacity to shapes (backlog candidate).
- **Not tested:**
  - combining rotated or scaled shapes in e2e (the unit maths uses world matrices);
  - exporting a combined shape (it shares the drawing code with the preview);
  - very large polygons, near the 20,000-point limit.

## 8. Architecture and contract impact

- Schema: unchanged (5), with new property keys on shape layers. Contracts: none touched.
- **New dependency:**
  - `polygon-clipping` 0.15.7: MIT, 350 kB unpacked;
  - with `splaytree` (MIT) and `robust-predicates` (Unlicense).
  - Reason: boolean operations.
  - Alternatives considered: `martinez-polygon-clipping`, `clipper-lib` (integer-only), and a hand-written clipper.
- **Added:** `src/render/shapes.ts`, `src/ui/shapes.ts`, `e2e/shapes.spec.ts`, `tests/shapes.test.ts`.
- **Changed:**
  - the render adapter and canvas (shape items);
  - the context toolbar;
  - the canvas menu and the registry (Combine);
  - `selection-context.ts` (the `closed-shape` capability);
  - the shell (the Elements panel);
  - the icons, the CSS, and the en and hi strings;
  - `tests/commands.test.ts` (setup for the combine commands).

## 9. Ledger and backlog

- Status changes: SHP-001, SHP-003, SHP-005, SHP-006 and SHP-015 Todo → Verified; CV-038 stays Verified (reworded).
- Ledger Change Requests applied: CV-038 reworded.
- Backlog: none new.

## 10. Git

- Branch `claude/wave-5d-shapes`, stacked on PR #11. Tag `w5-d` at merge.

## Owner tick-list

| ID      | OK / BUG / MISSING / CHANGE | One sentence |
| ------- | --------------------------- | ------------ |
| SHP-001 |                             |              |
| SHP-003 |                             |              |
| SHP-005 |                             |              |
| SHP-006 |                             |              |
| SHP-015 |                             |              |
| CV-038  |                             |              |
