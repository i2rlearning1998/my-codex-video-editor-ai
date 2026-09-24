# Changelog

> Status note: historical Tier restrictions and future-work statements record their original milestones; they no longer define current scope. See [AGENTS.md](AGENTS.md), [docs/DECISIONS.md](docs/DECISIONS.md), and [docs/STATUS.md](docs/STATUS.md). The current baseline includes schema 4, timeline editing, and playback.

## Wave 5 part A (W5-A) — 2026-09-24

- Real video export: the Export button opens a dialog with presets (YouTube 1080p/4K, Shorts/Reels/TikTok, Instagram, WhatsApp, custom), size, frame rate, quality, range and file name.
- MP4 (H.264 + AAC) where the browser can encode it, otherwise WebM (VP9 + Opus) with an explanation. Frames are exact, the sound is mixed in and in sync, and the export matches the preview.
- A progress bar with the time left and Cancel; missing media is caught before starting; Export frame (PNG). Project JSON export moved to the File menu.

## Wave 4 part C (W4-C) — 2026-09-24

- Sound: audio files, the sound of video clips and detached audio play in step with the picture (measured within one frame).
- Track Mute and Solo are audible, and scrubbing a paused playhead plays a short blip.
- Audio clips show waveforms on the timeline that follow trims; audio cards show waveforms in the Media tab.

## Wave 4 part B (W4-B) — 2026-09-24

- Imported video and images now draw on the canvas: scrubbing and frame steps show the exact source frame, and playback runs in real time (it drops frames rather than slowing down). A "Buffering…" note appears if a video cannot keep up.
- Speed, Reverse and Freeze frame are now visible in the picture.
- EXIF-rotated photos draw upright, and PNG and WebM transparency shows what is behind.
- Timeline video clips show a filmstrip; image clips show their thumbnail.
- Audio is still silent; it arrives in W4-C.

## Wave 4 part A (W4-A) — 2026-09-24

- Import your own video, audio and image files with the Import button or by dropping files on the editor. A progress row shows each file, and Cancel stops the import cleanly.
- Imported media is stored in the browser (OPFS, or IndexedDB when OPFS is unavailable) and survives a reload. The project keeps only references.
- The Media tab now lists the project's media as cards with thumbnails, names and duration or type badges, with empty and error states and name search (MED-035 fixed).
- Drag a card to a track to create a clip at the drop time, or onto the canvas to centre a layer on the drop point at the media's own size.
- TL-017 fixed: dragging several clips to another track keeps their track offsets.
- Media fixture pack (1.6 MB) with a manifest and a generator script.

## Wave 2 continuation (W2-C) — 2026-09-24

- Cut, copy and paste clips (Ctrl+X, Ctrl+C, Ctrl+V, the palette and both right-click menus). Paste lands at the playhead using the insert rule.
- Link and unlink clips: linked clips move, nudge, split, delete and copy together and show a link badge. Detach audio creates a separate audio clip on an Audio track (not audible yet).
- Proved 7 risky Claimed items in the browser. TL-017 (multi-track drag keeping track offsets) and CV-022 (group click and double-click) are now recorded as known bugs.
- CV-008: holding Alt while dragging a corner or edge handle resizes from the center (transform-interaction contract revision 4).
- CV-022 fixed (owner priority bump): a click inside a group selects the group; double-click enters it one level at a time and selects the child under the pointer; Esc steps out one level, then deselects; clicking outside leaves the group.

## Wave 2 continuation (W2-B) — 2026-09-24

- One clip model: every layer is a clip on a track. The built-in example and older saves are converted when opened, and canvas drops, duplicates and groups always create clips. Legacy free-layer rows are gone.
- Locked tracks now also block Delete; locked clips look locked and refused edits show a toast.
- Clips never overlap: moves, drops, duplicates and Alt+↑/↓ insert and push later clips right, with a live preview and an insertion marker. Alt+←/→ nudges stop at neighbours.
- Proved 18 previously Claimed Wave 2 items with browser tests. Moved TL-003 and TL-005 back to Todo. CV-008's Alt-from-center resize is recorded as a known bug.

## Wave 2 (W2-CLAUDE) — 2026-09-23

- Unblocked e2e in Linux sandboxes (Chromium fallback) and fixed an inspector blur re-render error that failed two browser tests.
- Timeline: the timeline now extends while you scroll or zoom near the end; clips have dedicated trim handles with grips; clip, playhead and marker drags snap with a visible guide line; cross-track drags show a ghost at the landing position.
- Trims now stop at neighbouring clips and at the source media edge (TL-019 fixed). The track header has Lock, Hide, Solo (session-only) and Mute toggles with pressed state.
- Keyboard: Alt+arrows nudge a clip or move it across tracks; `[`/`]` trim to the playhead; Up/Down jump between cuts. All are listed in the shortcut sheet.
- Clips: Speed (presets 0.25x to 4x), Reverse and Freeze frame from the timeline and canvas right-click menus. All three are non-destructive and undoable and show badges; schema stays 4.

## Wave 1 combined delivery — 2026-09-23

- Integrated the owner's 26-file Claude delivery, retaining its shell and moving browser tests to the hamburger menu.
- Restored diagnostics and the development-only read-only test hook; aligned canvas hit testing with its displayed size.
- Replaced native New Project confirmation with the app dialog; Cancel and Escape retain entered settings.
- Verified corner scaling, clean console loads, project creation and persistence; full verification passed with two known timeline bugs and the intentional error-guard probe remaining expected failures.

## Wave 1 Codex modules — 2026-09-22

- Added English/Hindi translation runtime, locale formatting, persistent language choice and text-only shell wiring.
- Added the command registry, fuzzy palette, global shortcuts with typing guards and a registry-backed shortcut sheet.
- Added New Project validation and a temporary form for aspect/resolution/frame-rate presets, even custom dimensions and solid backgrounds; transparency deferred by owner.
- Retained schema 4 and existing canvas/timeline editing, playback and persistence; temporary markup awaits Claude’s shell integration.

## Wave 0 lite — 2026-09-21

- Integrated the Wave process, ledger, briefs, report template and archived Tier rules.
- Added a real-Chrome Playwright harness, automatic error guard, six baseline proofs and three expected-failure bug reproductions. Product bugs remain unfixed.
- Added a frozen development-only test hook, production hook-leak assertion, and bounded debug reports with clipboard/download support and Ctrl+Shift+D.
- Added tested ledger/patch tooling and a GitHub Actions workflow (unrun without a remote). See `reports/W0.md` for actual verification and limitations.
- Preserved schema 4, the engine, command bus, rendering, transform contracts and existing editing behavior. No other wave started.

## T3 — schema 4 baseline (captured 2026-09-19; individual change dates unrecorded)

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
