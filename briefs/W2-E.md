# Brief W2-E: context toolbar, Draw tool and Copy style

Wave: 2 (continuation), after W2-D. Base: PR #3 head `67024fd` (W2-D). End tag: `w2-e` (created at merge). Branch: `claude/wave-2-timeline-clips-mwy1f3` (PR #3).
Authority: `AGENTS.md`, then this brief, then `docs/FEATURES.md`.

## 1. Goal

This closes a gap from the master UX spec (section 4.1, "Context toolbar") that was never built. Three things are added:

1. **Context toolbar.** Selecting an object shows a toolbar above the canvas, with the controls for that type of object. Controls whose systems do not exist yet are shown greyed out, with a tooltip naming the wave that builds them.
2. **Draw tool.** A new **Draw** category in the left rail draws freehand pen, marker and highlighter strokes on the canvas, with brush size, color and opacity.
3. **Copy style.** The right-click menu gains **Copy style** and **Paste style**, which move visual properties from one object to others.

## 2. In scope (ledger IDs, added by the LCR in section 4)

- Context toolbar: CV-035, CV-036, CV-037 and CV-038.
- Draw tool: SHP-018 and SHP-019.
- Copy style: CV-039.

## 3. Out of scope

- **Building any system behind a greyed-out control:**
  - Crop (VID-003) and Replace (VID-009).
  - Blend (MSK-001) and Animate (ANI-001).
  - Font (TXT-006), Weight (TXT-010), text Align (TXT-014), Spacing (TXT-016) and text Effects (TXT-019).
  - Stroke and Width (SHP-005), Corners (SHP-006) and Boolean (SHP-015).
- **Add link:** the owner dropped it for now, and it goes to the backlog. MP4 cannot hold links.
- **Other selections:** toolbars for groups, multi-selections and audio (spec rows "Group/Multiple" and "Audio"), and the "None" row (Select, Pan, Zoom, Grid).
- **Drawing extras:** an eraser, editing stroke points, pressure sensitivity (CV-034 covers pen input) and smoothing beyond simple point thinning.
- **Keyboard:** shortcuts for Copy style and Paste style. The global shortcut matcher takes no Alt chords (D-067).

## 4. Ledger Change Requests to apply first

Add these rows (P0, W2, Todo), with no renumbering:

- **CV section:**
  - CV-035: A context toolbar above the canvas appears for one selected text, image, video, shape or drawing layer, with controls for that type; it hides for no selection, groups, audio layers and multi-selections.
  - CV-036: Image and video toolbar: Position X and Y, Scale, Rotate, Flip horizontal and vertical, and Opacity edit the layer as one undo step each; Crop, Blend, Animate and Replace show disabled with a tooltip naming the wave that builds them.
  - CV-037: Text toolbar: Size and Color edit the layer as one undo step each; Font, Weight, Align, Spacing, Effects and Animate show disabled with a tooltip naming their wave.
  - CV-038: Shape toolbar: Fill edits the layer; Stroke, Width, Corners, Boolean and Animate show disabled with a tooltip naming their wave. A drawing's toolbar edits its Color, Brush size and Opacity.
  - CV-039: Right-click Copy style and Paste style (also in the palette) copy opacity, color, text size and brush size from one layer and apply the compatible ones to every selected layer in one undo step.
- **SHP section:**
  - SHP-018: A Draw category in the left rail offers Pen, Marker and Highlighter with brush size, color and opacity; choosing a brush puts the canvas in draw mode, and Esc, V or another category leaves it.
  - SHP-019: Each freehand stroke becomes one undoable shape layer with a clip at the playhead; it can be selected, moved, resized, saved and reloaded, and draws the same in preview and export.

## 5. Contracts, schema and dependencies

- **Draw mode** follows `TRANSFORM_INTERACTION_CONTRACT.md` revision 5 (D-066). The owner authorized it with W2-D; no new contract change is needed.
- **Schema stays 4** (owner decision, D-068). A drawing is a `shape` layer with these properties:

  | Property      | Type   | Meaning                                   |
  | ------------- | ------ | ----------------------------------------- |
  | `path`        | string | Local-space points as `x y x y …` numbers |
  | `brush`       | string | `pen`, `marker` or `highlighter`          |
  | `stroke`      | color  | The stroke color                          |
  | `strokeWidth` | number | The brush size                            |
  | `width`       | number | The stroke's padded bounds                |
  | `height`      | number | The stroke's padded bounds                |

  Opacity is the ordinary transform opacity. The renderer reads these properties defensively. A malformed path draws nothing, plus a render warning.

- **Commands:** existing ones only (`CREATE_TRACK`, `CREATE_LAYER`, `CREATE_CLIP` and `SET_PROPERTY`). No new dependencies.

## 6. Design notes

### Context toolbar

