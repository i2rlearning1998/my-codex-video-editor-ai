# Report: H-series, H1 to H6 (2026-09-30)

Branch `claude/h-series`, draft PR to `main`. This report is written part by part; the summary, checks and git sections are completed at the end of the series.

## 1. Summary

- **Bugs (H1).** The drag-select box is now painted. Rotated objects resize smoothly from their handles. Audio stays off the canvas. The wheel and panning can no longer lose the artboard. Side panels open and close from their rail category.
- (H2 to H6 are added as they are finished.)

## 2. Scope and results

| Part | Ledger IDs | Result | Evidence |
| ---- | ---------- | ------ | -------- |
| H1 | CV-003, CV-046 (strengthened), CV-049, CV-050, AUD-018, LAY-031, VID-006 (strengthened), CV-018 (updated) | Verified | `e2e/h1-marquee.spec.ts`, `e2e/h1-rotated.spec.ts`, `e2e/h1-audio.spec.ts`, `e2e/h1-wheel.spec.ts`, `e2e/h1-panels.spec.ts` |

## 3. Checks

(Completed at the end of the series.)

## 5. Deviations from the brief

- **H1.2 snapping.** Resizing a rotated object no longer snaps to guides (moves still snap). Snapping lined up the rotated object's axis-aligned bounds with a guide, and that pulled the corner off the pointer. Canva behaves the same way (D-115).

## 6. Decisions made

D-114 to D-118 in `docs/DECISIONS.md`.

## 7. Not tested, known gaps, risks

- Each part below lists its own known gaps.

## 8. Architecture and contract impact

- **Schema:** unchanged (5).
- **New dependencies:** none.
- **Contracts:** `TRANSFORM_INTERACTION_CONTRACT.md` revision 8 (pre-authorised).

## 9. Ledger and backlog

- **Rows added (LCR):** CV-049, CV-050, LAY-031, AUD-018.

## 10. Git

(Completed at the end of the series.)

## Part H1: bugs

Every fix below has a Playwright test in the sandbox Chromium that fails on the old code (checked by running it before the fix, or with the fix stashed).

### What changed

- **Drag-select box (CV-003, CV-046, D-114).**
  - Root cause: the box element was created, sized and moved, but it had no styles at all, so nothing was painted. The live outlines on the layers were already drawn, which made it look half-working.
  - The box is now a translucent accent rectangle with a 1 px border. It works from inside the artboard and from the dark stage, with or without a selection, at Fit and 100%, and at device pixel ratio 1, 1.25 and 1.5.
  - It touches a layer by its real, possibly rotated outline, not by its axis-aligned bounds. Before, a rotated group was selected when the box only reached its empty corner.
  - Shift adds, and a group counts as one.
