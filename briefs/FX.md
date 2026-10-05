# FX library — resumable checklist

Branch codex/fx-library from main 9362645. One PR to main, never merge; do not touch PR #14.

| Part | Status                                                   | Last commit                                 |
| ---- | -------------------------------------------------------- | ------------------------------------------- |
| F0   | Done; npm run check passed                               | This checkpoint: git log -1 -- briefs/FX.md |
| F1   | Done; check passed, 398 tests                            | This checkpoint: git log -1 -- briefs/FX.md |
| F2   | Done; npm run check passed, 447 tests                    | This checkpoint: git log -1 -- briefs/FX.md |
| F3   | Done; check passed, 469 tests                            | This checkpoint: git log -1 -- briefs/FX.md |
| F4   | Done; check passed, 496 tests; PR #19 ready at this push | This checkpoint: git log -1 -- briefs/FX.md |
| F5   | Pending after F1–F4 green                                | —                                           |

Scope: src/fx, tests/fx, fx-gallery, docs/FX-LIBRARY.md; one package.json script; this explicitly requested progress file. No app wiring/schema/UI/renderer/e2e edits. Run npm run check after each part, never Playwright. Decisions and final item/performance/integration report live in docs/FX-LIBRARY.md. Read rules and this checklist on resume. Publish every part, preserve one branch/PR, no force push.
