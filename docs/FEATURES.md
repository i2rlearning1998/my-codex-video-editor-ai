# Feature Ledger (FEATURES.md)

This file is the **single definition of what the finished editor must do**. Everything the owner expects must appear here as a line. If it is not here, it is a *new request*, not a bug.

## How to read it

- **ID**: stable. Never renumber or reuse. E2E tests name the ID: `test('[TL-021] ...')`.
- **Pri**: `P0` must exist in the client-ready editor, `P1` should, `P2` later or nice to have. The owner sets priorities.
- **Wave**: the build wave that delivers it (map below).
- **Status** (only these words):
  - `Todo`: not built.
  - `Claimed`: earlier reports say it exists (T3), but no real-browser test proves it.
  - `Verified`: an active test whose title starts with the ID tag exists and passed in the last `npm run verify` (browser behavior needs a Playwright test; jsdom-only tests never prove user-visible behavior).
  - `Bug`: was expected to work and does not; a Playwright `test.fail('[ID] ...')` reproduction exists. When the bug is fixed that test starts failing, `verify` turns red, and the fixer converts it into a normal test and sets `Verified`.
  - `Deferred` / `Dropped`: owner decision, with a note in docs/DECISIONS.md.
- `` ``: item that Wave 0 must test against the current app to establish an honest baseline.

## Who may edit what

- **Codex** may change `Status` only: to `Verified` (with a passing test) or `Bug` (with a `test.fail` reproduction), or to `Claimed` for items built but not yet provable. Nothing else in this file except through a Ledger Change Request (see docs/PROCESS.md).
- **The owner and the Claude reviewer** add, remove, reword items and change `Pri` or `Wave`.
- New ideas found while working go to `docs/BACKLOG_INBOX.md`, never straight into scope.

## Waves

| Wave | Scope | P0 | P1 | P2 |
|---|---|---:|---:|---:|
| W0 | Process and testing harness | 10 | 0 | 0 |
| W1 | Shell v2, design system, i18n, commands, project dialogs | 60 | 21 | 4 |
| W2 | Canvas, layers, timeline, playback, inspector interaction-complete | 111 | 20 | 5 |
| W3 | Text, fonts and languages | 21 | 9 | 4 |
| W4 | Media pipeline, storage, Pixabay, AV playback | 42 | 9 | 2 |
| W5 | Animation, shapes and graphics, export v1 | 28 | 10 | 1 |
| W6 | Effects, transitions, masks, color, speed and chroma key | 21 | 18 | 3 |
| W7 | Audio engine | 9 | 7 | 2 |
| W8 | Templates, nesting, advanced tools, recording, captions | 1 | 14 | 18 |
| W9 | Hardening: export full, performance, accessibility, UI language packs | 4 | 23 | 5 |
| W10 | AI integration (last) | 0 | 0 | 13 |

**Total items: 495** (P0 307, P1 131, P2 57). Status now: see `npm run ledger` (after W2-CLAUDE: Verified 48, Claimed 38, Todo 407, Bug 1).

## DEV: Process, testing and tooling (Wave 0)

Makes every later 'done' claim provable. These items are the process itself.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| DEV-001 | P0 | W0 | Verified | Playwright e2e harness runs against the dev server in real Google Chrome or Edge (no browser download needed locally); `npm run e2e` passes |
| DEV-002 | P0 | W0 | Verified | `npm run verify` runs check + e2e + ledger validation and is the only definition of green |
| DEV-003 | P0 | W0 | Verified | Every e2e test title starts with its ledger ID in brackets; `npm run ledger` fails when a Verified item has no test or a test names an unknown ID |
| DEV-004 | P0 | W0 | Claimed | GitHub Actions workflow runs `npm run verify` on every push and pull request and uploads the Playwright report and traces |
| DEV-005 | P0 | W0 | Verified | Read-only test hook (dev/test only) exposes project and session snapshots to e2e; it cannot mutate state and is absent from production builds |
| DEV-006 | P0 | W0 | Verified | Global e2e guard fails any test that produces console errors, uncaught page errors or failed network requests |
| DEV-007 | P0 | W0 | Verified | "Copy debug report" action copies JSON: build id, browser, viewport, active composition, selection, playhead, last 30 command labels, last 50 console errors, project JSON when under 200 KB |
| DEV-008 | P0 | W4 | Verified | Media fixture pack committed under tests/fixtures/media with manifest, plus a media-populated project fixture generated through engine commands |
| DEV-009 | P0 | W0 | Verified | AGENTS.md, README, ARCHITECTURE and CHANGELOG match T3 reality; obsolete restrictions are archived, not silently deleted |
| DEV-010 | P0 | W0 | Verified | `npm run patch` creates a review patch excluding lockfile, media fixtures and specs |
| DEV-011 | P0 | W0 | Verified | Report template and try-it script convention are documented in docs/PROCESS.md and used by reports/W0.md |
| DEV-012 | P1 | W1 | Todo | Screenshot (visual snapshot) harness exists for layout regression; baselines are created from Wave 1 onward |

## APP: App shell, top bar and menus (Wave 1)

Top bar and main menu. Target look: hamburger, brand, project name, save status, undo/redo, Export, account slot.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| APP-001 | P0 | W1 | Todo | Top bar shows brand mark and product name; name/logo come from one config file so branding can be swapped in one place |
| APP-002 | P0 | W1 | Todo | Hamburger menu opens a main menu with File, Edit, View and Help groups; closes on Esc and outside click |
| APP-003 | P0 | W1 | Todo | File > New project opens the New Project dialog (see PRJ) |
| APP-004 | P0 | W1 | Claimed | File > Open project loads a project JSON file and replaces the session after validation; invalid files show a clear error and change nothing |
| APP-005 | P0 | W1 | Verified | File > Save project to file downloads the project as JSON |
| APP-006 | P1 | W1 | Todo | File > Open recent lists recently opened local projects |
| APP-007 | P1 | W1 | Todo | File > Delete local project asks for confirmation and removes it |
| APP-008 | P2 | W1 | Todo | File > Duplicate project |
| APP-009 | P0 | W1 | Todo | Edit menu lists Undo, Redo, Cut, Copy, Paste, Duplicate, Delete, Select all with live enabled/disabled state and shortcut hints |
| APP-010 | P0 | W1 | Todo | View menu toggles panels, guides, grid, snapping, theme and language |
| APP-011 | P0 | W1 | Todo | Help menu offers shortcut cheat sheet, About and Copy debug report |
| APP-012 | P0 | W1 | Todo | Project name is shown in the top bar; clicking edits it inline; Enter commits, Esc cancels; rename is undoable |
| APP-013 | P0 | W1 | Todo | Save status indicator shows Saving, Saved, Unsaved changes or Error (with retry) |
| APP-014 | P0 | W1 | Todo | Undo and Redo buttons live in the top bar, show disabled state, and their tooltip names the action to be undone or redone |
| APP-015 | P0 | W1 | Verified | Export button (primary) opens the Export dialog (see EXP) |
| APP-016 | P1 | W1 | Todo | Theme toggle switches dark and light without reload and persists |
| APP-017 | P1 | W1 | Todo | Browser tab title reflects project name and unsaved state |
| APP-018 | P1 | W1 | Todo | Closing the tab while an autosave is pending shows a warning |
| APP-019 | P1 | W1 | Todo | Opening the same project in two tabs shows a warning and prevents silent overwrite |
| APP-020 | P2 | W1 | Todo | Account and avatar slot exists in the top bar but is inert until accounts are built |

## LAY: Layout, panels and shared UI components (Wave 1)

