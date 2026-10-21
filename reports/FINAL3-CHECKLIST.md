# FINAL3 checklist

Tick only when code plus a test (or a screenshot opened at 1920 × 940) exists. States: `[x]` DONE, `[B]` BLOCKED (external reason named), `[ ]` not ticked.

## Part A, leftovers from FIX1

- [x] A1 Un-pin the 18 tests pinned to 1600 × 1072 and make the whole e2e green at 1920 × 940 — full e2e at 1920 × 940, see reports/FINAL3.md §3
- [x] A2 Pexels video endpoint is /v1/videos/... (search and popular), mocks and unit tests updated, tolerant mapper kept (hd/sd/hls, missing fps, HLS no size) — FN3-001
- [x] A3a Effects tab for a selected nested clip (applies to the whole nest) — FN3-004
- [x] A3b Speed tab for a selected nested clip (speed scales inner time) — FN3-004
- [x] A3c Audio can be nested (audio clips and video-with-audio inside a nest play and export) — FN3-003 (e2e + unit)
- [x] A3d Tests for both; enter/exit nest still works — FN3-003, FN3-004
- [x] A4 Test: adding stock icons/photos/videos shows no "Restored" toast; adding media never triggers undo — FN3-002
- [x] A5 Browser/offline TTS stays hidden behind the flag (owner confirmed; nothing to do)

## Part B, Text

### T1 Box model
- [x] T1.1 Auto-width (default for new text): grows horizontally, never wraps by itself, only Enter makes a line — FN3-005
- [x] T1.2 Fixed-width: side handle sets width, text wraps, height grows automatically — FN3-005
- [x] T1.3 Corner handles scale the whole text (font size proportional) — FN3-010
- [x] T1.4 Dragging a side handle switches auto-width to fixed-width — FN3-005
- [x] T1.5 Double-click a side handle resets to auto-width — FN3-005
- [x] T1.6 Box height = lines × line-height + padding, no phantom empty line; single line never wraps in auto-width — FN3-005 (unit: no phantom line)
- [x] T1.7 Measure with the real font after it loads; re-measure when the font arrives — FN3-005 (unit: measured again when a font arrives)
- [x] T1.8 Vertical align Top/Middle/Bottom moves text in a box with extra height — FN3-005 (unit), TXT-015
- [x] T1.9 Horizontal align left/center/right/justify inside the box — TXT-016, TXT-014 (text-style.spec)
- [x] T1.10 Line spacing, letter spacing, case, colour, highlight/background, outline, shadow keep working — TXT-016, TXT-036, FN3-008
- [x] T1.11 Old text layers migrate on load (schema backward compatible) — FN3-005 (unit: old layers keep their look)

### T2 Editing
- [x] T2.1 Double-click a text enters edit mode and selects all — FN3-009
- [x] T2.2 Single click selects the layer; click again places the caret — FN3-009
- [x] T2.3 Esc or click outside exits — FN3-009, TXT-003
- [x] T2.4 Enter = new paragraph; Shift+Enter = soft line break — FN3-009
- [x] T2.5 Visible 2 px blinking caret with contrast colour on white and dark canvases; selection highlight visible — FN3-009, FX1-018
- [x] T2.6 autocomplete="off", autocorrect="off", spellcheck configurable, never a form field — FN3-009, FN3-030
- [x] T2.7 IME / Hindi / Devanagari composition: no duplicate or lost characters, caret correct (unit test) — FN3-007, TXT-004
- [x] T2.8 RTL (Arabic/Urdu) direction works — F2-030
- [x] T2.9 Undo/redo inside editing: one step per typing burst — FN3-030
- [x] T2.10 Paste plain text (foreign HTML stripped) — FN3-007, TXT-003
- [x] T2.11 Mouse-drag select, Shift+arrows, Ctrl/Cmd+A, Ctrl/Cmd+B/I/U — FN3-030, TXT-003, TXT-023

