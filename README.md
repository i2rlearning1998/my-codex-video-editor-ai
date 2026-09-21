# AI-Native Video Editor

T3 baseline (schema 4), with Wave 0 proof infrastructure. Six baseline behaviors now have real-browser proof; see the ledger for the exact verified scope.

Scope and evidence now follow [AGENTS.md](AGENTS.md), the [process](docs/PROCESS.md), [Feature Ledger](docs/FEATURES.md), [decisions](docs/DECISIONS.md), and [current status](docs/STATUS.md). Historical Tier restrictions are obsolete. Known baseline bugs: locked-track deletion, right-trim overlap, and a missing favicon; Wave 0 records them without fixing them.

## Proof commands

| Command                                 | Purpose                                                             |
| --------------------------------------- | ------------------------------------------------------------------- |
| `npm run check`                         | Format check, typecheck, unit tests, build (legacy gate)            |
| `npm run e2e`                           | Playwright tests in real Chrome or Edge                             |
| `npm run e2e:headed`                    | Same with the browser visible                                       |
| `npm run e2e:report`                    | Open the HTML report                                                |
| `npm run ledger`                        | Validate the ledger against tests; `-- --summary` prints a table    |
| `npm run patch -- <base> <head> <name>` | Write the review patch and stat to reports                          |
| `npm run verify`                        | Check + e2e + production hook assertion + ledger; the complete gate |

A browser-first TypeScript editor with one engine, one canonical scene graph, and one semantic command bus. The responsive workspace includes shared multi-selection, Canvas transforms, timeline editing, elapsed-time playback, markers, and basic keyframe authoring. Media remains a labeled placeholder; playback drives composition time and visibility.

## Run locally

Use Node.js 20.6 or later and npm 10 or later. Playwright's TypeScript ESM loader needs Node's `module.register`, introduced in 20.6; the host's Node 20.5 fails to load the test configuration. Wave 0 was validated using the already-installed bundled Node 24.19.0 and npm 10.9.9. The minimum 20.6 runtime was not independently tested. No system Node upgrade was made.

On this Windows machine, use the existing bundled runtime for the current PowerShell session:

```powershell
$env:PATH = "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin;$env:PATH"
node --version
npx --yes npm@10 ci
npx --yes npm@10 run verify
```

If the default npm is still 9.x, use `npx --yes npm@10 run <script>` for the commands below. Local browser tests use installed Chrome, falling back to Edge when Chrome is absent; CI installs bundled Chromium. Browser reports, traces and screenshots are generated locally and ignored by Git.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The shell can switch compositions, select layers in the canvas or scene list, inspect local values and parent information, undo/redo existing project commands, save locally, and export/open project JSON. Click empty canvas space or press Escape with the canvas focused to clear selection. Scene-list buttons provide keyboard access, including group selection.

On first use, a labeled example project demonstrates shapes, text, rotations, and nested groups. It is ordinary validated, serializable project data owned by the same engine. Existing local projects are loaded as-is, including empty compositions. **Open example** explicitly replaces the document after confirmation; export any current work you want to keep separately.

```sh
npm run format
npm run check
```

`check` runs formatting verification, TypeScript checking, all Vitest tests, and a production build. `npm run test:watch` runs tests during development. The static build is written to `dist/`; there is no deployment setup.

## What is included

- Versioned project metadata/settings, compositions, nested layers, canonical NLE tracks/clips, typed properties, assets, markers, and explicitly reserved fields.
- Validated semantic commands for scene layers, NLE tracks/clips, properties, assets, grouping, markers, and keyframes.
- Atomic transactions, bounded snapshot history, undo/redo, typed lifecycle events, and immutable public snapshots.
- Capability declarations and namespaced command handlers that use the same validation and history path as built-in commands.
- Strict JSON serialization, migration registration/runner, and rejection of newer document versions.
- Local storage persistence with last-good backup, corrupt-data quarantine, debounced autosave, error reporting, and explicit retry.
- Frozen spatial semantics and pure affine helpers for local/world matrices, point transformation, and guarded inversion. See [TRANSFORM_CONTRACT.md](TRANSFORM_CONTRACT.md). No renderer or new UI was added in Tier 1.1; that milestone retained schema version 1.
- A desktop shell with top bar, library categories and scene list, centered composition preview, limited transform inspector, and a functional timeline projection. No extra editor modes or state-management library.
- A replaceable render adapter/Canvas 2D boundary with inherited opacity, nested affine transforms, composition clipping, selection outlines, and inverse-transform hit testing. Selection is transient UI state; it is never persisted.

## Transform controls

Drag a drawable to move it. Select a group in the Scene list to move it by dragging a descendant's body; choose a child in the list to edit it separately. Corners scale the whole selected object; scaling always preserves the original signed scale ratio, with or without Shift. Generic side handles change only the corresponding scale axis, fixing the opposite edge. The round rotation handle turns the object around its visual center with position compensation. The local geometry origin stays at `(0,0)`.

Text has distinct left/right middle width grips instead of generic edge scaling. They change box width, wrap text using the renderer's font measurements, and update box height without changing font size or scale. Text corners scale the whole box without reflow. Width editing activates the schema-1 `textWrap` boolean property; existing text keeps its previous explicit-newline layout until width is edited.

The transform inspector edits local X/Y, scale X/Y, rotation in degrees, and opacity from 0 to 1. Inspector rotation uses the same center compensation as Canvas. Enter or leaving the input commits; Escape reverts. One completed gesture or field commit is one undo operation. Cancellation and no-op never autosave. See revision 3 of [TRANSFORM_INTERACTION_CONTRACT.md](TRANSFORM_INTERACTION_CONTRACT.md) for precise conversion, modifiers, text, hit testing, and limits.