Layout of the target UI plus the reusable component set every later feature uses.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| LAY-001 | P0 | W1 | Todo | Layout matches the approved target: left icon rail with panel, central canvas, right panel with tabs and icon rail, bottom timeline |
| LAY-002 | P0 | W1 | Todo | Left rail has Media, Graphics, Text, Templates, Audio, Elements, Transitions; each switches the left panel content |
| LAY-003 | P0 | W1 | Claimed | Left panel can be collapsed and expanded |
| LAY-004 | P0 | W1 | Claimed | Panel dividers (left, right, timeline) are draggable with min and max sizes |
| LAY-005 | P1 | W1 | Todo | Panel sizes and collapsed state persist across reloads |
| LAY-006 | P2 | W1 | Todo | Double-click a divider to reset its size |
| LAY-007 | P0 | W1 | Todo | Right panel has tabs Properties, Effects, Transitions and an icon rail Properties, Effects, Color, Audio, Speed; selection persists while switching |
| LAY-008 | P0 | W1 | Todo | Right panel can be collapsed and expanded |
| LAY-009 | P1 | W1 | Todo | Timeline height is resizable and can be maximized and restored |
| LAY-010 | P1 | W1 | Todo | Preview can go fullscreen and exit with Esc |
| LAY-011 | P2 | W1 | Todo | Layout presets (Edit, Timeline focus, Preview focus) |
| LAY-012 | P1 | W1 | Todo | View mode switch Beginner, Creator, Advanced changes only which tools are visible, never the engine or project data |
| LAY-013 | P1 | W1 | Todo | Responsive: 1440+ full layout, 1024 to 1439 collapses right panel, 768 to 1023 tablet layout, below 768 review-only mode |
| LAY-014 | P0 | W1 | Todo | No horizontal page scroll and no clipped controls at 1280x720 and 1920x1080 |
| LAY-015 | P0 | W1 | Todo | Every icon-only button has an accessible name and a tooltip that includes its shortcut |
| LAY-016 | P0 | W1 | Todo | Toast notification component (info, success, warning, error) with auto-dismiss and manual dismiss |
| LAY-017 | P0 | W1 | Todo | Modal dialog component traps focus, closes on Esc and returns focus to the trigger |
| LAY-018 | P0 | W1 | Todo | Dropdown, popover and menu components share one implementation with keyboard navigation |
| LAY-019 | P0 | W1 | Todo | Every panel has designed loading, empty and error states |
| LAY-020 | P0 | W1 | Todo | Design tokens (color, spacing, radius, type scale, elevation) live in one place; a theme swap needs no component edits |
| LAY-021 | P0 | W1 | Todo | One consistent line-icon set replaces all unicode glyph icons |
| LAY-022 | P0 | W1 | Todo | Color picker component: saturation/hue area, hex, RGB, HSL, alpha, swatches, document colors, EyeDropper where supported |
| LAY-023 | P0 | W1 | Todo | Slider, numeric scrub input, segmented control, toggle, tabs, tooltip components share one behavior spec |
| LAY-024 | P0 | W1 | Todo | Focus rings are visible on every interactive element |
| LAY-025 | P1 | W1 | Todo | Crisp rendering on high-DPI displays for icons, canvas overlays and timeline |
| LAY-026 | P0 | W1 | Todo | Drop overlay appears when files are dragged over the app and explains what will happen |

## LOC: Localization of the UI (Wave 1 infrastructure, packs later)

All UI text must be translatable from day one. Users add text in any language separately (see TXT).

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| LOC-001 | P0 | W1 | Verified | Every user-visible UI string comes from a translation key; a test fails on hard-coded literals in UI code |
| LOC-002 | P0 | W1 | Verified | Language switcher changes the UI language immediately without reload and persists the choice |
| LOC-003 | P0 | W1 | Verified | English and Hindi UI ship at launch |
| LOC-004 | P0 | W1 | Verified | Default language follows the browser language when supported, otherwise English |
| LOC-005 | P0 | W1 | Verified | Missing translation falls back to English and logs a warning in dev |
| LOC-006 | P0 | W1 | Verified | Numbers, dates, times and plurals use Intl APIs per locale |
| LOC-007 | P0 | W1 | Todo | UI font stack loads the correct script fonts for the active language |
| LOC-008 | P1 | W1 | Todo | Pseudo-locale (longer accented strings) exists for layout testing; layouts survive 40 percent longer text |
| LOC-009 | P1 | W1 | Todo | Adding a language needs one JSON file and one registry line; the process is documented |
| LOC-010 | P1 | W1 | Todo | RTL mirroring works (logical CSS properties) for Urdu, Arabic and Hebrew UI |
| LOC-011 | P1 | W9 | Todo | UI packs: Gujarati, Marathi, Bengali, Tamil, Telugu, Kannada, Malayalam, Punjabi, Odia, Urdu |
| LOC-012 | P2 | W9 | Todo | Optional native digits in timecode and numeric fields |

## KEY: Command registry, shortcuts and palette (Wave 1)

Single registry of user commands. Shortcuts, menus, palette and context menus all use it.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| KEY-001 | P0 | W1 | Verified | Central command registry: each user action has an ID, translated label, shortcut, enabled predicate and handler that goes through the Command Bus |
| KEY-002 | P0 | W1 | Verified | Command palette (Ctrl+K) with fuzzy search, shows shortcuts, runs the command, closes on Esc |
| KEY-003 | P0 | W1 | Verified | Global Undo Ctrl+Z and Redo Ctrl+Shift+Z or Ctrl+Y work regardless of which panel has focus (not only the timeline) |
| KEY-004 | P0 | W1 | Todo | Global Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+D, Delete or Backspace, Ctrl+A act on the current selection |
| KEY-005 | P0 | W1 | Verified | Ctrl+S saves the project (and suppresses the browser save dialog) |
| KEY-006 | P0 | W1 | Verified | Space toggles play and pause everywhere except while typing |
| KEY-007 | P0 | W1 | Verified | Shortcuts never fire while typing in inputs, text areas or contenteditable |
| KEY-008 | P0 | W1 | Verified | Shortcut cheat sheet dialog (Ctrl+/ or ?) |
| KEY-009 | P0 | W1 | Verified | Esc cancels the current gesture first, then closes the top popover, then deselects |
| KEY-010 | P0 | W1 | Todo | Ctrl+G groups and Ctrl+Shift+G ungroups the selection |
| KEY-011 | P0 | W1 | Todo | Left and Right step one frame; Shift+Left and Shift+Right step one second; Home and End jump to start and end |
| KEY-012 | P1 | W1 | Todo | J K L shuttle playback, I and O set in and out points |
| KEY-013 | P1 | W1 | Todo | Shortcut customization: rebind, conflict detection, reset to defaults, persisted |
| KEY-014 | P1 | W1 | Todo | Cmd equivalents on macOS |
| KEY-015 | P1 | W1 | Todo | Tool shortcuts: V select, T text, R rectangle, E ellipse |
| KEY-016 | P1 | W1 | Todo | Bring forward and send backward shortcuts (Ctrl+] and Ctrl+[) |

## PRJ: Projects, scenes and composition settings

Project lifecycle, aspect ratios, scenes. Wave 1 for dialogs and settings; Wave 4 when durable storage lands.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| PRJ-001 | P0 | W1 | Verified | New project dialog: name, aspect ratio, resolution, frame rate, background |
| PRJ-002 | P0 | W1 | Verified | Aspect ratio presets: 16:9, 9:16, 1:1, 4:5, 2:3, 21:9, 4:3 and custom |
| PRJ-003 | P0 | W1 | Verified | Resolution presets per aspect ratio (720p, 1080p, 1440p, 4K equivalents) |
| PRJ-004 | P0 | W1 | Verified | Custom width and height; enforced even numbers for H.264; sane min and max |
| PRJ-005 | P0 | W1 | Verified | Frame rate options 24, 25, 30, 50, 60 |
| PRJ-006 | P0 | W1 | Claimed | Project background: solid color or transparent |
| PRJ-007 | P0 | W1 | Todo | Changing aspect ratio of an existing project keeps layers inside the canvas with a chosen behavior (keep position, scale to fit) |
| PRJ-008 | P0 | W1 | Todo | Project settings dialog edits resolution, fps and background; changes are undoable |
| PRJ-009 | P0 | W1 | Claimed | Autosave keeps work across reload (recovery from unexpected close within the autosave window) |
| PRJ-010 | P0 | W1 | Claimed | Corrupt or future-version saved data is quarantined with a message, never silently overwritten |
| PRJ-011 | P0 | W1 | Todo | Composition (scene) duration is derived from content; empty composition falls back to 10 seconds |
| PRJ-012 | P0 | W2 | Verified | Multiple compositions (scenes): switch active composition |
| PRJ-013 | P0 | W2 | Todo | Scenes: add, rename, reorder, duplicate, delete |
| PRJ-014 | P1 | W2 | Todo | Scene strip UI for switching and reordering scenes |
| PRJ-015 | P0 | W4 | Todo | Projects persist in IndexedDB with media in OPFS; localStorage remains only for small settings |
| PRJ-016 | P0 | W4 | Todo | Home screen lists projects with thumbnail, last edited; open, rename, duplicate, delete |
| PRJ-017 | P0 | W4 | Todo | Crash recovery dialog offers to restore the last autosave and shows its time |
| PRJ-018 | P1 | W8 | Todo | Named version snapshots with restore |
| PRJ-019 | P1 | W9 | Todo | Project package export and import including media (single file) |