### T3 Lists
- [x] T3.1 Lists act on paragraphs: N paragraphs = N bullets, 1 line = 1 bullet, no extra empty bullets — FN3-006
- [x] T3.2 Enter in a list adds a bullet; Enter on an empty bullet exits the list — FN3-006
- [x] T3.3 Tab / Shift+Tab indent levels — FN3-006
- [x] T3.4 Stale empty lines removed when a list is made from a single line — FN3-006 (unit)
- [x] T3.5 Tables keep working (no regressions) — F2-032

### T4 Fonts
- [x] T4.1 Font picker rows in their own typeface, scrollable, search — FX1-017, F2-030
- [x] T4.2 Filters: Hindi/Devanagari, Serif, Sans, Display, Handwriting, Mono — FN3-028, F2-030
- [x] T4.3 Recently used on top — F2-030
- [x] T4.4 Google Fonts requested with each family's real weights/italics, never a missing weight — FN3-012 (unit)
- [x] T4.5 Failed font: real reason + Retry; layer falls back to a similar font without breaking layout — FN3-028
- [x] T4.6 Bold/italic on a single-weight family = synthetic, no error — FN3-012 (unit)
- [B] T4.7 Devanagari coverage check ("नमस्ते दुनिया"); failing fonts hidden from Hindi filter; report lists which fail — check runs and hides failing fonts (F2-030); the list of failing catalogue fonts needs fonts.googleapis.com, which the sandbox cannot reach (D-297)

### T5 Text panels
- [x] T5.1 Left Text panel: search box — FN3-011
- [x] T5.2 "Add a heading", "Add a subheading", "Add a little bit of body text"; heading ~8 % of canvas height, centred — FN3-005, FN3-011
- [x] T5.3 "Font combinations": at least 12, English and Hindi, built in code — FN3-011
- [x] T5.4 "Default text styles" — FN3-011
- [x] T5.5 Drag from the panel onto the canvas works — FN3-011
- [x] T5.6 Right panel for text: font, size (slider + number), colour, B/I/U/S, case, align H, align V, list, spacing, Effects, Position, Animate — F2-030, LAY-043, FN3-026
- [x] T5.7 Floating toolbar: font, size, colour, B/I, align, list, more — FN3-026, FN3-006, FN3-008

### Canva parity
- [x] CP.1 Text tab: Add a heading / subheading / little bit of body text, Font combinations, default text styles, search — FN3-011
- [x] CP.2 Toolbar font menu — F2-030, TXT-010
- [x] CP.3 Size: presets + typed value + minus/plus — TXT-023 (size field, + and −)
- [x] CP.4 Text colour with document colours + gradient picker up to 10 colours — FN3-026
- [x] CP.5 Bold, Italic, Underline, Strikethrough — TXT-036, TXT-023
- [x] CP.6 aA case toggle (UPPER / lower / Title) — FN3-026
- [x] CP.7 Alignment left/center/right/justify — TXT-014
- [x] CP.8 List: bullet / numbered / checklist — FN3-006
- [x] CP.9 Effects, Animate, Position, Transparency — FN3-008, ANI-007, CV-042
- [x] CP.10 Lock/Unlock, Duplicate, Delete — CV-051, CV-040
- [x] CP.11 Format painter (copies formatting from one text to another) — FN3-026
- [x] CP.12 Spacing: Letter spacing + Line spacing sliders with number input — TXT-016
- [x] CP.13 Text position: Superscript / Subscript / None — FN3-026
- [x] CP.14 Typography: Kerning and Ligatures toggles + "Change all" — FN3-026, FN3-007
- [x] CP.15 Font side panel: filter by language (incl. Hindi/Devanagari) — F2-030
- [x] CP.16 Weight picker per family — TXT-010
- [x] CP.17 Document fonts — FN3-028
- [x] CP.18 Recently used fonts — F2-030
- [x] CP.19 Upload own font (.ttf/.otf/.woff2) as "Uploaded fonts" — FN3-012
- [x] CP.20 Effects with Intensity, Colour, Direction, Transparency sliders + "Remove effect" — FN3-027
- [x] CP.21 Effect Shadow — FN3-027
- [x] CP.22 Effect Lift — FN3-027
- [x] CP.23 Effect Hollow — FN3-027
- [x] CP.24 Effect Splice — FN3-027
- [x] CP.25 Effect Echo — FN3-027
- [x] CP.26 Effect Outline — FN3-027
- [x] CP.27 Effect Glow — FN3-027
- [x] CP.28 Effect Background (rounded box, roundness + spread) — FN3-027
- [x] CP.29 Effect Glitch — FN3-027
- [x] CP.30 Effect Neon — FN3-027, FN3-008
- [x] CP.31 Shape Curve (negative and positive) — FN3-008
- [x] CP.32 Effects render identically in preview and export — FN3-008
- [x] CP.33 Handles: side = width (rewrap, auto height), corner = font scale, rotate, double-click side = auto-width — FN3-005, FN3-010
- [x] CP.34 Group/ungroup text with other layers — LYR-012, CV-040
- [x] CP.35 Save a styled text as "My text style" (reusable, in Text tab) — FN3-011

