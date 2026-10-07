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

## AI authoring guide

Paste the following as a system prompt. This prompt is for producing a block
source object for the gallery; trusted library modules may use ordinary imports,
but pasted blocks cannot.

```text
Write one original deterministic Canvas animation block. Return only a single
parenthesized JavaScript object, with unquoted field names and literal metadata:
id (lowercase slug), version ('1.0.0'), name, category, defaultDuration (0.1..600),
params (at most 32), optional thumbnailTime, and exactly this method signature:
render(ctx,t,size,params,seed) { ... }.

Param specs have name, label, type, default. Names must be safe identifiers.
number also requires finite min/max/step (step > 0); color is #RRGGBB or #RRGGBBAA;
text may have maxLength (default 200, maximum 1000); bool is boolean; select has
an options array of unique strings. All metadata must be literal values, with
no calls, spreads, getters or computed keys. Keep source below 32768 characters.

t is seconds from this block's start, size has width/height in pixels, and seed
is a fixed integer. Render is a pure function of these inputs and params. The
host clears a transparent canvas, clips it, resets styles and wraps save/restore.
Never clear the host composition or rely on any preceding frame. Balance your
own save/restore. At t=3, then t=1, then t=3 the two t=3 frames must be identical.
Use closed-form positions and indexed randomness; never integrate a simulation.

The injected helpers are clamp(x,a=0,b=1), lerp(a,b,t), map(x,a,b,c,d),
rngFor(seed,index) -> stable number in [0,1), ease(name,t), and
spring(t,frequency=2.4,damping=0.62). ease names: linear, ease-in, ease-out,
ease-in-out, hold. Spring frequency is (0,100] Hz, damping is (0,1), and spring
returns 0 at t<=0. Particle positions can be p0+v*t+g*t*t/2. Clamp alpha yourself.

Use only unique simple scalar local variables, arithmetic, if/for/while, and
approved ctx/Math/helpers calls. Number/String conversion, Number.isFinite,
string.charAt, scalar.length and number.toFixed are supported. No arrays or
objects inside render, no destructuring, computed indexing, nested functions,
classes, constructors, asynchronous code or imports. Read params by dot name.
Do not mutate params, size, helpers or Math. Do not alias functions and call them.

Canvas methods: save, restore, beginPath, closePath, moveTo, lineTo, rect, arc,
ellipse, quadraticCurveTo, bezierCurveTo, fill, stroke, fillRect, strokeRect,
clearRect, translate, rotate, scale, fillText, strokeText, measureText (width only).
Styles: fillStyle, strokeStyle, lineWidth, lineCap, lineJoin, globalAlpha, font,
textAlign, textBaseline, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY.
Use only string or numeric styles. No images, gradients, patterns, raw canvas,
readback, clip or transform-reset access. Use simple system fonts, e.g. Arial.

Never use Date, performance, Math.random, timers, fetch, XMLHttpRequest,
WebSocket, importScripts, eval, Function, storage, document, window, self,
globalThis, constructors or prototypes. No IO, network, DOM or hidden state.
Keep loops small and bounded. A frame above 250 ms terminates its worker;
at most 100000 drawing calls and 32 nested saves are permitted. Do not attempt
capability discovery. Include a sensible thumbnailTime and good default params.
```

Two short accepted examples (paste either whole object):

```js
({
  id: 'count-card',
  version: '1.0.0',
  name: 'Count card',
  category: 'Original',
  defaultDuration: 4,
  thumbnailTime: 2,
  params: [
    {
      name: 'to',
      label: 'Target',
      type: 'number',
      min: 0,
      max: 1000,
      step: 1,
      default: 120,
    },
    { name: 'color', label: 'Ink', type: 'color', default: '#77eed5' },
  ],
  render(ctx, t, size, params, seed) {
    const value = Math.round(params.to * helpers.ease('ease-out', t / 3));
    ctx.fillStyle = params.color;
    ctx.font = 'bold 72px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(String(value), size.width / 2, size.height / 2);
  },
});
```

```js
({
  id: 'seeded-sparks',
  version: '1.0.0',
  name: 'Seeded sparks',
  category: 'Original',
  defaultDuration: 3,
  thumbnailTime: 0.5,
  params: [],
  render(ctx, t, size, params, seed) {
    const age = helpers.clamp(t, 0, 3);
    ctx.fillStyle = '#ffbe71';
    ctx.globalAlpha = helpers.clamp(1 - age / 3);
    for (let i = 0; i < 30; i++) {
      const a = helpers.rngFor(seed, i * 2) * Math.PI * 2;
      const v = 50 + helpers.rngFor(seed, i * 2 + 1) * 100;
      const x = size.width / 2 + Math.cos(a) * v * age;
      const y = size.height / 2 + Math.sin(a) * v * age + 40 * age * age;
      ctx.fillRect(x, y, 5, 5);
    }
  },
});
```

`rngFor` hashes 32-bit seed/index values; it is reproducible, not cryptographic,
and seeds separated by 2^32 can collide. Author particle randomness by particle
index, never by call count. Text/glow/shadow rendering depends on fonts and the
browser's rasterizer. `measureText` is available through the facade but its width
can differ across machines. Use a deterministic font-loading policy at integration.

