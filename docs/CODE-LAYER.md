# Code-layer proof of concept

Standalone engine/gallery, no editor wiring. Schema remains 5. Decisions begin at D-220 (W7 already used D-200–210).

## Decisions

- D-220: Owner's narrow B0–B5 path/test/branch instructions override generic wave bookkeeping. Main is 9362645. FX handoff docs were read from origin/codex/fx-library (98a95f7) because main does not contain them. An unrelated existing media-fixture modification in the old FX worktree was left untouched; this task has its own worktree.
- D-221: Block metadata is plain JSON, version is semantic-version text, t is clip-local seconds. Step is an input-control hint, not quantization of animated values. Missing params get defaults; unknown/invalid params fail. Frame size ≤4096 per axis / 8,388,608 pixels, time magnitude ≤86400 s, max 32 params and bounded text.
- D-222: rngFor(seed,index) returns one stable sample, not a stateful generator. Easing agrees numerically with core's CSS curves; the separate standalone helpers import no editor code. Spring is the closed-form underdamped unit step, no integrator/history. Each render owns a dedicated transparent canvas frame, clears it, clips it and restores drawing state.

## Contract

BlockModule: id, version, name, category, defaultDuration, params, render(ctx,t,size,params,seed), optional thumbnailTime. Context is CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D. ParamSpec supports number(min/max/step), color(hex RGB/RGBA), text, bool, select; all have name/label/default. Render depends only on its arguments. No wall clock, performance.now, Math.random, retained simulation state, IO or async work. Re-rendering 3 s after 1 s must reproduce the same output as the first 3 s frame. Save/restore must balance; all drawing is clipped to canvas bounds. Recording tests prove call determinism, not pixels.

## Starter blocks (B1)

Four original transparent compositions: Signal counter (easing, prefix/suffix, glow), Orbital burst (indexed random velocities; p0 + v*t + g*t²/2 and lifetime fade), Data relay (2–6 labelled nodes, flowing dots, counters), Neon arrival (per-code-point closed-form spring and glow). Each supplies thumbnailTime. System Arial is deliberate for this PoC; font rasterization/platform differences remain a browser verification question. Particle simulation stores nothing between frames. Params remain immutable; render-local arrays are disposable, not project state.
