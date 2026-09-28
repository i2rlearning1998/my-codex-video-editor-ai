# G-series progress (G1 to G5), branch `claude/g-series`

Brief: the owner's G-series command of 2026-09-28 (Step 0, working rules, G1 to G5, finish). One branch, one draft PR to `main`, resumable.
Resume rule: when the owner says "continue", read this file and pick up at the first item that is not `done`.

## Step 0 (done)

- PR #12 was retargeted to `main` and merged with a merge commit (`9598be8`). GitHub marked PR #3 as merged.
- PRs #4 to #11 were closed: none had commits missing from `main`.
- `main`'s CI (Verify) passed on `9598be8`.

## Checklist

| Part | Item                                                                        | Status | Last commit                                             |
| ---- | --------------------------------------------------------------------------- | ------ | ------------------------------------------------------- |
| G1.7 | Rail categories show only their own panel (reload bug)                      | done   | see `git log`                                           |
| G1.1 | NumberField (scrub, type, arrows, units, clamp, chevron popover) everywhere | done   | see `git log`                                           |
| G1.2 | Slider, custom Select, Colour picker                                        | done   | see `git log`                                           |
| G1.3 | Menus: hover submenus, keyboard, no scrollbar, no timeline-only items       | done   | see `git log`                                           |
| G1.4 | Hover, pressed and focus states; themed scrollbars                          | done   | see `git log`                                           |
| G1.5 | Deep panels in the left side panel; anchored popovers                       | done   | see `git log`                                           |
| G1.6 | Stroke caps and joins render and export                                     | done   | see `git log`                                           |
| G1   | Full `npm run verify`, draft PR opened                                      | done   | verify green: 357 unit, 152 e2e + DEV-006 probe         |
| G2   | Transform correctness                                                       | done   | see `git log` (G2 commits)                              |
| G3   | Viewport and canvas                                                         | done   | see `git log` (G3 commits)                              |
| G4   | Draw rebuilt                                                                | done   | see `git log` (G4 commit)                               |
| G5   | Scenes board                                                                | done   | see `git log` (G5 commit)                               |
| End  | Full verify, report, PR ready                                               | done   | verify green: 373 unit, 178 e2e + DEV-006; PR #13 ready |

## Decisions (D-100 onward)

D-100 shared controls; D-101 left side panels; D-102 menus; D-103 rail categories; D-104 Inspector units and clamping; D-105 size and position fields; D-106 handles per type (contract r7); D-107 Ungroup verified, click in a multi-selection; D-108 canvas view; D-109 scene bar; D-110 scene commands; D-111 Draw rebuilt (supersedes D-079); D-112 scenes board.

## Resume notes

- G1 full verify green: 357 unit tests, 152 e2e passes plus the expected DEV-006 probe.
- G2 done: full e2e 165 passed plus DEV-006; report sections G1 and G2 written in `reports/G-SERIES.md`.
- G3 done (report section written).
- G4 done: 369 unit tests; full e2e 172 passed plus DEV-006. One run had EXP-001 read one exported frame as the previous one; it passed on a re-run (9 of 9, sandbox load; recorded in the report). D-105 to D-107 were missing from DECISIONS (an earlier write never ran) and are added now.
- G5 done: 5 e2e and 8 unit scene tests pass.
- Finished: full verify green, report complete, PR #13 marked ready (not merged). Waiting for the owner's test and "merge it".
