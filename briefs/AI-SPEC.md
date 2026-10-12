# Composition Spec v1 — AI authoring groundwork

Branch `codex/composition-spec` from main `9362645`. Open one PR; never merge.
Owner scope overrides generic wave bookkeeping: touch only src/ai-spec,
tests/ai-spec, docs/AI-SPEC.md, reports/AI-SPEC.md, this brief and the single
ai-spec:check package script. No editor/UI/schema/renderer changes, API keys,
model calls, outbound runtime requests or new dependencies.

Read: AGENTS.md; PROCESS; current STATUS/DECISIONS and actual command definitions;
CODE-LAYER.md, blocks and camera on PR #21 at 6a74c95; FX metadata at 98a95f7.
Main lacks those libraries, so pin static block validator and metadata snapshots
under the allowed folder. Never import editor implementation or fabricate a live
ADD_BLOCK_LAYER command. Unavailable features must produce blocked plan entries.

| Part                                                                 | Status                                                           |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Zod v1 document, limits, references, params, block source validation | Done; focused tests pass                                         |
| Pure deterministic plan and documented vocabulary mapping            | Done; six plan fixtures pass                                     |
| Six specs and expected plan fixtures                                 | Done; focused tests pass                                         |
| System/router/code prompts and cost-aware design                     | Done                                                             |
| Full check, report and PR                                            | Check passed (431 tests); report done; open PR after this commit |

Resume: inspect this file, git status and remote branch before writing. Last commit:
this checkpoint (`git log -1 -- briefs/AI-SPEC.md`). Do not modify PR #21 or other
worktrees. Source validation never executes a block. Plan output is deliberately
not a dispatchable transaction; integration and assets remain owner-reviewed work.
