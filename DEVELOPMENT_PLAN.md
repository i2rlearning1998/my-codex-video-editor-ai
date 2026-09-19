# Development plan

## Current stopping point: T3

The responsive timeline/editing workspace extends the frozen foundations with canonical Track→Clip ownership, multiple clips per track, shared multi-selection, playback time progression, source-aware timing edits, split/duplicate/delete/reorder, markers, basic keyframe authoring and existing-asset drops. Schema 4 has an explicit consecutive 3→4 migration. Media decoding, audio output, keyframe interpolation, transition/effect evaluation, advanced editing and T4 remain unimplemented. Stop after T3 validation; the older sequencing notes below are historical, not authorization to continue.

## Completed foundation: Phase 1, Tier 1

Deliver the manual editor's data and execution foundation: versioned models, one canonical tree, typed properties, semantic commands, atomic transactions, history, events, asset registry, capability contracts, validation, migrations, local persistence, tests, and architecture rules. The browser page is a foundation harness, not the complete video editor.

## Frozen contract: Phase 1, Tier 1.1

Freeze the transform and scene-graph semantics in `TRANSFORM_CONTRACT.md`, with pure DOM-independent affine math and deterministic regression tests. Preserve the single engine/tree/command bus and existing persistence/history/capability boundaries. Keep schema 1, fixed origin `(0, 0)`, local-preserving moves, and conservative identity-only ungrouping. No rendering, playback, canvas, timeline, keyframes, effects, AI, 3D, or UI additions belong to this milestone.

## Completed shell: Phase 1, Tier 2.1

Deliver one desktop editor shell, read-only Canvas 2D preview, transient visual selection, canonical read-only inspector, placeholder library categories, and a static timeline region. Derive all geometry from the existing canonical scene graph through the frozen helpers and a replaceable renderer boundary. Preserve schema 1, all foundation systems, local persistence, and existing command-driven updates. Add deterministic render/DOM integration tests and focused browser checks. No transform editing, asset import, playback, animation, effects, AI, 3D, or backend services.

## Approved interaction architecture: Phase 1, Tier 2.2

Add interactive selection bounds, captured-pointer move, corner resize, rotation, and six inspector transform inputs to the existing shell. Keep the fixed origin and T*R*S semantics. Resolve pointer coordinates with shared pure math, preview one temporary numeric override, and commit changed SET_PROPERTY commands through one atomic transaction per drag or field edit. Preserve property metadata, schema 1, one canonical tree, and every foundation system. Cover synchronization, nested transforms, cancellation/no-op, high DPI, validation, and undo/redo with deterministic tests.

## Approved corrections: Phase 1, Tier 2.2.1 / 2.2.2

Correct the interaction model without changing the engine architecture: visual-center rotation with canonical position compensation, a shared type-aware overlay, generic edge scaling, distinct text width grips with measured wrapping/height, hover/cursors, and existing one-gesture transactions. Revise the interaction contract explicitly; preserve schema 1 and stored T*R*S semantics. Verify nested/reflected geometry, text metadata and round trips, cancellation/no-op, undo/redo, and actual browser behavior.

## Historical milestone: Phase 1, Tier 2.3 — Timeline Foundation

Derive timeline rows from the canonical Scene Graph. Add transient current time, zoom/scroll, manual seeking and time-aware Canvas visibility. Commit bounded clip move/trim through SET_LAYER_TIMING; reuse MOVE_LAYER for sibling order and DELETE_LAYER for deletion. Preserve the frozen transform system, shared selection, one-gesture history boundaries, and persistence architecture. Add required canonical timing fields via schema 2 and an explicit consecutive migration because layers previously had no timing fields.

This layer-timing foundation was later extended by the completed T3 milestone above. Its sequencing text is retained as history, not as a description of the current model.

## Subsequent milestones need separate scope

- Playback and media evaluation beyond the manual timeline foundation.
- Keyframes, interpolation, effects, masks, and expanded audio data.
- Capability UI/renderer integration after concrete consumers justify the interface.
- AI, 3D, external plugin isolation, and production services only in later explicitly authorized phases.

These are sequencing notes, not promises of implemented features. Do not scaffold inactive systems for them now.

## Extension gates

1. Inspect current implementation and `AGENTS.md` before changes.
2. Extend existing engine/commands and schemas; never fork editor state.
3. For persistent changes, add a schema version and migration fixtures.
4. Cover failure, undo/redo, and transaction rollback for every new mutation.
5. Run formatting, type checking, tests, and production build; fix issues and rerun the cycle.
6. Review the final diff and document current behavior and limits.
