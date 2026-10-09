# FX engine library — F0–F5 handoff

**Built:** 5 colour adjustments, 47 filters, 28 effects (18 tier A + 10 tier B), 21 transitions (16 tier A + 5 tier B), 16 Canvas blend-mode mappings and the fade helper. One PR: [#19](https://github.com/i2rlearning1998/my-codex-video-editor-ai/pull/19), ready, unmerged. No editor wiring, schema or dependency changes. All assets/looks are original code.

**Proof:** `npm run check` passes; 621 unit/jsdom tests in 44 files, of which 233 tests in 9 files are FX-specific. All 101 processing definitions have exact endpoint/zero-intensity, deterministic-byte, input-immutability and size/alpha tests, plus guarded writes that reject NaN/Infinity before typed-array conversion. Node main/Worker byte parity covers all 101. Standalone gallery production build passes. No Playwright suite was run, by explicit owner instruction. Browser visual quality, browser-worker parity and actual editor/export integration are **not verified**.

**Remaining:** performance targets are not met by every item; see measured exceptions below. AI background removal and Animate presets are intentionally not implemented. No requested tier A/B item was dropped. Owner visual acceptance and Claude's app integration are separate next steps.

Standalone original CPU RGBA library, not integrated into the editor. No schema, UI or renderer changes. Owner acceptance of visual quality is pending.

## Decisions

- FX-D01: The explicit task overrides the generic wave reporting/e2e rules: only `npm run check`, no Playwright, no ledger/status/decision-log edits. `briefs/FX.md` is the explicit progress-file exception to the creation allowlist.
- FX-D02: Main baseline is `9362645`. The shared drawComposition exists; the named src/render/transitions.ts does not exist on this main. Do not add the seven excluded layer transitions anyway.
- FX-D03: Input/output buffers must not overlap (including overlapping views); reject malformed surfaces/contexts. Params clamp numeric ranges, ignore unknown fields and default nonfinite or wrong-type values. Invalid transition progress throws. Positive integer dimensions; maximum 33,554,432 pixels per surface to reject pathological allocations.
- FX-D04: Process display-encoded sRGB bytes, straight alpha. Colour operations preserve input alpha. Spatial effects resample alpha with colour; alpha-modifying effects declare it. Cross-surface mixing uses premultiplied weights and writes straight alpha. Spatial sampling is nearest-neighbour, explicitly avoiding dark interpolated alpha fringes; quality limitation on rotations is documented.
- FX-D05: IDs are namespaced and stable. English names/labels are library metadata; the standalone lab has its own plain controls, not editor UI. All looks and code are original, no external assets/LUTs/shaders.

## Contract

`Surface = {width,height,data:Uint8ClampedArray}`; RGBA straight alpha; input never written. `Context = {time,duration,seed,width,height}` in clip-local seconds, finite values, integer seed. Time magnitude and duration are capped at 1e9 seconds to reject arithmetic overflow; negative duration is invalid. Each item declares id/name/category/kind/params/alpha/apply. Every effect/filter/adjustment has intensity 0..1 default 1, exact byte identity at zero. Transition endpoints copy exactly, duration-independent progress clamps 0..1. Lists/getters, defaults, sanitize, renderStack and renderThumbnail are exported from src/fx/index.ts. Stack owns two ping-pong buffers and rejects unknown IDs; empty stacks return a fresh copy. Thumbnail returns a Surface, not a DOM element. Transition tiles use a deterministic second colour-shifted source at progress .5. No globals, DOM, browser APIs, other src imports or dependencies in the library.

## Progress and verification

F0 foundation checkpoint (F1–F5 results are below). Run `npm run fx:gallery`, open the printed local URL. Choose category/item, adjust parameters, scrub or play time, inspect category thumbnails; drop a local image. Generated scene and portrait samples use canvas shapes/gradients/text; no image files. Gallery visual browser acceptance has not been performed. The editor build does not import this library.

F0: npm run check passed (format, typecheck, unit suite, editor build). No Playwright run.

## F1 decisions

FX-D06: Exposure spans −2..+2 stops, contrast uses a 0.25..4 gain around mid-grey, saturation spans greyscale..2× chroma, temperature adds a bounded warm/cool channel offset. Amount 0 is exact identity. Transparency −1 removes alpha, +1 makes nonzero-alpha pixels opaque; zero-alpha pixels stay invisible. `adjustmentDefaults` is a reset-friendly list; intensity always defaults to 1. Blend modes are metadata only, with Canvas operation strings; no CPU blend implementation is implied. Fade lengths each cap at half duration; outside clip bounds and nonpositive duration return 0; nonfinite arguments throw.

F1: npm run check passed, 398 tests in 37 files. Historical Vite-SSR development benchmark on AMD EPYC 9V74 80-Core Processor: adjust.exposure 3.5 ms, adjust.contrast 3.55 ms, adjust.saturation 6.36 ms, adjust.temperature 6.04 ms, adjust.transparency 5.34 ms, filter.none 0.65 ms. These initial SSR timings include development module wrappers and are not directly comparable with the final bundled ES-module benchmark. Timing is descriptive, not a test gate.

## F2

47 original filters, including 4 duotones and 9 overlays. Shared compiled channel curves, luma saturation and split-tone tables; optional radial vignette and seeded frame-grain. Overlay strength at full intensity is 45%, so the source remains visible. All B&W variants use zero chroma. Unit coverage includes all IDs, distinct look outputs, exact zero-intensity identity, B&W saturation, overlays and seeded grain. npm run check passed. Initial slowest median: 37.08 ms (filter.old-western). Final per-item results follow after the performance pass.

## F3

18 tier A effects implemented; npm run check passed, 469 tests in 39 files. Motion controls use clip-local normalized time; loop is opt-in for finite zooms/rotations, periodic Pulse/texture effects use seconds × speed. Random zoom picks a stable direction from the seed. Radii/offset/block sizes scale from a 720-high/1280-wide reference. Pixelation's 16-bit option means RGB565 (65,536 possible colours), not a 16-colour palette.

FX-D07: Blur is a linear-time separable box blur, not a Gaussian claim; accumulates premultiplied colour then returns straight RGB, preserving original alpha. Blur fill overlays a scaled foreground (default .72) on an enlarged blurred background; it is an aesthetic framing operation, not automatic subject segmentation or aspect-ratio detection. Glow blurs isolated highlights and screens them; Diffusion mixes a softened image back into the original. Spatial transforms use transparent borders except zoomed/clamped texture backgrounds.

## F4

16 pixel transitions implemented. npm run check passed. Exact endpoints and duration-independent progress; hard up/down, soft four directions, diagonal and circular wipes have monotonic covered-area tests. Burn includes a warm singe before/after a black midpoint (the fade-through-black measurement); no separate fade-black/white or crossfade definition duplicates the excluded layer transitions. Push translates both complete sources with no new third buffer; Spin/Zoom/Swirl resample both sources then alpha-aware mix. Params do not include duration: the host supplies normalized progress. PR #19 is marked ready after this checkpoint; F5 continues on the same PR as requested. No merge.

## F5 implementation and decisions

- FX-D08: Complete tier B with original CPU algorithms. Vertical is an animated column-wise displacement wave; Radial is a six-tap centre-directed blur; Glass refracts through crossed sine waves; Retro graphics is quantized halftone; Smoke is two-octave smooth procedural noise. Page turn and Cube / 3D flip are **2.5D raster approximations**, with folded-back shading/perspective-like face scaling, not a 3D scene engine or physical paper simulation.
- FX-D09: Chroma key uses normalized RGB distance to an arbitrary six-digit screen colour with threshold and soft edge. Black/white removal keys near-neutral extremes. These are colour keys, not subject recognition; no AI, hair matting, spill suppression or temporal tracking is claimed.
- FX-D10: Performance work specializes opaque blur, unrolls channel loops, uses aligned packed pixels for transforms (unaligned views use the tested byte path), precomputes radial sample coordinates and uses an interpolated 2048-interval trig table for Swirl. Cross blur mixes first then blurs the premultiplied mixture; this saves a blur pass with at most intermediate byte-quantization differences versus blur-then-mix. It is not a Gaussian blur.
- FX-D11: Kaleidoscope retains **one coordinate map**, keyed by width/height/segments, never pixels or project state. Maximum retained map: 2,097,152 entries (8 MiB); larger maps are transient and discarded after the call. `clearEffectCaches()` releases it on session teardown. Cold and warm outputs match after eviction/clear. Other frame scratch buffers are temporary; no unbounded image cache.
- FX-D12: Preserve original immutable input, reject overlapping views and oversized/malformed dimensions. Guard context time/duration at 1e9 seconds (over 31 years), avoiding overflow in temporal expressions. Numeric params are clamped/defaulted; malformed colours/select options default. Stored JSON validation remains the future host command's responsibility. No tests or timing thresholds were weakened.

## Performance measurements

Run from repository root:

```sh
node fx-gallery/scripts/fx-bench.mjs
node fx-gallery/scripts/fx-bench.mjs --alpha
node fx-gallery/scripts/fx-runtime.mjs
```

The script bundles ES modules **in memory using existing Vite**, then runs them in Node; no new dependency or generated source file is needed. Hardware: AMD EPYC 9V74 80-Core Processor; Node v24.19.0, Linux sandbox, **not the owner's Ryzen reference PC**. 1280×720, one initial call, three warmups, seven timed samples, median and worst sample; allocations are included. All defaults except adjustment `amount=.5`; time 1.37 s of 4 s, seed 42; transitions at .43. First-call cost includes JIT/cache setup. This is one static parameter/progress benchmark, not a changing-progress playback benchmark. Opaque gradient/geometry input and a separate varying-alpha input are measured. Worst parameters, 1080p/4K, stacks, colour readback/upload and browser scheduling are not covered. No timing assertion is in tests.

Raw data is in `fx-gallery/benchmarks.json`, including the pre-optimization bundled baseline. The earlier F1/F2 SSR numbers above are historical and use a different harness. Before/after bundled examples: Kaleidoscope 81.37 ms before (warm) versus the final table; Radial 55.98 ms before; Cross blur 78.66 ms before; Swirl 97.60 ms before. The table is the final measurement, not a performance guarantee.

Targets: adjustments ≤8 ms, filters ≤15 ms, effects ≤40 ms, transitions ≤25 ms. `Slow` means either measured median exceeds its category target. `Tested` means library unit/Node-Worker proof only; **all visuals await owner review**. Blend mappings have no pixel kernel to time. Times are milliseconds.

| ID / name                                            | Parameters (defaults; bounds/options)                                                              | Status       | Opaque median / worst | First call | Alpha median |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------ | --------------------: | ---------: | -----------: |
| `adjust.exposure` — Exposure                         | intensity=1 (0..1); amount=0 (-1..1)                                                               | Tested       |           3.52 / 3.78 |       7.85 |         3.59 |
| `adjust.contrast` — Contrast                         | intensity=1 (0..1); amount=0 (-1..1)                                                               | Tested       |           3.48 / 3.88 |       3.81 |         3.47 |
| `adjust.saturation` — Saturation                     | intensity=1 (0..1); amount=0 (-1..1)                                                               | Tested       |           6.28 / 6.75 |       8.56 |         6.05 |
| `adjust.temperature` — Temperature                   | intensity=1 (0..1); amount=0 (-1..1)                                                               | Tested       |           5.89 / 6.09 |       6.08 |         5.96 |
| `adjust.transparency` — Transparency                 | intensity=1 (0..1); amount=0 (-1..1)                                                               | Tested       |           3.26 / 3.54 |       4.53 |         3.22 |
| `filter.none` — None                                 | intensity=1 (0..1)                                                                                 | Tested       |           0.65 / 0.89 |       0.76 |         0.63 |
| `filter.retro` — Retro                               | intensity=1 (0..1)                                                                                 | Tested       |         12.22 / 12.59 |      14.13 |        10.69 |
| `filter.orange-teal` — Orange and teal               | intensity=1 (0..1)                                                                                 | Tested       |         12.20 / 14.35 |      11.70 |        11.34 |
| `filter.bold-blue` — Bold and blue                   | intensity=1 (0..1)                                                                                 | Tested       |         12.37 / 17.24 |      12.18 |        11.05 |
| `filter.golden-hour` — Golden hour                   | intensity=1 (0..1)                                                                                 | Tested       |         11.82 / 11.98 |      11.99 |        10.40 |
| `filter.vibrant-vlogger` — Vibrant vlogger           | intensity=1 (0..1)                                                                                 | Tested       |         11.40 / 12.84 |      11.65 |        11.10 |
| `filter.purple-undertone` — Purple undertone         | intensity=1 (0..1)                                                                                 | Tested       |           9.66 / 9.94 |       9.63 |        10.09 |
| `filter.winter-sunset` — Winter sunset               | intensity=1 (0..1)                                                                                 | Tested       |           9.51 / 9.94 |       9.57 |         9.89 |
| `filter.35mm` — 35mm                                 | intensity=1 (0..1)                                                                                 | Tested; Slow |         15.07 / 38.86 |      20.69 |        14.75 |
| `filter.contrast` — Contrast                         | intensity=1 (0..1)                                                                                 | Tested       |         10.15 / 10.37 |       9.97 |        11.28 |
| `filter.fall` — Fall                                 | intensity=1 (0..1)                                                                                 | Tested       |           9.56 / 9.80 |       9.69 |        10.10 |
| `filter.winter` — Winter                             | intensity=1 (0..1)                                                                                 | Tested       |         11.18 / 13.15 |      11.04 |        10.97 |
| `filter.old-western` — Old western                   | intensity=1 (0..1)                                                                                 | Tested       |         14.77 / 15.19 |      15.06 |        14.84 |
| `filter.warm-coastline` — Warm coastline             | intensity=1 (0..1)                                                                                 | Tested       |         14.28 / 15.49 |      12.69 |        11.43 |
| `filter.cool-coastline` — Cool coastline             | intensity=1 (0..1)                                                                                 | Tested       |         10.89 / 11.05 |      11.04 |        11.19 |
| `filter.warm-countryside` — Warm countryside         | intensity=1 (0..1)                                                                                 | Tested       |         10.92 / 12.85 |      10.39 |        11.18 |
| `filter.cool-countryside` — Cool countryside         | intensity=1 (0..1)                                                                                 | Tested       |         10.39 / 10.59 |      10.45 |        10.60 |
| `filter.golden` — Golden                             | intensity=1 (0..1)                                                                                 | Tested       |          9.66 / 10.31 |       9.59 |        10.14 |
| `filter.dreamscape` — Dreamscape                     | intensity=1 (0..1)                                                                                 | Tested       |         11.58 / 12.44 |      10.83 |        11.16 |
| `filter.sunrise` — Sunrise                           | intensity=1 (0..1)                                                                                 | Tested       |         13.13 / 14.53 |      10.79 |        11.03 |
| `filter.warm-tone` — Warm tone                       | intensity=1 (0..1)                                                                                 | Tested       |          9.50 / 10.25 |       9.68 |         9.40 |
| `filter.cool-tone` — Cool tone                       | intensity=1 (0..1)                                                                                 | Tested       |           9.35 / 9.55 |       9.39 |         9.59 |
| `filter.pastel-dreams` — Pastel dreams               | intensity=1 (0..1)                                                                                 | Tested       |         10.45 / 10.89 |      10.63 |        10.74 |
| `filter.scenery` — Scenery                           | intensity=1 (0..1)                                                                                 | Tested       |         10.90 / 11.66 |      11.66 |        11.62 |
| `filter.portrait` — Portrait                         | intensity=1 (0..1)                                                                                 | Tested       |         10.71 / 11.28 |      10.56 |        10.86 |
| `filter.indoors` — Indoors                           | intensity=1 (0..1)                                                                                 | Tested       |         10.89 / 11.19 |      11.12 |        10.58 |
| `filter.outdoors` — Outdoors                         | intensity=1 (0..1)                                                                                 | Tested       |         13.10 / 16.04 |      11.16 |        10.60 |
| `filter.muted` — Muted                               | intensity=1 (0..1)                                                                                 | Tested       |         11.02 / 11.61 |      11.07 |        10.02 |
| `filter.black-white` — Black and white               | intensity=1 (0..1)                                                                                 | Tested       |          9.71 / 10.30 |       9.96 |         9.29 |
| `filter.soft-bw` — Soft B&W                          | intensity=1 (0..1)                                                                                 | Tested       |         11.17 / 12.08 |      11.76 |        10.24 |
| `filter.muted-bw` — Muted B&W                        | intensity=1 (0..1)                                                                                 | Tested       |         11.35 / 14.36 |      11.26 |        10.80 |
| `filter.gloomy` — Gloomy                             | intensity=1 (0..1)                                                                                 | Tested; Slow |         15.22 / 16.63 |      14.70 |        14.85 |
| `filter.deep-fried` — Deep fried                     | intensity=1 (0..1)                                                                                 | Tested       |         10.52 / 11.05 |      10.82 |        10.35 |
| `filter.euphoric` — Euphoric                         | intensity=1 (0..1)                                                                                 | Tested       |         12.60 / 16.17 |      11.84 |        12.37 |
| `filter.duotone-yellow-orange` — Yellow–orange       | intensity=1 (0..1)                                                                                 | Tested       |         10.99 / 11.04 |      12.80 |        10.15 |
| `filter.duotone-pink-purple` — Pink–purple           | intensity=1 (0..1)                                                                                 | Tested       |         10.80 / 11.50 |      10.56 |        10.26 |
| `filter.duotone-blue-pink` — Blue–pink               | intensity=1 (0..1)                                                                                 | Tested       |         11.20 / 11.72 |      10.57 |        10.35 |
| `filter.duotone-green-blue` — Green–blue             | intensity=1 (0..1)                                                                                 | Tested       |         11.19 / 12.02 |      10.01 |        10.23 |
| `filter.overlay-white` — White                       | intensity=1 (0..1)                                                                                 | Tested       |           8.93 / 9.33 |       9.83 |         7.96 |
| `filter.overlay-black` — Black                       | intensity=1 (0..1)                                                                                 | Tested       |           8.43 / 8.60 |      10.75 |         8.15 |
| `filter.overlay-yellow` — Yellow                     | intensity=1 (0..1)                                                                                 | Tested       |           8.55 / 9.19 |       8.22 |         8.04 |
| `filter.overlay-orange` — Orange                     | intensity=1 (0..1)                                                                                 | Tested       |           8.63 / 9.05 |       8.52 |         8.03 |
| `filter.overlay-red` — Red                           | intensity=1 (0..1)                                                                                 | Tested       |           8.23 / 9.36 |       8.37 |         8.29 |
| `filter.overlay-pink` — Pink                         | intensity=1 (0..1)                                                                                 | Tested       |           8.14 / 8.46 |       8.20 |         8.08 |
| `filter.overlay-purple` — Purple                     | intensity=1 (0..1)                                                                                 | Tested       |           8.20 / 9.62 |       8.51 |         7.94 |
| `filter.overlay-blue` — Blue                         | intensity=1 (0..1)                                                                                 | Tested       |           8.19 / 8.32 |       7.68 |         8.02 |
| `filter.overlay-green` — Green                       | intensity=1 (0..1)                                                                                 | Tested       |           8.14 / 8.40 |       7.76 |         8.45 |
| `effect.flash` — Flash                               | intensity=1 (0..1); speed=1 (0.1..5); loop=false (boolean)                                         | Tested       |           7.17 / 7.21 |       8.69 |         7.48 |
| `effect.pulse` — Pulse                               | intensity=1 (0..1); speed=1 (0.1..5)                                                               | Tested       |           5.94 / 6.55 |       9.26 |         6.78 |
| `effect.spin` — Spin                                 | intensity=1 (0..1); speed=1 (0.1..5); loop=false (boolean)                                         | Tested       |           5.64 / 6.22 |      10.45 |         6.15 |
| `effect.rotate` — Rotate                             | intensity=1 (0..1); angle=15 (-180..180)                                                           | Tested       |           7.06 / 8.79 |       6.64 |         7.11 |
| `effect.crash-zoom` — Crash zoom                     | intensity=1 (0..1); speed=1 (0.1..5); loop=false (boolean)                                         | Tested       |           6.63 / 7.07 |       7.38 |         7.89 |
| `effect.slow-zoom` — Slow zoom                       | intensity=1 (0..1); speed=1 (0.1..5); loop=false (boolean)                                         | Tested       |           6.89 / 7.20 |       7.10 |         7.12 |
| `effect.slow-zoom-random` — Slow zoom random         | intensity=1 (0..1); speed=1 (0.1..5); loop=false (boolean)                                         | Tested       |           7.09 / 7.52 |       7.37 |         7.19 |
| `effect.blur` — Blur                                 | intensity=1 (0..1); radius=6 (0..32)                                                               | Tested       |         18.77 / 19.12 |      27.65 |        26.54 |
| `effect.blur-fill` — Blur fill                       | intensity=1 (0..1); radius=16 (1..32); scale=0.72 (0.25..1)                                        | Tested       |         35.86 / 43.90 |      49.84 |        38.68 |
| `effect.vhs` — VHS                                   | intensity=1 (0..1); speed=1 (0.1..5); noise=12 (0..50)                                             | Tested       |           9.15 / 9.95 |      13.51 |         7.30 |
| `effect.vaporwave` — Vaporwave                       | intensity=1 (0..1); speed=1 (0.1..5); noise=6 (0..50)                                              | Tested       |          9.20 / 11.89 |       7.84 |         7.44 |
| `effect.chromatic-aberration` — Chromatic aberration | intensity=1 (0..1); amount=8 (0..40)                                                               | Tested       |           5.51 / 5.69 |      10.15 |         5.67 |
| `effect.glitch` — Glitch                             | intensity=1 (0..1); speed=1 (0.1..5)                                                               | Tested       |           6.48 / 7.97 |      14.98 |         6.62 |
| `effect.filmic` — Filmic                             | intensity=1 (0..1); speed=1 (0.1..5); grain=14 (0..40)                                             | Tested       |         25.81 / 40.55 |      33.20 |        25.13 |
| `effect.color-shift` — Color shift                   | intensity=1 (0..1); speed=1 (0.1..5)                                                               | Tested       |           6.09 / 6.57 |       7.83 |         6.09 |
| `effect.pixelation` — Pixelation                     | intensity=1 (0..1); size=18 (1..80); palette16=false (boolean)                                     | Tested       |         13.67 / 14.99 |      15.87 |        14.07 |
| `effect.glow` — Glow                                 | intensity=1 (0..1); radius=6 (0..32)                                                               | Tested       |         26.42 / 34.12 |      30.23 |        37.39 |
| `effect.diffusion` — Diffusion                       | intensity=1 (0..1); radius=6 (0..32)                                                               | Tested       |         21.84 / 26.25 |      26.10 |        28.27 |
| `effect.disco` — Disco                               | intensity=1 (0..1); speed=1 (0.1..5)                                                               | Tested       |         18.41 / 19.53 |      19.95 |        20.05 |
| `effect.glass` — Glass                               | intensity=1 (0..1); speed=1 (0.1..5); size=48 (8..160); amount=8 (0..30)                           | Tested       |         22.38 / 23.23 |      26.34 |        23.02 |
| `effect.comic` — Comic                               | intensity=1 (0..1); levels=5 (2..12); edge=65 (10..200)                                            | Tested       |         21.90 / 28.88 |      21.65 |        18.81 |
| `effect.retro-graphics` — Retro graphics             | intensity=1 (0..1); size=8 (3..40)                                                                 | Tested       |          9.91 / 10.22 |      22.66 |        10.27 |
| `effect.vertical` — Vertical                         | intensity=1 (0..1); speed=1 (0.1..5); amount=0.08 (0..0.3)                                         | Tested       |           6.31 / 6.37 |       9.41 |         6.66 |
| `effect.radial` — Radial                             | intensity=1 (0..1); amount=0.12 (0..0.4)                                                           | Tested       |         22.65 / 22.85 |      29.34 |        24.18 |
| `effect.smoke` — Smoke                               | intensity=1 (0..1); speed=1 (0.1..5)                                                               | Tested       |         33.48 / 34.47 |      38.37 |        34.88 |
| `effect.kaleidoscope` — Kaleidoscope                 | intensity=1 (0..1); segments=6 (2..24)                                                             | Tested       |           2.94 / 4.16 |      66.59 |         3.02 |
| `effect.black-white-removal` — Black / white removal | intensity=1 (0..1); color=black (black / white); threshold=0.1 (0..0.8); softness=0.1 (0.001..0.5) | Tested       |           5.77 / 5.92 |       8.21 |         5.76 |
| `effect.green-screen` — Green screen                 | intensity=1 (0..1); screen=#00ff00 (color); threshold=0.2 (0..0.8); softness=0.1 (0.001..0.5)      | Tested       |         19.39 / 19.81 |      22.67 |        20.45 |
| `transition.cross-blur` — Cross blur                 | radius=20 (1..32)                                                                                  | Tested; Slow |         22.32 / 34.66 |      33.47 |        29.49 |
| `transition.burn` — Burn                             | None                                                                                               | Tested       |           5.19 / 5.53 |       7.47 |         5.25 |
| `transition.horizontal-banding` — Horizontal banding | bands=10 (2..32)                                                                                   | Tested       |          9.99 / 10.24 |      15.48 |        13.39 |
| `transition.tiles` — Tiles                           | tiles=8 (2..20)                                                                                    | Tested       |         15.94 / 17.56 |      18.43 |        18.86 |
| `transition.hard-wipe-up` — Hard wipe up             | None                                                                                               | Tested       |           9.03 / 9.28 |      12.34 |        11.23 |
| `transition.soft-wipe-up` — Soft wipe up             | softness=0.12 (0.001..0.5)                                                                         | Tested       |         11.39 / 11.95 |      15.54 |        13.59 |
| `transition.hard-wipe-down` — Hard wipe down         | None                                                                                               | Tested       |         10.65 / 10.96 |      12.57 |        12.40 |
| `transition.soft-wipe-down` — Soft wipe down         | softness=0.12 (0.001..0.5)                                                                         | Tested       |         11.64 / 11.97 |      11.46 |        13.80 |
| `transition.soft-wipe-left` — Soft wipe left         | softness=0.12 (0.001..0.5)                                                                         | Tested       |         11.50 / 11.92 |      14.47 |        13.81 |
| `transition.soft-wipe-right` — Soft wipe right       | softness=0.12 (0.001..0.5)                                                                         | Tested       |         11.66 / 11.97 |      11.62 |        13.56 |
| `transition.diagonal-soft-wipe` — Diagonal soft wipe | softness=0.12 (0.001..0.5); direction=forward (forward / reverse)                                  | Tested       |         15.68 / 15.77 |      19.24 |        17.19 |
| `transition.iris-wipe` — Circle / iris wipe          | softness=0.12 (0.001..0.5); direction=forward (forward / reverse)                                  | Tested       |         20.34 / 20.61 |      23.57 |        22.61 |
| `transition.spin` — Spin                             | direction=clockwise (clockwise / counterclockwise)                                                 | Tested; Slow |         20.90 / 25.24 |      23.44 |        27.15 |
| `transition.zoom` — Zoom                             | None                                                                                               | Tested       |         20.09 / 22.72 |      19.30 |        21.93 |
| `transition.swirl` — Swirl                           | turns=0.5 (0.1..2)                                                                                 | Tested; Slow |        68.72 / 115.25 |      67.48 |        67.78 |
| `transition.push` — Push                             | direction=left (left / right / up / down)                                                          | Tested       |           6.58 / 7.42 |      10.95 |         5.88 |
| `transition.glitch` — Glitch                         | amount=0.12 (0..0.4)                                                                               | Tested; Slow |         26.35 / 32.34 |      33.24 |        26.04 |
| `transition.glitch-reveal` — Glitch reveal           | None                                                                                               | Tested       |         10.50 / 11.25 |      15.19 |        13.55 |
| `transition.bloom` — Bloom                           | None                                                                                               | Tested       |         14.13 / 15.64 |      19.14 |        17.21 |
| `transition.page-turn` — Page turn                   | curl=0.16 (0.02..0.5)                                                                              | Tested; Slow |         30.66 / 31.62 |      36.62 |        28.91 |
| `transition.cube-flip` — Cube / 3D flip              | None                                                                                               | Tested; Slow |         29.75 / 31.54 |      33.11 |        29.56 |

### Blend and fade metadata

| ID                   | Name / parameters                      | Canvas operation / status                                           | Measured speed                      |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------- | ----------------------------------- |
| `blend.normal`       | Normal                                 | `source-over`; mapping unit-tested, browser blend output not tested | N/A: metadata                       |
| `blend.darken`       | Darken                                 | `darken`; mapping unit-tested, browser blend output not tested      | N/A: metadata                       |
| `blend.multiply`     | Multiply                               | `multiply`; mapping unit-tested, browser blend output not tested    | N/A: metadata                       |
| `blend.colour-burn`  | Colour burn                            | `color-burn`; mapping unit-tested, browser blend output not tested  | N/A: metadata                       |
| `blend.lighten`      | Lighten                                | `lighten`; mapping unit-tested, browser blend output not tested     | N/A: metadata                       |
| `blend.screen`       | Screen                                 | `screen`; mapping unit-tested, browser blend output not tested      | N/A: metadata                       |
| `blend.colour-dodge` | Colour dodge                           | `color-dodge`; mapping unit-tested, browser blend output not tested | N/A: metadata                       |
| `blend.overlay`      | Overlay                                | `overlay`; mapping unit-tested, browser blend output not tested     | N/A: metadata                       |
| `blend.soft-light`   | Soft light                             | `soft-light`; mapping unit-tested, browser blend output not tested  | N/A: metadata                       |
| `blend.hard-light`   | Hard light                             | `hard-light`; mapping unit-tested, browser blend output not tested  | N/A: metadata                       |
| `blend.difference`   | Difference                             | `difference`; mapping unit-tested, browser blend output not tested  | N/A: metadata                       |
| `blend.exclusion`    | Exclusion                              | `exclusion`; mapping unit-tested, browser blend output not tested   | N/A: metadata                       |
| `blend.hue`          | Hue                                    | `hue`; mapping unit-tested, browser blend output not tested         | N/A: metadata                       |
| `blend.saturation`   | Saturation                             | `saturation`; mapping unit-tested, browser blend output not tested  | N/A: metadata                       |
| `blend.colour`       | Colour                                 | `color`; mapping unit-tested, browser blend output not tested       | N/A: metadata                       |
| `blend.luminosity`   | Luminosity                             | `luminosity`; mapping unit-tested, browser blend output not tested  | N/A: metadata                       |
| `fadeAlpha`          | t, duration, fadeIn, fadeOut (seconds) | Unit-tested, each fade capped at half duration                      | Not benchmarked; O(1) scalar helper |

### Outstanding timing targets

Opaque: `filter.35mm` 15.07 ms (target 15), `filter.gloomy` 15.22 ms (target 15), `transition.swirl` 68.72 ms (target 25), `transition.glitch` 26.35 ms (target 25), `transition.page-turn` 30.66 ms (target 25), `transition.cube-flip` 29.75 ms (target 25).

Varying alpha: `transition.cross-blur` 29.49 ms (target 25), `transition.spin` 27.15 ms (target 25), `transition.swirl` 67.78 ms (target 25), `transition.glitch` 26.04 ms (target 25), `transition.page-turn` 28.91 ms (target 25), `transition.cube-flip` 29.56 ms (target 25).

Do not advertise guaranteed real-time 720p stacks. Swirl remains the largest miss. Keep it opt-in; a later optimized SIMD/GPU backend can preserve the public contract. The brief forbids new dependencies and renderer wiring, so none was added to disguise the CPU gap.

## Exact later integration steps for Claude Code

These are **instructions for a future integration**, not changes made in this PR.

1. **Persist one ordered stack.** Use existing JSON-safe `clip.metadata.fx = {version: 1, stack: [{id, params}], blendMode: 'blend.normal'}`. This is a metadata convention, not a schema revision. Add a typed, runtime-validated command/capability through the existing Command Bus; validate IDs, param names/types/ranges, finite values, entry count and track locks. Keep apply/reorder/reset/remove/copy as ordinary undoable transactions. Store only JSON values; never functions, surfaces, thumbnails or scratch buffers. Unknown future IDs should be preserved in storage and visibly bypassed by the adapter, not dropped or passed to `renderStack` (which deliberately throws on unknown IDs). Defaults are exported; getters return undefined for unknown IDs.
2. **Store transition settings at the outgoing boundary.** Proposed `clip.metadata.fxTransitionOut = {version: 1, id, params, duration, alignment: 'center', toClipId}`. Validate both clip IDs, adjacency/track compatibility, nonnegative duration and source handles in host commands. This library does not pick neighbours, overlap clips or trim media. On split/delete/move, the host must reconcile this boundary reference and duration. Do not duplicate the seven existing/planned layer transitions; let the host dispatch those through its existing path.
3. **Expose a read-only render projection.** Resolve enabled stack entries and defaults from the current immutable composition. Compute clip-local `time = compositionTime - clip.startTime`, `duration = clip.duration`, and a stable integer seed from the clip ID (e.g. FNV-1a over UTF-16 code units using Math.imul). Use exactly the same seed/time calculation in preview and export. Effects use clip time, not decoded source time; source speed/reverse remain the media provider's responsibility.
4. **Rasterize each affected drawable once, locally.** In the shared `drawComposition` path in `src/render/canvas.ts`, extract/reuse the current content draw (media/text/shapes, crop and border) into a temporary layer-local Canvas/OffscreenCanvas. Use the same pixel dimensions, sRGB format, crop, text shaping and source frame in both paths. Read its ImageData into a Surface, with no selection handles, guides or editor surround. Keep the frozen transforms in their existing helpers; do not invent another Scene Graph or transform calculation in src/fx. The library always returns the same dimensions, so effects clip to this raster; padding/overscan and group-subtree capture need an explicit host policy if desired later.
5. **Process, then composite once.** `processed = renderStack(sourceSurface, projectedStack, {time,duration,seed,width,height})`. Write the result into a scratch canvas with `putImageData`, then draw that canvas through the existing layer/world/view transform with the existing inherited opacity exactly once. `putImageData` itself ignores Canvas transforms/compositing, so do not write directly into the transformed composition canvas. Set `globalCompositeOperation` from `getBlendMode(id)?.operation ?? 'source-over'` within save/restore. Keep existing draw order. Reuse host scratch canvases and release them on resize/dispose; call `clearEffectCaches()` on teardown.
6. **Adapt fades without doubling them.** `fadeAlpha(localTime, duration, fadeIn, fadeOut)` multiplies the layer alpha. Reuse/map the existing clip animation fade settings where possible (D-071/D-072); do not apply both the old fade preset and this helper to the same requested fade. The engine helper does not save settings or alter timing.
7. **Give transitions two complete compatible surfaces.** Capture outgoing and incoming processed content at their correct independent media/clip times and at the same target dimensions/alignment. Apply each clip's stack before the transition. Let `progress = clamp((compositionTime - transitionStart)/duration, 0, 1)`; zero duration is a hard cut handled by the host. Allocate a distinct destination and call `getTransition(id).apply(from, to, dst, progress, params, ctx)`. Never reuse an input as output. Layer captures of different sizes must be placed/fitted into a common surface first. Composite the transition result only once and suppress the two underlying normal draws during its interval. Audio crossfades are a separate audio-engine task.
8. **Share the path with export.** `src/export/worker.ts` already invokes `drawComposition` on OffscreenCanvas; route it through the same capture/stack/transition implementation and resolution policy, not a second effect evaluator. A lower preview resolution can look different, so production parity tests must compare equal-sized/equal-time/equal-colour-space source pixels. Integrate CORS/tainted canvas/readback failures through the renderer's visible error reporting; don't silently claim success.
9. **Wire the gallery metadata into later UI.** Use names/labels as translation inputs in the app, the same defaults/sanitize rules at the command boundary, and `renderThumbnail` for tiles. Thumbnails are deterministic fixed-time samples, not stored project state. Gallery controls are disposable lab UI, not components to import into the editor. Only after wiring should app undo/save/load, browser worker parity, exported pixels and user interactions receive integration/e2e proof.

Example engine-only use:

```ts
import { renderStack, getTransition, surface } from './fx';
const ctx = {
  time: 1,
  duration: 4,
  seed: 123,
  width: input.width,
  height: input.height,
};
const graded = renderStack(
  input,
  [
    { id: 'adjust.exposure', params: { amount: 0.2 } },
    { id: 'filter.orange-teal', params: { intensity: 0.7 } },
    { id: 'effect.glow', params: { intensity: 0.3, radius: 8 } },
  ],
  ctx,
);
const output = surface(input.width, input.height);
getTransition('transition.soft-wipe-up')!.apply(
  graded,
  incoming,
  output,
  0.5,
  { softness: 0.12 },
  ctx,
);
```

## Gallery owner try-it script

1. On `codex/fx-library`, run `npm ci` if dependencies are missing, then `npm run fx:gallery`; open the printed URL (normally http://127.0.0.1:5174). This opens the lab, not the editor.
2. Choose Adjust colors → Exposure, move Amount both ways, then Reset. Amount 0 and intensity 0 should restore the source. Try Saturation −1 and Temperature ±1.
3. Choose Filters, compare the category thumbnail grid, switch to Portrait tones, and inspect Portrait, 35mm, Golden hour and Orange and teal. Click a thumbnail to select it.
4. Check Black and white, Soft B&W and Muted B&W; inspect Duotones and Colour overlays. These should be visibly different looks, with intensity 0 restoring source pixels.
5. Try Flash and Pulse, scrub Time and press Play/Pause. Try Spin/Rotate and the zooms. Rotate can expose transparent corners (checkerboard); these are intended.
6. Try Blur on text/shape edges, Glow/Diffusion on highlights, VHS/Glitch/Filmic in motion, and Pixelation with the RGB565 option. Set intensity to 0 for before/after.
7. Try tier B Comic, Glass, Smoke, Kaleidoscope and Vertical. Green screen works best with your own evenly lit green-background image; threshold and soft edge control the removal. Black/white removal should leave coloured content.
8. Choose a transition category, scrub from 0 to 1 and play. Source/From is on the left; To is the other generated sample (Scene ↔ Portrait), fitted to the same dimensions. Check Burn's black middle, wipes' growing coverage, and Page/Cube shading.
9. Drop your own image or use Choose image; it is decoded locally and downscaled to at most 960×540 for the lab. No upload happens. Transitions then go from your image to the generated portrait sample. Use Sample to return to generated input.
10. Compare with the timing table, then send feedback with item ID, params, sample and time/progress. Visible lab milliseconds include its frame processing only, not a stable benchmark. In a fresh terminal run `npm run check` for the code gate.

These browser steps are provided for the owner and were **not run here**. No visual screenshots or browser acceptance are claimed. The gallery was production-built successfully; numerical behavior was checked in Vitest and Node Worker.

## Animate-preset notes — not implemented

Presets should remain host metadata/templates, separate from this stateless library. A later preset could reference ordered FX IDs plus parameter envelopes evaluated at clip-local time, with explicit in/out/loop slots, easing and conflict rules against keyframes. Avoid baking viewport coordinates or transformed pixels into metadata. Use the existing Command Bus for one undo step and reconcile with D-071 rather than adding another animation system. Decide whether speed and intensity envelopes interpolate linearly or perceptually, whether loop phase restarts at trim/split, and how presets behave at export frame boundaries. No preset registration, envelope evaluator or Animate UI is included.

## Known limitations and unfinished verification

- Timing misses are listed above; all 101 processing definitions are built and unit/Node-Worker tested. No CPU real-time guarantee for stacks, large frames or arbitrary alpha inputs.
- Spatial sampling is nearest-neighbour. Rotation/warp edges can look jagged; motion effects are stylized, not optical-flow or motion-compensated processing. Swirl uses a trig lookup approximation; Page/Cube are 2.5D approximations.
- Blur is box blur; radii clamp internally to 64 output pixels. Very large output resolutions/radii therefore saturate, rather than allocating unbounded kernels. No Gaussian, GPU or HDR/linear-light colour-management claim.
- Keying is RGB distance only. No AI background removal, spill suppression or temporal matting. No external LUTs, assets or Clipchamp implementation copied.
- Input/output must have equal dimensions and nonoverlapping typed-array memory. Maximum surface 33,554,432 pixels is a rejection guard, not a promise that peak scratch memory is cheap. Blur and transition scratch allocations can be several times the surface size. The host should bound concurrent jobs and release buffers/caches.
- Determinism is proven within Node main/Worker for the same bytes. Different browser engines' transcendental rounding, font rasterization, decoder colour conversion and Canvas premultiply/readback can differ. Real browser preview/export parity must be tested after integration.
- No app UI, renderer hooks, persistence commands, schema changes, e2e tests or PR #14 edits. No merge. The requested `briefs/FX.md` is the explicit allowlist exception; every other new file is in an allowed directory/path, and package.json has exactly the one gallery script addition.

## Checkpoints

| Part | Check result                                                                          | Published checkpoint                                 |
| ---- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| F0   | 390 tests / 36 files; check passed                                                    | 38f9f35                                              |
| F1   | 398 tests / 37 files; check passed                                                    | d44f421                                              |
| F2   | 447 tests / 38 files; check passed                                                    | 8f7d1f3                                              |
| F3   | 469 tests / 39 files; check passed                                                    | 6dbe560                                              |
| F4   | 496 tests / 40 files; check passed; PR ready                                          | ffa0428                                              |
| F5   | 621 tests / 44 files; final check passed; gallery build and Node Worker parity passed | This evidence checkpoint: git log -1 -- briefs/FX.md |

Resumption: read `briefs/FX.md`, branch/status and this report. All scoped engine work is now in PR #19. Continue only owner-reported FX fixes; do not start app wiring or Animate presets implicitly.
