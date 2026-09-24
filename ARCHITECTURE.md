# Architecture

> Status note: historical Tier scope limits and next-milestone restrictions below are obsolete. The current baseline is T3, schema 4, with timeline editing and playback. Scope and approved decisions now live in [AGENTS.md](AGENTS.md), [docs/DECISIONS.md](docs/DECISIONS.md), and [docs/STATUS.md](docs/STATUS.md). Frozen architecture contracts remain binding.

## Ownership and dependency direction

```text
User interaction → semantic command builder
                → EditorEngine.commands → CommandBus
                                      → draft handlers
                                      → project validation
                                      → atomic commit + history
                                      → typed events → UI / Autosave

Canonical scene + NLE timing → disposable render adapter projection → Canvas 2D
Canonical scene + selected ID → inspector → transform command builder → Command Bus

LocalProjectStore → deserialize → migrations → project validation → engine.load
```

`src/core` has no DOM, UI framework, storage, media, or networking dependency. Zod provides runtime schemas; TypeScript types derive from those schemas. Persistence and render adapters depend on core interfaces; the shell coordinates them. Vite, Vitest, TypeScript, Prettier, and the test-only jsdom environment are development dependencies. No frontend framework or second state-store dependency was introduced.

## Tier 2.1 shell and renderer boundary

`src/ui/shell.ts` owns one desktop layout: top bar, library/scene list, composition preview, inspector, and a timeline projection. The same shell is the extension point for future modes; no alternate editor implementation exists. Panel widths are stable, the preview fits its available space, and scene/inspector contents scroll independently. The shell retains no editable project/layer copy.

`EditorSession` stores transient `compositionId`, `selectedId`, `currentTime`, and timeline zoom, plus an optional readonly text-measurement service supplied by the renderer, resolving objects from `engine.state` every time. It subscribes to committed engine changes, reconciles deleted selections, and clears selection on document replacement or composition switching. The shell updates on engine notifications or session-only selection changes. Selection causes no engine event, command, history entry, or autosave. Canvas clicks and scene-list buttons flow through this interaction session, not through a mutation command, because they do not edit the document. Tier 2.2 transform interactions use the shared semantic command builder for the existing bus. Existing undo/redo use the engine's history boundary; project open/example actions use its validated document-load boundary.

`src/render/adapter.ts` derives disposable immutable render items from the current canonical composition. It resolves typed visual properties and asset dimensions, traverses groups depth-first in existing sibling order, and calls `worldTransform` from the frozen core helpers. The projection is not retained as a canvas model or synchronized store. `RenderSource` contains references to current immutable canonical composition/assets plus project background. It is recreated on every refresh.

`CompositionRenderer` is the small replaceable interface. `Canvas2DRenderer` receives a canvas, current source, view fit, and selected ID. It holds no engine, subscriptions, scene cache, command handlers, or UI component references. Canvas 2D calls live only behind this boundary. Full affine matrices are passed to `setTransform`; no layer TRS formulas or decomposition are duplicated. The view-only fit matrix and backing pixel ratio are composed with shared `multiplyMatrices`. Device pixel ratio is capped at 2 for the development preview; geometry/hit testing remain in logical CSS/composition coordinates. ResizeObserver/window resize redraw at the current fit. The shell disposes subscriptions/listeners during teardown and hot reload.

The preview draws composition background/bounds and clips content to those bounds. Groups do not paint or composite an offscreen surface. Each drawable receives effective inherited opacity once. Rectangles, simple clipped text, and labeled media placeholders consume existing `width`, `height`, `fill`, `text`, and `fontSize` custom properties. Width/height prefer a positive numeric property, then referenced asset dimensions, then defaults: text 360×100, shape 180×120, image/video 320×180, audio 240×64. Size resolution is shared with the inspector. Groups have no dimensions. Legacy text uses explicit newline splitting with a preview font-size cap of 4096 and at most 1000 visible lines. Text-width edits activate the `textWrap` typed boolean convention, using greedy measured wrapping and canonical box dimensions (see below). No fetch, media decode, advanced typography, or generation is performed. Wrapping still uses the typed property dictionary and added no structural field when introduced.

