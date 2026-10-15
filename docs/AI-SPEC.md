# Composition Spec v1 and AI authoring groundwork

This is an offline authoring/validation/planning library. It does not contact a
model, fetch an image, execute source, import media, dispatch commands or render a
video. Editor schema remains 5. Spec version **1** is a different document format.
The owner authorized AI groundwork only, not an AI feature wired into the editor.

## API and contract

Import `validateSpec`, `compositionSpecSchema`, `resolveSpec`, `formatIssues` or
`canonicalJson` from `src/ai-spec/index.ts`. The implementation imports no editor
code. `npm run ai-spec:check` runs the focused offline validator/fixture tests;
`npm run check` runs the normal repository gate including those tests.

```ts
const result = validateSpec(jsonTextOrPlainObject, { speaker: 'Taylor' });
if (!result.ok) {
  // JSON-pointer paths and bounded messages are suitable for a repair prompt.
  console.log(formatIssues(result));
} else {
  const plan = resolveSpec(jsonTextOrPlainObject, { speaker: 'Taylor' });
  // Review plan.requirements and plan.operations. Do not dispatch this object.
}
// Complete Zod validation, including source policy and reference/timing checks:
const parsed = compositionSpecSchema.safeParse(jsonTextOrPlainObject);
```

Validation returns `{ok:true,spec,bindings,cacheKey}` or `{ok:false,errors}`.
`spec` is a normalized, frozen copy with defaults filled, editable references
resolved and block/FX params validated. Input is never mutated. The authored JSON
is the source of truth; save it to preserve editable bindings, not just the resolved
copy. `resolveSpec` validates again and throws formatted errors on invalid input.
It returns only plain JSON data; no functions, handles, Canvas objects or workers.

