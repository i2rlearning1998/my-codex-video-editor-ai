# Report: Free-code Tier C (2026-10-12)

## 1. Summary

The isolated Tier C runtime, ten original source studies and standalone gallery
are implemented on codex/free-code-runtime. No editor integration is included.
Local static/unit checks pass. CI run 38292445233 passed all 517 unit/jsdom tests
and 268 browser tests with zero flaky/skipped cases. Real measurements and
screenshots are available. Screenshot review then caught a WebGL alpha defect;
its sample fix and stronger browser assertions are awaiting the next CI run.
The absolute hostile-code guarantee in the spec is **Not done**: a same-process
srcdoc iframe cannot provide hard memory/CPU/egress isolation for arbitrary JS.
GSAP is deliberately omitted under the current licence uncertainty.

## 2. Scope and results

| Part | Result | Evidence |
| --- | --- | --- |
| Setup | Done | Spec copied from requested remote branch in its own first commit |
| F0 | Done (local static/unit proof) | AST parser, literal meta, ParamSpec reuse; validator tests |
| F1 | Claimed browser behavior | Opaque iframe, CSP, transport, clocks, capture, deadlines; protocol/jsdom tests pass |
| F2 | Done files; library browser execution Claimed | Pinned bundles, MIT texts, release dates/hashes, helper tests |
| F3 | Claimed visual quality | Ten complete original sample sources pass validation; screenshots await CI |
| F4 | Claimed browser behavior | Gallery strict typecheck and build pass; interactive proof awaits CI |
| F5 | Done test implementation; browser proof pending | 38 unit/jsdom tests pass; 19 e2e cases committed |
| F6 | Done | Architecture/limits, authoring system prompt, three complete examples, this report |

- In-scope P0 browser items Verified: **0** locally. No ledger rows promoted.
- Not done: absolute arbitrary-code CPU/memory/network containment; professional
  visual review and measured browser performance until a real run is available.
- Outside scope and untouched: editor UI, engine, renderer, export, schema, PR #14,
  PR #19, root dependencies/lockfile, global ledger/status/changelog.

## PR #27 CI failure diagnosis

