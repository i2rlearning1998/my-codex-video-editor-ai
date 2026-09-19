# Changelog

## T3 - 2026-09-13

- Added canonical schema-4 Track→Clip ownership with multiple clips per track, stable layer/asset links, source in/out metadata, track state/order, exact clip timing, and an explicit consecutive 3→4 migration.
- Added command-driven track/clip create, delete, move, trim, enable, lock, mute and reorder operations. Timeline asset drops create linked clips, and render/Inspector/playback visibility resolves clip timing without a second state store.
- Added responsive panels/Canvas zoom, shared multi-selection/move, elapsed-time playback, split/duplicate/delete, sibling row drag reorder, marker snapping, focus-aware timeline zoom, shortcuts and supported context actions.
- Added Inspector timing edits, marker commands, basic transform keyframe authoring/indicators, and existing-asset drop integration through the same command/history path.
- Added schema 3 typed keyframes with consecutive migration and regression fixture. Media remains placeholder-only; no interpolation, source offsets, AI or T4.

## Tier 2.3 - 2026-09-12

- Replaced the static timeline with canonical layer rows, ruler, transient playhead/current time, zoom and scrolling, shared selection, clip move/trim, snapping, sibling reorder, and supported context/keyboard actions.
- Added validated SET_LAYER_TIMING transactions and shared time/pixel/frame helpers. Canvas now respects layer/ancestor timing; inspector displays canonical timing.
- Added schema 2 layer startTime/duration and explicit schema-1 migration with nested regression fixture; persistence architecture and backups are unchanged.
- Kept Tier 2.2.2 transforms frozen. No playback, waveform/keyframe/effects editing, media importing, or Tier 2.4.

## Tier 2.2.1 - 2026-09-12

- Corrected Canvas and inspector rotation to preserve the visual bounds center by committing position and rotation together; local origin and T*R*S semantics remain frozen.
- Extended the disposable selection overlay with type capabilities, rotated corner/edge graphics, a separated round rotation handle, larger hit targets, hover feedback, and directional cursors.
- Added generic single-axis edge scaling and selected-group body movement. Opposite corners/edges remain fixed through nested, nonuniform, and reflected transforms.
- Added distinct text width grips. They preserve font/scale, perform measured greedy wrapping, and atomically update typed width/height and `textWrap` properties. Text corner scaling remains separate. Existing text retains previous layout until a width edit.
- Added behavior-level regressions for pivots, edges, text reflow, nested groups, history, cancellation/no-op, high DPI, invalid inputs, property metadata, and schema-1 round trips; verified controls in the local browser.
- Updated interaction contract to revision 2. No schema, engine, command bus, history, persistence, or capability-system redesign; no dependencies, crop tools, transformed UNGROUP, Timeline functionality, or Tier 2.3.

## Tier 2.2 - 2026-09-11

- Added world-space selection boxes, four corner resize handles, fixed-origin rotation, and captured-pointer movement in the existing shell.
- Added one transient gesture controller and per-call numeric preview override. Completed drags commit changed SET_PROPERTY commands in one atomic history transaction; cancellation and no-op leave canonical state and autosave untouched.
- Added six inspector inputs using the same command builder, with canonical refresh after commits and undo/redo. Property types and reserved metadata are preserved.
- Extended the existing pure transform boundary with move, resize, and angle helpers. Nested movement uses inverse parent transforms; Shift resize preserves the initial signed scale ratio.
- Added deterministic interaction/math/DOM regressions and updated selection-render assertions for opaque UI handles.
- No schema, migration, engine, command bus, history, persistence, capability, dependency, reparent, or ungroup changes. No Tier 2.3, timeline functionality, playback, effects, AI, animation, 3D, or media importing.

## Tier 2.1 — 2026-09-11

- Replaced the foundation harness with one desktop editor shell: top bar, library/scene list, composition preview, read-only inspector, and static timeline region.
- Added a disposable scene-to-render adapter and replaceable Canvas 2D renderer using frozen affine helpers, inherited opacity, composition clipping, deterministic fallback sizes/media placeholders, and selection outlines.
- Added pointer picking with guarded inverses, keyboard-accessible scene selection, composition switching, and transient ID-only selection reconciliation. No selection writes, commands, history, or autosaves.
- Preserved local project save/open/export/recovery and added an explicitly labeled canonical example document. No asset import or generation.
- Added deterministic adapter/renderer/DOM integration tests and jsdom as a test-only dependency. Core engine, schema, commands, history, persistence, capability systems, and frozen transform module were not changed.
- No transform editing, dragging, resizing, timeline functionality, playback, effects, animation, AI, 3D, or production services. Tier 2.2 awaits architectural review.

## Tier 1.1 — 2026-09-11

- Froze coordinate frames, fixed local anchor, T*R*S composition, group/nested transforms, inherited opacity, scene order, reparenting, ungrouping, and numerical expectations in `TRANSFORM_CONTRACT.md`.
- Added pure readonly affine math: local/world matrices, multiplication, point mapping, and guarded inversion. Derived matrices retain shear and are never persisted.
- Added deterministic math and command regression tests, including transformed-UNGROUP rejection, rollback, undo/redo, and schema-1 round trips.
- Preserved local-transform MOVE_LAYER behavior and conservative stored-identity UNGROUP behavior. No persistent data change or migration; schema version remains 1.
- Updated architecture and agent rules. No Tier 2, rendering, canvas, playback, timeline, effects, keyframes, AI, 3D, or new UI work.

## 0.1.0 — 2026-09-11

Initial Phase 1 / Tier 1 foundation in an empty repository.

- Added the TypeScript/Vite project with strict checking, Vitest, Prettier, and a reproducible dependency lockfile.
- Added project/composition/layer/property/asset schemas and strict JSON validation.
- Added the canonical editor engine, semantic command bus, atomic transactions, bounded undo/redo history, and typed events.
- Added capability registration and validated namespaced command execution.
- Added serialization, schema versioning, and a consecutive migration runner that rejects newer schemas.
- Added development-only local save/load, last-good backup, corrupt-save quarantine, and debounced autosave.
- Added a browser harness for layers, history, local saves, JSON import/export, and document inspection.
- Added model, command, transaction, history, capability, migration, serialization, and recovery tests.
- Documented architecture, future development rules, limitations, and the recommended next milestone.

Canvas, timeline, playback, AI, effects, 3D, cloud storage, and production infrastructure remain outside this release.