## MED: Media library and stock (Wave 4)

Import, storage, thumbnails, waveforms, Pixabay stock. Needs the media pipeline architecture decision in DECISIONS.md.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| MED-001 | P0 | W4 | Verified | Import button opens the file picker for video, audio and image files |
| MED-002 | P0 | W4 | Verified | Drag files from the OS onto the app or the media panel to import |
| MED-003 | P0 | W4 | Claimed | Supported: MP4 H.264, WebM VP9, MOV where the browser can decode, MP3, WAV, M4A, OGG, PNG, JPG, WebP, GIF, SVG; unsupported files get a clear message, never a crash |
| MED-004 | P0 | W4 | Verified | Import shows progress and can be cancelled |
| MED-005 | P0 | W4 | Todo | Multi-GB files are streamed from OPFS or Blob storage, never fully loaded into memory |
| MED-006 | P0 | W4 | Verified | Imported media survives reload; project stores references only, never media bytes |
| MED-007 | P0 | W4 | Verified | Project Media grid shows thumbnail, name, duration or type badge |
| MED-008 | P1 | W4 | Todo | List and grid view, sort by name, date, type, duration; filter by type |
| MED-009 | P0 | W4 | Verified | Search box filters media by name |
| MED-010 | P1 | W4 | Todo | Rename an asset |
| MED-011 | P0 | W4 | Todo | Delete an asset warns when it is used by N clips and offers cancel |
| MED-012 | P1 | W4 | Todo | Hover-scrub preview on video thumbnails |
| MED-013 | P0 | W4 | Verified | Drag an asset onto a timeline track creates a clip at the drop position |
| MED-014 | P0 | W4 | Verified | Drag an already-registered asset onto a compatible track creates a clip; a locked or incompatible track rejects it with feedback |
| MED-015 | P0 | W4 | Verified | Drag an asset onto the canvas creates a layer at the drop point |
| MED-016 | P0 | W4 | Todo | Double-click an asset adds it at the playhead |
| MED-017 | P0 | W4 | Todo | Asset details show resolution, fps, duration, codec, size, audio channels |
| MED-018 | P0 | W4 | Verified | Thumbnails and poster frames are generated asynchronously and cached |
| MED-019 | P0 | W4 | Verified | Audio waveforms are generated asynchronously and cached |
| MED-020 | P0 | W4 | Todo | Missing media shows a clear indicator and a Relink flow |
| MED-021 | P0 | W4 | Todo | Variable-frame-rate video plays and seeks with correct timing (fixture: video_vfr_720p_no_audio.mp4) |
| MED-022 | P0 | W4 | Todo | Rotation metadata is applied (fixture: video_rotation90_metadata_portrait_no_audio.mp4 displays upright portrait) |
| MED-023 | P0 | W4 | Verified | Image EXIF orientation is applied (fixture: image_exif_orientation6_1600x1200.jpg) |
| MED-024 | P0 | W4 | Verified | Alpha channel is preserved for PNG and alpha WebM (fixtures: image_alpha_logo_512.png, video_alpha_circle_vp9.webm) |
| MED-025 | P2 | W4 | Todo | Duplicate import detection by content hash |
| MED-026 | P2 | W8 | Todo | Media folders and tags |
| MED-027 | P1 | W9 | Todo | Proxy generation for heavy 4K media with automatic switch on export |
| MED-028 | P0 | W4 | Todo | Stock tab: Pixabay image search with grid, infinite scroll and attribution |
| MED-029 | P0 | W4 | Todo | Stock tab: Pixabay video search |
| MED-030 | P0 | W4 | Todo | Stock item preview, and Add downloads it into project media |
| MED-031 | P0 | W4 | Todo | Pixabay key is read from .env.local, never committed; errors and rate limits show friendly messages; Pixabay attribution and caching terms are followed |
| MED-032 | P1 | W4 | Todo | Stock filters (orientation, category, color) |
| MED-033 | P2 | W4 | Todo | Stock favorites and recents |
| MED-034 | P1 | W8 | Todo | Record screen, webcam and microphone (voiceover lives in AUD) |
| MED-035 | P0 | W4 | Verified | The Media tab (Project Media) lists the project's registered media as draggable cards; today the cards appear only under other library categories because the Media tab hides the panel that holds them |

## CV: Canvas (Wave 2)

Everything the user does directly on the preview canvas.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| CV-001 | P0 | W2 | Verified | Clicking a layer selects it; clicking empty canvas deselects |
| CV-002 | P0 | W2 | Verified | Shift or Ctrl click toggles a layer in the multi-selection |
| CV-003 | P0 | W2 | Verified | Marquee drag on empty canvas selects the layers it touches |
| CV-004 | P0 | W2 | Verified | Dragging a selected layer moves it and produces exactly one undo step |
| CV-005 | P0 | W2 | Todo | Holding Shift while dragging constrains to the axis; Alt-drag duplicates |
| CV-006 | P0 | W2 | Verified | Arrow keys nudge selection by 1 px, Shift+Arrow by 10 px |
| CV-007 | P0 | W2 | Verified | Corner handle drag resizes proportionally; the opposite corner stays fixed |
| CV-008 | P0 | W2 | Verified | Edge handle drag resizes on one axis; Alt resizes from center |
| CV-009 | P0 | W2 | Verified | Rotation handle rotates around the visual center |
| CV-010 | P0 | W2 | Todo | Shift while rotating snaps to 15 degree steps |
| CV-011 | P0 | W2 | Verified | Text-width grips change text box width and reflow the text without changing font size |
| CV-012 | P1 | W2 | Todo | Live readout of size, angle or position while dragging |
| CV-013 | P0 | W2 | Verified | Smart guides and snapping to canvas center and edges, other layers and safe margins, with visible guide lines |
| CV-014 | P1 | W2 | Todo | Grid and rulers toggles; drag user guides from the rulers |
| CV-015 | P1 | W2 | Todo | Safe-area overlays including 9:16 social UI zones |
| CV-016 | P0 | W2 | Verified | Zoom controls: Fit, plus and minus change the canvas view scale |
| CV-017 | P0 | W2 | Todo | Zoom dropdown presets (Fit, Fill, 25 to 400 percent, 100 percent actual pixels), Ctrl+wheel and Ctrl +/- and Ctrl+0 |
| CV-018 | P0 | W2 | Todo | Pan with Space+drag, middle mouse or trackpad scroll when zoomed in |
| CV-019 | P1 | W2 | Todo | Checkerboard background toggle for transparency |
| CV-020 | P0 | W2 | Todo | Right-click a layer opens a menu: Cut, Copy, Paste, Duplicate, Delete, Group, Ungroup, Bring forward, Send backward, Bring to front, Send to back, Lock, Hide, Rename, Flip horizontal, Flip vertical, Align |
| CV-021 | P0 | W2 | Todo | Right-click empty canvas opens a menu: Paste, Select all, toggle grid and guides |
| CV-022 | P0 | W2 | Verified | Clicking inside a group selects the group; double-click selects the child; Esc exits |
| CV-023 | P1 | W2 | Todo | Double-click a group enters isolation mode |
| CV-024 | P0 | W2 | Todo | Locked layers cannot be moved or resized from the canvas; hidden layers are neither drawn nor selectable |
| CV-025 | P0 | W2 | Verified | Align and distribute: left, center, right, top, middle, bottom, distribute horizontal and vertical, relative to canvas or selection |
| CV-026 | P0 | W2 | Todo | Order commands: bring to front, forward, backward, to back |
| CV-027 | P0 | W2 | Todo | Quick flip horizontal and vertical, rotate 90 degrees |
| CV-028 | P1 | W2 | Todo | Paste places at same position with small offset; pasting an image from the OS clipboard imports it |
| CV-029 | P0 | W2 | Todo | Cursor changes correctly over move, resize (per handle angle) and rotate handles |
| CV-030 | P0 | W2 | Todo | Selection outlines and handles keep constant on-screen thickness at any zoom |
| CV-031 | P0 | W2 | Verified | Layers are drawn only inside their active time range |
| CV-032 | P1 | W2 | Todo | 100 layers can be dragged smoothly without dropped frames on the reference machine |
| CV-033 | P1 | W2 | Todo | Preview quality setting Full, Half, Quarter |
| CV-034 | P2 | W2 | Todo | Touch and pen input work with pointer events |
| CV-035 | P0 | W2 | Verified | A context toolbar above the canvas appears for one selected text, image, video, shape or drawing layer, with controls for that type; it hides for no selection, groups, audio layers and multi-selections |
| CV-036 | P0 | W2 | Verified | Image and video toolbar: Position X and Y, Scale, Rotate, Flip horizontal and vertical, and Opacity edit the layer as one undo step each; Crop, Blend and Replace show disabled with a tooltip naming the wave that builds them; Animate opens the animation presets |
| CV-037 | P0 | W2 | Verified | Text toolbar: Size and Color edit the layer as one undo step each; Font, Weight, Align, Spacing and Effects show disabled with a tooltip naming their wave; Animate opens the animation presets |
| CV-038 | P0 | W2 | Verified | Shape toolbar: Fill edits the layer; Stroke, Width, Corners and Boolean show disabled with a tooltip naming their wave; Animate opens the animation presets. A drawing's toolbar edits its Color, Brush size and Opacity |
| CV-039 | P0 | W2 | Verified | Right-click Copy style and Paste style (also in the palette) copy opacity, color, text size and brush size from one layer and apply the compatible ones to every selected layer in one undo step |

