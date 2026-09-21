# STATUS.md: current state

Updated by Codex at the end of every wave. Claude reads this first in a new chat.

## Now

- **Current wave:** 0 (lite: proof infrastructure), implemented and locally verified; awaiting owner/reviewer acceptance. No other wave started. Next proposed brief: Wave 1 (Shell v2, design system, i18n, commands).
- **Baseline tag `m0`:** commit `docs: add HANDOFF` on top of `Baseline: T3 (schema 4)`.
- **Schema version:** 4 (migrations 1 to 2, 2 to 3, 3 to 4).
- **Current tests:** 282 Vitest tests in 14 files: 141 unit (9 files), 141 jsdom (5 files). Chrome e2e: 10 normal passes and 4 expected failures (three product bugs and one intentional guard probe). Full `verify`, headed e2e, production hook assertion and ledger validation passed locally. See `reports/W0.md` for evidence and exact scope.
- **Baseline check (Claude, 2026-09-20, by hand in Chromium):** 24 of 27 T3 claims pass, 3 bugs (TL-004, TL-019, REL-001). Details in `docs/W0_FINDINGS.md`.
- **Ledger:** 485 items: 15 `Verified`, 42 `Claimed`, 3 `Bug`, 425 `Todo`. CI (DEV-004) is configured but remains `Claimed` because there is no remote. Run `npm run ledger -- --summary` for the live table.
- **Tooling:** Node 24.19.0 (existing Codex bundled runtime), npm 10.9.9, Playwright 1.63.0, installed Google Chrome 153.0.8010.52. Host Node 20.5.0 cannot load Playwright's TypeScript ESM configuration; see README and D-021. No system upgrade was made.

## What exists (T3; only the named Wave 0 proof items are browser-verified)

Engine, commands, transactions, history, frozen transform math, nested groups, Canvas 2D adapter (placeholders for media), canvas selection and transform gestures, Scene list, six-field inspector, NLE tracks and clips (move, trim, split, duplicate, delete, snap, markers, lock, mute metadata), playback by elapsed time, content-driven duration, localStorage autosave with backup and quarantine, JSON open and export.

Wave 0 adds read-only dev snapshots, bounded debug-report copying/download, browser proof/error guarding, tested ledger/patch tooling and an unrun CI workflow. Browser-proven baseline IDs: CV-001, CV-004, TL-021, TL-025, PB-001, HIS-001. Remaining baseline claims were not re-audited.

## Known limitations at baseline (from HANDOFF.md)

No media import or decode, no audio, no export, no interpolation, no effects, no transitions, no masks, no text editing, no fonts system, no i18n. Selection styling may highlight every clip of a selected NLE track; the no-layers message ignores NLE rows; drop highlight marks rows before validation (all unconfirmed review concerns). Local storage is size-limited and development-only. `AGENTS.md` and older docs contained obsolete restrictions (fixed by Wave 0).

## Open bugs

TL-004 (Delete works on locked track), TL-019 (right trim overlaps next clip), REL-001 (favicon 404 console error). Fix plan: REL-001 in Wave 1, TL-004 and TL-019 in Wave 2.

## Next actions

1. Owner runs the try-it script in `reports/W0.md` and sends the report, patch, stat and tick-list for review.
2. Owner reviews `docs/FEATURES.md` (priorities, missing items) and sends changes to Claude as edits; Claude answers with an LCR.
3. Claude writes the Wave 1 brief from the Wave 0 report.
