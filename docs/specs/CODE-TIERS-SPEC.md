# Code tiers spec (A / B / C) and Free code runtime

Owner goal: a user (or an AI such as Claude or Codex) writes high-level, complex motion-graphics code, imports it with one Import button, and gets it in the editor. As much as possible is editable; whatever is not editable must still PLAY and RENDER at full quality. Quality is never reduced to gain editability. Every imported animation can be saved as a reusable template. Revision 1, 2026-10-12. Source of truth for the Codex task `codex/free-code-runtime` and the Claude Code task `claude/x-series`.

## 1. Three tiers
- **Tier A, native**: a Composition Spec v1 JSON (`src/ai-spec`, merged in PR #23) applied through the command bus. It becomes real layers, keyframes, effects, transitions. Fully editable with every editor tool.
- **Tier B, Block**: the restricted block subset of `src/blocks` (PR #21; the 14-block library PR #24). Params editable. Deterministic closed-form. Validated by `compileBlock`.
- **Tier C, Free code**: general JavaScript (arrays, objects, classes, gradients, blend modes, stateful particles, WebGL) plus bundled libraries, running in a sandboxed iframe, rendered frame by frame (baked). Only the params the code exposes are editable; the layer itself (position, scale, rotation, opacity, trim, speed, fade, effects, transitions, mask) is edited like any clip.
- Authoring preference given to AI: A if the thing can be built from layers, else B, else C; ALWAYS expose params (colours, text, speeds, counts, seed) so the user can edit. Never choose C only because it is easier.

## 2. Import (one place)
- Entry points: Media panel "Import" menu > "Import code animation"; drag and drop of `.json`, `.js`, `.mjs`, `.html` files; a paste dialog. The same dialog is the "Edit code" view of an existing code layer.
- Classification, in this order: (1) valid JSON and valid Composition Spec -> A (applied through the command bus in one undo step, into a new scene or the current scene, the user chooses); (2) `compileBlock` accepts -> B; (3) the Free-code validator accepts -> C; else a plain-language error list (line, what, how to fix) and nothing is added. The dialog shows the detected tier badge, a live preview thumbnail at the thumbnail time, the generated params form, duration, and buttons Add to timeline, Save as template, Cancel. A tier-C result says plainly: "Full mode: runs in a sandbox and is rendered to frames; layer settings are editable, internal drawing is not".
- Source size limit 1 MB, duration limit 120 s, dimensions at most the project canvas.

## 3. Free code contract (Tier C)
A single JavaScript module string. It defines (by `export default` or `window.__block =`) an object:
```
{
  meta: { id, name, version, category, duration (s), fps (optional, default project fps),
          seekable (bool, default false), keepFrame (bool, default false), thumbnailTime,
          libs: ['three','pixi','lottie','gsap'],
          params: [ { name, label, type: 'number'|'color'|'text'|'bool'|'select', default, min, max, step, options } ] },
  async init({ canvas, ctx, gl, params, size:{width,height}, fps, duration, seed, libs, rng }) { },
  renderFrame({ t, frame, dt }) { }     // draw frame `frame` at time `t` onto the transparent canvas
}
```
- The host clears the canvas (transparent) before each `renderFrame` unless `meta.keepFrame` is true. `canvas` is a real `<canvas>` (2D or WebGL; the code chooses). `libs.three`, `libs.PIXI`, `libs.lottie`, `libs.gsap` are the pinned bundled builds.
- Determinism: the host overrides `Math.random` with a seeded PRNG (also given as `rng()`), `Date.now`/`performance.now` with a fake clock equal to `t`, and `requestAnimationFrame`/`setTimeout`/`setInterval` do nothing (the host drives time). `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `importScripts`, `Worker`, dynamic `import()`, `navigator.sendBeacon`, storage, cookies, `window.parent/top/opener/frames` and form submission are unavailable. Images, fonts and Lottie JSON come only as inline `data:` URLs in the source.
- Baking: frames are requested in order 0..N-1, so stateful simulations are allowed. If `meta.seekable` is true the host may request any frame (a pure function of `t`), which allows live scrubbing without a full bake.
- GSAP: used with paused timelines driven by `tl.time(t)` / `tl.seek(t)`. Its licence MUST be read first (see 7).

## 4. Free-code runtime (built by Codex, `src/freecode/`)
```
interface FreeCodeRuntime {
  validate(source): { ok: true, meta } | { ok: false, errors: {line, message}[] }
  open(source, opts:{ width, height, fps, duration, params, seed }): Promise<FreeCodeSession>
}
interface FreeCodeSession {
  meta
  renderFrame(frame: number): Promise<ImageBitmap>      // sequential, or random when seekable
  thumbnail(): Promise<ImageBitmap>
  dispose(): void                                       // kills the sandbox
}
```
- Sandbox: `<iframe sandbox="allow-scripts">` WITHOUT `allow-same-origin`, srcdoc, CSP `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'`. Libraries are inlined into the srcdoc from local bundled files, never from a CDN. Communication only by `postMessage` with transferred `ImageBitmap` / `ArrayBuffer`. Per-frame watchdog (default 5 s, configurable) and a total timeout; on timeout the iframe is removed and a clear error is returned. A hostile or broken source can never touch the editor DOM, storage or network.
- Frame capture: `createImageBitmap(canvas)` after `renderFrame` (WebGL contexts created with `preserveDrawingBuffer: true`; three and PIXI renderers configured by a host helper so this works), alpha preserved.
- Libraries (pinned versions, bundled, lazy-loaded per `meta.libs`): three (MIT), pixi.js (MIT), lottie-web (MIT); gsap only if its licence allows our use (7). Each licence is recorded in `docs/THIRD-PARTY.md`.
- Pure helper kit available to the code (and described in the AI guide): easing set (the editor's CSS curves), `lerp/clamp/map`, seeded noise (simplex/value), `rng`, vector helpers, a small particle emitter helper, text splitting per character/word with measureText, SVG path length and draw-on helper, colour helpers (hex/hsl, gradients), `spring`.

## 5. Editor integration (Claude Code, `claude/x-series`)
- **Layer**: schema 8 adds one optional layer field `code: { tier: 'B'|'C', source, meta, params, bakeKey, templateId? }` and nothing else; migration 7 -> 8 is identity. The layer is a full-canvas transparent bitmap-like layer: position, scale, rotation, opacity, blend, crop/mask, Fade, Speed, Reverse, Filters, Effects, Adjust colors, Transitions and Animate presets all work on it. Trim and move work like a video clip. Lane group: visual.
- **One render path for B and C**: the layer plays from a frame cache. A session renders frames in order into the cache (Tier B through the existing sandbox worker, Tier C through `FreeCodeRuntime`). Preview and export read the same cached frames, so preview equals export by construction. Seekable C blocks and all B blocks may also render the current frame live while scrubbing, falling back to the cache.
- **Cache**: OPFS (IndexedDB fallback), key = hash(source, params, width, height, fps, duration, seed, lib versions), lossless WebP or PNG with alpha, a memory and disk budget, LRU eviction, a partially baked range plays and the rest shows a "Rendering n %" bar on the clip with Cancel. Quality per layer: Full (project size) or Draft (50 %) for editing; export always uses Full and re-bakes if only Draft exists.
- **Params**: right rail category "Animation settings" for a code layer: one control per param (slider/number field, colour picker, text field, switch, select) generated from `meta.params`; B re-renders on change (debounced), C shows "Apply" (re-bake) because it can be heavy; one undo step per applied change. The normal clip categories stay. A "Code" button opens the Import dialog in edit mode.
- **Templates**: Import > "Save as template" (checked by default) stores `{ name, category, tier, source, meta, default params, thumbnail }` in the user's My Templates store (existing My Templates; not an undo step, per `docs/UNDO-RULES.md`), shown in Templates > My Templates > "Code animations" with its thumbnail (hover plays a short preview). Click or drag inserts a code layer at the playhead (new lane, one undo step) with the template's default params; the project keeps its own copy of the source so it opens anywhere. Rename, delete (soft delete with Restore), duplicate, export and import a template as a `.json` file.
- **Export**: the export worker composes code layers from the frame cache exactly like clips; audio unaffected; the export Start/End frame range is respected.
- **Scenes and the outliner**: code layers appear in the Scene outliner with a code icon, hide/lock like others.

## 6. Quality and proof (what "done" means)
- No visual downgrade: Tier C bakes at the project's resolution with full alpha; no frame is dropped or interpolated; export equals preview within 1/255 per channel for non-WebGL samples and within 2/255 for WebGL (record the measured maximum; never claim zero without measuring).
- Ten complex reference samples (Codex) run end to end: stateful particles with collisions and trails; a three.js scene (procedural geometry, lights, camera move, no external assets); a PIXI graphics/particle scene; a Lottie animation (inline JSON); canvas gradients with blend modes (aurora/glow); a WebGL fragment-shader animation; per-letter kinetic typography; an SVG path draw-on infographic; an animated bar/line chart with counters; a parallax layered scene from code-drawn shapes. Each is deterministic (two bakes equal), inside the time budget at 1080p, and draws nothing outside the canvas.
- Security tests: a source that calls `fetch`, opens a WebSocket, reads `parent.document`, writes localStorage, loops forever, allocates without bound or uses `import()` fails safely with a clear message and leaves the editor untouched.
- Honest limits (stated in the docs): cross-browser and cross-GPU pixel parity is not promised (same machine and browser only); very long or very heavy sources are limited by the duration, memory and per-frame budgets.

## 7. Decisions and open points
- D1: three, pixi.js and lottie-web are approved new dependencies for this work (all MIT). Pin exact versions at least 2 weeks old, bundle locally, lazy-load.
- D2: GSAP: READ its current licence text first. My understanding (verify; I am not a lawyer): the free licence forbids use in a product that competes with a visual animation builder tool. If the text allows our use, bundle it; if unclear or forbidden, do NOT add it, say so in the report, and rely on our own easing and timeline helpers.
- D3: Free code runs only code the user imported or pasted; no network at all (CSP). A stricter hosted sandbox is a later production hardening item.
- D4: Codex writes `docs/FREECODE-AUTHORING.md`, a system prompt for AI authors: the A > B > C choice, the contract above, determinism rules, params exposure, the helper kit, and three complete worked examples.
- D5: Schema 8 (one optional layer field) is authorised for Claude Code once.
