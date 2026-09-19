# AI-Native Video Editor — T3 baseline handoff

Prepared 2026-09-19 (Asia/Calcutta). Baseline: `66c302d`, `Baseline: T3 (schema 4)`.

## Authority, evidence, and original goal

Build a long-term, browser-first professional AI-Native Video Editor, incrementally: first the manual editor, later capabilities and AI using the same semantic command system. Extend working tiers without architectural rewrites. There must be one EditorEngine, one canonical project/Scene Graph, one Command Bus, intentional undo/redo, explicit migrations, and no hidden parallel editable store. AI, production services, and later milestones are not implicitly authorized.

This document records the supplied conversation, its attached briefs, repository documentation, and validation performed during this baseline task. The ordered instruction archive below embeds the original attachment text; inline requests are recorded separately in that same order. Attachment text is historical scope, not permission to restart those milestones. Later explicit requests supersede earlier scope restrictions. The latest task authorizes only this baseline and handoff, with no source, test, or configuration changes and no fixing failed checks.

There was no Git repository before this task. The baseline captures existing files; it does not reconstruct historical commits. Earlier exact file diffs and timestamps cannot be recovered from Git. Dates below are attributed to changelog/contract dates or prior tool output; unknown individual correction dates are explicitly marked. Prior assistant completion statements are recorded claims, not independent browser acceptance evidence. Current tests do not prove every requested user workflow.

## Completed milestone record

File lists for early tiers identify the documented/current implementation locations, not proven per-milestone diffs. The two recent T3 runs have explicit changed-file reports in conversation.

### 2026-09-11 — Tier 1 foundation (CHANGELOG date)

