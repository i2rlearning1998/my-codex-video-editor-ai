# Report: S1, Clipchamp-level panels and menus (2026-10-17)

## 1. Summary

- **Part 1:** every left and right panel has one header: the title and one drawer button. The "<" arrows and "×" crosses in panel headers are gone.
- **Part 2:** Media, AI and My Templates share one Clipchamp-style layout. Rows line up edge to edge, cards sit in two equal columns at least 165 px wide, and "⋯" and "+" are clearly visible inside the thumbnail. Media always shows its Images, Videos and Audio chips. AI cards no longer have the AI bar, and preset cards now show a real thumbnail.
- **Part 3:** AI and My Templates cards drag to the canvas and the timeline, the same way Media and the other libraries do.
- **Part 4:** all context menus now use one placement rule, so they always fit inside the window. The code-layer, canvas and timeline menus are short, with submenus. "Save as template" is removed. Save to My Templates lists every kind. Code animations in AI and My Templates have Duplicate and Export again.
- **Part 5:** new colours use the accent tokens; there are no purple literals in the changed files.
- Schema is still 8. There are no new npm dependencies.

## 2. Scope and results (per part: done / not done)

| Part | Done | Not done |
| ---- | ---- | -------- |
| 1 One panel header | `panel-header.ts`. Every left-rail panel (Templates, Elements, Text, Media, Scene, Record & create, Audio, AI, My Templates, Theme) and the right panel use one header: the title and exactly one drawer button, which collapses the panel. The shelf chevron, the browse panels' Close and root title, the Scene title and the Theme title are removed (S1-001). | Draw has no panel: it opens the Draw palette, as before, so it has no header. A browse panel's drilled page (for example Elements › Shapes) keeps its Back row under the header, because that is navigation, not a second collapse button. |
| 2 Shared layout | From 1800 px windows every left panel is 380 px. Media, AI and My Templates have 16 px padding, a 40 px search with a 40 × 40 New folder 8 px after it, Media's 44 px Import split button with its chevron and its 56 px drop zone, a right-aligned Sort, AI's two equal buttons, then the chips. Cards are 168 px at 1920 × 1080, in two columns with a 12 px gap; each has a 16:9 thumbnail and a 14 px name. "⋯" is dark and "+" is the accent colour; both are 32 px, 8 px inside the thumbnail, and show on hover, focus and touch. Media's chips are fixed. AI has no AI bar, and its chip row shows once it has items. The preset thumbnail is fixed. The old per-panel grid CSS is deleted (S1-002 to S1-004). | Templates, Elements and Text keep their content layout, as the brief asks; only their header and width changed. |
| 3 Drag and drop | A shared card drag sends one payload (`creator` for AI items, `saved` for My Templates items). A canvas drop centres the item on the drop point. A timeline drop places a clip at the drop time and lane; a several-layer item or a scene is added whole. An AI preset dropped on the canvas animates the element under the drop point. Each drop is one undo step. Media drags through the same card code (S1-005). | Timeline drops of AI and My Templates items are tested on a text-and-shapes lane. Media's timeline drops stay covered by MED-039 and MED-041. |
| 4 Menus | One placement for every context menu (`placeMenuAt`, `placeSubmenu`): fixed to the window, flipped and clamped, 240 to 260 px wide, 32 px rows, scrolling inside when taller than the window. Submenus nest, also in the timeline. Code-layer menus have at most 14 top-level rows; the full regrouping is listed in D-266. Save to My Templates lists Shape, Text, Background, Animation, Video, Image, Annotation, Sticker, plus Group for a group, and Scene. The missing "Annotation" was really a row hidden behind the timeline ruler; the canvas menu now lives outside the stage. "Save as template" and its code are removed. Duplicate and Export are back on AI and My Templates code-animation cards; Export round-trips through AI › Import. The code layer's menu gains Export and Duplicate as copy (S1-006 to S1-008). | Duplicate and Export appear only on code animations, as the brief asks, not on shapes or scenes. |
| 5 Accent tokens | The new rules use `--accent`, `--accent-fill`, `--accent-fill-hover` and neutral overlay tokens (`--card-overlay*`). A diff scan finds no hex or `rgb()` literals in the changed source. | `--accent-contrast` does not exist yet; `--text-on-accent` is the current token for text on the accent. |

