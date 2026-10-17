# Report: B1, Styles and the AI video brief (2026-10-17)

## 1. Summary

- **Part 1:** Creator Packs have a new kind, `style`: a reusable creative direction for the AI creator. Three example styles (Documentary, YouTube intro, Logo reveal 2D) and one rejected example. AI › Styles shows each style as a card with its colours, a category icon and its name.
- **Part 2:** AI › **New AI video** opens a large brief form. Whatever the user fills becomes a hard requirement (LOCKED); whatever is left empty is listed once as FREE for the AI to decide. Only file names are kept, with a "files to attach" line.
- **Part 3:** Copy brief (and Copy AI brief, when the form is used) produces one block under 60 KB: task header, BRIEF, STYLE, project facts, library ids, rules. With the form empty, Copy AI brief is unchanged. Save as My brief lists the form under AI › Briefs; its "+" reopens it prefilled.
- **Part 4:** docs/STYLES.md and docs/BRIEF-FORM.md, listed in docs/CREATOR-PACK.md.
- Schema is still 8. No new npm dependencies.

## 2. Scope and results

| Part | Done | Not done |
| ---- | ---- | -------- |
| 1 Style kind | Schema (`styleDataSchema`), quality gate (kit ids must exist or be optional; no URLs; length limits; AI assets last), `pack:check` with the FX catalog, docs with a worked example, 3 valid + 1 bad example with `expected.json` entries, AI › Styles cards, "⋯" (Rename, Use this style, Duplicate, Export, Move to folder, Details, Delete), "+" = Use this style; never placed (B1-001). | A style's own `thumbnail` is validated and kept but the card always draws the generated one. |
| 2 Brief form | New AI video button (wide, above Import and Copy AI brief); a two-column dialog (one column under 860 px) with a scrolling body and a sticky footer (file list, locked/free count, Save as My brief, Copy brief); sections A to G as the brief lists; style cards with "No style - you decide"; soft hints only (B1-002). | "Choose" fills in file names only, as asked; the files are never read. AI voice is labelled "(later)". |
| 3 Brief output and My briefs | `src/ai-brief/form.ts` (LOCKED/FREE, files text) and the creator block in `buildAiBrief`, 60 KB budget with deterministic shortening (labels dropped, then lists halved, noted in the header); My briefs in the media store at `brief/<id>`; AI › Briefs with the shared "⋯"; "+" reopens prefilled (B1-003). Unit tests: LOCKED/FREE split, empty form = old output, size budget, snapshot, file list. | No stock providers exist in the editor, so the library index says "none installed". |
| 4 Docs | docs/STYLES.md, docs/BRIEF-FORM.md, the docs list in docs/CREATOR-PACK.md, a note in docs/AI-BRIEF.md. | — |

## 3. Checks

- `npm run verify`, run once at the end (Chromium 141 sandbox fallback): **exit 1**. It stopped at `npm test`, so build, e2e, the hook assertion and the ledger check were run by hand right after.
  - Format: passed. Typecheck: passed. Build: passed.
  - Unit and jsdom: **920 passed, 3 failed** (923 tests in 83 files). The failures are the same 3 as on S1:
    - the two `tests/blocks/worker.test.ts` tests ("Sandbox unavailable" in this sandbox);
    - the flaky `tests/thumbnails/service.test.ts` "samples distinct hover times".
  - e2e: **506 passed, 2 failed** (53.9 min). Both were failing before this branch, so they were not chased:
    - TXT-040 (`j5-weights.spec.ts`);
    - the `[CV-044][CV-045]` text corner drag test (`transform-g2.spec.ts:168`). It still fails when run alone (scale factor 1.136 against the expected 1.070).
- Hook assertion: `assert-no-test-hook: OK`.
- Ledger: `765 items | Verified 443 | Claimed 18 | Todo 299 | Dropped 5`. It reports 3 errors, one each for CV-044, CV-045 and TXT-040, the two failing tests above.
- Targeted runs during the work, all passing:
  - `b1-styles` ×4, plus `s1-ui`, `t2-ai-brief`, `r2-ai-import`, `r3-shelf`, `q4-ai-import` and `p2-creator-pack` (23 tests);
  - the unit tests `tests/b1-brief.test.ts`, `tests/t2-ai-brief.test.ts` and `tests/creator-pack` (94 tests).

## 4. Try-it script for the owner (about 10 minutes)