- It is a row between the preview header and the canvas stage. It is rendered from the session selection and refreshes on every change. Every control is a labelled button or input with a tooltip; strings are translation keys; spacing and colors come from tokens.
- **Number fields** commit on Enter or on change, through the same path as the Inspector (`TransformInteraction.edit`: X, Y, scale, rotation, opacity). Scale is shown as a percentage of the current X scale and sets both axes, keeping any flip. Opacity is shown as 0–100%.
- **Flip** negates scale X (horizontal) or scale Y (vertical) around the visual center, in one undo step. It uses the same center compensation as the Inspector's scale fields.
- **Color** controls are `<input type="color">`, committing on change as one `SET_PROPERTY`: `fill` for text and shapes, `stroke` for drawings.
- **Text Size** sets `fontSize` from 1 to 4096.
- **Drawing Brush size** sets `strokeWidth` from 1 to 200 and re-pads `width` and `height`. The path is kept; stroke points stay centered on the padded box.
- **Disabled controls** carry `aria-disabled` and a tooltip: "Not built yet: planned for Wave {wave} ({id})".

### Draw tool

- The **Draw** rail button shows a panel:
  - three brush buttons (Pen, Marker, Highlighter), used as a radio group;
  - Size (a range and a number);
  - Color;
  - Opacity (a percentage);
  - an Exit button.
- **Defaults:**

  | Brush       | Size | Opacity | Caps and joins |
  | ----------- | ---- | ------- | -------------- |
  | Pen         | 4    | 100%    | Round          |
  | Marker      | 12   | 100%    | Round          |
  | Highlighter | 24   | 40%     | Square (butt)  |

  Picking a brush sets its default size and opacity. Color stays as last picked, starting at `#ff4fa3`.

- **Draw mode is transient session state** (`drawBrush`: the brush or null).
  - In draw mode, the canvas cursor is a crosshair. Pointer-down inside the composition starts a stroke; moves add points (skipping any point closer than 0.75 composition units to the last); pointer-up commits.
  - The stroke preview draws live through `RenderSource.drawing`.
  - Fewer than two distinct points commits nothing. Esc during a stroke cancels it.
  - Esc or V with no stroke in progress, the Exit button, or picking another rail category leaves draw mode.
  - Selection, handles and the context menu do not respond while drawing.
- **Commit** is one transaction, "Draw":
  - a `shape` layer named "Drawing N", with its position at the stroke bounds' minimum minus half the width;
  - a clip from the playhead, lasting 5 s (the image default), on a free compatible track or a new one.

  The new layer is not selected, so the user can keep drawing.

### Copy style

- **Copy style** (one layer selected) stores the source layer's style in a transient in-app clipboard (no history, not saved):
  - opacity;
  - color (`fill` of text and shapes, or `stroke` of drawings);
  - `fontSize` (text);
  - `strokeWidth` (drawings).

  Image and video layers contribute only opacity; their fill is a placeholder color.

- **Paste style** applies to every selected root. Opacity applies to all types; color applies to text, shapes and drawings; font size only to text; brush size only to drawings. All in one undo step, "Paste style". Nothing applicable means no history.

## 7. Steps

1. Brief, LCR rows and D-068.
2. Drawing model helpers, renderer support for drawings, and unit tests.
3. Draw rail panel, draw mode on the canvas, and the commit.
4. Context toolbar.
5. Copy style and Paste style: menu items and palette commands.
6. Playwright tests, then the docs and report. Verify, push, and merge into PR #4.

## 8. Required tests

- **CV-035:** the toolbar appears and hides for each kind of selection, with the right control set.
- **CV-036:**
  - edit X, Scale, Rotate and Opacity from the toolbar, one undo each;
  - Flip horizontal keeps the visual center and makes one undo step;
  - Crop is disabled with its wave tooltip.
- **CV-037:** Size and Color change the text (read back through the hook); Font is disabled with its tooltip.
- **CV-038:** shape Fill changes; Stroke is disabled; a drawing's Color and Brush size change.
- **CV-039:** copy style from text to a shape and to a drawing (color and opacity); paste onto two layers is one undo step.
- **SHP-018:** choose Marker, draw a stroke, and see the pixels on the canvas; Esc leaves draw mode, after which a click selects again.
- **SHP-019:**
  - the stroke is one layer and clip at the playhead, and undo removes both;
  - it can be selected and moved;
  - it survives a reload;
  - a highlighter stroke has 40% opacity.

## 9. Acceptance

- [ ] `npm run verify` exits 0
- [ ] The 7 new IDs are Verified, or listed as not done with a reason
- [ ] Report written, PR #3 updated, PR #4 brought up to date, working tree clean

## 10. Stop rules

Stop if any control needs a schema bump or a new command type. Stop too if drawing cannot be expressed as a shape layer under schema 4.