- Delivered TypeScript/Vite, Zod runtime models, typed commands/events, atomic transactions, frozen state/history, assets, capability registration, serialization/migration runner, and development persistence/recovery.
- Relevant files: `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `.prettierignore`, `.prettierrc.json`, `index.html`, `src/main.ts`, `src/style.css`, `src/core/{model,scene,commands,engine,events,capabilities,serialization,index}.ts`, `src/persistence/local.ts`, `tests/{core,persistence}.test.ts`, README/ARCHITECTURE/DEVELOPMENT_PLAN/CHANGELOG/AGENTS.
- Decisions: synchronous side-effect-free handlers and draft validation permit atomic rollback; frozen snapshots prevent external mutation; capabilities use the same bus/history so future integrations do not need another mutation path. Local storage is development-only, with backup/quarantine and future-version protection.

### 2026-09-11 — Tier 1.1 contract freeze (CHANGELOG date)

- Froze top-left origin, right/down axes, clockwise degrees, fixed local `(0,0)`, local T*R*S, parent-times-local world transforms, multiplicative inherited opacity, precision and guarded inversion.
- Relevant files: `src/core/transforms.ts`, `src/core/index.ts`, `tests/transforms.test.ts`, `TRANSFORM_CONTRACT.md`, architecture/agent documentation. Exact full historical diff unavailable.
- Decisions: derive affine matrices rather than store them; preserve stored local transforms on MOVE_LAYER. Reject transformed UNGROUP because shear and metadata cannot safely be flattened into the stored TRS model. No renderer or schema change in this tier.

### 2026-09-11 — Tier 2.1 shell/read-only Canvas (CHANGELOG date)

- Added desktop shell, library placeholders, Scene list, Canvas 2D adapter, selection/hit testing, readonly Inspector, example project, and a static timeline placeholder.
- Relevant files: `src/ui/{shell,session,inspector,example}.ts`, `src/render/{adapter,canvas}.ts`, `src/main.ts`, `src/style.css`, `tests/{render,shell}.test.ts`, package/lockfile for jsdom, project documentation.
- Decisions: renderer has no engine or mutation access; projections are disposable; media renders deterministic labeled placeholders; selection is transient and produces no history/autosave.

### Date not independently recorded — Tier 2.1 viewport correction

- Corrected fit to allow scaling below 1 while retaining 1 as the upper cap, centering and preferred 40px padding per side. Tiny viewports cap the minimum content allowance to available logical space. Invalid/nonfinite dimensions and underflow fail explicitly; DPR affects backing pixels, not logical geometry.
- Known implementation/test locations: `src/render/adapter.ts`, `tests/render.test.ts`, `ARCHITECTURE.md`. Exact historical changed-file list unavailable.
- Reason: compositions larger than the available area must fit instead of clipping. No second viewport store or transform-contract change.

### 2026-09-11 — Tier 2.2 interactive transforms (CHANGELOG date)

- Added move/resize/rotation handles, pointer capture and previews, six Inspector transform inputs, cancellation/no-op rules, one gesture per transaction, and synchronization tests.
- Relevant files: `src/ui/{canvas-interaction,transform-interaction,transform-commands,inspector,shell,session}.ts`, `src/render/{selection,canvas,adapter}.ts`, `src/core/transforms.ts`, `tests/{interaction,transforms,render,shell}.test.ts`, `TRANSFORM_INTERACTION_CONTRACT.md`, documentation.
- Decision: preview numeric overrides transiently; commit changed semantic properties once on release, keeping canonical state and history clean during pointermove.

### 2026-09-12 — Tier 2.2.1 professional transform correction (CHANGELOG date)

- Added visual-center pivot compensation, shared type-aware overlays, generic edge scaling, group interaction, visible rotation handle, and text-width grips/reflow without scale/font-size changes.
- Relevant files: prior interaction/selection/render files, `src/render/{text-layout,transform-capabilities}.ts`, `tests/transform-interaction-math.test.ts`, interaction tests, `TRANSFORM_INTERACTION_CONTRACT.md` revision 2, documentation.
- Reasons: shared drawing/hit geometry prevents drift; compensate position to preserve the visual center while leaving frozen T*R*S and local origin intact. Existing text retains old line layout until the typed `textWrap` convention is enabled.

### 2026-09-12 — Tier 2.2.2 proportional corners (interaction-contract date)

- Normal corner resize preserves the original signed scale ratio, including rotated, nested and reflected geometry. Opposite corner stays fixed. Generic edge behavior, text-side width/reflow, rotation and history remain unchanged.
- Known locations: `src/core/transforms.ts`, interaction controllers/contract revision 3, `tests/transform-interaction-math.test.ts`, `tests/interaction.test.ts`. Exact historical diff unavailable.
- Reason: prevent independent X/Y stretching of glyphs on ordinary corner drags. Schema remained 1 at this milestone.

### 2026-09-12 — Tier 2.3 timeline foundation (CHANGELOG date)

- Added layer timing rows, ruler/playhead/seeking, zoom/scroll, move/trim/snapping, sibling reorder, shared selection, timing visibility and SET_LAYER_TIMING. Schema 2 with consecutive 1→2 migration.
- Relevant files: `src/core/{model,commands,serialization,time,index}.ts`, `src/ui/{timeline,timeline-model,session,inspector,shell}.ts`, `src/render/adapter.ts`, `src/style.css`, `tests/timeline.test.ts`, `tests/fixtures/timeline-v1.json`, related tests/docs.
- Reason: canonical timing must participate in history/persistence; UI time/zoom remain transient. Layer/group intervals are absolute composition seconds, with ancestor gating and half-open active intervals.

### 2026-09-13 — T3 responsive workspace and correction sequence (CHANGELOG date; individual pass dates unknown)

- Added resizable/collapsible panels, Canvas zoom, shared multi-selection/move/marquee, elapsed-time FPS playback, split/duplicate/delete, markers, basic typed transform keyframes, context actions, shortcuts, and existing-asset drops. Schema 3 with 2→3 migration.
- Subsequent briefs requested a quick completion pass, manual composition duration plus transport grouping, then replaced the manual-duration workflow with content-driven duration. The final current rule derives duration at canonical validation/mutation boundaries from content; playback, ruler, End, render source and JSON use the same result. Empty composition fallback is 10 seconds; nonempty content is not capped at 10.
- Relevant files: `src/ui/{workspace,editing,playback,session,shell,timeline,timeline-model,inspector,canvas-interaction,transform-interaction}.ts`, `src/render/{adapter,selection,canvas}.ts`, `src/core/{model,commands,serialization}.ts`, `src/style.css`, `tests/{workspace,timeline,interaction,render,shell,core}.test.ts`, `tests/fixtures/workspace-v2.json`, documentation. Individual correction diffs are not available.
- Decisions: use one EditorSession time/selection state and existing history; retain stable event/scroll surfaces; keep transport immediately above timeline and fixed while rows scroll; keyframes are authoring records, not an interpolation engine.

### 2026-09-14 — consolidated T3 NLE extension (prior tool-output date)

- Established schema-4 composition tracks containing multiple clips. Clips link existing layer/asset records and own timing/source ranges. Added track/clip commands, enabled/locked/muted metadata, track order, cross-track/multi-clip movement, clip-aware split/duplicate/delete, drop creation, renderer/Inspector timing resolution, and migration 3→4.
- Reported changed files: `README.md`, `ARCHITECTURE.md`, `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`; `src/core/{model,commands,serialization,timeline,index}.ts`; `src/render/adapter.ts`; `src/ui/{timeline,timeline-model,editing,shell,inspector}.ts`; `src/style.css`; `tests/{nle,core,interaction,shell,timeline,transforms,workspace}.test.ts`.
- Decisions: track membership comes from containment, without duplicated trackId; one clip links one layer; Scene Graph remains spatial/content ownership, tracks/clips own NLE timing. Unlinked layers keep AE-style timing rows. Migration adds empty tracks rather than guessing legacy ownership. All edits use the existing command/history path.
- Recorded validation: focused 91, full 263 across 10 files; typecheck/build/check passed. Browser evidence covered the example project's transport, advancing time/Stop, selection synchronization and console. It did not demonstrate NLE track controls, asset drops, all scroll cases, or the full realistic-duration acceptance checklist. The earlier final report overstated breadth if read as proof of every workflow.

### 2026-09-14 — surgical same-track drop correction (prior tool-output date)

- Changed only `src/ui/shell.ts`, `src/ui/timeline.ts`, `src/style.css`, `tests/workspace.test.ts`.
- Added draggable asset title/data ID, destination-row highlight/cleanup, and explicit locked/incompatible target rejection instead of fallback. Expanded the existing test to three clips, distinct IDs/links/start times, preserved earlier clips, selection, undo/redo, duration growth and JSON round-trip.
- Reason: model/commands already appended independent clips; the identified change was UI feedback/destination handling. No underlying repeated-drop failure was reproduced before this correction. New highlight alone should not be described as an architectural multi-clip implementation.
- Recorded validation: focused 23 passed; full 263; typecheck/build/check passed. No live-browser same-track drop acceptance was recorded for this pass.

### 2026-09-19 — baseline and handoff only

- Initialized main and committed 59 existing files as `66c302d Baseline: T3 (schema 4)`.
- Verified existing `.gitignore` excludes `node_modules/`, `dist/`, `*.local`; it also excludes `coverage/`. No ignore/config changes.
- Ran clean install and complete check without modifying source/tests/config. Added only this handoff for a separate `docs: add HANDOFF` commit.

## Known limitations, bugs, and follow-up concerns

- No media importing/decoding, audio output/mixing, waveform display, final video render/export pipeline, interpolation/curves, transition/effect evaluation, advanced masks/compositing, ripple editing, automatic edge scrolling, virtualization, GPU/3D/tracking, AI, backend/auth/billing/cloud, expanded libraries, or external plugin execution. JSON export is not video export. T4+ has not started.
- Source in/out and speed are stored clip metadata; there is no runtime media speed evaluation or speed-editing UI. Mute controls currently change metadata with no audible playback engine. Do not claim those controls implement audio muting.
- Existing registered image/video/audio references can be dragged; the default artwork example has no media assets, and no asset importer was authorized. A media-populated project JSON is needed to exercise that flow. Same-track clip creation/duplication already exists and is not a missing architecture feature.
- Spatial transform contracts remain frozen; transformed UNGROUP remains rejected. Selection bounds use rectangles, not glyph/pixel alpha. Text uses system-font wrapping with platform-dependent metrics. No full text-content editor/typography system.
- No retained transform/cache store; render traversal can be O(n²). Large timelines face browser coordinate limits. Drag/zoom can rebuild disposable rows; no comprehensive performance benchmark was recorded.
- Local storage is development-only, origin-specific and size-limited. No durable media store or multi-tab conflict resolution. Forced termination within autosave debounce can lose recent work. Preserve future-schema primary saves.
- Documentation conflicts remain intentionally unfixed: AGENTS still names Tier 2.2.1 as current and forbids timeline/playback, refers to interaction revision 2, and limits Inspector fields. Later explicit user T3 instructions superseded those restrictions. Older ARCHITECTURE/CHANGELOG/contract paragraphs preserve obsolete schema/scope statements; the changelog places later schema-4 bullets beneath a September 13 heading. Use attributed dates above, current schema 4, and later scoped requests.
- UI review concerns visible in prior code excerpts, not newly reproduced bugs: selection styling uses a selected-row selector that can highlight every clip on a selected NLE track; a no-layers message checks AE rows without considering NLE rows; asset drop highlight marks rows before type/lock validation. These need focused confirmation before a future fix.
- Source range/duration/speed consistency and lock behavior across all semantic deletion/grouping paths were not exhaustively established by the recorded tests. Treat as review questions, not proven failures.
- Previous reports of completion relied heavily on synthetic DOM tests; the default-example browser pass did not establish all end-user NLE behaviors. The same-track regression used synthetic coordinates and did not explicitly exercise nonzero scroll/changed zoom or every incompatible-track error path. Preserve the existing tests; do not invent coverage.
- No source fixes are authorized by this handoff. Future work needs an explicit scope, including any documentation corrections above.

## Runbook and Windows notes

Use Node.js 20+ and npm 10+ per the permanent rules. This baseline actually used Node `v20.5.0` and npm `10.9.9` via `npx --yes npm@10`; host default npm is `9.8.0`. Earlier run reports used Node 20.5.0 and npm 10, but did not record every exact npm patch version. Do not assume all modern dependencies support every Node 20 minor merely from the project's broad engine declaration.

From the workspace in PowerShell:

```powershell
npx --yes npm@10 ci
npx --yes npm@10 run check
npx --yes npm@10 run dev
```

With npm 10+ already on PATH, the equivalent commands are `npm ci`, `npm run check`, and `npm run dev`. Vite binds `127.0.0.1`; follow its printed URL (normally port 5173, with fallback if occupied). The build is in ignored `dist/`. `check` runs format verification, TypeScript, Vitest, then Vite build. `format` writes files and was deliberately not run in this baseline task. Future normal implementation tasks follow their explicitly authorized validation strategy.

Paths contain spaces: quote them in PowerShell. Avoid POSIX glob assumptions (`rg tests/*.test.ts` failed previously on Windows; search the directory with `-g` instead). npm 10 resolution needed network-enabled execution; the sandbox attempt to resolve npm emitted MaxListenersExceededWarning and stalled. The successful npm 10 installation/check was separate. No source change was used to work around tooling.

Git initialization under the sandbox created a Windows owner mismatch. Git add/commit also required permission to write `.git/index`. Commands used a process-local trust override, never a global config change:

```powershell
git -c safe.directory='C:/Users/amd/Desktop/chatgpt video editor with ai/1' status
```

Use that only for this known workspace if needed in this environment. Git emitted LF→CRLF warnings on add; no line-ending config was changed. Commit author was the existing configured Git identity. No remote or push was requested or created. No historical Git commits existed before this baseline.

## Baseline validation results

On 2026-09-19, `npm ci` (npm 10.9.9): exit 0, 84 packages added, 85 audited, 23 funding notices, 0 vulnerabilities. It emitted the whatwg-encoding 3.1.1 deprecation warning. No dependency/lockfile fix was attempted.

`npm run check`: exit 0; formatting passed, TypeScript passed, 10 files / 263 tests passed, production build passed (43 modules, 448ms). Build output: `dist/index.html` 0.48kB/gzip 0.31kB; CSS `index-6DUDI8-r.css` 18.07kB/gzip 4.67kB; JS `index-DDUF7JpJ.js` 159.76kB/gzip 45.28kB. These are measurements of this run, not guarantees.

The check's reporter omitted per-file counts. A separate unmodified test run with default and JSON reporters passed and recorded:

| Test file                                | Passing tests |
| ---------------------------------------- | ------------: |
| tests/core.test.ts                       |            35 |
| tests/interaction.test.ts                |            78 |
| tests/nle.test.ts                        |             9 |
| tests/persistence.test.ts                |             7 |
| tests/render.test.ts                     |            28 |
| tests/shell.test.ts                      |            10 |
| tests/timeline.test.ts                   |            30 |
| tests/transform-interaction-math.test.ts |             8 |
| tests/transforms.test.ts                 |            44 |
| tests/workspace.test.ts                  |            14 |
| Total                                    |           263 |

The complete terminal output is included in the final conversation report. The main check ran before this handoff was created, as requested. A documentation-only formatting check follows creation; no second source/test/config modification is part of this task.

## Ordered user instruction archive

The following preserves all supplied project briefs in conversation order, including their detailed tests, prohibited work, reporting formats, stop rules, and future capability contracts. Attached requests are copied verbatim inside text fences. Inline requests are transcribed below. Original attachment IDs identify provenance; their external local paths are not needed to read this self-contained handoff. User-supplied permanent AGENTS rules are included at their position. Ambient browser state, tool metadata, plugin availability catalogs, and environment messages are context rather than implementation requests: recorded browser URLs were localhost 4173/5173, workspace was Windows/PowerShell, and the later environment date changed to September 19. No plugin installation or external service use was requested by those catalogs.

### 01 — Original Tier 1 foundation

Source attachment: 5f86b339-ed3c-479a-a1d7-5312a6478682/pasted-text.txt (verbatim).

```text
You are the primary implementation agent for a long-term browser-based professional video editor project.

PROJECT NAME:
AI-Native Video Editor

CURRENT DEVELOPMENT STAGE:
Phase 1 — Manual Video Editor
Tier 1 — Foundation

IMPORTANT:
Do NOT build the complete video editor yet.
Do NOT implement Canvas, Timeline, Effects, AI, 3D, or production infrastructure yet.

We are building the project incrementally in stable tiers. Every future tier must extend the existing architecture without rewriting working systems.

FIRST, inspect the repository and determine whether it is empty or contains existing code.

Then create a clean, maintainable TypeScript-based project foundation suitable for a browser-first video editor.

ARCHITECTURAL PRINCIPLES:

1. One editor engine.
2. One canonical Scene Graph.
3. One Command Bus.
4. UI must never directly mutate canonical editor state.
5. Every editor mutation must go through semantic commands.
6. Every mutation must support intentional undo/redo boundaries.
7. Project state must be serializable and versioned.
8. Schema migrations must be supported from the beginning.
9. Plugin/Capability architecture must exist from the beginning.
10. Future features must be addable as capabilities/plugins without rewriting the core.
11. Avoid duplicate sources of truth.
12. Keep core systems modular and independently testable.
13. Do not create hidden parallel state systems.
14. Do not implement AI functionality yet.
15. Do not implement production infrastructure yet.
16. Do not over-engineer features that belong to later tiers.
17. Prefer stable interfaces and extension points over hard-coded future implementations.

PHASE 1 TIER 1 SCOPE:

A. Project system

* Project model
* Project metadata
* Project settings
* Project serialization
* Project schema version

B. Composition system

* Composition model
* width
* height
* fps
* duration
* layers
* markers
* audio track placeholders

C. Scene Graph

* Layer model
* Layer IDs
* parent/child relationships
* layer types
* transforms
* properties
* effects placeholder
* masks placeholder
* asset references

D. Property system

* typed properties
* animated flag
* future keyframe compatibility
* constraints placeholder

E. Command Bus
Implement a semantic command architecture.

At minimum support the foundation for:

* CREATE_LAYER
* DELETE_LAYER
* MOVE_LAYER
* SET_PROPERTY
* ADD_ASSET
* REPLACE_ASSET
* GROUP
* UNGROUP

Commands must be typed and validated.

F. Transactions

* atomic command groups
* transaction boundaries
* meaningful history grouping

G. History

* undo
* redo
* command history
* transaction history
* history metadata

H. Event system

* typed editor events
* command lifecycle events
* state-change notifications

I. Asset Registry foundation

* asset IDs
* asset metadata
* asset type
* source reference
* dimensions/duration where applicable
* future generated asset compatibility

J. Plugin / Capability Registry
Implement the foundation now.

Capabilities should be able to declare:

* id
* version
* input schema
* output schema
* commands
* UI extension placeholder
* renderer extension placeholder
* AI instruction placeholder

Do not implement actual external plugins yet.

K. Validation

* command validation
* project validation
* schema validation
* capability validation foundation

L. Versioning / migrations

* schemaVersion
* migration registry
* migration runner
* forward compatibility strategy

M. Persistence

* local development persistence only
* save/load serialized project state
* autosave foundation
* recovery-safe behavior

N. Testing
Set up a proper test framework.

Create tests for:

* project creation
* composition creation
* layer creation
* layer deletion
* property updates
* command execution
* command validation
* undo
* redo
* transactions
* serialization/deserialization
* schema versioning
* plugin registration
* invalid command rejection

O. Documentation
Create:

* README.md
* ARCHITECTURE.md
* DEVELOPMENT_PLAN.md
* CHANGELOG.md
* AGENTS.md

AGENTS.md must contain the permanent development rules for future agents.

IMPORTANT DEVELOPMENT RULE:

Before implementing anything substantial:

1. Inspect the repository.
2. Explain the implementation plan internally.
3. Implement only the current Tier 1 scope.
4. Run formatting.
5. Run type checking.
6. Run tests.
7. Run production build.
8. Fix every error found.
9. Run the checks again.
10. Review the final diff.
11. Do not declare completion if anything is broken.

DO NOT:

* implement Canvas
* implement Timeline UI
* implement AI
* implement AI generation
* implement Supabase
* implement cloud storage
* implement authentication
* implement billing
* implement production deployment
* add unnecessary dependencies
* create placeholder code that pretends to implement future systems
* rewrite working code without necessity

The result must be a clean, extensible foundation that later tiers can build upon.

At the end, provide:

1. files created
2. architecture summary
3. commands run
4. tests run and results
5. build result
6. known limitations
7. recommended next milestone

Do not stop merely because the initial implementation compiles. Run the complete validation cycle and fix issues before reporting completion.

```

### 02 — Tier 1.1 transform and Scene Graph contract freeze

Source: inline user request (transcribed; list formatting condensed).

```text
We have completed Phase 1 — Tier 1 Foundation.

Do NOT start Tier 2.
Do NOT build Canvas, Timeline, Renderer, Playback, Effects, AI, 3D, or any new UI system.

Create a small architecture-hardening milestone:
TIER 1.1 — TRANSFORM & SCENE GRAPH CONTRACT FREEZE

Goal: Freeze the transform and scene-graph semantics required before Canvas implementation so future rendering/UI work does not force an architectural rewrite.

Tasks:
1. Inspect the existing repository and AGENTS.md first.
2. Preserve the existing single EditorEngine, canonical Scene Graph, Command Bus, transactions, history, persistence, and capability architecture.
3. Do not introduce a second state store.
4. Do not change the public architecture unnecessarily.

Define and document: coordinate system; composition origin; layer local coordinates; parent/local/world transform relationship; position semantics; scale semantics; rotation semantics; opacity semantics; transform composition order; anchor/origin semantics; group transform semantics; nested group transform semantics; reparent behavior; whether MOVE_LAYER preserves local transform or world appearance; transformed-group UNGROUP behavior; how future UNGROUP will preserve world-space appearance; numerical precision expectations; deterministic transform calculations.

Tier 1 currently does not have a renderer. Do not implement rendering.
If helper math is needed, create a small pure transform module that is DOM-independent and rendering-independent.
Add deterministic unit tests for identity transform, translation, scale, rotation, nested parent/child composition, transform composition order, world transform calculation, inverse transform where needed, reparent semantics, transformed group ungroup semantics/contract, numerical edge cases.
If the current data model needs a minimal schema adjustment to support the frozen semantics, make the smallest possible change.
If persistent project data changes: increment schemaVersion; add explicit consecutive migration; add migration regression tests.
Do NOT implement actual ungrouping of transformed groups unless the transform contract makes it fully deterministic and safe.
Do NOT implement Canvas, Timeline, keyframes, rendering, AI.
After implementation: npm run format; npm run typecheck; npm test; npm run build; npm run check. Review the final diff.
Report: files changed; transform contract; architecture implications; tests added; validation results; build result; remaining limitations; recommendation for Tier 2.
Do not claim completion if any check is broken.
```

### 03 — Tier 2.1 shell and readonly Canvas

Source attachment: f32b0456-8b5e-4914-913a-eae26f8abe00/pasted-text.txt (verbatim).

```text
We are now starting:

PHASE 1 — COMPLETE MANUAL EDITOR
TIER 2.1 — EDITOR SHELL + READ-ONLY COMPOSITION CANVAS

Tier 1 and Tier 1.1 are approved and frozen.

IMPORTANT:
Do not redesign or replace the existing architecture.
Do not start Timeline.
Do not start AI.
Do not start effects.
Do not start animation/keyframes.
Do not start 3D.
Do not start production services.

The goal of this milestone is to create the first real Editor UI and a READ-ONLY Canvas that consumes the existing canonical Scene Graph and frozen Transform Contract.

==================================================
1. ARCHITECTURE RULE
==================================================

The existing EditorEngine / canonical Scene Graph remains the single source of truth.

The UI must NEVER maintain a second authoritative copy of project/layer state.

The architecture must remain:

User/UI
  ↓
Interaction Layer
  ↓
Command Builder
  ↓
Command Bus
  ↓
Editor Engine
  ↓
Canonical Scene Graph
  ↓
Derived UI State
  ↓
Canvas Renderer

For this milestone, Canvas is READ-ONLY.

Canvas must NOT directly mutate Scene Graph state.

==================================================
2. EDITOR SHELL
==================================================

Create the initial professional editor shell.

Required regions:

- Top bar
- Left Library/Assets panel placeholder
- Center Canvas/Preview area
- Right Inspector placeholder
- Bottom Timeline placeholder

The Timeline placeholder must be visually present but NOT implement timeline functionality.

Use the existing project architecture and styling approach.

Do not create a separate editor implementation for future Beginner/Creator/Advanced modes.

The same editor shell and same underlying engine must eventually support all modes.

==================================================
3. COMPOSITION CANVAS
==================================================

Create a real composition preview canvas.

The canvas must consume the existing Composition and Layer data from the canonical Scene Graph.

Do NOT create fake independent canvas state.

At minimum render:

- composition bounds
- layer rectangles/shapes
- layer position
- layer width/height
- scale
- rotation
- opacity
- nested/group transforms

If the current layer types do not contain enough visual information for a particular layer type, use a deterministic placeholder representation.

Do not add a new asset-generation system.

==================================================
4. TRANSFORM CONTRACT
==================================================

Use the frozen TRANSFORM_CONTRACT.md exactly.

Do not invent different transform semantics.

Respect:

- top-left composition origin
- X increases right
- Y increases down
- local transform semantics
- T × R × S order
- clockwise rotation
- parent × local world transform
- inherited opacity
- affine/nested transform behavior
- guarded inversion

Do not duplicate transform mathematics inside the Canvas.

The Canvas must consume the shared transform helpers from:

src/core/transforms.ts

If the renderer requires another helper, extend the existing transform module rather than duplicating formulas.

==================================================
5. READ-ONLY SELECTION
==================================================

Implement visual selection only.

The user should be able to click a rendered layer and see which layer is selected.

Selection must be DERIVED UI STATE.

It must not modify the canonical Scene Graph.

Required:

- click layer
- selected-layer visual indication
- click empty canvas to clear selection
- nested/group layer hit testing where practical

Do NOT implement:

- dragging
- resizing
- rotation handles
- crop
- masking
- editing transforms
- keyboard movement

Those belong to later milestones.

==================================================
6. INSPECTOR
==================================================

Create the first read-only Inspector.

When a layer is selected, show its current canonical values:

- layer name
- layer type
- position
- scale
- rotation
- opacity
- size where available
- parent/group information where available

Inspector values are READ-ONLY in this milestone.

Do not create editable input controls yet.

The Inspector must read from the same canonical Scene Graph used by Canvas.

==================================================
7. LIBRARY PANEL
==================================================

Create the initial Library panel structure.

For now it may contain deterministic placeholders for:

- Assets
- Media
- Graphics
- Text
- Templates

Do not implement asset importing yet.

Do not implement AI generation.

Do not implement stock media search.

The purpose is to establish the permanent editor layout and routing structure.

==================================================
8. TIMELINE PLACEHOLDER
==================================================

Create the visual Timeline region only.

Include:

- timeline header
- track-area placeholder
- ruler placeholder
- playhead placeholder

No actual timeline state.

No clips.

No keyframes.

No playback.

No animation.

No audio.

Do not create fake timeline architecture that bypasses the EditorEngine.

==================================================
9. RESPONSIVE / LAYOUT BEHAVIOR
==================================================

The editor should establish the intended desktop layout.

Prioritize:

- stable panel sizing
- canvas centered in available space
- clear panel boundaries
- overflow handling
- resizable-looking structure if simple to implement

Do not spend significant time on mobile UI.

This is a professional desktop-class web editor.

==================================================
10. TESTING
==================================================

Add tests for:

A. Canvas reads canonical Scene Graph state.

B. Rendering a layer with a known transform produces the expected visual geometry.

C. Nested parent/child transforms are respected.

D. Opacity inheritance is respected.

E. Selecting a layer changes only UI selection state and does not mutate the Scene Graph.

F. Clearing selection works.

G. Inspector displays canonical values.

H. Updating canonical state through the existing command system causes the Canvas/Inspector to reflect the new state.

I. No direct Canvas mutation of canonical state.

J. Existing Tier 1 and Tier 1.1 tests continue passing.

Prefer deterministic tests.

If browser testing is already available, add focused browser checks for the key interactions.

==================================================
11. IMPORTANT ARCHITECTURE RESTRICTIONS
==================================================

DO NOT:

- rewrite EditorEngine
- replace Scene Graph
- create a second project store
- create a second layer store
- create a separate Canvas state model
- bypass Command Bus
- add Redux/Zustand/etc. as a second source of truth
- add Timeline engine
- add animation engine
- add AI
- add WebGPU unless it is already naturally part of the current renderer architecture
- add a backend
- add Supabase
- add authentication
- add billing
- add collaboration
- add cloud rendering

Keep this milestone local-first.

==================================================
12. RENDERER ARCHITECTURE
==================================================

Create the Canvas renderer so that it is replaceable/extensible later.

Conceptually:

Scene Graph
    ↓
Render Adapter
    ↓
Canvas Renderer

Do not tightly couple rendering code to React/UI components.

The eventual renderer may evolve toward:

Renderer
 ├─ 2D Renderer
 ├─ WebGPU Renderer
 ├─ Video Renderer
 ├─ 3D Renderer
 └─ Final Render Pipeline

But do NOT implement those future systems now.

==================================================
13. FUTURE COMPATIBILITY
==================================================

Everything implemented in this milestone must be compatible with:

- Timeline
- keyframes
- effects
- masks
- compositing
- audio
- 3D
- tracking
- expressions
- AI Command API
- plugins/capabilities
- final renderer

Do not create APIs that assume the current simple Layer structure is the final editor.

==================================================
14. DOCUMENTATION
==================================================

Update:

- README.md
- ARCHITECTURE.md
- DEVELOPMENT_PLAN.md
- CHANGELOG.md
- AGENTS.md if necessary

Document:

- Editor Shell architecture
- Canvas data flow
- selection as derived UI state
- read-only Inspector
- renderer boundary
- what is intentionally NOT implemented

==================================================
15. VALIDATION
==================================================

After implementation run:

npm run format
npm run typecheck
npm test
npm run build
npm run check

Also review the final diff.

Do not claim completion if any check is broken.

Report:

1. Files created/changed
2. Editor Shell structure
3. Canvas rendering architecture
4. Scene Graph → Canvas data flow
5. Selection architecture
6. Inspector architecture
7. Tests added
8. Test count/result
9. Build result
10. Remaining limitations
11. Any architectural concerns
12. Recommendation for Tier 2.2

IMPORTANT FINAL RULE:

Do not continue automatically into Tier 2.2.

Stop after this milestone and wait for architectural review.
```

### 04 — Tier 2.1 viewport correction

Source: inline user request (transcribed; list formatting condensed).

```text
Tier 2.1 architecture review found one correction required.
Do NOT start Tier 2.2. Do NOT add inspector editing, transform handles, dragging/resizing/rotation, Timeline, AI, effects, animation, 3D, or media importing.
Fix ONLY the composition viewport fitting behavior.
Current issue: fitViewport() currently clamps zoom to a minimum of 1.0. A composition larger than the available editor canvas cannot zoom below 100%, so it may be clipped instead of actually fitting inside the available viewport.
Required behavior:
- The composition should fit inside the available canvas area.
- Zoom must be allowed below 1.0 when necessary.
- Preserve the existing intended padding and current centering.
- Do not change the frozen transform contract or canonical Scene Graph semantics.
- Do not introduce another viewport/state store. Keep viewport state derived/transient UI state.
Define deterministic behavior for composition smaller than viewport, composition larger than viewport, very small viewport, zero/invalid dimensions, devicePixelRatio, and composition aspect ratios wider/taller than viewport.
Add regressions proving large composition scales below 1.0 when necessary; composition remains centered; small composition does not become incorrectly clipped; pixel ratio does not change logical composition geometry; invalid viewport inputs remain rejected; existing render and selection behavior remains unchanged.
Do not change any other behavior.
Run npm run format; npm run typecheck; npm test; npm run build; npm run check. Review final diff.
Report exact files changed, exact viewport behavior before/after, tests added, total tests passing, build result, check result, and confirmation Tier 2.2 was NOT started.
STOP after this correction. Do not continue automatically.
```

### 05 — Tier 2.2 interactive Canvas

Source attachment: 1d3859d7-b0b8-49ec-a706-47c68bcaf105/pasted-text.txt (verbatim).

```text
We are now starting:

PHASE 1 — COMPLETE MANUAL EDITOR
TIER 2.2 — INTERACTIVE CANVAS TRANSFORM FOUNDATION

Tier 1, Tier 1.1, and Tier 2.1 are approved and frozen.

Do NOT redesign the existing architecture.

==================================================
PRIMARY GOAL
==================================================

Convert the current read-only Canvas into the first real interactive Canvas foundation.

The goal is to establish:

Canvas
 ↓
Selection
 ↓
Transform interaction
 ↓
Semantic Command
 ↓
Command Bus
 ↓
Canonical Scene Graph
 ↓
History
 ↓
Canvas refresh

The Canvas must NEVER directly mutate canonical project state.

==================================================
1. SELECTION
==================================================

Extend the existing transient selection system.

Support:

- click to select
- click empty canvas to deselect
- selected layer visual bounding box
- selected layer identification
- selection remains UI/session state only

Selection must NOT create:

- project mutations
- history entries
- autosaves
- Scene Graph changes

Preserve existing selection behavior from Tier 2.1.

==================================================
2. BOUNDING BOX
==================================================

Implement a real selection bounding box for the selected layer.

The bounding box must respect the layer's world-space geometry.

Support:

- position
- width
- height
- rotation
- scale
- nested parent transforms

The bounding box must be derived from canonical layer state.

Do not create a second authoritative transform state.

==================================================
3. MOVE INTERACTION
==================================================

Implement pointer-based layer movement.

Flow:

pointer interaction
 ↓
interaction resolver
 ↓
command builder
 ↓
MOVE_LAYER / appropriate semantic command
 ↓
Command Bus
 ↓
Scene Graph
 ↓
History
 ↓
Canvas refresh

Do NOT directly modify:

layer.transform.x
layer.transform.y

from Canvas event handlers.

All committed mutations must pass through the existing Command Bus.

During pointer dragging, it is acceptable to maintain transient interaction state for preview purposes, but canonical state must only be committed through the existing command architecture.

Define clearly:

- pointer capture
- drag start
- drag update
- drag end
- cancel behavior
- no-op drag behavior
- undo boundary

A completed drag should create one coherent history operation, not hundreds of unrelated undo steps.

==================================================
4. RESIZE INTERACTION
==================================================

Implement basic bounding-box resize handles.

Required handles:

- corners
- optionally edge handles if the current architecture supports them cleanly

At minimum support proportional/non-proportional behavior according to a clearly documented contract.

DO NOT add advanced constraints yet.

Do NOT add:
- perspective distortion
- skew handles
- mesh deformation
- corner pinning

All committed transform changes must use semantic commands and Command Bus.

==================================================
5. ROTATION INTERACTION
==================================================

Implement a rotation handle.

Rotation must use the frozen transform contract:

- clockwise rotation
- existing transform semantics
- existing anchor/origin semantics

Do not create a separate rotation convention.

Commit rotation through the Command Bus.

==================================================
6. TRANSFORM INTERACTION CONTRACT
==================================================

Document:

- coordinate conversion between screen/canvas/composition space
- pointer-to-composition conversion
- world/local transform conversion
- movement of nested children
- resizing rotated layers
- rotation around the frozen anchor
- rounding/precision rules
- cancel behavior
- history boundary

Use the existing transform helpers wherever possible.

Do NOT duplicate transform mathematics inside UI components.

If new pure math helpers are needed, place them in the existing core transform/math boundary.

==================================================
7. UNDO / REDO
==================================================

This is critical.

For one user drag:

START
 ↓
multiple pointer updates
 ↓
END
 ↓
ONE semantic history operation

Undo should restore the state before the drag.

Redo should restore the final state.

A cancelled interaction must create no committed mutation.

==================================================
8. INSPECTOR — LIMITED EDITING
==================================================

Add ONLY the minimum inspector editing required to prove the same command architecture works outside the Canvas.

Editable properties:

- X
- Y
- Scale X
- Scale Y
- Rotation
- Opacity

Each committed Inspector edit must use the existing semantic command system.

Do not implement:

- keyframes
- animation
- effects
- masks
- expressions
- advanced typography controls

Inspector and Canvas must modify the SAME canonical state.

==================================================
9. SINGLE SOURCE OF TRUTH TEST
==================================================

Add tests proving:

Canvas move
 → Scene Graph changes
 → Inspector updates

Inspector change
 → Scene Graph changes
 → Canvas updates

Undo
 → both Canvas and Inspector reflect previous state

Redo
 → both reflect final state

There must be no duplicate transform state.

==================================================
10. NESTED TRANSFORMS
==================================================

Test moving a child inside a transformed parent.

Verify the behavior against the frozen Tier 1.1 transform contract.

Do not silently invent world-space-preserving reparent behavior.

Do not implement transformed-group ungrouping.

==================================================
11. POINTER / INTERACTION SAFETY
==================================================

Handle:

- pointer capture
- pointer cancellation
- leaving canvas during drag
- rapid pointer movement
- zero-distance drag
- invalid coordinates
- very small viewport
- high devicePixelRatio

Avoid accidental browser text selection while transforming.

==================================================
12. ARCHITECTURE RESTRICTIONS
==================================================

DO NOT:

- create Redux/Zustand/another global store
- create another Scene Graph
- mutate state directly from Canvas
- bypass Command Bus
- add Timeline
- add playback
- add keyframes
- add effects
- add AI
- add 3D
- add WebGPU
- add backend
- add Supabase
- add authentication
- add billing
- add collaboration
- add cloud rendering

Do not optimize O(n²) traversal yet unless required for correctness.

==================================================
13. UI SCOPE
==================================================

Keep the existing Tier 2.1 shell.

Do not redesign the whole editor.

Add only the interaction UI required for:

- selection
- bounding box
- resize handles
- rotation handle
- transform feedback
- editable transform inspector

Keep visual design clean and professional.

==================================================
14. TESTING
==================================================

Add deterministic unit/browser tests for:

1. selecting a layer
2. moving a layer
3. resizing a layer
4. rotating a layer
5. canceling a transform
6. no-op transform
7. one drag = one history entry
8. undo transform
9. redo transform
10. Inspector X/Y edit
11. Inspector scale edit
12. Inspector rotation edit
13. Inspector opacity edit
14. Canvas ↔ Inspector synchronization
15. nested transformed parent/child
16. pointer cancellation
17. pointer capture
18. high-DPI behavior
19. invalid interaction coordinates
20. existing Tier 1/1.1/2.1 regression suite

Do not merely test internal implementation details.

Prefer behavior-level tests.

==================================================
15. DOCUMENTATION
==================================================

Update:

- ARCHITECTURE.md
- DEVELOPMENT_PLAN.md
- CHANGELOG.md
- README.md if required

Document:

- interactive Canvas architecture
- transient interaction state
- command commit boundary
- transform interaction semantics
- history grouping
- Inspector command flow

==================================================
16. VALIDATION
==================================================

Run:

npm run format
npm run typecheck
npm test
npm run build
npm run check

Review the complete final diff.

Report:

- exact files changed
- interaction architecture
- command flow
- transform semantics
- history behavior
- Inspector behavior
- tests added
- total tests passing
- build result
- check result
- remaining limitations
- architectural concerns

IMPORTANT:

Do NOT start Tier 2.3 automatically.

Stop after Tier 2.2 and wait for architectural review.
```

### 06 — Tier 2.2.1 professional transform interaction

Source attachment: 930eaa00-1ea6-41bb-870a-9a75e8b22283/pasted-text.txt (verbatim).

```text
PHASE 1 — COMPLETE MANUAL EDITOR
TIER 2.2.1 — PROFESSIONAL TRANSFORM INTERACTION CORRECTION

IMPORTANT:

Tier 2.2 architecture is approved, but user testing exposed a UX/interaction
correctness gap.

DO NOT start Tier 2.3.

DO NOT redesign the Command Bus, Scene Graph, History, or persistence architecture.

The existing architecture remains valid.

This task corrects the professional transform interaction model before Timeline
implementation begins.

==================================================
PRIMARY GOAL
==================================================

Upgrade the current generic transform interaction into a professional,
element-aware selection and transform system.

The interaction must support:

- center-pivot rotation
- visible rotation handle
- proper corner transform handles
- edge handles
- text-specific width controls
- type-aware interaction capabilities
- correct rotated bounding boxes
- correct nested-transform behavior
- correct command/history behavior

The system must remain based on:

Pointer
 ↓
Interaction Resolver
 ↓
Semantic Command
 ↓
Command Bus
 ↓
Canonical Scene Graph
 ↓
History
 ↓
Renderer

Canvas must never directly mutate canonical state.

==================================================
1. DO NOT COPY CANVA'S INTERNAL IMPLEMENTATION
==================================================

Use Canva as a UX/behavioral reference only.

Do not reproduce proprietary code or implementation details.

Implement our own architecture.

==================================================
2. UNIVERSAL SELECTION OVERLAY
==================================================

Create a reusable selection overlay model.

It must derive from canonical geometry.

Conceptually:

SelectionOverlay
 ├── bounds
 ├── corners
 ├── edge handles
 ├── rotation stem
 ├── rotation handle
 └── type-specific handles

The overlay must be generated from canonical layer geometry.

Do not create duplicate transform state.

==================================================
3. ROTATION HANDLE
==================================================

Every rotatable element must display a dedicated rotation handle.

The handle must:

- appear outside the selection bounds
- be visually separated by a connector/stem
- remain correctly positioned after rotation
- remain correctly positioned after scale
- work for nested transformed layers
- work at high DPI
- remain clickable without interfering with corner handles

Rotation must be around the VISUAL CENTER of the selected element.

IMPORTANT:

The existing local coordinate origin may remain (0,0).

Do NOT confuse:

local geometry origin

with:

interaction rotation pivot.

The interaction pivot should be the center of the visual selection bounds.

==================================================
4. CENTER-PIVOT ROTATION
==================================================

Implement rotation around:

center = visual selection bounds center

Do NOT rotate around the top-left local origin.

When changing rotation around the center pivot, compensate position as necessary so the
visual center remains fixed.

Example:

Before:
center = C
rotation = R

After:
center = C
rotation = R + delta

The layer's canonical position and rotation may both need to change.

Commit the final values through the existing semantic command system.

==================================================
5. ROTATED BOUNDING BOX
==================================================

The selection bounds must be derived correctly from the transformed geometry.

For rotated elements:

- border rotates with element
- handles rotate with element
- center pivot remains at visual center
- rotation handle remains aligned with the rotated top side

Do not use an axis-aligned screen rectangle as the visual transform box.

==================================================
6. CORNER HANDLES
==================================================

Provide four corner handles:

- top-left
- top-right
- bottom-left
- bottom-right

Dragging a corner must resize the element relative to the opposite corner.

The opposite corner must remain fixed in world/composition space.

The interaction must work correctly for:

- rotation
- non-uniform scale
- negative scale
- nested transformed parents

Use existing transform/math helpers.

Do not duplicate affine transform mathematics inside React/UI components.

==================================================
7. EDGE HANDLES
==================================================

Provide four edge handles:

- top-center
- right-center
- bottom-center
- left-center

For generic shape/image/video elements:

edge handles modify the corresponding dimension.

For example:

left/right → width
top/bottom → height

The opposite edge remains fixed.

For rotated elements, edge movement must be resolved in the element's local axes.

==================================================
8. TEXT-SPECIFIC HANDLES
==================================================

Text requires special interaction behavior.

Do NOT treat text as only a generic rectangle.

Text selection must provide dedicated left/right middle handles for text-box width.

Dragging these handles should:

- modify text box width
- preserve font size
- preserve text scale
- reflow/wrap text
- update resulting text-box height as required by layout
- preserve the appropriate anchor behavior
- use canonical Scene Graph properties
- commit through Command Bus

Do NOT implement text width handles as generic X/Y scaling.

The text layout system must remain editable.

==================================================
9. TEXT CORNER BEHAVIOR
==================================================

Define and document the behavior of corner handles for text.

The implementation must distinguish:

Text box width editing

from:

Whole-object transform scaling.

Do not allow an ambiguous gesture to silently choose between the two.

Use a clear interaction contract.

==================================================
10. MOVE
==================================================

Preserve existing correct move behavior.

Movement must continue to use parent inverse transforms.

Do not regress nested transformed movement.

One completed drag = one history operation.

Cancel = no history.

No-op = no history.

==================================================
11. ROTATION MATH
==================================================

Rotation must:

- use center pivot
- use parent-space/world-space conversion correctly
- preserve clockwise convention
- use shortest incremental arc
- handle crossing ±180 degrees
- avoid pointer-jump discontinuities
- support rapid pointer movement
- support pointer cancellation

Do not duplicate rotation math outside the transform/math boundary.

==================================================
12. TYPE-AWARE CAPABILITIES
==================================================

Create a capability model similar to:

TransformCapabilities

For example:

TEXT:
- move
- rotate
- cornerTransform
- textBoxWidthResize

SHAPE:
- move
- rotate
- cornerResize
- edgeResize

IMAGE:
- move
- rotate
- cornerResize
- edgeResize
- futureCrop

VIDEO:
- move
- rotate
- cornerResize
- edgeResize
- futureCrop

GROUP:
- move
- rotate
- resize

Do not implement future crop behavior yet.

The capability model should allow future plugins/types to add interaction capabilities.

==================================================
13. SELECTION HANDLE HIT TESTING
==================================================

Handle hit testing must have priority:

1. rotation handle
2. resize handles
3. text-specific handles
4. body
5. empty canvas

Handle hit areas should be larger than the visible graphics for usability.

Do not let handles become difficult to select at high DPI.

==================================================
14. HANDLE VISUALS
==================================================

Create a clean professional visual language.

Minimum:

- visible corner handles
- visible edge handles
- visible rotation handle
- rotation connector
- clear selected border
- clear hover feedback
- cursor changes

Do not over-design the editor.

Focus on interaction correctness.

==================================================
15. ASPECT RATIO
==================================================

Define the modifier contract.

At minimum:

- default corner resize behavior
- Shift modifier behavior

Document exactly whether Shift:

- preserves original aspect ratio
- toggles freeform/proportional behavior

The behavior must be deterministic.

Do not implement advanced constraints yet.

==================================================
16. ANCHOR / PIVOT MODEL
==================================================

DO NOT change the frozen local coordinate convention casually.

Instead document:

Local geometry origin:
(0,0)

Interaction pivot:
visual bounds center

These are separate concepts.

If the current transform contract needs an amendment,
create a versioned contract update rather than silently changing semantics.

==================================================
17. INSPECTOR
==================================================

Inspector continues to edit:

- X
- Y
- Scale X
- Scale Y
- Rotation
- Opacity

Inspector rotation must correspond to the same canonical rotation value used by Canvas.

Canvas rotation must update Inspector.

Inspector rotation must update Canvas.

No duplicate rotation state.

==================================================
18. GROUPS / NESTED TRANSFORMS
==================================================

Verify:

- transformed parent + child
- rotated parent + child
- scaled parent + child
- nested groups

The selection overlay must represent world-space visual geometry correctly.

Do not implement transformed-group ungrouping.

==================================================
19. HISTORY
==================================================

Required:

one move drag = one history entry
one resize drag = one history entry
one rotation drag = one history entry
one text-width drag = one history entry

Cancel = zero

No-op = zero

Undo restores exact previous state.

Redo restores exact final state.

==================================================
20. POINTER SAFETY
==================================================

Handle:

- pointer capture
- lost pointer capture
- pointercancel
- Escape
- window blur
- leaving canvas
- rapid movement
- invalid coordinates
- high DPI
- tiny viewport
- accidental text selection

==================================================
21. TESTING
==================================================

Add behavior-level tests for at least:

1. rotation handle exists
2. rotation handle is outside selection bounds
3. rotation around visual center
4. rotation across 180 degrees
5. rotated bounding box
6. corner resize
7. opposite corner remains fixed
8. edge resize
9. rotated edge resize
10. text left width handle
11. text right width handle
12. text width resize preserves font size
13. text width resize reflows text
14. text corner transform
15. move
16. nested transformed move
17. nested transformed resize
18. nested transformed rotation
19. Shift resize contract
20. one rotation = one history entry
21. one resize = one history entry
22. one text-width drag = one history entry
23. cancel = no history
24. no-op = no history
25. undo
26. redo
27. Canvas/Inspector synchronization
28. handle hit testing priority
29. pointer cancellation
30. high DPI
31. invalid coordinates
32. existing Tier 1/1.1/2.1/2.2 regression suite

Prefer behavior-level tests.

==================================================
22. DOCUMENTATION
==================================================

Update:

- ARCHITECTURE.md
- CHANGELOG.md
- DEVELOPMENT_PLAN.md
- README.md if needed

Add:

TRANSFORM_INTERACTION_CONTRACT.md

Document:

- selection geometry
- visual pivot
- local origin vs interaction pivot
- rotation behavior
- corner resize
- edge resize
- text width resize
- type-specific capabilities
- modifier behavior
- hit testing
- cancellation
- history grouping
- nested transforms

==================================================
23. VALIDATION
==================================================

Run:

npm run format
npm run typecheck
npm test
npm run build
npm run check

Review the complete diff.

Report:

- exact files changed
- transform architecture
- selection overlay architecture
- rotation pivot model
- resize model
- text interaction model
- type capability model
- nested transform behavior
- history behavior
- tests
- total passing
- build
- check
- schema version
- remaining limitations

IMPORTANT:

DO NOT START TIER 2.3.

STOP AFTER TIER 2.2.1.

WAIT FOR ARCHITECTURAL REVIEW.
```

### 07 — Tier 2.2.2 uniform corner scaling

Source: inline user request (transcribed; list formatting condensed).

```text
PHASE 1 — TIER 2.2.2
MICRO-FIX: UNIFORM CORNER SCALING
Tier 2.2.1 is already implemented and working. Do NOT redesign the transform system. Do NOT start Tier 2.3.

Observed bug: corner resize still allows independent X/Y scaling; text glyphs become stretched horizontally/vertically (scaleX=1.50, scaleY=1.10). This must no longer happen from a normal corner drag.

1. Normal corner dragging must use proportional/uniform scaling. For every corner resize: abs(scaleX change) == abs(scaleY change). Preserve the object's original aspect ratio. Original 1,1 resized 1.5x must result in 1.5,1.5. Do not allow independent X/Y scaling. Opposite corner stays fixed. Support rotated objects, nested transformed parents, negative/reflected scales, existing conventions.
2. Text corners preserve glyph proportions. Do not change font size, independently stretch X/Y, convert corner resize into text-box-width editing, or modify existing left/right text grips. Side grip → text-box width changes → text reflows → font size unchanged → object scale unchanged. Corner grip → uniform object scaling → glyph proportions preserved.
3. Do not redesign edge handles; keep one-axis edge resize; do not turn text side grips into generic scaling.
4. Do not modify rotation. Keep visible handle, center pivot, nested-transform behavior, rotation history.
5. Reuse transform helpers/interaction architecture. No other store; do not bypass bus. Committed changes: Interaction → Command Builder → Command Bus → Scene Graph → History. One gesture = one history entry; cancel/no-op = no history. Schema remains version 1.
6. Add only focused regressions: corner aspect ratio; text corner glyph/object ratio; repeated drags; rotated objects; nested transformed parents; reflected/negative scales; opposite corner fixed; text side-grip reflow; undo/redo for one resize gesture.

First run ONLY targeted transform/interaction tests. Then typecheck. If those pass, run full suite and production build ONCE. No broad architecture audit, unrelated refactoring/files, or documentation unless actual transform contract changed. Do not start Tier 2.3.
When targeted tests, typecheck, full tests, production build pass, STOP.
Report only files changed, tests added/passed, proportional corner confirmation, text side grips confirmation, rotation unchanged confirmation, Tier 2.3 not started confirmation.
```

### 08 — Tier 2.3 timeline foundation

Source attachment: 9041a2c8-6f5d-4356-a7c8-4fbb7ca29d21/pasted-text.txt (verbatim).

````text
# PHASE 1 — COMPLETE MANUAL EDITOR

# TIER 2.3 — TIMELINE FOUNDATION

## IMPORTANT

Tier 2.2.2 is APPROVED and FROZEN.

The following are already working and MUST NOT be redesigned:

* Scene Graph
* Command Bus
* History
* Persistence
* Transform system
* Selection overlay
* Move
* Uniform corner scaling
* Edge resize
* Text side grips / text reflow
* Center-pivot rotation
* Inspector transform editing
* Nested transform behavior

Do NOT revisit or redesign those systems.

Do NOT start Tier 2.4 or any feature outside this task.

---

# PRIMARY GOAL

Build the first REAL Timeline Foundation.

The Timeline must be a VIEW of the existing Scene Graph.

There must be NO second timeline data model.

Architecture:

```text
Scene Graph
     ↓
Timeline Projection
     ↓
Timeline UI
     ↓
User Interaction
     ↓
Command Builder
     ↓
Command Bus
     ↓
Scene Graph
     ↓
Canvas + Inspector + Timeline refresh
```

The Scene Graph remains the single source of truth.

---

# 1. TIMELINE SHELL

Replace the current static/placeholder timeline with a functional timeline containing:

* Timeline header
* Scene/composition strip
* Timeline ruler
* Time labels
* Playhead
* Track area
* Track headers
* Layer/clip rows
* Horizontal scrolling
* Timeline zoom
* Current-time indicator

Keep the existing application shell/layout.

Do not redesign unrelated UI.

---

# 2. SCENE / COMPOSITION MAPPING

The currently active composition must determine the timeline contents.

Each Scene Graph layer should have a corresponding timeline row.

Example:

```text
Scene Graph
 ├─ Background
 ├─ Title
 ├─ Image
 └─ Music

Timeline
 ├─ Background
 ├─ Title
 ├─ Image
 └─ Music
```

Do NOT create independent timeline copies of these objects.

Timeline rows must be derived from the canonical Scene Graph.

---

# 3. TIME MODEL

Use the existing composition:

```text
duration
fps
layer.startTime
layer.duration
```

as the canonical timing values.

Create shared conversion helpers for:

```text
time → pixel
pixel → time
time → frame
frame → time
```

Frame conversion must respect composition FPS.

Avoid duplicated conversion formulas across UI components.

---

# 4. PLAYHEAD

Implement a functional playhead.

Required behavior:

* visible playhead
* drag playhead
* click ruler to move playhead
* clamp playhead to composition duration
* update current time
* Canvas should reflect the current time where applicable
* Inspector/timeline current-time state must stay synchronized

Current time is editor/session state, NOT project content.

Moving the playhead must NOT create:

* Scene Graph mutation
* history entry
* autosave

---

# 5. TIMELINE ZOOM

Implement timeline horizontal zoom.

Requirements:

* zoom in
* zoom out
* reasonable min/max limits
* ruler updates correctly
* clips remain aligned with time
* playhead remains aligned
* scrolling remains usable

Zoom is UI/session state, not project data.

Do not introduce a second timing model.

---

# 6. CLIP / LAYER DISPLAY

Each layer should appear according to:

```text
startTime
duration
```

Example:

```text
0s                         10s
|--------------------------|

Background
████████████████████████████

Title
    ███████████

Image
          █████████████

Audio
████████████████
```

Clip position and width must be derived from canonical timing.

---

# 7. MOVE CLIP

Allow dragging a layer's timeline clip horizontally.

Required behavior:

```text
Timeline drag
↓
preview
↓
Command Builder
↓
Command Bus
↓
Scene Graph
↓
History
```

Do NOT directly mutate Scene Graph state during drag.

Use transient interaction state during preview if necessary.

On completion:

* one drag = one history entry
* cancelled drag = no history
* no-op drag = no history

Moving the clip changes:

```text
layer.startTime
```

and must preserve its duration.

---

# 8. TRIM CLIP

Implement basic clip trimming.

Required:

### Left trim

Dragging the left edge changes:

```text
startTime
duration
```

### Right trim

Dragging the right edge changes:

```text
duration
```

Required constraints:

* startTime cannot become negative
* duration cannot become zero/negative
* clip cannot extend beyond composition duration
* maintain valid timing
* one completed trim = one history entry
* cancel/no-op = no history

Do not implement ripple editing yet.

---

# 9. REORDER LAYERS

Allow timeline row reordering.

Reordering must update the canonical Scene Graph layer order.

Use the existing semantic command architecture.

Do NOT create a timeline-only ordering.

Canvas layer order and Timeline order must remain synchronized.

---

# 10. SELECTION SYNCHRONIZATION

Selection must be shared across:

```text
Canvas
Timeline
Library/scene list
Inspector
```

Selecting a timeline clip must select the same canonical layer used by Canvas and Inspector.

Selecting a layer on Canvas must highlight its corresponding timeline row.

Deselecting must synchronize everywhere.

Selection remains transient state and must not create history.

---

# 11. SNAP FOUNDATION

Implement basic timeline snapping.

Snap candidates should include:

* composition start
* composition end
* other clip starts
* other clip ends

Use a clear configurable snap threshold.

Snapping should affect interaction preview/command calculation only.

Do not mutate other clips automatically.

Do NOT implement advanced magnetic/ripple editing.

---

# 12. KEYBOARD BASICS

Implement only timeline-related basic shortcuts required for this tier:

* Delete selected layer/clip using existing delete command
* Arrow keys for small time movement where appropriate
* Shift + Arrow for larger time movement where appropriate
* Home → composition start
* End → composition end

Do not build a large shortcut system yet.

Reuse existing command architecture.

---

# 13. CONTEXT MENU

Add a minimal timeline context menu for currently supported actions only.

For example:

* Delete
* Duplicate if already supported by existing command architecture
* Select
* Split/trim ONLY if actually implemented in this tier

Do not add fake/placeholder actions.

Do not implement future functionality just to populate the menu.

---

# 14. INSPECTOR SYNCHRONIZATION

When a timeline clip is selected:

Inspector must show the canonical layer values.

When timing is changed through the timeline:

Inspector must refresh from canonical state.

Canvas, Timeline and Inspector must never maintain separate copies.

---

# 15. COMMAND / HISTORY RULE

All project mutations must continue through Command Bus.

Timeline must NOT directly modify:

```text
Scene Graph
Project
History
Persistence
```

Correct architecture:

```text
Timeline Interaction
       ↓
Command Builder
       ↓
Command Bus
       ↓
Validation
       ↓
Atomic Transaction
       ↓
Scene Graph
       ↓
History
       ↓
UI refresh
```

---

# 16. IMPORTANT: CURRENT TIME IS NOT PROJECT DATA

Do NOT add currentTime to the persisted project schema unless the existing architecture already explicitly requires it.

Current time is editor/session state.

Likewise:

* timeline zoom
* timeline scroll
* playhead position
* hover state

are transient UI/session state.

---

# 17. PERFORMANCE

Do not prematurely optimize the timeline with complex virtualization.

For this tier:

* derive rows cleanly
* avoid unnecessary full-project mutations
* avoid duplicate state
* keep rendering architecture modular

Document obvious future optimization points if needed.

---

# 18. TESTS

Add focused behavior tests for:

1. timeline rows derive from Scene Graph
2. layer timing maps correctly to pixels
3. pixel-to-time conversion is correct
4. frame conversion respects FPS
5. playhead clamps to composition bounds
6. moving playhead creates no history
7. timeline zoom keeps time alignment
8. clip position derives from startTime
9. clip width derives from duration
10. moving a clip updates startTime through Command Bus
11. one clip drag creates one history entry
12. cancelled clip drag creates no history
13. no-op clip drag creates no history
14. left trim updates startTime and duration correctly
15. right trim updates duration correctly
16. invalid trim is rejected
17. clip cannot exceed composition bounds
18. timeline selection syncs with Canvas
19. Canvas selection syncs with Timeline
20. timeline reorder updates canonical layer order
21. snapping to clip start/end works
22. snapping does not mutate other clips
23. undo/redo works for clip move
24. undo/redo works for trim
25. inspector refreshes after timeline timing changes

Keep tests focused. Do not create broad duplicate tests.

---

# 19. DOCUMENTATION

Update only the relevant sections of:

* ARCHITECTURE.md
* CHANGELOG.md
* DEVELOPMENT_PLAN.md
* README.md

Document:

* Timeline is a Scene Graph projection
* timing source of truth
* time/pixel/frame conversion
* current-time/session-state distinction
* timeline command/history model

Do not rewrite unrelated documentation.

---

# 20. VALIDATION STRATEGY

During implementation:

1. Run targeted timeline tests first.
2. Fix failures.
3. Run typecheck.
4. Run targeted browser/manual checks.

Only after the implementation is stable:

5. Run the full test suite once.
6. Run production build once.
7. Review final diff.

Do NOT repeatedly run the complete suite after every small edit.

Do NOT perform a broad architecture audit.

Do NOT refactor unrelated code.

---

# 21. STRICT SCOPE BOUNDARY

DO NOT implement:

* audio waveform editing
* keyframe editor
* effects
* transitions
* playback engine
* AI
* WebGPU
* 3D
* tracking
* particles
* collaboration
* backend
* cloud rendering
* advanced ripple editing
* multicam
* advanced trimming modes
* advanced timeline virtualization

These belong to later tiers.

---

# STOP CONDITION

When:

* Timeline foundation works
* targeted tests pass
* typecheck passes
* browser checks pass
* full tests pass
* production build passes

STOP.

Do NOT start Tier 2.4.

Report:

1. files changed
2. tests added/passed
3. commands implemented
4. browser checks performed
5. any limitations
6. confirmation that Tier 2.4 was NOT started

````

### 09 — T3 responsive timeline/workspace

Source attachment: 7a9f3d3c-269f-48e4-ae9b-9f6f4fd44381/pasted-text.txt (verbatim).

```text
T3 — COMPLETE RESPONSIVE TIMELINE + EDITING WORKSPACE

ROLE:
You are implementing one major, scope-locked editor system.

The target UX reference is the supplied Clipchamp editor tour video.
Use the reference primarily for:
- responsiveness
- direct manipulation
- simplicity
- timeline interaction
- drag/drop behavior
- context menus
- panel behavior
- keyboard/mouse interaction
- Canvas ↔ Timeline coordination

IMPORTANT:
This is ONE MAJOR TIER.

Do NOT create T3.1/T3.2/T3.3.
Do NOT continue into T4.
Do NOT perform unrelated refactors.
Do NOT redesign already-working T1/T2 architecture.

==================================================
0. SPEED / TOKEN / REASONING RULE
==================================================

This task is intentionally being run with GPT-6 Astra Medium.

Optimize for efficient implementation.

DO NOT spend excessive time on:
- broad repository audits
- unrelated architecture analysis
- rewriting working systems
- speculative future architecture
- unnecessary abstraction
- exhaustive test generation for trivial UI details
- running the entire test suite repeatedly during development
- documentation unrelated to this tier

INSPECT ONLY THE RELEVANT EXISTING SYSTEMS:
- Scene Graph
- Command Bus
- History
- Selection
- Canvas
- Inspector
- Timeline Foundation
- serialization/schema
- relevant UI/session state
- existing tests

First spend a short amount of time understanding the existing implementation.

Then implement directly.

Use existing architecture wherever possible.

Targeted tests first.
Full suite/typecheck/build ONCE near the end.

If a small implementation choice is ambiguous, choose the simplest architecture-consistent solution rather than spending excessive reasoning time.

==================================================
1. PRIMARY GOAL
==================================================

Upgrade the existing Timeline Foundation into a COMPLETE, RESPONSIVE, BEGINNER-FRIENDLY professional editing workspace.

The result should feel comparable to the interaction quality of Clipchamp/Canva while preserving our deeper professional-editor architecture.

Target:

Clipchamp-level usability
+
Canva-level simplicity
+
professional extensible editor architecture.

The user should be able to directly manipulate the editor without unnecessary dialogs.

Core principle:

"If the user can see it, the user should be able to manipulate it directly whenever practical."

==================================================
2. EXISTING ARCHITECTURE MUST REMAIN
==================================================

The existing architecture is frozen and must be extended, not replaced.

Canonical state:

Scene Graph / Project State
        ↓
Canvas
Timeline
Inspector

The Scene Graph remains the SINGLE SOURCE OF TRUTH.

Timeline must NOT maintain a duplicate persistent representation of:
- layers
- timing
- selection
- properties
- hierarchy
- ordering

Transient UI state is allowed for:
- currentTime
- playback state
- timeline zoom
- timeline scroll
- timeline panel dimensions
- hover state
- active drag/trim gesture
- temporary snap guides
- marquee selection state

Persistent mutations MUST use:

Interaction
→ Command Builder
→ Command Bus
→ Validation
→ Transaction
→ Scene Graph
→ Derived UI
→ History

Never directly mutate canonical project state from UI components.

==================================================
3. RESPONSIVE EDITOR WORKSPACE
==================================================

Make the overall workspace responsive.

Conceptual structure:

EditorWorkspace
├── TopBar
├── LeftPanel / Library
├── CenterCanvasWorkspace
├── RightPanel / Inspector
└── TimelineWorkspace

Panels must adapt to available viewport space.

Support practical resizing/collapse behavior for:
- left panel
- right panel
- timeline height

When panels resize:
- Canvas viewport adapts
- Timeline adapts
- no coordinate drift
- no broken selection
- no broken rendering

Workspace layout state is transient.
It must NOT become project data or history.

Do not overbuild a full docking framework.
Implement only the responsive behavior needed for this editor.

==================================================
4. CANVAS RESPONSIVENESS
==================================================

DO NOT rebuild the existing Canvas transform system.

Reuse the existing:
- selection
- bounding box
- resize
- rotation
- transform commands
- nested transform behavior
- uniform corner scaling
- interaction system

Improve integration with the responsive workspace.

Canvas must adapt when:
- side panel changes width
- timeline changes height
- browser viewport changes
- canvas zoom changes

Canvas interaction remains direct:

click
drag
resize
rotate
multi-select
keyboard interaction

==================================================
5. SHARED SELECTION SYSTEM
==================================================

Canvas and Timeline must use ONE shared selection identity.

Example:

Timeline selects Video A
→ Canvas selects Video A
→ Inspector shows Video A

Canvas selects Text A
→ Timeline selects Text A
→ Inspector shows Text A

Do NOT create separate persistent TimelineSelection and CanvasSelection states.

Multi-selection should also be shared.

Support:
- click
- Shift/Ctrl modifier where appropriate
- marquee selection where practical
- multiple selected layers
- move multiple selected layers/clips
- delete multiple selection
- duplicate multiple selection

Important:

Multi-select ≠ persistent Group.

Do not introduce a new Group architecture here.

==================================================
6. TIMELINE UI
==================================================

Build a real timeline workspace.

Structure:

Timeline
├── Toolbar
├── Time Ruler
├── Track Headers
├── Timeline Content
├── Clips
├── Playhead
├── Markers
└── Scrollbars

Timeline must visually communicate:
- time
- clips
- duration
- track/layer
- selected state
- playhead
- markers

It must not look like a debug table.

==================================================
7. TIME RULER
==================================================

Implement:
- adaptive time divisions
- readable labels
- ruler aligned with clips
- click-to-seek
- drag-to-seek
- zoom-aware divisions

Ruler must remain aligned during horizontal scrolling.

Avoid excessive labels at low zoom.

==================================================
8. PLAYHEAD / CURRENT TIME
==================================================

Implement a real playhead.

Requirements:
- visible vertical indicator
- drag to seek
- click ruler to seek
- Canvas updates
- Inspector timing remains synchronized
- snapping where appropriate

Seeking must NOT create history entries.

currentTime is editor/session state, not project mutation.

Never allow currentTime to exceed composition duration.

==================================================
9. PLAYBACK
==================================================

Implement basic playback:

- Play
- Pause
- Stop/reset
- currentTime progression
- end-of-composition stop
- Canvas synchronization
- Timeline playhead synchronization

Use elapsed-time based playback.

Respect composition FPS and duration.

Do not implement advanced audio mixing here.

Do not build a separate playback scene graph.

==================================================
10. TRACKS
==================================================

Timeline rows derive from canonical layers.

Each row should show:
- layer name
- layer type
- clip area
- selected state
- ordering

Track labels and clip rows must remain vertically aligned during scrolling.

Track ordering must correspond to existing Scene Graph/layer ordering semantics.

==================================================
11. CLIPS
==================================================

Each timeline-visible layer gets a visual clip block representing:

startTime → startTime + duration

Clip interaction:

- select
- drag
- trim
- split
- duplicate
- delete
- multi-select
- reorder
- snap

Different layer types may have different visual indicators, but do not overbuild custom clip UIs in this tier.

==================================================
12. DRAG CLIP
==================================================

Dragging a clip changes its timing.

Requirements:
- preserve duration
- update startTime
- correct coordinate conversion at all zoom levels
- snapping
- Canvas synchronization
- Inspector synchronization
- one completed gesture = ONE history entry
- cancel = no history
- no-op = no history

Use existing SET_LAYER_TIMING or equivalent semantic command.

Do not mutate state on every pointermove.

Transient preview during drag is allowed.

Commit on gesture completion.

==================================================
13. TRIM
==================================================

Support both edges.

Left trim:
- startTime changes
- endTime remains fixed

Right trim:
- startTime remains fixed
- endTime changes

Requirements:
- minimum valid duration
- composition boundary validation
- snapping
- undo/redo
- one gesture = one history entry
- pointer cancel safe

No negative/zero invalid timing.

==================================================
14. SPLIT
==================================================

Split selected clip/layer at currentTime.

Valid only when:

startTime < currentTime < endTime

The operation must:
- be atomic
- use Command Bus
- be undoable
- be redoable
- preserve editability
- preserve source asset references where appropriate
- avoid destructive media processing

Reuse existing architecture.

Do not invent a separate media-processing subsystem.

If the current model cannot perform a particular source-media split without a new subsystem, implement the safest project-level editable split supported by the existing model and document that limitation.

==================================================
15. DUPLICATE
==================================================

Implement duplicate.

Requirements:
- new IDs
- editable properties preserved
- timing preserved unless existing UX requires offset
- valid hierarchy
- selection moves to duplicated object
- undo/redo

Use existing semantic commands where possible.

==================================================
16. DELETE
==================================================

Delete selected timeline items using existing commands.

After deletion:
- Timeline updates
- Canvas updates
- Inspector updates
- selection remains valid
- undo/redo works

No direct array mutation from UI.

==================================================
17. MULTI-SELECTION
==================================================

Support practical multi-selection.

Selected clips can:
- move together
- delete together
- duplicate together

Where a common operation is not valid, fail safely instead of silently changing unrelated data.

One user action should produce one logical history operation where possible.

Do not build persistent groups in this tier.

==================================================
18. TRACK REORDER
==================================================

Allow practical drag reorder of timeline rows.

Requirements:
- canonical layer ordering changes
- Canvas ordering changes
- Timeline ordering changes
- undo/redo
- one action = one history entry

Respect existing hierarchy rules.

Do not create a second z-order system.

==================================================
19. SNAP
==================================================

Implement simple professional snapping.

Snap targets:
- composition start
- composition end
- clip start
- clip end
- playhead
- markers

Snap should be:
- zoom aware
- threshold based
- visually indicated temporarily

Snap guides are transient.

If there is already a snap toggle, reuse it.
Otherwise implement a simple usable default without building an elaborate settings system.

==================================================
20. TIMELINE ZOOM
==================================================

Implement:

- zoom in
- zoom out
- sensible default
- mouse interaction
- keyboard shortcut
- optional UI control if appropriate

Preferred behavior:

Zoom around cursor/focus point rather than always around time zero.

Zoom must affect:
- ruler
- clips
- playhead
- markers
- snap calculations

Zoom does NOT modify project state or history.

==================================================
21. TIMELINE SCROLL
==================================================

Implement:

Horizontal:
- long compositions
- horizontal scrollbar
- mouse wheel/trackpad where appropriate

Vertical:
- many tracks
- vertical scrolling

Track headers and clip content must stay aligned.

Scrolling is transient and must not create history.

==================================================
22. KEYBOARD INTERACTION
==================================================

Implement practical shortcuts.

At minimum:

Space:
- Play/Pause

Delete / Backspace:
- Delete selection

Arrow keys:
- small timeline navigation when appropriate

Modifier + Arrow:
- larger navigation where appropriate

Split:
- use an appropriate existing/common shortcut

Duplicate:
- use an appropriate existing/common shortcut

Zoom:
- appropriate +/− or modifier shortcut

Do not break existing Canvas shortcuts.

Keyboard project mutations must use Command Bus.

==================================================
23. CONTEXT MENUS
==================================================

Implement a context-menu resolver.

Right click must be context aware.

Conceptually:

Right click
↓
What is target?
↓
Video clip / Audio / Text / Shape / Multiple selection / Track / Marker / Empty timeline
↓
Available capabilities
↓
Context menu

Examples:

VIDEO CLIP:
- Cut
- Copy
- Duplicate
- Split
- Delete
- relevant existing actions

TEXT:
- Copy
- Duplicate
- Delete
- Group where supported
- relevant text actions

MULTI-SELECTION:
- Copy
- Duplicate
- Delete
- Group if existing group command is supported

EMPTY TIMELINE:
- Add Marker
- Paste where valid

Do NOT build dozens of specialized commands.
Only expose actions already supported by the editor.

==================================================
24. MARKERS
==================================================

Implement basic persistent markers.

Support:
- add
- delete
- position
- optional label
- display
- undo/redo
- serialization

Use semantic commands.

Suggested:
ADD_MARKER
UPDATE_MARKER
DELETE_MARKER

Markers are project data.

==================================================
25. BASIC KEYFRAME FOUNDATION
==================================================

Only implement the foundation.

Support:
- existing animated Property/Keyframe model
- add keyframe at currentTime
- remove keyframe
- basic timeline keyframe indicator
- undo/redo

Do NOT build:
- graph editor
- expression editor
- advanced curve editor
- advanced easing editor

Those belong to later systems.

==================================================
26. TIME-BASED CANVAS VISIBILITY
==================================================

Canvas rendering must respect:

currentTime
layer.startTime
layer.duration

A layer outside its active time range should not render as active.

Maintain existing Canvas behavior when no timeline timing is involved.

Define boundary behavior consistently.

==================================================
27. INSPECTOR SYNC
==================================================

Timeline selection:
→ Inspector updates.

Inspector timing change:
→ Timeline updates.

Timeline timing change:
→ Inspector updates.

Undo/redo:
→ all update.

No duplicate state.

==================================================
28. RESPONSIVE SIDE PANELS
==================================================

Preserve the existing left/right panel architecture.

Make panels practically responsive:
- resize where appropriate
- collapse where appropriate
- content scroll
- Canvas responds to available area

Do not implement a complex docking system.

The objective is usability, not architectural overkill.

==================================================
29. DRAG/DROP UX
==================================================

Support practical direct drag/drop where the existing editor model allows it.

Examples:
- library asset → timeline
- library asset → canvas
- timeline clip reorder
- timeline clip movement

When dropping an asset:
- create through Command Bus
- assign valid identity
- preserve editability
- update Canvas/Timeline/Inspector

If an asset drop path is not yet supported by the current Library implementation, do not build a complete asset-management subsystem just for this tier. Implement only the integration needed by existing capabilities.

==================================================
30. POINTER SAFETY
==================================================

Handle:

pointerdown
pointermove
pointerup
pointercancel

Avoid:
- stuck drag
- accidental commit
- duplicate commit
- duplicate history
- coordinate drift

One gesture = one logical command/history entry.

==================================================
31. RESPONSIVENESS / PERFORMANCE
==================================================

Keep interactions responsive.

During drag:
- use transient state
- avoid unnecessary full-project cloning
- avoid history writes
- avoid persistence writes

Commit once at the end.

Do not introduce unnecessary React state duplication.

Do not optimize prematurely with complex virtualization unless the existing implementation actually needs it.

Simple correct implementation first.

==================================================
32. TESTING — EFFICIENT MODE
==================================================

Do NOT generate a huge test suite.

Add focused regression tests for important behavior.

Cover at minimum:

1. timeline projection
2. time ↔ pixel conversion
3. playhead seek
4. playback boundary
5. clip move
6. left trim
7. right trim
8. split
9. duplicate
10. delete
11. reorder
12. snap
13. zoom
14. markers
15. keyframe add/remove
16. shared selection
17. inspector synchronization
18. Canvas time visibility
19. undo/redo
20. pointer cancellation
21. no duplicate history
22. keyboard actions
23. context-menu action resolution

Do not add tests for every pixel/style detail.

Prefer behavioral tests.

==================================================
33. TEST EXECUTION STRATEGY
==================================================

During development:

Run targeted tests only for the area currently being changed.

DO NOT repeatedly run:
- full test suite
- full build
- full architecture audit

after every small change.

At the end run:

1. formatter
2. typecheck
3. full test suite
4. production build

If a failure occurs:
- diagnose
- fix
- rerun the relevant targeted test
- rerun full validation once necessary

Do not mark complete with failing checks.

==================================================
34. BROWSER VERIFICATION
==================================================

If browser/dev harness exists, perform a concise manual verification of:

1. responsive workspace
2. left/right panel resizing/collapse
3. Canvas adapts
4. Timeline renders
5. ruler alignment
6. playhead
7. seek
8. playback
9. clip drag
10. left trim
11. right trim
12. split
13. duplicate
14. delete
15. multi-select
16. reorder
17. snap
18. zoom
19. horizontal scroll
20. vertical scroll
21. markers
22. keyboard shortcuts
23. context menus
24. Canvas ↔ Timeline selection
25. Timeline ↔ Inspector sync
26. timing ↔ Canvas visibility
27. undo/redo

Keep manual verification concise.

==================================================
35. EXPLICITLY OUT OF SCOPE
==================================================

DO NOT implement:

- AI
- AI Director
- AI generation
- multi-model generation
- advanced audio mixer
- waveform editor
- ripple editing
- slip/slide editing
- multicam
- advanced keyframe graph
- expressions
- tracking
- particles
- advanced compositing
- WebGPU
- 3D
- advanced color
- collaboration
- cloud backend
- plugin marketplace
- complete asset-management redesign
- complete docking framework

Do not start T4.

==================================================
36. DO NOT BREAK EXISTING FEATURES
==================================================

Before changing an existing component, understand its current contract.

Preserve:
- T1 core architecture
- T1.1 transform contract
- T2 Canvas
- T2.2 transform interaction
- T2.2.1 rotation/handles
- T2.2.2 uniform corner scaling
- existing selection behavior
- existing Command Bus
- existing History
- existing serialization
- existing persistence

Extend them only where required for T3.

==================================================
37. DEFINITION OF DONE
==================================================

T3 is complete when the editor provides a cohesive responsive timeline workspace with:

[ ] Responsive editor workspace
[ ] Responsive left/right panels
[ ] Responsive Canvas
[ ] Real Timeline
[ ] Time ruler
[ ] Playhead
[ ] Seeking
[ ] Playback
[ ] Tracks
[ ] Clips
[ ] Clip selection
[ ] Multi-selection
[ ] Clip movement
[ ] Left trim
[ ] Right trim
[ ] Split
[ ] Duplicate
[ ] Delete
[ ] Track reorder
[ ] Snapping
[ ] Timeline zoom
[ ] Horizontal scrolling
[ ] Vertical scrolling
[ ] Markers
[ ] Basic keyframes
[ ] Keyboard interaction
[ ] Context-sensitive right-click menus
[ ] Canvas ↔ Timeline synchronization
[ ] Timeline ↔ Inspector synchronization
[ ] Timeline timing affects Canvas visibility
[ ] Playback affects Canvas
[ ] Undo/redo
[ ] Persistence
[ ] Schema migration if actually required
[ ] No duplicate canonical state
[ ] Command Bus for persistent mutations
[ ] Atomic history
[ ] Pointer cancellation safety
[ ] Focused tests pass
[ ] Typecheck passes
[ ] Full test suite passes
[ ] Production build passes
[ ] Browser verification passes where available

==================================================
38. FINAL REPORT — KEEP IT CONCISE
==================================================

At the end report only:

1. What was implemented.
2. Files changed.
3. Important architecture changes.
4. Tests added.
5. Targeted test result.
6. Full test result.
7. Typecheck result.
8. Build result.
9. Browser verification result.
10. Known limitations.

Do not write a huge architectural essay.

Do not create another tier.

Do not continue into T4.

STOP after T3 is implemented and validated.
```

### 10 — T3 quick completion pass

Source attachment: b8432b49-94c4-43b6-af86-c9c21153f07f/pasted-text.txt (verbatim).

```text
T3 QUICK COMPLETION PASS — STRICT 10-MINUTE-SCOPE TASK

IMPORTANT:
This is a SMALL targeted correction pass on the existing T3 implementation.

DO NOT rebuild T3.
DO NOT redesign the Timeline architecture.
DO NOT perform a broad repository audit.
DO NOT refactor unrelated code.
DO NOT create T3.1/T3.2.
DO NOT start T4.

The current T3 implementation already works and passes:
- full tests
- typecheck
- build

We only need to fix the four high-impact UX issues below.

==================================================
1. INSPECTION LIMIT
==================================================

Inspect ONLY the files directly responsible for:

- Timeline layout
- Timeline scrolling
- Timeline ruler
- Timeline playhead
- Timeline clip drag/reorder
- Timeline transport/playback UI
- composition duration/timeline width calculation

Likely relevant files include the existing Timeline/UI/session/model files.

Do NOT inspect the entire repository unless required by a compile error.

Do NOT redesign existing Scene Graph / Command Bus / History.

==================================================
2. FIX #1 — RULER MUST NOT VERTICALLY SCROLL AWAY
==================================================

Current problem:

When the user vertically scrolls timeline rows, the time ruler/timeline ticker also moves away.

Required behavior:

TIMELINE HEADER / TRANSPORT
────────────────────────────

TIME RULER
────────────────────────────
Track 1   [Clip]
Track 2   [Clip]
Track 3   [Clip]
Track 4   [Clip]
        ↓ vertical scroll

The ruler must remain visible/fixed while track rows scroll vertically.

Horizontal timeline scrolling must still keep ruler time positions aligned with clips.

Do NOT build a complex docking system.

Use the simplest DOM/CSS/layout correction compatible with the existing implementation.

==================================================
3. FIX #2 — REMOVE THE 10-SECOND HARD LIMIT
==================================================

Current problem:

Timeline visually stops at approximately 10 seconds because the composition currently has a 10-second duration.

Do NOT simply hard-code 60 seconds or another arbitrary duration.

Fix the Timeline viewport/content behavior so that the timeline is not artificially capped at 10 seconds.

Required:

- timeline can represent compositions longer than 10 seconds
- horizontal scrolling can move beyond 10 seconds
- ruler continues generating time positions
- clips can be positioned beyond 10 seconds when valid
- zoom continues to work

Preserve the existing composition duration model.

Do NOT invent a new project-duration architecture.

If the current example composition itself is exactly 10 seconds, that is okay; the Timeline must still support a longer composition when its duration is changed.

Use the smallest architecture-consistent fix.

==================================================
4. FIX #3 — DIRECT X + Y CLIP DRAG
==================================================

Current problem:

A timeline clip can be dragged horizontally in time, but cannot be directly dragged vertically to another track.

Required behavior:

Dragging a clip must support:

ΔX → change startTime

ΔY → determine destination track/layer row

Example:

TRACK 1   [Clip A────────]

TRACK 2   [Clip B────────]

User drags Clip A downward:

TRACK 1
TRACK 2   [Clip A────────]

The destination row should be determined from pointer Y position.

Use the existing layer ordering/reorder/timing commands and existing Command Bus.

Do NOT create a new timeline state.

Do NOT redesign Scene Graph.

Do NOT implement sophisticated ripple editing.

Do NOT implement multi-clip cross-track editing in this task.

For a single selected clip:
- horizontal drag changes timing
- vertical drag changes layer/track ordering
- both can happen during the same gesture
- one completed gesture = one logical history entry
- cancel/no-op = no history

Use the simplest implementation that fits the existing command architecture.

If the existing architecture cannot safely move the clip vertically without a new command, add ONLY the minimal semantic command required.

==================================================
5. FIX #4 — IMPROVE PLAYBACK / TRANSPORT BAR
==================================================

Current transport bar feels too much like a row of generic buttons.

Make it cleaner and more professional while keeping implementation small.

Required:

- Play/Pause
- Stop/reset
- Split
- Duplicate
- Add Marker
- current time / duration
- zoom controls

Transport/header must remain fixed while timeline rows scroll vertically.

Do not redesign the entire editor UI.

Do not add advanced playback features.

Do not implement audio mixing.

==================================================
6. KEEP EXISTING FEATURES WORKING
==================================================

Do NOT break:

- Canvas selection
- Timeline selection
- Inspector synchronization
- existing clip horizontal movement
- trimming
- split
- duplicate
- markers
- playback
- zoom
- horizontal scroll
- vertical scroll
- undo/redo
- Command Bus
- Scene Graph
- History

==================================================
7. PERFORMANCE / REASONING LIMIT
==================================================

This is intentionally a fast correction task.

DO NOT:

- run a full architecture audit
- rewrite components
- create new abstractions unless necessary
- add large test suites
- add extensive documentation
- optimize unrelated code
- investigate unrelated warnings
- refactor old code for style

Make the smallest correct changes.

==================================================
8. TESTING — TARGETED ONLY
==================================================

Add or update ONLY a few focused regressions for:

1. ruler remains fixed during vertical scrolling
2. timeline supports >10 second composition
3. vertical clip drag changes destination track
4. transport remains fixed

Run targeted tests.

Then run:
- typecheck
- build

Only run the full test suite if the targeted changes could reasonably affect existing behavior.

If full suite is run, do it ONCE at the end.

==================================================
9. STOP CONDITION
==================================================

After these four fixes work:

STOP.

Do NOT continue improving the Timeline.

Do NOT implement:
- multiple clips per track
- ripple editing
- slip/slide
- advanced keyframes
- advanced context menus
- advanced multi-selection transforms
- NLE clip/source model redesign
- T4 features

Those will be handled separately.

==================================================
10. FINAL REPORT — VERY SHORT
==================================================

Report only:

- files changed
- four fixes completed
- tests
- typecheck
- build
- any blocker

No long architecture report.

STOP.
```

### 11 — Quick T3 UX fix: only two items

Source: inline user request (transcribed; list formatting condensed).

```text
QUICK T3 UX FIX — ONLY 2 ITEMS
Very small correction pass. Do NOT audit repository, redesign Timeline, change Scene Graph architecture, create Clip/Track architecture, refactor unrelated code, or start T4. Current T3 already passes tests, typecheck and build.

1. USER-FACING COMPOSITION DURATION
Current example is 10 seconds and Timeline visually ends at 10s. Prior code-only >10s test is not enough. Add smallest architecture-consistent user-facing duration editing: show current duration; allow change; validate positive duration; immediately update Timeline, ruler, playback end, End-key behavior; preserve Scene Graph/Command Bus/History; undoable mutation; no direct UI canonical mutation. No hard-coded 30/60/120 seconds or project-model redesign. Add only minimal semantic duration command if absent.

2. CLEAN UP TRANSPORT / PLAYBACK BAR
Improve only transport layout, grouped as [Playback controls] [Edit actions] [Composition/time] [Zoom]. Keep Play/Pause, Stop, Split, Duplicate, Add Marker, current time/duration, zoom out/label/in. Fixed transport while rows scroll. Improve spacing, grouping, alignment, hierarchy. No whole-editor redesign, advanced playback, or Playback-engine behavior changes.

3. PRESERVE T3 FIXES
Do not break sticky ruler, horizontal/vertical clip movement/reorder, trim, split, duplicate, markers, zoom, scrolling, selection sync, Inspector sync, undo/redo.

4. SPEED RULE
Keep small. Inspect only timeline.ts, relevant composition-duration command/model code, relevant timeline CSS, directly related tests. No entire-repo inspection, architecture audit, or unnecessary abstractions/large suite.

5. TESTING
Only focused regressions: changing duration updates Timeline; duration undoable; End seeks new duration; fixed transport during scroll. Run targeted tests then typecheck and build. Full suite only once at end if needed.

6. STOP
After these two work, STOP. No multiple clips per track, ripple, source offsets, advanced context menus/playback/keyframes, new NLE architecture, or T4.
Very short final report: files changed, tests, typecheck, build, blockers. STOP.
```

### 12 — Content-driven duration and transport correction

Source attachment: 03d53d00-9dec-4c23-8368-5e08973e0593/pasted-text.txt (verbatim).

```text
T3 CORRECTION — CONTENT-DRIVEN COMPOSITION DURATION + TRANSPORT UX

IMPORTANT:

This is a focused T3 correction pass.

Do NOT perform a repository-wide audit.
Do NOT redesign the editor.
Do NOT create a new Clip/Track architecture.
Do NOT start T4.
Do NOT refactor unrelated systems.

However, this correction MUST fix the composition-duration behavior
at the actual editor behavior level, not merely improve the existing
duration input UI.

The current implementation incorrectly treats composition duration as
a manually entered fixed value.

That is NOT the desired editor behavior.

==================================================
1. CORE REQUIREMENT — CONTENT-DRIVEN DURATION
==================================================

Composition duration must automatically represent the end of the latest
visible timeline content.

The user should NOT have to manually type a duration just to make the
Timeline longer.

Example:

Layer A: 0s -> 5s
Layer B: 0s -> 8s
Layer C: 3s -> 12s
Layer D: 10s -> 17s

Composition duration must automatically become:

17 seconds.

The latest ending timeline content determines the composition end.

==================================================
2. AUTOMATIC UPDATE AFTER TIMELINE EDITING
==================================================

This must remain true after ALL relevant timeline operations.

If the user:

- drags a layer later
- extends a layer
- trims the right edge
- trims the left edge
- splits a layer
- duplicates a layer
- deletes the last-ending layer
- reorders layers
- changes an interval/duration

the composition duration must automatically recalculate from the
latest ending content.

Examples:

If the current last layer ends at 17s and the user extends it to 20s:

Composition duration -> 20s.

If the user trims it back to 14s and another layer ends at 17s:

Composition duration -> 17s.

If the current last-ending layer is deleted and the next latest layer
ends at 12s:

Composition duration -> 12s.

Do not leave stale duration values.

==================================================
3. EMPTY / NO-CONTENT CASE
==================================================

Define a safe minimum duration behavior for an empty composition.

Do not allow:

- negative duration
- NaN
- Infinity
- invalid playback bounds

Use the existing project conventions where possible.

Do not invent a large new duration-management architecture.

==================================================
4. SINGLE SOURCE OF TRUTH
==================================================

The Scene Graph remains the canonical source of composition/layer state.

Do NOT create a separate Timeline-only duration state.

Duration recalculation must be architecture-consistent.

Canonical mutations must continue through the existing Command Bus /
History architecture.

Do not directly mutate canonical Scene Graph state from the UI.

If the existing SET_COMPOSITION_DURATION command is useful,
reuse it appropriately.

Do NOT create unnecessary commands or abstractions.

==================================================
5. IMPORTANT — AVOID COMMAND LOOPS
==================================================

Be careful not to create an infinite feedback loop such as:

timeline edit
-> duration command
-> timeline refresh
-> duration command
-> timeline refresh
-> ...

Duration synchronization must settle to one deterministic value.

==================================================
6. TIMELINE END
==================================================

The visual Timeline must automatically extend to contain the latest
timeline content.

The ruler must extend accordingly.

Do NOT rely on a manually entered value such as:

10s
30s
60s
120s

as the normal way to determine the working timeline duration.

There must be no artificial empty timeline tail after the latest content
unless existing editor behavior explicitly requires a small visual
workspace margin.

The content end is the actual composition end.

==================================================
7. PLAYBACK END
==================================================

Playback must use the automatically calculated composition duration.

When playing:

0s
-> timeline content
-> latest content end
-> STOP

The playhead must never continue into an empty area beyond the actual
composition content.

Seeking to the end must seek to the calculated latest content end.

The End keyboard behavior must use the same calculated duration.

Current time / total duration display must remain synchronized.

==================================================
8. RENDER / EXPORT BOUNDARY
==================================================

This is critical.

The render/export duration must use the same canonical composition
duration.

Rendering must cover:

first composition frame
through
the actual last content frame.

It must NOT render an arbitrary manually entered duration when that
duration is longer than the actual content.

Do not implement a new renderer architecture.

Only make sure the existing render/export path consumes the correct
canonical composition duration.

If the current renderer/exporter already uses composition.duration,
ensure the automatically calculated duration is what reaches it.

==================================================
9. DURATION UI
==================================================

The current Duration input is not the desired primary workflow.

Do NOT simply improve the existing numeric input and call this complete.

The Timeline should communicate that duration is automatically derived
from content.

If a duration display/control remains useful, make it clearly represent
the calculated composition duration.

Do not force the user to manually type the duration for normal editing.

Do not introduce a complex duration mode system unless the existing
architecture already has one.

==================================================
10. TIMELINE INTERACTION
==================================================

The following operations must automatically update the composition end:

- right-edge trim
- left-edge trim when it changes final end position
- direct layer drag
- duplicate
- split
- delete
- any existing operation that changes startTime/duration

Existing behavior must remain intact:

- sticky ruler
- horizontal movement
- vertical movement/reorder
- trim
- split
- duplicate
- markers
- zoom
- scrolling
- selection sync
- Inspector sync
- undo/redo

Do not break existing T3 functionality.

==================================================
11. UNDO / REDO
==================================================

Timeline editing must remain undoable.

Undoing an edit that changed the latest content endpoint must also restore
the correct previous composition duration.

Redo must restore the correct new duration.

Do not create duplicate history entries unnecessarily for a single
user action.

==================================================
12. TRANSPORT UX
==================================================

Also complete the existing T3 transport cleanup.

Playback/transport must remain directly ABOVE the Timeline.

Do NOT move it to the top application toolbar.

Target grouping:

[ Playback controls ] [ Edit actions ] [ Composition / Time ] [ Zoom ]

Keep:

- Play/Pause
- Stop
- Split
- Duplicate
- Add Marker
- current time
- calculated composition duration
- zoom out
- zoom value
- zoom in

Improve:

- spacing
- grouping
- alignment
- hierarchy
- readability

Transport must remain fixed while timeline rows vertically scroll.

Do NOT change the playback engine unnecessarily.

==================================================
13. PERFORMANCE
==================================================

Do not recalculate duration excessively on every render.

Duration recalculation should happen at the appropriate canonical
timeline mutation/update boundary.

Avoid:

- render loops
- excessive React/UI updates
- pointermove performance regressions
- playback loops
- duplicate state
- stale listeners

==================================================
14. ARCHITECTURE BOUNDARY
==================================================

Do NOT implement:

- multiple clips per track
- ripple editing
- source-media offsets
- speed editing
- advanced transitions
- advanced audio editing
- advanced keyframes
- new NLE Clip/Track architecture
- T4 Graphics/Text/Animation
- T5 compositing/audio
- T6 GPU/3D/tracking
- AI features

Those are future milestones.

This task is specifically about making T3 composition duration behave
like a real content-driven editor.

==================================================
15. TESTING
==================================================

Add focused regression tests for:

1. composition duration derives from latest layer end
2. extending the latest layer extends composition duration
3. trimming the latest layer recalculates duration
4. deleting the latest layer recalculates duration
5. moving a layer later recalculates duration
6. duplicate/split operations maintain correct duration
7. undo restores previous duration
8. redo restores new duration
9. playback stops at calculated composition end
10. End seeks to calculated composition end
11. timeline ruler reflects calculated end
12. render/export receives the calculated composition duration
13. transport remains fixed while timeline rows scroll

Do not create a huge unrelated test suite.

Run targeted tests.

Then run:

- typecheck
- build
- full suite once if practical

If a test cannot run because of an environment/dependency issue,
report that separately from actual code failures.

==================================================
16. FINAL VALIDATION
==================================================

Before stopping, verify this exact user workflow conceptually:

1. Open a composition.
2. Existing layers determine the initial composition duration.
3. Drag the last-ending layer further right.
4. Timeline automatically extends.
5. Duration automatically increases.
6. Playhead can seek to the new end.
7. Playback stops at that new end.
8. Trim/delete that last-ending layer.
9. Duration automatically shrinks to the next latest layer end.
10. Undo restores the previous duration.
11. Redo restores the new duration.
12. Render/export uses the same final composition duration.

If this workflow does not work correctly, continue fixing it.

Do NOT declare success merely because the Duration input works.

==================================================
17. SCOPE / STOP
==================================================

After this behavior is correctly implemented and tested:

STOP.

Do not continue into T4.

Do not redesign unrelated editor systems.

Final report must be short:

- files changed
- implementation summary
- tests
- typecheck
- build
- blockers, if any

STOP.
```

### 13 — Additional time/scope constraint

Source: inline user request (transcribed; list formatting condensed).

```text
TIME/SCOPE CONSTRAINT:
Keep this correction tightly scoped.
Prefer the smallest architecture-consistent implementation.
Do not spend time on broad repository exploration, unrelated refactoring, or speculative improvements.
Target a focused implementation and verification pass, ideally within approximately 8–10 minutes if the existing architecture allows it.
```

### 14 — T3 complete milestone (pre-NLE scope)

Source attachment: 913694f1-9282-4321-a168-988ddadb2fc2/pasted-text.txt (verbatim).

```text
T3 COMPLETE MILESTONE — TIMELINE + PLAYBACK + EDITING UX
==========================================================

ROLE
You are completing the existing T3 Timeline System milestone of the
AI-Native browser-first professional video editor.

This is NOT a small correction task.

T3 must be completed end-to-end using the EXISTING architecture.
Do not restart, rewrite, or redesign the project architecture.

AUTHORITATIVE ARCHITECTURE
- Scene Graph is the canonical single source of truth.
- Never bypass Command Bus for canonical mutations.
- User mutations must be undoable.
- Use semantic commands and atomic transactions.
- No duplicate canonical state.
- Preserve the existing transform contract.
- Preserve T1 and frozen T2 behavior.
- AI later must use this same command system.
- Extend existing architecture; do not unnecessarily rewrite it.

ROADMAP BOUNDARY
T1 = complete/frozen.
T2 = complete/frozen.
THIS TASK = COMPLETE T3.
Do NOT start T4, T5, T6, or AI milestones.

IMPORTANT:
The latest correction already implemented content-driven composition duration.
DO NOT regress or replace that behavior.

==========================================================
T3 GOAL
==========================================================

Make the Timeline + Playback system feel like a real,
responsive, beginner-friendly professional editor.

UX benchmark:
- Clipchamp-like ease/responsiveness
- Canva-like direct manipulation
- Professional editing capability underneath

Do NOT copy proprietary implementation.
Use the benchmark only for behavior and usability.

The final T3 must be usable from an END-USER perspective,
not merely architecturally present.

==========================================================
1. TIMELINE CORE
==========================================================

Verify and complete:

- timeline rendering
- time ruler
- playhead
- seeking
- horizontal scrolling
- vertical layer scrolling
- sticky/fixed ruler behavior
- timeline zoom
- zoom in/out controls
- useful zoom behavior around the current viewport/playhead
- responsive timeline resizing
- correct time-to-pixel mapping
- no arbitrary hard-coded timeline endpoint
- timeline width derived from canonical composition/content duration
- smooth interaction while scrolling/zooming

Preserve existing working behavior.

==========================================================
2. CONTENT-DRIVEN COMPOSITION DURATION
==========================================================

The latest implementation derives composition duration from
the latest timeline content endpoint.

Treat this as CANONICAL.

Verify it remains correct for:

A: 0–5
B: 0–8
C: 3–12
D: 10–17

=> composition duration = 17s

If D extends to 20s:
=> duration = 20s

If D is trimmed/deleted:
=> duration shrinks to the next latest content endpoint.

This must update consistently after:

- move
- trim
- split
- duplicate
- delete
- reorder
- interval changes
- undo
- redo

Playback, ruler, timeline and render/export must use the same
canonical duration.

Do NOT reintroduce a manual duration field as the primary workflow.

Empty composition must remain safe and finite.

==========================================================
3. PLAYBACK / TRANSPORT
==========================================================

Make the playback area feel like a proper editor transport.

IMPORTANT:
Playback controls must be DIRECTLY ABOVE THE TIMELINE,
not at the top of the application.

Organize clearly into:

[ Playback ] [ Editing actions ] [ Current time / duration ] [ Zoom ]

Playback should support:

- play
- pause
- stop
- current-time display
- total-duration display
- playhead synchronization
- FPS-aware playback
- playback stopping exactly at composition/content end
- seeking by clicking timeline
- End key => latest valid composition endpoint
- Home key => beginning
- stable behavior after timeline edits
- no overshoot beyond composition end
- no NaN/Infinity
- no playback/render loops

Do not rewrite the playback engine unless required to make
the existing behavior correct.

==========================================================
4. CLIP/LAYER EDITING
==========================================================

Verify and complete the existing T3 editing interactions:

- move clips/layers horizontally
- move/reorder vertically where supported
- trim from left edge
- trim from right edge
- split at playhead
- duplicate
- delete
- reorder
- snapping
- multi-selection
- selection feedback
- correct playhead interaction
- keyboard shortcuts where already architecturally supported
- context-menu foundation where already supported

All canonical mutations must go through Command Bus and History.

Do not create parallel mutation paths.

==========================================================
5. SNAP / TRIM / SPLIT QUALITY
==========================================================

Ensure editing feels predictable.

Snapping should correctly consider relevant timeline boundaries
without causing jumps or unstable behavior.

Trim must:

- preserve valid intervals
- reject invalid/negative durations
- update content-driven composition duration
- keep Canvas synchronization correct

Split must:

- operate at the intended playhead position
- create valid resulting intervals
- preserve properties/visual state correctly
- update duration correctly

Duplicate must:

- create a valid new layer/interval
- preserve expected properties
- avoid invalid overlap/state
- remain undoable

==========================================================
6. CANVAS ↔ TIMELINE ↔ INSPECTOR SYNC
==========================================================

This is REQUIRED for T3 completion.

When selecting an item in Timeline:

=> Canvas selection updates.

When selecting on Canvas:

=> Timeline selection updates.

When changing a relevant property through Inspector:

=> Canvas updates
=> Timeline remains synchronized.

When moving/trimming/editing from Timeline:

=> Canvas reflects the result.

When changing time/playhead:

=> Canvas displays the correct composition state.

No stale selection state.
No duplicate canonical state.

Preserve all frozen T2 transform behavior.

==========================================================
7. KEYFRAME FOUNDATION
==========================================================

T3 only needs the EXISTING basic keyframe foundation.

Verify:

- keyframe indicators
- existing basic keyframe authoring
- correct timeline positioning/visual indication
- synchronization with the canonical Scene Graph

Do NOT turn this into the full T4 animation system.

Do NOT implement advanced animation curves/easing systems beyond
what already belongs to the current T3 foundation.

==========================================================
8. MARKERS
==========================================================

Verify existing marker functionality:

- add marker
- display marker on ruler/timeline
- correct time position
- survives appropriate state updates
- undo/redo if already architecturally supported

Keep it lightweight.

==========================================================
9. MULTI-SELECTION
==========================================================

Verify multi-selection works naturally in Timeline.

Required behavior:

- select multiple items
- clear selection
- preserve Canvas synchronization
- avoid accidental deselection during normal editing
- maintain predictable move/reorder behavior

Do not invent a large grouping architecture.

==========================================================
10. RESPONSIVE / CLIPCHAMP-LIKE WORKSPACE UX
==========================================================

Improve the existing Timeline UX where needed so that:

- transport stays directly above timeline
- transport remains usable while timeline rows scroll
- ruler remains visually stable
- timeline rows scroll independently
- horizontal timeline scroll does not destroy fixed controls
- controls are visually grouped
- current time is easy to read
- zoom controls are easy to understand
- timeline has clear visual hierarchy
- controls do not feel cramped
- interactions feel responsive

Do NOT redesign the entire application shell.

Do NOT turn this into a visual-only mockup task.

Every important UX control must perform the real underlying operation.

==========================================================
11. KEYBOARD / BASIC EDITOR INTERACTION
==========================================================

Verify existing useful shortcuts and interaction foundations.

At minimum ensure there are no obvious conflicts between:

- play/pause
- seeking
- Delete
- duplicate
- split
- Home/End
- selection

Do not build an enormous shortcut system.

==========================================================
12. PERFORMANCE
==========================================================

T3 should remain responsive.

Avoid:

- unnecessary full-editor rerenders
- requestAnimationFrame loops that continue after playback stops
- recursive command execution
- command/update loops
- repeated duration recalculation during every render
- expensive timeline layout recalculation when unnecessary

Content duration should be recalculated at appropriate mutation/
validation boundaries, not continuously during rendering.

==========================================================
13. HISTORY / UNDO / REDO
==========================================================

Verify that timeline mutations correctly participate in History:

- move
- trim
- split
- duplicate
- delete
- reorder
- duration-changing mutations
- other existing T3 mutations

Undo must restore both:

- content state
- derived timeline/playback duration behavior

Redo must restore them again.

Do not create a second history mechanism.

==========================================================
14. RENDER / EXPORT CONSISTENCY
==========================================================

Where existing render/export functionality consumes composition
duration, verify that it uses the SAME canonical content-derived
duration used by Timeline and Playback.

Do not introduce a separate export duration.

Do not redesign the professional renderer in T3.

==========================================================
15. T3 BOUNDARY — DO NOT IMPLEMENT
==========================================================

Explicitly DO NOT implement these as part of T3:

- true NLE Track/Clip data-model rewrite
- sourceIn/sourceOut architecture
- ripple editing
- advanced multi-clip-per-track architecture
- advanced transitions system
- advanced audio editing/mixing
- advanced keyframe/animation system
- professional compositing
- advanced masks
- 3D
- GPU renderer rewrite
- tracking
- AI editing
- AI Director
- AI asset generation
- T4 Graphics/Text/Animation milestone

These are future milestones/capabilities.

Do NOT interpret their absence as T3 bugs.

==========================================================
16. TESTING
==========================================================

Before declaring T3 complete:

1. Add/update focused tests for all important T3 behavior.

Test at minimum:

- content duration from latest endpoint
- duration growth
- duration shrink
- duration after delete
- duration after trim
- duration after move
- duration after split
- duration after duplicate
- undo/redo duration restoration
- playback end behavior
- Home/End behavior
- ruler endpoint
- timeline zoom
- seeking
- snapping
- Canvas/Timeline selection synchronization
- Inspector synchronization
- timeline mutation/history behavior

2. Run targeted tests.

3. Run full test suite ONCE at the end.

4. Run TypeScript typecheck.

5. Run production build.

Do not claim completion if typecheck/build is broken.

==========================================================
17. MANUAL END-USER ACCEPTANCE
==========================================================

Before stopping, validate the actual browser workflow, not only
unit tests.

Use a realistic composition and verify:

A)
Layer A = 0–5
Layer B = 0–8
Layer C = 3–12
Layer D = 10–17

Timeline visibly ends at 17s.

B)
Extend D to 20s.

Timeline/ruler/current duration/playback end update to 20s.

C)
Trim D back to 14s.

Timeline duration becomes the next latest endpoint.

D)
Delete the latest-ending layer.

Duration shrinks correctly.

E)
Undo.

Previous duration/state returns.

F)
Redo.

New duration/state returns.

G)
Play from start.

Playback stops exactly at the canonical end.

H)
Click timeline.

Playhead seeks correctly and Canvas updates.

I)
Select item in Canvas.

Corresponding Timeline item becomes selected.

J)
Select item in Timeline.

Canvas selection updates.

K)
Move/trim/split/duplicate an item.

Canvas, Timeline, Inspector and playback remain synchronized.

L)
Scroll vertically.

Ruler + transport remain usable.

M)
Zoom timeline.

Time mapping remains correct.

==========================================================
18. CODEX SCOPE DISCIPLINE
==========================================================

Inspect the existing implementation first.

Do NOT assume the handoff list is fully current.

The latest code already contains the content-driven duration
correction. Preserve it.

Do not perform a repository-wide architectural rewrite.

Do not refactor unrelated systems.

Prefer modifying existing timeline/playback/command/model code.

Do not create duplicate abstractions merely to satisfy this task.

If an existing feature already works, preserve it.

Only change code where needed to make T3 complete and coherent.

==========================================================
FINAL DEFINITION OF DONE
==========================================================

T3 is COMPLETE only when:

- Timeline is genuinely usable.
- Playback is genuinely usable.
- Content-driven duration works end-to-end.
- Timeline/ruler/playback use the same canonical timing.
- Move/trim/split/duplicate/delete/reorder work.
- Snapping works.
- Multi-selection works.
- Markers work.
- Basic keyframe foundation works.
- Canvas ↔ Timeline ↔ Inspector synchronization works.
- Undo/redo works for T3 mutations.
- Responsive scrolling/zooming works.
- Transport is directly above Timeline and remains usable.
- No obvious UX blocker remains for normal timeline editing.
- Targeted tests pass.
- Full suite passes.
- Typecheck passes.
- Build passes.
- T1/T2 behavior remains intact.
- T4+ remains untouched.

IMPORTANT:
Do NOT report “T3 complete” merely because tests pass.

Completion means the milestone is functionally complete from both:
1. architecture/code perspective
2. end-user workflow perspective.

At the end, report ONLY:

1. Files changed
2. What T3 functionality was completed
3. Tests: targeted count + full-suite count
4. Typecheck result
5. Build result
6. Any remaining T3 blockers
7. Explicit confirmation that T4+ was NOT started

STOP after T3.
Do not begin T4.
```

### 15 — User-supplied permanent AGENTS rules

Source: user-supplied AGENTS.md rules, identical to the current file; reproduced verbatim.

```text
# Permanent development rules

## Scope first

- Read the user's current milestone and inspect the repository before substantial work. Preserve working systems and user changes.
- The current approved scope is **Phase 1 - Tier 2.2.1, Professional Transform Interaction Correction**. Tier 1, Tier 1.1, and Tier 2.1 are frozen. Stop after Tier 2.2.1 for architectural review; do not start Tier 2.3 automatically.
- Canvas selection, move, corner/edge resize, center-pivot rotation, text-box width/reflow controls, type-aware handles, and six local transform inspector fields are authorized. Timeline functionality, playback, effects, animation/keyframes, AI/generation, 3D, asset importing, and production services are not. The timeline remains a static placeholder.
- Explain the plan internally before implementation. Choose stable interfaces and small extensions; avoid speculative systems and unnecessary dependencies.

## Canonical architecture

- Keep exactly one editor engine, canonical scene graph, and command bus. Never add parallel editable stores or duplicate parent/child representations.
- UI never mutates canonical project state. Route every ordinary editor mutation through a typed, runtime-validated semantic command.
- Keep intentional undo/redo boundaries. Use explicit atomic transactions for related edits and test rollback. Do not turn multiple UI edits into unrelated hidden state updates.
- Maintain readonly, runtime-frozen public state; do not expose mutable live snapshots or draft references.
- Core modules must remain independent of DOM, UI frameworks, storage APIs, rendering, networking, and service clients.
- Follow `TRANSFORM_CONTRACT.md` for coordinate frames, fixed local origin, T*R*S order, parent-to-child affine composition, inherited opacity, precision, and failure rules. Derive matrices from canonical readonly data; do not persist/cache a second transform state.
- `MOVE_LAYER` preserves stored local transforms, not world appearance. Keep transformed `UNGROUP` rejected; do not discard shear or metadata, or broaden the strict stored-identity guard based on numerical matrix equality.
- `engine.load` is a validated session boundary with cleared history. Do not use it as a shortcut for ordinary edits.
- Capability commands use the same command/transaction/history/validation path. Handlers are synchronous and side-effect-free. No external plugins are implemented yet.
- Interaction pivot is the visual bounds center; compensate position during Canvas and inspector rotation. The frozen local origin and T*R*S matrix semantics stay unchanged. Follow revision 2 of `TRANSFORM_INTERACTION_CONTRACT.md`. Text width controls change typed width/height properties, never font size or scale.
- The renderer consumes `src/core/transforms.ts`. Never duplicate layer-transform math in Canvas or replace the frozen coordinate, opacity, reparent, or ungroup semantics.
- `src/render` owns a replaceable, read-only render adapter and Canvas 2D implementation, without engine access. Render records are disposable per-call projections, never stored/mutated as a second scene or canvas model.
- `src/ui/session.ts` stores only transient composition/selection IDs and resolves values from the engine on each read. Selection must not create commands, history, autosaves, or project writes. Reconcile selection on deletion/load/composition switches.
- The inspector may edit only X/Y, scale X/Y, rotation, and opacity using the same semantic command builder as Canvas. Other fields stay read-only. Library categories are presentation-only; JSON open/export remain document persistence.
- Keep only one transient gesture baseline and numeric transform/text-box preview override. Never commit on pointermove. Commit changed SET_PROPERTY commands in one transaction on release; cancellation/no-op must create no history or autosave.

## Data and compatibility

- Persistent project data must remain JSON-safe and explicitly versioned. Validate at command, import, migration, and persistence boundaries.
- Schema changes require a version bump, explicit consecutive migrations, and regression fixtures. Preserve newer-version documents; do not silently discard unknown data.
- Respect placeholders: effects, masks, keyframes, audio tracks, and capability UI/renderer/AI declarations do not implement those systems. Never claim they do.
- Keep assets as references/metadata in the document. Do not store binary media bytes in project JSON or local storage.
- Maintain backup/recovery safety. Surface storage failures and never overwrite unsupported future-version primary saves.

## Required validation cycle

Use Node.js 20+ and npm 10+. Install from the lockfile with `npm ci`.

1. Implement only the authorized milestone.
2. Run `npm run format`.
3. Run `npm run typecheck`.
4. Run `npm test`.
5. Run `npm run build`.
6. Fix every error, then rerun `npm run check` for the complete cycle.
7. Review the final diff. If the workspace has no Git repository, inspect all created/changed files and use a no-index diff against the baseline where appropriate; do not invent a Git history.
8. Update documentation for material behavior changes.
9. Report files changed, architecture implications, checks/results, build result, limitations, and the next milestone. Never declare completion with broken checks.

Tests for new core mutations must cover validation failures, resulting state, undo/redo, and transaction atomicity. Test persistence failure modes when persistence changes. Keep test-only capability examples out of the production registry.

```

### 16 — Consolidated T3 with NLE infrastructure

Source attachment: 255312de-60cf-4f1c-bf46-7531f1dd3da3/pasted-text.txt (verbatim).

```text
You are working on my AI-Native browser-first professional video editor.

IMPORTANT:
Do NOT start T4, T5, T6, AI features, asset libraries, or unrelated visual polish.

This is ONE CONSOLIDATED T3 IMPLEMENTATION PASS:
T3 = Core Timeline + Playback + Professional NLE Infrastructure.

The goal is to make the timeline and playback workspace behave and feel like a professional Clipchamp-style NLE, while preserving our existing Scene Graph, Command Bus, History, Canvas, Inspector, Selection, Playback and future AI architecture.

This is NOT a superficial audit.
This is an implementation task.

==================================================
0. PRODUCT UX BENCHMARK
==================================================

Use Clipchamp as the behavioral and UX benchmark for the Timeline + Playback workspace.

We want the following qualities:

- simple and approachable like Clipchamp
- direct manipulation
- clear visual hierarchy
- compact professional transport controls
- timeline-first editing workflow
- obvious selected-state feedback
- smooth scrolling
- predictable drag behavior
- clean clip representation
- easy-to-understand track organization
- responsive interaction
- professional but not unnecessarily complex

DO NOT copy Clipchamp's proprietary code, assets, branding, or exact visual identity.

Our application must retain its existing dark AI-Native visual identity.

The benchmark is:
LAYOUT + INTERACTION + INFORMATION HIERARCHY + BEHAVIOR + USABILITY.

==================================================
1. FIRST INSPECT THE EXISTING CODEBASE
==================================================

Before changing anything:

- inspect PROJECT_HANDOFF.md if present
- inspect Scene Graph/model
- inspect Command Bus
- inspect History
- inspect selection system
- inspect current timeline model/UI
- inspect Canvas
- inspect Inspector
- inspect Playback
- inspect existing tests
- inspect styling/layout system
- understand what already exists

Do NOT rewrite working T1/T2 architecture.

Extend the existing architecture.

Do not create duplicate canonical state.

Scene Graph remains the canonical source of truth.

==================================================
2. PROPER TRACK → CLIP NLE ARCHITECTURE
==================================================

The timeline must support a real NLE abstraction.

Establish a clean conceptual distinction:

TRACK
- id
- name
- type
- order/index
- enabled/locked/muted state where appropriate
- clips

CLIP
- id
- asset/source reference
- trackId
- startTime
- duration
- sourceIn/sourceOut where applicable
- enabled
- speed where supported
- transition/effect metadata where appropriate
- metadata

The architecture MUST support:

ONE TRACK
→ MULTIPLE INDEPENDENT CLIPS

Example:

VIDEO 1
[Clip A][Clip B][Clip C]

Do NOT continue treating:

Layer = Timeline Clip

as the only possible timeline representation.

Existing Scene Graph layers must remain valid for AE-style objects:

TEXT
IMAGE
SHAPE
GROUP
COMPOSITION
CAMERA
LIGHT
ADJUSTMENT
etc.

The timeline must support both:

1. AE-style layer/object timing
2. NLE-style Track → Clip timing

without duplicate canonical state.

If schema/model migration is required, make it versioned and backward-compatible where practical.

==================================================
3. TIMELINE WORKSPACE — CLIPCHAMP-STYLE UX
==================================================

Build a professional timeline workspace with this structure:

--------------------------------------------------
PLAYBACK / TRANSPORT
--------------------------------------------------
TIMELINE
--------------------------------------------------

The transport belongs immediately above the timeline.

It must NOT be placed in the top application toolbar.

Timeline layout should conceptually be:

┌───────────────────────────────────────────────────────┐
│                    CANVAS / PREVIEW                   │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│  Playback Transport                                   │
│  controls        current time / duration              │
└───────────────────────────────────────────────────────┘

┌──────────────┬────────────────────────────────────────┐
│ Track Header │ Time Ruler                             │
├──────────────┼────────────────────────────────────────┤
│ Video 1      │ [Clip A][Clip B]                      │
│ Video 2      │        [Clip C]                       │
│ Audio 1      │ [Music──────────────────]             │
│ Text         │              [Title────]              │
└──────────────┴────────────────────────────────────────┘

Required behavior:

- stable/fixed time ruler
- stable/fixed track header column
- scrollable timeline content
- vertical track scrolling
- horizontal timeline scrolling
- persistent playhead overlay
- clear clip boundaries
- clear selected state
- visible track separation
- readable time ruler
- usable zoom
- content-driven timeline extent
- no hard-coded 10-second assumption

The ruler must remain stable while timeline rows scroll vertically.

The playhead must remain visually persistent and synchronized with current time.

Do not make the timeline feel like a static list of layers.

It must feel like an actual NLE editing surface.

==================================================
4. PLAYBACK / TRANSPORT — CLIPCHAMP-STYLE UI/UX
==================================================

This is IMPORTANT.

The playback panel must not merely expose functional buttons.

Build a proper professional transport UI/UX inspired by Clipchamp.

Requirements:

- transport is directly above the timeline
- clear primary Play/Pause control
- Stop control where appropriate
- current time display
- total duration display
- clear time separator
- frame/time information where useful
- controls have obvious hover/pressed/disabled states
- controls have clear hit areas
- controls are visually grouped
- spacing is compact and professional
- current playback state is obvious
- controls do not dominate the Canvas
- transport remains visually associated with the timeline
- playhead and current-time display stay synchronized
- playback state is immediately reflected in the Canvas

The visual hierarchy should resemble a professional consumer NLE:

PRIMARY:
Play/Pause

SECONDARY:
Stop / stepping / other existing transport controls

STATUS:
Current time / total duration / frame information

Do not put playback controls into the top app toolbar.

Do not create duplicate playback state.

Use the existing playback architecture.

The transport should feel like part of the editing workspace, not a generic button row.

If the existing design system has appropriate icons/components, reuse them rather than introducing a disconnected UI system.

==================================================
5. DIRECT CLIP MANIPULATION
==================================================

Implement reliable direct manipulation.

Horizontal drag:

X movement
→ changes clip startTime

Vertical drag:

Y movement
→ changes destination track

Example:

VIDEO 1    [Clip A]

drag downward

VIDEO 2    [Clip A]

A drag operation must produce ONE logical undoable history entry.

Requirements:

- pointer down identifies clip
- drag calculates time delta
- drag calculates track delta
- resolve valid destination
- commit through Command Bus
- update Scene Graph/canonical state
- update Timeline
- update Canvas
- update Inspector
- update selection
- create one History entry

Do not directly mutate canonical state from UI code.

==================================================
6. MULTIPLE CLIPS PER TRACK
==================================================

Support:

VIDEO 1
[Intro][Main][B-roll][Outro]

Each clip must independently support:

- select
- move
- trim
- split
- duplicate
- delete

Do not assume one continuous layer interval represents an entire track.

==================================================
7. CORE NLE OPERATIONS
==================================================

Ensure these are real, functional operations:

- single selection
- multi-selection
- horizontal movement
- vertical track movement
- multi-clip movement
- trim left
- trim right
- split
- duplicate
- delete
- reorder
- enable/disable where appropriate
- markers
- snapping
- zoom
- horizontal scrolling
- vertical scrolling
- playback
- undo
- redo

Do not create fake controls.

If functionality already exists, preserve it and integrate it correctly into the new architecture.

==================================================
8. DRAG & DROP
==================================================

Support:

Library / Asset → Timeline

Requirements:

- determine target track
- determine exact drop time
- create appropriate canonical object/clip through Command Bus
- update selection
- update Canvas
- update Inspector
- update History

Timeline → Timeline:

- horizontal movement
- vertical track movement

Canvas ↔ Timeline:

selection must remain synchronized.

Use existing Asset Registry.

Do not build a replacement asset system.

==================================================
9. SNAP / TIMING
==================================================

Establish predictable snapping behavior.

Snapping should consider appropriate timeline landmarks such as:

- clip boundaries
- playhead
- composition start/end
- markers
- other valid timeline positions

Snapping must work consistently during drag.

Avoid jitter.

Do not introduce floating-point artifacts into visible time displays.

==================================================
10. PLAYBACK SYNCHRONIZATION
==================================================

Use ONE canonical current-time/playback state.

Required relationship:

Playback
↕
Current Time
↕
Timeline Playhead
↕
Canvas Frame
↕
Inspector temporal state where applicable

Playback must:

- play
- pause
- stop
- advance at appropriate FPS
- stop at actual composition/content duration
- correctly handle extended timeline duration
- update playhead continuously
- update Canvas continuously

Do not create a second independent playback clock.

==================================================
11. CANVAS ↔ TIMELINE ↔ INSPECTOR
==================================================

Selection must be shared.

Timeline selection:

Timeline
→ Scene Graph selection
→ Canvas selection
→ Inspector selection

Canvas selection:

Canvas
→ Scene Graph selection
→ Timeline selection
→ Inspector selection

Inspector mutation:

Inspector
→ Command Bus
→ Scene Graph
→ Timeline
→ Canvas

All canonical mutations must remain undoable.

Preserve the existing shared selection architecture.

==================================================
12. CONTEXT MENUS / INTERACTIONS
==================================================

Establish capability-aware timeline actions.

At minimum support sensible behavior for:

- selected clip
- multiple selected clips
- empty timeline area
- track area

Do not populate menus with actions that are not implemented.

Maintain a clean Clipchamp-like direct manipulation experience.

==================================================
13. KEYBOARD INTERACTIONS
==================================================

Preserve or establish sensible keyboard behavior for core NLE actions where supported by the current architecture.

Examples:

- delete
- duplicate
- split
- undo
- redo
- selection movement where appropriate

Do not introduce shortcuts that conflict with existing application behavior.

==================================================
14. DURATION / TIMELINE EXTENT
==================================================

Do NOT hard-code:

10 seconds
or any other fixed timeline length.

Timeline extent must derive from canonical composition/content rules.

Adding/moving/extending content must update the effective timeline extent correctly.

The visible timeline must be able to extend beyond the initial content duration.

Avoid unnecessary empty infinite space.

Maintain correct zoom behavior.

==================================================
15. PERFORMANCE / INTERACTION STABILITY
==================================================

Do not blindly rewrite the timeline into another framework.

Preserve stable interaction surfaces where practical.

Avoid unnecessary full DOM/UI rerenders during:

- playhead movement
- dragging
- scrolling
- zooming

Keep interactions responsive.

Do not prematurely introduce virtualization unless the current architecture actually requires it.

==================================================
16. COMMAND BUS + HISTORY
==================================================

Every canonical user mutation MUST use the existing Command Bus.

Ensure:

drag
→ one logical transaction

multi-clip drag
→ one logical transaction

trim
→ one logical transaction

split
→ one logical transaction

duplicate
→ one logical transaction

delete
→ one logical transaction

track movement
→ one logical transaction

Undo/redo must restore all affected state correctly.

Do not bypass History.

==================================================
17. TESTING
==================================================

Add/update focused tests.

MODEL:
- Track model
- Clip model
- multiple clips per track
- duration/content extent
- schema migration if required

INTERACTION:
- horizontal clip drag
- vertical track movement
- multi-clip movement
- trim left
- trim right
- split
- duplicate
- delete
- reorder
- snapping
- selection
- multi-selection

SYNC:
- Timeline ↔ Scene Graph
- Timeline ↔ Canvas
- Timeline ↔ Inspector
- Playback ↔ Timeline
- Canvas/Inspector mutations ↔ Timeline

HISTORY:
- undo/redo for all core operations
- one drag = one history entry
- multi-clip drag = one history entry

UI:
- ruler remains stable during vertical scroll
- track headers remain stable horizontally
- horizontal scroll works
- vertical scroll works
- zoom works
- playhead remains persistent
- transport state updates correctly
- current-time display remains synchronized

Preserve all existing passing tests.

==================================================
18. VALIDATION
==================================================

Before declaring completion:

1. Run focused tests.
2. Run full test suite.
3. Run TypeScript typecheck.
4. Run production build.

If the environment prevents a test/build from running:

- report exactly what failed
- distinguish environment/tooling failure from source-code failure
- do NOT claim the test passed

==================================================
19. SCOPE BOUNDARY
==================================================

DO NOT implement:

- full Graphics library
- full Sticker library
- full Font library
- full Text system
- full Effects library
- full Transitions library
- full Audio/SFX library
- full Template library
- advanced 3D
- tracking
- AI generation
- AI assistant
- Director
- multi-AI orchestration
- cloud infrastructure

Those come later.

The purpose of this task is to make the Timeline + Playback infrastructure capable of integrating those future capabilities without requiring another fundamental timeline rewrite.

==================================================
20. FUTURE CAPABILITY INTEGRATION CONTRACT
==================================================

The future capability workflow will be:

BUILD CAPABILITY
→ Canvas integration
→ Timeline integration
→ Inspector integration
→ Command Bus
→ History
→ Playback
→ Render/Export
→ Tests

T3 must provide the infrastructure required for that workflow.

Do NOT implement those future capabilities now.

==================================================
21. IMPORTANT ARCHITECTURAL PRINCIPLE
==================================================

Canonical architecture:

User
↓
Command
↓
Command Bus
↓
Scene Graph
↓
Timeline / Canvas / Inspector / Playback
↓
History

AI will eventually use the SAME Command Bus and Scene Graph.

Never create a special timeline state that becomes a second source of truth.

Never create an AI-only mutation path.

Never bypass the Command Bus for canonical user mutations.

==================================================
22. DEFINITION OF DONE
==================================================

T3 is complete ONLY if all of the following are genuinely implemented:

- proper Track → Clip NLE representation
- multiple clips per track
- professional Clipchamp-style timeline workspace
- stable ruler
- stable track headers
- persistent playhead
- horizontal + vertical scrolling
- timeline zoom
- direct X-axis clip movement
- direct Y-axis track movement
- multi-clip movement
- trim
- split
- duplicate
- delete
- snapping
- markers
- drag/drop
- professional Clipchamp-style playback/transport UX
- playback ↔ timeline synchronization
- playback ↔ canvas synchronization
- timeline ↔ canvas selection synchronization
- timeline ↔ inspector synchronization
- Command Bus integration
- History integration
- undo/redo
- content-driven duration
- tests
- typecheck
- production build

Do NOT declare T3 complete merely because tests pass.

The actual architecture and required user-facing behavior must exist.

==================================================
23. FINAL REPORT
==================================================

At the end provide EXACTLY these sections:

A. CREATED / CHANGED THIS RUN
Only list what you actually implemented or changed in this Codex run.

B. ALREADY EXISTED
List important T3 functionality that already existed and was preserved.

C. REMAINS MISSING
List every requirement above that remains incomplete or was intentionally deferred.

D. VALIDATION
Report:
- focused tests
- full test suite
- typecheck
- production build
- environment limitations

E. ARCHITECTURAL DECISIONS
Briefly explain:
- Track/Clip architecture
- compatibility with existing Scene Graph layers
- timeline ↔ Scene Graph relationship
- playback/current-time architecture
- any schema migration
- any important interaction decisions

Do not claim implementation that was not actually performed.
```

### 17 — Surgical same-track multi-clip creation/drop

Source attachment: fd99b436-614b-47a4-819a-bf16d02e22b1/pasted-text.txt (verbatim).

```text
T3 — SURGICAL FIX ONLY: SAME-TRACK MULTI-CLIP CREATION/DROP

IMPORTANT:
The current project already has the Track → Clip NLE architecture.
Do NOT redesign, rewrite, or re-architect the timeline.

The latest implementation already contains:
- Track.clips[]
- canonical Clip model
- CREATE_CLIP / DELETE_CLIP / MOVE_CLIP / SET_CLIP_TIMING
- horizontal clip movement
- vertical track movement
- multi-selection movement
- trim
- split
- duplicate
- delete
- markers
- snapping
- playback/current-time synchronization
- Timeline ↔ Canvas ↔ Inspector synchronization
- Command Bus + History
- content-derived composition duration

Do NOT spend time re-implementing or re-testing those systems except where required by this specific fix.

THE ONLY MISSING USER-FACING BEHAVIOR TO FIX:

A user must be able to create/drop 2–3+ independent clips on the SAME NLE track.

Required behavior:

1. SAME TRACK, MULTIPLE CLIPS
A single Track must visibly support:
[Clip A] [Clip B] [Clip C]
with each clip having its own:
- clip id
- layer/asset reference
- startTime
- duration
- sourceIn/sourceOut where applicable

They must be independent clips, not duplicated visual representations of one layer.

2. LIBRARY / MEDIA → TIMELINE DROP
When a user drags an existing asset/media item from the Library/Media area onto an existing NLE track:
- determine the destination track from the pointer position
- determine timeline time from horizontal drop position
- create a NEW canonical Clip on that track
- preserve existing clips
- do NOT replace the existing clip
- do NOT create a new track unless the existing UX explicitly requires that
- allow repeated drops onto the same track

Example:
First drop:
Track 1 → [A]

Second drop onto Track 1 at another time:
Track 1 → [A] [B]

Third drop:
Track 1 → [A] [B] [C]

3. DIRECT CREATION / DUPLICATION
If the existing UI already has a supported way to duplicate/create a clip, ensure it can produce another independent Clip on the same track.

Duplicate must result in a distinct clip id and independent timing.

4. DROP POSITION
The horizontal drop location must become the new clip's startTime.

Do not silently append everything at time 0.

Respect the existing timeline zoom, scroll position, ruler, and content-time conversion.

5. NO OVERWRITE
Dropping another asset onto a populated track must NOT replace the existing clip unless there is already an explicit replace-media interaction.

Normal drag/drop means CREATE NEW CLIP.

6. RENDERING
After creation, the timeline must immediately show all clips on the same track as distinct clip bodies.

Example visual result:

Video 1    | [ Intro ] | [ Main ] | [ Outro ]

not:

Video 1    | [ Intro/Main/Outro merged into one layer ]

7. SELECTION
The newly created clip should become the selected clip using the existing shared selection system.

Timeline selection must continue to synchronize with Canvas and Inspector.

8. HISTORY
Each user creation/drop is one undoable Command Bus transaction.

Undo removes only the newly created clip.
Redo recreates that clip correctly.

9. DURATION
Continue using the existing canonical content-derived duration system.
Do not hard-code 10 seconds.
Dropping a clip beyond the current content length must extend the composition through the existing canonical duration mechanism.

10. PERSISTENCE
The new clips must serialize and reload correctly using the existing schema/versioning system.

11. IMPORTANT ARCHITECTURE RULE
Preserve the current Track → Clip → Scene Graph relationship.
Do NOT introduce duplicate canonical clip state.
Do NOT create a second timeline state model.
Do NOT bypass Command Bus for mutations.

12. UI/UX
Make the actual user-facing behavior obvious:
- existing track rows should accept drops
- show a clear drop target while dragging
- show the resulting clip immediately
- allow multiple clips on the same track without requiring hidden/debug actions

Do NOT redesign the entire timeline.
Do NOT redesign the playback panel.
Do NOT add T4/T5/T6 capabilities.
Do NOT add media libraries, effects libraries, transitions libraries, AI, 3D, or advanced editing systems.

IMPLEMENTATION FIRST.

Before changing anything:
inspect the current implementation and identify exactly why repeated same-track asset drops are not producing independent clips.

Then implement only this missing behavior using the existing architecture.

TEST ONLY THE RELEVANT REGRESSIONS:
- create first clip on track
- create second clip on same track
- create third clip on same track
- different drop positions produce different start times
- existing clips remain untouched
- clips have distinct ids
- selecting each clip works
- duplicate on same track works if already supported
- undo/redo
- content duration extension
- serialization/reload
- existing horizontal/vertical movement still works
- existing Timeline ↔ Canvas ↔ Inspector sync still works

Run typecheck and production build.

FINAL REPORT MUST BE STRICTLY:

A. CHANGED THIS RUN
Only files actually modified and what changed.

B. ALREADY EXISTED
List the T3 functionality that was already present and was preserved.

C. FIXED
Explain exactly how same-track multi-clip creation/drop now works.

D. TEST RESULTS
Targeted tests, full suite if practical, typecheck, build.

E. REMAINS MISSING
Only genuinely missing functionality. Do not relabel existing functionality as missing.

If same-track multi-clip creation already works somewhere in the code but is inaccessible through the current UI, fix the UI interaction rather than rewriting the underlying Track/Clip model.
```

### 18 — Baseline and handoff only (current request)

Source: inline user request (transcribed; list formatting condensed).

```text
Task: baseline and handoff only. Do NOT modify anything under src/, tests/, or config files.

1. If there is no git repo, run git init -b main. Verify .gitignore excludes node_modules/, dist/ and *.local. Commit everything as "Baseline: T3 (schema 4)".
2. Run npm ci then npm run check. Include the COMPLETE output in your final report (format check, typecheck, test summary with per-file counts, build). If anything fails, do not fix it, just report.
3. Create docs/HANDOFF.md from this conversation's history with: (a) the original project goal and every instruction/rule I gave you, in order; (b) each completed milestone with date, summary, files touched, and key decisions with reasons; (c) known limitations, bugs and TODOs you are aware of; (d) how to run the app, Node/npm versions used, and any Windows-specific notes. Be factual; do not invent anything.
4. Commit it separately as "docs: add HANDOFF".
5. Report git log --oneline and git status, then stop.
```
