# Report: FIX5-CODEX engine/performance (2026-10-24)

## 1. Summary

Draft, not ready to merge. Composition construction now stages semantic commands, validates the completed project and yields during layout. The composition slot dialog shows measured build progress and cancels its build on close/rebuild. Reusable preview passes have a pixel budget and bounded cache. Filter input/hover previews without history; release commits once. Late image decoding no longer wakes a disposed editor. Browser acceptance remains unproved.

## 2. Scope and results

| Part / ID | Result | Evidence |
| --- | --- | --- |
| P1 / F2-070, FN3-021 | Partial | `tests/fix5/composition.test.ts`: old documentary result equals new result, IDs/order/timing included; event-loop callback runs during build; cancellation restores UUID scope. |
| P2 / FX-015 | Partial | `tests/fix5/processed-cache.test.ts`: hit/miss, invalidation keys, LRU memory bound and ownership. Existing renderer tests pass. Not a pixel/performance acceptance test. |
| P3 / FX-004 | Implemented, browser proof missing | `tests/fix5/filter-preview.test.ts`: actual FX pixels differ before commit; canonical history remains empty; release creates one undo; cancel and undo restore. |
| P4 / MED-006 | Partial audit; one bug fixed | `tests/fix5/media-dispose.test.ts`: fake delayed image decode does not notify after disposal. |

Newly Verified ledger items: **0** (browser/verify criteria not met).

### Measured numbers

- Documentary-mini, Node/Vite SSR, one warmed measurement each, same process: **148.91 ms → 19.46 ms**. Output equality: **true**. This includes cooperative yields; it is not a browser long-task measurement or a statistical benchmark.
- Initial cold measurements: 763.90 ms / 605.99 ms, dominated by lazy module loading; not a claimed renderer speedup.
- Browser long tasks, click latency, 1920×1080 and portrait mask/chroma/blur/glow frame costs: **not measured**. Chromium launch failed because its executable is not installed.
- Preview budget: 921,600 pixels; cache cap: 24 MiB per output canvas. These are configured limits, not measured performance.

## 3. Checks (real tails)

`npm run verify` invoked exactly once; exit **2**. Formatting passed, then typecheck failed. Our type inference errors were corrected afterward; only typecheck and targeted tests were rerun.

```text
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

> ai-native-video-editor@0.1.0 verify
> npm run check && npm run e2e && node scripts/assert-no-test-hook.mjs && npm run ledger -- --report e2e-results/results.json

npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

> ai-native-video-editor@0.1.0 check
> npm run format:check && npm run typecheck && npm test && npm run build

npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

> ai-native-video-editor@0.1.0 format:check
> prettier --check .

Checking formatting...
All matched files use Prettier code style!
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

> ai-native-video-editor@0.1.0 typecheck
> tsc --noEmit && tsc --noEmit -p tsconfig.e2e.json

src/core/project-build.ts(19,5): error TS2589: Type instantiation is excessively deep and possibly infinite.
src/speech/whisper.ts(165,22): error TS2307: Cannot find module '@huggingface/transformers' or its corresponding type declarations.
src/speech/whisper.worker.ts(49,18): error TS2307: Cannot find module '@huggingface/transformers' or its corresponding type declarations.
src/speech/whisper.worker.ts(78,20): error TS2307: Cannot find module '@huggingface/transformers' or its corresponding type declarations.
```

Final standalone typecheck, exit **2** (no errors in changed files):

```text
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

> ai-native-video-editor@0.1.0 typecheck
> tsc --noEmit && tsc --noEmit -p tsconfig.e2e.json

src/speech/whisper.ts(165,22): error TS2307: Cannot find module '@huggingface/transformers' or its corresponding type declarations.
src/speech/whisper.worker.ts(49,18): error TS2307: Cannot find module '@huggingface/transformers' or its corresponding type declarations.
src/speech/whisper.worker.ts(78,20): error TS2307: Cannot find module '@huggingface/transformers' or its corresponding type declarations.
```

Final targeted run (only touched specs and regressions), exit **0**:

```text
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

 RUN  v4.1.11 /workspace/scratch/a2711b159a0a/my-codex-video-editor-ai


 Test Files  8 passed (8)
      Tests  44 passed (44)
   Start at  18:29:49
   Duration  4.69s (transform 5.69s, setup 0ms, import 7.63s, tests 3.68s, environment 1ms)
```