| Field                    | Contract                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`, `id`, `title` | version exactly 1; safe id; title 1–100 characters                                                                                                                                |
| `canvas`                 | `{width,height,fps}`; 16–4096 integer dimensions, ≤8,388,608 pixels; fps 24/25/30/50/60                                                                                           |
| `parameters`             | ≤32 editable ParamSpecs: name, label, type, default; number adds min/max/step; text maxLength; select options; color hex RGB/RGBA; bool boolean                                   |
| `assets`                 | ≤32 slots `{id,kind,description,assetId?}`; kind image/video/audio; assetId is an opaque existing editor asset id, never a URL/path/base64 payload                                |
| `blocks`                 | ≤8 `{id,source}` definitions, each ≤32768 characters; source must pass the pinned PR21 `compileBlock`, with matching id and no built-in collision                                 |
| `scenes`                 | 1–12 ordered scenes; each `{id,name,duration,background?,items,cameraMoves?,transition?}`                                                                                         |
| Item common fields       | `{id,name,kind,start,duration,transform?,depth?,fx?}`; scene-local seconds, positive duration; transform defaults x/y 0, scale 1, rotation 0 degrees, opacity 1; depth defaults 1 |
| `text`                   | text, width, height; optional fontSize (default 48), fontFamily (Arial/Georgia/Courier New), fill (default white)                                                                 |
| `shape`                  | shape rectangle/ellipse, width, height, fill                                                                                                                                      |
| `image-placeholder`      | slot referencing an image asset, descriptive prompt, width, height; asks for owner input, never synthesizes bytes                                                                 |
| `media-slot`             | slot referencing image/video, width, height, optional sourceIn seconds (default 0)                                                                                                |
| `audio-slot`             | audio slot, optional sourceIn; pixel FX forbidden; source bytes and source duration must be checked later by the host                                                             |
| `code-block`             | blockId, exact blockVersion, params, explicit uint32 seed; one of four built-ins or a validated source definition                                                                 |
| `fx`                     | ≤8 `{id,params,seed}` per item; seed explicit; IDs and params come from the pinned 80-entry effects/filters/adjustments catalog                                                   |
| `cameraMoves`            | ≤8 sorted, non-overlapping `{id,start,duration,from,to,easing?}`; from/to use the camera structure below                                                                          |
| `transition`             | outgoing `{id,duration}`; crossfade, fade-black/white, wipe-left/right, slide-left/right; no final-scene transition                                                               |

Ordinary IDs are 1–64 characters, starting with a letter, then letters/digits/
underscore/hyphen; constructor/prototype/**proto** are reserved. FX IDs retain the
library's namespace dot (`effect.glow`, `filter.retro`, `adjust.contrast`) and are
checked by exact catalog membership. IDs are unique within their namespace (scene,
asset slot, block, items within a scene, moves within a scene). Items may overlap
for compositing; array order supplies layer order. Total items ≤128, ≤64 per scene.
Total scene duration ≤180 s. All numbers are finite. No implicit frame rounding;
scene containment tolerates only 1e-9 s for arithmetic roundoff, not a visual tolerance.

A scene starts after the sum of all previous scene durations. Item and camera
start times are scene-local. SourceIn is source-media seconds; no speed/reverse
controls are specified by v1. Outgoing transition duration is at most half of
either neighboring scene. Proposed transition window is centered on the cut,
without shortening either scene; this is **blocked intent**, not an implemented
editor transition contract. Do not assume these choices already exist in export.

Use `{"$param":"name"}` in editable scalar fields: native text/fill/box/fontSize,
transform values, depth, block/FX parameter values, camera values or background.
Identity, timing, seeds, reference IDs, source and enum selectors remain literal.
The referenced default/override must pass both its ParamSpec and destination
validation. Overrides cannot add unknown parameters. Text defaults to a 200-character
limit (explicit maximum 1000); step is a UI hint, never automatic quantization.
Unknown fields and param keys are errors, not silently discarded. Bindings record
JSON-pointer paths for a later inspector; this session builds no inspector.

Camera states match `src/camera` on PR21: `{x,y,zoom,rotation,shake:{amplitude,
frequency,seed}}`. x/y are camera offsets in pixels, zoom is positive, rotation
is degrees, amplitude nonnegative, frequency 0–1000 Hz. v1 additionally bounds
x/y to ±32768, zoom .01–100, rotation ±3600, amplitude ≤4096. Seeds are explicit
uint32 and cannot change during a move. Easing is linear/ease-in/ease-out/
ease-in-out/hold. Depth 0 excludes an item from camera motion; 1 is full motion.
At integration, use the real camera module once per world-space item; do not
invent camera matrices in this resolver.

Plain JSON input is bounded to 1 MiB UTF-8, depth 24 and 50,000 nodes before Zod
parsing. Accessors, symbols, functions, nonfinite numbers, non-plain objects,
cycles, sparse arrays and reserved prototype keys are rejected. This protects the
JSON boundary; it is not a defense against hostile live JavaScript Proxies supplied
by an already-compromised host. Errors are capped at 50. Source is never evaluated
by the validator. Ordinary text is treated as text, even if it resembles code.

## Command vocabulary and build-plan mapping

The plan always says `executable:false`: there is no dispatcher/transaction adapter
in this task. `mapped` means a candidate payload matches a current command concept,
not proof that it can be applied to any existing project. A later adapter must
validate every command against that project's schema, IDs, assets, capabilities,
current mode and transaction rules before applying anything. It must not silently
skip blocked operations or downgrade them to placeholders.

| Intent                                  | Command name                                                  | Evidence and readiness                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Scene/canvas/fps                        | `CREATE_COMPOSITION`                                          | docs/specs/UX_COMPONENT_SPEC.md “New Scene”; confirmed in src/core/commands.ts on main                                   |
| Text/shape layer                        | `CREATE_LAYER`                                                | docs/HANDOFF.md Command Bus, docs/specs/UX_COMPONENT_SPEC.md; mapped                                                     |
| Static native property/transform        | `SET_PROPERTY`                                                | docs/HANDOFF.md, docs/DECISIONS.md D-070; mapped                                                                         |
| One track per item                      | `CREATE_TRACK`                                                | confirmed in main src/core/commands.ts; documented explicitly here because the older docs' lists omit it                 |
| Item timing/source range                | `CREATE_CLIP`                                                 | docs/HANDOFF.md timeline vocabulary, docs/DECISIONS.md D-112; mapped for native, asset-gated otherwise                   |
| Uploaded/media/audio slot               | `CREATE_LAYER`, `SET_PROPERTY`, `CREATE_TRACK`, `CREATE_CLIP` | same existing names; needs-asset even for supplied assetId until host verifies metadata/local bytes                      |
| Code layer/reference/source/seed/params | `CREATE_LAYER`, `SET_PROPERTY`, `CREATE_TRACK`, `CREATE_CLIP` | names exist, but code layer/schema/render support does not: blocked, never invent ADD_BLOCK_LAYER                        |
| FX application                          | `ADD_EFFECT`                                                  | docs/specs/UX_COMPONENT_SPEC.md effect slot; documented FUTURE vocabulary only, absent in current commandSchema: blocked |
| Camera move/depth                       | `CREATE_LAYER`, `SET_PROPERTY`                                | names exist; camera layer type/properties/selection/parallax wiring absent: blocked                                      |
| Scene transition                        | `CREATE_TRANSITION`                                           | docs/specs/UX_COMPONENT_SPEC.md transition boundary; documented FUTURE vocabulary, absent in commandSchema: blocked      |

Main inspected: `936264504aa6bc22e7b34f6aa5aefd766c2f4c05`. Only the five mapped
names are currently implemented; ADD_EFFECT/CREATE_TRANSITION are explicitly
marked blocked in every plan. Tests read the command declaration text to ensure
mapped names exist, without importing or executing editor code. No ADD_ASSET is
invented for a missing file: a slot contains no byte metadata needed to import it.

A plan contains ordered operations `{sequence,status,reason,command}`, scenes with
cumulative timelineStart, editableParameters, bindings, assets, itemMap and
requirements. Status is mapped/needs-asset/blocked. Sequence is deterministic:
scene → background layer/properties → each item layer/properties/track/clip/FX →
camera intents → outgoing transition. Items and scenes retain authored order;
block param property keys are sorted. IDs derive from spec id plus array indices,
not randomness/time. They are reproducible but may change when arrays reorder;
this is a one-shot creation plan, not an incremental reconciliation algorithm.
The later adapter must detect namespace collisions on repeated import.

Background is a full-duration native rectangle because schema 5 only has one
project background; it also retains an intentionally empty tail of a scene.
Native mappings use text/fontSize/fontFamily/fill/width/height/shapeKind and
transform position/scale/rotation/opacity. Code param colors map to color properties,
bools to boolean, text/select to string, numbers to number. Their provisional
`block_*`/`camera_*` property names and code/camera layer records remain blocked
schema proposals, not existing serialized project fields. Camera move keyframes
are scene/composition-local and keep constant seed. A later camera selector must
activate the right camera during each move; this plan cannot dispatch that yet.

## Pinned FX IDs for authoring

All entries accept `params:{}` to use the exact validated catalog defaults, plus
an explicit seed. For editable values, supply the matching ParamSpec metadata
from `src/ai-spec/catalogs/data.ts` to the model; never infer parameter names from
a display name. The validator rejects any ID or parameter absent from that file.

**Adjustments:** `adjust.exposure`, `adjust.contrast`, `adjust.saturation`, `adjust.temperature`, `adjust.transparency`.

**Filters:** `filter.none`, `filter.retro`, `filter.orange-teal`, `filter.bold-blue`, `filter.golden-hour`, `filter.vibrant-vlogger`, `filter.purple-undertone`, `filter.winter-sunset`, `filter.35mm`, `filter.contrast`, `filter.fall`, `filter.winter`, `filter.old-western`, `filter.warm-coastline`, `filter.cool-coastline`, `filter.warm-countryside`, `filter.cool-countryside`, `filter.golden`, `filter.dreamscape`, `filter.sunrise`, `filter.warm-tone`, `filter.cool-tone`, `filter.pastel-dreams`, `filter.scenery`, `filter.portrait`, `filter.indoors`, `filter.outdoors`, `filter.muted`, `filter.black-white`, `filter.soft-bw`, `filter.muted-bw`, `filter.gloomy`, `filter.deep-fried`, `filter.euphoric`, `filter.duotone-yellow-orange`, `filter.duotone-pink-purple`, `filter.duotone-blue-pink`, `filter.duotone-green-blue`, `filter.overlay-white`, `filter.overlay-black`, `filter.overlay-yellow`, `filter.overlay-orange`, `filter.overlay-red`, `filter.overlay-pink`, `filter.overlay-purple`, `filter.overlay-blue`, `filter.overlay-green`.

**Effects:** `effect.flash`, `effect.pulse`, `effect.spin`, `effect.rotate`, `effect.crash-zoom`, `effect.slow-zoom`, `effect.slow-zoom-random`, `effect.blur`, `effect.blur-fill`, `effect.vhs`, `effect.vaporwave`, `effect.chromatic-aberration`, `effect.glitch`, `effect.filmic`, `effect.color-shift`, `effect.pixelation`, `effect.glow`, `effect.diffusion`, `effect.disco`, `effect.glass`, `effect.comic`, `effect.retro-graphics`, `effect.vertical`, `effect.radial`, `effect.smoke`, `effect.kaleidoscope`, `effect.black-white-removal`, `effect.green-screen`.

## Provenance and decisions

- D-240: Owner's path/gate restrictions take precedence over generic wave bookkeeping.
  No changes to ledger, status, schema, UI, renderer, exporter, workflows or lockfile.
- D-241: Main lacks PR21 and the FX library. `src/ai-spec/vendor/blocks` contains
  **unchanged** types, params, compileBlock and policy from PR21 commit
  `6a74c956f762dfa2c6bf64cb643a4f2afd3e6e97`. SHA-256 provenance tests pin them.
  This is the existing static validator, not a regex substitute or an evaluator.
  No worker/render code is copied. When PR21 is integrated, replace this snapshot
  with a reviewed shared import; until then policy updates must be synchronized
  explicitly and tested. TypeScript is the repository's existing development
  dependency; source validation requires it installed. No dependency is added.
- D-242: `catalogs/data.ts` pins metadata only for four blocks at the same commit
  and 80 FX entries at `98a95f7eed67595ab8081976b60b0993fcc159b0`.
  No editor/renderer imports and no dynamic registry/network discovery. FX stack
  excludes transition/blend metadata; simple transitions have their own intent.
- D-243: Unsupported features remain visible as blocked requirements. Do not fake
  successful application, collapse camera motion into unrelated layer transforms,
  or store executable source in schema-5 clip metadata.
- D-244: Seeds are explicit, spec format is versioned separately, caches include
  policy/catalog versions, and authored JSON remains editable source of truth.

## Prompt pack A — Composition Spec system prompt

```text
You author Composition Spec v1 JSON for a short video. Return one JSON object only,
not Markdown, JavaScript, editor project JSON or a claim that a video was rendered.
Use the supplied v1 schema, pinned block/FX catalogs and user brief. Never invent
command names, effect IDs, asset IDs, URLs, prices, product facts or source code
outside the optional validated blocks[].source field. Do not include credentials.

