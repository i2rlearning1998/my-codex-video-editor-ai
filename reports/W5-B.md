# Report: Wave 5 part B (W5-B): keyframe animation (2026-09-24)

## 1. Summary

Layers can now be animated.

- **Stopwatches.** The Inspector has a new **Animation** section with a stopwatch for each animatable property: position, scale, rotation, opacity, color and text size.
- **Auto-keyframe.** With a stopwatch on, any edit at the playhead records a keyframe. That covers dragging on the canvas, typing in the Inspector, the toolbar, align and Paste style.
- **Easing.** Between keyframes, values ease in one of six ways: linear, ease in, ease out, ease in and out, hold, or a custom curve. You set it from a keyframe's right-click menu or the Inspector.
- **Editing keyframes.** Diamonds on the timeline can be clicked, Ctrl-clicked, dragged, copied, pasted, duplicated and deleted. The Inspector can also move them to a typed time.
- **Navigation.** ◀ ▶ buttons, and the `,` and `.` keys, jump between keyframes. The ◆ is filled when the playhead sits on one.
- **Preview matches export.** Playback, scrubbing and export use the same evaluation code, so the exported video matches the preview.
- **Clip moves.** Moving a clip moves its animation with it.

**The project format is now schema 5**, as you approved. Older files open unchanged, and their keyframes read as linear.

W5-C is next: presets, fades, Ken Burns and the easing library.

## 2. Scope and results

| ID      | Result                 | Evidence                                                                                                                                                                                                                                  |
| ------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ANI-001 | Verified (reworded)    | `[ANI-001][ANI-006] stopwatches record keyframes…`: position, opacity, color and text-size stopwatches create keyframes; turning one off keeps the value shown. Reworded by LCR (D-070): there is no anchor field and there are no effects yet |
| ANI-002 | Verified               | `[ANI-002][ANI-003] easing from the keyframe menu and the Inspector…`: ease in is below half-way at the midpoint, ease out above it, and hold keeps x 76 (checked on canvas pixels); a custom curve is set from the Inspector. Unit tests cover the curve maths, the v4→v5 migration and invalid-easing rejection |
| ANI-003 | Verified               | `[ANI-003] an exported animated frame matches the preview at the same time` (export spec): the frame at 1 s differs from the preview PNG by a mean under 4 of 255, and the badge really moved in the file. Scrubbing is covered by ANI-002 |
| ANI-004 | Verified               | `[ANI-004] keyframes move, copy, paste, duplicate and delete on the timeline and in the Inspector`, plus a unit test: a clip move carries keyframes, a trim does not                                                                 |
| ANI-005 | Verified               | `[ANI-005] previous and next keyframe jump the playhead; the diamond is filled exactly on a keyframe` (buttons and the `,` and `.` keys)                                                                                              |
| ANI-006 | Verified               | Same test as ANI-001: an Inspector edit at 2 s and a canvas drag at 3 s each add a keyframe there and leave the others unchanged                                                                                                       |
| ANI-009 | Verified (was Claimed) | `[ANI-009] children follow an animated group and inherit its opacity`: at 1 s the child is half-way and half-transparent; by 2 s it is gone                                                                                          |

- In-scope P0 items Verified: 7 of 7.
- Not done: none.

## 3. Checks (real output tails)

- `npm run verify`: exit 0.
- Build: `dist/assets/index-*.js 344.93 kB │ gzip: 102.98 kB` (about +35 kB; this branch includes W5-A).
- Unit and jsdom: `Test Files 24 passed (24)`, `Tests 340 passed (340)`, of which 5 new animation tests. KEY-001 now covers the two navigation commands.
- E2E: `119 passed (3.8m)` = 118 normal passes (6 new) + 1 expected failure (the DEV-006 guard probe). Browser: Chromium 141.
- Ledger: `502 items | Verified 137 | Claimed 9 | Todo 356`, `Ledger OK`.
- **PB-010:** the known sandbox-only flake failed once in an earlier full run of this session. The final verify passed. It is not re-investigated, by owner decision (STATUS.md).

## 4. Try-it script (about 10 minutes, in Chrome)

