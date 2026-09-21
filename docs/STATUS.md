# STATUS.md: current state

Updated by Codex at the end of every wave. Claude reads this first in a new chat.

## Now

- **Current wave:** 0 (lite: proof infrastructure), not started. Next: Wave 1 (Shell v2, design system, i18n, commands).
- **Baseline tag `m0`:** commit `docs: add HANDOFF` on top of `Baseline: T3 (schema 4)`.
- **Schema version:** 4 (migrations 1 to 2, 2 to 3, 3 to 4).
- **Tests at baseline:** 263 Vitest tests in 10 files (mostly jsdom). **E2E tests: 0.** No test has yet proven user-visible behavior in a real browser.
- **Baseline check (Claude, 2026-09-20, by hand in Chromium):** 24 of 27 T3 claims pass, 3 bugs (TL-004, TL-019, REL-001). Details in `docs/W0_FINDINGS.md`.
- **Ledger:** 485 items, 47 `Claimed`, 3 `Bug`, 435 `Todo`. Run `npm run ledger -- --summary` for the live table.

## What exists (T3, unverified in a real browser)

Engine, commands, transactions, history, frozen transform math, nested groups, Canvas 2D adapter (placeholders for media), canvas selection and transform gestures, Scene list, six-field inspector, NLE tracks and clips (move, trim, split, duplicate, delete, snap, markers, lock, mute metadata), playback by elapsed time, content-driven duration, localStorage autosave with backup and quarantine, JSON open and export.

## Known limitations at baseline (from HANDOFF.md)

No media import or decode, no audio, no export, no interpolation, no effects, no transitions, no masks, no text editing, no fonts system, no i18n. Selection styling may highlight every clip of a selected NLE track; the no-layers message ignores NLE rows; drop highlight marks rows before validation (all unconfirmed review concerns). Local storage is size-limited and development-only. `AGENTS.md` and older docs contained obsolete restrictions (fixed by Wave 0).

## Open bugs

TL-004 (Delete works on locked track), TL-019 (right trim overlaps next clip), REL-001 (favicon 404 console error). Fix plan: REL-001 in Wave 1, TL-004 and TL-019 in Wave 2.

## Next actions

1. Run Wave 0 (`briefs/W0.md`).
2. Owner reviews `docs/FEATURES.md` (priorities, missing items) and sends changes to Claude as edits; Claude answers with an LCR.
3. Claude writes the Wave 1 brief from the Wave 0 report.
