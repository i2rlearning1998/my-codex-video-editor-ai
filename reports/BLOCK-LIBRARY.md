# Report: Starter block library v2 (2026-10-09)

## 1. Summary

Fourteen original animation blocks are available in the gallery's new Library
section. Each loads through the existing compiler and worker sandbox. The library
adds no editor integration. Local compilation, parameter and determinism tests
pass. Browser appearance and exact pixel parity remain **Claimed**, not Verified:
the local browser cannot launch, and its installer returned invalid ZIP archives.

## 2. Scope and results

| Scope | Result | Evidence |
| --- | --- | --- |
| All 14 source definitions | Built; unit checks passed; visual output Claimed | `tests/blocks/library/library.test.ts`: 3 tests per block |
| Parameter defaults, limits, source length, finite calls, balanced state, 3→1→3 | Unit verified | 43 new tests passed |
| Library gallery selection | Built; browser unverified | `blocks-gallery/library.ts`; 14 browser cases authored |
| Transparent visible thumbnail and exact export parity | Not verified | Browser launch failed before any assertion |
| Selection guide and report | Written | `docs/BLOCK-LIBRARY.md` |

In-scope visual P0 items Verified: **0 of 14**. No ledger row is promoted.
No requested block is omitted. The outstanding requirement is actual browser
proof for all 14, plus owner assessment of visual quality.

## 3. Checks

Local `npm run check` exited 0 (format, typecheck, unit/jsdom, app build):

```text
All matched files use Prettier code style!
Test Files  44 passed (44)
     Tests  520 passed (520)
  Duration  40.89s
✓ 132 modules transformed.
dist/assets/worker-DBV1Hnly.js  542.69 kB
dist/assets/index-DqEM4H2W.js   585.73 kB │ gzip: 179.79 kB
✓ built in 5.88s
```

The combined 520 includes existing unit/jsdom suites; **43 new tests** are Node
recording-context unit tests, **0 new jsdom tests**. Separate gallery typecheck
passed. Gallery build also passed (38 modules; worker 12.38 kB; gallery JS
50.93 kB; existing TypeScript compiler chunk 3578.09 kB; 30.95 s).
Local runtime: Node 24.19.0, npm 11.9.0. Ledger validation returned `Ledger OK`
(547 items, unchanged statuses; existing warnings retained).

Local Playwright attempt:

```text
Running 14 tests using 1 worker
Error: browserType.launch: Chromium distribution 'msedge' is not found at /opt/microsoft/msedge/msedge
1 failed
13 did not run
```

No browser assertion ran; no browser version or screenshot is claimed. Attempted
`npx playwright install chromium` (Chrome for Testing 153.0.8010.12); the download
reported 0 MiB and `End of central directory record signature not found` twice.
Stopped further installer retries. No tolerance changed, no skip or expected-fail
added to hide this environment failure.

`npm run verify` is not claimed green: its browser stage is blocked by the same
missing browser. The targeted Playwright attempt was used to establish the blocker.
Ledger files and existing e2e specs are unchanged; no new ledger IDs invented.
CI has not been used as evidence. The default workflow runs existing e2e only,
**not** the new suite in this task's authorized tests folder. Run
`npm run blocks:library:check` on an owner/CI machine with a browser to obtain the
missing proof. It runs units then all 14 exact-parity browser cases.

## 4. Try-it script for the owner

All steps below are **not run locally in a browser**, and there are no screenshots.

| # | Do this | Expect | Scope |
| --- | --- | --- | --- |
| 1 | Check out this branch; run `npm run blocks:gallery` and open the printed address. | New Library section lists fourteen entries; original controls remain. | Gallery |
| 2 | Click Offset lower third, Measured words and Cursor note in turn. | Worker frame OK, visible title at thumbnail pose, editable text/color/timing. | Titles |
| 3 | Try Three-way comparison, Trace of progress, Open orbit progress and Metric with a pulse. | Values animate; ring shows percent; sparkline says illustrative. | Data |
| 4 | Try Follow and chime, Bent path callout, Quiet countdown and Folded compass mark. | Bell, arrow, clock and original shapes are visible; parameters change them. | CTA/time/shapes |
| 5 | Try Signal offset title, Tidal ribbons and Paper celebration. | Glitch motion, transparent ribbon gaps and a finite confetti burst. | Motion |
| 6 | For every item, scrub 3 → 1 → 3, edit parameters, then press Export check. | Repeated pose identical; all five times return pass true, maxDifference 0. | All 14 |
| 7 | Run `npm run blocks:library:check` with a supported browser installed. | 43 unit tests and 14 browser tests pass. Send any actual failure output. | Automated parity |
| 8 | Optionally press Benchmark on a chosen block. | Worker timings appear; main-thread time is null for sandbox sources. Report machine/browser and numbers. | Performance |

## 5. Deviations from the brief

The exact browser parity requirement remains unverified because of the browser
blocker. No implementation scope deviation: only permitted paths and one package
script changed. Tests live under `tests/blocks/library` rather than editing any
existing e2e file. Generic wave ledger/changelog/tag/patch steps were omitted to
honor the owner's narrower path restrictions.

## 6. Decisions made

D-250–254 are recorded in `docs/BLOCK-LIBRARY.md`: scoped bookkeeping; copyable
compiler-compatible sources; gallery reuse; separate strict browser gate; limited
and honest data/chart semantics. No changes to docs/DECISIONS.md were authorized.

## 7. Not tested, known gaps, risks

- Browser pixels, transparency, UI usability and owner visual quality are unverified.
- Native main-thread rendering, actual encoded export, cross-browser/fonts and
  hardware parity are not proved by worker-vs-worker checks.
- No 720p/1080p benchmark values are claimed.
- Only single-line text; long strings compress horizontally. Design coordinates
  stretch outside 16:9. Chart values are limited to three samples on a fixed scale.
- Counter sparkline is seeded decoration, clearly labelled; no data import.
- Countdown/typing params can exceed default clip duration; owner must lengthen it.
- Existing sandbox security limits remain unchanged; it is not a hardened
  arbitrary-JavaScript security boundary.
- Fully transparent colors, empty text and expired confetti may intentionally
  produce no artwork; the default thumbnail tests disallow accidental blank output.

## 8. Architecture and contract impact

Schema remains 5. No dependency changes. Added 14 source files and an index,
scoped unit/browser tests and browser configuration, gallery library mount, docs,
report and brief. Gallery changes add only the Library section and its hook.
No files removed/moved. No editor/schema/renderer/export/sandbox contracts changed.

## 9. Ledger and backlog

No statuses changed, no ledger change requests, no backlog file edits (outside
allowed paths). Remaining verification is listed above and in the brief.

## 10. Git

Branch `codex/blocks-library` from main `69bcb5e`. PR #21 was already merged
(`0c046695`, confirmed before starting). One review PR; do not merge. No tag or
review patch outside the allowed paths. See branch commits for exact revisions;
progress checkpoint is `briefs/BLOCK-LIBRARY.md`.

## Owner tick-list

| Scope | OK / BUG / MISSING / CHANGE | One sentence |
| --- | --- | --- |
| Titles | | |
| Data blocks | | |
| CTA / annotation / countdown / shapes | | |
| Glitch / ribbons / confetti | | |
| All 14 exact-parity checks | | |