| #   | Do this                                                                                                   | Expect                                                                                                 | ID               | Claude ran it | Screenshot                          |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------- | ------------- | ----------------------------------- |
| 1   | Select the lavender label. In **Animation** (right panel, under Transform), click Position's stopwatch     | It turns purple; a diamond appears on the label's clip at 0 s                                           | ANI-001          | Y             | —                                   |
| 2   | Click the ruler at 2 s and drag the label to the right                                                     | A second diamond at 2 s                                                                                | ANI-006          | Y             | —                                   |
| 3   | Press Play, or scrub between 0 and 2 s                                                                     | The label glides across                                                                                | ANI-003          | Y             | `animated-badge.png`                |
| 4   | Right-click the first diamond → **Ease in**, then scrub                                                    | It starts slowly and speeds up                                                                         | ANI-002          | Y             | —                                   |
| 5   | Right-click → **Hold**                                                                                     | It stays put, then jumps at 2 s                                                                        | ANI-002          | Y             | —                                   |
| 6   | Click a diamond; in Animation choose Easing → **Custom curve…** and change x1                             | The motion changes                                                                                     | ANI-002          | Y             | —                                   |
| 7   | Ctrl-click both diamonds and drag them to the right                                                        | Both move together; one Undo reverts it                                                                | ANI-004          | Y             | `keyframes.png`                     |
| 8   | With both selected: Ctrl+C, click the ruler at 5 s, Ctrl+V                                                 | The same animation repeats from 5 s                                                                    | ANI-004          | Y             | —                                   |
| 9   | Select a diamond and press Delete                                                                          | It disappears                                                                                          | ANI-004          | Y             | —                                   |
| 10  | Use ◀ ▶ in the Animation header, or press `,` and `.`                                                      | The playhead jumps between keyframes; the ◆ fills on a keyframe                                        | ANI-005          | Y             | —                                   |
| 11  | Animate the card group's position and opacity                                                              | Both cards move and fade together                                                                     | ANI-009          | Y             | —                                   |
| 12  | Export 0–2 s                                                                                               | The video shows the same motion as the preview                                                         | ANI-003          | Y (WebM here) | —                                   |

## 5. Deviations from the brief

- **Inspector refresh.** It now re-renders when the playhead moves, for animated selections only and not during playback. The e2e test found it showing a stale position at a new time. Not re-rendering every frame of playback is deliberate, for speed.
- **Diamond styling.** The existing timeline keyframe diamonds had no styling at all (they rendered in normal document flow). They now sit on the clip row.

## 6. Decisions made

- D-069: schema 5 with keyframe easing, and the migration.
- D-070: the evaluation design; keyframes move with clip moves, not trims; auto-keyframe; the ANI-001 rewording.

## 7. Not tested, known gaps, risks

- **Diamonds.** They stand for all of a layer's keyframes at one time. There is no per-property keyframe row yet (a graph editor is ANI-013).
- **Moving a keyframe onto another** at the same time replaces it (After Effects does the same).
- **Clips and keyframes.** Keyframes outside a clip's range are kept and hold their value, but no diamond is drawn for them. Trimming a clip's start does not move its keyframes.
- **Group children** in the Scene list animate like any layer; their diamonds are not shown on the timeline, because children have no clip rows.
- **Clipboard.** Pasted keyframes always go to the layer they were copied from; pasting between layers is ANI-017.
- **Not tested:** long animations with thousands of keyframes (performance), animated text wrapping, and MP4 export of an animation in Chrome. The CI `export-mp4` job runs the export spec, including the new ANI-003 test, on this PR.
- **Older app versions** cannot open schema-5 files. The existing newer-version protection keeps such files untouched.

## 8. Architecture and contract impact

- **Schema 4 → 5** (owner-approved, D-069), with a migration and a regression fixture.
- **`TRANSFORM_CONTRACT.md`:** an additive "Animation evaluation" section. The spatial rules are unchanged.
- **New files:**
  - `src/core/animation.ts`;
  - `src/ui/keyframes.ts`, `src/ui/keyframe-edit.ts` and `src/ui/animation-panel.ts`;
  - `tests/animation.test.ts` and `e2e/animation.spec.ts`;
  - `tests/fixtures/projects/v4-keyframes.json`.
- **Changed:**
  - The session source is evaluated at the playhead.
  - The export worker evaluates each frame.
  - Clip-move commands carry keyframes.
  - The transform and property command builders take the playhead time.
  - The timeline selects and drags keyframes.
  - The registry routes Copy, Paste, Duplicate and Delete to keyframes when keyframes are selected, and adds `,` and `.`.
  - The test hook and the debug report include the selected keyframes.
- **No new dependencies.**

## 9. Ledger and backlog

- **LCR:** ANI-001 reworded.
- **Status changes:** ANI-001 to ANI-006 Todo → Verified; ANI-009 Claimed → Verified.

## 10. Git

- Branch `claude/wave-5-animation`, PR #5, stacked on PR #4 (`claude/wave-5-export`). Tag `w5-b` at merge.

## Owner tick-list

| ID                | OK / BUG / MISSING / CHANGE | One sentence |
| ----------------- | --------------------------- | ------------ |
| ANI-001 / ANI-006 |                             |              |
| ANI-002           |                             |              |
| ANI-003           |                             |              |
| ANI-004           |                             |              |
| ANI-005           |                             |              |
| ANI-009           |                             |              |
