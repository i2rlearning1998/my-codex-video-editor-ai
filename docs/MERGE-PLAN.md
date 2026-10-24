# MERGE-PLAN.md: how the stack reaches `main` (PHASE 0, 2026-10-24)

## Dry run

`origin/main` (69bcb5e, "Merge pull request #23") is an **ancestor** of `claude/fix-5`, the top of the stack. A throwaway branch off `origin/main` merged `claude/fix-5` with `git merge --no-commit --no-ff`: **no conflicts** (336 commits ahead). The merge was aborted and the branch deleted; nothing was pushed.

So the whole stack can reach `main` in one merge of PR #48, or one PR at a time from the bottom. Nothing needs to be resolved by hand as long as the stack is merged as it stands.

## The stack, bottom to top (each PR's base is the one before it)

All are drafts except where noted.

| Order | PR                    | Branch                 | Base            |
| ----- | --------------------- | ---------------------- | --------------- |
| 1     | #16 (open, not draft) | claude/i-series        | main            |
| 2     | #17                   | claude/j-series        | i-series        |
| 3     | #18 (not draft)       | claude/t-series        | j-series        |
| 4     | #20 (not draft)       | claude/u-series        | t-series        |
| 5     | #22 (not draft)       | claude/t-all           | u-series        |
| 6     | #25 (not draft)       | claude/v-series        | t-all           |
| 7     | #26 (not draft)       | claude/v7-series       | v-series        |
| 8     | #28                   | claude/x-series        | v7-series       |
| 9     | #30                   | claude/p-series        | x-series        |
| 10    | #31                   | claude/qt-series       | x-series        |
| 11    | #33                   | claude/r-all           | qt-series       |
| 12    | #35                   | claude/s1-ui-fix       | r-all           |
| 13    | #36                   | claude/b1-styles-brief | s1-ui-fix       |
| 14    | #39                   | claude/j-composition   | b1-styles-brief |
| 15    | #41                   | claude/final-1         | j-composition   |
| 16    | #42                   | claude/final-2         | final-1         |
| 17    | #43                   | claude/fix-1           | final-2         |
| 18    | #44                   | claude/final-3         | fix-1           |
| 19    | #45                   | claude/fix-3           | final-3         |
| 20    | #46                   | claude/fix-4           | fix-3           |
| 21    | #48                   | claude/fix-5           | fix-4           |

Codex PRs whose work is already merged into the stack (merge them only by merging the stack; merging them separately would duplicate commits): #14 w7-audio and #19 fx-library (both ported or copied unchanged), #24 blocks-library, #27 free-code-runtime and #29 creator-pack (merged into the x-series and p-series), #32 theme-thumbs and #34 c1-providers (r-all), #37 c2-engines, #38 c3-render-effects and #40 c3-media-probe (final-1), and #47 fix-5-engine (merged into fix-5, redundant).

## How to merge

1. Best: merge PR #48 into `main` once (it carries every commit below it). Close the lower PRs as merged-by-contents afterwards.
2. Or from the bottom: retarget each PR to `main` after its base merges (GitHub does this when the base branch is deleted on merge) and merge in the order above.
3. Before either, run `npm run verify` on `claude/fix-5` on the owner's PC (the sandbox cannot run H.264 or the GPU paths).

## Known risks

- Schema 9 is the latest; every older version has a migration and fixture.
- PB-010, PB-009, VID-010, EXP-001, HIS-004, TPL-015, LAY-004, LAY-038 and ANI-003 are known timing flakes in the sandbox.
- Three unit tests (ai-spec boundaries, two blocks worker tests) fail on `claude/fix-4` too; they are not caused by FIX5.
- CI runs only when dispatched by hand.