### T6 Animations on text
- [x] T6.1 Typewriter and per-character/word animations visible in preview and export — FN3-008, FN3-030
- [x] T6.2 Reveal by grapheme cluster (no split Devanagari conjunct) — FN3-008 (unit)

### T7 Tests (1920 × 940)
- [x] T7.1 Single-line box height equals one line — FN3-005
- [x] T7.2 "Shyam Monani" does not wrap in auto-width — FN3-005
- [x] T7.3 Fixed width wraps and grows height — FN3-005
- [x] T7.4 Double-click selects all — FN3-009
- [x] T7.5 Caret visible (contrast assertion) — FN3-009
- [x] T7.6 autocomplete attribute — FN3-009
- [x] T7.7 List on 1 line = 1 bullet, on 3 paragraphs = 3 — FN3-006
- [x] T7.8 V-align moves text in a tall box — FN3-005 (unit)
- [x] T7.9 Font request builder for single-weight fonts — FN3-012 (unit)
- [x] T7.10 Devanagari composition unit test — FN3-007
- [x] T7.11 Typewriter frame shows partial text — FN3-008

## Part C, Camera

### C1 Camera object
- [x] C1.1 Properties: position x/y/z, pan/tilt + roll, focal length or FOV, perspective/ortho, shift x/y, clip start/end, DoF, track-to; defaults = identity — FN3-013, FN3-015
- [x] C1.2 Several cameras per project — FN3-015
- [x] C1.3 Camera track with shot clips (camera + controller + duration); cuts at shot boundaries (optional transition) — FN3-014
- [x] C1.4 Works on every scene; each scene has its own camera track — FN3-018
- [x] C1.5 Preview and export identical — FN3-016
- [x] C1.6 No jitter: float maths, no per-frame pixel rounding; monotonic smooth push-in test — FN3-013

