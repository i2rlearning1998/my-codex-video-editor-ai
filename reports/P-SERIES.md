# Report: P-series, Creator Pack in the editor (P1 to P4) (2026-10-15)

## 1. Summary

- Codex's `origin/codex/creator-pack` (PR #29) is merged unchanged. The editor only calls its parser, `checkPack` and preset engine.
- **P1** A code layer has its own menus. It is never blank: it shows its thumbnail and "Rendering n %" before the first frames, and plays from the frames already baked. Dragging a control renders the frame live at Draft; the release re-bakes it.
- **P2** Import creator pack (Import menu, paste box, or a dropped file):
  - Two kinds of checks, both shown in a review dialog: offline checks, then render checks.
  - The dialog lists every item with checkboxes, reasons and Copy report. Rejected items never block the rest.
  - Accepted items go into My library, which stores pack versions. They appear in their panels with a Creator pack badge.
- **P3** Creator presets work from Animate › Creator; applying one writes ordinary keyframes in one undo step.
  - The rail's Animation settings is now **Controls** and shows only what the layer has. Hand-made keyframes get a simple view.
  - Edited manually comes with Reset to controls, and Add animation is available.
- **P4** Copy library index for AI (under 40 KB).
- Schema is still 8. There are no new npm dependencies.

## 2. Scope and results

| ID     | Result   | Evidence                                                                            |
| ------ | -------- | ----------------------------------------------------------------------------------- |
| CP-001 | Verified | e2e/p1-code-usability.spec.ts                                                       |
| CP-002 | Verified | e2e/p1-code-usability.spec.ts                                                       |
| CP-003 | Verified | e2e/p1-code-usability.spec.ts                                                       |
| CP-004 | Verified | e2e/p2-creator-pack.spec.ts (menu, paste, drop of a .creatorpack.json)              |
| CP-005 | Verified | e2e/p2-creator-pack.spec.ts                                                         |
| CP-006 | Verified | e2e/p2-creator-pack.spec.ts                                                         |
| CP-007 | Verified | e2e/p2-creator-pack.spec.ts (all examples/creator-packs import; panels; insert)     |
| CP-008 | Verified | e2e/p2-creator-pack.spec.ts                                                         |
| CP-009 | Verified | e2e/p3-presets.spec.ts; tests/p-series.test.ts                                      |
| CP-010 | Claimed  | e2e/p3-presets.spec.ts proves the rule, but Loop is not built in the simple view    |
| CP-011 | Verified | e2e/p3-presets.spec.ts                                                              |
| CP-012 | Verified | e2e/p3-presets.spec.ts                                                              |
| CP-013 | Verified | e2e/p4-library-index.spec.ts; tests/p-series.test.ts                                |
| CP-014 | Verified | e2e/p2-creator-pack.spec.ts (every bad example rejected with its expected reason)   |
| CP-015 | Verified | e2e/p2-creator-pack.spec.ts                                                         |

## 3. Checks

VERIFY_RESULTS

## 4. Try-it script for the owner (about 10 minutes)