## Workspace and timeline controls

Resize either side panel or the timeline with its divider; use the top-left buttons to collapse side panels. Canvas Fit and +/− adapt its centered viewport. Layout, selection, playback, time, zoom, and scrolling are transient and never enter project history.

Click or Shift/Ctrl-click clips, Canvas objects, or Scene entries for shared selection. Drag empty Canvas or timeline space for marquee selection; Escape cancels. Multi-selection can move, duplicate, or delete together. Ancestor/descendant selections act on the selected roots once. Resize, rotation, text width, and clip trim remain single-selection operations; uniform corner scaling and center-pivot rotation are unchanged.

NLE tracks may contain multiple independent clips. Drag clip bodies to move time or move between compatible unlocked tracks, and drag either edge to trim the clip and its source range. Track controls change visibility, lock, mute metadata, and order. One completed gesture is one undo operation. Escape, capture loss, blur, or an invalidated document cancels. Snapping uses an 8 CSS pixel threshold against composition boundaries, other clips, playhead, and markers, with a temporary guide. Inspector start time and duration edit the selected clip through the command bus. Unlinked scene layers retain the earlier animation-style timing rows.

Click/drag the ruler or playhead to seek. Play/Pause advances from elapsed time at composition FPS; Stop resets to zero. Active intervals remain `[startTime, startTime + duration)` including ancestor gating; composition end shows no active layers. Timeline keyboard shortcuts: Space play/pause, arrows one frame (Shift ten), Home/End bounds, S split, Ctrl/Cmd+D duplicate, Delete/Backspace delete, +/− zoom. Ctrl/Cmd-wheel zooms around the pointer; Shift-wheel scrolls horizontally. Normal scrolling moves through rows.

Split is available strictly inside selected non-group clips and preserves editable properties and asset references. Duplicate recursively creates fresh IDs. Context menus expose only supported actions. Add a marker with + Marker, drag its flag to position it, or right-click to delete. Inspector diamond buttons add/remove a transform keyframe at current time; timeline diamonds seek to those keys. Position/scale keys capture the complete vector. These are authoring records and indicators, without interpolation or animated rendering.

Existing image/video/audio asset references in project JSON can be dragged from Library to Canvas or timeline. Canvas drops create unlinked scene layers at current time and composition coordinates. Timeline drops create a linked layer and clip on a compatible track at the exact horizontal drop time, creating the smallest compatible track when necessary. No media bytes are imported or decoded.

Schema 4 adds canonical composition tracks and clips. The explicit 3→4 migration adds an empty track array without guessing clip ownership; earlier 1→2 and 2→3 migrations remain consecutive. Composition duration is derived from NLE clip ends, unlinked layer timing, keyframes, and markers, with the established empty-project fallback. Persistence and recovery remain unchanged.

## Preview conventions

The preview consumes existing typed custom properties: positive numeric `width`/`height`, color `fill`, string `text`, and positive numeric `fontSize`. These are adapter conventions using schema-1 properties, not new schema fields. Width/height fall back independently to asset metadata, then deterministic type-specific sizes. Groups have no size. The inspector identifies properties/asset/placeholder/mixed size sources.

Shapes preview as rectangles. Text uses system-font lines with greedy width wrapping after a width edit. It retains editable string content and typed dimensions; rich text, advanced typography, and a text-content editor are not included. Image, video, and audio layers use labeled rectangles without fetching or decoding media. Hit testing uses transformed rectangles, not glyph/pixel alpha. Unsupported numerical geometry is skipped with a visible warning. The example is artwork in the project, not independent canvas state.

## Core usage

```ts
import { EditorEngine, createProject, createLayer, number } from './src/core';

const editor = new EditorEngine(createProject('My project'));
const compositionId = editor.state.compositions[0]!.id;

editor.commands.transaction('Create title', [
  {
    type: 'CREATE_LAYER',
    compositionId,
    parentId: null,
    layer: createLayer('title', 'text', 'Title'),
  },
  {
    type: 'SET_PROPERTY',
    compositionId,
    layerId: 'title',
    target: { kind: 'property', key: 'fontSize' },
    property: number(48),
  },
]);

editor.undo(); // Both commands undone together.
editor.redo();
const unsubscribe = editor.on('state:changed', ({ state }) => {
  console.log(state.metadata.name);
});
unsubscribe();
```

Factories create detached data. After constructing an engine, edit through its command bus. `state` is recursively readonly and frozen at runtime; JSON export is the portable source document, without history or plugin functions.

## Persistence and recovery

The shell saves to `ai-native-editor:project` in the current origin's local storage. `:backup` contains the previous valid save, and `:recovery` retains the first corrupt primary encountered during a subsequent save. Loading does not modify stored data. A newer schema blocks loading and saving so an older editor cannot silently downgrade it. Storage/access errors appear in the shell, where JSON export remains available. Selection, composition switching, and library navigation do not trigger autosave.

Local storage is only for development. It is size-limited and origin-specific; it is not a durable file store, multi-tab coordinator, or a place for media bytes. Export JSON to keep portable copies. Asset source references do not include the referenced media files. Autosave flushes pending edits on `pagehide`, but a forced process termination can still lose edits inside the debounce window.

## Boundaries

No media importing/decoding, audio mixing/output, transition/effect evaluation, masks, keyframe interpolation/curves, AI, 3D, cloud services, docking framework, or plugin marketplace is included. Source in/out is canonical clip metadata and is maintained by trim/split, but media evaluation is still placeholder-only. There is no automatic edge scrolling or track virtualization; extremely long timelines remain limited by browser coordinate precision. See [ARCHITECTURE.md](ARCHITECTURE.md). T3 stops here; T4 has not started.