### Blender parity
- [x] BP.1 Type Perspective / Orthographic — FN3-013, FN3-015
- [x] BP.2 Lens Unit (Millimetres / Field of View), Focal Length, Field of View, Orthographic Scale — FN3-015
- [x] BP.3 Lens presets (24, 35, 50, 85, 135 mm) — FN3-015
- [x] BP.4 Sensor Fit (Auto / Horizontal / Vertical), Sensor Size, camera presets — FN3-013, FN3-015
- [x] BP.5 Shift X / Y — FN3-015
- [x] BP.6 Clip Start / End + Limits display toggle — FN3-013, FN3-015
- [x] BP.7 DoF: Focus Object, Focus Distance (+ picker on canvas), F-Stop, Blades (>=3), Rotation, Ratio — FN3-013, FN3-029
- [x] BP.8 Safe Areas: Title / Action Safe X/Y (EBU defaults), Center-Cut; overlay toggle — FN3-013, FN3-029
- [x] BP.9 Passepartout with Alpha — FN3-029
- [x] BP.10 Composition guides: Center, Center Diagonal, Thirds, Golden Ratio, Golden Triangle A/B, Harmonious Triangle A/B — FN3-013, FN3-029
- [x] BP.11 Viewport display: Size, Name toggle, Sensor frame toggle — FN3-029
- [x] BP.12 Background image (Image/Video, Alpha, Depth back/front, Frame method Stretch/Fit/Crop, Offset, Rotation, Scale, Flip H/V), never exported unless "Include in render" — FN3-029
- [x] BP.13 Track To (target layer, up axis) — FN3-029
- [x] BP.14 Several cameras, active camera switching via cut markers on the camera track — FN3-014
- [x] BP.15 Everything rendered/exported, not just stored — FN3-016, FN3-029
- [x] BP.16 Camera-edit gestures: drag = pan, wheel = dolly/zoom, middle/Alt-drag = orbit, Shift = fine — FN3-017

### C2 Controllers
- [x] C2.1 Push in, Pull out, Pan left/right/up/down, Tilt, Orbit, Dolly zoom, Handheld shake (amount, speed, seed), Whip pan, Rack focus, Follow layer, Parallax drift, Hold — FN3-013
- [x] C2.2 Each: start framing, end framing, duration, easing preset, strength, "Randomise within safe limits" — FN3-013, FN3-015
- [x] C2.3 Parameters only, never keyframes in the UI — FN3-015
- [x] C2.4 Presets row: Slow push, Reveal, Documentary drift, Punch-in, Shake hit — FN3-015

### C3 UI
- [x] C3.1 Camera track collapsible, hidden when no camera used — FN3-015, FN3-018
- [x] C3.2 Shots trim/move/split/delete/duplicate like clips — FN3-015
- [x] C3.3 Canvas camera frame overlay with move/scale/rotate handles editing Start or End (toggle); outside dimmed; toolbar on/off toggle — FN3-017
- [x] C3.4 "Preview camera" does not block selecting/moving layers — FN3-016
- [x] C3.5 Right panel "Camera" when a shot or camera is selected, scrollable, shared slider; not in AI — FN3-015
- [x] C3.6 Left rail / top toolbar Camera entry, not in AI — FN3-015
- [x] C3.7 Add camera / Add shot / Duplicate camera / Delete; naming — FN3-015, FN3-030

### C4 Depth
- [x] C4.1 Optional layer Depth (z); perspective camera gives parallax; 0 = unchanged — FN3-013
- [x] C4.2 DoF blur by depth distance from focus; low cost, graceful fallback — FN3-013

### C5 Composition hook
- [x] C5.1 `cameraShots` plain-data API — FN3-014
- [x] C5.2 docs/camera.md with 3 examples — docs/camera.md

### C6 Tests (1920 × 940)
- [x] C6.1 Add shot via UI — FN3-015
- [x] C6.2 Controller preview changes frames — FN3-016
- [x] C6.3 Push-in smooth (no step jitter) — FN3-013
- [x] C6.4 Camera on scene 2 works — FN3-018
- [x] C6.5 Export frame equals preview frame — FN3-016
- [x] C6.6 Preview camera does not block layer selection — FN3-016
- [x] C6.7 Camera panel not in AI category — FN3-015
- [x] C6.8 Save/load keeps shots — FN3-018
- [x] C6.9 Older projects without cameras unchanged — FN3-014, FN3-018

## Part D, Composition

### V1 Video Plan
- [x] V1.1 Creator Pack kind `composition` version 2 with the plan shape (meta, feel, scenes, layers, mediaIntent, camera, transitionOut, sfx, captions, music, notes) — FN3-019
- [x] V1.2 v1 still imports with the old dialog — FN3-024
- [x] V1.3 JSON schema + validator with plain-language errors; unknown fields warn — FN3-019, FN3-024
- [x] V1.4 Quality gate applies — FN3-019
- [x] V1.5 docs/video-plan.md with a full 3-scene English example and a Hindi example — docs/video-plan.md, tests/fixtures/plans
- [x] V1.6 No slots — FN3-021