Use the least expensive design that satisfies the request: native text/rectangles/
ellipses first, existing reusable blocks second, new sandboxed code only for motion
that cannot be expressed with those. Prefer a small capable model for routing,
layout JSON and repairs. A model/router choice does not authorize API calls here.
If a required image is absent, make an image-placeholder plus a local image asset
slot describing exactly what the owner must supply. Never fetch or fabricate it.
Preserve uploaded asset IDs supplied by the trusted host; unknown assets stay slots.

Required root: version:1, safe id, title, canvas:{width,height,fps}, scenes.
Optional parameters, assets and blocks default to empty arrays. Canvas is 16..4096
per side and <=8388608 pixels; fps is 24,25,30,50,60. At most 12 scenes, 128 items
in total (64 per scene), and 180 seconds total. Times are finite seconds. Scenes
play in array order; items start relative to their scene and must finish inside it.
All scene/item/slot/block ids are safe and unique within their namespace.

Items are text, shape, image-placeholder, media-slot, audio-slot or code-block.
Each has id,name,kind,start,duration; optional transform,depth,fx. Text requires
text,width,height; shape requires shape,width,height,fill. Slots reference assets
by id; image-placeholder also has prompt and dimensions. Code blocks have blockId,
blockVersion,params and an explicit integer seed 0..4294967295. FX entries have an
exact catalog id, valid params and explicit seed. Never put pixel FX on audio.
Use literal seeds selected once (e.g. 7), not expressions or timestamps.