Both runs [38288476502](https://github.com/i2rlearning1998/my-codex-video-editor-ai/actions/runs/38288476502)
and [38288473650](https://github.com/i2rlearning1998/my-codex-video-editor-ai/actions/runs/38288473650)
failed in the **verify / Run npm run verify** step. Format, strict typechecks,
515 unit/jsdom tests and the build passed. Browser totals: **19 failed, 249 passed**.
Both Windows export-mp4 jobs passed.

All 19 failures are in e2e/freecode-gallery.spec.ts:

- `[EXP-007] Free code: visible 1080p thumbnail and two deterministic bakes`:
  particles, three-scene, pixi-field, lottie-mark, aurora, shader, typography,
  svg-infographic, chart, parallax (10 tests).
- `[DEV-001] Free code fails safely and host remains usable`:
  fetch, WebSocket, parent, storage, loop, allocation, import, timeout (8 tests).
- `[EXP-007] Free code bakes PNG cache, scrubs and applies exposed parameters`
  (1 test).

Every failure encountered **Unexpected token 'export'**. The TypeScript
transpileModule emitter retained external-module identity and appended
`export {};` after the before-transformer replaced the default export with
window.__block. The sandbox evaluates a classic script function, where that
synthetic export is invalid. Recovery tests also failed when they tried to open
the chart after rejecting hostile source. The initial sample never rendered,
so the failures did not provide performance or determinism evidence.

Fix b44f5e9 transforms and prints the parsed JavaScript AST directly, avoiding
the module emitter while preserving the loop/function/allocation instrumentation.
Two new regression tests fail on the original implementation, then pass with
the fix: compile every emitted sample as a classic script, and execute both
supported module forms with guard calls. No thresholds, test cases, or console
checks were relaxed. Local npm run check passes **517 tests in 48 files**.
Screenshots and hostile outcomes are now explicit browser-proof attachments;
benchmark JSON also records firstBakeMs and secondBakeMs independently.

The first repair run [38292445233](https://github.com/i2rlearning1998/my-codex-video-editor-ai/actions/runs/38292445233)
is **green**, including export-mp4, the production test-hook assertion and ledger.
268 browser tests passed with zero flaky, skipped or unexpected results.
Its [browser-proof](https://github.com/i2rlearning1998/my-codex-video-editor-ai/actions/runs/38292445233/artifacts/11766839024)
contains ten screenshots, ten measurement attachments, eight hostile-case
attachments and the PNG bake report. All measured channel differences were zero.

Screenshot review found the shader's non-premultiplied RGB visibly leaking across
transparent canvas pixels. Its fragment shader now multiplies RGB by alpha. An
opaque-black compositing probe asserts the transparent border contributes zero
colour; raw alpha counts did not catch this. Every sample now also checks the
minimum visible-pixel count across every frame in both bakes, preventing blank
frames from being hidden by the old any-visible-frame aggregate. Rerun pending.

## 3. Checks (real output tails)

`npm run check`: exit 0 (before final documentation-only edits).

```text
All matched files use Prettier code style!
Test Files  48 passed (48)
Tests       515 passed (515)
✓ built in 4.13s
```

Free-code subset: **36 unit tests + 2 jsdom tests** in five files. Gallery strict
TypeScript compilation passes. No `any` in authored TypeScript.

Gallery production build:

```text
lottie chunk       90.44 kB (68.14 kB gzip)
pixi chunk        182.14 kB (137.22 kB gzip)
three chunk       234.60 kB (176.45 kB gzip)
main chunk      3,628.58 kB (1,041.37 kB gzip)
✓ built in 12.92s
```

Large main chunk is the existing TypeScript parser bundled for this standalone
lab, not an editor bundle change. Vite reports its standard large-chunk warning.

`npm run verify`: exit 1. Formatting, typecheck, 513 then-current tests and app build
passed; browser setup defaulted to unavailable Microsoft Edge. E2E output ended
with **107 failed, 142 passed** (the passes include tests without browser launch).
These are not evidence that this runtime works. The later targeted Chromium 134
launch failed before the test ran:

```text
FATAL:process_singleton_posix.cc(292) Check failed: . socket() failed:
Operation not permitted (1)
1 failed
```

The environment permission policy rejected an escalated retry. Chromium 153
installation initially failed with an invalid downloaded ZIP. An older Chromium
134 binary downloaded successfully, but its launch hit the socket restriction.
No browser passed locally; no screenshots, max pixel differences, frame times or
bake times are invented. Native timing and memory fields remain unmeasured.

CI: [F5 run](https://github.com/i2rlearning1998/my-codex-video-editor-ai/actions/runs/38287002395)
was running when this report was authored. [Draft PR #27](https://github.com/i2rlearning1998/my-codex-video-editor-ai/pull/27)
shows subsequent runs. [F6 browser run](https://github.com/i2rlearning1998/my-codex-video-editor-ai/actions/runs/38287886298) was also in progress. Existing CI discovers the gallery e2e file without workflow changes and
attaches per-sample JSON measurements/screenshots to browser-proof. Final status
is recorded in the PR; do not interpret this link as a passing run.

Ledger: standalone structural validation passed after using literal test titles.
No ledger rows changed. Tests use existing EXP-007 / DEV-001 proof areas,
following the Block gallery precedent. Full ledger verification awaits browser CI.

## 4. Try-it script for the owner

None of these browser steps ran locally because Chromium could not start.

| # | Do this | Expect | ID | Codex ran it | Screenshot |
| --- | --- | --- | --- | --- | --- |
| 1 | npm ci; npm run freecode:gallery; open /freecode-gallery/ on port 5176 | Laboratory loads | F4 | N | Pending CI |
| 2 | Choose each of ten studies at 1080p | Nonblank transparent thumbnail and params | F3 | N | Pending CI |
| 3 | Edit a colour/speed; Validate & preview | Updated preview | F4 | N | Pending CI |
| 4 | Bake a study | Progress to all 96 frames; PNG byte/time report | F4 | N | Pending CI |
| 5 | Play and scrub | Cached animation; no new bake | F4 | N | Pending CI |
| 6 | Determinism check | Two full bakes; actual max channel difference shown | F5 | N | Pending CI |
| 7 | Benchmark 720p + 1080p | Real mean/peak round-trip times and comparison totals | F5 | N | Pending CI |
| 8 | Run all hostile cases | Rejection/budget/timeout message; next sample works | F5 | N | Pending CI |
| 9 | Cancel a bake | Sessions removed and controls recover | F1 | N | Pending CI |
| 10 | Paste a worked example from authoring guide | Valid metadata and preview | F6 | N | Pending CI |

## 5. Deviations from the brief

- Added only the explicitly required setup spec, progress file, report and one
  package.json script outside the enumerated new folders/docs. No other existing
  product file is changed.
- Bundles are committed compressed local text instead of root dependencies,
  preserving the requested isolation and lockfile. They are still runtime libraries.
- Added conservative diagnostic bans for eval/Function/prototype access/navigation
  names and cooperative loop/array budgets. These do not prove full containment.
- No claim of browser proof, visual polish or performance without actual results.
- No tag/review patch or global wave bookkeeping: the owner requested a single
  isolated draft PR and no merge. Reports/decisions stay within permitted docs.

## 6. Decisions made

D-240–D-247 are recorded in docs/FREECODE.md, including scope exceptions, API
publication, honest isolation limits, GSAP exclusion, local pinned bundles,
fake-clock units, three example families and isolated test/ledger treatment.

## 7. Not tested, known gaps, risks

- No local browser visual/performance/security result. Current CI status must be
  checked before accepting. GPU acceleration and Windows reference hardware untested.
- No cross-browser/GPU pixel parity promise. Fonts depend on the environment.
- AST deny scan can miss obfuscation/aliases; inline-script CSP permits evaluation.
  Navigation and browser-native resource operations need a separate security review.
- Memory accounting only estimates direct named Array/typed-array constructors;
  array growth, strings, GPU allocations, native methods and library internals are
  not comprehensively quota-controlled. Host iframe removal cannot preempt every
  shared-thread runaway. This is an unmet hard-security requirement, not hidden.
- Timers are no-ops, so timer-driven asynchronous library/asset loading can stall;
  timeout then fails. Only inline/data assets are intended. No arbitrary plugins.
- Gallery PNG cache is memory-only, capped at 128 MiB; no OPFS/cache integration.
- Playback is a simple preview scheduler, not a proof of real-time video playback.
- Professional composition quality requires human visual review; source complexity
  and nonzero alpha assertions alone do not prove that quality bar.

## 8. Architecture and contract impact

Schema version change: none. Runtime is standalone; it imports only existing
Block params/helpers/types, not editor/engine/render/export code.

| New runtime library | Version | Decoded / gzip bytes | Reason / alternative |
| --- | --- | --- | --- |
| three (MIT) | 0.170.0 | 684980 / 175921 | Procedural 3D / raw WebGL |
| pixi.js (MIT) | 7.4.3 | 456168 / 136581 | 2D scene/particles / Canvas |
| lottie-web (MIT) | 5.12.2 | 265947 / 67803 | Inline animation JSON / own timeline |

All older than two weeks; registry publication dates and full licences are retained.
Bundled-component audit also records ISC (earcut), BSD-3-Clause (PIXI FXAA),
and MIT helper notices in vendor/THIRD-PARTY-NOTICES.txt.
GSAP **not added**: current official terms restrict competing visual animation
builders; this editor's use is not clearly permitted. See docs/THIRD-PARTY.md.

Added files: src/freecode (runtime/helpers/bundles/samples), freecode-gallery,
tests/freecode, e2e/freecode-gallery.spec.ts, requested docs/spec/progress/report.
Modified existing file: package.json, one gallery script only. Contracts touched:
only the requested spec copy; existing contracts unchanged.

## 9. Ledger and backlog

No ledger statuses changed. No Ledger Change Requests applied. No unrelated
backlog modifications. Scope is owner-authorized F0–F6, with honest proof statuses.

## 10. Git

Branch: codex/free-code-runtime, based on main. One draft PR; never merged.
No remote history rewrite. Terminal push lacked credentials; the connected GitHub
Git Data API published each part, and the local checkout follows those commits.

```text
85c0f2b docs(freecode): import Tier C contract [F0]
2f49d40 feat(freecode): validate literal module metadata and capabilities [F0]
9ad1328 feat(freecode): add isolated session and bitmap protocol [F1]
3cb4793 feat(freecode): vendor pinned MIT libraries and helper kit [F2]
8e4b0ff feat(freecode): add ten original animation studies [F3]
cf8e9f8 feat(freecode): add standalone gallery and bake diagnostics [F4]
cc41b62 test(freecode): add browser bake and hostile-code coverage [F5]
```

F6 and subsequent verification corrections appear in the draft PR commit list.
No tag or separate review patch; the PR is the review surface.

## Owner tick-list

| ID | OK / BUG / MISSING / CHANGE | One sentence |
| --- | --- | --- |
| F0 | | |
| F1 | | |
| F2 | | |
| F3 | | |
| F4 | | |
| F5 | | |
| F6 | | |
