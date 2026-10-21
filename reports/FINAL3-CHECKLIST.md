# FINAL3 checklist

Tick only when code plus a test (or a screenshot opened at 1920 × 940) exists. States: `[x]` DONE, `[B]` BLOCKED (external reason named), `[ ]` not ticked.

## Part A, leftovers from FIX1

- [ ] A1 Un-pin the 18 tests pinned to 1600 × 1072 and make the whole e2e green at 1920 × 940
- [ ] A2 Pexels video endpoint is /v1/videos/... (search and popular), mocks and unit tests updated, tolerant mapper kept (hd/sd/hls, missing fps, HLS no size)
- [ ] A3a Effects tab for a selected nested clip (applies to the whole nest)
- [ ] A3b Speed tab for a selected nested clip (speed scales inner time)
- [ ] A3c Audio can be nested (audio clips and video-with-audio inside a nest play and export)
- [ ] A3d Tests for both; enter/exit nest still works
- [ ] A4 Test: adding stock icons/photos/videos shows no "Restored" toast; adding media never triggers undo
- [x] A5 Browser/offline TTS stays hidden behind the flag (owner confirmed; nothing to do)

## Part B, Text

### T1 Box model
- [ ] T1.1 Auto-width (default for new text): grows horizontally, never wraps by itself, only Enter makes a line
- [ ] T1.2 Fixed-width: side handle sets width, text wraps, height grows automatically
- [ ] T1.3 Corner handles scale the whole text (font size proportional)
- [ ] T1.4 Dragging a side handle switches auto-width to fixed-width
- [ ] T1.5 Double-click a side handle resets to auto-width
- [ ] T1.6 Box height = lines × line-height + padding, no phantom empty line; single line never wraps in auto-width
- [ ] T1.7 Measure with the real font after it loads; re-measure when the font arrives
- [ ] T1.8 Vertical align Top/Middle/Bottom moves text in a box with extra height
- [ ] T1.9 Horizontal align left/center/right/justify inside the box
- [ ] T1.10 Line spacing, letter spacing, case, colour, highlight/background, outline, shadow keep working
- [ ] T1.11 Old text layers migrate on load (schema backward compatible)

### T2 Editing
- [ ] T2.1 Double-click a text enters edit mode and selects all
- [ ] T2.2 Single click selects the layer; click again places the caret
- [ ] T2.3 Esc or click outside exits
- [ ] T2.4 Enter = new paragraph; Shift+Enter = soft line break
- [ ] T2.5 Visible 2 px blinking caret with contrast colour on white and dark canvases; selection highlight visible
- [ ] T2.6 autocomplete="off", autocorrect="off", spellcheck configurable, never a form field
- [ ] T2.7 IME / Hindi / Devanagari composition: no duplicate or lost characters, caret correct (unit test)
- [ ] T2.8 RTL (Arabic/Urdu) direction works
- [ ] T2.9 Undo/redo inside editing: one step per typing burst
- [ ] T2.10 Paste plain text (foreign HTML stripped)
- [ ] T2.11 Mouse-drag select, Shift+arrows, Ctrl/Cmd+A, Ctrl/Cmd+B/I/U

### T3 Lists
- [ ] T3.1 Lists act on paragraphs: N paragraphs = N bullets, 1 line = 1 bullet, no extra empty bullets
- [ ] T3.2 Enter in a list adds a bullet; Enter on an empty bullet exits the list
- [ ] T3.3 Tab / Shift+Tab indent levels
- [ ] T3.4 Stale empty lines removed when a list is made from a single line
- [ ] T3.5 Tables keep working (no regressions)

### T4 Fonts
- [ ] T4.1 Font picker rows in their own typeface, scrollable, search
- [ ] T4.2 Filters: Hindi/Devanagari, Serif, Sans, Display, Handwriting, Mono
- [ ] T4.3 Recently used on top
- [ ] T4.4 Google Fonts requested with each family's real weights/italics, never a missing weight
- [ ] T4.5 Failed font: real reason + Retry; layer falls back to a similar font without breaking layout
- [ ] T4.6 Bold/italic on a single-weight family = synthetic, no error
- [ ] T4.7 Devanagari coverage check ("नमस्ते दुनिया"); failing fonts hidden from Hindi filter; report lists which fail

