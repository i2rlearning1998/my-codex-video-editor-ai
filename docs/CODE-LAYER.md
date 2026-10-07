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

## Worker sandbox (B2)

D-223: `compileBlock` parses a deliberately small JavaScript subset with the
existing TypeScript dependency. It reads literal metadata without evaluating
source. It accepts one parenthesized object with a
`render(ctx,t,size,params,seed)` method; the runtime also supplies `helpers`.
Only scalar locals, arithmetic, loops, branches, approved drawing operations,
Math operations and declared parameter reads are supported. Computed properties,
constructors, nested functions, arbitrary calls and ambient capabilities are
rejected. This is intentionally narrower than general JavaScript.

D-224: Execution occurs only in a dedicated worker. Captured host hooks survive
capability removal; submitted code sees a frozen drawing facade, frozen params
and size, and deterministic helpers. Each frame gets a fresh canvas and function.
The facade clips through the host wrapper, limits calls, hides the raw canvas,
and enforces balanced save/restore. The main-thread 250 ms watchdog terminates
an over-budget worker. A terminated worker must be recreated. Startup has a
separate five-second deadline. Validation and frame errors are returned as values.

This is defense in depth for a proof of concept, **not a hardened security
boundary for arbitrary hostile JavaScript**. The validator and worker message
protocol are trusted application code: callers must pass successful compiler
results unchanged. Workers ordinarily have network and storage capabilities
([MDN worker documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)).
The deny list cannot promise isolation against every browser capability or
engine vulnerability. Memory exhaustion can precede watchdog termination;
workers can share a browser process. Parsing is bounded but happens on the host.
No claim of protection from every host crash or denial of service is made.
A later dedicated-origin sandboxed iframe with restrictive CSP, explicit
capability transport and reviewed resource limits is required before accepting
untrusted third-party code in production. The current runtime needs dynamic
function construction inside its worker; a CSP that disallows it will reject
execution, rather than silently falling back to main-thread execution.

Node worker tests exercise actual termination and message/error behavior using a
recording context. They do not rasterize pixels or prove browser containment.

## Gallery and browser proof (B3)

D-225: `npm run blocks:gallery` serves the isolated laboratory at
`http://127.0.0.1:5175`. The same page is reachable at `/blocks-gallery/` on the
existing dev server for Playwright. The editor and its export worker are untouched.
The gallery has its own Vite config and TypeScript check:
`npx tsc --noEmit -p blocks-gallery/tsconfig.json`;
`npx vite build --config blocks-gallery/vite.config.ts`.
The compiler is a lazy chunk (~3.58 MB uncompressed) because it uses the existing
TypeScript parser. This is acceptable for the PoC; a production compiler service
or smaller reviewed parser is a later decision, not a new dependency here.

Export check compares all RGBA bytes at 0%, 25%, 50%, 75%, and 100% of the selected
block duration with **zero-byte tolerance**. Starter blocks compare visible Canvas
against both direct OffscreenCanvas and a real worker's OffscreenCanvas. Pasted
code compares two fresh-worker renders, displaying one on the visible canvas.
A result reports maximum channel difference, times, dimensions and pass/fail.
This is an isolated export-path proxy, not integration with the existing exporter.
Exact parity is scoped to the same browser, font installation, machine and Canvas
implementation; cross-browser/font rasterization is not promised.

Benchmark measures 120 evenly spaced frames including both endpoints at 720p and
1080p. It reports arithmetic mean draw time and worker round-trip time separately.
Canvas creation/readback are excluded from draw time; round trips include startup,
allocation and transport. No pixel readback forces GPU completion in the timing
loop, so these are Canvas command-submission costs, not encoder throughput.
Pasted code is **never** executed on the main thread, including benchmarks; its
main-thread result is null. Slow pasted frames still face the 250 ms watchdog.

The single `e2e/code-layer-poc.spec.ts` contains nine cases: four five-time pixel
comparisons, four 3→1→3 scrub checks, and hostile-code rejection/termination plus
recovery. Existing ledger IDs describe the relevant proof area; this isolated
suite does not promote or change any feature ledger row. Local browser launch
was blocked by missing `/opt/microsoft/msedge/msedge`; no browser test passed
locally and no speed or pixel result is fabricated.

## Camera (B4)

D-226: `src/camera` is a pure affine module, independent of the app. Defaults are
x/y 0, zoom 1, rotation 0 degrees, shake amplitude 0, frequency 4 Hz, seed 0.
x/y are world-space camera offsets from the viewport centre; the scene moves
in the opposite direction. `cameraMatrix(camera,t,viewport,depth=1)` returns the
Canvas tuple `[a,b,c,d,e,f]`, zooming/rotating around the centre. Depth 0 gives
identity, depth 1 the full camera. Translation, angle and shake scale linearly
with depth; zoom uses `zoom ** depth`. Shake is two seeded, smoothstep-interpolated
noise channels, bounded per axis by amplitude; frequency 0 disables shake.

`applyCamera(ctx,camera,viewport,depth,t=0)` multiplies the current transform.
The requested four-argument API is supported; the optional fifth argument is
necessary to animate deterministic shake without hidden time state. The caller
owns save/restore and supplies the same composition time for all affected layers.
Numeric inputs must be finite, zoom/viewport positive, depth in 0..1, amplitude
nonnegative, frequency in 0..1000, seed a safe integer and |time| ≤ 86400 seconds.
This is not a 3D camera or perspective projection. No editor code is wired to it.
