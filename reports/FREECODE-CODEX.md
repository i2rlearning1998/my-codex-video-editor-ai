# Report: Free-code Tier C / PR #27 CI repair (2026-10-12)

## 1. Summary

**Done:** the original 19 gallery browser failures are fixed. Final implementation
commit **a8fc478** has a full green [Verify run 38294250329](https://github.com/i2rlearning1998/my-codex-video-editor-ai/actions/runs/38294250329):
517 unit/jsdom tests, 268 browser tests, zero flaky/skipped/unexpected results,
production test-hook assertion and ledger validation. Windows export-mp4 also passed.

The original root cause was an invalid synthetic export in the sandbox script.
A subsequent screenshot review found and fixed shader colour leaking through
transparent pixels. All ten samples now pass both-resolution determinism and
per-frame visibility checks, including the new shader compositing regression.

**Claimed:** professional animation quality beyond the reviewed stills; arbitrary
source compatibility; real-time playback performance on the owner's hardware.
**Not done:** absolute arbitrary-JavaScript CPU/memory/egress containment.
No cross-browser or GPU pixel parity is claimed. Draft PR only; not merged.

## 2. Scope and results

| Part | Status | Evidence |
| --- | --- | --- |
| Setup | Done | Requested spec imported in its own commit |
| F0 | Done | AST validation, literal metadata, Block ParamSpec reuse; unit tests |
| F1 | Done for covered cases | Sandbox session/capture/deadline and browser recovery tests |
| F2 | Done for bundled samples | Local pinned three/PIXI/Lottie execute in CI; helper tests |
| F3 | Done reference samples; broader quality Claimed | Ten screenshot attachments reviewed; shader visual defect corrected |
| F4 | Done for covered flows | Validation, params, PNG bake, scrub/play/cancel, benchmark tests pass |
| F5 | Done scoped proof; hard isolation Not done | 40 freecode unit/jsdom tests and 19 gallery browser tests |
| F6 | Done | Architecture, limits, AI authoring prompt, three examples, licence record |

No editor UI, engine, renderer, export, schema, root dependencies/lockfile, PR #14
or PR #19 changes. The initial task's only root package edit is the gallery script.
No global ledger rows were promoted. These are isolated EXP-007 / DEV-001 tests.

## 3. Failed tests, causes, fixes and verification

### Original two failures

Both [38288476502](https://github.com/i2rlearning1998/my-codex-video-editor-ai/actions/runs/38288476502)
and [38288473650](https://github.com/i2rlearning1998/my-codex-video-editor-ai/actions/runs/38288473650)
failed in **verify → Run npm run verify**. Format, strict types, 515 unit/jsdom
tests and build passed. Browser totals were **19 failed, 249 passed**. Both
Windows export-mp4 jobs passed. Exact failures in e2e/freecode-gallery.spec.ts:

- `[EXP-007] Free code: visible 1080p thumbnail and two deterministic bakes`
  for **particles, three-scene, pixi-field, lottie-mark, aurora, shader,
  typography, svg-infographic, chart, parallax** (10 tests, original line 16).
- `[DEV-001] Free code fails safely and host remains usable` for **fetch,
  WebSocket, parent, storage, loop, allocation, import, timeout**
  (8 tests, original line 96).
- `[EXP-007] Free code bakes PNG cache, scrubs and applies exposed parameters`
  (1 test, original line 114).

Every failure encountered **Unexpected token 'export'**. TypeScript's
transpileModule retained external-module identity and appended `export {};`
after the default export was rewritten to window.__block. That marker is invalid
inside the classic script function used by the iframe. Recovery tests hit the
same error opening the chart after rejecting hostile source.

Commit b44f5e9 uses TypeScript's parser, AST transform and printer directly,
preserving guards without invoking the module emitter. Two new regression tests
were first observed failing on the old code, then passing after the fix: compile
all ten emitted samples and execute both supported module forms with guards.
The first repaired [run 38292445233](https://github.com/i2rlearning1998/my-codex-video-editor-ai/actions/runs/38292445233)
passed 517 unit/jsdom and 268 browser tests.

### Visual defect caught after the first green run

The shader screenshot showed colour across its intended transparent border.
Its fragment output supplied unpremultiplied RGB to the default premultiplied-alpha
WebGL canvas. Raw alpha counts passed despite the visible compositing defect.
Commit a8fc478 multiplies fragment RGB by alpha. A new browser probe composites
the canvas over opaque black and requires zero RGB at the transparent border.
The corrected screenshot was downloaded and inspected: the glow is confined to
the intended circle, with clear surrounding transparency.

The comparison now also records minimum visible pixels across **every frame of
both bakes**, requiring >500 rather than relying only on an any-visible-frame
aggregate. This catches blank-frame dropouts. Existing exact-difference, timing,
alpha, canvas-size, console-error and recovery assertions remain intact.
No tests, budgets or console guards were weakened; no workflow edits or reruns
were used to turn a failing gallery test green.

### Final verified implementation

[Run 38294250329](https://github.com/i2rlearning1998/my-codex-video-editor-ai/actions/runs/38294250329),
commit a8fc478: `npm run verify` **passed**, 48 unit/jsdom files / **517 tests**;
**268 browser tests**, **0 flaky, 0 skipped, 0 unexpected** (675.39 seconds).
Free-code subset: **38 unit + 2 jsdom tests**, **19 browser cases**.
Browser: **HeadlessChrome 153.0.8010.12**, Linux GitHub-hosted Ubuntu runner.
Local `npm run check` and separate strict gallery TypeScript check also passed.

The duplicate [PR run 38294254187](https://github.com/i2rlearning1998/my-codex-video-editor-ai/actions/runs/38294254187)
had an unrelated existing **CV-054** toolbar test report 1 pixel of overflow where
0 was expected (e2e/h3-canvas.spec.ts:239). It passed on the workflow's existing
retry, but the ledger correctly rejected the flaky result. All 19 free-code tests
passed there. This editor issue is not fixed by this isolated task; no editor
code or tests were changed. The simultaneous push run above passed without flakes.

### Measured numbers from the green run

Source: [browser-proof artifact 11768386544](https://github.com/i2rlearning1998/my-codex-video-editor-ai/actions/runs/38294250329/artifacts/11768386544),
not estimates or local mocks. Each sample has two independent 96-frame bakes at
720p and 1080p, seed 42, 24 fps / 4 seconds. Bake A/B are the summed frame
render/capture/transfer round trips for each session; initialization, pixel
comparison and PNG encoding are excluded. Two-bake total includes readback and
comparison. Frame mean/peak refer to bake A. Sessions are advanced interleaved.

| Sample | Size | Bake A / B ms | Two bakes + comparison ms | Frame mean / peak ms | Max channel difference | Min visible pixels |
| --- | --- | --- | --- | --- | --- | --- |
| particles | 720p | 368.3 / 237.5 | 1965.6 | 3.84 / 9.6 | 0 | 106421 |
| particles | 1080p | 555.4 / 345.0 | 3488.4 | 5.79 / 21.5 | 0 | 150083 |
| three-scene | 720p | 2791.4 / 2172.5 | 6127.5 | 29.08 / 70.6 | 0 | 60774 |
| three-scene | 1080p | 3826.5 / 3730.3 | 9864.9 | 39.86 / 96.7 | 0 | 136056 |
| pixi-field | 720p | 1042.9 / 943.1 | 3218.0 | 10.86 / 55.8 | 0 | 11722 |
| pixi-field | 1080p | 1635.5 / 1586.2 | 5626.2 | 17.04 / 63.7 | 0 | 25049 |
| lottie-mark | 720p | 217.2 / 70.2 | 1691.2 | 2.26 / 7.1 | 0 | 3606 |
| lottie-mark | 1080p | 250.2 / 56.7 | 2782.8 | 2.61 / 17.2 | 0 | 7143 |
| aurora | 720p | 4132.0 / 3628.4 | 8954.7 | 43.04 / 58.1 | 0 | 360562 |
| aurora | 1080p | 5084.6 / 5016.4 | 12437.0 | 52.96 / 63.0 | 0 | 695947 |
| shader | 720p | 2243.2 / 1732.1 | 5153.6 | 23.37 / 38.6 | 0 | 366952 |
| shader | 1080p | 3774.8 / 3865.5 | 9976.5 | 39.32 / 61.1 | 0 | 825600 |
| typography | 720p | 261.4 / 60.1 | 1688.0 | 2.72 / 13.0 | 0 | 1597 |
| typography | 1080p | 319.9 / 83.6 | 2977.5 | 3.33 / 22.1 | 0 | 2850 |
| svg-infographic | 720p | 280.0 / 74.3 | 1682.0 | 2.92 / 23.3 | 0 | 9392 |
| svg-infographic | 1080p | 293.2 / 117.0 | 2915.6 | 3.05 / 22.4 | 0 | 19785 |
| chart | 720p | 265.9 / 90.2 | 1694.0 | 2.77 / 13.2 | 0 | 15592 |
| chart | 1080p | 330.2 / 98.1 | 2926.3 | 3.44 / 23.9 | 0 | 25894 |
| parallax | 720p | 417.4 / 200.1 | 1978.0 | 4.35 / 17.6 | 0 | 554185 |
| parallax | 1080p | 548.9 / 351.4 | 3387.0 | 5.72 / 19.1 | 0 | 1242483 |

Maximum channel difference is **0/255 for all 20 comparisons** in this browser.
No blank frames occurred under the >500-pixel assertion. Largest observed frame
round trip: **96.7 ms**; largest two-bake/comparison total: **12437.0 ms**, below
the documented 5000 ms / 120000 ms rejection budgets. These are offline bake
results, not a claim of continuous real-time 1080p playback.

PNG-cache flow (chart, 720p): **96 frames, 1617.8 ms, 7,173,425 encoded bytes**;
raw frame size 3,686,400 bytes. The working-pixel estimate is **22,118,400 bytes**
at 720p and **49,766,400 bytes** at 1080p (six RGBA surfaces); it is not measured
process/GPU memory and excludes JS/library/browser overhead.

### Hostile-case outcomes

| Case | Actual CI message | Host recovered |
| --- | --- | --- |
| fetch | Safely rejected: Line 1: fetch is unavailable. Use inline assets and the canvas/helpers only. | Yes |
| WebSocket | Safely rejected: Line 1: WebSocket is unavailable. Use inline assets and the canvas/helpers only. | Yes |
| parent | Safely rejected: Line 1: parent is unavailable. Use inline assets and the canvas/helpers only. | Yes |
| storage | Safely rejected: Line 1: localStorage is unavailable. Use inline assets and the canvas/helpers only. | Yes |
| loop | Safely stopped: Error: Execution budget exceeded: simplify loops or reduce particle counts. | Yes |
| allocation | Safely stopped: Error: Allocation budget exceeded: at most 64 MiB of explicit array allocations per session. | Yes |
| import | Safely rejected: Line 1: Imports are unavailable. Select bundled libraries with meta.libs. | Yes |
| timeout | Safely stopped: Error: Frame timeout exceeded; sandbox removed. | Yes |

Each test then selected and rendered the chart successfully. These eight cases
are evidence of their specific defenses, not proof of arbitrary-code isolation.

### Screenshot and attachment inventory

The artifact contains **ten explicit PNG attachments** named `<sample>-1080p`,
ten `<sample>-measured.json` attachments, eight `<case>-hostile.json` attachments
and `png-bake.json`. The Playwright report and e2e-results/results.json preserve
all measurements. Screenshots are CSS-sized captures of the 1920×1080 canvas,
with a transparency checkerboard. All ten initial stills and the corrected shader
still were reviewed. No full-motion video was recorded or manually reviewed.

## 4. Try-it script for the owner

CI performed these browser steps; the local environment could not launch Chromium.

| Step | Action | Evidence |
| --- | --- | --- |
| 1 | npm ci; npm run freecode:gallery; open port 5176 /freecode-gallery/ | CI gallery loads through the same source |
| 2 | Select each study at 1080p | Ten thumbnail PNG attachments |
| 3 | Benchmark 720p + 1080p | All 96 frames per bake, measurements above |
| 4 | Edit chart title, validate, bake | PNG-cache test passed |
| 5 | Scrub and play; cancel | Controls work and iframes are removed |
| 6 | Run all eight hostile cases, then select chart | Eight recovery JSON attachments |
| 7 | Paste an authoring worked example | Static authoring examples only; this paste flow was not separately browser-tested |

## 5. Deviations from the brief

- Kept explicitly requested setup/progress/report paths and the gallery npm script
  outside the enumerated new folders. No other existing product paths changed.
- Local libraries are compressed committed bundles; root dependencies/lockfile
  remain unchanged. Notices for bundled subcomponents are retained.
- No claim of hard hostile-code isolation, GPU memory measurement or cross-device
  pixel parity. Added cooperative budgets and conservative diagnostic bans.
- Browser evidence came from CI because local Chromium launch failed at
  process_singleton_posix.cc: socket() Operation not permitted. Automatic approval
  review rejected the escalated launch; no bypass was attempted.

## 6. Decisions made

D-240–D-248 are in docs/FREECODE.md: isolated scope, API publication, isolation
gaps, GSAP omission, local bundles, clock units, example families, test treatment,
and direct AST emission. Shader premultiplication guidance is in the authoring doc.

## 7. Not tested, known gaps, risks

- CV-054's unrelated 1-pixel toolbar flake remains outside this task's editor scope.
- No full temporal flicker review, other browsers/GPUs, owner's Windows reference
  hardware, arbitrary plugins or malicious obfuscation audit. Still review and
  no-blank-frame assertions do not establish every aspect of professional quality.
- AST deny scanning and CSP are defense in depth. Same-process iframe removal
  cannot preempt every runaway or provide hard memory/CPU/egress containment.
- Allocation accounting covers direct named array constructors, not all array
  growth, strings, native/GPU allocations or library internals.
- No-op timers can stall timer-driven code. Only bundled libraries/inline assets
  are supported. PNG cache is memory-only with a 128 MiB limit; no OPFS integration.
- No editor/export/schema integration was requested or performed.

## 8. Architecture, dependencies and licence findings

Standalone runtime; imports existing Block params/helpers/types. No schema change.

| Library | Version | Decoded / gzip bytes | Licence / purpose |
| --- | --- | --- | --- |
| three | 0.170.0 | 684980 / 175921 | MIT / procedural 3D |
| pixi.js | 7.4.3 | 456168 / 136581 | MIT / 2D graphics |
| lottie-web | 5.12.2 | 265947 / 67803 | MIT / inline animation JSON |

All pinned versions are older than two weeks; dates/hashes/full texts are in
THIRD-PARTY.md and vendor notices. Bundled components include ISC earcut,
BSD-3-Clause PIXI FXAA and MIT helpers. **GSAP omitted**: its current official
licence restricts competing visual animation builders; this editor's use is not
clearly permitted. Licence findings did not change during this CI repair.

## 9. Ledger and backlog

No global ledger/status/backlog edits. Full green verification accepted the
existing ledger mapping. The CV-054 observation is recorded here to respect the
owner's path restrictions and avoid unrelated editor changes.

## 10. Git

Branch codex/free-code-runtime, based on main. One [draft PR #27](https://github.com/i2rlearning1998/my-codex-video-editor-ai/pull/27),
not merged. Small commits, no force push/history rewrite. Git Data API publication
was followed by local fast-forward because terminal push has no credentials.

- b44f5e9: executable sandbox emission, regression tests, explicit proof attachments.
- a8fc478: corrected shader alpha, compositing and per-frame visibility assertions.
- Following report-only commit records these measured results; implementation
  evidence above is pinned to a8fc478, not an unverified future code change.

## Owner tick-list

| Area | OK / BUG / MISSING / CHANGE |
| --- | --- |
| Ten compositions and motion quality | |
| Params, bake, play and scrub | |
| Hostile-case recovery | |
| Authoring instructions | |
| Production isolation gap | |