### T5 Text panels
- [ ] T5.1 Left Text panel: search box
- [ ] T5.2 "Add a heading", "Add a subheading", "Add a little bit of body text"; heading ~8 % of canvas height, centred
- [ ] T5.3 "Font combinations": at least 12, English and Hindi, built in code
- [ ] T5.4 "Default text styles"
- [ ] T5.5 Drag from the panel onto the canvas works
- [ ] T5.6 Right panel for text: font, size (slider + number), colour, B/I/U/S, case, align H, align V, list, spacing, Effects, Position, Animate
- [ ] T5.7 Floating toolbar: font, size, colour, B/I, align, list, more

### Canva parity
- [ ] CP.1 Text tab: Add a heading / subheading / little bit of body text, Font combinations, default text styles, search
- [ ] CP.2 Toolbar font menu
- [ ] CP.3 Size: presets + typed value + minus/plus
- [ ] CP.4 Text colour with document colours + gradient picker up to 10 colours
- [ ] CP.5 Bold, Italic, Underline, Strikethrough
- [ ] CP.6 aA case toggle (UPPER / lower / Title)
- [ ] CP.7 Alignment left/center/right/justify
- [ ] CP.8 List: bullet / numbered / checklist
- [ ] CP.9 Effects, Animate, Position, Transparency
- [ ] CP.10 Lock/Unlock, Duplicate, Delete
- [ ] CP.11 Format painter (copies formatting from one text to another)
- [ ] CP.12 Spacing: Letter spacing + Line spacing sliders with number input
- [ ] CP.13 Text position: Superscript / Subscript / None
- [ ] CP.14 Typography: Kerning and Ligatures toggles + "Change all"
- [ ] CP.15 Font side panel: filter by language (incl. Hindi/Devanagari)
- [ ] CP.16 Weight picker per family
- [ ] CP.17 Document fonts
- [ ] CP.18 Recently used fonts
- [ ] CP.19 Upload own font (.ttf/.otf/.woff2) as "Uploaded fonts"
- [ ] CP.20 Effects with Intensity, Colour, Direction, Transparency sliders + "Remove effect"
- [ ] CP.21 Effect Shadow
- [ ] CP.22 Effect Lift
- [ ] CP.23 Effect Hollow
- [ ] CP.24 Effect Splice
- [ ] CP.25 Effect Echo
- [ ] CP.26 Effect Outline
- [ ] CP.27 Effect Glow
- [ ] CP.28 Effect Background (rounded box, roundness + spread)
- [ ] CP.29 Effect Glitch
- [ ] CP.30 Effect Neon
- [ ] CP.31 Shape Curve (negative and positive)
- [ ] CP.32 Effects render identically in preview and export
- [ ] CP.33 Handles: side = width (rewrap, auto height), corner = font scale, rotate, double-click side = auto-width
- [ ] CP.34 Group/ungroup text with other layers
- [ ] CP.35 Save a styled text as "My text style" (reusable, in Text tab)

### T6 Animations on text
- [ ] T6.1 Typewriter and per-character/word animations visible in preview and export
- [ ] T6.2 Reveal by grapheme cluster (no split Devanagari conjunct)

### T7 Tests (1920 × 940)
- [ ] T7.1 Single-line box height equals one line
- [ ] T7.2 "Shyam Monani" does not wrap in auto-width
- [ ] T7.3 Fixed width wraps and grows height
- [ ] T7.4 Double-click selects all
- [ ] T7.5 Caret visible (contrast assertion)
- [ ] T7.6 autocomplete attribute
- [ ] T7.7 List on 1 line = 1 bullet, on 3 paragraphs = 3
- [ ] T7.8 V-align moves text in a tall box
- [ ] T7.9 Font request builder for single-weight fonts
- [ ] T7.10 Devanagari composition unit test
- [ ] T7.11 Typewriter frame shows partial text

## Part C, Camera