## Later integration guide for Claude Code

D-227: No source execution or app wiring is authorized by this PoC. Review
`SCHEMA-V7-PROPOSAL.md` first; current layer objects have no metadata slot, so do
not add undeclared fields to schema 5 or hide executable source in clip metadata.

1. Add explicit approved code/camera layer variants and serialization/migration
   tests in a later session. Reuse the existing `Layer.properties` / `Property`
   keyframe system for per-layer block params. Map number→number, color→color,
   text/select→string, bool→boolean. Prefix property IDs with `block_`; parameter
   names stay within a safe bounded identifier length. Use ParamSpec for defaults,
   labels, constraints and widgets, never as executable UI code. Text/select/bool
   use hold interpolation. Interpolated numeric values are not rounded to step;
   validate/bound them before rendering. Author source/version/seed changes through
   undoable semantic commands; these are not frame keyframes.
2. Resolve each visible layer/clip to one canonical block-local time. Direct layers
   start at `compositionTime - layer.startTime`; clips must reuse the current
   speed/reverse/source-in/freeze timing resolver, not a second formula. Evaluate
   existing keyframes using their current composition-local convention, then
   construct the block Params object. Decide copy/trim/retime semantics and test
   them. Persist an explicit seed derived once from a layer ID using a documented
   32-bit hash; never re-seed when seeking or exporting.
3. Build an asynchronous preparation phase before synchronous `drawComposition`
   in `src/render/canvas.ts`. Compile edited/imported source once, preserving
   validator version + exact source hash in the trusted runtime cache. Use only
   successful unchanged compiler results with `createSandbox`. Never run imported
   code with Function/eval on the UI thread. Pre-render worker frames to a dedicated
   transparent surface of the layer's logical size and transfer pixels/bitmaps.
   This PoC returns RGBA arrays; a later ImageBitmap optimization must preserve
   lifetime and exact pixels. Cache keys include source/version, evaluated params,
   seed, size and exact time. Invalidate on every relevant edit; discard stale
   request replies after seeking. Terminate workers on removal/cancel/timeout.
4. Keep `drawComposition` synchronous: consume a prepared code-layer frame as a
   drawImage source in its existing per-item transform/opacity/compositing path.
   **Do not call the clearing block render wrapper on the composition context.**
   A trusted built-in may render to its own scratch canvas, while custom code must
   use its worker. If the FX library is integrated later, apply its renderStack to
   that layer surface before compositing; this branch imports no FX code.
5. Extend `src/export/worker.ts` preparation to await the identical block evaluator
   at each exact export timestamp before the same composition draw. Use a dedicated
   sandbox worker per execution session (or trusted host broker); do not scrub the
   existing export worker's globals. An unavailable or failed sandbox is an explicit
   export error, not a silent blank layer or unsafe fallback. Compare integrated
   preview/export at matched resolutions, DPR, fonts and color settings before
   claiming encoder/export parity. Font loading must complete in both contexts.
6. Evaluate one active root camera at composition time. Compose its matrix between
   the viewport matrix and world-space layer matrix: view × camera(depth) × world.
   Camera depth defaults to 1; depth 0 excludes the layer from camera motion.
   Apply once per world-space item, not again in nested groups. Keep editor pan/zoom
   separate from the project camera; inverse hit testing and handles must account
   for the camera. Camera layers themselves draw no pixels. Resolve multiple camera
   selection, inactive time ranges and nesting through the proposal, not heuristics.
7. Build the inspector from ParamSpec and route edits through existing undoable
   commands. Display compiler/frame errors clearly, let the owner disable a failing
   layer, and block production untrusted imports until sandbox hardening is reviewed.
   Run real-browser pixel parity, scrub/reorder, cancellation, hostile-code and
   serialization/migration tests. The PoC tests alone do not verify this integration.

## BLK-1 / BLK-2 correction

D-229: Size is a structural contract, not necessarily an object with own fields.
Canvas width/height accessors live on prototypes. Copy them explicitly when
freezing the render input; object spread silently dropped both and native Canvas
ignored the resulting nonfinite geometry. Preview and pose tiles passed canvases,
while Export check used a plain size object, which explains why parity alone did
not catch an empty normal preview. Four browser regressions now require nonzero
alpha at each starter's thumbnail time before checking exact export parity.
The gallery also requests `willReadFrequently:false` for both main/direct contexts
instead of forcing them onto a CPU rasterizer while the worker uses its default
context. This aligns context policy; hardware-specific equality still needs a
real-browser run, especially the reported Windows configuration.

D-230: For pasted blocks, compare the two independently rendered worker buffers
before display upload. Also compare both buffers after the same Canvas upload and
readback. Both comparisons retain zero tolerance and contribute to pass/fail.
`displayRoundTripMaxDifference` is a separate diagnostic comparing a raw buffer
with its displayed/read-back representation, not two different renders. Canvas
uses premultiplied alpha internally, and upload/readback can round translucent
RGB values ([HTML Canvas standard](https://html.spec.whatwg.org/multipage/canvas.html#pixel-manipulation)).
The old Orbit check included this conversion on only the preview side, so its
one-level mismatch alone did not establish nondeterministic worker rendering.
No worker sandbox source, tolerance, shader, text or arc code was changed.