Hit testing uses the inverse fit matrix and guarded inverse world matrices from `src/core/transforms.ts`, then tests local rectangles in reverse paint order. It picks nested drawable leaves and clears on empty/outside-composition points. An already-selected group can be moved by dragging its descendant body; child selection remains available in the Scene list. Zero-opacity and noninvertible layers are skipped for pointer picking; their canonical records remain inspectable in the scene list. Text picking uses its rectangle, not glyph outlines; transparent pixels are not individually tested. Groups can be selected in the list. A group selection box encloses descendant drawable corners in group-local coordinates, then uses the full group world transform. Tier 2.2.1 adds constant-screen-size type-aware corner, edge/text-width, and rotation handles; selection alone still never changes geometry.

`src/ui/inspector.ts` resolves the selected ID against the same canonical tree and renders six editable local transform fields, plus read-only size/source, type/name, and parent/ID values. It uses textContent for document-sourced strings and input.value for numeric values. Input drafts are DOM-local; there is no inspector state cache. Placeholder-derived dimensions are labeled and never written back into the document.

Library category buttons switch explanatory content and expose existing asset references for drag/drop. The timeline has a fixed transport, sticky ruler/header surfaces, disposable track/layer projections, a shared playhead, and captured-pointer interactions. The undo/redo buttons remain global project-history actions. The example document is created detached with existing factories, validated, then opened by the sole engine; opening it replaces a document explicitly rather than applying hidden edits to the current one.

### Media store and import (W4-A)

Media bytes and thumbnails live in `src/media`, outside `src/core` (D-004, D-052). `MediaStore` is a small interface with three implementations: OPFS (the default, with streamed writes through a swap file), IndexedDB (used when OPFS is missing) and in-memory (for tests). Keys are `media/<fingerprint>` for the bytes and `thumbs/<fingerprint>` for the cached WebP poster.

The fingerprint is SHA-256 of the byte size and three 1 MiB samples, so a file is never read whole. The asset id is `media-<first 16 hex characters>`, and the asset's `source` is `{ kind: 'local', reference: 'media/<fingerprint>' }`.

`importMediaFiles` works through the files one at a time: classify, fingerprint, store, probe with a browser media element, then one `ADD_ASSET` transaction ("Import media") per file. Undo removes only the reference; the bytes stay. `src/ui/media-panel.ts` renders Project Media from the canonical assets, with thumbnails made in the background and cached in the store. It keeps no copy of project state. Schema 4 is unchanged.

### Composition viewport fit

`fitViewport` is a derived, transient view calculation. Its scale is the minimum of available-width/composition-width, available-height/composition-height, and 1. The final 1 is an upper cap: small compositions are not enlarged, and large compositions scale below 100%. Translation remains `(viewportSize - scaledCompositionSize) / 2` on each axis, so wide/tall compositions stay centered without distortion.

Preferred padding is 40 logical pixels per side. Each usable dimension is `min(viewportDimension, max(1, viewportDimension - 80))`. When full padding is impossible, the existing one-logical-pixel content allowance is retained, capped by the actual viewport dimension for fractional viewports below 1px. Zero, negative, and nonfinite viewport/composition dimensions or pixel ratios are rejected. A ratio that underflows to zero is rejected rather than returning a collapsed fit. Positive device pixel ratio is still capped at 2 for the backing surface and does not affect the logical fit matrix or hit testing. No viewport store, canonical state, or frozen transform semantics change.

### Current tradeoffs