### C1 Camera object
- [ ] C1.1 Properties: position x/y/z, pan/tilt + roll, focal length or FOV, perspective/ortho, shift x/y, clip start/end, DoF, track-to; defaults = identity
- [ ] C1.2 Several cameras per project
- [ ] C1.3 Camera track with shot clips (camera + controller + duration); cuts at shot boundaries (optional transition)
- [ ] C1.4 Works on every scene; each scene has its own camera track
- [ ] C1.5 Preview and export identical
- [ ] C1.6 No jitter: float maths, no per-frame pixel rounding; monotonic smooth push-in test

### Blender parity
- [ ] BP.1 Type Perspective / Orthographic
- [ ] BP.2 Lens Unit (Millimetres / Field of View), Focal Length, Field of View, Orthographic Scale
- [ ] BP.3 Lens presets (24, 35, 50, 85, 135 mm)
- [ ] BP.4 Sensor Fit (Auto / Horizontal / Vertical), Sensor Size, camera presets
- [ ] BP.5 Shift X / Y
- [ ] BP.6 Clip Start / End + Limits display toggle
- [ ] BP.7 DoF: Focus Object, Focus Distance (+ picker on canvas), F-Stop, Blades (>=3), Rotation, Ratio
- [ ] BP.8 Safe Areas: Title / Action Safe X/Y (EBU defaults), Center-Cut; overlay toggle
- [ ] BP.9 Passepartout with Alpha
- [ ] BP.10 Composition guides: Center, Center Diagonal, Thirds, Golden Ratio, Golden Triangle A/B, Harmonious Triangle A/B
- [ ] BP.11 Viewport display: Size, Name toggle, Sensor frame toggle
- [ ] BP.12 Background image (Image/Video, Alpha, Depth back/front, Frame method Stretch/Fit/Crop, Offset, Rotation, Scale, Flip H/V), never exported unless "Include in render"
- [ ] BP.13 Track To (target layer, up axis)
- [ ] BP.14 Several cameras, active camera switching via cut markers on the camera track
- [ ] BP.15 Everything rendered/exported, not just stored
- [ ] BP.16 Camera-edit gestures: drag = pan, wheel = dolly/zoom, middle/Alt-drag = orbit, Shift = fine

### C2 Controllers
- [ ] C2.1 Push in, Pull out, Pan left/right/up/down, Tilt, Orbit, Dolly zoom, Handheld shake (amount, speed, seed), Whip pan, Rack focus, Follow layer, Parallax drift, Hold
- [ ] C2.2 Each: start framing, end framing, duration, easing preset, strength, "Randomise within safe limits"
- [ ] C2.3 Parameters only, never keyframes in the UI
- [ ] C2.4 Presets row: Slow push, Reveal, Documentary drift, Punch-in, Shake hit

### C3 UI
- [ ] C3.1 Camera track collapsible, hidden when no camera used
- [ ] C3.2 Shots trim/move/split/delete/duplicate like clips
- [ ] C3.3 Canvas camera frame overlay with move/scale/rotate handles editing Start or End (toggle); outside dimmed; toolbar on/off toggle
- [ ] C3.4 "Preview camera" does not block selecting/moving layers
- [ ] C3.5 Right panel "Camera" when a shot or camera is selected, scrollable, shared slider; not in AI
- [ ] C3.6 Left rail / top toolbar Camera entry, not in AI
- [ ] C3.7 Add camera / Add shot / Duplicate camera / Delete; naming

### C4 Depth
- [ ] C4.1 Optional layer Depth (z); perspective camera gives parallax; 0 = unchanged
- [ ] C4.2 DoF blur by depth distance from focus; low cost, graceful fallback

### C5 Composition hook
- [ ] C5.1 `cameraShots` plain-data API
- [ ] C5.2 docs/camera.md with 3 examples