- **Rotated objects (CV-049, D-115, contract revision 8).**
  - The resize maths was already exact. Two faults made it feel wrong:
    - resize snapping pulled the dragged corner up to 2 px away from the pointer at the first step (the template's Front card, 4 degrees in the world);
    - the floating action cluster could sit on top of a corner handle, so a press there hit the cluster instead.
  - Now rotated objects resize without snapping (moves still snap), and the cluster keeps clear of the box and every handle.
  - A chip beside the pointer shows W × H while resizing and the angle while rotating. Resize cursors turn with the object.
  - Proof: shapes, text, groups, pictures, nested groups and flipped shapes at 0, 4, 30, 45, 90, 135 and 200 degrees. Each drag is sampled over ten pointer steps. The opposite corner drifts less than 0.5 px, the size grows at every step, the corners stay square, the dragged corner stays on the pointer, and the Inspector's W and H equal the drawn box.
- **Audio (AUD-018, D-116).** Audio layers are no longer drawn as a box on the canvas, picked by a click or a marquee, or given a selection box. They stay on their audio tracks, in the Scene list and in the side panel. After Detach audio, the video clip's own sound is not played again, during playback or while scrubbing (this was already true for playback and is now proven for scrubbing too).
- **Wheel and pan (CV-050, D-117).**
  - Ctrl+wheel (and a pinch) zooms toward the pointer.
  - When the whole artboard fits, the wheel, Space-drag, the middle button and the hand tool never move it.
  - Zoomed in, they pan, but the artboard can never leave the view: at most 48 px of stage shows past its edge.
  - Below Fit the artboard stays centred. The smallest zoom is 10%.
- **Side panels (LAY-031, D-118).**
  - Clicking a rail category opens its panel, clicking the highlighted category again collapses it, and clicking another swaps the content.
  - The top-bar panel buttons show and change the same state; a collapsed panel now reopens from its category (the reported bug).
  - The right side works the same way.

### Try it (H1)

| # | Do this | Expect | ID |
| --- | --- | --- | --- |
| 1 | Drag from the grey area left of the page across the badge | A light purple box with a thin border follows the pointer; the badge and its text get an outline; releasing selects them | CV-046 |
| 2 | Select the headline, then drag from an empty part of the page over the edition number | The box shows again; only the edition number is selected afterwards | CV-003 |
| 3 | Scene list: select "Front card"; drag its bottom-right corner slowly | The opposite corner stays where it was, the card grows smoothly under the pointer, and a chip shows its size | CV-049 |
| 4 | Drag the round handle under the card | A chip shows the angle while you turn it | CV-049 |
| 5 | Type 135 in Rotation, then drag a side handle of a rectangle | Only that side moves; the other side stays put | CV-049 |
| 6 | Import a sound and drop it on the canvas | It appears on an audio track, not as a box on the page | AUD-018 |
| 7 | Scroll the mouse wheel over the page at Fit | Nothing moves | CV-050 |
| 8 | Ctrl+scroll up over the headline, then scroll down a lot | It zooms toward the pointer; scrolling stops with a small grey margin under the page | CV-050 |
| 9 | Click the highlighted rail category (Scene) | The left panel closes; click it again and it opens | LAY-031 |
| 10 | Close the left panel with the top-bar button, then click Media in the rail | The panel opens on Media | LAY-031 |

### Known gaps (H1)

- Rotated objects no longer snap while being resized (they still snap while being moved).
- The pinch gesture is proven through Ctrl+wheel (that is how Chromium reports it); no real trackpad was used.

## Part H2: design system, shell, responsive

### What changed

- **Tokens and themes (LAY-020, LAY-032, D-119).**
  - `src/ui/tokens.css` holds the owner's colours for dark and light, spacing, radius, type, three shadows, a z-index scale and motion.
  - Every older token name now points at the new semantic ones, so the whole app follows the theme with no component edits.
  - Dark is the default. The theme button in the top bar, "Theme" in the View menu and "Switch theme" in the palette cycle dark, light and system.
  - The choice is kept in the browser (not in the project) and applied before the first paint, so there is no flash. The artboard never changes colour.
  - Text, secondary text and accent text reach 4.5:1 on every surface in both themes (unit test). The pure accent #7c5cff is 3.96:1 on the dark panel, so accent-coloured text uses a lighter shade.
- **Shell (LAY-003, LAY-004, LAY-008, LAY-013, LAY-034, D-120).**
  - Top bar (48 px): menu, panel toggles, project name and save status on the left; the Editor | 2D Animation | 3D Animation switch in the centre (3D disabled; the switch itself comes alive in H4); undo, redo, theme and Export on the right.
  - Left rail 64 px with a 3 px accent bar on the active category. The left panel is 320 px (drag 260 to 420), the right panel 280 px (drag 240 to 360) beside a 44 px icon rail, and the timeline 280 px (drag 160 px to 60% of the height).
  - The canvas has a reserved row for the floating toolbar, so showing the toolbar never moves the page, and a footer with the scene picker, Scenes, the summary and the zoom controls.
  - Fit uses the whole stage minus 24 px. The artboard sits on the stage colour with a soft, themed shadow.
  - Panels open and close in 240 ms, and about 0 ms with reduced motion. Their content does not reflow while they move, and the canvas refits at most once per frame.
- **Responsive (LAY-013, LAY-014).**
  - 1024 to 1439: the right panel opens as a drawer over the stage.
  - 768 to 1023: both panels are drawers over a dimmed stage, and buttons are at least 40 px.
  - Under 768: one panel at a time slides up as a bottom sheet, and the timeline toolbar keeps only the transport.
  - Under 800 px tall, the rail shows six categories and a More button.
  - Checked at 1920×1080, 1440×900, 1366×768, 1280×720, 1024×768, 820×1180 and 390×844 in both themes: no horizontal scrollbar, no overlapping or clipped top-bar controls.
- **Components (LAY-015, LAY-016, D-121).**
  - Buttons have three sizes (28, 32, 40) and primary, secondary, ghost and danger styles. There are also a segmented control, switch, tabs, cards (they lift on hover), skeletons and empty states.
  - Menus have rounded corners, 32 px rows, an icon column and the shortcut on the right; they animate in. Submenus open after 120 ms and stay 200 ms. Disabled items show their reason on hover.
  - Styled tooltips appear after 500 ms, then instantly on the next control, and show the shortcut.
  - Toasts can carry an action button.
  - Controls that name a later wave read "Planned: Wave N (ID)".
  - Icons share one 24-unit grid with a 1.75 stroke.
- **Fixes found on the way.**
  - A background save no longer overwrites the last status message. The old race could hide a refusal message (VID-015).
  - A drag along one axis no longer changes the other axis by a rounding error: core `moveTransform` adds the pointer delta as one step (unit test fails on the old code).
  - The canvas no longer draws a focus frame around the whole stage after a click; the frame shows only after keyboard navigation.
- **Moved:** "Copy debug report" is in the menu's Help group. The status bar is now a hidden live region, because the save state is in the top bar. The e2e default window is 1600×1000.

### Try it (H2)

| # | Do this | Expect | ID |
| --- | --- | --- | --- |
| 1 | Open the app | Dark theme; a slim top bar with Editor / 2D Animation / 3D Animation in the middle; the page sits on a darker stage with a soft shadow | LAY-032 |
| 2 | Click the moon button in the top bar twice, then once more | Light; then System (follows your computer); then Dark again | LAY-032 |
| 3 | Pick Light and reload | The app opens light straight away, with no dark flash | LAY-032 |
| 4 | Click the highlighted rail category | The left panel slides shut in about a quarter second; click again to open | LAY-033 |
| 5 | Drag the edge between the left panel and the canvas far right | It stops at 420 px wide | LAY-004 |
| 6 | Hover the zoom buttons | A dark tooltip with the shortcut after about half a second; the next one appears at once | LAY-015 |
| 7 | Right-click the headline, hover Align | Rounded menu with icons column and shortcuts; the submenu opens quickly | LAY-030 |
| 8 | Make the window about 1200 px wide, click a right-rail icon | The properties panel slides in over the canvas | LAY-013 |
| 9 | Make the window about 900 px wide, click a rail category | The panel opens over a dimmed canvas; click the dim area to close | LAY-013 |
| 10 | Make the window short (under 800 px tall) | The rail shows six categories and More; More lists the rest | LAY-034 |

### Known gaps (H2)

- The export dialog, the New project form and the palette keep their structure; they only have the new colours, radius and animation (the export dialog is reworked in H3).
- The phone layout is usable, but the timeline keeps its 224 px track-header column (a structural timeline change is out of scope), so on a 390 px phone the tracks scroll sideways.
- The context toolbar still has the G-series controls with labels; on narrower stages it scrolls. H3 turns it into the compact Canva row (done, see H3).
- Bundled UI font: the system font stack is used until the text series.

## Part H3: canvas toolbar, tool panels, menus, canvas size

### What changed

- **Floating toolbar (CV-035 to CV-038, CV-054, D-122).**
  - One fixed row over the canvas, 44 px high with rounded corners. It starts with a size chip such as "16:9 ▾".
  - Each kind of selection has its own tools, in Canva's order:
    - **Text:** font, size − and +, colour, B I U S, uppercase, align, spacing, transparency and effects.
    - **Picture:** edit, replace, border, corners, crop, flip and transparency.
    - **Shape:** fill, stroke style, corners and combine.
    - **Also:** drawings, groups (Ungroup) and multi-selections (Group).
    - **Every kind:** Animate, Position and Copy style.
  - Quick choices (align, spacing, stroke style, corners, flip, transparency) are small popovers. Font, Effects, Edit, Replace, Crop and Colour open in the left panel.
  - X, Y, width, height and rotation moved into the Position panel. A Rotate field was added there.
  - When the canvas is narrow, button labels collapse first, then the last tools move into a More button. The row never scrolls.
  - Escape closes an open popover before it deselects anything.
- **Canvas states (CV-052).**
  - The object under the pointer gets a thin outline, and so does the empty page.
  - Clicking the empty page selects the canvas and shows the scene toolbar.
  - Clicking the grey stage around the page deselects everything and hides the toolbar.
- **Handles (CV-053, contract revision 8, D-125).**
  - Corners are white round dots and the sides are white pills.
  - The rotate button sits under the object, as in Canva.
- **Canvas size (CV-055, D-123).**
  - The size chip lists Wide 16:9, Vertical 9:16, Square 1:1, Classic 4:3, Social 4:5, Cinema 21:9 and Portrait 2:3, plus a custom size.
  - A new size applies to every scene and keeps the design centred. It is one undo step, and the toast has an Undo button.
- **Crop, border, corners (VID-003, VID-018, D-124).**
  - To crop, double-click a picture or video, or use Crop in the toolbar or the Edit panel.
  - Drag the frame or its handles, or pick Freeform, Original, 1:1, 4:3, 16:9 or 9:16. You can also rotate, reset, cancel or finish with Done.
  - When you crop, the part you keep stays exactly where it was.
  - A picture can take a border (colour, width, solid, dashed or dotted) and rounded corners.
  - All of this is drawn the same way in the preview and the export.
  - Smart crop and Expand are shown as "Planned: Wave 10 (AI-009)".
- **Replace (VID-009).** The Replace panel lists the project's media of the same kind. Picking one swaps the media and keeps position, size, crop, timing and animation.
- **Text (TXT-036, D-129).** Underline, strikethrough and uppercase toggles were added. Spacing now also sets where the text sits in a taller box (top, middle or bottom).
- **Right-click menus (CV-051, CV-056, D-126, D-127).**
  - Menus now have icons and shortcuts.
  - **An element** adds:
    - Lock and Unlock. A locked element can be selected but not moved, resized, nudged, edited or deleted.
    - Show element timing, Alternative text and Set image as background.
    - Resize canvas to selection, Download selection (a PNG) and Info.
    - Comment and Hide, shown as planned.
  - **The empty canvas** offers:
    - Paste, Add scene, Duplicate scene and Delete scene.
    - Canvas size, with the presets and Custom.
    - Guides: Off, with grid, rulers and safe areas planned.
- **Export dialog (EXP-006 reworded, D-128).**
  - The size and platform presets are gone.
  - Quality 720p, 1080p or 4K sets the video's shorter edge, in the canvas's shape. The dialog shows the resulting size.
  - The file name is next. More options holds the format (MP4 when possible, or WebM), the frame rate and the start and end.
- **Tests.** `e2e/h3-canvas.spec.ts` has 10 new tests. The earlier toolbar, handle and export tests were updated for the moved controls; their intent is unchanged. A new e2e helper opens a control's popover the way a user reaches it.

### Try it (H3)

| # | Do this | Expect | ID |
| --- | --- | --- | --- |
| 1 | Move the mouse over the headline, then over an empty part of the page | A thin outline follows the pointer: the headline, then the whole page | CV-052 |
| 2 | Click the grey area around the page, then the empty page | The toolbar disappears; then the page toolbar (16:9 ▾, background, duration, Scenes) appears | CV-052 |
| 3 | Click the headline | One toolbar row: 16:9 ▾, Arial, − 78 +, colour, B I U S, aA, align, …; handles are round, the rotate button is under the box | CV-054, CV-053 |
| 4 | Click U, then S | The subtitle is underlined, then struck through; each is one undo step | TXT-036 |
| 5 | Click 16:9 ▾ and choose Square | The page becomes square, the design stays centred; the toast's Undo brings 16:9 back | CV-055 |
| 6 | Import a photo, drag it onto the page, double-click it | Crop mode: the photo dims outside a frame; the Crop panel opens on the left | VID-003 |
| 7 | Pick 1:1, then Done | The photo becomes square; what you kept did not move | VID-003 |
| 8 | Border ▾ (the square icon): choose Solid, set width 20; Corners: 100 | A black border inside the photo; rounded corners | VID-018 |
| 9 | Right-click the photo | Menu with icons: Lock, Show element timing, Alternative text, Set image as background, Download selection, Info… | CV-056 |
| 10 | Choose Lock, then try to drag it | It stays put; the toolbar shows only Unlock | CV-051 |
| 11 | Export | Quality 720p / 1080p / 4K with the size shown; More options has format, frame rate, start and end | EXP-006 |

### Known gaps (H3)

- The Font panel lists the seven system fonts. Search, recent fonts, Google Fonts and uploads are Wave 3 (TXT-006 to TXT-009).
- Effects, Adjust, Filters, the AI tools and Comment are shown but disabled; each names its wave.
- Hide (LYR-006) is not built, so CV-024 stays Todo even though Lock works.
- A new canvas size moves the design, but does not scale it to fit (Canva's Magic resize is AI).
- Locking a group does not lock children you reach by double-clicking into the group.
- Download selection saves a transparent PNG at composition scale. There is no size or background option yet.