The adapter calls the shared world-path calculation for each drawable, so derivation is O(n²) in the worst case. This avoids a premature parallel scene cache and is suitable for the milestone's small static compositions. A future measured optimization should extend shared traversal helpers, preserving the same canonical ownership and exact transform order. Text rasterization varies by system font; tests assert deterministic geometric draw calls, and browser checks verify actual Canvas output/interactions. Finite but overflowing transforms produce per-layer visible warnings without changing the document. Unsupported Canvas 2D also has a visible fallback, with the scene list/inspector still available. No final-render pipeline or capability renderer execution has been introduced.

`EditorEngine` alone owns the active project. Its state and history snapshots are deeply frozen. Observers receive the same immutable canonical snapshot, not another editable store. An execution-local cloned draft is transient and is discarded on failure. A validated copy is committed, so a plugin retaining its draft cannot mutate live state afterward.

Factories create detached project/composition/layer data; they never change a live engine. `engine.load` is the explicit document/session replacement boundary: it validates before replacement and clears undo/redo. Undo and redo restore snapshots through the engine. All ordinary edits, including plugin edits, go through the command bus.

## Document schema

Schema version 4 contains project metadata, settings, compositions, the asset registry, Scene Graph layers, NLE tracks/clips, markers and typed keyframes. IDs are unique across the whole document. Unknown structural fields, unsafe identifiers, nonfinite numbers, cycles, exotic objects, and non-JSON values are rejected. JSON tree depth is capped at 100. Serialized imports are capped at 20 million characters; browser file imports additionally enforce a 20 MB limit.

- Composition dimensions are positive integer pixels, fps is a positive number up to 240, and duration/marker positions are seconds. Fractional frame rates are supported. Frame-based timing and rounding rules are future work.
- The scene graph is an ordered nested tree: `composition.layers` stores root layers and each group stores `children`. Parent relationships are derived from containment. There is intentionally no second parent-ID index to synchronize. Only groups can have children.
- Each composition also owns ordered NLE tracks. Tracks own clips by containment; a clip's track association is derived from that containment. Clips reference canonical layer IDs instead of duplicating spatial/content properties.
- Transform semantics are frozen in [TRANSFORM_CONTRACT.md](TRANSFORM_CONTRACT.md): top-left composition origin, X right/Y down, fixed local anchor `(0, 0)`, clockwise degrees, local `T * R * S`, and world `W_parent * L`. Opacity is inherited multiplicatively per drawable. `src/core/transforms.ts` provides pure readonly affine calculations, without rendering or persisted derived state.
- Custom properties are keyed typed records: number, string, boolean, vector2, or hexadecimal color. An existing property's type cannot change via `SET_PROPERTY`.
- `animated` indicates authored keyframes. Schema 3 keyframes have property-typed values and strictly increasing composition-time positions; interpolation is not implemented. Effects, masks, and audio tracks remain empty arrays. `constraints` holds reserved JSON declarations without enforcement. Future implementations require explicit contracts and, when document shape changes, migrations.
- Assets have stable IDs, type, source reference, metadata, and optional dimensions/duration. `generated` is an allowed source kind for future compatibility, without generation behavior. Layer asset references must resolve and match the layer's media type. Source references are inert strings; this tier does not fetch them.

## Commands and transactions

Built-in commands have strict discriminated schemas. Runtime validation is required even for TypeScript callers because imported data and future integrations are not necessarily typed.

| Command              | Semantics                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `CREATE_COMPOSITION` | Add a fully validated composition with globally unique IDs.                                                           |
| `CREATE_LAYER`       | Insert a validated layer/subtree under a group or at the root.                                                        |
| `DELETE_LAYER`       | Delete the selected layer and all descendants. Assets remain registered.                                              |
| `MOVE_LAYER`         | Reparent/reorder within one composition. Index is measured after removal; omitted index appends. Cycles are rejected. |
| `SET_PROPERTY`       | Set a typed custom property or a named transform property.                                                            |
| `ADD_ASSET`          | Register a new asset ID.                                                                                              |
| `REPLACE_ASSET`      | Replace asset data while preserving ID and reference compatibility.                                                   |
| `GROUP`              | Group selected siblings in scene order at the first selected position. Noncontiguous selections become contiguous.    |
| `UNGROUP`            | Replace an identity, property-free group with its children in order.                                                  |