Declare user-editable parameters (name,label,type,default and type-specific limits)
and bind supported scalar fields using {"$param":"name"}. Keep times, seeds, IDs,
source and enum selectors literal. Bindings must satisfy both parameter and field
constraints. Do not use expressions, interpolation syntax or arbitrary JSON fields.

Optional cameraMoves contain sorted, nonoverlapping id/start/duration/from/to/easing.
States are x,y,zoom,rotation,shake:{amplitude,frequency,seed}; keep shake seed constant.
Outgoing scene transitions are crossfade, fade-black, fade-white, wipe-left/right or
slide-left/right, at most half of either scene; never on the final scene.
Code, camera, FX and transitions are valid authoring intents but not integrated
editor features. Do not say that a valid document is executable or rendered.

Before returning: check all references, total duration, containment, params, seeds
and source identity. If a validator error is supplied, repair only the identified
problem and preserve the user's text, uploaded asset references and intent. Return
the whole corrected JSON; do not suppress unsupported-feature requirements.
```

### Router prompt (design only; no model requests implemented)

```text
Classify the requested scene before authoring it. Return JSON:
{"route":"native"|"code-block"|"ask-for-image","reason":"...",
 "reuseBlockId":null|"known-catalog-id","imageRequest":null|"specific request"}.
Choose ask-for-image if the requested visual requires a photo/logo/footage that the
trusted host has not supplied. Choose native for editable static typography,
rectangles, ellipses, layout and existing media slots. Choose code-block for procedural
particles, per-letter springs, counters or diagrams with continuous data-driven
motion; reuse a pinned starter when possible. Use a small capable model first.
Do not generate source in this step. Do not invent availability, call APIs or spend
money. Ambiguity about product facts/assets requires owner input, not hallucination.
```

## Prompt pack B — code-block system prompt reused from PR21

The following is copied verbatim from the AI authoring guide in
`docs/CODE-LAYER.md` at PR21 commit 6a74c95. Passing compileBlock only permits later
sandbox execution; it never makes main-thread execution safe. The existing worker
watchdog, isolation limits and future CSP hardening still apply. Spec validation
does not test frame performance or guarantee safety against every denial of service.

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

## Six worked examples and exact plan fixtures

Each JSON block below is the complete authored document, not a partial fragment.
Tests compare it with the corresponding `.spec.json` file and compare the complete
resolver result with `.plan.json`; those plans are reviewed expectations, never
automatically rewritten during a test run. No example is a rendered video.

| Example        | Operations | Requirements | Interpretation                                                                  |
| -------------- | ---------- | ------------ | ------------------------------------------------------------------------------- |
| youtube-intro  | 57         | 2            | Native two-scene intro; music asset and transition remain gated                 |
| kinetic-quote  | 33         | 2            | Reused kinetic letters plus one statically validated original accent source     |
| data-explainer | 52         | 2            | Reused counter and pipeline with editable count; block integration gated        |
| lower-third    | 43         | 0            | Native candidate plan, still no dispatch adapter                                |
| product-ad     | 53         | 6            | Uploaded image reference, FX and parallax camera retained for later integration |
| outro          | 42         | 2            | Native text plus an image request and blocked glow FX                           |

### youtube-intro

Input: `tests/ai-spec/fixtures/youtube-intro.spec.json`.
Expected plan: `tests/ai-spec/fixtures/youtube-intro.plan.json`.

```json
{
  "version": 1,
  "id": "youtube-intro",
  "title": "Channel launch",
  "canvas": {
    "width": 1280,
    "height": 720,
    "fps": 30
  },
  "scenes": [
    {
      "id": "welcome",
      "name": "Welcome",
      "duration": 6,
      "items": [
        {
          "id": "headline",
          "name": "headline",
          "kind": "text",
          "start": 0,
          "duration": 6,
          "text": {
            "$param": "channel"
          },
          "width": 1000,
          "height": 160,
          "transform": {
            "x": 100,
            "y": 180
          },
          "fill": "#64e3c3"
        },
        {
          "id": "underline",
          "name": "underline",
          "kind": "shape",
          "start": 0,
          "duration": 6,
          "shape": "rectangle",
          "fill": "#37cbb1",
          "width": 900,
          "height": 12,
          "transform": {
            "x": 100,
            "y": 390
          }
        },
        {
          "id": "music",
          "name": "Intro music",
          "kind": "audio-slot",
          "slot": "music",
          "start": 0,
          "duration": 6
        }
      ],
      "transition": {
        "id": "crossfade",
        "duration": 0.5
      }
    },
    {
      "id": "episode",
      "name": "Episode",
      "duration": 3,
      "items": [
        {
          "id": "topic",
          "name": "topic",
          "kind": "text",
          "start": 0,
          "duration": 3,
          "text": "Build something worth sharing",
          "width": 1000,
          "height": 160,
          "transform": {
            "x": 100,
            "y": 230
          }
        }
      ]
    }
  ],
  "parameters": [
    {
      "name": "channel",
      "label": "Channel name",
      "type": "text",
      "default": "IDEAS IN MOTION",
      "maxLength": 40
    }
  ],
  "assets": [
    {
      "id": "music",
      "kind": "audio",
      "description": "Owner-supplied licensed intro music"
    }
  ]
}
```

### kinetic-quote

Input: `tests/ai-spec/fixtures/kinetic-quote.spec.json`.
Expected plan: `tests/ai-spec/fixtures/kinetic-quote.plan.json`.

```json
{
  "version": 1,
  "id": "kinetic-quote",
  "title": "Kinetic quote",
  "canvas": {
    "width": 1280,
    "height": 720,
    "fps": 30
  },
  "scenes": [
    {
      "id": "quote",
      "name": "Quote",
      "duration": 6,
      "items": [
        {
          "id": "words",
          "name": "words",
          "kind": "code-block",
          "start": 0,
          "duration": 6,
          "blockId": "kinetic-letters",
          "blockVersion": "1.0.0",
          "params": {
            "text": {
              "$param": "quote"
            },
            "color": "#ffe29a"
          },
          "seed": 7
        },
        {
          "id": "accent",
          "name": "accent",
          "kind": "code-block",
          "start": 0,
          "duration": 6,
          "blockId": "quote-dot",
          "blockVersion": "1.0.0",
          "params": {},
          "seed": 7
        }
      ]
    }
  ],
  "parameters": [
    {
      "name": "quote",
      "label": "Quote",
      "type": "text",
      "default": "MAKE ROOM FOR IDEAS",
      "maxLength": 40
    }
  ],
  "blocks": [
    {
      "id": "quote-dot",
      "source": "({id:'quote-dot',version:'1.0.0',name:'Quote dot',category:'Accent',defaultDuration:6,params:[],render(ctx,t,size,params,seed){ctx.fillStyle='#ffe29a';ctx.beginPath();ctx.arc(size.width/2,size.height*0.8,8+4*Math.sin(t),0,Math.PI*2);ctx.fill();}})"
    }
  ]
}
```

### data-explainer

Input: `tests/ai-spec/fixtures/data-explainer.spec.json`.
Expected plan: `tests/ai-spec/fixtures/data-explainer.plan.json`.

```json
{
  "version": 1,
  "id": "data-explainer",
  "title": "Pipeline progress",
  "canvas": {
    "width": 1280,
    "height": 720,
    "fps": 30
  },
  "scenes": [
    {
      "id": "numbers",
      "name": "Numbers",
      "duration": 8,
      "items": [
        {
          "id": "total",
          "name": "total",
          "kind": "code-block",
          "start": 0,
          "duration": 8,
          "blockId": "counter",
          "blockVersion": "1.0.0",
          "params": {
            "to": {
              "$param": "count"
            },
            "suffix": " records"
          },
          "seed": 7,
          "transform": {
            "scale": 0.65,
            "x": 60,
            "y": 0
          }
        },
        {
          "id": "pipeline",
          "name": "pipeline",
          "kind": "code-block",
          "start": 0,
          "duration": 8,
          "blockId": "data-pipeline",
          "blockVersion": "1.0.0",
          "params": {
            "labels": "LOAD,CLEAN,CHECK,SEND"
          },
          "seed": 7,
          "transform": {
            "scale": 0.65,
            "x": 60,
            "y": 280
          }
        },
        {
          "id": "caption",
          "name": "caption",
          "kind": "text",
          "start": 0,
          "duration": 8,
          "text": "From raw input to useful output",
          "width": 1000,
          "height": 160,
          "fontSize": 30,
          "transform": {
            "x": 180,
            "y": 610
          }
        }
      ]
    }
  ],
  "parameters": [
    {
      "name": "count",
      "label": "Record count",
      "type": "number",
      "min": 0,
      "max": 1000000,
      "step": 1,
      "default": 1200
    }
  ]
}
```

### lower-third

Input: `tests/ai-spec/fixtures/lower-third.spec.json`.
Expected plan: `tests/ai-spec/fixtures/lower-third.plan.json`.

```json
{
  "version": 1,
  "id": "lower-third",
  "title": "Speaker identification",
  "canvas": {
    "width": 1280,
    "height": 720,
    "fps": 30
  },
  "scenes": [
    {
      "id": "speaker",
      "name": "Speaker",
      "duration": 5,
      "items": [
        {
          "id": "bar",
          "name": "bar",
          "kind": "shape",
          "start": 0,
          "duration": 5,
          "shape": "rectangle",
          "fill": "#10242c",
          "width": 760,
          "height": 140,
          "transform": {
            "x": 60,
            "y": 520
          }
        },
        {
          "id": "speaker",
          "name": "speaker",
          "kind": "text",
          "start": 0,
          "duration": 5,
          "text": {
            "$param": "speaker"
          },
          "width": 1000,
          "height": 160,
          "fontSize": 42,
          "transform": {
            "x": 90,
            "y": 550
          }
        },
        {
          "id": "role",
          "name": "role",
          "kind": "text",
          "start": 0,
          "duration": 5,
          "text": "Creative technologist",
          "width": 1000,
          "height": 160,
          "fontSize": 26,
          "transform": {
            "x": 90,
            "y": 610
          },
          "fill": "#64e3c3"
        }
      ]
    }
  ],
  "parameters": [
    {
      "name": "speaker",
      "label": "Speaker",
      "type": "text",
      "default": "Sam Rivera",
      "maxLength": 60
    }
  ]
}
```

### product-ad

Input: `tests/ai-spec/fixtures/product-ad.spec.json`.
Expected plan: `tests/ai-spec/fixtures/product-ad.plan.json`.

```json
{
  "version": 1,
  "id": "product-ad",
  "title": "Uploaded product image with parallax",
  "canvas": {
    "width": 1280,
    "height": 720,
    "fps": 30
  },
  "scenes": [
    {
      "id": "hero",
      "name": "Hero",
      "duration": 6,
      "items": [
        {
          "id": "product",
          "name": "Uploaded product photograph",
          "kind": "media-slot",
          "slot": "product-photo",
          "start": 0,
          "duration": 6,
          "width": 1280,
          "height": 720,
          "depth": 0.35,
          "fx": [
            {
              "id": "adjust.contrast",
              "params": {
                "amount": 0.1
              },
              "seed": 11
            }
          ]
        },
        {
          "id": "promise",
          "name": "promise",
          "kind": "text",
          "start": 0,
          "duration": 6,
          "text": {
            "$param": "promise"
          },
          "width": 1000,
          "height": 160,
          "fill": "#ffffff",
          "transform": {
            "x": 80,
            "y": 100
          }
        },
        {
          "id": "price",
          "name": "price",
          "kind": "text",
          "start": 0,
          "duration": 6,
          "text": "Designed for everyday adventures",
          "width": 1000,
          "height": 160,
          "fontSize": 30,
          "transform": {
            "x": 80,
            "y": 590
          }
        }
      ],
      "cameraMoves": [
        {
          "id": "push-in",
          "start": 0,
          "duration": 6,
          "from": {
            "x": 0,
            "y": 0,
            "zoom": 1,
            "rotation": 0,
            "shake": {
              "amplitude": 0,
              "frequency": 4,
              "seed": 17
            }
          },
          "to": {
            "x": 45,
            "y": 15,
            "zoom": 1.15,
            "rotation": 0,
            "shake": {
              "amplitude": 0,
              "frequency": 4,
              "seed": 17
            }
          },
          "easing": "ease-in-out"
        }
      ]
    }
  ],
  "parameters": [
    {
      "name": "promise",
      "label": "Headline",
      "type": "text",
      "default": "TAKE THE LONG WAY HOME",
      "maxLength": 60
    }
  ],
  "assets": [
    {
      "id": "product-photo",
      "kind": "image",
      "description": "Owner-uploaded product photo",
      "assetId": "uploaded_product_photo"
    }
  ]
}
```

### outro

Input: `tests/ai-spec/fixtures/outro.spec.json`.
Expected plan: `tests/ai-spec/fixtures/outro.plan.json`.

```json
{
  "version": 1,
  "id": "outro",
  "title": "End card with requested avatar",
  "canvas": {
    "width": 1280,
    "height": 720,
    "fps": 30
  },
  "scenes": [
    {
      "id": "thanks",
      "name": "Thanks",
      "duration": 6,
      "items": [
        {
          "id": "thanks",
          "name": "thanks",
          "kind": "text",
          "start": 0,
          "duration": 6,
          "text": "THANKS FOR WATCHING",
          "width": 1000,
          "height": 160,
          "fill": "#64e3c3",
          "transform": {
            "x": 90,
            "y": 100
          },
          "fx": [
            {
              "id": "effect.glow",
              "params": {
                "intensity": 0.2
              },
              "seed": 21
            }
          ]
        },
        {
          "id": "avatar",
          "name": "Channel portrait request",
          "kind": "image-placeholder",
          "slot": "avatar-photo",
          "prompt": "Ask the owner for a square channel portrait; do not invent an image URL",
          "start": 0,
          "duration": 6,
          "width": 220,
          "height": 220,
          "transform": {
            "x": 80,
            "y": 300
          }
        },
        {
          "id": "cta",
          "name": "cta",
          "kind": "text",
          "start": 0,
          "duration": 6,
          "text": "Subscribe for the next idea",
          "width": 1000,
          "height": 160,
          "fontSize": 36,
          "transform": {
            "x": 360,
            "y": 380
          }
        }
      ]
    }
  ],
  "assets": [
    {
      "id": "avatar-photo",
      "kind": "image",
      "description": "A channel portrait still needed from the owner"
    }
  ]
}
```

## Cost-aware routing, caching and repair design

This section is a design, not an implemented model service. There is no provider
SDK, model API, key handling, network request, pricing estimate or live cost meter.

1. A deterministic host first validates available assets, duration/resolution and
   catalog version. Use the smallest configured instruction model for routing and
   schema-constrained native layout. A known counter/kinetic block needs parameter
   JSON, not fresh code. Ask for an image before attempting a visually unsuitable
   native substitute; no image-generation spend is authorized by this module.
2. Use a small code-capable model for short custom blocks only when reuse fails.
   Escalate to a stronger model only after a bounded repair attempt demonstrates a
   concrete reasoning/code need. Require an explicit host budget before escalation.
   Proposed starting limits: 2 repair attempts and a per-request token ceiling,
   tuned from measured task success; they are not performance or price promises.
3. Cache successful validated results by `validateSpec(...).cacheKey`. The key is
   canonical authored JSON + normalized editable values + pinned spec/catalog/
   compiler-policy versions. Object key order is irrelevant; scene/item/FX order
   is meaningful. Seeds, source text, assets, params and defaults affect identity.
   This exact key is potentially large and can contain private text: keep it local,
   or hash it at a trusted storage boundary; do not log whole source or assets.
   The module returns the key but does not persist a cache.
4. A build-plan cache must also be scoped to the target editor capability/schema
   version and namespace. An executable adapter would additionally key by asset
   fingerprints, font availability and project revision; matching authoring JSON
   does not prove identical imported bytes or rendered pixels. Invalidate on policy
   updates, block/FX version changes, asset rebinding or a changed editor contract.
5. Run the local validator before any more paid work. Send its at-most-50 JSON-
   pointer errors plus the original brief and candidate JSON to a small repair
   model. Treat user text/source and errors as untrusted data, not instructions.
   Ask for the smallest faithful correction and revalidate the whole document.
   If the error signature repeats or the attempt budget is exhausted, stop with
   the errors and ask the owner; never relax bounds, invent assets, strip required
   content or bypass compileBlock merely to get a green result.
6. Syntax validity is not creative quality. A later host must show the owner the
   resolved plan, missing assets and blocked integrations, then separately test
   sandbox rendering, scrub order and actual preview/export parity before execution
   is considered successful. Unit fixtures alone make no such visual claim.

No hosted AI execution, runtime cache, image acquisition, editor wiring, schema
migration, media duration probing or browser verification is included here.
