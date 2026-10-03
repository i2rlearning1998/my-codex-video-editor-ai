# Report: I-series, I1 to I5 (2026-10-02)

Branch `claude/i-series`, one PR to `main`, never merged by Claude. Progress is tracked in `briefs/I-SERIES.md`. Screenshots named `scratchpad …` were taken in this session's scratch folder while building; test screenshots are in each test's output folder (`test-results/<test>/`).

## 1. Summary

**I1 (fixes after the H-series test).**

- Side panels now visibly slide open and shut.
- Toolbar buttons open a collapsed panel.
- Library cards drag onto the canvas and land where they are dropped.
- Templates ask whether to replace the scene, add onto it or make a new scene.
- A canvas bar shows when you click outside the page.
- Undo no longer removes imported media or project renames.
- Media items have a menu: Rename, Add to scene, Move to folder, Details and Delete. Delete can be restored for 8 seconds; after that the stored files are removed.

**I2 (browse panels).**

- Templates, Elements, Text and Transitions are Canva-style browse panels: search, rows with See all, chips, Recently used, drill-down pages.
- Templates are in categories (All, Video, Graphics, Social media, Education) with sized subcategories, and you can save your own (My Templates).
- Elements has Browse categories (Shapes and Graphics live, the rest planned), with Lines, shape sections and Graphics pages. The separate Graphics rail item is gone.
- Text has Add a text box, default styles, combinations, titles and two-line sections.
- Media has type tabs, sort, folders, Designs (frames saved from Export) and hover previews for videos.
- Draw opens a palette at the canvas edge with Select, Draw, Shape, Line, Sticky note, Text and Signature.

**I3 (scene strip).** A strip of scene cards under the canvas replaces the scene drop-down: add, reorder, rename, duplicate, delete and save as template, with a compact "Scene n of m" button on narrow windows.

**I4 (right panel per object).** The right panel's tabs follow the selection. The first tab is named after it (Canvas, Shape, Text, Image, Video, Audio, Group, Arrange) and holds its controls; Position and size and Timing sit folded below. Unbuilt tabs show disabled with their wave.

**I5 (library content).** 14 flowchart shapes and 6 animated titles were added, and docs/LIBRARY.md is updated. No icon pack was added (reason in section 5).

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

### I2 to I5

| ID      | Result   | Evidence (test title or file)                                                                                            |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| LAY-040 | Verified | `[LAY-040] a browse panel has a header with Back and Close, a sticky search, sections with See all, chips…`              |
| TPL-014 | Verified | `[TPL-014] Templates: category rows open pages with subcategory chips…`                                                  |
| TPL-015 | Verified | `[TPL-015] Save as template keeps a scene in My Templates…`, and the strip's Save as template in `[PRJ-023] cards drag…` |
| SHP-026 | Verified | `[SHP-026] Elements: Browse categories…`                                                                                 |
| TXT-038 | Verified | `[TXT-038] Text: Add a text box, default styles (click and drag)…`                                                       |
| TR-010  | Verified | `[TR-010] Transitions: a tip, a Duration control and sections…`                                                          |
| MED-038 | Verified | `[MED-038] Media: type tabs, sort, folders with drag in, Designs from Save frame to Media, and a drop zone`              |
| SHP-027 | Verified | `[SHP-027] the Draw palette…`                                                                                            |
| PRJ-023 | Verified | three `[PRJ-023]` tests in `e2e/i3-strip.spec.ts` (PRJ-014 re-proven)                                                    |
| LAY-041 | Verified | `[LAY-041] nothing selected: the Canvas tab…`, `[LAY-035] the right rail lists the tabs…`                                |
| LAY-042 | Verified | `[LAY-042] a shape: Color, Outline…, Adjust colors…`                                                                     |
| LAY-043 | Verified | `[LAY-043] text: font, size, B I U S, case, align, colour and spacing…`                                                  |
| LAY-044 | Verified | `[LAY-044] a group: Group with Ungroup and Align; a multi-selection: Arrange…`                                            |
| LAY-045 | Verified | `[LAY-045] media: an image has Image…; a video has Speed, Audio (mute, detach) and Fade`                                 |
| SHP-028 | Verified | `[SHP-028] Elements › Shapes lists 14 flowchart shapes…`                                                                 |
| TXT-039 | Verified | `[TXT-039] Text › Titles add animated titles…`                                                                           |

Tests changed because I2 to I4 change the layout on purpose. Each still asserts the same behaviour, reached the new way:

- **The Graphics rail item moved into Elements.** SHP-013, MED-035, TPL-012, LAY-002 and the shell unit test now open Elements › Graphics or the Transitions panel.
- **TPL-010** opens each panel's See all page to count its items.
- **The scene strip replaced the composition select.** PRJ-012 and the shell unit test click a strip card.
- **The right panel's new tabs.** LAY-035, LAY-036 and LAY-037 follow them; Fade is now proven on a video clip.
- **The folded Inspector.** About 15 tests that type into it open it first, with the fixture `openInspector`.
- **Duplicated controls.** The right panel shows the same controls as the toolbar popovers, so EXP-006, CV-055, VID-018, TXT-036 and TPL-013 now name the toolbar popover.
- **LAY-034's More menu** lists two categories, since the rail has eight.
- **DEV-007** compares the report's viewport with the page's.

The default e2e viewport grew by the strip's 72 px (D-150). No tolerance was loosened.

## 3. Checks

### After I1 (commit `1fd6db6`, plus the CV-037 test update)

- `npm run verify` on the I1 commit, from a clean snapshot: format, typecheck and build passed. Unit and jsdom: 388 passed in 35 files.
- E2E: 246 passed, 1 failed. The failure was `[CV-037]`: it still expected the size chip on the text toolbar, which I1.5 removes on purpose. The test was updated to assert that the chip is absent. On the same commit plus that update, `e2e/text-style.spec.ts` and `e2e/i1-fixes.spec.ts` then passed 16 of 16.
- DEV-006 is the expected-failure probe.
- Browser: Chromium 141.0.7390.37 (the sandbox fallback, D-030).
- Build: main bundle 607.55 kB (186.21 kB gzip), export worker 543.54 kB.
- Ledger: OK, 555 items: 226 Verified, 12 Claimed, 317 Todo, 0 Bug.
- CI: checked once after the final push (section 10).

### Final (I1 to I5, commit `70c7224` plus the CSS comment repair)

- `npm run verify` from a clean snapshot: exit 0.
  - Format, typecheck (app and e2e) and build passed.
  - Unit and jsdom: 388 passed in 35 files.
  - E2E: 265 passed, including the DEV-006 expected-failure probe, in Chromium 141.0.7390.37 (D-030), single worker, 15.3 min.
  - Ledger: OK, 573 items: 242 Verified, 12 Claimed, 319 Todo, 0 Bug.
  - Build: main bundle 676.97 kB (207.15 kB gzip), export worker 543.78 kB.