Track/clip commands create and delete records, change track state/order, move clips between compatible tracks, and update clip timing/source ranges/enabled state. They use the same validation, transaction and history path as the scene commands above.

Ungrouping a transformed group remains deliberately rejected: affine products can contain shear that current TRS fields cannot represent safely. The frozen contract specifies future flattening as `L_group * L_child` with multiplied opacity, full affine representability checks, and preservation/rejection of group metadata. `MOVE_LAYER` preserves stored local transforms, so changing parents can change world geometry and effective opacity. Identity-group ungrouping preserves these values even under transformed ancestors. See [TRANSFORM_CONTRACT.md](TRANSFORM_CONTRACT.md) for precision, ordering, and future appearance-preservation requirements.

`execute` creates one history boundary. `transaction(label, commands)` executes a nonempty ordered command group against a draft and creates one boundary. Each command's resulting project must be valid, so transactions cannot depend on temporarily broken references. Create an asset before a layer that references it. Any failure rolls back the entire group, preserving state and both history stacks. Nested/reentrant mutation is rejected, including writes attempted by event observers. Commands and plugin handlers are synchronous; asynchronous preparation must finish before command execution.

No-op groups leave history, redo, timestamps, and state notifications unchanged. They emit `command:before` for attempted commands but no applied/committed events. There is no implicit time-based history merging: callers make grouping intentional through explicit transactions.

## History and events

History entries store before/after immutable project snapshots plus ID, label, timestamp, command list, and command/transaction kind. The default maximum is 100 entries, configurable with a positive `historyLimit`. Snapshot history is appropriate for Tier 1 simplicity; its memory cost scales with document size. History is session-only and is not persisted. Undo/redo restore historical metadata along with document content, including `updatedAt`.

Events cover `command:before`, `command:applied`, `command:failed`, `transaction:committed`, `transaction:failed`, `state:changed`, and `history:changed`. Applied events fire only after the entire group commits. Successful transactions notify state observers once. Failed transactions emit no state change. Observer errors are isolated and can be reported with `onListenerError`; they cannot invalidate a completed commit. Subscriptions return unsubscribe functions.

## Capability extension point

Capabilities declare ID, semantic version, input/output runtime schemas, command definitions, and optional UI/renderer/AI metadata. Capability-wide schemas describe future capability-level input/output contracts; only command-level schemas execute in Tier 1. Registration validates descriptors and prevents duplicate IDs. There is no external loader, runtime UI/renderer integration, AI invocation, or sandbox.

An extension command uses `{ type: 'plugin:<capability-id>:<COMMAND>', input }`. Its registered handler receives a transient draft and schema-validated input. Its output must pass its output schema and be JSON-safe; its draft must pass canonical project validation. The same transaction and history path handles extension commands. Undo/redo replay snapshots rather than rerunning plugin code.

Capabilities are trusted in-process code. Handlers and schemas must be synchronous, deterministic, and free of external side effects; they must not retain draft references. External side effects cannot be rolled back by snapshot history. Future untrusted plugins need a separate, explicitly designed isolation boundary. No external capability is registered by this tier.

## Versioning and migrations

`SCHEMA_VERSION` is 4. Migrations register consecutive `from → from + 1` transforms: 1→2 adds layer timing, 2→3 preserves documents while typed keyframes become supported, and 3→4 adds empty composition track arrays without guessing clip ownership. The runner clones its input, verifies every version advance, and validates the resulting current document. Missing migrations, invalid output, and future versions are rejected. There is no invented version-0 production migration because no legacy project format exists; tests register a fixture migration to exercise the mechanism.

When changing the persistent shape, increment the schema version, implement each required migration, and add fixtures. Never drop unknown fields to simulate forward compatibility. Preserve files from newer versions and open them with an editor that supports their schema.

