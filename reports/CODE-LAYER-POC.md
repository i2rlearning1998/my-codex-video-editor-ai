# Code-layer PoC report — B0–B5

Branch: `codex/code-layer-poc`, based on main `9362645`.
One PR: [#21](https://github.com/i2rlearning1998/my-codex-video-editor-ai/pull/21).
No merge. The editor, schema 5, renderer, export, timeline, UI, PR #14 and Claude's
branches are untouched. Only the permitted new paths and one package script are
changed. No dependencies or lockfile changes.

## Built and checked locally

| Part | Delivered | Evidence and limit |
| --- | --- | --- |
| B0 | Typed block/param contract; indexed RNG; CSS easing; closed-form spring; validation; transparent clipped render wrapper | Unit call logs prove determinism, 3→1→3 order independence, finite arguments, param rejection, input immutability and balanced state; not pixel proof |
| B1 | Four original blocks: counter, particle burst, data pipeline, kinetic letters; params and thumbnail poses | Unit tests plus ballistic second differences/lifetime checks; visual quality awaits owner |
| B2 | AST validator; restricted drawing facade; scrubbed dedicated worker; message errors; main-thread 250 ms termination | Actual Node worker_threads tests contain an infinite loop while host timer runs, reproduce call logs, recover after runtime errors and dispose safely; recording canvas only |
| B3 | Standalone gallery; editable generated controls; time/play; paste code; 120-frame 720p/1080p benchmark; five-time pixel Export check | Gallery typecheck and production build pass. Nine new Playwright cases added in one file, but local browser cannot launch |
| B4 | Pure centre-based affine camera; depth/parallax; seeded smooth shake | Six unit tests cover identity, centre/rotation, ratios, shake, exact apply matrix and invalid input; no camera UI/integration |
| B5 | Contract/security/AI guide with two validated examples; integration guide; v7 proposal; this report and checkpoint | Source-based proposal only; no schema implementation or app wiring |

Local `npm run check` passes: **433 tests in 41 files**, formatting, both existing
TypeScript checks, unit tests and app build. The separate gallery check
`npx tsc --noEmit -p blocks-gallery/tsconfig.json` and production build
`npx vite build --config blocks-gallery/vite.config.ts` also pass. The existing
app build has its prior large-chunk warning; the new gallery compiler chunk is
~3.58 MB uncompressed / ~1.02 MB gzip because it lazily loads the existing
TypeScript parser. The sandbox worker bundle is ~12.36 kB.

Node/npm used locally: Node 24, npm 11.9. No local browser interaction or
screenshots were produced. Unit output is not presented as a visual review.

## Browser and CI status — not Verified

One local command attempted:
`npx playwright test e2e/code-layer-poc.spec.ts --max-failures=1`.
It stopped at browser launch because Microsoft Edge was absent at
`/opt/microsoft/msedge/msedge`. One launch failure, eight cases not run; no
browser assertions executed. No tests were skipped, weakened or marked expected
failure to hide this. Full `npm run verify` is **not** claimed green.

One CI snapshot was inspected for B4 commit
`b30b218784fd6872989246c7e02d3f2636d8d030`:
[Verify run 249](https://github.com/i2rlearning1998/my-codex-video-editor-ai/actions/runs/37676185453)
was **in progress**, with no conclusion. It is not proof of a pass, and it is not
the final B5 documentation commit. No recurring monitoring or rerun loop was set
up. The existing CI workflow installs Chromium and runs `npm run verify`; its
Windows Chrome job covers the existing exporter only. The owner must inspect the
latest PR run and the nine `code-layer-poc.spec.ts` results before accepting the
browser claims. Feature ledger/status files remain unchanged as instructed.

| Measurement | Local result |
| --- | --- |
| Main Canvas vs direct OffscreenCanvas, four blocks × five times | Not measured; browser required |
| Main Canvas vs worker OffscreenCanvas, same frames | Not measured; browser required |
| Browser scrub-order pixel identity | Not measured; browser required |
| Browser infinite-loop containment/fetch rejection/recovery | Spec added; only Node containment and AST rejection run locally |
| 720p / 1080p main and worker average ms/frame | Not measured; use Benchmark and report numbers |
| Existing editor preview vs encoded export | Not wired or tested by this PoC |

The Export check uses **zero-byte tolerance** and reports the maximum difference
across all RGBA channels. Exact equality is scoped to the same browser/device/fonts.
Its export path is the isolated Offscreen evaluator, not the existing app exporter.
For pasted code, both paths run in separate workers; it never executes on the main
thread. Its main-thread benchmark field is null for that reason. Benchmark times
measure Canvas submission work, not forced GPU completion or video encoding.

## Limits and gaps

The requested B0–B5 source/documentation is present; browser evidence and owner
visual/performance acceptance remain open. No portable font package, cross-browser
pixel guarantee, real editor integration, source editor IDE, camera UI, schema
migration, production sandbox hardening or encoder benchmark was built.

The sandbox accepts a documented restricted JavaScript subset, not arbitrary
modules. Existing TypeScript parses source without evaluating it; user execution
uses dynamic function construction only inside a disposable worker. The host must
pass unchanged successful compiler results. Static validation, capability removal,
drawing limits and a watchdog are defense in depth, not a reviewed security
boundary. Memory exhaustion can precede termination and affect the host process.
A separate-origin sandboxed iframe/CSP design and resource review remain required
before hostile third-party code is enabled in production. A restrictive CSP may
currently prevent worker function compilation, which must surface as an error.

Schema v7 is a proposal only. Main is version 5 and has no version 6 migration.
Integration must reconcile that predecessor before shipping. Current layers have
no metadata slot; the proposal uses existing property/keyframe records for
per-layer params and introduces explicit code/camera data only after approval.

## Six-step owner test (not run here)

For each step report **OK / BUG / MISSING / CHANGE** with one sentence. If a check
fails, keep its displayed message and the selected block/params/time/seed.

1. Check out `codex/code-layer-poc`, run `npm ci`, then `npm run blocks:gallery`.
   Open `http://127.0.0.1:5175` in Chrome or Edge. Expect the isolated laboratory,
   four starter poses and a transparent checkerboard preview. This is not the
   editor's UI. Note browser/version and machine. (B3)
2. Select all four blocks in turn. Press Play, pause, edit params, then enter time
   3, 1, 3. The two 3-second poses should look identical for the same params/seed.
   Change the particle seed: its arrangement should change without random flicker
   while seeking. Watch the counter, flowing dots and springing letters. (B0/B1)
3. Click **Compile in worker** on the prefilled Orbit card, or paste either complete
   example from `docs/CODE-LAYER.md`. Expect “Worker frame OK”, generated parameter
   controls and scrub-safe motion. Edit its text/color/speed. (B2/B3)
4. In that sample's render body temporarily insert `fetch('https://example.com')`:
   Compile should show a validation error. Replace it with `while(true) {}`:
   Compile should show worker termination after the 250 ms frame budget (startup
   is separate), while the page remains usable. Remove the hostile statement and
   compile again; the animation should recover. Do not attempt memory-exhaustion
   probes against this prototype. (B2)
5. Select each starter and press **Benchmark**. Wait for completion; copy the
   displayed 720p and 1080p mainMs, workerMs and workerRoundTripMs (120 frames each).
   Repeat for the pasted sample if desired; its mainMs must be null. Report the
   numbers with the browser/machine; no hardware-independent threshold is claimed.
   A timeout is a result to report, not a reason to disable the watchdog. (B3)
6. Press **Export check** for each starter and the pasted sample. Expect pass true,
   maxDifference 0, and five times. Copy the result if it fails. Run
   `npx playwright test e2e/code-layer-poc.spec.ts` in a supported installed browser,
   then inspect the latest PR CI run before accepting. Report any visual problems
   as well as the numbers. Do not merge until you accept the results. (B3/B5)
