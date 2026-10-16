# Report: R-ALL, hand-test fixes of PR #31 (2026-10-16)

## 1. Summary

- **R1:** Group and Ungroup are in the timeline menu; regrouping keeps the group's name; a toast says what happened.
- **R2:** one AI importer (AI › Import) for a code animation or a Creator Pack, with every controller editable before adding. The Media Import menu holds media only. AI items appear only in the AI category.
- **R3/R4:** Media and AI share one Clipchamp-style library panel: search with New folder, tabs only for what exists, big cards with "⋯" and "+", folders, real thumbnails and hover previews. Library changes are never undo steps.
- **R5:** a My Templates rail category; Save to My Templates by kind from the canvas and timeline menus, scenes and groups too.
- **R6:** Codex's theme library and thumbnail service are merged and wired: one My themes list, unique names, Rename and Delete in "⋯", toasts that count kept or overridden colours.
- **R7:** the Animations setting also covers the new panels.
- Schema is still 8; no new npm dependencies.

## 2. Scope and results (per part: done / not done)

| Part | Done | Not done |
| ---- | ---- | -------- |
| 1 Group / Ungroup | Timeline menu Group and Ungroup (registered commands, same as the canvas menu and shortcuts); name restored on regroup, else the first child's name; one success toast; one toast with the reason when refused. e2e: "Neon night title" (a two-part text group renamed so) by canvas menu, timeline menu and shortcut (RA-001 to RA-003). | The restored name is remembered for the session only (not after a reload; then the first child's name is used). |
| 2 One AI importer | `ai-import-dialog.ts`: paste or file, checks run on their own, per item pass / warning / rejected with reasons, controllers editable before adding (values become defaults), "Also add it to the scene" for a single code animation (Tier A: new scenes or this scene). Media Import menu: media only. Old import dialog kept only as Edit code; `creator-pack-dialog.ts` deleted. Old code templates move to AI › Motion once. AI items removed from Templates, Elements (Animations tile planned again), Text, Graphics and Animate (Creator tab). Every AI item deletable from AI (RA-004 to RA-007). | Copy library index for AI is removed with its menu entry (CP-013 Dropped); Copy AI brief replaces it. |
| 3 Shared panel | `library-shelf.ts`: title + collapse, search + New folder on one row, actions, chips (All, categories with items, folders), 2-column 16:9 cards, "⋯" = right-click menu, "+" adds once, hover/focus/touch visibility, aria-labels; no empty automatic tabs; library state outside Undo (RA-008 to RA-012). | Duplicate and Export of code templates are gone with the single menu (CODE-009 Dropped). |
| 4 Media and AI | Media and AI rebuilt on the shared panel; Media keeps import, drop zone, sort, details, folders (now chips) and soft delete; AI has Import + Copy AI brief and "⋯ › Delete" (RA-013). | Media type tabs appear only when that type exists (the dynamic rule), not always. |
| 5 My Templates | Rail category, save by kind from canvas and timeline menus, Group for several layers, scene save from the empty canvas and the strip, toast with Open, tabs from saved kinds, Add to scene like a library item, persistence in My library (RA-014 to RA-016). | — |
| 6 Themes | Merge of `origin/codex/theme-thumbs` (no conflicts; Codex's engine untouched); Theme panel wired to the theme library; thumbnails from the service (RA-017 to RA-019). | `markManualColor`: no UI call was needed, the core marks colour commands (API doc item 5). |
| 7 Animations setting | New e2e: Media, AI and My Templates follow On and Off (RA-020). | — |

## 3. Checks

- `npm run verify`, run once at the end (Node 22, Chromium 141 sandbox fallback): **exit 1**. Because `npm test` failed, the rest of the chain was run by hand right after (build, e2e, hook assertion, ledger).
  - Format: passed (after Prettier reformatted Codex's `docs/THUMBNAILS-API.md`). Typecheck: passed. Build: passed.
  - Unit and jsdom: **906 passed, 3 failed** (909 in 81 files). Failures: the shell rail list (fixed after the run: My Templates added; passes alone) and the two `tests/blocks/worker.test.ts` sandbox tests ("Sandbox unavailable"), which this branch does not touch.
  - e2e: **488 passed, 8 failed** (1.1 h, one worker), DEV-006 (the deliberate guard probe) among the 8.
- The 8 e2e failures:
  - **Fixed after the run, passing alone:** TL-001 (the menu now holds "Save to My Templates as a group" too; the test picks Group by its command), CP-004 (an AI chip was inside the thumbnail slot, which the thumbnail service replaces; it is now on the card), LAY-060 (the Media empty state's illustration is back in the shared panel).
  - **Fail on the base branch too** (checked in a worktree of `claude/qt-series`): TXT-040 (bundled weights) and CV-044 (text glyphs after a corner drag).
  - **Known flakes, not chased:** ANI-003, PB-010 (sandbox only). CODE-006 passed when run alone.
  - **DEV-006:** the guard probe fails by design.
- Hook assertion: `assert-no-test-hook: OK`. Ledger: `754 items | Verified 432 | Claimed 18 | Todo 299 | Dropped 5` · `Ledger OK`.
- Targeted specs per part, all passing: r1 ×2, r2 ×4, r3 ×5, r5 ×2, r6 ×2, q5 ×2, plus the updated P, Q, X, I and T specs.

## 4. Try-it script for the owner (about 10 minutes)

| # | Do this | Expect | ID |
| --- | ------- | ------ | -- |
| 1 | Text › "Headline and line"; rename it "Neon night title" in Scene; right-click its clip on the timeline | Group / Ungroup are in the menu; Ungroup shows "Ungrouped into 2 layers" | RA-001, RA-003 |
| 2 | Select both parts; Ctrl+G | The group is named "Neon night title" again; toast "Grouped 2 layers" | RA-002 |
| 3 | Elements › Graphics › a layered background; Ctrl+Shift+G twice | One toast "Background is one block" | RA-003 |
| 4 | Media › Import chevron | Only Import media | RA-006 |
| 5 | AI › Import; paste a code animation (pulse block) | Tier, thumbnail and all its controllers; change one; Add to AI | RA-004, RA-005 |
| 6 | AI › Import; paste a Creator Pack with several kinds | Each item pass / warning / rejected; after Add, AI shows a tab per kind | RA-004, RA-005 |
| 7 | Templates, Elements › Shapes, Text, Animate | No AI items or AI chips there | RA-007 |
| 8 | AI: hover a card, then use "⋯" and "+" | "⋯" opens Rename, Add to scene, Move to folder, Details, Delete; "+" adds once | RA-009 |
| 9 | AI: Move to folder › New folder…; delete the only Shape | A folder chip appears; the Shapes tab disappears | RA-010 |
| 10 | Import a pack; Ctrl+Z; then delete an AI item; Ctrl+Z | The item stays, then stays gone | RA-011 |
| 11 | Media: import a picture | Tabs All and Images only; drop zone, sort and folders still work | RA-013 |
| 12 | Right-click an element › Save to My Templates › Shape | Toast "Saved to My Templates › Shape" with Open; My Templates shows a Shape tab | RA-015, RA-016 |
| 13 | My Templates › "+" on the item; then rename it | A copy is placed (keyframes kept); renaming never changes the placed copy | RA-016 |
| 14 | Theme: apply a theme, make a text red by hand, apply another (unticked), then ticked | Red stays ("… manual colours kept."), then changes ("… overridden.") | RA-017 |
| 15 | Theme: type a built-in name; then "Studio blue", Save, Ctrl+Z ×3, "⋯ › Delete", Ctrl+Z | "Name already used"; saved once and still once after Undo; gone and still gone | RA-018, RA-019 |

Claude ran every step through the e2e specs r1 to r6 and q5 (screenshots in each test's output folder).

## 5. Deviations from the brief

- **Media tabs:** shown only for media types that exist, by the brief's dynamic-category rule (D-259).
- **Single code animation:** closes the dialog after Add like the old one; a pack ends in the result card. "Also add it to the scene" is on by default for a code animation.
- **Group names:** the original name is remembered for the session, not saved in the project (no schema field).
- **Dropped ledger items:** QT-004 (Animate › Creator removed), CP-013 (Copy library index removed), CODE-009 (template Duplicate and Export are not in the single item menu).

## 6. Decisions made

D-256 to D-262 in docs/DECISIONS.md.

## 7. Not tested, known gaps, risks

- Real Chrome or Edge were not used; the sandbox has Chromium 141 (D-030).
- Thumbnails from the service: the e2e checks that every card has a picture; the service's pixels are not compared.
- Poster of a saved element is drawn by the editor (the selection on a transparent canvas); a multi-scene save of media larger than 50 MB leaves media out with a toast (unchanged rule).
- Folders of AI and My Templates are kept in this browser's localStorage (`aive.folders.*`); they are not exported.
- Two unit tests in `tests/blocks/worker.test.ts` fail in this sandbox (the Node worker sandbox is unavailable); they are not touched by this branch.
- Known flakes (owner list, not chased): LAY-004, LAY-038, ANI-003.

## 8. Architecture and contract impact

- Schema: 8, unchanged. No new npm dependencies.
- New files: `src/ui/ai-import-dialog.ts`, `library-shelf.ts`, `library-thumb.ts`, `shelf-folders.ts`, `my-library.ts`, `my-templates-panel.ts`; e2e `r1` to `r6`. Removed: `src/ui/creator-pack-dialog.ts`, `e2e/p4-library-index.spec.ts`.
- Merged from Codex unchanged: `src/themes/library.ts`, `src/core/manual-color.ts`, `src/thumbnails/*` and their tests (only `docs/THUMBNAILS-API.md` was reformatted by Prettier).
- Contracts touched: none.

## 9. Ledger and backlog

- LCR: RA section, RA-001 to RA-020 (Verified). Dropped: QT-004, CP-013, CODE-009.

## 10. Git

- Branch `claude/r-all`, one draft PR to `claude/qt-series`. One commit per part, a merge of `origin/codex/theme-thumbs`, then docs.

## Owner tick-list (owner fills this in and sends it to Claude)

| ID  | OK / BUG / MISSING / CHANGE | One sentence |
| --- | --------------------------- | ------------ |
|     |                             |              |