## Local persistence

`StorageAdapter` exposes synchronous key/value methods; the core does not import browser storage. The browser binds local storage to `LocalProjectStore`.

Save validates/serializes first, then backs up an existing valid primary before replacing it. A corrupt primary is quarantined once and never copied over a valid backup. Any failed backup/quarantine write aborts before primary replacement. Individual `localStorage.setItem` writes are atomic; the full multi-key save is not a database transaction. Load uses the primary, falling back to backup on corruption or a missing primary. A future-schema primary never falls back silently. A storage access error remains visible.

Autosave listens to committed state changes, debounces writes, retains a dirty flag on failure, retries on the next change or explicit `flush`, and can be disposed. Disposal cancels pending work; owners should flush first when needed. The harness flushes on `pagehide`. Cross-tab conflict handling, durable file handles, binary assets, and remote persistence remain out of scope.

## Tier 2.2.1 interaction and commit boundary

Canvas pointer events flow through `src/ui/canvas-interaction.ts` into `TransformInteraction`, then `buildTransformCommands`, the existing Command Bus transaction, the canonical graph, and history. The renderer has no engine or command access. Inspector commits enter the same controller/builder. Spatial movement uses SET_PROPERTY(position); MOVE_LAYER remains reparent/reorder with local-transform preservation.

The controller retains one immutable canonical baseline reference, pointer-derived numeric values, and the selected ID for the active gesture. `RenderSource.preview` is an optional per-call numeric transform override used by the same core worldTransform calculation for the selected node and descendants. A text-width gesture also carries temporary box width/height, consumed by both layout and selection geometry. It never copies the scene graph, persists data, or changes canonical ownership. Selection boxes and rendered artwork resolve from this same source. Dropping the override restores canonical appearance.

No command is issued during drag updates. Release builds only changed transform properties, preserving type/animated/keyframes/constraints metadata, then submits one atomic transaction. A scale resize updates position and scale together; center rotation updates position and rotation; text width updates position, width, height, and the wrap flag. Cancel and no-op generate no command or committed state event; autosave continues to listen exclusively to committed engine changes. Selection/composition/load/command changes invalidate an in-flight baseline. Capture is released on every completion/cancellation/disposal path.

The precise conversion, resize, rotation, precision, cancellation, and accessibility conventions are in [TRANSFORM_INTERACTION_CONTRACT.md](TRANSFORM_INTERACTION_CONTRACT.md). Schema remains 1; no migrations or new structural fields are needed. The frozen transform contract and all engine/history/persistence/capability behavior remain unchanged. Tier 2.3 is not started.

### Shared overlay and type policies

`selectionGeometry` returns the disposable `SelectionOverlay`: local bounds, transformed quad, visual center, rotation stem endpoints, handle records, and interaction capabilities. The full affine geometry is preserved, including inherited shear. Each handle contains its semantic ID, screen point, normalized orientation matrix, hit radius, and cursor. Canvas drawing and hit testing consume the same records; hover is a transient handle ID. A normal to the transformed top edge places the rotation handle outside the box. Priority is rotation, corners/generic edges, text width, body, empty.

`transform-capabilities.ts` supplies immutable policies for existing types. Text exposes corner scaling and side width editing; other drawable types and groups expose generic edges. Callers can supply an explicit policy map, with unknown types disabled by default. This is interaction policy, not another engine capability registry or command executor. External plugin loading, new schema layer types, and crop behavior are not implemented.

### Visual pivot and text layout

Interaction contract revision 2 (Tier 2.2.1) replaces the previous top-left interaction pivot with visual-center compensation. It does not change the stored transform contract: `position` still maps local `(0,0)` to parent space and matrices remain T*R*S. The controller freezes the baseline bounds center in parent space. Core math computes the new position required to keep that point fixed when changing rotation. Inspector rotation uses the same helper and canonical rotation property. Nested ancestors stay intact; no affine decomposition or reparenting occurs.

