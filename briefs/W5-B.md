# Brief W5-B: keyframe animation

Wave: 5, part B. Base: PR #4 head `0b27011` (W5-A, stacked on PR #3). End tag: `w5-b` (created at merge). Branch: `claude/wave-5-animation`, PR #5 against `claude/wave-5-export` (retarget as the stack merges).
Authority: `AGENTS.md`, then this brief, then `docs/FEATURES.md`.

## 1. Goal

Layers can be animated. Each animatable property gets a stopwatch; turning it on records keyframes, and edits at the playhead then create or update keyframes automatically. Between keyframes, values interpolate with linear, ease in, ease out, ease in-out, hold or a custom cubic-bezier. Preview playback, scrubbing and export all show the same animated values.

Keyframes can be selected, moved, copied, pasted, duplicated and deleted, one or several at once, on the timeline and in the Inspector. Previous and next keyframe buttons jump the playhead.

## 2. In scope (ledger IDs)

- ANI-001: the stopwatch (reworded by the LCR below).
- ANI-002: interpolation.
- ANI-003: preview matches export.
- ANI-004: keyframe editing.
- ANI-005: keyframe navigation and marker.
- ANI-006: auto-keyframe.
- ANI-009: children follow animated parents (Claimed → prove).

## 3. Out of scope

- Animation presets, fades, Ken Burns and the easing preset library with previews: ANI-007, ANI-008 and ANI-010. These are **W5-C**, next.
- Motion paths (ANI-011), per-character text animation (ANI-012), the graph editor (ANI-013), expressions and camera.
- Copying keyframes between different layers (ANI-017). Paste targets the layer the keyframes came from.
- Animating width and height, text content, brush path or drawing data. They stay static.
- An anchor point: there is no anchor field; the fixed anchor is the local origin (TRANSFORM_CONTRACT).

## 4. Ledger Change Requests to apply first

- **Reword ANI-001:** "Every animatable property has a stopwatch: position, scale, rotation, opacity, color (text and shape fill, drawing stroke) and text size; anchor and effect parameters get one when those properties exist (ADV and FX waves)". The reason: there is no anchor field, and no effects exist yet (D-070).

## 5. Contracts, schema and dependencies

- **Schema 5 (owner-approved, D-069).**
  - Each keyframe may carry an optional `easing` for the segment that starts at it:
    - the names `linear`, `ease-in`, `ease-out`, `ease-in-out` and `hold`;
    - or `{ "type": "cubic", "x1", "y1", "x2", "y2" }`, with x1 and x2 in [0, 1] and y1 and y2 finite.
  - A missing easing means linear.
  - **Migration 4→5** changes nothing but the version: every existing keyframe keeps its data and reads as linear.
  - A regression fixture `tests/fixtures/projects/v4-keyframes.json` migrates to an equal v5 document.
  - A newer-version file is still preserved, as before.
- **`TRANSFORM_CONTRACT.md` gets an additive "Animation evaluation" note.** The contract itself anticipates it ("Future animation evaluation must produce values obeying this same spatial contract").
  - The value of an animated property at time t is interpolated from its keyframes, and then the unchanged spatial rules apply.
  - Stored base values, the matrix order and inherited opacity are unchanged.
- **Keyframe times stay composition seconds,** as stored today (ARCHITECTURE). A clip move shifts its layer's keyframes, and its descendants', by the same delta; a trim does not. Keyframes pushed below 0 clamp to 0, and when two land on the same time the later one wins.
- **Commands:** no new command types. Keyframe edits are ordinary `SET_PROPERTY` commands that carry the property's new keyframe list; `SET_KEYFRAME` and `REMOVE_KEYFRAME` stay. The move shift happens inside the existing clip timing handlers. Validation stays at the command boundary: times strictly increasing and finite, values typed, easing valid.
- No new dependencies.

## 6. Design notes

- **Evaluation** is `evaluateProperty(property, time)` and `compositionAt(composition, time)` in `src/core/animation.ts`, pure and memoized per composition object and time.
  - Before the first keyframe the value is the first keyframe's; after the last, the last's.
  - Numbers and vectors interpolate per component. Colors interpolate per RGB(A) channel, rounded to hex. Strings and booleans hold.
  - Cubic-bezier is solved for x with Newton's method plus a bisection fallback.
  - A composition with no animated property returns the same object, so there is no overhead.
