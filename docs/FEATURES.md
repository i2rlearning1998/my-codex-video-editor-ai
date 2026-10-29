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
| LAY-002 | P0 | W1 | Verified | Left rail has Media, Graphics, Text, Templates, Audio, Elements, Transitions; each switches the left panel content |
| LAY-003 | P0 | W1 | Verified | Left panel can be collapsed and expanded |
| LAY-004 | P0 | W1 | Verified | Panel dividers (left, right, timeline) are draggable with min and max sizes |
| LAY-005 | P1 | W1 | Todo | Panel sizes and collapsed state persist across reloads |
| LAY-006 | P2 | W1 | Todo | Double-click a divider to reset its size |
| LAY-007 | P0 | W1 | Todo | Right panel has tabs Properties, Effects, Transitions and an icon rail Properties, Effects, Color, Audio, Speed; selection persists while switching |
| LAY-008 | P0 | W1 | Verified | Right panel can be collapsed and expanded |
| LAY-009 | P1 | W1 | Todo | Timeline height is resizable and can be maximized and restored |
| LAY-010 | P1 | W1 | Todo | Preview can go fullscreen and exit with Esc |
| LAY-011 | P2 | W1 | Todo | Layout presets (Edit, Timeline focus, Preview focus) |
| LAY-012 | P1 | W1 | Todo | View mode switch Beginner, Creator, Advanced changes only which tools are visible, never the engine or project data |
| LAY-013 | P1 | W1 | Verified | Responsive (owner H2): 1440 px and wider docks both panels; 1024 to 1439 docks the left panel and opens the right one as an overlay drawer beside its icon rail; 768 to 1023 opens both as drawers over a scrim with 40 px touch targets; below 768 one panel at a time opens as a bottom sheet and the timeline toolbar is simpler |
| LAY-014 | P0 | W1 | Verified | No horizontal page scroll and no overlapping or clipped top-bar controls at 1920x1080, 1440x900, 1366x768, 1280x720, 1024x768, 820x1180 and 390x844, in both themes |
| LAY-015 | P0 | W1 | Verified | Every icon-only button has an accessible name and a tooltip that includes its shortcut |
| LAY-016 | P0 | W1 | Verified | Toast notification component (info, success, warning, error) with auto-dismiss and manual dismiss |
| LAY-017 | P0 | W1 | Todo | Modal dialog component traps focus, closes on Esc and returns focus to the trigger |
| LAY-018 | P0 | W1 | Verified | Dropdown, popover and menu components share one implementation with keyboard navigation |
| LAY-019 | P0 | W1 | Todo | Every panel has designed loading, empty and error states |
| LAY-020 | P0 | W1 | Verified | Design tokens (color, spacing, radius, type scale, elevation) live in one place; a theme swap needs no component edits |
| LAY-021 | P0 | W1 | Todo | One consistent line-icon set replaces all unicode glyph icons |
| LAY-022 | P0 | W1 | Claimed | Color picker component: saturation/hue area, hex, RGB, HSL, alpha, swatches, document colors, EyeDropper where supported |
| LAY-023 | P0 | W1 | Claimed | Slider, numeric scrub input, segmented control, toggle, tabs, tooltip components share one behavior spec |
| LAY-024 | P0 | W1 | Verified | Focus rings are visible on every interactive element |
| LAY-025 | P1 | W1 | Todo | Crisp rendering on high-DPI displays for icons, canvas overlays and timeline |
| LAY-026 | P0 | W1 | Todo | Drop overlay appears when files are dragged over the app and explains what will happen |
| LAY-027 | P1 | W1 | Verified | Scrollbars are thin and themed everywhere; in side panels they appear on hover |
| LAY-028 | P0 | W1 | Verified | Deep panels (Position, Animate, Colour, Stroke style) open in the left side panel with a Back button and never cover the canvas; quick choices open as popovers anchored under the toolbar without pushing the layout |
| LAY-029 | P0 | W1 | Verified | Every clickable element has hover, pressed and keyboard-focus states |
| LAY-030 | P0 | W1 | Verified | Menus: submenus open on hover after a short delay and stay open on a diagonal move toward them; arrow keys, Enter and Esc work at every level; menus reposition to fit and show no scrollbar in normal use |
| LAY-031 | P0 | W1 | Verified | Side panels have one open state: a rail category opens its panel, the active category collapses it, another swaps it; the top-bar toggles show and change the same state, on the left and on the right |
| LAY-032 | P0 | W1 | Verified | Themes: dark (default) and light from semantic tokens; dark, light or system from the top bar, the menu and the palette; kept in the browser (not the project) and applied before first paint; the artboard is never themed; text, secondary text and accent on panels reach 4.5:1 |
| LAY-033 | P0 | W1 | Verified | Motion tokens (120, 180, 240 and 320 ms with enter and exit easings); side panels open and close in 150 to 300 ms without reflowing their content; reduced motion makes it about 0 |
| LAY-034 | P1 | W1 | Verified | A window under 800 px tall shows six rail categories and a More menu for the rest |
| LAY-035 | P0 | W1 | Verified | The right panel's icon rail lists the sections that fit the selection (Clipchamp): Properties always; Color, Fade, Speed, Animate where they apply; Filters, Effects, Adjust colors, Audio, Captions and Transitions show which wave builds them (H4 LCR) |
| LAY-036 | P0 | W1 | Verified | The Inspector stacks Position and size, Timing and Details (dimensions and the layer's place) instead of sub-tabs; a section header opens and scrolls to its section, the chevron folds it (H4 LCR) |
| LAY-037 | P0 | W1 | Verified | The right panel's Color, Fade (in and out) and Speed (presets, reverse, freeze) edit the selection as one undo step each (H4 LCR) |
| LAY-038 | P0 | W2 | Verified | The left and right side panels visibly animate (width and content fade, 240 ms; about 0 with reduced motion) when opened, collapsed or swapped from the rail, the top-bar toggle or a toolbar button, without the content reflowing mid-animation |
| LAY-039 | P0 | W2 | Verified | A toolbar button that opens a side panel (Font, Effects, Position, Animate, Edit, Replace, Crop, Colour, Text colour, Fill) first opens a collapsed left or right panel, animated, then shows its content |
| LAY-040 | P0 | W2 | Verified | One browse panel for the left-rail libraries: header with Back, title and Close; sticky search; sections with a title, See all and a horizontal strip; chips; a drill-down that slides in 180 ms; grids rendered in chunks with skeleton previews; empty and error states; arrow keys move between cards |
| LAY-041 | P0 | W2 | Verified | Right panel per object: an always-visible icon rail whose tabs fit the selection; the first tab is named after it (Canvas, Shape, Drawing, Text, Image, Video, Audio, Group or Arrange); unbuilt tabs show disabled and name their wave; with nothing selected the Canvas tab sets size, background and scene length U5 LCR: nothing selected shows no Canvas panel (an empty state); the canvas bar holds the ratio, background and frame rate |
| LAY-042 | P0 | W2 | Verified | Right panel for shapes: Color, Outline (colour, weight, dash, caps, joins), Corners and Combine as accordions; Adjust colors with Transparency live and Exposure, Contrast, Saturation, Temperature, Blend mode and Reset planned; Transform and Timing are folded accordions at the bottom of the first tab |
| LAY-043 | P0 | W2 | Verified | Right panel for text: font, size, bold, italic, underline, strikethrough, case, alignment, colour and spacing, each one undo step and in step with the toolbar |
| LAY-044 | P0 | W2 | Verified | Right panel for groups (Group: ungroup, align) and multi-selections (Arrange: group, align, distribute) |
| LAY-045 | P0 | W4 | Verified | Right panel for media: Image (crop, flip, corners, border; Filters planned), Video (crop, flip, corners; Speed; Audio with track mute and Detach audio, volume planned; Fade), Audio clip (Audio, Speed; Fade planned) |
| LAY-046 | P0 | W2 | Verified | The right panel has a header with the selection's name, a count badge and a collapse button; its labelled icon rail lists the selection's sections in Clipchamp's order: video Captions, Audio, Fade, Filters, Effects, Adjust colors, Speed, Transitions, Advanced; image Fade, Filters, Effects, Adjust colors, Transitions, Advanced; shape and text their own tab, Animate, Effects, Adjust colors; Advanced holds a picture's own controls, Animate and the Inspector (J15) |
| LAY-047 | P0 | W2 | Verified | The right panel's sections hold: Speed a slider from 0.1x to 16x on a log scale with ticks at 0.1, 1, 2, 4 and 16 (one step on release) above the presets, Reverse and Freeze frame; Effects a list (shapes: the live Outline and planned Shadow settings; text: Outline and Shadow planned; pictures: planned effects); Filters a list (Original, the others planned); Animate In, Out and Loop presets as grids (one step each); Transitions the J12 panel for a clip that touches the one before it, or how to get one (J15) |
| LAY-048 | P0 | W2 | Verified | The timeline has no title row: the Player bar is its top edge and its resize grip (row-resize cursor on the bar's background and a grip pill on its edge; controls keep their own action), clamped to 160 px and 60% of the window, and the height is remembered in this browser (T4 LCR) |
| LAY-049 | P0 | W2 | Verified | The scene strip is hidden by default and stays in the page; a button to the left of Scenes slides it in and out over 240 ms (about 0 with reduced motion), and the choice is remembered in this browser (T4 LCR) |
| LAY-050 | P0 | W2 | Verified | The status row under the canvas has icons of at least 20 px, text of at least 13 px and 32 px buttons, and keeps the scene strip button, Scenes, the canvas summary, No layer selected, the hand, zoom out, the zoom % field, zoom in, Fit, 100% and Fullscreen (T4 LCR) |
| LAY-051 | P0 | W2 | Verified | Both themes meet WCAG AA: text, secondary and tertiary text, accent text and status text reach 4.5:1 on every surface, clip labels on every clip colour, white on every filled control; the accent and focus ring reach 3:1 as marks (T7 LCR) |
| LAY-052 | P0 | W2 | Verified | Readable sizes in both themes: body 14 px, secondary text at least 12.5 px, labels 13, section titles 15, tabular digits; icons on controls 20 px (24 on the rails and Play); controls at least 32 px to hit; one scan finds nothing under these minimums with nothing selected, with a text layer selected and with the Media panel and scene strip open (T7 LCR) |
| LAY-053 | P0 | W2 | Verified | The placeholder wordmark (src/brand/brand.ts, one place) shows in the top bar, the loading screen and page title, the empty canvas and right-panel empty states, and the export dialog; the icon family lives in src/brand/icons (T7 LCR) |
| LAY-054 | P0 | W2 | Verified | In both themes a hovered clip shows an outline, a selected clip's label reads at 4.5:1, the gap trash button and the transition + and chip read at 4.5:1 (the + and chip are 24 px), and the canvas marquee's border reaches 3:1 on the stage (T7 LCR) |
| LAY-055 | P0 | W2 | Verified | At the seven target window sizes in both themes the page never scrolls sideways and the Player bar, its timecode and the status row stay inside the window (narrow windows drop the planned 3D mode and labels first; a phone wraps the status row) (T7 LCR) |
| LAY-056 | P0 | W2 | Verified | Only one context menu is open at a time (canvas, timeline, media, scenes); a press outside, Escape, a wheel outside, window blur and resize close it (U3 LCR) |
| LAY-057 | P0 | W2 | Verified | Menus taller than the window scroll with the wheel; the wheel over a menu, the Draw panel or a floating popover scrolls it and never pans or zooms the canvas (U3 LCR) |
| LAY-058 | P0 | W2 | Verified | The timeline menu's Speed and Audio open as flyouts beside their entry on hover (150 ms, with a 300 ms grace toward the flyout), on click and on the Right arrow; Left closes the flyout (U3 LCR) |
| LAY-059 | P0 | W2 | Verified | The right rail shows 24 px icons with their labels under them (at least 12.5 px); nothing selected shows no Canvas panel, only an empty state (U5 LCR) |
| LAY-060 | P0 | W2 | Verified | The first load opens the Media panel; its empty state shows an illustration; a new project's canvas is white (T-ALL LCR) |
| LAY-061 | P0 | W2 | Verified | No panel toggles in the top bar: the left panel's collapse button is in its own header (a rail category reopens it) and the right panel's in its header; the right panel opens from its rail only and never moves the canvas (T-ALL LCR; V7 LCR) |
| LAY-062 | P0 | W2 | Verified | On the wide layout the left rail and panel run the full height and the timeline sits beside the panel (T-ALL LCR) |
| LAY-063 | P0 | W2 | Verified | The right rail is always shown; with nothing selected it holds only Auto Caption, disabled (Planned); a selection changes its categories but never opens the panel; a rail click toggles the panel; the drawer icon closes it; deselecting closes it (V7 LCR, spec 10.1) |
| LAY-064 | P0 | W2 | Verified | The shell's regions are separate cards: 8 px gutters of the page colour, opaque 1 px borders, each region its own tone (stage, footer, scene strip, timeline, lanes) (V-series LCR) |
| LAY-065 | P0 | W2 | Verified | One icon scale (16/20/24 in tokens); no rendered icon is under 16 px; rail icons are 24 px and rail labels are never cut (V7 LCR, spec 10.5) |

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
| KEY-017 | P0 | W2 | Verified | Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y undo and redo right after a panel edit (a committed field, a colour picker, a panel button) with no click elsewhere; Ctrl+Z inside a field still being typed in stays with the field, and other shortcuts never fire while typing (J2 LCR) |

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
| PRJ-013 | P0 | W2 | Verified | Scenes: add, rename, reorder, duplicate, delete |
| PRJ-014 | P1 | W2 | Verified | Scene strip UI for switching and reordering scenes |
| PRJ-015 | P0 | W4 | Todo | Projects persist in IndexedDB with media in OPFS; localStorage remains only for small settings |
| PRJ-016 | P0 | W4 | Todo | Home screen lists projects with thumbnail, last edited; open, rename, duplicate, delete |
| PRJ-017 | P0 | W4 | Todo | Crash recovery dialog offers to restore the last autosave and shows its time |
| PRJ-018 | P1 | W8 | Todo | Named version snapshots with restore |
| PRJ-019 | P1 | W9 | Todo | Project package export and import including media (single file) |
| PRJ-020 | P0 | W2 | Verified | A scene board shows every scene in one row in playback order with a poster, name and length and a transition chip between scenes (transitions are Wave 6); double-click opens a scene and the timeline then shows that scene only |
| PRJ-021 | P0 | W2 | Verified | Dragging a layer onto another scene on the board moves it there with its clip (Alt copies it), one undo step |
| PRJ-022 | P0 | W2 | Verified | Playback runs through the scenes in order |
| PRJ-023 | P0 | W2 | Verified | A 72 px scene strip under the canvas replaces the composition select: cards with a lazily drawn 16:9 thumbnail, the name and a length chip, the open scene highlighted and scrolled into view; + adds a blank scene, a copy of the open one, or opens Templates; cards drag to reorder with an insertion line; double-click renames; right-click offers Rename, Duplicate, Delete, Save as template, Move left and Move right; a chevron collapses it; below 1024 px it is a Scene n of m button with a list |
| PRJ-024 | P0 | W2 | Verified | Each scene owns its background colour (schema 6): changing it in one scene never changes another, and the canvas, the scene strip, the board and export show each scene's own colour (J1 LCR) |
| PRJ-025 | P0 | W2 | Verified | A canvas size belongs to its scene: changing one scene's size changes no other scene and never rewrites a layer's position or scale, so changing it and back restores the scene exactly (J1 LCR) |
| PRJ-026 | P0 | W2 | Verified | A new scene starts from the project's defaults (the background chosen for the project and the open scene's size and frame rate) and then owns its own settings (J1 LCR) |
| PRJ-027 | P0 | W2 | Verified | The canvas bar's FPS chip sets the open scene's frame rate (6, 8, 12, 23.98, 24, 25, 29.97, 30, 50, 59.94, 60, 120, 240 or Custom); clip, layer, keyframe and marker times stay in seconds and re-snap to the new frame grid, as one undo step; the status text, timeline grid, playback and export follow (U5 LCR) |

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
| MED-036 | P0 | W4 | Verified | Deleting media: unused media goes at once with an 8 s Restore toast; media used by N clips first asks, naming N, and those clips then show a Missing media placeholder (export refuses them); the stored files are removed after the toast; importing the file again brings it back; delete is not undoable |
| MED-037 | P0 | W4 | Verified | Each Project Media item has a menu (More button and right-click): Rename (not undoable), Delete, Add to scene, Move to folder (browser-stored folders) and Details |
| MED-038 | P0 | W4 | Verified | Media tabs All, Images, Videos, Audio, Designs and Folders; sort; an import drop zone; folders (create, rename, delete, drag media in, open); Designs saved from the export dialog with Save frame to Media; videos preview their filmstrip on hover; none of it is an undo step |
| MED-039 | P0 | W2 | Verified | One drag controller for every in-app source (Media cards, library shapes, text styles, templates, My Templates, the text box): the item follows the pointer as a ghost, Escape cancels, and a release, pointer cancel, window blur or hidden page always cleans up; a long session of mixed drags and clicks onto the canvas and timeline keeps working, also after a new project (T1 LCR) |
| MED-040 | P0 | W2 | Verified | An OS file dragged over the window shows a "drop to import" overlay that never takes the pointer and always goes away when the drag ends; the files go to Media, and dropped on the canvas or the timeline they are also placed there (T1 LCR) |
| MED-041 | P0 | W2 | Verified | A single click adds a Media item or library item (canvas centre, clip at the playhead on its lane); a drag onto the timeline starts the clip at the drop time (T1 LCR) |

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
| CV-012 | P1 | W2 | Claimed | Live readout of size, angle or position while dragging |
| CV-013 | P0 | W2 | Verified | Smart guides and snapping to canvas center and edges, other layers and safe margins, with visible guide lines |
| CV-014 | P1 | W2 | Todo | Grid and rulers toggles; drag user guides from the rulers |
| CV-015 | P1 | W2 | Todo | Safe-area overlays including 9:16 social UI zones |
| CV-016 | P0 | W2 | Verified | Zoom controls: Fit, plus and minus change the canvas view scale |
| CV-017 | P0 | W2 | Claimed | Zoom dropdown presets (Fit, Fill, 25 to 400 percent, 100 percent actual pixels), Ctrl+wheel and Ctrl +/- and Ctrl+0 |
| CV-018 | P0 | W2 | Verified | Pan with Space+drag, middle mouse or trackpad scroll when zoomed in |
| CV-019 | P1 | W2 | Todo | Checkerboard background toggle for transparency |
| CV-020 | P0 | W2 | Todo | Right-click a layer opens a menu: Cut, Copy, Paste, Duplicate, Delete, Group, Ungroup, Bring forward, Send backward, Bring to front, Send to back, Lock, Hide, Rename, Flip horizontal, Flip vertical, Align |
| CV-021 | P0 | W2 | Todo | Right-click empty canvas opens a menu: Paste, Select all, toggle grid and guides |
| CV-022 | P0 | W2 | Verified | Clicking inside a group selects the group; double-click selects the child; Esc exits |
| CV-023 | P1 | W2 | Todo | Double-click a group enters isolation mode |
| CV-024 | P0 | W2 | Todo | Locked layers cannot be moved or resized from the canvas; hidden layers are neither drawn nor selectable |
| CV-025 | P0 | W2 | Verified | Align and distribute: left, center, right, top, middle, bottom, distribute horizontal and vertical, relative to canvas or selection |
| CV-026 | P0 | W2 | Verified | Order commands: bring to front, forward, backward, to back |
| CV-027 | P0 | W2 | Todo | Quick flip horizontal and vertical, rotate 90 degrees |
| CV-028 | P1 | W2 | Todo | Paste places at same position with small offset; pasting an image from the OS clipboard imports it |
| CV-029 | P0 | W2 | Todo | Cursor changes correctly over move, resize (per handle angle) and rotate handles |
| CV-030 | P0 | W2 | Todo | Selection outlines and handles keep constant on-screen thickness at any zoom |
| CV-031 | P0 | W2 | Verified | Layers are drawn only inside their active time range |
| CV-032 | P1 | W2 | Todo | 100 layers can be dragged smoothly without dropped frames on the reference machine |
| CV-033 | P1 | W2 | Todo | Preview quality setting Full, Half, Quarter |
| CV-034 | P2 | W2 | Todo | Touch and pen input work with pointer events |
| CV-035 | P0 | W2 | Verified | The floating toolbar shows the selection's controls: text, image, video, shape, drawing, group or multi-selection, and the scene toolbar when the canvas itself is selected; it hides for audio layers and when nothing is selected (H3 LCR) |
| CV-036 | P0 | W2 | Verified | Image and video toolbar: Edit (images), Replace, Border and Corners (images), Crop, Flip, Transparency, Animate and Position edit the layer as one undo step each; X, Y, width, height and rotation are in the Position panel; AI tools show disabled with the wave that builds them (H3 LCR) |
| CV-037 | P0 | W2 | Verified | Text toolbar: Font (opens the Font panel), Size with − and +, Colour, Bold, Italic, Underline, Strikethrough, Uppercase, Align, Spacing (weight, letter, line and paragraph spacing, case, position in the box), Transparency and Effects (a panel whose effects name their wave) edit the layer as one undo step each (H3 LCR) |
| CV-038 | P0 | W2 | Verified | Shape toolbar: Fill (fill opacity and No fill in the Colour panel), Stroke style (colour, width, style, dash, caps, joins), Corners, Combine (explains that shapes combine from the canvas menu), Transparency, Animate and Position edit the layer as one undo step each (H3 LCR) |
| CV-039 | P0 | W2 | Verified | Right-click Copy style and Paste style (also in the palette) copy opacity, color, text size and brush size from one layer and apply the compatible ones to every selected layer in one undo step |
| CV-040 | P0 | W2 | Verified | A selection shows a small action cluster above its box with Group (for two or more sibling layers) or Ungroup (for groups), Duplicate, Delete and More (the right-click menu); with two or more layers selected, one dashed box surrounds the whole selection and each layer keeps its own outline. Menu and cluster actions are offered only when every selected item supports them |
| CV-041 | P0 | W2 | Verified | The multi-selection box has corner and edge handles and a rotate handle: dragging them resizes or rotates every selected layer together from the shared box, as one undo step |
| CV-042 | P0 | W2 | Verified | A Position panel opens from the context toolbar with an Arrange tab (align, distribute and layer order as buttons) and a Layers tab (the composition's layers as a flat list, drag to reorder, groups shown with a folder icon) |
| CV-043 | P0 | W2 | Verified | The canvas right-click menu offers no timeline-only items (Link clips, Enable/disable clip); Copy style and Paste style are always visible without scrolling |
| CV-044 | P0 | W2 | Verified | The Inspector, the image and video toolbar and the Position panel show X, Y, W and H of the drawn box in px, with a ratio lock; the values match what is drawn for text, shapes, lines, drawings, groups, images, videos and a multi-selection, before and after a handle drag, and follow the drag live |
| CV-045 | P0 | W2 | Verified | Handles depend on the layer: groups and drawings resize from their corners only, text from its corners plus its width grips, lines and arrows lengthen from their two ends, and a multi-selection box has side handles only when every layer is a plain shape; glyphs, pictures and brush strokes are never stretched |
| CV-046 | P0 | W2 | Verified | While a marquee is dragged, the layers it will select are outlined live, before release |
| CV-047 | P0 | W2 | Verified | A hand tool (H) and Shift+wheel also pan; Fit resets the pan; layers outside the artboard show faintly and stay selectable |
| CV-048 | P0 | W2 | Verified | With nothing selected the toolbar is a scene bar: background colour, scene length (retimes the clips at the end, one undo step) and Animate (disabled, names its wave) |
| CV-049 | P0 | W2 | Verified | Rotated objects of every kind (shapes, text, pictures, groups, nested groups, flipped) resize smoothly: the opposite corner or edge stays fixed in world space, the dragged corner follows the pointer from the first step, corners stay square, groups never skew; resize cursors turn with the object; a live W × H chip while resizing and an angle chip while rotating (contract revision 8) |
| CV-050 | P0 | W2 | Verified | Ctrl/Cmd+wheel and pinch zoom toward the pointer; a plain wheel never moves an artboard that fits; zoomed in, wheel, Shift+wheel, trackpad scroll, Space-drag, middle-drag and the hand tool pan, clamped to 48 px of stage past the artboard; below Fit the artboard stays centred; minimum zoom 10% |
| CV-051 | P0 | W2 | Verified | Lock (canvas menu): a locked element can be selected but not moved, resized, rotated, nudged, edited or deleted; its toolbar offers Unlock (H3 LCR) |
| CV-052 | P0 | W2 | Verified | Hover outlines the object, or the empty artboard, under the pointer; a click on the empty artboard selects the canvas (scene toolbar), a click on the stage around it deselects everything and shows the canvas bar (H3 LCR; I1 LCR) |
| CV-053 | P0 | W2 | Verified | Canva handles: white round corners, pill-shaped side handles and the rotate handle 28 px below the box (interaction contract revision 8) (H3 LCR) |
| CV-054 | P0 | W2 | Verified | One fixed floating toolbar row (44 px, radius 12); the scene bar has the canvas size chip at its left (I1 LCR: object toolbars have none); it never scrolls: labels collapse first, then trailing tools move into More (H3 LCR) |
| CV-055 | P0 | W2 | Verified | Canvas size presets (16:9, 9:16, 1:1, 4:3, 4:5, 21:9, 2:3) and a custom size apply to the open scene without moving its layers (J1 LCR, PRJ-025), as one undo step with Undo in the toast |
| CV-056 | P0 | W2 | Verified | Right-click menus per type, with icons and shortcuts: an element offers Lock, Show element timing, Alternative text, Set image as background, Resize canvas to selection, Download selection and Info; the empty canvas offers Paste, scenes, Canvas size and Guides; unbuilt items name their wave (H3 LCR) |
| CV-057 | P0 | W2 | Verified | A click on the stage outside the artboard, or Escape with nothing selected, shows the canvas bar in the toolbar slot: Ratio (size presets), canvas background colour and Auto captions (planned, W8); a click on the artboard or an object hides it; object toolbars carry no size chip; never two bars at once |
| CV-058 | P0 | W2 | Verified | Show element timing opens a popover with the element's start time and duration (NumberFields), highlights its clip on the timeline while open, and each change is one undo step (J6 LCR) |
| CV-059 | P0 | W2 | Verified | Alternative text is stored per layer in the project, saved with a visible confirmation, marked with an ALT badge in the scene list, and shown again when reopened (J6 LCR) |
| CV-060 | P0 | W2 | Verified | Resize canvas to selection asks for confirmation naming the new size, gives the open scene the selection's size with every layer moved together in one undo step, and Fit then fits the whole artboard in view (J6 LCR) |
| CV-061 | P0 | W2 | Verified | While a library or Media item is dragged over the canvas (only there), an outline of its real size and shape follows the pointer, snapping to the canvas centre and edges with a guide, and the canvas is highlighted; the drop places it exactly at the outline as one undo step (T2 LCR) |
| CV-062 | P0 | W2 | Verified | Bring to front, Bring forward, Send backward and Send to back work between any two kinds (shape, picture, text, video, group): forward and backward pass the next overlapping layer, through a lane of the layer's kind or a new one, empty lanes go; children of a group reorder among themselves and a group moves as one unit (U1 LCR) |
| CV-063 | P0 | W2 | Verified | Every ratio or size change fits the new canvas in the view (the artboard covers at least 80% of the stage's smaller side); no "This composition has no layers" text behind the canvas (U4 LCR) |

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
| LYR-008 | P0 | W2 | Verified | Type icons for text, shape, image, video, audio, group |
| LYR-009 | P1 | W2 | Todo | Thumbnails per layer |
| LYR-010 | P1 | W2 | Todo | Search and filter layers |
| LYR-011 | P0 | W2 | Todo | Right-click menu: Duplicate, Delete, Group, Ungroup, Rename, Lock, Hide, Copy, Paste, Select same type |
| LYR-012 | P0 | W2 | Verified | Group and Ungroup available from UI and shortcut |
| LYR-013 | P1 | W2 | Todo | Arrow-key navigation in the list |
| LYR-014 | P2 | W2 | Todo | Solo (isolate) a layer |
| LYR-015 | P2 | W2 | Todo | Layer color labels |
| LYR-016 | P0 | W2 | Verified | Blender-style outliner in the left Scene category: collections per scene that can be created, renamed, nested and deleted (contents move up), Delete hierarchy, duplicate, copy and paste, rows dragged in and out (several at once); organisation only (the canvas and the layers never change); one undo step each; stored in the scene's optional `outliner` (schema 7) (T-ALL P5 LCR; moved to the Scene category by V-series LCR) |
| LYR-017 | P0 | W2 | Verified | Selection follows both ways between the outliner, the canvas and the timeline; a selected element inside a closed collection or group opens it; search keeps parents; rubber band; context menus; eye, lock and mute for an element's lane and for everything in a collection (T-ALL P5 LCR; V-series LCR) |
| LYR-018 | P0 | W2 | Verified | Outliner menus are the shared vertical menu (keyboard too), rows are themed 32 px; Duplicate collection keeps the tree; Delete keeps layers, clips and pixels; rename by F2, double-click and menu (V7 LCR, spec 10.4) |

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
| TL-055 | P0 | W2 | Verified | The scroll range is the larger of the project and the viewport plus half a viewport (the project end can sit at the viewport centre); it grows with the content but never extends on its own while scrolling; the playhead stops at the content end (T-ALL LCR, supersedes the infinite timeline) |
| TL-056 | P0 | W2 | Verified | Every clip has dedicated left and right trim handles with a hit area of at least 8 CSS pixels, a resize cursor and a visible grip on hover or selection; the clip body keeps the move cursor |
| TL-057 | P0 | W2 | Verified | While moving or trimming a clip, dragging the playhead or dragging a marker, edges snap within 8 CSS pixels to clip edges, the playhead and markers, and a visible snap-guide line spans the ruler and all tracks at the snapped time |
| TL-058 | P0 | W2 | Verified | Dragging a clip onto another compatible track shows a ghost of the clip at its landing track and time while the original stays dimmed in place; releasing commits exactly the ghost position in one undo step; Escape cancels |
| TL-059 | P0 | W2 | Verified | Track header has Lock, Hide, Solo and Mute icon buttons with accessible names, tooltips and a distinct pressed state; Solo previews only soloed tracks (session-only, not saved, no history) |
| TL-060 | P0 | W2 | Verified | Keyboard equivalents for timeline gestures, listed in the shortcut sheet: Alt+Left/Right nudge selected clips one frame (Shift for ten), Alt+Up/Down move them to the adjacent compatible track, [ and ] trim the selected clip start or end to the playhead |
| TL-061 | P0 | W2 | Verified | Lanes come in three groups, top to bottom: text and shapes, visuals (video, images, backgrounds), audio, with a line between groups; at least three lanes when every kind is present, new lanes created on demand at the top of their group; lane order is the canvas stacking order (top lane in front); audio has a single lane and a second sound goes to the nearest free time (J7) |
| TL-062 | P0 | W2 | Verified | A clip dragged over a lane of another group shows a not-allowed cursor and a hatched lane, and the drop changes nothing (it snaps back); a lane's up and down buttons stay within its group (J7) |
| TL-063 | P0 | W2 | Verified | Bring forward, Send backward, Bring to front and Send to back move a top-level element between the lanes of its own group (a new lane when the next one is busy at its time; a lane emptied by the move goes), one undo step each; group children still move among their siblings (J7) |
| TL-064 | P1 | W2 | Verified | A shimmer skeleton of the editor (bar, panels, three timeline rows) shows from the first paint until the app has loaded, then goes (J8) |
| TL-065 | P0 | W2 | Verified | An empty scene shows one drop lane ("Drag & drop media here", dashed box) with no ruler or playhead; with exactly one lane, dashed ghost lanes "Add text" (above) and "Add audio" (below) add text or open Audio on click and open a new lane where they are on drop; two or more lanes hide them (T-ALL LCR) |
| TL-066 | P0 | W2 | Verified | Media dragged from the Media panel shows where it lands: over the canvas only, a box at the picture's size centred on the pointer; over a lane, a clip-sized ghost (T3: name and length pill, the lane not outlined); at a lane's edge, a purple separator with + whose drop makes a new lane there (J9, T3 LCR) |
| TL-067 | P0 | W2 | Verified | Media dragged over a lane of another group is refused (not-allowed, hatched lane, nothing on drop); over the middle third of a clip of the same group the clip shows a Replace label and the drop replaces it as one undo step (J9; the Replace menu is replaced by the T3 rule, T3 LCR) |
| TL-068 | P0 | W2 | Verified | A timeline clip dragged and released outside the timeline stays where it was (it dims while outside), and Escape during a clip drag cancels it; neither adds history (J9) |
| TL-069 | P0 | W2 | Verified | Clips are rounded and coloured by kind (text, shape, group, video, image, audio) with a kind icon before the name, a tooltip with start and length, an outline on hover; the selected clip has a purple outline, white trim handles and its length in a pill on the ruler (J10) |
| TL-070 | P0 | W2 | Verified | A marquee from empty time on the timeline selects the clips it touches across lanes; with the timeline focused Ctrl+G groups them and Ctrl+Shift+G ungroups, one undo step each (J10) |
| TL-071 | P0 | W2 | Verified | A gap between two clips on a lane is hatched; its trash button (named with the gap's length) closes it, moving the later clips on that lane left, in one undo step (J11) |
| TL-072 | P0 | W2 | Verified | A faint playhead with a time chip follows the pointer over the lanes and ruler and goes when the pointer leaves; the playhead has a white handle; moving a clip near another clip's edge snaps to it with a guide (J11) |
| TL-073 | P0 | W2 | Verified | The player bar: an AI wand (disabled, Planned: Wave 10) and scissors (Split) on the left; previous cut, back 5 s, play, forward 5 s and a timecode (mm:ss.hh / total) in the centre, with the frame steps and Stop kept; zoom out, zoom in, fit (the whole scene fits the lanes) and collapse floating on the right; the ruler's labels adapt to the zoom (J13) |
| TL-074 | P0 | W2 | Verified | Collapse in the player bar leaves only the player bar under a large preview, and Expand brings the lanes back; it is UI state (no history) (J13) |
| TL-075 | P0 | W2 | Verified | The timeline clip menu starts with a section for the kind of clip, each entry a registered command with its shortcut: video Duplicate (Ctrl+D), Copy, Paste, Delete, Split (S), Freeze frame (F), Edit duration (a popover), Rename (in place), Audio › (Mute, Detach audio), Auto cut (disabled, Wave 10) and More options (the right panel); image, shape and text the same without Freeze frame, Audio and Auto cut; then a divider and the earlier entries not already shown; Up, Down, Home, End, Right and Left work (J14) |
| TL-076 | P0 | W2 | Verified | A lane that a move, drop, cut or delete leaves without clips is removed in the same undo step, and Undo brings it back; e.g. two shapes on two lanes, one dragged into the other's lane, leaves one lane (T3 LCR) |
| TL-077 | P0 | W2 | Verified | An item dragged over the timeline shows a clip-sized ghost (its default length, kind colour, name and a length pill) at the snapped start time with a vertical guide; the lane itself is never outlined (T3 LCR) |
| TL-078 | P0 | W2 | Verified | Over a clip of the same group, the left third inserts before it and the right third after it (later clips on that lane ripple right); the middle third shows a Replace label on the clip and the drop replaces it as one undo step (T3 LCR) |
| TL-079 | P0 | W2 | Verified | A purple + line at a lane's top or bottom edge, and in the strips above the first and below the last lane, makes a new lane where its group fits; a lane of another group shows not-allowed and refuses; visual lanes are 56 px, text, shape and audio lanes 36 px, clips at least 28 px (T3 LCR) |
| TL-080 | P0 | W2 | Verified | A clip moved onto a + line or the middle of another clip follows the same rules and stays as a faint placeholder at its origin while dragged; released outside the timeline it stays where it was (T3 LCR) |
| TL-081 | P0 | W2 | Verified | The Player bar: left, the AI wand (planned), Split, Duplicate and + Marker with 13 px labels and 20 px icons; centre, First frame, Back 5 s, Previous frame, Play (the largest button), Next frame, Forward 5 s and Last frame; right, zoom out, zoom in, fit and collapse with 20 px icons and 32 px hit areas; the composition summary and px/s are no longer shown (T5 LCR) |
| TL-082 | P0 | W2 | Verified | The Player bar's timecode reads minutes and whole seconds in tabular digits (0:04 / 0:10); a click (or Enter on it) turns it into a field that takes seconds, m:ss(.cc) or h:mm:ss, Enter moves the playhead there (clamped to the scene) and Escape cancels; First and Last frame jump to the scene's ends; none of it is an undo step (T5 LCR) |
| TL-083 | P0 | W2 | Verified | Previous cut and Stop are no longer on the Player bar and stay in the palette (Jump to previous cut; Stop (back to the start)) (T5 LCR) |
| TL-084 | P0 | W2 | Verified | Lanes keep their own order (no group order: a text or shape lane may sit under a video lane, audio anywhere); a moved clip floats with the pointer in x and y keeping its grab offset, the original stays faint, Escape cancels, and the lane under the pointer decides the drop; lane headers read by kind and number (Video 1, Text 1, Shape 1, Audio 1) with a kind icon (U1 LCR) |
| TL-085 | P0 | W2 | Verified | Replace (a label on the clip) shows only when a new item from the library or Media is dragged over the middle of a clip; a clip moved on the timeline never replaces: over another clip it goes before or after it by the pointer's half, rippling later clips (U1 LCR) |
| TL-086 | P0 | W2 | Verified | Collapse leaves the canvas and one player bar: the wand (disabled), First frame, Back 5 s, Play/Pause, Forward 5 s, the timecode, a full-width scrubber (white knob, lighter played part, the smooth scrub) and Expand; no scene strip, status row or lanes; Collapse and Expand animate (240 ms, about 0 with reduced motion) (U4 LCR) |
| TL-087 | P0 | W2 | Verified | The frame row at the timeline's bottom steps, types and shows the current frame at the scene fps with no history; Auto mode shows only Current and the Manual switch (V7 LCR) |
| TL-088 | P0 | W2 | Verified | Empty scene: one drop lane with an illustration and "Drag & drop media here", no ruler, no playhead, transport disabled; while dragging the hint gives way to a "+" and the box turns purple; with one lane, ghost lanes Add text above and Add audio below (HIDE hides them), a drop on one opens a lane there; two lanes hide them (T-ALL LCR) |
| TL-089 | P0 | W2 | Verified | Every kind (shape, text, image, video, audio) opens a new lane above the first lane, between lanes or below the last; a lane of another group shows only the blocked cursor (no ghost, no + line, no highlight); the + on the insert line follows the pointer (T-ALL LCR) |
| TL-090 | P0 | W2 | Verified | The playhead is drawn above the lanes and clips; the selected clip's ruler band follows a clip move live (T-ALL LCR) |
| TL-091 | P0 | W2 | Verified | Playing while zoomed in pages the view: past 92% of the visible lanes the new left edge is the playhead time (no animation); the playhead never leaves the view; First frame returns to the first page (T-ALL LCR) |
| TL-092 | P0 | W2 | Verified | Lanes sit vertically centred under the ruler when they fit with 23 px above and below, else the first lane is 23 px under the ruler and the rest scroll; the preview keeps a minimum height (T-ALL LCR; V-series formula) |
| TL-093 | P0 | W2 | Verified | A click on any empty part of the lane area, the ruler, the canvas background or the stage clears the selection; on the lanes and the ruler it also seeks; a clip click only selects (V-series LCR, B1) |
| TL-094 | P0 | W2 | Verified | A marquee starts from any empty point of the lanes, selects the clips it touches live, clears when empty and scrolls the lanes at their edges (V-series LCR, B2) |
| TL-095 | P0 | W2 | Verified | The lane group is centred live by the spec formula (ResizeObserver and pointer moves) while the timeline is resized, ghost lanes included (V-series LCR, B3, B9) |
| TL-096 | P0 | W2 | Verified | Dragging the timeline's edge down: free, a snap at the default height, a short follow, then the collapsed player; never half a lane; back up with hysteresis; the preview keeps at least 160 px (V-series LCR, B5, B7, B19) |
| TL-097 | P0 | W2 | Verified | Auto mode dims nothing; in Manual mode the ruler and lanes are dimmed outside Start and End, live on every digit, wheel step (field hovered, not focused) and step arrow (V7 LCR, spec 10.2) |
| TL-098 | P0 | W2 | Verified | A gap before a lane's first clip has the hatched ghost with its trash button; deleting it moves the clip to 0 in one step (V-series LCR, B22) |
| TL-099 | P0 | W2 | Verified | Duplicate and Copy/Paste put the copy on a new lane directly above its original's, at the same start (paste at the playhead), selected, the playhead unchanged (V-series LCR, B23) |
| TL-100 | P0 | W2 | Verified | Lanes have no headers or labels; lock, hide, solo, mute and lane moves are in the lane's right-click menu; toasts are plain sentences; the hover hairline sits at the pointer; the ruler and clips scroll together (V-series LCR, B4, B6, B11, B12, B18) |
| TL-101 | P0 | W2 | Verified | Time 0 sits 18 px inside the timeline card and the content ends 18 px after it; the playhead at 0 is whole (V7 LCR, spec 10.3) |
| TL-102 | P0 | W2 | Verified | An empty project shows only the drop box, centred both ways: no ruler, playhead, dim, frame row or scrolling (V7 LCR) |
| TL-103 | P0 | W2 | Verified | A marquee held at the lanes' edge scrolls at most 300 px/s, never past the content, and stops on release (V7 LCR) |
| TL-104 | P0 | W2 | Verified | The collapsed player ends at least 8 px above the window and its controls are whole at 800, 900 and 1080 px (V7 LCR) |

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
| PB-011 | P1 | W4 | Verified | Scrubbing the playhead, clicking the ruler and frame stepping stay silent; audio sounds only while playing (U2 LCR; was: short snippets) |
| PB-012 | P0 | W4 | Todo | 1080p 30 fps H.264 plays back with at least 95 percent of frames on the reference machine |
| PB-013 | P1 | W7 | Todo | Master volume and mute with a level meter |
| PB-014 | P1 | W2 | Todo | Fullscreen playback with minimal controls |
| PB-015 | P0 | W4 | Verified | Dragging the playhead over video redraws the canvas continuously (at least 20 times over a 1 s scrub, the nearest cached frame shown while a seek is pending) and shows the exact frame on release (U2 LCR) |
| PB-016 | P0 | W2 | Verified | Manual mode: Start and End set the playback and export range (one undo step each, Start before End); play runs from Start and stops at End; the ruler and lanes dim outside; Auto removes it (V7 LCR, spec 11.1) |
| PB-017 | P0 | W2 | Verified | A Manual range is fixed: moving, stretching or adding clips never changes Start or End; ruler clicks, stepping, first and last frame and play stay inside it (V7 LCR, spec 11.1) |

## INS: Inspector and properties panel

Right panel. Sections depend on the selection. Every edit uses the same command path as the canvas.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| INS-001 | P0 | W2 | Todo | Properties panel content depends on selection: none (project settings), single layer by type, multiple layers (common properties), group |
| INS-002 | P0 | W2 | Verified | Editing Position X in the inspector moves the layer on the canvas and creates one undo step |
| INS-003 | P0 | W2 | Verified | Position Y, scale, rotation and opacity fields edit the layer and stay in sync with canvas gestures |
| INS-004 | P0 | W2 | Verified | Uniform scale with a lock toggle plus separate width and height |
| INS-005 | P0 | W2 | Todo | Anchor point control |
| INS-006 | P0 | W2 | Verified | Numeric inputs: scrub by dragging the label, arrow keys step, Shift steps by 10, invalid input reverts, Enter commits, Esc cancels |
| INS-007 | P0 | W2 | Verified | Sliders paired with numeric fields for opacity, rotation and scale |
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
| INS-018 | P0 | W2 | Verified | Every numeric control is the shared NumberField: up and down arrows step once (Shift ×10, Alt ×0.1), the wheel and arrow keys step a focused field, bounded fields show their range and a slider beside them, scrubbing or sliding previews live on the canvas and commits one undo step on release (J3 LCR) |

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
| HIS-007 | P1 | W4 | Verified | Undoing media import removes the clip without deleting the imported asset (behavior is documented) |
| HIS-008 | P0 | W2 | Verified | Undo and Redo cover project edits only; media import, rename, delete and folders, the project name, saved templates and signatures, library recents and every view or session setting are outside history, as listed in docs/UNDO-RULES.md |
| HIS-009 | P0 | W2 | Verified | One global undo stack whose entries are scoped to the scene they edited: Undo and Redo revert only that edit and open the scene it changed (J1 LCR) |

## TXT: Text, fonts and languages (Wave 3)

Users must be able to type text in any language and choose from very many fonts, like Canva. Preview and export must match.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| TXT-001 | P0 | W3 | Verified | Text panel offers Heading, Subheading and Body plus styled text presets; click adds to canvas at the playhead |
| TXT-002 | P0 | W2 | Verified | Text tool: click to create a text box at that point, or drag to define a box |
| TXT-003 | P0 | W2 | Verified | Double-click a text layer edits it inline on the canvas with caret, selection, copy and paste |
| TXT-004 | P0 | W2 | Verified | System input methods (IME) work while editing, including Hindi and other Indic phonetic keyboards and CJK composition |
| TXT-005 | P0 | W3 | Todo | Text content can also be edited in the inspector |
| TXT-006 | P0 | W3 | Todo | Font picker: searchable list, each font shown in its own typeface, recent and favorite fonts, categories |
| TXT-007 | P0 | W3 | Todo | Bundled curated fonts work offline; the wider Google Fonts catalog loads on demand and is cached |
| TXT-008 | P0 | W3 | Todo | Font picker can filter by script or language: Latin, Devanagari, Gujarati, Bengali, Tamil, Telugu, Kannada, Malayalam, Gurmukhi, Odia, Arabic, Hebrew, Thai, CJK, Cyrillic, Greek |
| TXT-009 | P0 | W3 | Todo | Users can upload their own .ttf, .otf, .woff and .woff2 fonts; they are stored with the project |
| TXT-010 | P1 | W2 | Claimed | Weight and style choices reflect what the font offers; variable font axes are adjustable |
| TXT-011 | P0 | W3 | Todo | Size numeric field and slider; auto-fit text to box option |
| TXT-012 | P0 | W3 | Todo | Text color; solid fill first, gradient fill later |
| TXT-013 | P1 | W3 | Todo | Gradient text fill |
| TXT-014 | P0 | W2 | Verified | Alignment left, center, right, justify |
| TXT-015 | P1 | W2 | Verified | Vertical alignment inside the box |
| TXT-016 | P0 | W2 | Verified | Line height, letter spacing and paragraph spacing |
| TXT-017 | P1 | W2 | Verified | Text case transform: UPPER, lower, Title |
| TXT-018 | P0 | W3 | Claimed | Text box modes: auto width, fixed width with auto height, fixed box |
| TXT-019 | P0 | W3 | Todo | Outline (stroke) and drop shadow on text |
| TXT-020 | P1 | W3 | Todo | Background box, highlight, glow |
| TXT-021 | P2 | W3 | Todo | Curved text on a path |
| TXT-022 | P1 | W3 | Todo | Text style presets (neon, outlined, retro and similar) with one-click apply |
| TXT-023 | P1 | W2 | Verified | Range styling: bold, italic, underline, strike, color, size, font for selected characters |
| TXT-024 | P1 | W2 | Verified | Bulleted and numbered lists |
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
| TXT-036 | P0 | W2 | Verified | Underline, strikethrough and uppercase toggle from the text toolbar, and a box taller than its text anchors its lines top, middle or bottom (H3 LCR) |
| TXT-037 | P2 | W8 | Todo | Dynamic text: page number, date and similar fields that update themselves |
| TXT-038 | P0 | W3 | Verified | Text panel: search; Add a text box; Magic Write (planned, W10); Default text styles (click or drag); Dynamic text (planned); Font combinations, Plain text, Text styles, Titles (hover preview) and Two line with See all; Captions (planned, W8) |
| TXT-039 | P1 | W5 | Verified | Animated titles in Text › Titles: each brings its entrance preset (pop, slide, typewriter, zoom, wipe, fade) with its clip in one undo step, and its card previews the entrance on hover |
| TXT-040 | P0 | W2 | Verified | Bundled open-licence fonts with real weights 100 to 900 (Inter, Poppins and Noto Sans Devanagari, which also cover Devanagari) work in the preview and export; the weight list offers only what a font has (system fonts: Regular and Bold); Regular, Medium, Semibold and Bold look visibly different (J5 LCR) |
| TXT-041 | P0 | W2 | Verified | The Bold button shows the resolved weight of the selection (the whole box's characters, runs included, or the selected characters while editing), so text that is already bold shows Bold on in the toolbar and the right panel (J5 LCR) |
| TXT-042 | P0 | W2 | Verified | While a text box is typed in, its drawn box grows with every new line (live, before anything is stored); the stored box after editing ends draws exactly as it did while typing, so nothing jumps (T6 LCR) |
| TXT-043 | P0 | W2 | Verified | A fixed-width (wrapped) text box wraps live as it is typed and keeps its width; it grows in height only (T6 LCR) |
| TXT-044 | P0 | W2 | Verified | Auto height (Spacing popover, on by default) can be turned off: the box keeps its height, the text past it is clipped, the editor marks the overflow (a badge on the box's bottom edge, never exported; a dashed line while editing) and turning it on again grows the box to its text; each switch is one undo step (T6 LCR) |

## SHP: Shapes, graphics and elements (Wave 5)

Vector shapes, stickers, icons, backgrounds and image styling.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| SHP-001 | P0 | W5 | Verified | Shape tools: rectangle, rounded rectangle, ellipse, line, arrow |
| SHP-002 | P1 | W5 | Verified | More shapes: triangle, polygon, star, heart and similar |
| SHP-003 | P0 | W5 | Verified | Fill: solid color with opacity, none |
| SHP-004 | P1 | W5 | Verified | Fill: linear and radial gradient |
| SHP-005 | P0 | W5 | Verified | Stroke: color, width, dash style, caps and joins |
| SHP-006 | P0 | W5 | Verified | Corner radius control on rectangles |
| SHP-007 | P1 | W5 | Todo | Drop shadow and blur on shapes |
| SHP-008 | P1 | W5 | Todo | SVG import as an editable vector layer |
| SHP-009 | P0 | W5 | Todo | Elements panel: shapes, lines, frames, arrows, emoji and stickers, open-license icons |
| SHP-010 | P1 | W5 | Todo | Frames: drop an image into a frame shape |
| SHP-011 | P0 | W5 | Todo | Image layer styling: crop, flip, corner radius, border, shadow |
| SHP-012 | P1 | W5 | Todo | Animated GIF, APNG and WebP stickers |
| SHP-013 | P0 | W5 | Verified | Backgrounds: solid color and gradient background layers |
| SHP-014 | P1 | W5 | Todo | Logo or watermark quick-add with corner placement presets |
| SHP-015 | P2 | W5 | Verified | Freehand pen and boolean shape operations |
| SHP-016 | P2 | W8 | Todo | Data charts (bar, line, pie) from typed or pasted data |
| SHP-017 | P2 | W8 | Todo | Lottie import |
| SHP-018 | P0 | W2 | Verified | A Draw category in the left rail offers Pen, Marker, Highlighter, Glow pen and Eraser; each brush keeps its own size, colour and opacity (1 to 100, each with a number field, slider and presets; colour from the design's colours, the picker or the eyedropper); choosing a tool puts the canvas in draw mode, and Esc, V or another category leaves it |
| SHP-019 | P0 | W2 | Verified | Each freehand stroke becomes one undoable shape layer with a clip at the playhead; it can be selected, moved, resized, saved and reloaded, and draws the same in preview and export |
| SHP-020 | P0 | W2 | Verified | The Eraser removes the ink it passes over: strokes it crosses are cut into parts (still one layer each) and strokes it covers are removed, as one undo step per drag |
| SHP-021 | P0 | W2 | Verified | The brushes draw differently: Pen a solid round line, Marker a softer rim, Highlighter flat (chisel) ends and translucent over what is under it, Glow pen a bright core with a halo |
| SHP-022 | P0 | W2 | Verified | Strokes are smoothed; holding Shift draws a straight line; a circle the size of the brush follows the pointer while drawing |
| SHP-023 | P1 | W2 | Todo | Shape assist: a roughly drawn line, rectangle or ellipse can become the clean shape |
| SHP-024 | P1 | W2 | Verified | Signature (Draw panel): type a name in a script style, draw it on a pad or upload an image; it is added centred as one undo step and can be kept in this browser and added again with one click (H6 LCR) |
| SHP-025 | P2 | W8 | Todo | Tables: insert and edit a table of cells |
| SHP-026 | P0 | W5 | Verified | Elements panel: Recently used, Browse categories (Shapes and Graphics live; Photos, Videos, 3D, Animations, Audio, Tables, Charts, Frames and Grids planned with their wave), a Shapes page (Lines with solid, dashed, dotted, arrow and double arrow; Basic shapes; Polygons; Stars; Arrows; Flowchart shapes) and a Graphics page (Featured, Gradients, Backgrounds) |
| SHP-027 | P0 | W2 | Verified | Draw palette at the canvas edge: Select; Draw with the brush flyout; Shape and Line drawn by dragging; Sticky note and Text by click (Text by drag for its width); Signature; Table planned; the left panel collapses while it is open and comes back when it closes; each placement is one undo step |
| SHP-028 | P1 | W5 | Verified | Flowchart shapes in Elements › Shapes: terminator, process, decision, data, document, predefined process, connector, manual input, preparation, manual operation, delay, merge, off-page connector and display |
| SHP-029 | P0 | W2 | Verified | A shape's Solid, Linear and Radial fills share one stop list: Solid shows the first stop, and switching away and back restores the stops exactly (J2 LCR) |

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
| ANI-020 | P1 | W8 | Todo | Scene (page) animation: one preset animates every layer of a scene |
| ANI-021 | P0 | W5 | Verified | Editor and 2D Animation modes: stopwatches, keyframe diamonds and timeline keyframes show in 2D Animation only; the switch crossfades in 320 ms and keeps the selection; 3D Animation is shown as planned (H4 LCR) |
| ANI-022 | P0 | W5 | Verified | In Editor mode a change to an animated property (canvas drag or nudge, Inspector, Position panel, toolbar) is refused with "Animated in 2D Animation" and a button that opens 2D Animation (H4 LCR) |
| ANI-023 | P0 | W5 | Verified | Animate is a right-rail tab for every single element (text, shapes, drawings, groups, images, video): In, Out, Loop (and Ken Burns for images) as thumbnail grids, three per row, None first, the chosen one highlighted, each thumbnail playing its motion (live preview), with duration, direction and period fields; the toolbar's Animate button opens it; there is no left Animate side panel and no Animate section in the object panels (U5 LCR) |

## VID: Video and image clip operations

Operations on media clips. Speed, freeze and chroma key are Wave 6.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| VID-001 | P0 | W4 | Verified | Video clips can be trimmed and split with frame-exact seeking |
| VID-002 | P0 | W4 | Verified | Picture-in-picture: clips on overlay tracks can be moved, scaled and rotated on the canvas |
| VID-003 | P0 | W4 | Verified | Crop tool for image and video layers with aspect lock and handles |
| VID-004 | P0 | W4 | Todo | Fit, Fill, Stretch and Custom modes handle media whose aspect differs from the canvas |
| VID-005 | P0 | W4 | Verified | Default still image duration is 5 seconds and adjustable |
| VID-006 | P0 | W4 | Verified | Detach audio from a video clip |
| VID-007 | P1 | W4 | Todo | Fill mismatched aspect ratios with a blurred copy of the media |
| VID-008 | P1 | W4 | Todo | GIF is treated as an animated clip |
| VID-009 | P1 | W4 | Verified | Replace media keeps all edits on the clip |
| VID-010 | P0 | W4 | Verified | Constant speed from 0.1x to 8x |
| VID-011 | P1 | W4 | Verified | Reverse a clip |
| VID-012 | P0 | W4 | Verified | Freeze frame at the playhead |
| VID-013 | P0 | W6 | Todo | Chroma key (green screen) with tolerance and edge softness |
| VID-014 | P2 | W8 | Todo | Stabilization |
| VID-015 | P0 | W2 | Verified | Clip speed 0.1x to 8x (menu presets 0.25x to 4x) is a non-destructive clip property set through an undoable command; the clip's timeline duration becomes source length divided by speed, a speed badge shows on the clip, and slowing a clip into its neighbor is refused; offered in the timeline clip and canvas context menus |
| VID-016 | P0 | W2 | Verified | Reverse toggles a non-destructive clip property through an undoable command, keeps source range and duration, shows a badge, and trim and split respect reversed source time; offered in the timeline clip and canvas context menus |
| VID-017 | P0 | W2 | Verified | Freeze frame toggles a non-destructive hold of one source frame (the frame under the playhead, else the first frame) for the whole clip duration through an undoable command, with a badge; offered in the timeline clip and canvas context menus |
| VID-018 | P0 | W2 | Verified | A picture or video takes a border (colour, width, solid, dashed or dotted) and rounded corners, drawn the same in the preview and the export (H3 LCR) |

## FX: Effects and filters (Wave 6)

Requires schema v5 (effects are currently blocked by the schema). GPU rendering via WebGL2 behind the renderer boundary.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| FX-001 | P0 | W6 | Todo | Effects tab lists categories with live preview thumbnails and hover preview |
| FX-002 | P0 | W6 | Todo | Apply an effect by click or drag to a clip or layer; effects stack, reorder, toggle, copy and remove |
| FX-003 | P0 | W6 | Todo | Effect parameters appear in the inspector and can be keyframed |
| FX-004 | P0 | W6 | Verified | Filters (looks): a set of one-click looks with an intensity slider |
| FX-005 | P0 | W6 | Todo | Gaussian blur and background blur |
| FX-006 | P0 | W6 | Todo | Vignette, film grain and glow |
| FX-007 | P1 | W6 | Todo | Motion blur, radial blur, pixelate, mosaic, glitch, RGB split, chromatic aberration, wave, mirror, kaleidoscope, invert, sepia, duotone, halftone |
| FX-008 | P1 | W6 | Todo | Adjustment layer applies effects to everything below it |
| FX-009 | P1 | W6 | Todo | Effects can be applied to groups and compositions |
| FX-010 | P0 | W6 | Verified | Effects render identically in preview and export (parity tests) |
| FX-011 | P0 | W6 | Todo | WebGL2 rendering with a safe fallback when the GPU or context is lost |
| FX-012 | P1 | W6 | Todo | 1080p 30 fps stays real-time with three effects on the reference machine |
| FX-013 | P2 | W6 | Todo | Save an effect stack as a preset |
| FX-014 | P2 | W8 | Todo | Custom shader effects through a sandboxed plugin API |
| FX-015 | P0 | W6 | Verified | The right panel's Filters, Effects and Adjust colors apply the FX library (filters with intensity, effects added and removed with intensity, exposure, contrast, saturation and temperature, blend mode, Reset) to the selected clips, one undo step each, saved with the project (T-ALL P6 LCR) |
| FX-016 | P0 | W6 | Verified | Filters is a 3-column tile grid (80 px tiles, sticky search, None first and selected): 49 Clipchamp-named filters as preset bundles over the FX library, thumbnails of the selected picture through the library (lazy, cached, one job a frame), hover never changes the canvas, a click applies one step, Intensity opens under the tile's row (V-series LCR) |
| FX-017 | P0 | W6 | Verified | Effects is the same tile grid: the Clipchamp effect names mapped to the library (the library's extra under More), several at once, a click toggles, None clears all, the selected effect's own settings under its row, hover animates the tile but not the canvas (V-series LCR) |
| FX-018 | P0 | W6 | Verified | Every filter, effect and transition tile changes the preview and the exported PNG frame of a test picture and neither is blank; a contact sheet of every tile is written for review (V-series LCR) |

## TR: Transitions (Wave 6)

Between clips and at clip edges.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| TR-001 | P0 | W6 | Todo | Transitions tab with animated previews |
| TR-002 | P0 | W6 | Todo | Apply by dropping between two adjacent clips or on a clip edge; default duration 1 s; drag handle adjusts duration |
| TR-003 | P0 | W6 | Todo | Types: cross dissolve, fade to black, fade to white, slide (four directions), push, wipe, zoom |
| TR-004 | P1 | W6 | Verified | More types: spin, blur, glitch, iris, and similar |
| TR-005 | P0 | W6 | Todo | Insufficient source handles are detected and handled with a clear message or automatic adjustment |
| TR-006 | P0 | W6 | Todo | Replace or remove a transition; apply one to all cuts on a track |
| TR-007 | P0 | W6 | Todo | Transitions render identically in preview and export |
| TR-008 | P1 | W6 | Todo | Video cross dissolve also crossfades the audio |
| TR-009 | P1 | W6 | Todo | Alignment choice: centered, start or end on the cut |
| TR-010 | P1 | W6 | Dropped | The left Transitions category lists the transition tiles in groups with drawn thumbnails and search; a click applies one to the selected cut (TR-015) (V-series LCR) |
| TR-011 | P0 | W2 | Verified | Where two clips touch on a lane a + adds a transition and opens its panel; a cross fade mixes them across the cut in the preview and the export; None removes it (J12; V-series LCR) |
| TR-012 | P0 | W6 | Verified | The Transition panel's planned entries and a More group are the FX library's pixel transitions (cross blur, burn, wipes, iris, push, zoom, spin, swirl, glitch, bloom, page turn, cube flip and more), drawn across the cut the same in the preview and the export (T-ALL P6 LCR) |
| TR-013 | P0 | W2 | Verified | A "+" shows with the pointer near a cut between two touching clips (tooltip Add transition); a click adds Fade through black (one step, clips unchanged) and shows a lavender marker over a band as wide as the transition; the marker opens the right Transition panel (None, Fades & blurs, Tiles, Wipes, More) where a tile swaps it, Duration under its row sets it and None removes it; Delete and the marker's menu remove it (V-series LCR) |
| TR-014 | P0 | W2 | Verified | At its midpoint Fade through black draws black and Fade through white white, in the canvas and the exported frame (V-series LCR) |
| TR-015 | P1 | W2 | Dropped | The left Transitions category shows the same tiles; a click applies one to the selected cut marker, otherwise it says to pick a cut (V-series LCR) |
| TR-016 | P0 | W6 | Verified | Every transition tile changes the canvas and the exported frame inside its window and neither is blank; contact sheet (V-series LCR) |
| TR-017 | P0 | W2 | Verified | One Transitions place: no left category; the right Transition panel has the groups, every drawn tile and search (V7 LCR, spec 10.5) |
| TR-018 | P0 | W2 | Verified | "+" between two scenes adds a transition (one step, no scene shortened) that plays and exports across the cut; its marker opens the right panel; deleting a scene removes its transitions (V7 LCR, spec 10.5) |

## MSK: Masks, blend modes and compositing (Wave 6)

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| MSK-001 | P0 | W6 | Claimed | Blend modes: Normal, Multiply, Screen, Overlay, Add, Darken, Lighten |
| MSK-002 | P1 | W6 | Todo | More blend modes: Soft Light, Hard Light, Difference, Color Dodge, Color Burn, and similar |
| MSK-003 | P0 | W6 | Todo | Masks: rectangle and ellipse with feather, invert and opacity |
| MSK-004 | P1 | W6 | Todo | Freehand bezier masks; animated mask paths |
| MSK-005 | P1 | W6 | Todo | Track matte using the layer above (alpha or luma) |
| MSK-006 | P1 | W9 | Todo | Transparent export (alpha WebM or PNG sequence) |

## CLR: Color correction and grading (Wave 6)

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| CLR-001 | P0 | W6 | Claimed | Color panel: exposure, contrast, highlights, shadows, whites, blacks, saturation, vibrance, temperature, tint, sharpen |
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
| AUD-002 | P0 | W7 | Claimed | Clip volume in dB, keyframeable; clip mute; master volume |
| AUD-003 | P0 | W7 | Verified | Fade in and fade out handles |
| AUD-004 | P0 | W7 | Todo | Detach or extract audio from video into an audio track |
| AUD-005 | P0 | W4 | Verified | Audio plays during preview and scrubbing and stays in sync |
| AUD-006 | P0 | W7 | Todo | Peak meters on master and per track |
| AUD-007 | P0 | W4 | Verified | Track mute and solo work audibly |
| AUD-008 | P0 | W7 | Verified | Voiceover recording from the microphone with countdown and level monitor onto a new audio track |
| AUD-009 | P1 | W7 | Verified | Pan left and right |
| AUD-010 | P1 | W7 | Todo | Speed change with pitch preservation |
| AUD-011 | P1 | W7 | Verified | EQ, compressor and loudness normalization |
| AUD-012 | P1 | W7 | Verified | Auto ducking of music under speech (algorithmic) |
| AUD-013 | P1 | W7 | Claimed | Royalty-free music and sound effects library with clear licenses |
| AUD-014 | P1 | W7 | Todo | Audio envelope drawing directly on the clip |
| AUD-015 | P0 | W7 | Verified | Audio mixdown in export equals the preview mix (48 kHz stereo) |
| AUD-016 | P2 | W7 | Todo | Beat detection markers |
| AUD-017 | P2 | W7 | Verified | Multichannel to stereo downmix |
| AUD-018 | P0 | W4 | Verified | Audio layers are never drawn, picked, boxed or snapped to on the canvas; they exist as clips on audio tracks, in the Scene list and in the side panel (also after Detach audio and when an audio file is dropped on the canvas) |
| AUD-019 | P0 | W7 | Verified | An audio clip's rail is Audio, Fade and Speed; the Audio panel has Volume 0 to 200 % and Mute, then Pan, Equalizer, Compressor, Loudness and Voice / Music with ducking in closed groups with Reset; one step each (V7 LCR, spec 11.3) |
| AUD-020 | P0 | W7 | Verified | Fade sets an audio clip's sound fades (0 to 5 s); a video's Fade is one control for picture and sound; Detach audio gives the audio clip the fades, in one step (V7 LCR) |
| AUD-021 | P1 | W7 | Verified | The left Audio category is a built-in sound pack of twelve generated sounds with hover preview, search and click or drag to add on a new audio lane; Stock music is Planned (V7 LCR) |
| AUD-022 | P0 | W7 | Verified | Record & create: Screen and camera, Camera and Screen planned; voiceover recording with countdown, level meter, Pause / Resume, review and Add to timeline; a refused microphone is explained with Retry; leaving asks Keep or Discard (V7 LCR, spec 11.4) |
| AUD-023 | P1 | W7 | Verified | Text to speech panel: language search, voices with descriptions, speed, text with count and Add pause, Preview and Save; unsaved changes with Discard; a speech clip's Save replaces its audio in one step (tested with the test voice provider; neural voices not shipped, D-214) (V7 LCR, spec 11.5) |

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
| TPL-010 | P0 | W8 | Verified | A content library (manifest, validator, loader) fills Templates, Elements, Text and Graphics with search and drawn previews, and says so when it cannot load (H5 LCR) |
| TPL-011 | P0 | W8 | Verified | Starter Pack 1: about 80 shapes, 40 backgrounds (gradients and layered shapes), 30 text styles and 12 templates, original and generated by a script; a template becomes a new scene sized to the canvas, with clips (H5 LCR) |
| TPL-012 | P0 | W8 | Verified | Library cards drag onto the canvas and insert at the drop point as one undo step; a card is never imported as media and its preview image never drags on its own; a click still inserts at the centre |
| TPL-013 | P0 | W8 | Verified | Adding a template asks Replace this scene, Add onto this scene or New scene (the last choice is the default; Enter confirms, Escape cancels; repeated clicks open one dialog); a template of another size is scaled to fit and centred; a toast offers Undo; a new scene crossfades in |
| TPL-014 | P0 | W8 | Verified | Templates panel: search; rows All, Video, Graphics, Social media, Education and My Templates; each opens a page with subcategory chips (each with its canvas size), Recently used and a grid; an empty subcategory says No templates yet |
| TPL-015 | P1 | W8 | Verified | Save as template (empty canvas menu, scene strip menu): a name and a category, kept in this browser under My Templates (not the project, not an undo step); media kept by reference up to 50 MB, otherwise left out with a warning; a saved template is added like any template |

## EXP: Export (Wave 5 first version, Wave 9 full)

Offline frame-accurate render, never realtime capture.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| EXP-001 | P0 | W5 | Verified | Export dialog: format MP4 H.264 and AAC, resolution and frame rate, quality preset, range, file name |
| EXP-002 | P0 | W5 | Verified | Progress shows percent and ETA, can be cancelled, and the UI stays responsive |
| EXP-003 | P0 | W5 | Verified | Rendering is frame-accurate and offline through a worker, independent of playback speed |
| EXP-004 | P0 | W5 | Verified | Audio mixdown is included and in sync |
| EXP-005 | P0 | W5 | Verified | Exported files pass container checks in e2e by an independent read-back (codec, resolution, fps, duration, audio); a one-off ffprobe check is recorded in the report |
| EXP-006 | P0 | W5 | Verified | Quality 720p, 1080p or 4K sets the export's shorter edge in the canvas's shape; platform sizes are canvas sizes (CV-055), not export presets (H3 LCR) |
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
| EXP-019 | P0 | W5 | Verified | Export joins every scene one after another, with an option to export the current scene only |
| EXP-020 | P0 | W5 | Verified | Export Start frame and End frame, linked to the seconds by the fps; video and audio cover exactly [Start, End); out-of-range values are clamped with a message (V7 LCR, spec 11.2) |

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

## CODE: Code animations (X-series, CODE-TIERS-SPEC)

Imported code animations: Tier A becomes ordinary layers; Tiers B and C are baked to frames.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| CODE-001 | P1 | W8 | Verified | A code animation is a schema 8 layer (`code`: tier, source, meta, params, bake key, template id): a full-canvas transparent video layer without media on a visual lane, moved, trimmed (up to the animation's end), sped, reversed, faded and given effects, transitions and presets like a video clip (X1, CODE-TIERS-SPEC 5) |
| CODE-002 | P1 | W8 | Verified | Baked frames: frames are rendered in order into a lossless PNG frame cache (OPFS, IndexedDB fallback) keyed by source, params, size, frame rate, duration, seed and library versions, with memory and disk budgets and least-recently-used eviction; a partly baked clip plays its baked part and shows Rendering n % with Cancel, then Resume; Full or Draft (50 %) quality per layer (X1) |
| CODE-003 | P1 | W8 | Verified | Preview and export read the same baked frames: Export frame and the video export bake at Full quality first, the export worker draws code layers from the cache, and the export Start/End range is respected (X1) |
| CODE-004 | P1 | W8 | Verified | Import code animation: from the Media panel's Import menu, by dropping a .json, .js, .mjs or .html file, or by pasting; classified A (Composition Spec, applied in one undo step into a new or the current scene), else B (block), else C (free code), else plain errors with line, what and how to fix; 1 MB and 120 s limits (X2) |
| CODE-005 | P1 | W8 | Verified | The import dialog shows the tier badge, a live thumbnail, the params form and the duration, with Add to timeline, Save as template (checked) and Cancel; a Tier C result says it runs in a sandbox and is rendered to frames; a code layer's Code button opens it as Edit code (X2) |
| CODE-006 | P1 | W8 | Verified | Animation settings: one control per declared param (number with slider, colour, text, switch, select); Tier B re-renders as it changes, Tier C applies with Apply (re-bake); one undo step per applied change (X3) |
| CODE-007 | P1 | W8 | Verified | Fade, Speed, Reverse, Filters, Effects, Adjust colors and Transitions change a code layer in the preview and in the export (X3) |
| CODE-008 | P1 | W8 | Verified | Code templates: Save as template keeps name, category, tier, source, meta, default params and thumbnail in My Templates (not an undo step); Templates > My Templates > Code animations shows them with a hover preview; click or drag inserts a code layer at the playhead on a new lane in one undo step; the project keeps its own copy of the source (X4) |
| CODE-009 | P1 | W8 | Dropped | Code templates can be renamed, duplicated, deleted (with Restore), exported to and imported from a .json file (X4) |
| CODE-010 | P1 | W8 | Verified | The Scene outliner shows code layers with a code icon; hide and lock work on them (X4) |
| CODE-011 | P1 | W8 | Verified | The real sandboxed Tier C runtime runs the ten reference samples end to end: import, bake, play, scrub, a param change, Fade and an effect, a short export whose frames match the preview (measured maximum channel difference recorded) (X5) |
| CODE-012 | P1 | W8 | Verified | A hostile source (network, parent access, storage, endless loop, import()) is refused or stopped with a clear message and the editor is untouched; a heavy bake can be cancelled (X5) |
| CODE-013 | P1 | W8 | Verified | A code template survives a page reload and renders when inserted into a new project (X5) |

## QT: Q-series fixes and T-series themes and AI brief

Group timing, presets and controls, keyframes and pivot, AI import, motion setting, themes and the AI brief.

| ID | Pri | Wave | Status | Item |
| --- | --- | --- | --- | --- |
| QT-001 | P1 | W8 | Verified | Lengthening, trimming or moving a group clip carries its children in time (the same shift and the same edge change), in the model; a lengthened background group still draws to its new end (Q1) |
| QT-002 | P1 | W8 | Verified | Ungroup works for normal groups by baking the group's position, scale, rotation and opacity into each child; a refused Ungroup shows one toast, never a stack (Q1) |
| QT-003 | P1 | W8 | Verified | A background group (from Use as background or a library background) cannot be ungrouped; Ungroup is disabled with the tooltip "Background is one block" (Q1) |
| QT-004 | P1 | W8 | Dropped | Animate > Creator starts with None and highlights only the preset the layer really has (Q2) |
| QT-005 | P1 | W8 | Verified | The Controls panel opens with a line that says what is animated, e.g. "Animating: Scale - 0.0s to 1.0s", listing every animated property (Q2) |
| QT-006 | P1 | W8 | Verified | Remove animation in the Controls panel removes a preset's record, its keyframes and its controls in one undo step (Q2) |
| QT-007 | P1 | W8 | Verified | When a preset's keyframes are deleted by hand no orphan controls stay: the panel shows Edited manually with Reset to controls, or drops the preset when nothing of it is left (Q2) |
| QT-008 | P1 | W8 | Verified | Delete on a selected keyframe removes only that keyframe, never other keyframes at nearby times (Q2) |
| QT-009 | P1 | W8 | Verified | Timeline keyframe diamonds are at least 10 px, contrast on dark and light, highlight on hover and fill when selected (Q3) |
| QT-010 | P1 | W8 | Verified | Every layer has an Anchor (pivot) control in Properties, a 9-point grid with the centre by default; rotation and scale turn about it (Q3) |
| QT-011 | P1 | W8 | Verified | The Spin preset rotates about the anchor (the centre by default), so a rectangle spun 90 degrees keeps its centre fixed (Q3) |
| QT-012 | P1 | W8 | Verified | The left rail has an AI category that lists everything imported from Creator Packs, grouped by kind (Q4) |
| QT-013 | P1 | W8 | Claimed | AI-made items show a small AI chip in every library panel and the Media panel (Q4) |
| QT-014 | P1 | W8 | Verified | The creator pack dialog checks a pasted or chosen pack automatically; Add selected to library is enabled as soon as one item passed; each item says pass, warning or rejected with a plain reason (Q4) |
| QT-015 | P1 | W8 | Verified | After an import a result card says how many items were added and opens the AI category (Q4) |
| QT-016 | P1 | W8 | Verified | Settings > Animations (Auto, On, Off; default Auto) controls panel transitions, with a system reduce-motion diagnostic; On animates even when the system asks for reduced motion (Q5) |
| QT-017 | P1 | W8 | Verified | A Theme panel (right tab and left rail) lists 8 built-in themes with previews (T1) |
| QT-018 | P1 | W8 | Verified | Apply theme recolours text, fonts, palette-slot fills, the background and the default easing in one undo step; manual colours stay unless Also override manual colors is ticked (T1) |
| QT-019 | P1 | W8 | Verified | Layers made from a theme or an AI item remember their palette slot, so a theme switch recolours them (T1) |
| QT-020 | P1 | W8 | Verified | My themes: save the current theme, rename and delete; stored in the project and in My library (T1) |
| QT-021 | P1 | W8 | Verified | Creator Packs accept a theme item kind with the same schema, checked by the quality gate and documented with examples (T1) |
| QT-022 | P1 | W8 | Verified | Copy AI brief copies one plain-text block (task header, project facts, the live library index, the authoring rules and an optional request) under 40 KB, with a fallback box when the clipboard is blocked (T2) |

## RA: R-ALL fixes (groups, AI importer, shared library panel, My Templates, themes)

Hand-test fixes of PR #31.

| ID | Pri | Wave | Status | Item |
| --- | --- | --- | --- | --- |
| RA-001 | P1 | W8 | Verified | The timeline clip menu has Group and Ungroup, the same actions as the canvas menu and Ctrl+G / Ctrl+Shift+G (R1) |
| RA-002 | P1 | W8 | Verified | Grouping again keeps the original group's name when the layers came from one Ungroup, else the first child's name; never a bare "Group" when a name exists (R1) |
| RA-003 | P1 | W8 | Verified | Group and Ungroup show one success toast ("Grouped 2 layers", "Ungrouped into 2 layers"); a refusal shows one toast with the reason (R1) |
| RA-004 | P1 | W8 | Verified | One AI importer (AI › Import, next to Copy AI brief) takes a single code animation or a Creator Pack (pasted or chosen), checks it on its own and shows pass, warning or rejected with plain reasons per item (R2) |
| RA-005 | P1 | W8 | Verified | Every motion item in the importer shows all its controllers, editable before adding; the chosen values become its defaults; a code animation lands in AI › Motion, a pack's items are grouped by kind (R2) |
| RA-006 | P1 | W8 | Verified | Media › Import holds only media entries (no Import code animation, Import creator pack or Copy library index for AI) (R2) |
| RA-007 | P1 | W8 | Verified | AI items appear only in the AI category: Templates, Elements, Text, Backgrounds and Animate list no AI items or AI chips; code animations saved in Templates before move to AI › Motion once (R2) |
| RA-008 | P1 | W8 | Verified | Media, AI and My Templates use one shared library panel: title row with collapse, search with a New folder icon button on the same row, the panel's primary actions, scrollable tabs (All, one per category with items, user folders), a two-column grid of big 16:9 cards (R3) |
| RA-009 | P1 | W8 | Verified | A card's click adds it to the scene; its "⋯" (More options) opens the same menu as a right-click (Rename, Add to scene, Move to folder, Details, Delete) and its "+" (Add to Scene) adds it once; both are visible on hover and keyboard focus (R3) |
| RA-010 | P1 | W8 | Verified | Library tabs come only from existing items: no empty automatic categories; deleting the last item of a category removes its tab; user folders may stay empty (R3) |
| RA-011 | P1 | W8 | Verified | Saving, renaming, moving and deleting library items in Media, AI and My Templates never create or consume undo steps; Undo and Redo never bring back or remove a library item (R3) |
| RA-012 | P1 | W8 | Verified | Every library card shows a 16:9 thumbnail through one thumbnail adapter; motion and preset cards play a short looping preview on hover, one card at a time (R3) |
| RA-013 | P1 | W8 | Verified | Media and AI are rebuilt on the shared panel; Media keeps import, the drop zone, sort, details and folders (as tabs); AI has Import and Copy AI brief and "⋯ › Delete" on every item (R4) |
| RA-014 | P1 | W8 | Verified | A left-rail category My Templates on the shared library panel replaces the My Templates sub-category of Templates; old saved scenes move into it (R5) |
| RA-015 | P1 | W8 | Verified | Canvas and timeline right-click offer Save to My Templates with a kind submenu (Shape, Text, Background, Animation, Video, Image, Annotation, Sticker); several layers save as one Group item; nothing selected (or the scenes strip) saves the scene; keyframes and controls are kept; a toast "Saved to My Templates › Kind" has Open (R5) |
| RA-016 | P1 | W8 | Verified | My Templates tabs come from saved kinds only; Add to scene places a copy like a library item in one undo step; rename, move, details and delete never touch placed layers; items persist in My library across a reload and are never undo steps (R5) |
| RA-017 | P1 | W8 | Verified | Applying a theme keeps hand-picked colours unless Also override manual colors is ticked; the toast says how many were kept or overridden ("Playful Pop applied. 2 manual colours kept.") (R6, theme library by Codex) |
| RA-018 | P1 | W8 | Verified | The Theme panel has one My themes list (no second My library list); Save current as theme is disabled until named and says "Name already used"; save, rename and delete go to the theme library with toasts and never create or consume undo steps (R6) |
| RA-019 | P1 | W8 | Verified | Rename and Delete of a saved theme are in a "⋯" menu (tooltip More options); five rounds of save, rename and delete raise no error (R6) |
| RA-020 | P1 | W8 | Verified | Settings › Animations (Auto, On, Off) also governs the shared library panels (Media, AI, My Templates): panel slides and card buttons animate with On and not with Off (R7) |

## S1: Clipchamp-level library panels and menus

Hand-test fixes of PR #33 (S1 brief).

| ID | Pri | Wave | Status | Item |
| --- | --- | --- | --- | --- |
| S1-001 | P1 | W8 | Verified | Every left-rail and right-rail panel has one shared header: the title on the left and exactly one collapse button (the drawer icon) on the right; no Back arrows or Close crosses in panel headers (Part 1) |
| S1-002 | P1 | W8 | Verified | Media, AI and My Templates share one layout: every left panel is 380 px wide from 1800 px windows; search (40 px) with a 40 × 40 New folder 8 px after it; Media's Import split button (44 px) and drop zone (56 px), AI's two equal buttons; every row on one left and right edge with 16 px padding (Part 2) |
| S1-003 | P1 | W8 | Verified | Library cards are two equal columns (12 px gap, at least 165 px at 1920 × 1080) in Media, AI and My Templates; "⋯" (dark, top-right) and "+" (accent, bottom-right) are 32 px, 8 px inside the thumbnail, visible on hover, focus and touch, and never also add the card (Part 2) |
| S1-004 | P1 | W8 | Verified | Media always shows All, Images, Videos and Audio; AI and My Templates show All plus one chip per kind that has items; AI cards carry no AI chip; preset cards have a drawn thumbnail (Part 2) |
| S1-005 | P1 | W8 | Verified | AI and My Templates cards drag like every library card (one controller, from the shared card): a canvas drop adds the item centred on the drop point, a timeline drop adds its clip at the drop time and lane, one undo step; Media still drags (Part 3) |
| S1-006 | P1 | W8 | Verified | One menu placement for every context menu: fixed to the window at the pointer, 240 to 260 px wide, 32 px rows, at most the window's height less 16 px (scrolls inside), flipped and clamped so the whole menu and every nested submenu stay inside the window; a code layer's canvas and timeline menus have at most 14 top-level rows (Code animation, Clip, Track, Save to My Templates and More as submenus) (Part 4) |
| S1-007 | P1 | W8 | Verified | Save to My Templates lists every kind that fits the selection (Shape, Text, Background, Animation, Video, Image, Annotation, Sticker, Group, Scene), none covered by another region; "Save as template" is removed everywhere (Part 4) |
| S1-008 | P1 | W8 | Verified | AI and My Templates code animations have Duplicate ("<name> copy", kept unique) and Export in their "⋯" menu; an exported file imports again through AI › Import; a code layer's Code animation submenu has Export and Duplicate as copy (Part 4) |

## B1: Styles and the AI video brief

The AI acts as the creator: a style gives the direction, the brief form says what is locked and what is free (B1 brief).

| ID | Pri | Wave | Status | Item |
| --- | --- | --- | --- | --- |
| B1-001 | P1 | W10 | Verified | Creator Packs have a `style` kind (category, description, brief, look, kit, inputs, asset policy, output, default freedom); kit ids must exist or be marked optional; no URLs; styles list in AI › Styles as cards (palette, category icon, name) with Rename, Duplicate, Export, Move to folder, Details and Delete; "+" is Use this style; a style is never placed on the canvas (Part 1) |
| B1-002 | P1 | W10 | Verified | AI › New AI video opens a brief form (What, Content, References, Freedom, Assets, Voice and music, Extra notes; style cards or "No style - you decide"); filled fields become LOCKED, empty ones are listed once under FREE; only file names and kinds are kept, with "Attach these files in the Claude chat"; Copy brief copies one creator block (task header, BRIEF, STYLE, project, library index, rules) under 60 KB; nothing blocks, hints are soft (Parts 2 and 3) |
| B1-003 | P1 | W10 | Verified | Save as My brief keeps the form in My library (`brief/<id>`), listed under AI › Briefs with the shared "⋯" menu; "+" reopens the form prefilled; "Use this style" opens the form with the style chosen; not an undo step (Part 3) |

## CP: Creator Pack in the editor (P-series, CREATOR-PACK-SPEC)

Creator Pack items imported, checked and registered in the user's library, and their controls.

| ID | Pri | Wave | Status | Item |
|---|---|---|---|---|
| CP-001 | P1 | W8 | Verified | A code layer's right-click menus (canvas and timeline) offer Edit code, Animation settings, Save as template and Re-render, and leave out picture and sound items that mean nothing for it (Set as background, Detach audio, Audio, Auto cut) (P1) |
| CP-002 | P1 | W8 | Verified | A code layer is never blank: its thumbnail frame shows on the canvas and on its clip before the bake has a frame, the canvas shows "Rendering n %", the last frame stays across a re-bake, and playback starts from the first baked frames (P1) |
| CP-003 | P1 | W8 | Verified | Live settings: while a number control is dragged the frame at the playhead renders at Draft with the dragged value (Blocks and seekable code); the release applies and re-bakes automatically after a short pause in one undo step; a stateful Tier C animation keeps Apply (P1) |
| CP-004 | P1 | W8 | Verified | Import creator pack: from the Import menu, a paste dialog or by dropping a .creatorpack.txt or .json file; checked by `checkPack` with the real FX ids and library ids; nothing runs before the user confirms (P2, CREATOR-PACK-SPEC 2, 6) |
| CP-005 | P1 | W8 | Verified | The review dialog lists every item with a thumbnail, its status (OK, warning, rejected with the reason) and a checkbox, with Add selected to library and Copy report; the runtime checks (three frames rendered, blank or throwing items rejected, motion baked twice byte for byte, controls change the render) are shown; rejected items never block the rest (P2, spec 6) |
| CP-006 | P1 | W8 | Verified | Accepted items are kept in My library (this browser, key pack/item, not an undo step); the same pack version is skipped, a higher version replaces after a confirm; a project keeps its own copy of what it uses (P2, spec 4) |
| CP-007 | P1 | W8 | Verified | Creator items appear in their panels with a Creator pack badge (shapes in Elements > Shapes, text in Text > Styles, backgrounds in Elements > Backgrounds, motion in Elements > Animations and My Templates > Code animations, templates in Templates > Creator packs), insert in one undo step, and can be renamed, exported, deleted and restored (P2, spec 4) |
| CP-008 | P1 | W8 | Verified | Kinds not built yet (composition, adjust, filter, effect, transition, font) show "Not supported yet" in the review dialog and are never silently dropped (P2) |
| CP-009 | P1 | W8 | Verified | A creator preset appears in Animate > Creator; applying it writes ordinary keyframes and the layer's preset record {id, params} (a `preset` string property, schema 8 unchanged, D-239) in one undo step (P3, spec 5.3) |
| CP-010 | P1 | W8 | Claimed | The right rail's Controls category shows only what the selected layer really has: a preset's controls grouped by animated property (a Move preset shows only Move controls), a motion layer's params, or for hand or AI keyframes a simple From, To, Duration, Delay, Easing, Loop group per keyframed property; basic first, advanced under More (P3, spec 5.1b) |
| CP-011 | P1 | W8 | Verified | Changing a control regenerates the preset's keyframes in one undo step; editing those keyframes by hand marks the layer Edited manually: the controls grey out with a note and Reset to controls (with a confirm) (P3, spec 5.3) |
| CP-012 | P1 | W8 | Verified | Add animation adds one more property animation from the Animate presets; only its controls appear (P3, spec 5.1b) |
| CP-013 | P1 | W8 | Dropped | Copy library index for AI (Import menu) copies a compact text (under 40 KB) of library and creator items, Blocks, Animate presets, effect, filter and transition ids, fonts, canvas size and frame rate (P4, spec 8) |
| CP-014 | P1 | W8 | Verified | Bad creator packs (endless loop, fetch, NaN expression, missing field, oversized source, unused control) are rejected with their exact reasons and leave the editor and library untouched (P2, spec 10) |
| CP-015 | P1 | W8 | Verified | Re-importing a pack is idempotent, and deleting a library item does not break a project that used it (P2, spec 10) |

## F2: Final integration UI (FINAL2)

The optional engines merged in FINAL1 wired into the editor (FINAL2 brief, parts U1 to U11).

| ID | Pri | Wave | Status | Item |
| --- | --- | --- | --- | --- |
| F2-001 | P1 | W9 | Verified | Settings › Stock & API keys: one block per provider (Pixabay, Pexels, Freesound; Sarvam, Google Cloud TTS, ElevenLabs, MiniMax, Deepgram) with Show, Save (masked), Test (Working, Key not valid, Too many requests, No internet) and Clear; Iconify needs no key; keys stay in this browser; Offline voice & captions shows each local engine's status (U1) |
| F2-002 | P1 | W9 | Verified | Settings › Appearance › Accent colour: 8 swatches for the dark theme and 8 for the light theme, kept separately in this browser, applied at startup and on every theme switch; purple keeps today's look (U1) |
| F2-003 | P1 | W9 | Verified | Elements › Photos, Videos (Pexels and Pixabay), Icons and Stickers (Iconify) and Audio (Freesound) open a stock page: debounced search, provider switch, orientation filter, shared 2-column cards with a licence badge, Load more, attribution at the bottom; a click or "+" downloads, imports into Media with the licence and credit (Media › Details) and places it at the playhead; cards drag to the canvas and the timeline; Charts, Tables, Frames, Grids, 3D and Animations stay disabled (U2) |
| F2-004 | P1 | W9 | Verified | Stock states in plain words: no key (a card that opens Settings › Stock & API keys), key not accepted, too many requests with the wait in seconds, no internet, a download the site blocks ("A server is needed for this one"), nothing found; a failed download never breaks the editor (U2) |
| F2-010 | P1 | W9 | Verified | Record & create › Voice-over: text, language (English, Hindi), voice engine and voice from the speech registry, speed, Preview (plays), Save to Media (one WAV through the Media import, with progress, Cancel and the speech details on the asset) and Add to timeline at the playhead on a new audio lane; Browser voice stays Preview only (u3u4) |
| F2-011 | P1 | W9 | Verified | Voice-over engine states in plain words: Ready, Needs a key (Add a key opens Settings › keys), Needs a download or Not available yet (Offline voices opens Settings › offline); Hindi without a keyed Sarvam, Google or ElevenLabs voice says so with a button to Settings (u3u4) |
| F2-012 | P1 | W9 | Verified | Record & create › Camera, Screen (with "Record my microphone too": Screen + mic) and Screen and camera (picture in picture) on the recorder engine: camera and microphone pickers, permission help, 3-2-1, elapsed time, level meter, Pause / Resume, Stop, Discard, review with a preview; Save to Media and, checked by default, the timeline at the playhead in one step (the camera on its own lane in the corner) (u3u4) |
| F2-013 | P1 | W9 | Verified | Recorder failures in plain words with Retry (screen or device refused, no device, device busy, unsupported browser, too large); takes are recorded only in formats the browser can also play back (u3u4) |
| F2-020 | P1 | W9 | Verified | Audio › Mixer above the sound pack: master volume 0 to 200 % saved in the project (one undo step) and shown again after a reload; a master meter and one row per video or audio lane with its meter, mute, solo (the lane's own state) and volume (U5) |
| F2-021 | P1 | W9 | Verified | Meters move while playing (peak and level, clipping above 0 dBFS marked), from the playback engine's analysers (U5) |
| F2-022 | P1 | W9 | Verified | The master volume is heard in playback and passed to the export mix (`ExportInput.masterVolume`) (U5) |
| F2-023 | P1 | W9 | Verified | Clip Audio tab: fade in and fade out presets (None, 0.5 s, 1 s, 2 s) and volume keyframes (add at the playhead, change, remove), one undo step each (U5) |
| F2-024 | P1 | W9 | Verified | Clip Audio tab: Reduce noise Off / Low / High (Beta) with the download size, "never uploaded" and the 5-minute limit; a failed noise model load says so in plain words with Turn off and Try again (U5) |
| F2-030 | P1 | W9 | Verified | Font panel: search, category chips, a Hindi / Devanagari filter, Recently used (this browser), bundled and system fonts and the text engine's catalog downloaded on first use (cached for offline use and export), Loading and plain-word offline or failed states that keep the previous font, and a coverage line from the engine's glyph check (U6) |
| F2-031 | P1 | W9 | Verified | Right panel › Text: direction Auto / Left to right / Right to left, Start / Centre / End alignment whose icons flip for right-to-left text, and bullet or numbered lists with style, indent, spacing and a level (1 to 3) per line, one undo step each (U6) |
| F2-032 | P1 | W9 | Verified | Elements › Tables opens a rows × columns picker and inserts a table (text engine table model) at the playhead in one undo step (U6) |
| F2-033 | P1 | W9 | Verified | Table cells edit in place on the canvas (double-click, Tab to the next cell, Enter commits, Escape cancels) and in the right panel with rows, columns, header row, column widths, border colour and width (U6) |
| F2-040 | P1 | W9 | Verified | Right panel › Effects › Masks: add rectangle, ellipse, polygon or path masks; choose, delete, combine (add, subtract, intersect), feather, expansion, opacity, invert; shape keyframe at the playhead; matte from another layer (alpha or luma, invert); the open mask's handles show on the canvas and drag with the real mouse (one step on release, the keyframe at the playhead when animated), only while the Masks section is open (U7) |
| F2-041 | P1 | W9 | Verified | One blend control (Adjust colors › Blend mode): the layer's own blend mode, all 16 modes grouped Normal, Darken, Lighten, Contrast, Comparison, Component; replaces the earlier clip-FX blend select (an old clip blend is shown until changed, then cleared in the same step); Reset colors sets Normal (U7) |
| F2-042 | P1 | W9 | Verified | Right panel › Effects › Chroma key (pictures and video): on/off, key colour, eyedropper on the canvas (picks from the unkeyed picture; Escape stops), similarity, smoothness, spill, edge feather and shrink, keep-only invert, Full or Fast preview quality (export stays full); a plain notice when the graphics-card path is unavailable (U7) |
| F2-043 | P1 | W9 | Verified | A masked picture's exported PNG frame matches the preview pixel (export parity smoke test) (U7) |
| F2-050 | P1 | W9 | Verified | Reconnect media: after a project opens, media whose files are not in this browser are listed (name, kind, size, length, picture size); Pick file per item (a file of the wrong kind or an unreadable one is refused in plain words), Pick folder matches all by name, size, length and picture size; Reconnect stores the bytes first, then restores each reference in one library change (ids, clips, lanes, keyframes and Undo history unchanged); Skip keeps placeholders and a toast offers Reconnect again (U8) |
| F2-051 | P1 | W9 | Verified | Media › Details shows what the probe read: video and audio codec, resolution, frame rate, variable frame rate, rotation, audio (mono or stereo, kHz) and container; unknown values read Unknown; the stock credit row stays (U8) |
| F2-052 | P1 | W9 | Claimed | Plain import notes: an unsupported video or sound codec names the format and what to convert to; a rotated phone video says it is shown upright automatically; a variable frame rate says playback and export follow the file's timing, so nothing needs fixing (also in Details) (U8) |
| F2-060 | P1 | W9 | Verified | Transcribe from a video or audio clip's timeline menu (and the palette): clip, English or Hindi, an engine picker with each engine's status and a fix button (Deepgram Needs a key › Add key; Offline Whisper's status › Offline engines), progress with Cancel, the transcript shown to copy or turned into captions; nothing changes in the project (u9) |
| F2-061 | P1 | W9 | Verified | Auto captions dialog (timeline clip menu, palette, the right rail's Auto Caption and the canvas bar): clip, language, engine, five style presets with live previews, lines per caption and position; Add captions puts the cues on a new Captions lane in one undo step, timed to the clip; editing a caption's text on the canvas keeps its cue words in step ('Edit caption'); SRT and VTT import and download (u9) |
| F2-062 | P1 | W9 | Verified | Nested clips: Nest clips (two or more clips, timeline menu and palette) and Un-nest are one undo step each; a nested clip never offers Ungroup; double-click (or Open nested clip) enters it with a breadcrumb bar above the timeline listing its clips and their times, Main timeline or Back leaves (u9) |
| F2-070 | P1 | W9 | Verified | AI › Import finds a composition item and offers Build video: a slot dialog lists the media slots (hint, type, Required) with Pick from Media, Upload, Search stock or "Let the AI decide later"; the adapter's missing items and warnings show live; the video is added as new scenes (one step) or opened as a new project (U10) |
| F2-071 | P1 | W9 | Verified | Scene camera panel (scene toolbar › Camera): presets, zoom, X, Y and rotation with keyframe buttons; playback and export apply the camera, the editing canvas shows the scene still unless Preview camera is on (then picking is off, with a hint); a "Camera: <preset>" badge (U10) |
| F2-072 | P1 | W9 | Verified | From 1440 px wide, library panels are 380 px (two cards of at least 165 px); the Scene panel and narrower windows keep today's width; the AI brief lists the installed stock providers and whether a key is saved; an exported code animation keeps its changed control values and the importer restores them (U10) |
| F2-090 | P1 | W9 | Verified | Offline captions: the Whisper engine (tiny multilingual, English and Hindi, word timings) downloads in the user's browser with progress, Cancel and Remove, checked by size until `npm run models:pin` pins size and SHA-256; status Needs download (size) / Ready in Settings and every engine picker; offline voice says Not available and points to the cloud voices (U11) |

## FX1: Fix round 1 (owner's real-browser test)

| ID      | Pri | Wave | Status   | Feature |
| ------- | --- | ---- | -------- | ------- |
| FX1-001 | P0 | W9 | Verified | Every left panel, right panel and both icon rails scroll so their last control is reachable at 1920 × 940 and 1366 × 768; the right rail's last icon is reachable (F1) |
| FX1-002 | P0 | W9 | Verified | Media, AI and My Templates keep search, Import, drop zone and chips fixed while only Sort and the cards scroll (short windows: the chips stay pinned); the selection's action cluster never covers the floating toolbar at any zoom (F1) |
| FX1-003 | P0 | W9 | Verified | Pixabay videos never use an empty rendition (`large` with url "" and size 0); the default is medium (up to 1080p), then small, then tiny; Details lists each quality with its size and lets the user choose; the card shows a progress bar with Cancel; downloads may take 3 minutes (F2) |
| FX1-004 | P0 | W9 | Verified | Pexels videos tolerate HLS entries (null width and height, quality "hls"), null quality and missing fps; only MP4 renditions are kept, the best up to 1080p is imported; search uses the documented /videos/search endpoint (F2) |
| FX1-005 | P0 | W9 | Verified | Icon thumbnails sit on a light tile, one card per name; an added icon or sticker lands centred with its longer side at 30 % of the canvas's shorter side; an SVG picture has an Icon colour control (tint, preview and export); adding stock never shows a Restored note (F2) |
| FX1-006 | P0 | W9 | Verified | Stickers: an empty search merges several seed words into a mixed, de-duplicated set with Load more; share-alike sets (OpenMoji, CC BY-SA) are out of the default list; licences are a small corner chip, full text in Details (F2) |
| FX1-007 | P0 | W9 | Verified | Stock errors tell the truth: No internet only when the browser is offline; otherwise timeout, the HTTP status (403, 404, 429, 5xx), blocked download, empty file or too big; a failed card keeps Retry; Copy diagnostics carries the step, endpoint without query and status, never a key (F2, F4) |
| FX1-008 | P0 | W9 | Verified | One "Text to speech" tool: a single card under Record & create opens one scrolling panel; no browser or offline voice and no right-hand Speech panel (both kept behind feature flags); with no key an empty state offers Sarvam, Google Cloud, ElevenLabs and MiniMax, each opening Settings at its key (F3) |
| FX1-009 | P0 | W9 | Verified | Text to speech: language, engine, voice, speed, text with its count and limit, Add pause (half a second of silence), Preview, Save to Media, Add to timeline; a bad key, a used-up quota (402), a 403 and network failures each say so, with Copy diagnostics (F3) |
| FX1-010 | P0 | W9 | Verified | Offline captions never fail silently: named steps (Loading model, Reading the clip's sound, Listening N %), Cancel at every step, and a plain message with Copy diagnostics for no speech, unreadable sound, a blocked model, out of memory, an unsupported browser, a model that never starts and a model not downloaded; success puts the cues on the timeline; Hindi and English reach Whisper as "hindi" and "english" (F4) |
| FX1-011 | P1 | W9 | Verified | Settings › Offline voice & captions › Run self-test downloads the model when needed, starts it on one silent second and reports the backend and start time, or the failure in plain words with Copy diagnostics; Copy diagnostics also on stock errors, Text to speech errors, failed key tests and the Auto captions dialog (F4) |
| FX1-012 | P0 | W9 | Verified | The left Audio category holds libraries only (Sound effects, Music from stock, My audio from Media) with sticky tabs; the Mixer is the right panel's Project audio, opened from the rail's Audio with nothing selected: master volume, lane level, volume, mute and solo; a clip's Audio tab is unchanged (F5) |
| FX1-013 | P0 | W9 | Verified | Every slider + number row (volume, master and lane volume, opacity, speed …) keeps label, a full-width slider and the number with its unit on one line, with a 4 px track (no pill, the thumb on the value) and nothing past the panel (F5) |
| FX1-014 | P0 | W9 | Verified | Nested clips are complete compound clips: double-click opens one with its real lanes and clips on the timeline (move, trim, split, delete, add from Media, effects work as on any clip; the canvas shows the inside), every edit is one undo step on the main project, the nest's length follows its inside (up to the next clip on its lane), depth up to 5; the breadcrumb reads "Main timeline › <nest>" with Back to main timeline, Esc leaves; the block shows a nest icon, a map of its clips and its length, Rename is in its menu; Un-nest puts the edited clips back (F6) |
| FX1-015 | P1 | W9 | Verified | The AI import dialog colours by severity: errors red, warnings amber, information neutral, OK green ("Ready to build …" is never red); missing optional kit items read "This style asks for a transition "dip to black" that this editor does not have yet; it will be skipped"; a row without a picture uses the full width (F7) |
| FX1-016 | P1 | W9 | Verified | Build video keeps the ticked style and the composition in the AI panel, replaces a project's single empty default scene, opens the scene strip and says "Added 3 scenes" for 10 s with Show scenes (F7) |
| FX1-017 | P0 | W9 | Verified | Google Fonts are asked for with the weights each family really has (a single-weight font such as Pacifico without a weight list), every font row is drawn in its own face (a small preview face), a failed font says why with Retry, and the Hindi filter hides fonts whose Devanagari coverage check fails (F8) |
| FX1-018 | P0 | W9 | Verified | The on-canvas text editor turns off autofill, autocorrect, autocapitalize and writing suggestions, and draws a visible 2 px blinking caret in the text colour (black or white when that colour has under 3:1 contrast with the canvas) (F8) |

## FN3: Final round 3 (text, camera, video plan)

| ID | Pri | Wave | Status | Requirement |
| --- | --- | --- | --- | --- |
| FN3-001 | P0 | W9 | Verified | Pexels video search asks the documented /v1/videos/search endpoint; the retired /videos/ path is never used (A2) |
| FN3-002 | P0 | W9 | Verified | Adding stock photos, videos and icons never shows a Restored note and adds no undo step (A4) |
| FN3-003 | P0 | W9 | Verified | Audio clips and video with sound can be nested; they sound through the nested clip's trim and speed (A3) |
| FN3-004 | P0 | W9 | Verified | A selected nested clip has Effects (applied to the whole nest) and Speed (scales its inner time) tabs; enter and leave still work (A3) |
| FN3-005 | P0 | W9 | Verified | Text boxes are Canva's: new text is auto width (grows, never wraps by itself); a side handle makes it fixed width (wraps, height grows); a double-click on the side handle goes back to auto width; the box is exactly as tall as its lines (T1) |
| FN3-006 | P0 | W9 | Verified | Lists act on paragraphs (bullet, numbered, checklist): one line is one bullet, Enter adds one, Enter on an empty one leaves the list, Tab and Shift+Tab indent (T3) |
| FN3-007 | P0 | W9 | Verified | Editing keeps IME and Devanagari compositions whole, moves by grapheme clusters and pastes plain text (T2, unit) |
| FN3-008 | P0 | W9 | Verified | Text effects (Shadow, Lift, Hollow, Splice, Echo, Outline, Glow, Background, Glitch, Neon) and Curve draw the same in the preview and the export; the typewriter reveals grapheme clusters (T5, T6) |
| FN3-009 | P0 | W9 | Verified | Double-click selects all the text; a click on selected text places the caret; the caret is a visible contrasting 2 px line; the editor is never a form field; Shift+Enter is a soft break (T2) |
| FN3-010 | P0 | W9 | Verified | Text corner handles scale the font size (and a fixed width) in one step; the layer scale stays 1 (T1, contract revision 9) |
| FN3-011 | P0 | W9 | Verified | The Text tab: search, Add a heading, subheading and body text (click and drag), at least 12 font combinations in English and in Hindi, default styles and My text styles (T5) |
| FN3-012 | P0 | W9 | Verified | Fonts are asked for with each family's real weights and italics; an uploaded .ttf, .otf or .woff2 is listed under Uploaded fonts and used by the text (T4) |
| FN3-013 | P0 | W9 | Verified | The camera rig is Blender-like and float-exact: identity at rest, a smooth push-in (no steps), depth parallax only with perspective, clip range and depth of field by depth, every controller finite, Randomise within limits, settings read defensively (C1, C2, C4) |
| FN3-014 | P0 | W9 | Verified | Camera shots live on a Camera track (top lane, shots only) per scene; cuts switch cameras; the cameraShots hook and Composition Spec `cameraShots` build them; joined exports keep targets (C1, C5) |
| FN3-015 | P0 | W9 | Verified | The scene toolbar's Camera opens the right Camera section (not in AI): Add camera, Add shot, presets row, controllers, Randomise, lens, sensor, shift, clip, depth of field, overlays, background, Track To, each one step; no keyframe UI; the Camera track folds; shots split like clips (C2, C3) |
| FN3-016 | P0 | W9 | Verified | Preview camera shows the controller moving the picture; the exported frame equals the preview; layers stay selectable and movable through the camera (C3, C6) |
| FN3-017 | P0 | W9 | Verified | The camera frame on the canvas edits a shot's start or end framing: drag trucks, corners zoom, the handle rolls, the wheel dollies, Alt-drag orbits, Shift is fine; one step each (C3, BP.16) |
| FN3-018 | P0 | W9 | Verified | A camera on scene 2 leaves scene 1 alone; shots survive a reload; a project without cameras has no Camera track (C6) |
| FN3-019 | P0 | W9 | Verified | Video Plan v2 is validated with plain-language errors that name the scene and layer; unknown fields and kit ids are warnings; the quality gate checks pace, length and text; the starter kit has 13 items and 4 backgrounds (V1, V2.5) |
| FN3-020 | P0 | W9 | Verified | The auto-builder is deterministic: media ranked with four alternatives, scene length from the voice, captions from narration timing, camera from the scene or the feel, transitions, ducked music; silent with a banner without a voice; fallback cards and flags when media fail (V2) |
| FN3-021 | P0 | W9 | Verified | AI › Import builds a v2 plan end to end with progress and no slot dialog; it replaces a single empty scene in one undo step, opens the scene strip and says Built N scenes (V2.0, V2.6) |
| FN3-022 | P0 | W9 | Verified | Without a voice key the build is silent with a banner; with stock down media get fallback cards and needs-asset flags and the build completes (V2.1, V2.2) |
| FN3-023 | P0 | W9 | Verified | Review & swap: up to four alternatives, Search more and Use my own swap media keeping place and animation; a narration change speaks it again and remakes the scene; re-time, reorder, delete, regenerate; Export plan and Compare to plan (V3) |
| FN3-024 | P0 | W9 | Verified | The importer rejects a plan with errors in plain words, warns for an unknown starter-kit id, and a v1 composition still opens the slot dialog (V1.2, V6.6) |
| FN3-025 | P1 | W9 | Verified | AI lists a built plan with its status, its feel as a Theme and the starter kit; a feel saves as a theme that says what it holds, exports as a Creator Pack and applies without changing content; a plan can name it by themeId (V3.5, V4) |
| FN3-026 | P0 | W9 | Verified | Text format tools: aA cycles UPPER, lower and Title; superscript and subscript; kerning, ligatures and Change all; a text gradient of 2 to 10 colours; the format painter copies a text's whole format (font, case, spacing, effect, gradient) (CP.4, CP.6, CP.11, CP.13, CP.14) |
| FN3-027 | P0 | W9 | Verified | Every text effect (Shadow, Lift, Hollow, Splice, Echo, Outline, Glow, Background, Glitch, Neon) has its settings and Remove effect and draws (CP.20 to CP.30) |
| FN3-028 | P0 | W9 | Verified | The font picker filters by kind, lists document fonts, and a font that cannot load says why with Retry while the text keeps its font (T4.2, T4.5, CP.17) |
| FN3-029 | P0 | W9 | Verified | Camera overlays (guides, safe areas, passepartout, name) show only in the editor; a camera background image draws through the camera and is exported only with Include in render; Track To and the focus picker set the camera (BP.8 to BP.13) |
| FN3-030 | P0 | W9 | Verified | Spellcheck is a Settings switch (off by default); inside the text editor Ctrl+Z undoes one typing burst and Ctrl+A, Ctrl+I style the text; a camera is renamed in one step; the typewriter shows in the exported frame (T2.6, T2.9, T2.11, C3.7, T6.1) |

## FX3: Fix round 3 (panels, offline captions in a worker)

| ID      | Pri | Wave | Status   | Feature |
| ------- | --- | ---- | -------- | ------- |
| FX3-001 | P0 | W9 | Claimed | Every library shelf (Media, AI, My Templates) fills its panel to the bottom with one scroller (the cards); search, Import and the chips stay put at every window height; no nested scroller (1.1, 4.1) |
| FX3-002 | P0 | W9 | Claimed | Offline captions run in a dedicated module Web Worker: a CPU-bound model and a flood of 20 000 progress events never freeze the page (no frame gap over 200 ms), and the cues still land (2.2, 2.7) |
| FX3-003 | P0 | W9 | Claimed | A captions worker that sends nothing for 15 s (or 120 s during one inference run) is stopped and the dialog says "The caption engine stopped responding" with Copy diagnostics; Cancel terminates the worker (2.3) |

## LIB: Phase 1 library (owner catalog, editor client)

| ID | Pri | Wave | Status | Description |
| --- | --- | --- | --- | --- |
| LIB-001 | P0 | W9 | Verified | The audit lists every place shared library content was bundled or generated, with a move or stay decision for each (reports/PHASE1-LIB-AUDIT.md), and what it says moved is no longer in the editor |
| LIB-002 | P0 | W9 | Verified | The audit lists the Phase 1 cloud leftovers against the code, with their true state and action |
| LIB-003 | P0 | W9 | Verified | The audit lists what is reused (Creator Pack format, library records, themes, checks) so no new item format is invented |
| LIB-004 | P0 | W9 | Verified | The catalog has a signed manifest (catalog version, time, one index per category with its address and SHA-256) and content-hashed, immutable files |
| LIB-005 | P0 | W9 | Verified | Small items are inline (under 8 KB); heavy media carry a poster or waveform, a small proxy and the full file; every entry has id, kind, names in English and Hindi, tags, licence and credit, version, thumbnail, blur, size and the owner fields |
| LIB-006 | P0 | W9 | Verified | The manifest is signed with Ed25519; a wrong byte, a wrong signature or another key is rejected; the private key is only in the git-ignored owner/keys/ |
| LIB-007 | P0 | W9 | Verified | `npm run library:publish` runs the pack check and the editor's render checks in a headless browser, fails closed without one, gives one plain sentence per rejection, and skips a second publish of the same content |
| LIB-008 | P0 | W9 | Verified | Every catalog version is kept; a rollback publishes a new version that lists what an older one listed |
| LIB-009 | P0 | W9 | Verified | `npm run library:seed` publishes the editor's former library (244 items) deterministically |
| LIB-010 | P0 | W9 | Verified | The catalog server answers ETag and 304 for the manifest, immutable caching for files, byte ranges, GET and HEAD only, and nothing outside the catalog folder |
| LIB-011 | P0 | W9 | Verified | The owner app is never imported by, bundled into or reachable from the editor (dev server and built files checked) |
| LIB-012 | P0 | W9 | Verified | The owner app has one owner account made from the command line (no sign-up), scrypt passwords and a 2-step code (TOTP, RFC 6238) |
| LIB-013 | P0 | W9 | Verified | Every owner action, failed ones included, is a row of an append-only, chained audit log; a changed row is found |
| LIB-014 | P0 | W9 | Verified | The owner logs in with password and 2-step code, browses the library by category with search, uploads single files and zips, and edits names, tags, licence and credit |
| LIB-015 | P0 | W9 | Verified | A tiny read-only server serves the catalog folder on its own port |
| LIB-016 | P0 | W9 | Verified | The owner publishes, unpublishes and rolls back; dangerous actions ask again for the password and a fresh code; a rejected upload shows its reasons; English and Hindi labels |
| LIB-017 | P0 | W9 | Verified | One command starts the owner app and the catalog server; an item the owner unpublishes disappears from the editor after a refresh |
| LIB-018 | P0 | W9 | Verified | Owner login locks after 5 failures, compares in constant time, needs a CSRF token and a same-origin request, and uses strict security headers and an HttpOnly, SameSite=Strict cookie |
| LIB-019 | P0 | W9 | Verified | Unpublish, delete, rollback and key rotation need a fresh password and code within 5 minutes |
| LIB-020 | P0 | W9 | Verified | The editor reads the signed catalog with its ETag, checks the signature before use, keeps it in this browser and starts from that copy without waiting for the network |
| LIB-021 | P0 | W9 | Verified | With no catalog and no saved copy the editor opens with a tiny fallback pack and says why; a catalog with a wrong signature is rejected and the saved copy stays |
| LIB-022 | P0 | W9 | Verified | Templates, Elements, Draw shapes, Text, Audio, Themes and AI styles come from the catalog, with catalog videos and photos in Elements |
| LIB-023 | P0 | W9 | Verified | Cards show a placeholder before their picture; hidden, scheduled, featured and ordered items follow the owner; an item with a plan key shows locked and is not added |
| LIB-024 | P0 | W9 | Verified | A small item is placed in the first frame after the click or drop, with no network request on the way, even on a slow network |
| LIB-025 | P0 | W9 | Verified | A catalog video, photo or sound is placed at once from its poster and proxy and switches to the full file without moving |
| LIB-026 | P0 | W9 | Verified | A failed download never blocks: the item stays placed, a toast offers Retry, and Retry fetches the file |
| LIB-027 | P0 | W9 | Verified | A project keeps its own copy of what it uses; a catalog rollback or unpublish never changes it |
| LIB-028 | P0 | W9 | Verified | The editor bundles no shared library any more (only the fallback pack); `npm run build` checks the built files |
| LIB-029 | P0 | W9 | Verified | The catalog gives the panels exactly the records the editor used to bundle (render identity) |
| LIB-030 | P0 | W9 | Verified | Feature keys exist for later plans; every feature is on; the Export button shows Upgrade when locked and is gone when hidden |
| LIB-031 | P0 | W9 | Verified | An AI-built video keeps a training record (brief, final plan, later edits with times) in this browser, and Save to cloud stores it in an owner-only table |
| LIB-032 | P0 | W9 | Todo | The Open from cloud list shows each project's picture; Free space lists and deletes only cloud files no project uses; Google sign-in shows only when set up, else one line says why |
| LIB-033 | P0 | W9 | Verified | Every new text of this phase has Hindi, in the editor and in the owner app |
| LIB-034 | P0 | W9 | Verified | The ledger, status, decisions, changelog and library docs describe the Phase 1 library |

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

## Fix-6 (fix-4 base plus the Phase 1 library)

| ID | Pri | Wave | Status | Description |
| --- | --- | --- | --- | --- |
| FIX6-001 | P0 | W9 | Verified | Auto captions never fail on odd word times: they are put in order, zero-length and runaway words get a sensible length, and a run of quick words keeps its timing |
| FIX6-002 | P0 | W9 | Verified | The speech worker is not called stuck while a long chunk is computing |
| FIX6-003 | P0 | W9 | Verified | Importing a deleted file again brings it back under the name of the file just chosen |
| FIX6-004 | P0 | W9 | Verified | A pasted video plan offers Build video only; Add to AI, Also add to the scene and Copy report are not shown |
| FIX6-005 | P0 | W9 | Verified | A project is checked without the slow whole-value check, so building a video no longer freezes the tool |
| FIX6-006 | P0 | W9 | Verified | While a plan builds, the dialog shows a spinner and a note; both go when it is done |
| FIX6-007 | P0 | W9 | Verified | Two imported plans: building the second leaves the first built, and each card opens its own Review & swap |
| FIX7-001 | P0 | W9 | Verified | A plan media name matches the person's own file without extension, dashes or case (globe-earth is Globe Earth.PNG) |
| FIX7-002 | P0 | W9 | Verified | A build never picks, downloads or even searches stock or library media for a plan layer: a missing file stays missing and is listed by name |
| FIX7-003 | P0 | W9 | Verified | A layer is filled only by the person's own media with the same name, or by a pick the person made |
| FIX7-004 | P0 | W9 | Verified | Your own media shorter than its slot or the music never makes a clip longer than the file, so the build completes |
| FIX7-005 | P0 | W9 | Verified | A saved scene's card opens a breakdown (AI, code, Media and editor counts, every part addable or draggable, Review & swap for media) and never drops the scene; the card shows the whole picture |
| FIX7-006 | P0 | W9 | Verified | Saving an object in a format that does not fit (a shape as Text) explains it, recommends the right format and still saves when the person insists |
| FIX7-007 | P1 | W9 | Verified | Text styles are saved to My Templates (Text); the Text panel no longer has My text styles |
| FIX7-008 | P0 | W9 | Verified | A table is born inside the canvas with type that fits its columns, its box covers every row, and the toolbar adds and removes rows and columns |
| FIX7-009 | P0 | W9 | Verified | Left panel sections never shrink into each other (Audio tabs, Scene) at 1366 and 1024 px; rail labels break only between words |
| FIX6-009 | P0 | W9 | Verified | A scene that was already checked is not checked again, so editing a project with many scenes stays fast |
| FIX6-010 | P0 | W9 | Verified | The left rail is read from an editor layout (categories, order, icons); an invalid layout gives the default |
| FIX6-011 | P1 | W9 | Verified | Every disabled planned control reads Coming soon; no duplicate disabled tiles in Text |
| P13D-001 | P0 | W9 | Verified | A .glb model chosen in AI › Import (or dropped on the editor) becomes a Tier C code animation with spin, size, tilt, light and tint controls |
| P13D-002 | P0 | W9 | Verified | A file that is not a binary glTF 2 model, a cut-off one or one over 700 KB gets a plain sentence and cannot be added |
| FX4-001 | P1 | W9 | Verified | One toast at a time, never over a left panel |
| FX4-002 | P1 | W9 | Verified | A toast waits while the pointer is on it, then hides |
| FX4-003 | P1 | W9 | Verified | Every overflowing left panel: its scroller reaches the panel bottom and fills most of it |
| FX4-004 | P1 | W9 | Verified | The AI composition card shows Not built, then Built with scene count and poster |
| FX4-006 | P1 | W9 | Verified | The model host defaults to Hugging Face and files follow the saved source |
| FX4-007 | P1 | W9 | Verified | An address without https is refused; empty returns to the default |
| FX4-008 | P1 | W9 | Verified | Settings › Offline › Model source saves an https address, refuses others and resets |
| FX4-009 | P1 | W9 | Verified | The left panel is full height and the timeline sits beside it |
| FX4-010 | P1 | W9 | Verified | A v3 timeline plan builds one scene with shapes, a bubble and an overlay |
| FIX7-010 | P1 | W9 | Verified | The Draw palette is Canva's: pen gallery with colours, size and transparency, shape tiles, line styles, sticky colours and table sizes |
| FIX7-011 | P1 | W9 | Verified | Importing a plan or composition and Export code show only in Developer mode (development and test builds, or the aive.developer switch) |
| FIX7-012 | P1 | W9 | Verified | Review & swap shows one status line (N found · M missing, or Ready), one Choose file or Swap per row, Find stock only on click, and Export, Compare and Save feel under More |
| FIX7-013 | P1 | W9 | Verified | Captions on a 9:16 video stay out of the lowest fifth of the picture |
| FIX7-014 | P1 | W9 | Verified | The editor shows no API-key fields or Add key buttons outside Developer mode; stock says it is not available yet |
| FIX7-015 | P1 | W9 | Verified | The owner app lists categories and kinds as tabs, keeps each card compact (details under Edit), and flowchart shapes belong to Elements › Shapes |
| FIX7-016 | P1 | W9 | Verified | The owner builds the library tree: categories with sub-categories and sections, adds new ones, renames, hides, re-orders and moves assets into them; the signed catalog carries it |
| FIX7-017 | P1 | W9 | Verified | The editor reads the owner's signed settings: a category the owner adds gets its own rail button and panel, added sub-categories and sections show as tiles/sections, and assets moved by the owner appear where they were put, with no release |
| FIX7-018 | P1 | W9 | Verified | Controls the owner switches off for a kind of selection (a right-panel tab, a toolbar button, a right-click entry) disappear from the editor from the signed catalog, with no release |
| FIX7-019 | P1 | W9 | Verified | The owner app's Editor controls tab lists every control per kind of selection with on/off switches; Save publishes them |
| FIX7-020 | P1 | W9 | Verified | The controls registry names only real right-panel tabs and kinds, and bad settings are ignored |
| FIX7-021 | P1 | W9 | Verified | Owner additions (sub-categories, placed assets) show under every editor panel: Templates, Media, Audio, Record, AI, My Templates and Theme |
| FIX7-022 | P1 | W9 | Verified | An AI-made Creator Pack (plans) published in the owner app works wherever the owner places it: the same card with its menu (Review & swap, Build again), movable into any category or new sub-category and copyable to more places; it leaves the AI category when moved |
| FIX7-023 | P1 | W9 | Verified | The owner app lists an item in more than one place (Also shown in) and moves it by changing its primary place |
| FIX7-024 | P1 | W9 | Verified | A photo, video, sound or theme the owner lists under another category shows there and works; a sound moved out of Audio leaves the Audio list; Scene and Draw show the owner's additions |
| FIX7-025 | P1 | W9 | Verified | A file added to Media after a plan was built fills the plan slot that waits for it when its name holds the slot's words; nothing else is filled on its own |
