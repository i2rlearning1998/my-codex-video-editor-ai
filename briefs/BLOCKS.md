# Code-layer PoC — resumable B0–B5

Branch codex/code-layer-poc from main 9362645. One PR to main, draft until finish. Never merge. Do not touch PR #14 or claude branches.

| Part | Status                                                        | Last commit                                     |
| ---- | ------------------------------------------------------------- | ----------------------------------------------- |
| B0   | Done; npm run check passed, 392 tests                         | f07955f                                         |
| B1   | Done; check passed, 398 tests                                 | c64b083                                         |
| B2   | Done; check passed, 426 tests                                 | 4535b98                                         |
| B3   | Done; 426 tests, gallery typecheck/build; browser unavailable | 1fe4307                                         |
| B4   | Done; check passed, 432 tests                                 | b30b218                                         |
| B5   | Done; final check passed, 433 tests; browser proof pending    | This checkpoint: git log -1 -- briefs/BLOCKS.md |

Allowed paths only: src/blocks, src/camera, tests/blocks, tests/camera, blocks-gallery, docs/CODE-LAYER.md, docs/SCHEMA-V7-PROPOSAL.md, reports/CODE-LAYER-POC.md, this file, one new e2e spec, one blocks:gallery script. No dependencies, app wiring, schema edits or existing-test edits. Decisions in CODE-LAYER.md (D-220 onward; D-200–210 reserved by W7). Push every part. Run npm run check; browser proof must be honest about this environment. Read checkpoint/rules/current branch before resuming.

PR #21: https://github.com/i2rlearning1998/my-codex-video-editor-ai/pull/21

Browser proof remains unverified (no local Edge). One CI snapshot on B4 was in progress. No polling. See reports/CODE-LAYER-POC.md for evidence and the six owner steps. After final check/push, mark this same PR ready; never merge. On resume inspect current remote/head and this file first; do not repeat completed parts.

BLK-1/BLK-2 follow-up: regression-first size-copy fix, matched gallery context
policy and raw/display-stage export comparisons. Zero tolerance retained, worker
sandbox unchanged. Local check: 434 tests; 14 browser cases cannot launch locally
(missing Edge, Chromium download corrupt). Last fix commit: `git log -1 -- briefs/BLOCKS.md`.
Same branch/PR; owner/CI browser confirmation required. See report follow-up.
