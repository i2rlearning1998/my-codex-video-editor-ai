# Brief W5-D: shapes: presets, fill, stroke, corners and boolean operations

Wave: 5 (part D), the last part of the W2-F series. Base: PR #11 head (W2-F5). End tag: `w5-d` (created at merge). Branch: `claude/wave-5d-shapes` (stacked on PR #11).
Authority: `AGENTS.md`, then this brief, then `docs/FEATURES.md`. Reference: `docs/specs/CANVA-PARITY-SPEC.md` section 9 (items 3 and 7).

## 1. Goal

Real shape editing:

- shape tools (rectangle, rounded rectangle, ellipse, line and arrow);
- fill with opacity or none;
- stroke color, width, dash, caps and joins;
- corner radius on rectangles;
- boolean operations (Union, Subtract, Intersect, Exclude) on two or more shapes.

This makes the shape toolbar's greyed-out controls live.

## 2. In scope

- SHP-001, SHP-003, SHP-005, SHP-006 and SHP-015 (the freehand pen part is already built as the Draw tool, SHP-018 and SHP-019).
- CV-038 (reworded).

## 3. Out of scope

- SHP-002 (more shapes), SHP-004 (gradients), SHP-007 (shadow and blur), SHP-008 (SVG import).
- SHP-009 (the full Elements library: emoji, stickers and icons).
- Editing the points of a combined shape.
- Connectors between shapes.

## 4. Ledger Change Requests

CV-038 is reworded to the live shape controls.

## 5. Contracts, schema and dependencies

- No contract change. Resizing a shape scales it, as before.
- Schema stays 5: shape settings are new keys in the property record (D-033 pattern).
- **New runtime dependency, owner-approved:** `polygon-clipping` 0.15.7.
  - License: MIT.
  - Size: 350 kB unpacked, with two small dependencies.
  - Use: boolean operations only.
  - Alternatives considered: `martinez-polygon-clipping` is older and less robust; `clipper-lib` works only on integers; hand-written code is too risky.

## 6. Design notes

- `render/shapes.ts` holds the style model, a defensive reader, drawing, and world-space outlines.
- `ui/shapes.ts` holds the presets, the add command, the style commands, the boolean commands and the Elements panel.
- The shape toolbar adds Fill opacity, No fill, Stroke, Width, Stroke style (a second row) and Corners.
- The canvas menu gets Combine shapes and the palette gets the four operations, both through a new `closed-shape` capability.

## 7. Required tests

- e2e `[SHP-001]`: each preset is added and drawn, with a clip at the playhead.
- e2e `[SHP-003][SHP-006]`: fill opacity, no fill and radius, measured by pixels; out-of-range values are refused.
- e2e `[SHP-005]`: the stroke position, gaps in a dashed stroke, and the difference between flat and round caps.
- e2e `[SHP-015]`: the four operations are checked by pixels, each is one undo step, the result survives a reload, and lines are not offered.
- Unit tests: the defaults, polygon parsing, command validation, the union bounds and undo, and refusal of an empty intersection.

## 8. Acceptance

SHP-001, 003, 005, 006 and 015 Verified; CV-038 Verified (reworded); `npm run verify` green.

## 9. Stop rules

As `AGENTS.md` section 10.
