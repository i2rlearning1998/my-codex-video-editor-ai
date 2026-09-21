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
