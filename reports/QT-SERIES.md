# Report: QT-series, Q1 to Q5 fixes, T1 themes, T2 AI brief (2026-10-15)

## 1. Summary

- **Q1:** group clips carry their children in time, Ungroup works for normal groups, and a background group is one block.
- **Q2:** Animate › Creator is a single choice with None. The Controls panel says what is animated and has Remove animation, with no orphan controls. Delete removes only the clicked keyframe.
- **Q3:** keyframe diamonds are easier to see and click. Every layer has an Anchor, and Spin turns about it.
- **Q4:** an AI category groups imported items by kind, with AI chips. Pack checks run automatically and end in a result card.
- **Q5:** Settings › Animations (Auto, On, Off) controls panel transitions, whatever the system's reduce-motion setting says.
- **T1:** themes: 8 built-in, one-step apply, palette slots, My themes, and a `theme` kind in Creator Packs.
- **T2:** Copy AI brief.
- Schema is still 8. There are no new npm dependencies.

## 2. Scope and results (per part: done / not done)

| Part | Done | Not done |
| ---- | ---- | -------- |
| Q1 | Group clip move, trim and lengthen carry children (model, `SET_CLIP_TIMING`); e2e: layered background to 12 s still draws at 10 s. Ungroup bakes the transform, also for groups with own settings and clip presets. One toast on refusal. Background group: disabled with "Background is one block". | — |
| Q2 | None first; only the applied preset highlighted (Creator is exclusive). "Animating: Move - 0.0s to 1.0s, …" line. Remove animation (record, keyframes, controls, one step). Hand-deleted keyframes: Edited manually, or the controls go when nothing is left. A plain click selects only that keyframe, so Delete never takes a neighbour. | — |
| Q3 | Diamonds: 14 px glyph, 20 px target, outlined for both themes, hover and accent-filled selection. Anchor 9-point grid on every layer. Rotation and scale (fields, rotate handle, animation) turn about the pivot. Spin keeps a rectangle's centre fixed (e2e). | Groups have no box size, so their pivot is not applied. Without a chosen anchor, the Scale fields keep the old corner behaviour (to keep existing tests and documents unchanged). |
| Q4 | AI rail category grouped by kind; AI chips on AI and library cards; checks run on paste or pick; Add enabled once one item passed; result card with Open AI tab. | AI chip in the Media panel: packs add no media (data: assets only), so there is nothing to badge there (QT-013 Claimed). |
| Q5 | Every reduced-motion rule found (listed in section 7) now follows `data-motion`; Settings dialog with "System reduce-motion: yes/no"; unit test; e2e with reducedMotion "reduce" and On. | — |
| T1 | Theme panel (left rail and the right rail's Theme tab with nothing selected); 8 built-in themes with previews; one-step apply with Also override manual colors; palette slots (`paletteSlot`), set on AI items; My themes save, rename and delete (project markers and `theme/<id>` in My library); `theme` pack kind (schema, gate, docs, 2 valid and 1 bad example, `pack:check`); unit tests (apply, undo, slots); e2e Dark Neon apply, undo, redo. | Caption styles do not exist yet, so a theme's `caption` is only stored. |
| T2 | Copy AI brief in the main menu and the AI header; optional request; built from live registries (`src/ai-brief`, unit test: every kind, under 40 KB); clipboard fallback box; docs/AI-BRIEF.md. | — |

## 3. Checks

- `npm run verify`, run once at the end (Node 20, Chromium 141 sandbox fallback): **exit 1**.
  - Format, typecheck and build passed.
  - Unit and jsdom: **892 passed in 79 files**.
  - e2e: **480 passed, 2 failed** (40.6 min, one worker).
- The 2 failures:
  - **LAY-041** expected the empty right rail to hold one button; T1 adds the Theme tab there. I updated the test after the run (now 2 buttons) and it passes alone. It is test-only and was not re-run in a full verify.
  - **LAY-004** (panel divider drag limits) is a timing failure under the full run; it passes alone, unchanged.
- ANI-003 (blocks-gallery scrub) passed in this run.
- Ledger (run on its own): `Ledger: 734 items | Verified 415 | Claimed 18 | Todo 299 | Dropped 2` · `Ledger OK`.
- Targeted specs per part, all passing:
  - q1 ×2, q2 ×3, q3 ×1, q4 ×1, q5 ×1, t1 ×2, t2 ×1
  - The P-series specs updated for the new import flow

## 4. Try-it script for the owner (about 10 minutes)

| #   | Do this | Expect | ID |
| --- | ------- | ------ | -- |
| 1 | Elements › Graphics › a layered background; right-click its clip › Edit duration › 12 | The background still shows at 10 s | QT-001 |
| 2 | Text › a two-line title; Ctrl+Shift+G | It ungroups and nothing moves | QT-002 |
| 3 | Select the background; Ctrl+Shift+G three times | One toast: "Background is one block" | QT-002, QT-003 |
| 4 | Import a pack with two presets (for example Pulse and Spin); Animate › Creator; pick one, then the other | Only the last one is highlighted; None is first | QT-004 |
| 5 | Right rail › Controls | "Animating: Scale - 0.0s to 1.0s" (or the property you used) | QT-005 |
| 6 | Controls › Add animation › a second preset, then Remove animation on one | It and its keyframes go, in one undo step | QT-006 |
| 7 | 2D Animation: delete the preset's keyframes one by one | Edited manually, then the controls disappear | QT-007 |
| 8 | Make two keyframes close together; click one; Delete | Only that one goes | QT-008, QT-009 |
| 9 | Add a rectangle; Properties › Anchor; apply Spin | It turns about the centre; with Anchor top-left, about that corner | QT-010, QT-011 |
| 10 | Media › Import › Import creator pack; paste a pack | Checks run by themselves; Add selected; the result card opens AI | QT-014, QT-015, QT-012 |
| 11 | Main menu › Settings › Animations › On (on the PC without animations) | Panels slide again; the line shows System reduce-motion: yes | QT-016 |
| 12 | Left rail › Theme › Dark Neon; Ctrl+Z; Ctrl+Y | Colours, fonts and background change in one step, back and again | QT-017, QT-018 |
| 13 | Recolour one text by hand; apply another theme | That text keeps its colour unless Also override manual colors is ticked | QT-018, QT-019 |
| 14 | Theme › Save current as theme; rename it; delete it | Listed under My themes, then gone | QT-020 |
| 15 | Main menu › Copy AI brief; type a request; Copy; paste into Claude | One block: task, project, library, rules, REQUEST | QT-022 |

Claude ran every step through the e2e specs listed in section 2 (screenshots are in each test's output folder). Step 11 was run with emulated reduced motion, not on a real PC with Windows' animation effects turned off.

## 5. Deviations from the brief

- **Pivot:** the transform contract keeps the stored anchor at (0, 0). The pivot is therefore a `pivot` layer property, applied by moving the position, not a new anchor field (D-252).
- **Project themes:** the project has no free field, so they are reserved markers on the first scene (D-254). Deleting the first scene drops them.
- **Theme tab:** the right panel's Theme tab appears with nothing selected. With a selection, the left rail's Theme category gives the same panel.
- **First theme:** the first theme applied recolours all text. Later themes keep hand-coloured text unless Also override manual colors is ticked.

## 6. Decisions made

D-251 to D-255 in docs/DECISIONS.md.

## 7. Not tested, known gaps, risks

- **Every place that shortened or removed panel motion (Q5):**
  - The motion tokens in `src/ui/tokens.css`.
  - In `src/style.css`: the global animation clamp and skeleton, the scene crossfade, the browse panel slides, loading clips, Animate thumbnails, and the `.editor-shell`, `.inspector` and `#rail-right` transitions (`transition: none !important`).
  - The boot skeleton in `index.html`.
  - The scene crossfade's JS check in `src/ui/shell.ts`.
  - Not motion settings (left unchanged): `.editor-shell.resizing` and `.shell-booting`. They switch transitions off only while a panel is dragged or the shell lays itself out.
- **Q5 likely cause:** Windows' Settings › Accessibility › Visual effects › Animation effects off makes Chrome, Edge and Firefox all report reduced motion. I could not test this on Windows.
- **Browser:** real Chrome or Edge were not used; the sandbox has Chromium 141 (D-030).
- **Known flakes, not chased (owner instruction):** LAY-038 (timing) and ANI-003 (blocks-gallery scrub; also fails on the base branch).

## 8. Architecture and contract impact

- Schema: 8, unchanged. New layer string properties: `pivot` and `paletteSlot`. Reserved `aive:theme` markers.
- Creator Pack schema: new `theme` kind and `ITEM_KINDS`.
- New core helpers: `src/core/pivot.ts` and `isReservedMarker`.
- New files:
  - `src/themes/themes.ts` and `src/ai-brief/`
  - In `src/ui/`: `ai-panel.ts`, `theme-panel.ts` and `motion.ts`
  - Examples: `examples/creator-packs/theme-*.json` and `bad-theme-contrast.json`
  - Specs: `e2e/q1` to `q5`, `t1` and `t2`, and the unit tests
- Contracts touched: none. The rotation and scale contract is unchanged; the pivot is applied through the position.

## 9. Ledger and backlog

- LCR: QT section, QT-001 to QT-022. 21 are Verified and QT-013 is Claimed (no AI media in the Media panel).

## 10. Git

- Branch `claude/qt-series`, one draft PR to `claude/p-series`. One commit per part, then docs.

## Owner tick-list (owner fills this in and sends it to Claude)

| ID  | OK / BUG / MISSING / CHANGE | One sentence |
| --- | --------------------------- | ------------ |
|     |                             |              |
