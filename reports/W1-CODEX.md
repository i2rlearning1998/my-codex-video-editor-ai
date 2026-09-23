# Report: W1-CODEX (2026-09-22)

## 1. Summary

Built and browser-tested English/Hindi switching, palette, global shortcuts and solid-color New Project. Temporary UI awaits Claude; transparency was deferred by the owner.
## 2. Scope and results

| IDs | Result | Evidence |
|---|---|---|
| LOC-001–006 | Verified within brief’s shell/module scope | tests/i18n.test.ts; e2e/i18n.spec.ts |
| KEY-001,002,003,005,006,007,008,009 | Verified | tests/commands.test.ts; e2e/commands.spec.ts; e2e/shortcuts.spec.ts |
| PRJ-001–005 | Verified | tests/new-project.test.ts; e2e/new-project.spec.ts |
| PRJ-006 | Solid color verified; full ledger item Claimed | e2e/new-project.spec.ts; transparent option not built by owner direction |
In-scope P0 Verified: 19 of 20; not done: PRJ-006 transparency (deferred); no built-but-untested in-scope logic.
## 3. Checks

`npm run verify`: exit 0; `All matched files use Prettier code style!`; typecheck exit 0; `Tests 287 passed (287)` / `Test Files 17 passed (17)` (146 unit in 12 files; 141 jsdom in 5 files).
Browser: Chrome 153.0.8010.52; `23 passed (17.0s)` means 19 normal passes + 4 expected failures (TL-004, TL-019, REL-001, intentional DEV-006 guard probe); zero unexpected/flaky/skipped.
`assert-no-test-hook: OK (no __AIVE__ in production build)`; `Ledger: 485 items | Verified 34 | Claimed 42 | Todo 406 | Bug 3`; `Ledger OK` (exit 0; intentional PRJ-006 partial-status warning).
Build: JS 186.23 kB / gzip 53.83 kB; CSS 18.07 / 4.66 kB. Node 24.19.0, npm 10.9.9; minimum remains Node 20.6 (not independently tested; D-021). CI not run; no remote.
## 4. Owner try-it script (all steps run by Codex via real Chrome automation)

1. LOC-002–004: click हिन्दी; Save changes language; reload retains Hindi; click English. Screenshot: test-results/i18n--LOC-002-LOC-003-LOC--020a0-switch-and-persisted-choice/hindi.png.
2. KEY-002: select Main headline, edit Position X, click Save, Ctrl+K, type “udo”, Enter; edit reverts. Screenshot: test-results/commands--KEY-002-fuzzy-pa-297e5--Undo-and-exposes-shortcuts/palette.png.
3. KEY-003,005–009: drag headline, Undo/Redo on canvas and after Save; Ctrl+S saves; Space plays/pauses, typing stays protected; Ctrl+/ lists commands; Esc cancels drag, closes palette, then deselects. Screenshots: test-results/shortcuts--KEY-003-regress-a7caa-s-and-after-a-top-bar-click/global-undo.png; test-results/shortcuts--KEY-008-shortcu-10a91--and-Save-from-the-registry/shortcuts.png; test-results/shortcuts--KEY-009-Escape--0564b-es-a-palette-then-deselects/escape.png.
4. PRJ-001–006: New project → name; custom 17×8000 rejects; select 9:16, 1080p, 30 fps, #abcdef; Create and confirm; Save/reload preserves a blank 1080×1920 project with fresh history. Screenshot: test-results/new-project--PRJ-001-PRJ-0-6634e-ect-with-a-solid-background/new-project.png.
## 5. Deviations

Owner removed transparency; ledger meanings correct the brief’s swapped KEY-006–009 examples and 19/20 count. Unit-only IDs follow Step 1/2 proof instructions. Final gate restarted after formatting, then two Escape checks failed; affected checks fixed before the successful full run. Existing jsdom Escape dispatch now originates at the canvas.
## 6. Decisions made

D-026–028: unstyled standalone DOM adapters pending Claude’s React shell; no i18n dependency; preset short side 720/1080/1440/2160, even long side; custom 16–7680; solid-color-only scope. Shell owns one document shortcut listener; isolated legacy mounts retain their keyboard adapters.
## 7. Not tested, known gaps, risks

Not tested: Edge, other OSs, screen readers, performance/4K media, CI, full legacy-panel Hindi coverage, production-browser missing-key warnings (unit-tested env guard). Legacy inspector/timeline text remains for shell integration. Existing TL-004/TL-019/REL-001 remain. Transparency is absent. Only New Project, typing and global navigation behavior named above were newly browser-proven.
## 8. Architecture and contract impact

Schema remains 4; no core, renderer, transform contracts, CSS/layout or dependency changes. Added i18n/, commands/, project/new-project.ts and standalone palette/sheet/form/overlay modules plus tests; small shell/main text wiring and keyboard adapter hooks; no files removed/moved.
## 9. Ledger and backlog

19 IDs changed to Verified; PRJ-006 to Claimed with solid-color evidence. No ledger text/LCR changes. One backlog line records deferred transparency.
## 10. Git

Branch wave-1-codex; base w0; end tag w1-codex. Review: reports/W1-CODEX.patch and reports/W1-CODEX.stat.txt. Final documentation/Escape integration commit is included in the tag.
Implementation log (`git log --oneline w0..HEAD` before final report commit): 5a88958 feat(project); 242998c fix(shortcuts); 7c4aa00 feat(commands); 9b37507 feat(i18n).
## Owner tick-list

For each ID in the results table, reply OK / BUG / MISSING / CHANGE and one sentence; PRJ-006 transparency remains deferred.