| #   | Do this                                                                                   | Expect                                                                                   | ID             | Claude ran it (Y/N) | Screenshot  |
| --- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------- | ------------------- | ----------- |
| 1   | Import a code animation; right-click it on the canvas and on the timeline                 | Edit code, Controls, Save as template, Re-render first; no Detach audio or Auto cut        | CP-001         | Y (e2e)             | test output |
| 2   | Re-render it                                                                              | The clip and canvas keep a picture and show "Rendering n %"; Play works at once          | CP-002         | Y (e2e)             | test output |
| 3   | Controls: drag a number slider                                                            | The canvas follows while dragging; one undo step after the release                       | CP-003         | Y (e2e)             | test output |
| 4   | Media › Import › Import creator pack; paste `examples/creator-packs/shape.json`; Run checks | A row with a thumbnail and OK; Copy report copies plain text                             | CP-004, CP-005 | Y (e2e)             | test output |
| 5   | Add selected to library; Elements › Shapes                                                | The shape with a Creator pack badge; a click inserts it (one Ctrl+Z removes it)           | CP-006, CP-007 | Y (e2e)             | test output |
| 6   | Import the same pack again                                                                | "…is already in your library"; nothing doubles                                             | CP-015         | Y (e2e)             | test output |
| 7   | Paste `examples/creator-packs/bad-infinite-loop.json`                                     | Rejected with the reason; other items still addable                                      | CP-014         | Y (e2e)             | test output |
| 8   | Import `move-preset.json`; select the badge; Animate › Creator › the preset               | The badge moves right over 1 s                                                           | CP-009         | Y (e2e)             | test output |
| 9   | Right rail › Controls                                                                     | Only a Move heading (Direction, Distance); Duration, Delay, Smoothness under More         | CP-010         | Y (e2e)             | test output |
| 10  | Change Distance                                                                           | The move gets longer; one undo step                                                      | CP-011         | Y (e2e)             | test output |
| 11  | 2D Animation, drag the badge half-way; Controls                                           | "Edited manually", controls greyed; Reset to controls asks and restores                  | CP-011         | Y (e2e)             | test output |
| 12  | Add animation › a preset                                                                  | Its heading appears; nothing else                                                        | CP-012         | Y (e2e)             | test output |
| 13  | Media › Import › Copy library index for AI; paste into a text editor                      | Canvas, fonts, presets, FX ids, Blocks, library and creator items                        | CP-013         | Y (e2e)             | test output |

## 5. Deviations from the brief

- `layer.metadata.preset` does not exist in schema 8 (layers are strict records), and the brief forbids a schema bump. The record is a `preset` string property instead (D-239).
- The simple view has no Loop: keyframes have no loop, and a preset's own `loop` is not applied. CP-010 is therefore Claimed.
- Point and range controls of a preset are not shown in Controls yet. No example uses them.
- Add animation lists the Creator presets. The built-in In, Out and Loop presets are clip presets, not keyframes, so they stay in Animate.
- "Animation settings" is now "Controls" in the rail and its heading. The undo label for code params stays "Animation settings".

## 6. Decisions made

D-237, D-238, D-239 and D-250 in docs/DECISIONS.md. D-240 to D-248 are used in other docs.

## 7. Not tested, known gaps, risks

- Real Chrome or Edge were not used: the sandbox has Chromium 141 (D-030). CI is checked once after the push.
- Presets on groups and code layers were not tested in e2e; only a shape was.
- Spec 6's "item's controls must change the render" check covers number controls at their min and max only.
- Not in this run (per the brief): the composition adapter, the right-panel kinds (adjust, filter, effect, transition), fonts and path-following presets. Their kinds show "Not supported yet".
- `tests/blocks/worker.test.ts` needs Node 20 (it fails on Node 22, as on main).

## 8. Architecture and contract impact

- Schema version: unchanged (8). New dependencies: none. New core commands: none.
- Files added:
  - src/code-layer/poster.ts and live.ts
  - src/ui/creator-library.ts, creator-checks.ts, creator-pack-dialog.ts, creator-presets.ts, controls-panel.ts and library-index.ts
  - e2e/p1 to p4 specs and tests/p-series.test.ts
- Contracts touched: none. src/creator-pack (Codex) is not edited.

## 9. Ledger and backlog

- LCR applied: a CP section, CP-001 to CP-015. Fourteen are Verified and CP-010 is Claimed (Loop).

## 10. Git

- Branch `claude/p-series`, draft PR #30 to `claude/x-series`. One commit per part, then docs.

## Owner tick-list (owner fills this in and sends it to Claude)

| ID  | OK / BUG / MISSING / CHANGE | One sentence |
| --- | --------------------------- | ------------ |
|     |                             |              |