## LYR: Layers panel (Wave 2)

Scene Graph tree as the user sees it. Today it is the Scene list.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| LYR-001 | P0 | W2 | Verified | Clicking a layer in the list selects it on canvas and in the timeline; selecting elsewhere highlights it in the list |
| LYR-002 | P0 | W2 | Verified | Layer list shows layers and groups in stacking order |
| LYR-003 | P0 | W2 | Todo | Shift and Ctrl click multi-select in the list |
| LYR-004 | P0 | W2 | Todo | Drag to reorder layers, into groups and out of groups |
| LYR-005 | P0 | W2 | Todo | Rename by double-click or F2 |
| LYR-006 | P0 | W2 | Todo | Visibility (eye) and lock toggles per layer |
| LYR-007 | P0 | W2 | Todo | Expand and collapse groups |
| LYR-008 | P0 | W2 | Todo | Type icons for text, shape, image, video, audio, group |
| LYR-009 | P1 | W2 | Todo | Thumbnails per layer |
| LYR-010 | P1 | W2 | Todo | Search and filter layers |
| LYR-011 | P0 | W2 | Todo | Right-click menu: Duplicate, Delete, Group, Ungroup, Rename, Lock, Hide, Copy, Paste, Select same type |
| LYR-012 | P0 | W2 | Todo | Group and Ungroup available from UI and shortcut |
| LYR-013 | P1 | W2 | Todo | Arrow-key navigation in the list |
| LYR-014 | P2 | W2 | Todo | Solo (isolate) a layer |
| LYR-015 | P2 | W2 | Todo | Layer color labels |

## TL: Timeline (Wave 2 interactions; media visuals in Wave 4; animation in Wave 5)

Tracks, clips, ruler, playhead and every editing gesture. Track headers follow the target: drag handle, type icon, name, lock, eye.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| TL-001 | P0 | W2 | Verified | Timeline uses one row model: every layer appears as a clip on a track (no separate legacy layer rows) |
| TL-002 | P0 | W2 | Todo | Add track (video, audio, text/graphics, overlay) from the + control and the track menu; dropping below the last track auto-creates a compatible track |
| TL-003 | P0 | W2 | Todo | Track header shows drag handle, type icon, editable name, lock and eye (visibility); audio tracks also show mute and solo |
| TL-004 | P0 | W2 | Verified | Locking a track blocks every edit path to its clips (drag, trim, split, delete, keyboard, ripple) with visible feedback |
| TL-005 | P0 | W2 | Todo | Reorder tracks by dragging the handle |
| TL-006 | P0 | W2 | Todo | Delete a track warns when it contains clips; Duplicate track |
| TL-007 | P1 | W2 | Todo | Track height presets (compact, normal, large) and drag to resize |
| TL-008 | P0 | W2 | Todo | Ruler shows mm:ss (hh:mm:ss when long) with frame ticks at high zoom |
| TL-009 | P0 | W2 | Verified | Clicking or dragging the ruler moves the playhead; the canvas shows that time live |
| TL-010 | P0 | W2 | Todo | Playhead line spans all tracks, has a draggable handle and snaps to clip edges and markers |
| TL-011 | P0 | W2 | Todo | Timecode display is editable: click, type a time, Enter to jump |
| TL-012 | P0 | W2 | Verified | Timeline zoom-in and zoom-out buttons change the horizontal time scale |
| TL-013 | P0 | W2 | Todo | Timeline zoom slider, Fit-all, zoom to selection, and Ctrl+wheel zoom around the cursor |
| TL-014 | P0 | W2 | Verified | Horizontal scroll with wheel, Shift+wheel and trackpad; vertical scroll keeps headers aligned with rows |
| TL-015 | P0 | W2 | Todo | Auto-scroll near the edges while dragging clips; option to follow the playhead during playback |
| TL-016 | P0 | W2 | Verified | Clips can be moved by dragging within a track and across tracks, with one undo step per gesture |
| TL-017 | P0 | W2 | Verified | Multi-selected clips move together and keep their relative offsets across tracks |
| TL-018 | P0 | W2 | Verified | Trimming the left edge changes start and in-point and never goes past the source or into a neighbor |
| TL-019 | P0 | W2 | Verified | Trimming the right edge changes duration and never goes past the source or into a neighbor |
| TL-020 | P0 | W2 | Verified | Clips never overlap on the same track and never shrink below one frame |
| TL-021 | P0 | W2 | Verified | Split at the playhead (Split button and S key) cuts the selected clip into two at that time |
| TL-022 | P0 | W2 | Todo | With no clip selected, Split cuts every unlocked clip under the playhead |
| TL-023 | P0 | W2 | Verified | Duplicate (Ctrl+D or button) creates an independent copy of the selected clip |
| TL-024 | P0 | W2 | Todo | Alt-drag copies clips while dragging |
| TL-025 | P0 | W2 | Verified | Delete key removes the selected clips with one undo step |
| TL-026 | P0 | W2 | Todo | Ripple delete removes clips and closes the gap |
| TL-027 | P0 | W2 | Verified | Copy, cut and paste clips at the playhead onto the selected track |
| TL-028 | P0 | W2 | Verified | Snapping to playhead, clip edges, markers and grid with a visible snap line |
| TL-029 | P0 | W2 | Todo | Snap toggle (magnet) in the toolbar, on by default |
| TL-030 | P0 | W2 | Verified | Insert versus overwrite rule for dropping or moving onto occupied space is explicit and shown to the user |
| TL-031 | P1 | W2 | Todo | Ripple trim; slip, slide and roll edits |
| TL-032 | P0 | W2 | Verified | Link video and its audio so they move and cut together; Unlink and Detach audio |
| TL-033 | P1 | W2 | Todo | Disable an individual clip without deleting it |
| TL-034 | P2 | W2 | Todo | Clip color labels |
| TL-035 | P0 | W2 | Verified | The Marker button adds a marker at the playhead |
| TL-036 | P0 | W2 | Todo | The M key adds a marker at the playhead |
| TL-037 | P0 | W2 | Todo | Markers: rename, color, delete, jump to next or previous, list |
| TL-038 | P1 | W2 | Todo | In and out range markers define a work area for preview and export |
| TL-039 | P0 | W2 | Todo | Right-click a clip: Cut, Copy, Paste, Duplicate, Delete, Ripple delete, Split, Detach audio, Speed, Replace media, Disable, Properties, Reveal in media panel |
| TL-040 | P0 | W2 | Todo | Right-click a track header: Add track above or below, Rename, Delete, Height, Lock all, Mute all |
| TL-041 | P0 | W2 | Todo | Right-click empty timeline area: Paste, Add track; right-click ruler: Add marker, Clear markers, Set in or out |
| TL-042 | P0 | W2 | Todo | Toolbar: Split, Delete, Duplicate, Snap, zoom slider, and overflow menu, matching the target |
| TL-043 | P0 | W2 | Todo | Empty timeline shows a helpful drop message |
| TL-044 | P0 | W2 | Verified | Jump to previous or next cut (Up and Down keys) |
| TL-045 | P0 | W2 | Todo | Clip label truncates gracefully and never overlaps neighbors at any zoom |
| TL-046 | P0 | W4 | Verified | Video clips show a filmstrip of thumbnails; image clips show their thumbnail |
| TL-047 | P0 | W4 | Verified | Audio clips show waveforms that stay correct while trimming |
| TL-048 | P0 | W5 | Todo | Keyframe diamonds appear on clips; add, move, copy and delete keyframes directly on the timeline |
| TL-049 | P0 | W5 | Todo | Fade in and fade out handles on clips for opacity and volume |
| TL-050 | P1 | W5 | Todo | Envelope line (opacity or volume) is drawn on the clip and editable |
| TL-051 | P0 | W6 | Todo | Drag a transition between two adjacent clips; the handle adjusts duration |
| TL-052 | P1 | W8 | Todo | Compound clip (nested composition) shows a badge and can be entered |
| TL-053 | P1 | W9 | Todo | 200 clips scroll and zoom smoothly (virtualized rows) on the reference machine |
| TL-054 | P2 | W9 | Todo | Timeline scroll and zoom are remembered per composition |
| TL-055 | P0 | W2 | Verified | Infinite timeline: the ruler and track area always extend past the content end and keep extending while the user scrolls or zooms out near the end (no fixed content-length ceiling); the playhead still stops at the content end |
| TL-056 | P0 | W2 | Verified | Every clip has dedicated left and right trim handles with a hit area of at least 8 CSS pixels, a resize cursor and a visible grip on hover or selection; the clip body keeps the move cursor |
| TL-057 | P0 | W2 | Verified | While moving or trimming a clip, dragging the playhead or dragging a marker, edges snap within 8 CSS pixels to clip edges, the playhead and markers, and a visible snap-guide line spans the ruler and all tracks at the snapped time |
| TL-058 | P0 | W2 | Verified | Dragging a clip onto another compatible track shows a ghost of the clip at its landing track and time while the original stays dimmed in place; releasing commits exactly the ghost position in one undo step; Escape cancels |
| TL-059 | P0 | W2 | Verified | Track header has Lock, Hide, Solo and Mute icon buttons with accessible names, tooltips and a distinct pressed state; Solo previews only soloed tracks (session-only, not saved, no history) |
| TL-060 | P0 | W2 | Verified | Keyboard equivalents for timeline gestures, listed in the shortcut sheet: Alt+Left/Right nudge selected clips one frame (Shift for ten), Alt+Up/Down move them to the adjacent compatible track, [ and ] trim the selected clip start or end to the playhead |

