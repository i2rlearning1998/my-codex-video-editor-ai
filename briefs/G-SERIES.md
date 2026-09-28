# G-series progress (G1 to G5), branch `claude/g-series`

Brief: the owner's G-series command of 2026-09-28 (Step 0, working rules, G1 to G5, finish). One branch, one draft PR to `main`, resumable.
Resume rule: when the owner says "continue", read this file and pick up at the first item that is not `done`.

## Step 0 (done)

- PR #12 was retargeted to `main` and merged with a merge commit (`9598be8`). GitHub marked PR #3 as merged.
- PRs #4 to #11 were closed: none had commits missing from `main`.
- `main`'s CI (Verify) passed on `9598be8`.

## Checklist

| Part | Item                                                                        | Status | Last commit   |
| ---- | --------------------------------------------------------------------------- | ------ | ------------- |
| G1.7 | Rail categories show only their own panel (reload bug)                      | done   | see `git log` |
| G1.1 | NumberField (scrub, type, arrows, units, clamp, chevron popover) everywhere | done   | see `git log` |
| G1.2 | Slider, custom Select, Colour picker                                        | done   | see `git log` |
| G1.3 | Menus: hover submenus, keyboard, no scrollbar, no timeline-only items       | done   | see `git log` |
| G1.4 | Hover, pressed and focus states; themed scrollbars                          | done   | see `git log` |
| G1.5 | Deep panels in the left side panel; anchored popovers                       | done   | see `git log` |
| G1.6 | Stroke caps and joins render and export                                     | done   | see `git log` |
| G1   | Full `npm run verify`, draft PR opened                                      | in progress | uncommitted: CV-040 and guides-align Escape waits (test timing only) |
| G2   | Transform correctness                                                       | todo   |               |
| G3   | Viewport and canvas                                                         | todo   |               |
| G4   | Draw rebuilt                                                                | todo   |               |
| G5   | Scenes board                                                                | todo   |               |
| End  | Full verify, report, PR ready                                               | todo   |               |

## Decisions (D-100 onward)

D-100 shared controls; D-101 left side panels; D-102 menus; D-103 rail categories; D-104 Inspector units and clamping.

## Resume notes

- Last full verify (G1): 357 unit tests passed; 151 e2e passed. The only unexpected failure was CV-040 (the second Escape was pressed before the More menu had closed). The test now waits for the menu to close. Next: re-run `e2e/selection-w2f.spec.ts` and `e2e/guides-align.spec.ts`, then the full verify, commit, push, and open the draft PR.
- G2 start: the draft `layerTransformCapabilities` (groups corners only; drawings no edges; lines and arrows end handles only) is to be wired into `src/render/selection.ts:98` and `src/ui/transform-interaction.ts:233`.