| # | Do this | Expect | ID |
| --- | ------- | ------ | -- |
| 1 | AI › Import, paste `examples/creator-packs/style-documentary.json` | It passes the checks and shows under a Styles tab as a card with three colour swatches, an icon and its name | B1-001 |
| 2 | Import `bad-style-kit.json` | Rejected: "Unknown kit preset boing-boing" | B1-001 |
| 3 | Click "⋯" on the style card | Rename, Use this style, Duplicate, Export, Move to folder, Details, Delete | B1-001 |
| 4 | "⋯" › Export, then AI › Import the downloaded file | It is accepted again | B1-001 |
| 5 | Click "+" on the style | New AI video opens with that style highlighted; nothing is added to the canvas | B1-003 |
| 6 | Type a topic, tick Script, type two lines, keep "Use exactly" | The footer count of locked fields goes up | B1-002 |
| 7 | Type `logo.png` in Logo | The footer says "Attach these files in the Claude chat: logo.png (logo)." | B1-002 |
| 8 | Copy brief, paste into a text editor | Starts "You are the creator…"; LOCKED has the style, topic and script; FREE lists the empty fields once, without topic or script; then STYLE, PROJECT, LIBRARY, RULES | B1-002 |
| 9 | Save as My brief, name it | A toast "Saved to AI › Briefs"; a Briefs tab shows the card | B1-003 |
| 10 | Close the form; click "+" on the brief card | The form reopens with the same topic, script and style | B1-003 |
| 11 | Close it; Copy AI brief with the box empty | The same brief as before B1 (no BRIEF section) | B1-002 |
| 12 | Make the window narrow (under 860 px) and open New AI video | One column; Copy brief stays visible at the bottom | B1-002 |

Claude ran steps 1 to 10 through `e2e/b1-styles.spec.ts` (B1-001 to B1-003); step 11 is the `tests/b1-brief.test.ts` "empty form" test; step 12 is screenshot `p2-form-narrow.png`.

## 5. Deviations from the brief

- **Freedom default:** when no card is clicked the Guided card shows as the default, but the brief lists Freedom under FREE ("default Guided"), because the user did not fill it.
- **Lock chips and AI asset counts** add a LOCKED line only when set; at 0 they fall under the always-present asset rule.
- **Export of a brief:** the brief text as `.brief.txt`, not a JSON file, because the text is what goes to Claude.

## 6. Decisions made

D-267 and D-268 in docs/DECISIONS.md.

## 7. Not tested, known gaps, risks

- Real Chrome or Edge were not used; the sandbox has Chromium 141 (D-030).
- The clipboard fallback (blocked clipboard) of the new form is not tested; it reuses the old dialog's fallback text.
- Brand colour pickers, reference file "Choose" buttons and the music file row are covered by screenshots only, not by e2e assertions.
- Briefs' Rename, Duplicate, Export, Details and Delete use the shared menu; only Open (+) is tested end to end.
- Hindi strings for the form are machine-plain and unchecked by a Hindi reader.
- Known flakes, not chased: LAY-004, LAY-038, ANI-003, PB-010. Failing before this branch: TXT-040, CV-044.

## 8. Architecture and contract impact

- Schema: 8, unchanged. Creator Pack schema: one new kind, `style`. No new npm dependencies.
- New files: `src/creator-pack/style.ts`, `src/ai-brief/form.ts`, `src/ui/brief-dialog.ts`, `src/ui/brief-library.ts`, `src/ui/style-card.ts`, `tests/creator-pack/style.test.ts`, `tests/b1-brief.test.ts`, `e2e/b1-styles.spec.ts`, docs/STYLES.md, docs/BRIEF-FORM.md, four example packs.
- Contracts touched: none.

## 9. Ledger and backlog

- LCR: new B1 section, B1-001 to B1-003 (Verified).
- Backlog: show a style's own `thumbnail` on its card; a real stock provider for the library index.

## 10. Git

- Branch `claude/b1-styles-brief`, one draft PR to `claude/s1-ui-fix`. Commits: Part 1, Parts 2 and 3 (one commit: the form and its output cannot be split cleanly), docs.

## Screenshots (reports/b1-ui/, 1920 × 1080 unless noted)

- `p1-styles.png`: AI › Styles with the three example styles.
- `p2-ai-header.png`: the AI header with New AI video above Import and Copy AI brief.
- `p2-form.png`, `p2-form-bottom.png`: the form, top and bottom, with a style, topic, script and logo filled.
- `p2-freedom.png`: the Freedom cards (round 2, after the text overflow fix).
- `p2-form-narrow.png`: 760 × 900, one column.

Visual rounds: Part 1 one round; Part 2 two rounds (round 1 found the Freedom card text overflowing).

## Owner tick-list (owner fills this in and sends it to Claude)

| ID  | OK / BUG / MISSING / CHANGE | One sentence |
| --- | --------------------------- | ------------ |
|     |                             |              |