### C6 Tests (1920 × 940)
- [ ] C6.1 Add shot via UI
- [ ] C6.2 Controller preview changes frames
- [ ] C6.3 Push-in smooth (no step jitter)
- [ ] C6.4 Camera on scene 2 works
- [ ] C6.5 Export frame equals preview frame
- [ ] C6.6 Preview camera does not block layer selection
- [ ] C6.7 Camera panel not in AI category
- [ ] C6.8 Save/load keeps shots
- [ ] C6.9 Older projects without cameras unchanged

## Part D, Composition

### V1 Video Plan
- [ ] V1.1 Creator Pack kind `composition` version 2 with the plan shape (meta, feel, scenes, layers, mediaIntent, camera, transitionOut, sfx, captions, music, notes)
- [ ] V1.2 v1 still imports with the old dialog
- [ ] V1.3 JSON schema + validator with plain-language errors; unknown fields warn
- [ ] V1.4 Quality gate applies
- [ ] V1.5 docs/video-plan.md with a full 3-scene English example and a Hindi example
- [ ] V1.6 No slots

### V2 Auto-builder
- [ ] V2.0 Build video end to end with progress list, cancel and final summary
- [ ] V2.1 Media resolve: library first, then stock (Pexels/Pixabay/Iconify/emoji), ranked, top-4 alternatives; fallback card + "needs asset" flag; never blocks
- [ ] V2.2 Voice-over via the cloud TTS tool; no key = silent with banner; scene duration = max(voice + 0.4 s, durationHint)
- [ ] V2.3 Captions from narration timing (TTS word timing or proportional), style from feel.captionStyle
- [ ] V2.4 Layout by relative anchors, enter/exit animations, camera shots via cameraShots, transitions, music with ducking, sfx
- [ ] V2.5 Starter kit: lower-third ×3, title cards ×5, end card, subscribe/CTA, callout/arrow, number counter, quote card, 8 transitions incl. dip-to-black, 6 caption styles, 4 backgrounds; theme-able; unknown ids warn
- [ ] V2.6 Replaces a single empty default scene, else appends; Scenes strip opens; toast "Built N scenes"; first scene; nothing selected; one undo step
- [ ] V2.7 Deterministic; resolved choices stored so rebuild keeps swaps

### V3 Review and swap
- [ ] V3.1 Review side panel: scenes, narration, layers with thumbnails, flags
- [ ] V3.2 Up to 4 alternatives per media layer, "Search more", "Use my own"; swap keeps position/animation/camera
- [ ] V3.3 Change narration regenerates voice and captions; re-time, delete, reorder scene
- [ ] V3.4 Regenerate scene, Export plan (round-trip), Compare to plan
- [ ] V3.5 AI category lists the plan, its feel as "Theme", the starter kit; status colours

### V4 Theme
- [ ] V4.1 Save feel as a Theme in My themes (name, thumbnail, feel JSON, contains / does not contain)
- [ ] V4.2 Applying sets palette, fonts, caption style, transitions, camera tendency, pacing; content unchanged
- [ ] V4.3 Plan references a theme via themeId
- [ ] V4.4 Import/export a theme as a Creator Pack (kind documented)

### V5 Creator Playbook
- [ ] V5.1 docs/creator-playbook/ README + 01 to 06 heading-only files
- [ ] V5.2 07-plan-cheatsheet.md generated by `npm run docs:plan-cheatsheet` from the code registries

### V6 Tests
- [ ] V6.1 v2 plan, 3 scenes, Build: scenes, mocked stock media, alternatives, captions, camera, transitions; no slot dialog
- [ ] V6.2 No TTS key: silent with banner
- [ ] V6.3 Stock down: fallback cards + flags, build completes
- [ ] V6.4 Swap keeps position/animation; narration change regenerates voice (mock TTS)
- [ ] V6.5 Replaces the empty default scene; Scenes strip; undo removes whole build
- [ ] V6.6 v1 still imports; validator messages plain; unknown starter-kit id warns

## Part E, Final

- [ ] E1 Docs, changelog, reports/FINAL3.md, screenshots in reports/final3/ opened at 1920 × 940
- [ ] E2 Try-it script (at most 30 steps)
- [ ] E3 Full verify once (lint, typecheck, unit, full e2e at 1920 × 940, 1366 smoke); one draft PR
