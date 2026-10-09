# Starter block library v2 — progress

Branch: `codex/blocks-library` from main `69bcb5e`.
Prerequisite: PR #21 merged 2026-10-09, merge commit `0c046695`.
Scope: fourteen original source blocks; isolated Library gallery section; unit
and browser checks; docs/report. Only the owner's allowed paths may change.
No editor/schema/renderer/dependency changes. Do not merge.

- [x] Read CODE-LAYER.md, AGENTS.md, process/status/decisions and existing block paths.
- [x] Build 14 sources with 5–9 params, defaults, duration, thumbnailTime and <12000 characters.
- [x] All sources compile; 43 unit tests pass (including 3→1→3 and parameter boundaries).
- [x] Add Library picker reusing existing worker/compile/export paths.
- [x] Add 14 strict browser regressions under tests/blocks/library.
- [ ] Browser parity verified: blocked locally by absent Edge and invalid Chromium downloads.
- [x] Final check: 520 tests in 44 files; gallery typecheck/build and ledger pass.
- [x] Docs and honest report written.
- [x] Delivery prepared for one draft PR; never merge.

Delivery commit: `feat(blocks): add fourteen sandbox-compatible library blocks`.
Resolve its exact hash with `git log -1 -- briefs/BLOCK-LIBRARY.md`.
Browser checks must be run with
`npm run blocks:library:check` on a machine with a working Playwright browser.
Default CI does not discover this separate suite; do not infer parity from its status.