## PB: Playback and transport

Play controls, timecode, loop, sync. Audio-video sync arrives with the media pipeline.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| PB-001 | P0 | W2 | Verified | The Play button advances the playhead in real time and the Stop button stops it |
| PB-002 | P0 | W2 | Verified | Playback uses elapsed wall-clock time so speed is correct even when frames are dropped |
| PB-003 | P0 | W2 | Todo | Step one frame backward and forward with buttons and arrow keys |
| PB-004 | P0 | W2 | Todo | Jump to start, jump to end, previous and next cut |
| PB-005 | P0 | W2 | Todo | Timecode shows current and total time as mm:ss.ff; clean formatting everywhere (no raw floating-point numbers in the UI) |
| PB-006 | P0 | W2 | Todo | Loop toggle and loop of the in-out range |
| PB-007 | P1 | W2 | Todo | Preview playback speed selector 0.25x to 2x |
| PB-008 | P0 | W2 | Todo | Time is one shared source: canvas, timeline, inspector and timecode always agree |
| PB-009 | P0 | W4 | Verified | Video decoding keeps up with playback; frames drop rather than slow motion; a buffering indicator appears when needed |
| PB-010 | P0 | W4 | Verified | Audio plays in sync with video within one frame (fixture: video_av_sync_flash_beep_720p.mp4) |
| PB-011 | P1 | W4 | Verified | Scrubbing the playhead plays short audio snippets |
| PB-012 | P0 | W4 | Todo | 1080p 30 fps H.264 plays back with at least 95 percent of frames on the reference machine |
| PB-013 | P1 | W7 | Todo | Master volume and mute with a level meter |
| PB-014 | P1 | W2 | Todo | Fullscreen playback with minimal controls |

## INS: Inspector and properties panel

Right panel. Sections depend on the selection. Every edit uses the same command path as the canvas.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| INS-001 | P0 | W2 | Todo | Properties panel content depends on selection: none (project settings), single layer by type, multiple layers (common properties), group |
| INS-002 | P0 | W2 | Verified | Editing Position X in the inspector moves the layer on the canvas and creates one undo step |
| INS-003 | P0 | W2 | Verified | Position Y, scale, rotation and opacity fields edit the layer and stay in sync with canvas gestures |
| INS-004 | P0 | W2 | Todo | Uniform scale with a lock toggle plus separate width and height |
| INS-005 | P0 | W2 | Todo | Anchor point control |
| INS-006 | P0 | W2 | Todo | Numeric inputs: scrub by dragging the label, arrow keys step, Shift steps by 10, invalid input reverts, Enter commits, Esc cancels |
| INS-007 | P0 | W2 | Todo | Sliders paired with numeric fields for opacity, rotation and scale |
| INS-008 | P0 | W2 | Todo | Reset button per property |
| INS-009 | P0 | W2 | Verified | Keyframe diamond per animatable property toggles a keyframe |
| INS-010 | P0 | W2 | Verified | Timing section: start time and duration of the selected item |
| INS-011 | P0 | W2 | Todo | Layer name is editable |
| INS-012 | P0 | W2 | Todo | Multi-selection shows mixed values as a dash; editing applies to all in one undo step |
| INS-013 | P0 | W2 | Todo | Values update live during playback and scrubbing |
| INS-014 | P0 | W2 | Todo | When nothing is selected the panel shows composition size, fps, background and duration |
| INS-015 | P1 | W2 | Todo | Sections are collapsible and remember their state |
| INS-016 | P0 | W4 | Todo | Media section: source details, replace media, loop, fit mode (Fit, Fill, Stretch, Custom) |
| INS-017 | P2 | W2 | Todo | Copy and paste properties between layers |

## HIS: Undo, redo and history

The engine already has atomic transactions and history; this covers what the user sees.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| HIS-001 | P0 | W2 | Verified | Undo and Redo buttons reverse and reapply the last action, including a full drag gesture as one step |
| HIS-002 | P0 | W2 | Verified | Every user edit is undoable: canvas gestures, inspector edits, timeline edits |
| HIS-003 | P0 | W2 | Todo | Undo and Redo buttons show correct enabled state and name the next action |
| HIS-004 | P0 | W2 | Verified | History is memory-bounded and never crashes on long sessions |
| HIS-005 | P1 | W2 | Todo | History panel lists steps with labels and jumps to any step |
| HIS-006 | P1 | W8 | Todo | Named checkpoints |
| HIS-007 | P1 | W4 | Todo | Undoing media import removes the clip without deleting the imported asset (behavior is documented) |