### V2 Auto-builder
- [x] V2.0 Build video end to end with progress list, cancel and final summary — FN3-021
- [x] V2.1 Media resolve: library first, then stock (Pexels/Pixabay/Iconify/emoji), ranked, top-4 alternatives; fallback card + "needs asset" flag; never blocks — FN3-020, FN3-022
- [x] V2.2 Voice-over via the cloud TTS tool; no key = silent with banner; scene duration = max(voice + 0.4 s, durationHint) — FN3-020, FN3-022
- [x] V2.3 Captions from narration timing (TTS word timing or proportional), style from feel.captionStyle — FN3-020
- [x] V2.4 Layout by relative anchors, enter/exit animations, camera shots via cameraShots, transitions, music with ducking, sfx — FN3-020, FN3-021
- [x] V2.5 Starter kit: lower-third ×3, title cards ×5, end card, subscribe/CTA, callout/arrow, number counter, quote card, 8 transitions incl. dip-to-black, 6 caption styles, 4 backgrounds; theme-able; unknown ids warn — FN3-019
- [x] V2.6 Replaces a single empty default scene, else appends; Scenes strip opens; toast "Built N scenes"; first scene; nothing selected; one undo step — FN3-021
- [x] V2.7 Deterministic; resolved choices stored so rebuild keeps swaps — FN3-020

### V3 Review and swap
- [x] V3.1 Review side panel: scenes, narration, layers with thumbnails, flags — FN3-023
- [x] V3.2 Up to 4 alternatives per media layer, "Search more", "Use my own"; swap keeps position/animation/camera — FN3-023
- [x] V3.3 Change narration regenerates voice and captions; re-time, delete, reorder scene — FN3-023
- [x] V3.4 Regenerate scene, Export plan (round-trip), Compare to plan — FN3-023
- [x] V3.5 AI category lists the plan, its feel as "Theme", the starter kit; status colours — FN3-025

### V4 Theme
- [x] V4.1 Save feel as a Theme in My themes (name, thumbnail, feel JSON, contains / does not contain) — FN3-025
- [x] V4.2 Applying sets palette, fonts, caption style, transitions, camera tendency, pacing; content unchanged — FN3-025
- [x] V4.3 Plan references a theme via themeId — FN3-025
- [x] V4.4 Import/export a theme as a Creator Pack (kind documented) — FN3-025

### V5 Creator Playbook
- [x] V5.1 docs/creator-playbook/ README + 01 to 06 heading-only files — docs/creator-playbook
- [x] V5.2 07-plan-cheatsheet.md generated by `npm run docs:plan-cheatsheet` from the code registries — npm run docs:plan-cheatsheet

### V6 Tests
- [x] V6.1 v2 plan, 3 scenes, Build: scenes, mocked stock media, alternatives, captions, camera, transitions; no slot dialog — FN3-021
- [x] V6.2 No TTS key: silent with banner — FN3-022
- [x] V6.3 Stock down: fallback cards + flags, build completes — FN3-022
- [x] V6.4 Swap keeps position/animation; narration change regenerates voice (mock TTS) — FN3-023
- [x] V6.5 Replaces the empty default scene; Scenes strip; undo removes whole build — FN3-021
- [x] V6.6 v1 still imports; validator messages plain; unknown starter-kit id warns — FN3-024

## Part E, Final

- [x] E1 Docs, changelog, reports/FINAL3.md, screenshots in reports/final3/ opened at 1920 × 940 — reports/FINAL3.md, docs, CHANGELOG, reports/final3/
- [x] E2 Try-it script (at most 30 steps) — reports/FINAL3.md §4
- [x] E3 Full verify once (lint, typecheck, unit, full e2e at 1920 × 940, 1366 smoke); one draft PR — reports/FINAL3.md §3; draft PR