Earlier per-part runs: P1 9 passed; P2 29 passed; P3 5 passed; P4 30 passed. These overlap; do not add them. Full unit suite, build, e2e, hook assertion and ledger were **not reached**. CI not polled. No ledger-red claim; the gate did not run. The known sandbox flakes were not chased.

## 4. Try-it script for the owner

| # | Do this | Expect | ID | Codex ran in browser | Screenshot |
| --- | --- | --- | --- | --- | --- |
| 1 | Import documentary-mini composition; open Build video | Progress advances; cancel closes and stops construction | F2-070 | N | None |
| 2 | Reopen and add the scenes, then undo | Existing single add transaction is undone; IDs/order/timing preserved | F2-070 | N | None |
| 3 | Apply mask/chroma/filter to a PNG; redraw paused | Reuses processed pass; editing settings invalidates it | FX-015 | N | None |
| 4 | Drag filter intensity, pause before release | Canvas changes before release; release adds one undo | FX-004 | N | None |
| 5 | Hover another filter, then leave | Transient preview clears without history | FX-004 | N | None |

These are owner acceptance steps, not completed browser proof.

## 5. Deviations from the brief

- Circumference plan was not found in the fixture locations searched; documentary-mini was used. No fabricated Circumference result.
- Plan Build video's finisher and dialog/card wiring are outside the owned files. Backlog requests the Claude-owned call sites consume `signal`/`onProgress`. This does not establish the full drop flow fix.
- Progress uses a native progress bar and step/percent text; the requested motion-aware SVG/CSS loader is not implemented.
- Preview caching/budget currently covers reusable immutable image/shape passes. Video, text, non-normal backdrop blends and animated/unknown image formats bypass it. No claim that all reported lag is resolved.
- P4 was a focused media/cache inspection, not an exhaustive one-hour audit.
- No release tag or new Verified statuses: draft acceptance is incomplete. No merge.

## 6. Decisions made

D-302 (proposed) in `docs/DECISIONS.md`: isolated command staging with frozen draft reads, cooperative layout, bounded preview processing, export bypass. No change to ordinary EditorEngine transaction validation/history semantics.

## 7. Not tested, known gaps, risks

No real-browser responsiveness, animation loader, drag/drop, pixel parity, 60 ms frame budget or GPU behavior proof. Full project validation and library/camera/theme finishing still execute synchronously; unusually large individual commands may exceed a frame budget. A cached pass is eligible only with normal backdrop compositing. Full-resolution export remains on the existing path, but exact export pixels have not been compared in a browser. Paused playhead changes currently invalidate the cache conservatively. The media decoder's live URL/image maps still need fingerprint invalidation after relinking, and video event listeners need release cleanup (backlog). Speech typecheck is blocked by missing installed transformer dependency; speech files were not edited.

## 8. Architecture and contract impact

- Schema **9 unchanged**; no dependencies added.
- `BuildOptions` adds optional `signal` and `onProgress({step, percent})`; abort rejects with the signal's reason. Invalid-input reports keep their existing shape.
- `ProjectBuild` applies the existing command validators/handlers to an isolated offline project; `state` returns frozen copies, `finish` validates. Published editor edits still use Command Bus.
- New `createProcessedCache`/`frameIdentity` renderer helpers; `createFilterPreview` uses `engine.preview` and session previewSource.
- Existing engine/render/media files touched: `src/composition/build.ts`, `src/render/canvas.ts`, `src/media/frames.ts`. No export file edits. Core staging is new `src/core/project-build.ts`.
- UI edits limited to owned composition dialog and Filters portions of right panel plus FX tile/slider callbacks. No speech/audio/library-card/Adjust list edits.

## 9. Ledger and backlog

No ledger statuses changed and no LCR applied. Two FIX5 backlog bullets record the out-of-ownership UI integration and renderer/media follow-ups. STATUS/CHANGELOG record draft status only.

## 10. Git

Branch `codex/fix-5-engine`, base/PR target `claude/fix-4`. Per-part changes committed and published through GitHub tree/commit/update-ref after shell push failed for credentials. One draft PR; not merged. Review patch/stat accompany this report.

## Owner tick-list

| ID | OK / BUG / MISSING / CHANGE | One sentence |
| --- | --- | --- |
| F2-070 / FN3-021 | | |
| FX-015 | | |
| FX-004 | | |
| MED-006 | | |
