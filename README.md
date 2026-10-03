# AI-Native Video Editor

A browser-first video and motion-graphics editor for YouTubers and teachers, in the spirit of Canva, Clipchamp and After Effects. It has one engine, one scene graph and one command bus; the manual editor is built first (Waves 0 to 9) and AI comes last (Wave 10).

**Current state (J-series, 2026-10-03): project schema 6.** See [docs/STATUS.md](docs/STATUS.md) for the branch-by-branch state and the latest reports in [reports/](reports/). In short, the editor has:

- A Canva and Clipchamp style shell with dark and light themes, browse panels (Templates, Elements, Text, Media, Transitions, Draw), a floating context toolbar and a right panel that follows the selection.
- Scenes, each with its own background and canvas size, a scene strip and a scenes board; undo is one stack whose steps open the scene they changed.
- Shapes, gradients, drawings, signatures and on-canvas rich text editing (range styles, lists, IME) with bundled open-licence fonts (Inter, Poppins, Noto Sans Devanagari).
- Media import (stored in OPFS or IndexedDB, never in project JSON), video and audio playback in sync, keyframe animation and animation presets.
- A Clipchamp-style timeline: lanes for text and shapes, visuals and audio; drop guides; clips coloured by kind; gaps; transitions; a player bar; clip menus per kind.
- Export to MP4 (H.264 + AAC where the browser can encode it) or WebM, and PNG frames.

What exists and what is proven is defined by the [Feature Ledger](docs/FEATURES.md), not by this page. Scope and evidence follow [AGENTS.md](AGENTS.md), the [process](docs/PROCESS.md), the [decisions](docs/DECISIONS.md) and the [current status](docs/STATUS.md).

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

Open the local URL printed by Vite. On first use an example project opens; File › Open example replaces the document after confirmation.

```sh
npm run format
npm run check
```

`check` runs formatting verification, TypeScript checking, all Vitest tests, and a production build. `npm run test:watch` runs tests during development. The static build is written to `dist/`; there is no deployment setup.

## Where the details live

- Behaviour and proof, by ID: [docs/FEATURES.md](docs/FEATURES.md) (`npm run ledger -- --summary` prints the counts).
- Spatial and interaction rules: [TRANSFORM_CONTRACT.md](TRANSFORM_CONTRACT.md) and [TRANSFORM_INTERACTION_CONTRACT.md](TRANSFORM_INTERACTION_CONTRACT.md).
- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md). Undo rules: [docs/UNDO-RULES.md](docs/UNDO-RULES.md). Library content: [docs/LIBRARY.md](docs/LIBRARY.md).
- Schema versions: each change bumps the version with consecutive migrations and regression fixtures (`tests/fixtures/projects`); schema 6 adds a background per scene (D-151). A newer document is refused, never downgraded.

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

Not built yet (each is a ledger item with its wave, and its controls are greyed out with "Planned: Wave N"): effects, filters and colour adjustment (Wave 6), most transitions (Wave 6), clip volume, fades and mixing (Wave 7, with the audio engine in PR #14), captions and advanced features (Wave 8), more UI languages (Wave 9) and AI (Wave 10). Projects are stored locally only (D-013).
