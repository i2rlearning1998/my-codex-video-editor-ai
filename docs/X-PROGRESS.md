# X-series progress (code animations, CODE-TIERS-SPEC)

Branch `claude/x-series` (from `claude/v7-series`, with `origin/main` merged). One draft PR, base `claude/v7-series`. Strict order X1 to X6; each part is committed and pushed with its affected specs run; one full `npm run verify` at the end.

| Part                     | State | Notes                                                                                                                                                                                                                       |
| ------------------------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup                    | Done  | `origin/main` merged (src/blocks, src/ai-spec, code-layer PoC); package.json keeps both sides' scripts. Spec copied to docs/specs/CODE-TIERS-SPEC.md.                                                                       |
| X1 Layer and pipeline    | Done  | Schema 8 `code` field (D-218), frame cache and baker (D-219), one render path for preview and export (D-231), runtimes and FakeRuntime (D-232). Unit: tests/x1-code-layer.test.ts. E2E: e2e/x1-code-layer.spec.ts (3 pass). |
| X2 Import dialog         | Todo  |                                                                                                                                                                                                                             |
| X3 Params and right rail | Todo  |                                                                                                                                                                                                                             |
| X4 Templates             | Todo  |                                                                                                                                                                                                                             |
| X5 Real runtime          | Todo  | `origin/codex/free-code-runtime` exists on the remote (checked at setup).                                                                                                                                                   |
| X6 Docs and verify       | Todo  |                                                                                                                                                                                                                             |

## Notes for a handoff

- Decision numbers: D-218, D-219, then D-231 to D-239, then D-250 on (D-220 to D-230 and D-240 to D-248 are used inside docs/CODE-LAYER.md, docs/AI-SPEC.md and Codex's FREECODE report).
- Ledger: the new CODE section (CODE-001 to CODE-013) was added as Todo in X1; statuses are set in X6.
- `tests/blocks/worker.test.ts` (2 tests, from main) fails in this sandbox on Node 22 before any X change too (`Cannot read properties of undefined (reading 'instantiate')`: Node's own worker internals need WebAssembly after the runtime removes it); CI uses Node 20.
- E2E for Tier C before X5 uses the FakeRuntime through `window.__AIVE_E2E_FREECODE__ = 'fake'`.