- **Where it is used:**
  - `EditorSession.source` evaluates at the playhead, so the canvas, hit-testing, snapping, selection bounds, Inspector and toolbar all show animated values.
  - The export worker evaluates at each output frame time, with the same function.
  - `session.source` is the only view the UI edits from.
- **Auto-keyframe (ANI-006).** Every UI edit that builds a `SET_PROPERTY` (canvas gestures, Inspector, toolbar, align, Paste style) passes the playhead time. For an animated property it upserts the keyframe at that time, keeping any existing easing, instead of changing the static value. Dragging an animated layer therefore changes only the keyframe under the playhead, creating one if needed, in one undo step.
- **Inspector: new "Animation" section** for the selected layer.
  - One row per animatable property: name, stopwatch (aria-pressed), ◀ previous keyframe, ◆ add or remove a keyframe at the playhead, ▶ next keyframe.
  - The ◆ button is filled when the playhead is on a keyframe (ANI-005 marker).
  - Stopwatch on adds a keyframe at the playhead with the current value. Stopwatch off removes every keyframe and keeps the value shown at the playhead as the static value. Each is one undo step.
  - The section's header has layer-level ◀ ▶ buttons that jump to the previous or next keyframe of any property.
  - When timeline keyframes are selected, the section shows:
    - their time, as an editable field that moves them (one undo);
    - an Easing select, with Custom… showing four numbers;
    - Copy, Paste, Duplicate and Delete buttons.
- **Timeline.** Each clip of a layer with keyframes shows diamonds at its keyframe times: all properties, merged by time, and drawn only inside the clip's range.
  - Click selects a diamond; Shift or Ctrl click adds to the selection; the selection is transient session state.
  - Dragging moves the selected keyframes, frame-quantized and clamped at 0, as one undo step.
  - Right-click opens: Easing ›, Copy, Paste, Duplicate, Delete.
  - With keyframes selected and the timeline focused: Delete deletes them, Ctrl+C copies, Ctrl+V pastes at the playhead (keeping relative offsets), and Ctrl+D duplicates one frame later.
  - Clicking empty space or a clip clears the keyframe selection.
  - A selected diamond is drawn filled with the accent color.
- **Registry and palette commands:** Previous keyframe (`,`) and Next keyframe (`.`) for the selected layer; Copy, Paste, Duplicate and Delete keyframes. Easing presets are in the menus.
- **Test hook:** `getSession()` also returns the selected keyframes (read-only).

## 7. Steps

1. Brief, LCR, decisions, schema 5 with migration and fixture, and the contract note.
2. `src/core/animation.ts` (evaluation and easing), the keyframe shift on clip moves, and the command validation. Unit tests.
3. Session evaluation, auto-keyframe in the command builders, and the export worker. Unit tests.
4. The Inspector Animation section, then the timeline keyframes: drawing, selection, drag, menu and keys.
5. Playwright tests, docs, report and verify. Open PR #5.

## 8. Required tests (Playwright unless noted)

- **ANI-001:** turn the stopwatch on for position, opacity, color and text size, and see keyframes created. Turning it off keeps the value at the playhead.
- **ANI-002:** a linear position animation at the half-way time sits exactly half-way. Ease-in sits below half-way, ease-out above it, and hold keeps the first value until the next key. Unit tests cover the cubic curves.
- **ANI-003:** an exported frame at the middle of an animation matches the preview drawn at the same time (pixel comparison). Scrubbing shows intermediate positions.
- **ANI-004:**
  - select two diamonds and drag them later: one undo;
  - copy and paste at the playhead;
  - duplicate;
  - delete;
  - move a keyframe via the Inspector time field.
- **ANI-005:** ◀ and ▶ jump the playhead to the previous or next keyframe, and the ◆ is filled exactly on a keyframe.
- **ANI-006:** with the stopwatch on, dragging the layer at a new time creates a keyframe there and leaves the earlier one unchanged.
- **ANI-009:** an animated group moves and fades its children.
- **Unit tests:** migration 4→5 and its fixture; clip moves shift keyframes and trims do not; invalid easing is rejected.

## 9. Acceptance

- [ ] `npm run verify` exits 0
- [ ] The 7 IDs are Verified, or listed as not done with a reason
- [ ] Report written, PR #5 open (not merged), working tree clean

## 10. Stop rules

Stop if the work needs a schema change beyond keyframe `easing`, a change to the spatial semantics of the transform contract, or a new dependency.