## TXT: Text, fonts and languages (Wave 3)

Users must be able to type text in any language and choose from very many fonts, like Canva. Preview and export must match.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| TXT-001 | P0 | W3 | Todo | Text panel offers Heading, Subheading and Body plus styled text presets; click adds to canvas at the playhead |
| TXT-002 | P0 | W3 | Todo | Text tool: click to create a text box at that point, or drag to define a box |
| TXT-003 | P0 | W3 | Todo | Double-click a text layer edits it inline on the canvas with caret, selection, copy and paste |
| TXT-004 | P0 | W3 | Todo | System input methods (IME) work while editing, including Hindi and other Indic phonetic keyboards and CJK composition |
| TXT-005 | P0 | W3 | Todo | Text content can also be edited in the inspector |
| TXT-006 | P0 | W3 | Todo | Font picker: searchable list, each font shown in its own typeface, recent and favorite fonts, categories |
| TXT-007 | P0 | W3 | Todo | Bundled curated fonts work offline; the wider Google Fonts catalog loads on demand and is cached |
| TXT-008 | P0 | W3 | Todo | Font picker can filter by script or language: Latin, Devanagari, Gujarati, Bengali, Tamil, Telugu, Kannada, Malayalam, Gurmukhi, Odia, Arabic, Hebrew, Thai, CJK, Cyrillic, Greek |
| TXT-009 | P0 | W3 | Todo | Users can upload their own .ttf, .otf, .woff and .woff2 fonts; they are stored with the project |
| TXT-010 | P1 | W3 | Todo | Weight and style choices reflect what the font offers; variable font axes are adjustable |
| TXT-011 | P0 | W3 | Todo | Size numeric field and slider; auto-fit text to box option |
| TXT-012 | P0 | W3 | Todo | Text color; solid fill first, gradient fill later |
| TXT-013 | P1 | W3 | Todo | Gradient text fill |
| TXT-014 | P0 | W3 | Todo | Alignment left, center, right, justify |
| TXT-015 | P1 | W3 | Todo | Vertical alignment inside the box |
| TXT-016 | P0 | W3 | Todo | Line height, letter spacing and paragraph spacing |
| TXT-017 | P1 | W3 | Todo | Text case transform: UPPER, lower, Title |
| TXT-018 | P0 | W3 | Claimed | Text box modes: auto width, fixed width with auto height, fixed box |
| TXT-019 | P0 | W3 | Todo | Outline (stroke) and drop shadow on text |
| TXT-020 | P1 | W3 | Todo | Background box, highlight, glow |
| TXT-021 | P2 | W3 | Todo | Curved text on a path |
| TXT-022 | P1 | W3 | Todo | Text style presets (neon, outlined, retro and similar) with one-click apply |
| TXT-023 | P1 | W3 | Todo | Range styling: bold, italic, underline, strike, color, size, font for selected characters |
| TXT-024 | P2 | W3 | Todo | Bulleted and numbered lists |
| TXT-025 | P0 | W3 | Todo | Correct shaping of complex scripts: Devanagari conjuncts and matras, other Indic scripts, Arabic joining (fixture: text_multilingual_samples.json) |
| TXT-026 | P0 | W3 | Todo | Right-to-left and mixed bidirectional text render and edit correctly |
| TXT-027 | P0 | W3 | Todo | Line breaking follows language rules (Intl.Segmenter) including Thai, CJK and Indic text |
| TXT-028 | P0 | W3 | Todo | A fallback font chain per script guarantees no missing-glyph boxes |
| TXT-029 | P1 | W3 | Todo | Color emoji render correctly |
| TXT-030 | P0 | W3 | Todo | Text layout waits for its fonts to load; export never uses a fallback by accident |
| TXT-031 | P0 | W3 | Todo | Preview and export render text identically (same engine, same fonts) |
| TXT-032 | P1 | W3 | Todo | Project keeps a font list with licenses and warns when a font is unavailable |
| TXT-033 | P2 | W3 | Todo | Find and replace text across the project |
| TXT-034 | P2 | W3 | Todo | Spellcheck while editing |
| TXT-035 | P1 | W8 | Todo | Captions: manual caption track, import SRT and VTT, style presets, burn-in on export |

## SHP: Shapes, graphics and elements (Wave 5)

Vector shapes, stickers, icons, backgrounds and image styling.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| SHP-001 | P0 | W5 | Todo | Shape tools: rectangle, rounded rectangle, ellipse, line, arrow |
| SHP-002 | P1 | W5 | Todo | More shapes: triangle, polygon, star, heart and similar |
| SHP-003 | P0 | W5 | Todo | Fill: solid color with opacity, none |
| SHP-004 | P1 | W5 | Todo | Fill: linear and radial gradient |
| SHP-005 | P0 | W5 | Todo | Stroke: color, width, dash style, caps and joins |
| SHP-006 | P0 | W5 | Todo | Corner radius control on rectangles |
| SHP-007 | P1 | W5 | Todo | Drop shadow and blur on shapes |
| SHP-008 | P1 | W5 | Todo | SVG import as an editable vector layer |
| SHP-009 | P0 | W5 | Todo | Elements panel: shapes, lines, frames, arrows, emoji and stickers, open-license icons |
| SHP-010 | P1 | W5 | Todo | Frames: drop an image into a frame shape |
| SHP-011 | P0 | W5 | Todo | Image layer styling: crop, flip, corner radius, border, shadow |
| SHP-012 | P1 | W5 | Todo | Animated GIF, APNG and WebP stickers |
| SHP-013 | P0 | W5 | Todo | Backgrounds: solid color and gradient background layers |
| SHP-014 | P1 | W5 | Todo | Logo or watermark quick-add with corner placement presets |
| SHP-015 | P2 | W5 | Todo | Freehand pen and boolean shape operations |
| SHP-016 | P2 | W8 | Todo | Data charts (bar, line, pie) from typed or pasted data |
| SHP-017 | P2 | W8 | Todo | Lottie import |
| SHP-018 | P0 | W2 | Verified | A Draw category in the left rail offers Pen, Marker and Highlighter with brush size, color and opacity; choosing a brush puts the canvas in draw mode, and Esc, V or another category leaves it |
| SHP-019 | P0 | W2 | Verified | Each freehand stroke becomes one undoable shape layer with a clip at the playhead; it can be selected, moved, resized, saved and reloaded, and draws the same in preview and export |

## ANI: Animation and keyframes (Wave 5; graph editor Wave 8)

Preview and export must evaluate animation with the same code.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| ANI-001 | P0 | W5 | Verified | Every animatable property has a stopwatch: position, scale, rotation, opacity, color (text and shape fill, drawing stroke) and text size; anchor and effect parameters get one when those properties exist (ADV and FX waves) |
| ANI-002 | P0 | W5 | Verified | Interpolation: linear, ease in, ease out, ease in-out, hold and custom cubic-bezier |
| ANI-003 | P0 | W5 | Verified | Playback and export evaluate interpolated values; preview matches export |
| ANI-004 | P0 | W5 | Verified | Keyframes can be moved, copied, pasted, duplicated and deleted, single and multiple, in inspector and timeline |
| ANI-005 | P0 | W5 | Verified | Previous and next keyframe navigation; a marker shows when the playhead is on a keyframe |
| ANI-006 | P0 | W5 | Verified | Auto-keyframe: when a property has a stopwatch on, changes at the playhead create keyframes |
| ANI-007 | P0 | W5 | Verified | Animation presets: in (fade, slide, zoom, pop, wipe, typewriter), out, and loop (pulse, float, spin, wiggle) apply in one click with adjustable duration |
| ANI-008 | P0 | W5 | Verified | Ken Burns pan and zoom in one click for images |
| ANI-009 | P0 | W5 | Verified | Child layers follow parent transforms and inherit opacity during animation |
| ANI-010 | P0 | W5 | Verified | Easing preset library with visual previews |
| ANI-011 | P1 | W5 | Todo | Motion path drawn on the canvas with bezier handles |
| ANI-012 | P1 | W5 | Todo | Text animation per character, word or line with stagger |
| ANI-013 | P1 | W8 | Todo | Graph editor: value and speed curves, bezier handles per property |
| ANI-014 | P1 | W6 | Todo | Time remapping and speed ramps |
| ANI-015 | P1 | W8 | Todo | 2D virtual camera layer (pan, zoom, rotate) |
| ANI-016 | P2 | W8 | Todo | Safe expressions (no arbitrary JavaScript) such as wiggle, loop, link |
| ANI-017 | P2 | W8 | Todo | Copy and paste keyframes between layers |
| ANI-018 | P2 | W8 | Todo | Path trim (draw-on) animation |
| ANI-019 | P2 | W8 | Todo | Particle emitters |