- **CSS repair.** The build warned about one CSS comment that a selector rewrite had broken (I1's media menu). It was repaired after this verify. `npm run check` then passed again (388 unit tests, build with no CSS warning), and the menu tests passed: `[MED-036]`, `[MED-037]` and `[CV-056]`, 4 of 4.
- **Viewports.** No horizontal scrollbar at the seven H-series viewports, in both themes, with each I-series panel open (section 7).
- **Flakiness.** Sampling the panel width under 4 to 5 parallel workers failed now and then: frames stall for 100 ms or more. The check now anchors its 60 to 120 ms window on the start of the transition (D-150 note in the test). With the verify's single worker, it passed 15 of 15 repeated runs.

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

### I2 to I5 (about 25 minutes)

| #   | Do this                                                                                          | Expect                                                                                                         | ID               | Claude ran it | Screenshot                                    |
| --- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------------- | ------------- | --------------------------------------------- |
| 1   | Templates: scroll the rows, press See all on Video Templates, pick the chip YouTube Shorts, then Back | Rows per category; a page with chips (each shows its size on hover); an empty chip says No templates yet; Back returns | LAY-040, TPL-014 | Y             | scratchpad `i2-Templates.png`, `i2-alltemplates.png` |
| 2   | Right-click the empty page › Save as template; name it, choose Education                         | A toast; it appears in My Templates and in Education; Ctrl+Z does not remove it                                | TPL-015          | Y (test)      | test-results (TPL-015)                        |
| 3   | Elements: open Shapes; add a dashed line and a double arrow; open Graphics                       | Lines, Basic shapes, Polygons, Stars, Arrows, Flowchart; Graphics shows Featured, Gradients, Backgrounds; Photos and others greyed with their wave | SHP-026, SHP-028 | Y             | scratchpad `i2-Elements.png`, `i2-shapes.png` |
| 4   | Text: Add a text box; drag Subheading onto the page; hover a title under Titles; click it        | A box in the middle; the subheading lands where dropped; the title previews its entrance and arrives with it   | TXT-038, TXT-039 | Y (test)      | scratchpad `i2-Text.png`                      |
| 5   | Transitions: look through the sections; try clicking one                                         | Posters in six sections; each greyed with Planned: Wave 6                                                      | TR-010           | Y             | scratchpad `i2-Transitions.png`               |
| 6   | Media: import an image, a video and a sound; switch tabs; sort by Name; make a folder and drag a card into it | Each tab filters; folders count and open; videos animate on hover                                              | MED-038          | Y (test)      | scratchpad `i2-media.png`                     |
| 7   | Export › Save frame to Media; open Media › Designs                                               | The frame is listed under Designs, not under Images                                                            | MED-038          | Y (test)      | test-results (MED-038)                        |
| 8   | Click Draw in the rail; use Shape (drag), Line (drag), Sticky note and Text (click); close the palette with X | The left panel folds while the palette is open; each placement is one undo step; the panel returns on close    | SHP-027          | Y             | scratchpad `i2-palette.png`, `i2-placed.png`  |
| 9   | Under the canvas: + › Duplicate current, + › Blank; drag the last card first; double-click to rename; right-click › Move right | Cards with pictures and lengths; the line shows where a card lands; every change is one undo step              | PRJ-023          | Y (test)      | scratchpad `i3-1600-dark.png`, `i3-1600-light.png` |
| 10  | Make the window narrower than 1024 px                                                            | The strip becomes a "Scene 1 of 3" button with a list                                                          | PRJ-023          | Y (test)      | scratchpad `i3-900-dark.png`                  |
| 11  | Click empty canvas, then a shape, the headline and the card group (right panel)                  | Tabs: Canvas (size, background, length); Shape (Color, Outline, Corners, Boolean); Text (font… spacing); Group (Ungroup, Align); greyed tabs name their wave | LAY-041 to LAY-044 | Y             | scratchpad `i4-none.png`, `i4-example-paper.png`, `i4-example-headline.png` |
| 12  | With the shape: Adjust colors › Transparency 50; open Position and size at the bottom of the first tab | The shape is half see-through; the other colour controls are greyed (Wave 6); the size fields show the box     | LAY-042          | Y (test)      | test-results (LAY-042)                        |
| 13  | Open the media example (nle-example): select the video; Audio tab: mute, then Detach audio       | Volume is greyed (Wave 7); mute and detach each are one undo step                                              | LAY-045          | Y (test)      | test-results (LAY-045)                        |

## 5. Deviations from the brief

- I1.2 "same for the right side": no toolbar button opens the right panel today, so there is nothing to reveal there. The right panel's rail and top-bar toggle are proven (D-137; backlog).
- I1.7 "Restore is [undoable]": Restore is the toast's button that reverses a Delete. It is not a history step, because Delete itself is not one (D-141).
- **I2 Media tabs.** An All tab was added before Images, Videos, Audio, Designs and Folders, so every import stays visible at once, as in H4 (D-145). The old Stock button had no function and was removed; stock stays planned (MED-028 to MED-033).
- **I2 Draw palette.** Weight and transparency are fields with sliders in the Draw flyout (the existing Draw panel, reused), not a separate popover (D-146).
- **I4 video Fade.** The brief lists it as disabled, but it already works (the W5-C fade preset), and AGENTS.md section 3 forbids removing working behaviour. It stays live. The audio clip's Fade is disabled (AUD-003, Wave 7) (D-148).
- **I4 Fade for text, shapes and images.** These lost their right-panel tab, as the brief's tab lists ask; their fades remain in the Animate panel.
- **I5 icons-1.** Not added: Lucide (ISC) icons are strokes, and the renderer has no stroked-path shape yet. The brief made icons optional (D-149, backlog).

## 6. Decisions made

- **I1:** D-136 (undo rules and `engine.library`), D-137 (panel animation and revealing a collapsed panel), D-138 (library drag type), D-139 (template insert modes and fit scaling), D-140 (canvas bar), D-141 (media menu and soft delete).
- **I2:** D-142 (browse panel and the Graphics move), D-143 (template taxonomy and sizes), D-144 (My Templates), D-145 (Media tabs), D-146 (Draw palette).
- **I3:** D-147 (scene strip).
- **I4:** D-148 (right panel per object).
- **I5:** D-149 (library content).
- **Follow-ups:** D-150 (exact snapped moves, e2e viewport height, folded Inspector in tests).

See `docs/DECISIONS.md`.

## 7. Not tested, known gaps, risks

### I1

- The 240 ms animation is checked at one sample point (60 to 120 ms after the click), not frame by frame. Smoothness on the reference machine was not measured.
- Reduced motion: the CSS sets the panel and crossfade durations to about 0 under `prefers-reduced-motion`; no e2e emulates it.
- Deleting media removes the stored files that every project in this browser shares (D-141, backlog).
- Library cards cannot be dropped on a timeline track (backlog).
- The media menu's flyout uses the shared menu; it was checked with the mouse, not with screen-reader software.

### I2 to I5

- **Thumbnails and posters.** Library previews, scene strip thumbnails and My Templates posters are drawn by the editor's renderer on a detached canvas and shown as images, so the page keeps one canvas. This was checked in the light and dark themes by screenshot, not by an automated contrast test.
- **Storage limits.** My Templates live in `localStorage` (about 5 MB in total). A large design can fail to save; it shows an error toast. Media above 50 MB is left out with a warning; that path was not run in e2e, because the fixtures are small.
- **Draw palette.** The keyboard reaches the palette (arrow keys move between tools); screen-reader announcements were not checked.
- **Browse panels.** Virtualisation renders 48 cards at a time. It was not measured with a large pack, since the largest section has 59 shapes.
- **Video hover previews.** They cycle the filmstrip; this was checked by eye only, with no automated test of the animation.
- **Right panel.** It uses the toolbar's own builders, so a bug in one shows in both. The right panel copies rename every id (D-148).
- **Viewports.** No horizontal scrollbar at the seven H-series viewports (1920×1080, 1440×900, 1366×768, 1280×720, 1024×768, 820×1180, 390×844) in both themes. This holds with the Templates, Elements, Text, Media, Transitions and Draw panels open and with a layer selected (probe script, not a committed test; the H2 shell test still covers the start state).

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
- Contracts: none changed. D-150 makes snapped moves land exactly on their guide, which D-066 already promises; the maths is unchanged otherwise.
- I2 to I5 files added:
  - `src/ui/browse-panel.ts`, `src/ui/my-templates.ts`, `src/ui/save-template.ts`, `src/ui/scene-poster.ts`;
  - `src/ui/draw-palette.ts`, `src/ui/scene-strip.ts`, `src/ui/right-panel/audio-tab.ts`;
  - `e2e/i2-browse.spec.ts`, `e2e/i3-strip.spec.ts`, `e2e/i4-right.spec.ts`, `e2e/i5-content.spec.ts`.
- `src/ui/right-panel.ts` was rewritten for I4.
- The library manifest (version 1) gained optional `templates`, `packs`, `section`, template `category` and `subcategory`, text `animation`, and the `transition` item type.
- The test hook's session snapshot gained `drawBrush` (read-only).
- Shape layers may hold `arrowStart` (double arrows), read defensively.

## 9. Ledger and backlog

- LCR I1, added: LAY-038, LAY-039, TPL-012, TPL-013, CV-057, HIS-008, MED-036 and MED-037. All are now Verified.
- HIS-007 moved from Todo to Verified.
- CV-052 and CV-054 reworded.
- `docs/BACKLOG_INBOX.md`: 4 lines from I1.
- LCR I2 to I5, added and Verified: LAY-040 to LAY-045, TPL-014, TPL-015, SHP-026, SHP-027, SHP-028, TXT-038, TXT-039, MED-038, TR-010, PRJ-023.
- Added as Todo, for planned controls: SHP-025 (Tables), TXT-037 (Dynamic text).
- `docs/BACKLOG_INBOX.md`: 6 more lines (I2 to I5).

## 10. Git

- Branch `claude/i-series`, PR #16 to `main` (marked ready for review after I5; not merged by Claude).
- No tag: the owner tags after acceptance (AGENTS.md section 8). The review patch is `git diff origin/main...claude/i-series`.
- CI: see the PR's checks after the final push.

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
| LAY-040 |                             |              |
| TPL-014 |                             |              |
| TPL-015 |                             |              |
| SHP-026 |                             |              |
| SHP-027 |                             |              |
| SHP-028 |                             |              |
| TXT-038 |                             |              |
| TXT-039 |                             |              |
| TR-010  |                             |              |
| MED-038 |                             |              |
| PRJ-023 |                             |              |
| LAY-041 |                             |              |
| LAY-042 |                             |              |
| LAY-043 |                             |              |
| LAY-044 |                             |              |
| LAY-045 |                             |              |