## 3. Checks

- `npm run verify`, run once at the end (Node 22, Chromium 141 sandbox fallback): **exit 1**. It stopped at `npm test`, so I ran the rest of the chain by hand right after: build, e2e, hook assertion and ledger.
  - Format: passed. Typecheck: passed. Build: passed.
  - Unit and jsdom: **906 passed, 3 failed** (909 tests in 81 files):
    - the two `tests/blocks/worker.test.ts` sandbox tests ("Sandbox unavailable"), as on R-ALL;
    - Codex's `tests/thumbnails/service.test.ts` "samples distinct hover times". It is flaky: run four times alone it failed once, and it does not touch the preset fix.
  - e2e: **498 passed, 6 failed** (46.6 min, one worker).
- The 6 e2e failures:
  - **Fixed after the run, passing alone:**
    - LYR-018: the Scene outliner menu could flip over its row after the new placement; it now opens below or above the row, and the test checks the new 240 to 260 px width.
    - RA-018/RA-019: the test's toast-closing helper waited its full timeout on a toast that was already leaving. It now waits 1 s, and passes 3 of 3 runs.
  - **Passed when run alone:** TL-096 (timeline edge drag, a timing flake).
  - **Owner's known flakes, not chased:** LAY-004.
  - **Failing before this branch, not chased:** TXT-040, CV-044.
- Hook assertion: `assert-no-test-hook: OK`. Ledger: `762 items | Verified 440 | Claimed 18 | Todo 299 | Dropped 5`, Ledger OK. On the full run's report it flagged RA-018/RA-019, fixed above.
- Targeted specs per part, all passing: `s1-ui` ×8, plus the updated R, P, Q, J, T, V, H, I specs and the menu regression set (145 tests).

## 4. Screenshots (reports/s1-ui/, 1920 × 1080)

- `before-*.png`: each left panel before Part 1. Media, AI and My Templates have the "<" chevron and the drawer; Templates has the ×.
- `p1-*.png`: after Part 1. One header per panel.
- `p2-Media.png`, `p2-AI.png`, `p2-MyTemplates.png`: after Part 2, with an item hovered. Compare with target image (A).
- `p4-timeline-menu.png`, `p4-timeline-code.png`: a code clip's timeline menu (13 rows) and its Code animation submenu.
- `p4-canvas-save.png`: the code layer's canvas menu with Save to My Templates open; every kind is visible.

Visual rounds: Part 1 needed one round. Part 2 needed three rounds: first the badge overlapped "⋯", then the badge overlapped the name, then it sat inside the thumbnail. Part 4 needed two rounds: the first found the ruler covering a flyout row and the menu jumping to the top.

## 5. Try-it script for the owner (about 10 minutes, 1920 × 1080)

