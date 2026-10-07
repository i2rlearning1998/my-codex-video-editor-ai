# Code-layer PoC — resumable B0–B5

Branch codex/code-layer-poc from main 9362645. One PR to main, draft until finish. Never merge. Do not touch PR #14 or claude branches.

| Part | Status                                                        | Last commit                                     |
| ---- | ------------------------------------------------------------- | ----------------------------------------------- |
| B0   | Done; npm run check passed, 392 tests                         | f07955f                                         |
| B1   | Done; check passed, 398 tests                                 | c64b083                                         |
| B2   | Done; check passed, 426 tests                                 | 4535b98                                         |
| B3   | Done; 426 tests, gallery typecheck/build; browser unavailable | 1fe4307                                         |
| B4   | Done; check passed, 432 tests                                 | This checkpoint: git log -1 -- briefs/BLOCKS.md |
| B5   | Pending                                                       | —                                               |

Allowed paths only: src/blocks, src/camera, tests/blocks, tests/camera, blocks-gallery, docs/CODE-LAYER.md, docs/SCHEMA-V7-PROPOSAL.md, reports/CODE-LAYER-POC.md, this file, one new e2e spec, one blocks:gallery script. No dependencies, app wiring, schema edits or existing-test edits. Decisions in CODE-LAYER.md (D-220 onward; D-200–210 reserved by W7). Push every part. Run npm run check; browser proof must be honest about this environment. Read checkpoint/rules/current branch before resuming.
