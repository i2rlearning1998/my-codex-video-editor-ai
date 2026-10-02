# Report: I-series, I1 to I5 (2026-10-02)

Branch `claude/i-series`, one PR to `main`, never merged by Claude. Progress is tracked in `briefs/I-SERIES.md`. This report grows part by part. Sections 3 and 10 are filled in after each full verify.

## 1. Summary

**I1 (fixes after the H-series test).**

- Side panels now visibly slide open and shut.
- Toolbar buttons open a collapsed panel.
- Library cards drag onto the canvas and land where they are dropped.
- Templates ask whether to replace the scene, add onto it or make a new scene.
- A canvas bar shows when you click outside the page.
- Undo no longer removes imported media or project renames.
- Media items have a menu: Rename, Add to scene, Move to folder, Details and Delete. Delete can be restored for 8 seconds; after that the stored files are removed.

## 2. Scope and results

### I1

| ID      | Result   | Evidence (test title or file)                                                                                                     |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| LAY-038 | Verified | `[LAY-038] the left panel animates its real width…`, `[LAY-038] the right panel animates…`, `[LAY-038] [LAY-039] a toolbar button…` |
| LAY-039 | Verified | `[LAY-039] every panel button of the text, shape and image toolbars opens the collapsed left panel`                               |
| TPL-012 | Verified | `[TPL-012] a dragged library shape, background and text style land at the drop point as one step, never as media`                |
| TPL-013 | Verified | `[TPL-013] a template asks where it goes…`, `[TPL-013] a template of another size is scaled to fit…`                              |
| CV-057  | Verified | `[CV-057] the canvas bar shows outside the artboard and after Escape; object toolbars carry no size chip`                         |
| HIS-007 | Verified | `[HIS-007] [HIS-008] importing media and renaming the project are not undone; placing media is`                                   |
| HIS-008 | Verified | the same test, plus `docs/UNDO-RULES.md`                                                                                          |
| MED-036 | Verified | `[MED-036] deleting unused media can be restored for 8 s…`, `[MED-036] a clip whose media was deleted draws a Missing media placeholder` |
| MED-037 | Verified | `[MED-037] the media item menu renames (not undoable), moves to a folder, shows details and adds to the scene`                   |

Every one of these tests fails on the H-series code:

- The panel width did not change, because only the grid column animated.
- Toolbar buttons opened their panel inside a collapsed area.
- Cards had no drag type and no drop handler.
- There was no dialog and no canvas bar.
- An import was an undo step.
- There was no media menu.

Existing tests changed because the brief changes the behaviour on purpose. Each asserts the new rule, and none was deleted or weakened:

- `[MED-001]…` now proves an import is not an undo step. It used to prove it was.
- `[MED-015]…` expects only "Add asset layer" in history.
- `[CV-052]…` expects the canvas bar after a stage click.
- `[CV-054]…` checks that object toolbars have no size chip, and that the scene bar starts with it.
- `[TPL-011]…` confirms the new dialog's default (New scene).

## 4. Try-it script for the owner

### I1 (about 8 minutes)