| # | Do this | Expect | ID |
| --- | ------- | ------ | -- |
| 1 | Click through Templates, Media, Scene, AI, My Templates and Theme on the left rail | Each panel shows its title and one drawer icon top-right, never "<" or "×"; the drawer icon collapses the panel; the canvas never jumps between panels | S1-001, S1-002 |
| 2 | Media with nothing imported | Search with New folder on one row, a wide Import button with a chevron, the drop zone and Sort, all on the same edges; chips All, Images, Videos, Audio | S1-002, S1-004 |
| 3 | Import a picture; hover its card | A big card (two per row); "⋯" top-right on a dark square, a purple "+" bottom-right, both inside the picture | S1-003 |
| 4 | Click "⋯", then click "+" | "⋯" opens the menu without adding; "+" adds the picture once | S1-003 |
| 5 | AI › Import a Creator Pack with a shape and a preset | A chip row (All, Shapes, Presets); no purple AI bar; the preset card shows a square, the same size as the others | S1-004 |
| 6 | Drag the AI shape onto the canvas, then onto empty time on a lane | It lands centred where you dropped it; on the timeline its clip starts where you dropped it | S1-005 |
| 7 | Save something to My Templates, then drag it onto the canvas and the timeline | Same as step 6 | S1-005 |
| 8 | Import a code animation with "Also add it to the scene"; right-click its clip on the timeline | A short menu (about 13 rows) with Code animation, Save to My Templates, Clip and Track submenus; no "Save as template" | S1-006, S1-007 |
| 9 | Right-click near the canvas's bottom-right and near the timeline's bottom | The whole menu stays on screen, including every submenu | S1-006 |
| 10 | Right-click the code layer on the canvas › Save to My Templates | Shape, Text, Background, Animation, Video, Image, Annotation, Sticker and Scene, with no gaps | S1-007 |
| 11 | AI › "⋯" on the code animation › Duplicate, twice | "Pulse copy", then "Pulse copy 2" | S1-008 |
| 12 | "⋯" › Export, then AI › Import and choose the downloaded file | The importer accepts it again | S1-008 |

Claude ran every step through `e2e/s1-ui.spec.ts`, S1-001 to S1-008.

## 6. Deviations from the brief

- **Panel width:** 380 px only from 1800 px windows. Narrower windows keep their earlier widths, so the e2e default viewport (1600 px) and every pixel-measuring test are unchanged. At 1600 px the cards are 138 px; the brief sets the 165 px minimum at 1920.
- **Save to My Templates for several layers:** Group and Scene only, because the single-layer kinds do not apply to several layers.
- **Export format:** a code animation exports its source (`.js` for Tier B and C, `.json` for a Composition Spec), which AI › Import reads directly. Edited control values are not in the file, so the import starts from the code's defaults.
- **Thumbnail service:** a one-line fix in Codex's `src/thumbnails/render.ts`. Preset position tracks are offsets, not absolute positions (D-239). Its unit test was updated to match.

## 7. Decisions made

D-263 to D-266 in docs/DECISIONS.md.

## 8. Not tested, known gaps, risks

- Real Chrome or Edge were not used; the sandbox has Chromium 141 (D-030).
- Touch: "always visible on touch" is a `(hover: none)` CSS rule; no touch device was used.
- Timeline drops of AI items are tested on a text-and-shapes lane only.
- Duplicate as copy is tested through the timeline menu; the canvas entry runs the same hook.
- The first-level submenu placement is tested near the window edges; a second-level submenu is tested in the middle of the window only.
- Known flakes, not chased: LAY-004, LAY-038, ANI-003, PB-010. Failing before this branch: TXT-040, CV-044.

## 9. Architecture and contract impact

- Schema: 8, unchanged. No new npm dependencies.
- New file: `src/ui/panel-header.ts`. New e2e: `e2e/s1-ui.spec.ts`. New fixture helpers: `openSubmenus`, `revealEntry`.
- Removed: the `code-save-template` command and its hook, the Edit code dialog's "Save as template" checkbox, the shelf's own title row, and the old per-panel media, AI and library-tab CSS.
- Contracts touched: none.

## 10. Ledger and backlog

- LCR: new S1 section, S1-001 to S1-008 (Verified).
- Updated tests now state the new menu layout: TL-075, CP-001, CP-002, CV-056, CV-058 to CV-060, CV-039, LAY-030, LAY-058, VID-015, VID-016, QT-001, HIS-002, CV-040, RA-008, RA-013, RA-015, TPL-014, CP-004, QT-014, plus the menu helpers in TL-027, TL-032, AUD-018, VID-006, TL-047, VID-010 and VID-011. Each still checks the same behaviour, now one submenu deeper.

## 11. Git

- Branch `claude/s1-ui-fix`, one draft PR to `claude/r-all`. One commit per part, then docs.

## Owner tick-list (owner fills this in and sends it to Claude)

| ID  | OK / BUG / MISSING / CHANGE | One sentence |
| --- | --------------------------- | ------------ |
|     |                             |              |
