# FX library — resumable checklist

Branch codex/fx-library from main 9362645. One PR to main, never merge; do not touch PR #14.

| Part | Status                                                                                      | Last commit                                 |
| ---- | ------------------------------------------------------------------------------------------- | ------------------------------------------- |
| F0   | Done; npm run check passed                                                                  | 38f9f35                                     |
| F1   | Done; check passed, 398 tests                                                               | d44f421                                     |
| F2   | Done; npm run check passed, 447 tests                                                       | 8f7d1f3                                     |
| F3   | Done; check passed, 469 tests                                                               | 6dbe560                                     |
| F4   | Done; check passed, 496 tests; PR #19 ready at this push                                    | ffa0428                                     |
| F5   | Done; 28 effects, 47 filters, 21 transitions; check passed, 621 tests; timing gaps reported | This checkpoint: git log -1 -- briefs/FX.md |

Scope: src/fx, tests/fx, fx-gallery, docs/FX-LIBRARY.md; one package.json script; this explicitly requested progress file. No app wiring/schema/UI/renderer/e2e edits. Run npm run check after each part, never Playwright. Decisions and final item/performance/integration report live in docs/FX-LIBRARY.md. Read rules and this checklist on resume. Publish every part, preserve one branch/PR, no force push.

PR #19 is ready and unmerged. F0–F5 complete within documented quality/performance limits. Final gate: npm run check (621 tests / 44 files); gallery build; all 101 definitions main/Worker byte parity. No Playwright run, no app wiring, no PR #14 edits. Resume only owner-reported FX fixes; integration is a future Claude task.