The text-layout function is pure and receives a width-measurement callback. Canvas2DRenderer supplies `measureText` using the same fixed Arial/600 font as drawing; the session passes that service to rendering and interactions. Headless ports can supply deterministic test metrics or use the documented approximation. No retained text/layer layout store is created. The active gesture preview uses this same layout path as the committed render.

Text width grips preserve font size and scale. Right grips fix the top-left corner; left grips fix the top-right corner while height grows along local positive Y. Changed width, layout height, optional compensated position, and typed `textWrap: true` are committed together. Original text strings and property metadata survive; incompatible existing property types reject the interaction. Existing documents without `textWrap: true` retain prior explicit-newline rendering until a width edit. Width is clamped to at least one local unit. Text corners only transform scale and position.

Schema remains 1: width/height, string text, and boolean custom properties already exist. The new wrap flag is a render convention in the existing property dictionary, not a structural schema addition; round-trip tests cover preservation. Older versions preserve that data but cannot display new wrapping behavior. No migration or unsupported-version downgrade was introduced. System font metrics can vary by platform; rich text, script-aware line breaking, font loading, and live text-content editing remain separately scoped.

## Historical Tier 2.3 timeline foundation

This milestone originally projected canonical layers as animation-style timeline rows. Schema 2 added layer timing and the 1→2 migration. The canonical NLE extension below supersedes its layer-as-clip limitation while retaining those rows for scene layers that are not linked to NLE clips.

Composition duration/FPS already existed, but layer timing did not. Schema 2 adds required nonnegative `startTime` and positive `duration` to each layer. Composition validation enforces finite ends within its duration at import, command, migration, and persistence boundaries. The built-in consecutive 1→2 migration preserves legacy content and supplies zero start/full composition duration recursively. Schema-2 imports do not receive implicit defaults. `createLayer` accepts an optional duration (default 10 seconds for existing factory callers); callers constructing layers for other composition lengths should supply that duration. Group creation uses its composition duration. Future-version storage protection and backup logic are unchanged.

All times are composition seconds, including nested layers. A group's activity intersects its descendants' activity; moving/trimming its clip changes only that group, not child timing. Canvas drawing and picking filter inactive layers. Selected inactive layers retain their shared ID and Inspector values, with no Canvas handles until active. Endpoints are half-open, including the empty frame at exact composition end. No playback/media evaluation is introduced; time only gates existing drawable placeholders and artwork.

`src/core/time.ts` owns finite-checked time/pixel/frame conversions. Pixels are logical CSS units independent of DPR; time-to-frame rounds to the nearest integer using Math.round, while frame-to-time divides by composition FPS. Scrubbing preserves subframe seconds. Clip gestures quantize the pointer delta to frames, retaining a baseline's subframe offset. Trim minimum is one frame or the original duration when shorter. Snapping uses a configurable default 8px threshold after frame quantization: composition start/end, then canonical depth-first clip starts/ends, excluding the edited layer. A move can align either boundary; trims align the manipulated boundary. Nearest candidate wins, ties retain candidate order. Zero/rounded-zero deltas and unchanged boundaries retain exact baseline timing. Snapping never retimes another layer.

`SET_LAYER_TIMING` is a strict, runtime-validated semantic command updating start/duration together. Timeline command building submits only changed values via an atomic transaction. One move/trim is one history item; cancellation/no-op produces no committed event or autosave. Existing MOVE_LAYER handles sibling-only row arrows and DELETE_LAYER handles Delete/context menu. No duplicate/split/ripple action is advertised. Undo/redo and refresh still use the sole EditorEngine. Inspector adds readonly start/duration/current time; its six transform editing fields are unchanged.

