# H-series progress (H1 to H6), branch `claude/h-series`

Brief: the owner's H-series command of 2026-09-30 (Step 0, working rules, H1 to H6, finish). One branch, one draft PR to `main`, resumable.
Resume rule: when the owner says "continue", read this file and pick up at the first item that is not `done`.

## Step 0 (done)

- `main` contains PR #13 (merge commit `fc72fdb`); `main`'s CI (Verify, run 77) passed on it.
- PR #14 (Codex, `codex/w7-audio`) is not merged: `src/audio/*`, the export mixdown and `sound-panel.ts` are not touched here.
- Branch `claude/h-series` was created from `main`.

## Checklist

| Part | Item                                                                                             | Status | Last commit   |
| ---- | ------------------------------------------------------------------------------------------------ | ------ | ------------- |
| H1.1 | Drag-select box painted (root cause: no CSS), rotated boxes hit exactly                          | done   | `8624b66`     |
| H1.2 | Rotated resizing: no snap jump, cluster never covers a handle, size and angle chips, contract r8 | done   | `50239af`     |
| H1.3 | Audio layers never drawn or picked on the canvas                                                 | done   | see `git log` |
| H1.4 | Wheel and pan clamp, 10% minimum zoom                                                            | done   | see `git log` |
| H1.5 | One open state per side panel                                                                    | done   | `e3ef42c`     |
| H1   | Draft PR opened                                                                                  | done   | see PR        |
| H2   | Design system, shell, responsive, themes; full verify (381 unit, 210 e2e, PB-010 sandbox flake)  | done   | `5afe627`     |
| H3   | Canvas toolbar, tool panels, menus, canvas size, export dialog                                   | done   | see `git log` |
| H4   | Right panel (Clipchamp) and mode toggle                                                          | done   | see `git log` |
| H5   | Library system and Starter Pack 1, gradient fill                                                 | done   | see `git log` |
| H6   | Signatures; image border and corners if not done                                                 | todo   |               |
| End  | Fetch main (PR #14?), full verify, report, PR ready                                              | todo   |               |

## Decisions (D-114 onward)

D-114 drag-select box; D-115 rotated resizing (contract r8); D-116 audio layers; D-117 wheel and pan; D-118 side panel state and H1 LCR rows.

## Resume notes

- New e2e helper `showCategory(page, name)` (e2e/fixtures.ts): clicking the active rail category now collapses its panel, so tests show a category through this helper.