## VID: Video and image clip operations

Operations on media clips. Speed, freeze and chroma key are Wave 6.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| VID-001 | P0 | W4 | Verified | Video clips can be trimmed and split with frame-exact seeking |
| VID-002 | P0 | W4 | Verified | Picture-in-picture: clips on overlay tracks can be moved, scaled and rotated on the canvas |
| VID-003 | P0 | W4 | Todo | Crop tool for image and video layers with aspect lock and handles |
| VID-004 | P0 | W4 | Todo | Fit, Fill, Stretch and Custom modes handle media whose aspect differs from the canvas |
| VID-005 | P0 | W4 | Verified | Default still image duration is 5 seconds and adjustable |
| VID-006 | P0 | W4 | Verified | Detach audio from a video clip |
| VID-007 | P1 | W4 | Todo | Fill mismatched aspect ratios with a blurred copy of the media |
| VID-008 | P1 | W4 | Todo | GIF is treated as an animated clip |
| VID-009 | P1 | W4 | Todo | Replace media keeps all edits on the clip |
| VID-010 | P0 | W4 | Verified | Constant speed from 0.1x to 8x |
| VID-011 | P1 | W4 | Verified | Reverse a clip |
| VID-012 | P0 | W4 | Verified | Freeze frame at the playhead |
| VID-013 | P0 | W6 | Todo | Chroma key (green screen) with tolerance and edge softness |
| VID-014 | P2 | W8 | Todo | Stabilization |
| VID-015 | P0 | W2 | Verified | Clip speed 0.1x to 8x (menu presets 0.25x to 4x) is a non-destructive clip property set through an undoable command; the clip's timeline duration becomes source length divided by speed, a speed badge shows on the clip, and slowing a clip into its neighbor is refused; offered in the timeline clip and canvas context menus |
| VID-016 | P0 | W2 | Verified | Reverse toggles a non-destructive clip property through an undoable command, keeps source range and duration, shows a badge, and trim and split respect reversed source time; offered in the timeline clip and canvas context menus |
| VID-017 | P0 | W2 | Verified | Freeze frame toggles a non-destructive hold of one source frame (the frame under the playhead, else the first frame) for the whole clip duration through an undoable command, with a badge; offered in the timeline clip and canvas context menus |

## FX: Effects and filters (Wave 6)

Requires schema v5 (effects are currently blocked by the schema). GPU rendering via WebGL2 behind the renderer boundary.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| FX-001 | P0 | W6 | Todo | Effects tab lists categories with live preview thumbnails and hover preview |
| FX-002 | P0 | W6 | Todo | Apply an effect by click or drag to a clip or layer; effects stack, reorder, toggle, copy and remove |
| FX-003 | P0 | W6 | Todo | Effect parameters appear in the inspector and can be keyframed |
| FX-004 | P0 | W6 | Todo | Filters (looks): a set of one-click looks with an intensity slider |
| FX-005 | P0 | W6 | Todo | Gaussian blur and background blur |
| FX-006 | P0 | W6 | Todo | Vignette, film grain and glow |
| FX-007 | P1 | W6 | Todo | Motion blur, radial blur, pixelate, mosaic, glitch, RGB split, chromatic aberration, wave, mirror, kaleidoscope, invert, sepia, duotone, halftone |
| FX-008 | P1 | W6 | Todo | Adjustment layer applies effects to everything below it |
| FX-009 | P1 | W6 | Todo | Effects can be applied to groups and compositions |
| FX-010 | P0 | W6 | Todo | Effects render identically in preview and export (parity tests) |
| FX-011 | P0 | W6 | Todo | WebGL2 rendering with a safe fallback when the GPU or context is lost |
| FX-012 | P1 | W6 | Todo | 1080p 30 fps stays real-time with three effects on the reference machine |
| FX-013 | P2 | W6 | Todo | Save an effect stack as a preset |
| FX-014 | P2 | W8 | Todo | Custom shader effects through a sandboxed plugin API |

## TR: Transitions (Wave 6)

Between clips and at clip edges.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| TR-001 | P0 | W6 | Todo | Transitions tab with animated previews |
| TR-002 | P0 | W6 | Todo | Apply by dropping between two adjacent clips or on a clip edge; default duration 1 s; drag handle adjusts duration |
| TR-003 | P0 | W6 | Todo | Types: cross dissolve, fade to black, fade to white, slide (four directions), push, wipe, zoom |
| TR-004 | P1 | W6 | Todo | More types: spin, blur, glitch, iris, and similar |
| TR-005 | P0 | W6 | Todo | Insufficient source handles are detected and handled with a clear message or automatic adjustment |
| TR-006 | P0 | W6 | Todo | Replace or remove a transition; apply one to all cuts on a track |
| TR-007 | P0 | W6 | Todo | Transitions render identically in preview and export |
| TR-008 | P1 | W6 | Todo | Video cross dissolve also crossfades the audio |
| TR-009 | P1 | W6 | Todo | Alignment choice: centered, start or end on the cut |

## MSK: Masks, blend modes and compositing (Wave 6)

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| MSK-001 | P0 | W6 | Todo | Blend modes: Normal, Multiply, Screen, Overlay, Add, Darken, Lighten |
| MSK-002 | P1 | W6 | Todo | More blend modes: Soft Light, Hard Light, Difference, Color Dodge, Color Burn, and similar |
| MSK-003 | P0 | W6 | Todo | Masks: rectangle and ellipse with feather, invert and opacity |
| MSK-004 | P1 | W6 | Todo | Freehand bezier masks; animated mask paths |
| MSK-005 | P1 | W6 | Todo | Track matte using the layer above (alpha or luma) |
| MSK-006 | P1 | W9 | Todo | Transparent export (alpha WebM or PNG sequence) |

## CLR: Color correction and grading (Wave 6)

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| CLR-001 | P0 | W6 | Todo | Color panel: exposure, contrast, highlights, shadows, whites, blacks, saturation, vibrance, temperature, tint, sharpen |
| CLR-002 | P1 | W6 | Todo | RGB and luma curves |
| CLR-003 | P1 | W6 | Todo | Color wheels (lift, gamma, gain) |
| CLR-004 | P2 | W6 | Todo | HSL secondary color selection |
| CLR-005 | P1 | W6 | Todo | LUT import (.cube) with intensity |
| CLR-006 | P1 | W6 | Todo | Scopes: histogram, waveform, vectorscope |
| CLR-007 | P1 | W6 | Todo | Auto enhance and auto white balance (algorithmic, not AI) |
| CLR-008 | P2 | W6 | Todo | Color match between clips |
| CLR-009 | P1 | W6 | Todo | Color management: sRGB by default; Rec.709, 10-bit and HDR sources are converted correctly |

## AUD: Audio (Wave 7)