| #   | Do this                                                                                                   | Expect                                                                                                                      | ID               | Claude ran it | Screenshot                    |
| --- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------- | ----------------------------- |
| 1   | Click the active left rail icon, then click it again. Do the same with the right rail and the top-bar panel buttons | Each panel slides shut and open (about a quarter second); its content does not squash while it moves                        | LAY-038          | Y (test)      | test-results (LAY-038)        |
| 2   | Collapse the left panel, select the headline, press Font, then Effects, Animate, Position and the colour swatch | The left panel slides open each time and shows that panel                                                                   | LAY-039          | Y (test)      | test-results (LAY-039)        |
| 3   | Elements: drag a star onto the top-left part of the page                                                  | The star lands centred where you let go; one Undo removes it; Project Media is unchanged                                    | TPL-012          | Y (test)      | test-results (TPL-012)        |
| 4   | Templates: click "Lesson slide"                                                                            | A dialog: Replace this scene, Add onto this scene, New scene (selected); Esc closes it with no change                       | TPL-013          | Y             | scratchpad `i1-dialog.png`    |
| 5   | Click it again and press Enter                                                                             | A new scene fades in; a toast says it was added, with Undo; Undo removes it                                                 | TPL-013          | Y (test)      | test-results (TPL-013)        |
| 6   | Choose Ratio, Square on the canvas bar (step 7), then add a template                                       | The template is scaled to fit the square page and centred; the toast says it was scaled                                    | TPL-013          | Y (test)      | test-results (TPL-013)        |
| 7   | Click the dark area outside the page; then the page itself; then the headline                             | Outside: the canvas bar (Ratio, background, Auto captions greyed). Page: the scene bar. Headline: the text toolbar, no size chip | CV-057           | Y             | scratchpad `i1-canvasbar.png` |
| 8   | Media: Import an image, press Ctrl+Z                                                                       | The image stays in Project Media (importing is not undone)                                                                  | HIS-007, HIS-008 | Y (test)      | test-results (HIS-008)        |
| 9   | Drag it onto the page, open its ⋯ menu: Rename, Move to folder › New folder…, Details                    | Rename and the folder apply at once and are not undo steps; Details shows size, dimensions and "1 clip"                    | MED-037          | Y             | scratchpad `i1-menu.png`      |
| 10  | ⋯ › Delete; confirm                                                                                        | It asks first (used by 1 clip); the picture becomes a grey "Missing media" box; a toast offers Restore for 8 s              | MED-036          | Y             | scratchpad `i1-missing.png`   |
| 11  | Press Restore; then delete again and wait 10 s; then import the same file again                            | Restore brings the picture back. After the wait the file is gone, and importing it again brings it back ("Restored 1")     | MED-036          | Y (test)      | test-results (MED-036)        |

## 5. Deviations from the brief

- I1.2 "same for the right side": no toolbar button opens the right panel today, so there is nothing to reveal there. The right panel's rail and top-bar toggle are proven (D-137; backlog).
- I1.7 "Restore is [undoable]": Restore is the toast's button that reverses a Delete. It is not a history step, because Delete itself is not one (D-141).

## 6. Decisions made

D-136 (undo rules and `engine.library`), D-137 (panel animation and revealing a collapsed panel), D-138 (library drag type), D-139 (template insert modes and fit scaling), D-140 (canvas bar), D-141 (media menu and soft delete). See `docs/DECISIONS.md`.

## 7. Not tested, known gaps, risks

### I1

- The 240 ms animation is checked at one sample point (60 to 120 ms after the click), not frame by frame. Smoothness on the reference machine was not measured.
- Reduced motion: the CSS sets the panel and crossfade durations to about 0 under `prefers-reduced-motion`; no e2e emulates it.
- Deleting media removes the stored files that every project in this browser shares (D-141, backlog).
- Library cards cannot be dropped on a timeline track (backlog).
- The media menu's flyout uses the shared menu; it was checked with the mouse, not with screen-reader software.

## 8. Architecture and contract impact

- Schema: unchanged (5). The deleted flag is `asset.metadata.removed`. The template size is optional manifest data, not project data.
- New dependencies: none.
- New core API: `engine.library(label, commands)` (D-136), with change reason `library`. It is not an undoable command, and it uses the existing command validation.
- Files added:
  - `src/ui/library-actions.ts`;
  - `src/ui/media-folders.ts`;
  - `docs/UNDO-RULES.md`;
  - `e2e/i1-fixes.spec.ts`.
- `src/audio/*`, the export mixdown and `sound-panel.ts` were not touched. Deleted media is silenced by filtering the playback asset list in the shell.
- Contracts: none touched.

## 9. Ledger and backlog

- LCR I1, added: LAY-038, LAY-039, TPL-012, TPL-013, CV-057, HIS-008, MED-036 and MED-037. All are now Verified.
- HIS-007 moved from Todo to Verified.
- CV-052 and CV-054 reworded.
- `docs/BACKLOG_INBOX.md`: 4 lines from I1.

## Owner tick-list

| ID      | OK / BUG / MISSING / CHANGE | One sentence |
| ------- | --------------------------- | ------------ |
| LAY-038 |                             |              |
| LAY-039 |                             |              |
| TPL-012 |                             |              |
| TPL-013 |                             |              |
| CV-057  |                             |              |
| HIS-008 |                             |              |
| MED-036 |                             |              |
| MED-037 |                             |              |
