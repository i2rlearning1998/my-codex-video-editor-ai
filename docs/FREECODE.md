# Tier C / Free-code runtime

Standalone runtime and laboratory. No editor, engine, renderer, export or schema
integration is included. The imported [contract](specs/CODE-TIERS-SPEC.md) is the
owner's specification. Progress lives in [FREECODE-PROGRESS.md](FREECODE-PROGRESS.md).
This is a proof of concept, **not a hardened arbitrary-code execution service**.

## Run

```sh
npm ci
npm run freecode:gallery
# Open http://127.0.0.1:5176/freecode-gallery/
npx tsc --noEmit -p freecode-gallery/tsconfig.json
npx vitest run tests/freecode
npx playwright test e2e/freecode-gallery.spec.ts
```

The gallery is also served at `/freecode-gallery/` by the existing dev server,
so existing Playwright CI discovers it without workflow changes. Node >=20.6 and
npm >=10 follow the repository contract; this session used Node 24.19 / npm 11.9.
No browser result is inferred from jsdom or the production build.

## API and lifecycle

```ts
import { createFreeCodeRuntime } from '../src/freecode';
const runtime = createFreeCodeRuntime({
  frameTimeoutMs: 5000,
  totalTimeoutMs: 120000,
});
const result = runtime.validate(source);
if (!result.ok)
  throw new Error(
    result.errors.map((e) => `Line ${e.line}: ${e.message}`).join('\n'),
  );
const session = await runtime.open(source, {
  width: 1920,
  height: 1080,
  fps: 24,
  duration: result.meta.duration,
  params: {},
  seed: 42,
});
try {
  const thumbnail = await session.thumbnail();
  thumbnail.close(); // Caller owns every returned ImageBitmap.
  for (let frame = 0; frame < Math.ceil(24 * result.meta.duration); frame++) {
    const bitmap = await session.renderFrame(frame);
    // Consume / encode / cache before requesting the next frame.
    bitmap.close();
  }
} finally {
  session.dispose();
}
```

`validate` parses with existing TypeScript, reads literal JSON metadata, reuses
Block ParamSpec validation and reports banned capabilities and syntax with line
numbers. Metadata semantic errors point to the meta field. It does not
execute source and is intentionally more permissive than `compileBlock`.
`open` revalidates and freezes a copy of params; invalid/unknown params fail and
missing params use defaults. Session metadata is the normalized metadata; optional
fps remains absent until the caller chooses its project fps.

The host lazy-loads fixed local library text, instruments loops/function bodies,
and serializes a self-contained bootstrap plus source into `srcdoc`. Its iframe
has `sandbox="allow-scripts"` only, an opaque origin, and the spec CSP plus
`form-action 'none'; base-uri 'none'`. There is no `allow-same-origin`. Submitted
code never executes on the host. Each session gets a random transport token;
replies must have the iframe's WindowProxy source, matching token, request id and
expected type. ImageBitmaps transfer ownership. Out-of-order and concurrent
requests fail. Unexpected stale transferred bitmaps are closed.

The iframe creates the actual canvas. `ctx` and `gl` are lazy getters: **do not
destructure ctx in a WebGL init** or that canvas becomes permanently 2D. Authors
may select their own context with canvas.getContext. WebGL requests force alpha
and preserveDrawingBuffer; `helpers.rendererOptions(canvas)` also configures
three/PIXI. The host resets/clears 2D or clears GL before a frame unless keepFrame
is true. Libraries with their own clear/render cache (Lottie) use keepFrame and
own their clearing. Captures use createImageBitmap(canvas), never a screenshot
of the DOM; drawing outside the canvas cannot appear in the captured bitmap.

A per-frame watchdog and total lifetime timeout reject pending work, remove the
iframe and clear listeners/timers. A frame error also destroys that session.
`dispose` is idempotent. `thumbnail` uses a fresh session so it cannot disturb the
main session's simulation; nonseekable thumbnails bake from zero and close the
intermediate bitmaps. Session expiry includes idle time, not just bake time.

## Time and determinism

`t = frame / fps` seconds, `dt = 0` for frame zero and `1 / fps` afterwards.
Date.now and performance.now return `t * 1000` (API-standard milliseconds).
Math.random and init rng are seeded. For seekable frames the PRNG resets to the
session seed each request; stateful sessions keep generator state. Host time drives
every frame; RAF, setTimeout and setInterval are no-ops. Async init may await
inline asset decoding, but cannot wait for a timer callback.

Stateful sessions accept only 0,1,2,...; restart with a new session. Seekable means
all state affecting rendering is reconstructible at an arbitrary timestamp.
It is an author promise, not something static analysis can establish. The gallery
performs two independent complete bakes and compares decoded Canvas RGBA bytes
at every frame. The check fails on any channel difference and records the measured
maximum even on failure. No cross-browser/GPU/font pixel parity is promised.
No integrated preview/export parity is claimed: the editor exporter is untouched.