Current time and horizontal zoom (10–400px/s) live in EditorSession, never project JSON. Load/composition switches reset current time; engine changes clamp it. Timeline scroll stays on a stable DOM surface. Pointer capture survives row redraws; Escape, lost capture, blur, resize, external state/selection changes, and invalid input cancel. Ruler drag cancellation restores its starting session time. Arrow keys seek one frame, Shift+Arrow ten, Home/End seek bounds, and Delete deletes the shared selected layer when timeline has focus.

Rows currently redraw without virtualization. Ruler label count is bounded; future optimization can incrementally redraw selection/playhead and virtualize visible rows without retaining another model. Extremely long compositions and subpixel clips remain limited by browser scroll/coordinate precision; zooming helps target short clips. No automatic edge scrolling, waveform editing, source-media trim offsets, playback, advanced trimming, or Tier 2.4 is included. Existing transformed-group UNGROUP rejection and spatial transform math are unchanged; timing-aware ungroup semantics remain outside this UI milestone.

## T3 canonical NLE and responsive workspace

T3 adds schema-4 `Track` and `Clip` records inside each composition. A track owns ordered clips and typed enable/lock/mute metadata; each clip links exactly one canonical Scene Graph layer, optionally links the same asset as that layer, and owns project timing plus source in/out, speed, enabled state and reserved transition/effect metadata. Validation enforces global IDs, one clip per layer, compatible track/layer types and source bounds. The consecutive 3→4 migration adds empty track arrays and never invents ownership. Composition duration is derived deterministically from clip ends, unlinked layer ends, keyframes and markers, with the existing empty fallback.

The Scene Graph remains the only spatial/content hierarchy. Tracks and clips are the canonical NLE timing/order hierarchy, not a second copy of layer content. `nleTimelineRows` and `timelineRows` are disposable readonly projections; linked layers are omitted from the latter. The renderer and Inspector resolve linked layer activity through clip timing and track/clip enabled state. `EditorSession` still owns only transient selection IDs, current time, playback flag and zoom. Canvas transforms, frozen T*R*S semantics and transformed-group UNGROUP rejection are unchanged.

`CREATE_TRACK`, `DELETE_TRACK`, `MOVE_TRACK`, `SET_TRACK_STATE`, `CREATE_CLIP`, `DELETE_CLIP`, `MOVE_CLIP`, `SET_CLIP_TIMING` and `SET_CLIP_ENABLED` use the existing validated Command Bus. Direct clip move, cross-track move and source-aware trims produce one transaction per gesture. Split and duplicate create fresh linked layer/clip IDs in one transaction; deleting a linked layer also removes its clip. Track order/state and all clip mutations are undoable. Unlinked layers keep `SET_LAYER_TIMING` and Scene Graph sibling `MOVE_LAYER` behavior.

`Playback` projects elapsed time onto composition frames through an injectable clock/RAF boundary. Pause/stop/end do not write history. Stable timeline DOM avoids rebuilding rows on time-only changes; Canvas redraw uses canonical half-open timing visibility. Timing edits, markers, and keyframe commands are persistent transactions. Marker and marquee previews are discarded on cancellation or document invalidation. Canceled marquee restores the prior selection.

Schema 3 replaces empty keyframe tuples with typed `{time,value}` arrays. Transform keyframe commands capture the canonical base value, insert/replace in time order, and update `animated`; validation rejects duplicate/out-of-range times and mismatched values. Key times are absolute composition seconds and moving/trimming a clip does not retime them. Keys outside a trimmed clip remain editable records. No evaluator/interpolator is introduced. Migrations remain strictly consecutive: 1→2 layer timing, 2→3 typed keyframes, and 3→4 track arrays.

Basic split remains unavailable for groups. Clip source in/out is modeled and preserved by trim/split, while media decoding, audio output, transition/effect evaluation, waveform display, ripple editing, automatic edge scrolling and virtualization remain absent. Persistence backup/recovery and capability execution are unchanged. Frozen T*R*S, opacity inheritance, MOVE_LAYER local semantics and transformed-UNGROUP rejection remain intact. T4 is not implemented.