Real audio engine. Currently mute is only metadata.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| AUD-001 | P0 | W7 | Todo | Multiple audio tracks with waveforms |
| AUD-002 | P0 | W7 | Todo | Clip volume in dB, keyframeable; clip mute; master volume |
| AUD-003 | P0 | W7 | Todo | Fade in and fade out handles |
| AUD-004 | P0 | W7 | Todo | Detach or extract audio from video into an audio track |
| AUD-005 | P0 | W4 | Verified | Audio plays during preview and scrubbing and stays in sync |
| AUD-006 | P0 | W7 | Todo | Peak meters on master and per track |
| AUD-007 | P0 | W4 | Verified | Track mute and solo work audibly |
| AUD-008 | P0 | W7 | Todo | Voiceover recording from the microphone with countdown and level monitor onto a new audio track |
| AUD-009 | P1 | W7 | Todo | Pan left and right |
| AUD-010 | P1 | W7 | Todo | Speed change with pitch preservation |
| AUD-011 | P1 | W7 | Todo | EQ, compressor and loudness normalization |
| AUD-012 | P1 | W7 | Todo | Auto ducking of music under speech (algorithmic) |
| AUD-013 | P1 | W7 | Todo | Royalty-free music and sound effects library with clear licenses |
| AUD-014 | P1 | W7 | Todo | Audio envelope drawing directly on the clip |
| AUD-015 | P0 | W7 | Todo | Audio mixdown in export equals the preview mix (48 kHz stereo) |
| AUD-016 | P2 | W7 | Todo | Beat detection markers |
| AUD-017 | P2 | W7 | Todo | Multichannel to stereo downmix |

## TPL: Templates, components and nesting (Wave 8)

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| TPL-001 | P0 | W8 | Todo | Templates panel with categories, animated previews and search; applying a template creates scenes and layers |
| TPL-002 | P1 | W8 | Todo | Bundled starter templates: YouTube intro, Shorts or Reels, lower thirds, subtitles, education slides |
| TPL-003 | P1 | W8 | Todo | Save a scene or project as a template; import and export template files |
| TPL-004 | P1 | W8 | Todo | Reusable components with exposed controls; editing the master updates all instances |
| TPL-005 | P1 | W8 | Todo | Nested compositions (pre-comps) with their own timeline; enter and exit |
| TPL-006 | P1 | W8 | Todo | Replace-media placeholders inside templates |
| TPL-007 | P1 | W8 | Todo | Brand kit: colors, fonts and logos applied across a project |
| TPL-008 | P1 | W8 | Todo | Slide mode for teachers: slides as scenes with transitions and timing |
| TPL-009 | P2 | W8 | Todo | Data-driven variants from CSV |

## EXP: Export (Wave 5 first version, Wave 9 full)

Offline frame-accurate render, never realtime capture.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| EXP-001 | P0 | W5 | Verified | Export dialog: format MP4 H.264 and AAC, resolution and frame rate, quality preset, range, file name |
| EXP-002 | P0 | W5 | Verified | Progress shows percent and ETA, can be cancelled, and the UI stays responsive |
| EXP-003 | P0 | W5 | Verified | Rendering is frame-accurate and offline through a worker, independent of playback speed |
| EXP-004 | P0 | W5 | Verified | Audio mixdown is included and in sync |
| EXP-005 | P0 | W5 | Verified | Exported files pass container checks in e2e by an independent read-back (codec, resolution, fps, duration, audio); a one-off ffprobe check is recorded in the report |
| EXP-006 | P0 | W5 | Verified | Presets: YouTube 1080p and 4K, Shorts, Reels and TikTok (9:16), Instagram square and portrait, small WhatsApp, custom |
| EXP-007 | P0 | W5 | Verified | Preview and export visuals match; a parity suite compares frames with tolerances |
| EXP-008 | P0 | W5 | Verified | Missing media or fonts are caught before export with a clear message |
| EXP-009 | P0 | W5 | Verified | Export the current frame as PNG |
| EXP-010 | P0 | W9 | Todo | Long exports (30 minutes) stay within memory limits by streaming to disk |
| EXP-011 | P1 | W9 | Todo | WebCodecs hardware encode with a documented software fallback |
| EXP-012 | P1 | W9 | Todo | WebM (VP9 or AV1) export |
| EXP-013 | P1 | W9 | Todo | GIF export |
| EXP-014 | P1 | W9 | Todo | Audio-only export (MP3, WAV, AAC) |
| EXP-015 | P1 | W9 | Todo | Burn-in captions and watermark options |
| EXP-016 | P1 | W9 | Todo | Export SRT subtitles and cover frame |
| EXP-017 | P2 | W9 | Todo | Export queue in the background |
| EXP-018 | P2 | W9 | Todo | PNG sequence export |

## REL: Performance, reliability and platform (Wave 9 unless noted)

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| REL-001 | P0 | W1 | Verified | Loading the app and doing standard edits produces no console errors |
| REL-002 | P0 | W9 | Todo | A UI error never loses the project: an error boundary offers recovery |
| REL-003 | P0 | W9 | Todo | Heavy work (decode, encode, thumbnails, waveforms) runs in workers so the UI stays responsive |
| REL-004 | P1 | W9 | Todo | Frame cache and render invalidation avoid re-rendering unchanged frames |
| REL-005 | P1 | W9 | Todo | A project with 500 layers and 200 clips stays interactive |
| REL-006 | P1 | W9 | Todo | The app works offline after first load (bundled fonts and assets) |
| REL-007 | P0 | W9 | Todo | Supported browsers are declared (Chrome and Edge current versions); unsupported browsers see a clear message |
| REL-008 | P1 | W9 | Todo | Cold start under 3 seconds on the reference machine (production build) |
| REL-009 | P1 | W9 | Todo | Memory stays within budget during 30 minute sessions |

## ACC: Accessibility (Wave 9, focus basics earlier)

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| ACC-001 | P1 | W9 | Todo | Every control is reachable by keyboard in a logical order |
| ACC-002 | P1 | W9 | Todo | ARIA roles and labels on panels, menus, dialogs and the timeline |
| ACC-003 | P1 | W9 | Todo | Color contrast meets WCAG AA |
| ACC-004 | P1 | W9 | Todo | Reduced-motion preference is respected in UI animations |
| ACC-005 | P1 | W9 | Todo | Actions are announced to screen readers through a live region |
| ACC-006 | P2 | W9 | Todo | Interface remains usable at 200 percent browser zoom |

## QA: Preflight and quality checks (Wave 9)

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| QA-001 | P1 | W9 | Todo | Preflight before export: missing media or fonts, text overflow, clips outside the canvas, empty tracks, low-resolution upscaling, audio clipping, safe zones |
| QA-002 | P1 | W9 | Todo | Warnings panel lists issues and jumps to the affected item |

## ADV: Advanced and professional tools (Wave 8, later)

Each of these becomes its own program of work when reached.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| ADV-001 | P2 | W8 | Todo | Motion tracking (point and planar) |
| ADV-002 | P2 | W8 | Todo | 3D layers, camera and lights |
| ADV-003 | P2 | W8 | Todo | Rotoscoping helpers |
| ADV-004 | P2 | W8 | Todo | External plugin API with sandboxing |
| ADV-005 | P2 | W8 | Todo | Scripting and automation console |
| ADV-006 | P2 | W8 | Todo | Multicam editing |
| ADV-007 | P2 | W8 | Todo | Command-line and batch rendering |
| ADV-008 | P2 | W8 | Todo | Real-time collaboration and cloud sync (after accounts exist) |

## AI: AI features (Wave 10, last)

Built only after the manual editor is complete. All AI actions go through the same Command Bus, with preview, approval and one undo step.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| AI-001 | P2 | W10 | Todo | AI panel with prompt, plan, preview and apply |
| AI-002 | P2 | W10 | Todo | Approval levels and visible cost or usage before running |
| AI-003 | P2 | W10 | Todo | Every AI action is a single undo group and is editable afterwards |
| AI-004 | P2 | W10 | Todo | Auto captions in many languages including Indian languages |
| AI-005 | P2 | W10 | Todo | Caption translation |
| AI-006 | P2 | W10 | Todo | Text to speech and voice options |
| AI-007 | P2 | W10 | Todo | Background removal for video and images |
| AI-008 | P2 | W10 | Todo | Auto-cut silence and filler words |
| AI-009 | P2 | W10 | Todo | Auto reframe from 16:9 to 9:16 and other ratios |
| AI-010 | P2 | W10 | Todo | Scene detection and highlight or short-clip suggestions |
| AI-011 | P2 | W10 | Todo | AI noise reduction and audio cleanup |
| AI-012 | P2 | W10 | Todo | AI generated templates and layouts from a prompt |
| AI-013 | P2 | W10 | Todo | AI provider abstraction with a backend proxy; API keys never in the browser |