## Budgets and security limits

| Limit                          | Value / behavior                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| Source                         | 1 MiB UTF-8                                                                          |
| Duration                       | 0.1–120 s                                                                            |
| Frame dimensions               | positive integers, <=4096 per axis and <=8,388,608 pixels                            |
| Canvas relative to project     | caller must pass project dimensions; standalone API cannot inspect a project         |
| FPS                            | 1–120; final frame is ceil(duration × fps) - 1                                       |
| Params                         | existing Block validation; <=32 specs                                                |
| Default frame/startup timeout  | 5000 ms, configurable                                                                |
| Default total session lifetime | 120000 ms, configurable                                                              |
| Cooperative execution          | <=1,000,000 checks per init/frame plus real-clock deadline                           |
| Explicit array allocations     | estimated cumulative <=64 MiB per session for direct named constructors              |
| Gallery PNG cache              | <=128 MiB compressed bytes                                                           |
| CI sample budget               | peak frame round trip <5000 ms; two full bakes plus comparison <120 s per resolution |

These are rejection budgets, not performance promises. The working-pixel memory
estimate is six RGBA surfaces, excluding JS heap, GPU, decoder and library memory.
Explicit allocation accounting does not cover aliases, array growth, strings,
DOM objects, GPU allocation or library internals. There is no portable hard
per-iframe memory quota. Removing an iframe may not interrupt a loop on a shared
renderer thread. Cooperative instrumentation can be bypassed by adversarial
JavaScript (dynamic property access, generated code, native operations, etc.).

The AST deny scan, disabled globals and CSP block the named straightforward IO,
storage, parent access, imports and form cases. They **do not establish the spec's
absolute guarantee that arbitrary hostile JavaScript can never network or harm
the host**: alias/obfuscation, navigation channels, browser bugs and resource
exhaustion need additional review. CSP connect-src alone is not a general network
sandbox. Production needs a separately hosted, restricted origin/process or a
stronger execution service with OS resource limits and egress controls. Do not
market this PoC as safe for untrusted third-party execution.

## Gallery and evidence

Choose a study or paste a module; validate to build params and capture a thumbnail.
Apply edited params with Validate & preview or Bake. Sequential simulations need
Bake before scrub/play. Bake stores lossless PNGs with alpha; cancel disposes active
sessions. Play is a convenience preview and is not an accurate playback scheduler.
No bake frame is skipped/interpolated. Determinism checks stream two sessions,
closing bitmaps immediately rather than retaining two full uncompressed movies.

Benchmark measures both 720p and 1080p; reported per-frame time includes await,
capture and transfer for the first bake, excludes initialization, pixel comparison
and PNG encoding. firstBakeMs and secondBakeMs sum those render/capture/transport
round trips independently; initialization and PNG encoding are excluded. The
two-bake total includes readback and comparison. All numbers
come from actual performance.now calls on the host. The browser suite attaches
JSON measurements and thumbnail screenshots to the existing browser-proof artifact.
Local browser launch was blocked; see the current report for CI status and measured
numbers (if available). A passing alpha count is not a professional visual review.

## Decisions (starting D-240)

- D-240: Owner's narrow scope overrides general wave bookkeeping. The expressly
  requested spec/progress/report and one npm script are included; no global ledger,
  status, changelog, schema or editor files are edited.
- D-241: Publish each stage through GitHub Git Data API because shell push lacks
  credentials. Sync the local branch to the resulting commits. No remote force push.
- D-242: Hard adversarial resource/network isolation is not established by a srcdoc
  iframe. Record the unmet guarantee rather than promise a browser sandbox cannot
  crash. Production hardening remains not done.
- D-243: Omit GSAP under the current ambiguous visual-builder restriction; see
  [THIRD-PARTY.md](THIRD-PARTY.md). No licence assumptions from “free” marketing.
- D-244: Vendor exact compressed bundles and licences under src/freecode/vendor,
  no root package/lock dependency changes; lazy decode and inline locally.
- D-245: Fake clocks expose milliseconds, while animation t is seconds. Source
  frame counts use ceil(duration × fps); thumbnails use a separate session.
- D-246: Complete worked examples cover three rendering families: stateful Canvas,
  procedural three.js and inline Lottie. They are complete source copies from samples.
- D-247: Scope stays isolated. Browser tests reuse EXP-007 and DEV-001 as proof areas,
  following the existing Block gallery pattern; no ledger rows are promoted.

- D-248: Use the TypeScript parser, AST transform and printer directly for the
  JavaScript sandbox contract. The module transpiler appends an export marker
  incompatible with classic-script evaluation; regressions compile every sample
  and execute both supported module forms.
