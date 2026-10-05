# FX engine library

Standalone original CPU RGBA library, not integrated into the editor. No schema, UI or renderer changes. Owner acceptance of visual quality is pending.

## Decisions

- FX-D01: The explicit task overrides the generic wave reporting/e2e rules: only `npm run check`, no Playwright, no ledger/status/decision-log edits. `briefs/FX.md` is the explicit progress-file exception to the creation allowlist.
- FX-D02: Main baseline is `9362645`. The shared drawComposition exists; the named src/render/transitions.ts does not exist on this main. Do not add the seven excluded layer transitions anyway.
- FX-D03: Input/output buffers must not overlap (including overlapping views); reject malformed surfaces/contexts. Params clamp numeric ranges, ignore unknown fields and default nonfinite or wrong-type values. Invalid transition progress throws. Positive integer dimensions; maximum 33,554,432 pixels per surface to reject pathological allocations.
- FX-D04: Process display-encoded sRGB bytes, straight alpha. Colour operations preserve input alpha. Spatial effects resample alpha with colour; alpha-modifying effects declare it. Cross-surface mixing uses premultiplied weights and writes straight alpha. Spatial sampling is nearest-neighbour, explicitly avoiding dark interpolated alpha fringes; quality limitation on rotations is documented.
- FX-D05: IDs are namespaced and stable. English names/labels are library metadata; the standalone lab has its own plain controls, not editor UI. All looks and code are original, no external assets/LUTs/shaders.

## Contract

`Surface = {width,height,data:Uint8ClampedArray}`; RGBA straight alpha; input never written. `Context = {time,duration,seed,width,height}` in clip-local seconds, finite values, integer seed. Each item declares id/name/category/kind/params/alpha/apply. Every effect/filter/adjustment has intensity 0..1 default 1, exact byte identity at zero. Transition endpoints copy exactly, duration-independent progress clamps 0..1. Lists/getters, defaults, sanitize, renderStack and renderThumbnail are exported from src/fx/index.ts. Stack owns two ping-pong buffers and rejects unknown IDs; empty stacks return a fresh copy. Thumbnail returns a Surface, not a DOM element. Transition tiles use a deterministic second colour-shifted source at progress .5. No globals, DOM, browser APIs, other src imports or dependencies in the library.

## Progress and verification

F0 foundation implemented. Run `npm run fx:gallery`, open the printed local URL. Choose category/item, adjust parameters, scrub or play time, inspect category thumbnails; drop a local image. Generated scene and portrait samples use canvas shapes/gradients/text; no image files. Gallery visual browser acceptance has not been performed. The editor build does not import this library.

F0: npm run check passed (format, typecheck, unit suite, editor build). No Playwright run.

## F1 decisions

FX-D06: Exposure spans −2..+2 stops, contrast uses a 0.25..4 gain around mid-grey, saturation spans greyscale..2× chroma, temperature adds a bounded warm/cool channel offset. Amount 0 is exact identity. Transparency −1 removes alpha, +1 makes nonzero-alpha pixels opaque; zero-alpha pixels stay invisible. `adjustmentDefaults` is a reset-friendly list; intensity always defaults to 1. Blend modes are metadata only, with Canvas operation strings; no CPU blend implementation is implied. Fade lengths each cap at half duration; outside clip bounds and nonpositive duration return 0; nonfinite arguments throw.

F1: npm run check passed, 398 tests in 37 files. First benchmark on AMD EPYC 9V74 80-Core Processor: adjust.exposure 3.5 ms, adjust.contrast 3.55 ms, adjust.saturation 6.36 ms, adjust.temperature 6.04 ms, adjust.transparency 5.34 ms, filter.none 0.65 ms. Timing is descriptive, not a test gate.

## F2

47 original filters, including 4 duotones and 9 overlays. Shared compiled channel curves, luma saturation and split-tone tables; optional radial vignette and seeded frame-grain. Overlay strength at full intensity is 45%, so the source remains visible. All B&W variants use zero chroma. Unit coverage includes all IDs, distinct look outputs, exact zero-intensity identity, B&W saturation, overlays and seeded grain. npm run check passed. Initial slowest median: 37.08 ms (filter.old-western). Final per-item results follow after the performance pass.

## F3

18 tier A effects implemented; npm run check passed, 469 tests in 39 files. Motion controls use clip-local normalized time; loop is opt-in for finite zooms/rotations, periodic Pulse/texture effects use seconds × speed. Random zoom picks a stable direction from the seed. Radii/offset/block sizes scale from a 720-high/1280-wide reference. Pixelation's 16-bit option means RGB565 (65,536 possible colours), not a 16-colour palette.

FX-D07: Blur is a linear-time separable box blur, not a Gaussian claim; accumulates premultiplied colour then returns straight RGB, preserving original alpha. Blur fill overlays a scaled foreground (default .72) on an enlarged blurred background; it is an aesthetic framing operation, not automatic subject segmentation or aspect-ratio detection. Glow blurs isolated highlights and screens them; Diffusion mixes a softened image back into the original. Spatial transforms use transparent borders except zoomed/clamped texture backgrounds.

## F4

16 pixel transitions implemented. npm run check passed. Exact endpoints and duration-independent progress; hard up/down, soft four directions, diagonal and circular wipes have monotonic covered-area tests. Burn includes a warm singe before/after a black midpoint (the fade-through-black measurement); no separate fade-black/white or crossfade definition duplicates the excluded layer transitions. Push translates both complete sources with no new third buffer; Spin/Zoom/Swirl resample both sources then alpha-aware mix. Params do not include duration: the host supplies normalized progress. PR #19 is marked ready after this checkpoint; F5 continues on the same PR as requested. No merge.
