# Complete UX/UI Layout Schema

> Source: owner-supplied PDF, converted to Markdown by text extraction (12 pages). Table layout is approximate; wording is exact.
> Role: WHERE things live on screen, per view mode, responsive rules, layout build order (shell-first).
> Precedence: this is *reference*. On conflict, `AGENTS.md`, the current brief, `docs/FEATURES.md` and `docs/DECISIONS.md` win. See AGENTS.md section 1.


---

## Page 1

AI-Native Video Editor — Complete UX/UI/Layout Schema Page 1
AI-Native Video Editor
COMPLETE UX / UI / LAYOUT / INTERACTION
SCHEMA
Developer Handoff Specification — pre-decided wiring for the editor surface, canvas, timeline, libraries, object manipulation, menus,
shortcuts, progressive disclosure and AI integration.
MASTER PRINCIPLE: One powerful editor engine. Beginner / Creator / Advanced are only three UI-density views of the same
underlying capabilities.
Goal: developers should execute the feature set without repeatedly deciding where a control belongs, how an object behaves, or which
interaction pattern to invent.
1. MASTER UI PHILOSOPHY
• Canva-like surface: obvious actions, clean spacing, visual libraries, drag-and-drop and direct manipulation.
• CapCut/Clipchamp-like media workflow: visual effects, transitions, animations and templates.
• After Effects/Fusion/Blender depth: advanced animation, compositing, expressions, tracking, 3D and procedural systems remain
available.
• Progressive disclosure: never remove capability; expose complexity only when required.
• Same interaction language everywhere: image, video, shape, text and graphic objects share selection, transform, grouping, locking and
animation rules.
• AI is another control surface: AI uses the same Command Bus and Scene Graph as human actions.
2. MASTER APPLICATION LAYOUT
Region Position Purpose Rule
Top Bar Full width Project, undo/redo, save, view, share, export Always visible
Left Library Rail Left Media, templates, text, shapes, graphics, stickers,
frames, audio, effects, transitions, animations
Collapsible
Library Drawer Left/overlay Search, categories, visual cards, filters Resizable
Context Toolbar Above canvas Most-used controls for current selection Selection-sensitive
Canvas / Stage Center Main composition workspace Largest area
Right Inspector Right Properties, text, transform, effects, masks, animation,
advanced
Context-sensitive
Timeline Bottom Scenes, layers, clips, keyframes, audio, markers Resizable
Status Bar Bottom edge Zoom, snap, preview quality, FPS/render state Compact
Canonical wireframe
TOP BAR: Logo | Project | Undo/Redo | Save | View Mode | Share | Export
LEFT LIBRARIES CONTEXT TOOLBAR RIGHT INSPECTOR
■■■■■■■■■■■■■■■■ ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■ ■■■■■■■■■■■■■■■■■■
■ Media ■ ■ Select | Transform | Crop | ... ■ ■ Properties ■
■ Templates ■ ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■ ■ Transform ■
■ Text ■ ■ ■ ■ Text ■
■ Shapes ■ ■ CANVAS ■ ■ Effects ■
■ Graphics ■ ■ ■ ■ Animation ■
■ Stickers ■ ■ ■ ■ Masks ■
■ Frames ■ ■ ■ ■ Advanced ■
■ Audio ■ ■ ■ ■■■■■■■■■■■■■■■■■■
■ Effects ■ ■ ■
■ Transitions ■ ■ ■
■ Animations ■ ■ ■
■■■■■■■■■■■■■■■■ ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
SCENES: [Intro] [Scene 01] [Scene 02] [Scene 03] [+ New Scene]
TIMELINE: tracks/layers | ruler | playhead | keyframes | audio | markers
3. THREE VIEWS — SAME ENGINE
View Default exposure Advanced controls
Beginner Libraries, direct canvas controls, simple timeline, common inspector Graph editor, expressions, deep compositing, detailed color/3D
hidden
Creator Beginner + richer keyframes, masks, effects, component controls Expert technical controls collapsed


---

## Page 2

AI-Native Video Editor — Complete UX/UI/Layout Schema Page 2
View Default exposure Advanced controls
Advanced Full layer stack, graph editor, expressions, procedural, tracking, 3D, deep
color/audio
Nothing essential removed; panels still collapsible
Switching views never changes the project. It only changes UI density and discoverability.
4. CANVAS — COMPLETE INTERACTION CONTRACT
Action Default Modifier / advanced
Left click empty Deselect Drag = selection marquee
Left click object Select Shift-click adds/removes
Drag object Move Shift constrains axis; snap to guides/objects
Corner handle Uniform scale Shift toggles free/proportional; Alt/Option = scale from center
Side handle Scale X or Y Numeric transform available
Rotation handle Rotate Shift angle snap; fine adjustment modifier
Double click Object edit mode Text enters inline editing; group enters isolation
Right click Context menu Menu is selection/object aware
Wheel Zoom around pointer Smooth zoom
Space + drag Pan Infinite stage navigation
Escape Cancel/exit edit/deselect Context-dependent
5. OBJECT BOUNDING BOX / HANDLES
• Default selection: rectangle with 8 resize handles + rotation handle.
• Corner handles: two-axis scale. Default proportional; modifier toggles free X/Y.
• Side handles: left/right = X scale; top/bottom = Y scale.
• Anchor/pivot: visible in Transform tool; draggable.
• Multi-select: one outer bounding box plus subtle individual outlines.
• Group: first click selects group; double-click enters isolation; breadcrumb shows hierarchy.
• Locked: cannot be selected/changed from canvas; lock badge remains visible.
• Crop: dedicated Crop mode replaces transform handles to prevent accidental scaling.
• Text: click selects; double-click edits text directly.
Recommended default: corner = proportional scale; side = single-axis scale; Shift = temporary constraint toggle; Alt/Option =
center-based transform.
6. LEFT / RIGHT CLICK CONTEXT MENUS
Target Left click Right-click menu
Empty canvas Deselect / marquee Paste, Select All, Deselect, Grid, Guides, Snap, Canvas Settings
Image/video Select Cut, Copy, Duplicate, Lock, Hide, Group, Arrange, Replace, Crop, Mask, Extract Frame,
Detach Audio, Component
Text Select/edit Cut, Copy, Duplicate, Edit, Style, Animate, Convert to Shape, Component, Lock
Shape/graphic Select Duplicate, Edit Shape, Boolean, Group, Arrange, Convert, Animate, Component
Group Select Enter Group, Ungroup, Duplicate, Lock, Isolate, Component
Multi-selection Select set Group, Align, Distribute, Lock, Hide, Duplicate, Combine, Component
Timeline clip Select/drag Cut, Split, Ripple, Replace, Speed, Reverse, Freeze, Detach Audio, Compound Clip
7. CONTEXT TOOLBAR
Selection Controls
Nothing Select | Pan | Zoom | Grid | Guides | Snap | Canvas
Image/video Position | Scale | Rotate | Crop | Flip | Opacity | Blend | Animate | Replace
Text Font | Size | Weight | Color | Align | Spacing | Effects | Animate | More
Shape Fill | Stroke | Width | Corner | Boolean | Align | Animate | More
Group/multiple Move | Scale | Rotate | Align | Distribute | Group/Ungroup | Lock
Audio Volume | Fade | Speed | Noise Reduction | Ducking | Effects


---

## Page 3

AI-Native Video Editor — Complete UX/UI/Layout Schema Page 3
8. RIGHT INSPECTOR — UNIVERSAL PROPERTY PANEL
Section Purpose
Quick Properties High-frequency controls: position, size, rotation, opacity, visibility
Transform X/Y/Z, width/height, scale, rotation, anchor, skew
Appearance Fill, stroke, blend, opacity, video appearance
Animation Animate button, keyframes, presets, easing
Effects Applied effect stack, reorder, enable/disable, parameters
Masks Add/edit/invert/feather/expansion; tracking in advanced
Advanced Expressions, constraints, links, procedural controls, 3D/shaders
Inspector rule: show roughly 5–8 high-frequency controls first; use expandable sections for depth; allow users to pin favorite properties.


---

## Page 4

AI-Native Video Editor — Complete UX/UI/Layout Schema Page 4
9. TEXT UI — CANVA-LIKE BASIC, PRO-READY UNDERNEATH
• Basic: font family, size, bold, italic, underline, color, alignment.
• Spacing: letter spacing, line height, paragraph spacing, box padding.
• Layout: fixed/auto-size, wrapping, RTL, vertical alignment.
• Style: fill, stroke, shadow, background, opacity, blend.
• Animation: entrance, emphasis, exit, character/word/line controls.
• Advanced: text-on-path, variable fonts, per-character styling, 3D, expressions.
• Inline editing: typing happens directly on canvas; toolbar mirrors common controls.
10. OBJECT LIBRARIES — VISUAL, SEARCHABLE, DRAGGABLE
Library Categories Layout
Media Uploads, folders, recent, favorites, stock Thumbnail grid + search/filter
Templates Video, intro, outro, social, documentary Large visual cards
Text Titles, subtitles, lower thirds, kinetic Animated preview cards
Shapes Basic, arrows, callouts, diagrams Icon/thumbnail grid
Graphics Charts, maps, infographics, diagrams Visual category grid
Stickers Emoji, decorative, labels Grid + search
Frames Photo/video frames and placeholders Visual grid
Audio Music, SFX, voice, favorites Cards + waveform
Transitions Dissolve, wipe, zoom, camera, morph, shader Animated preview cards
Effects Color, blur, glow, distortion, stylize Preview thumbnails
Animations Entrance, exit, emphasis, motion Animated preview cards
Components User-saved reusable compositions/objects Cards + editable badge
Library rules
• Drag asset to canvas = create at drop position.
• Drag media to timeline = insert at playhead.
• Drag media onto existing media object = explicit replacement while preserving compatible properties.
• Hover = preview; click = inspect; double-click = add with default placement.
• Right-click = add, favorite, rename, duplicate, create component/template.
• Search supports natural-language intent such as “cinematic map”, “minimal documentary title”, “red lower third”.
11. TIMELINE — POWERFUL BUT APPROACHABLE
Area Layout / behavior
Scene strip Above timeline: scene tabs + [+ New Scene]; reorder/rename/duplicate.
Transport Left: previous/step; center: play/pause/timecode; right: loop/quality.
Track header Lock, hide, solo, mute, color, label, expand/collapse.
Ruler Timecode, snapping, markers, playhead.
Clips/layers Thumbnail/waveform blocks with trim handles and labels.
Keyframes Diamonds in Creator/Advanced; simple animation badge in Beginner.
Nested scenes Double-click to enter; breadcrumb shows hierarchy.
Resize Drag top edge; maximize/minimize timeline.
Search Find layer, clip, marker or asset.
SCENES: [Intro] [Scene 01] [Scene 02] [Scene 03] [Outro] [+ New Scene]
PLAY: |■ |■ | PLAY/PAUSE | ■| ■| 00:01:24:12 LOOP | QUALITY
RULER: 0s■■■■5s■■■■10s■■■■15s■■■■20s■■■■25s
V1: [Intro] [ Scene 01 footage ] [Map] [Outro]
V2: [Title========] [Lower Third]
V3: [Chart / Graphics===========]
A1: [Narration waveform==================================]
A2: [Music===========================================]
12. NEW SCENE FLOW


---

## Page 5

AI-Native Video Editor — Complete UX/UI/Layout Schema Page 5
• + New Scene chooser: Blank / From Template / Duplicate / From Selection / AI Plan.
• Inherits project resolution, FPS, color and audio settings.
• Gets unique ID + readable name (Scene 01, Scene 02…).
• Drag tabs to reorder; double-click name to rename.
• Scene duration is adjustable by timeline trim or numeric control.
• Scenes remain editable/nestable; AI uses the same Scene Graph.
13. PLAYBACK / TRANSPORT
Control Default Shortcut
Play/Pause Center Space
Step frame Center Left/Right Arrow
Beginning/end Transport Home/End
Previous/next cut/marker Transport Configurable
Loop Right Configurable
Scrub Timeline playhead Drag
Set playhead Ruler Click
14. KEYBOARD SHORTCUT SYSTEM
Action Default
Play/Pause Space
Undo / Redo Ctrl/Cmd+Z / Shift+Ctrl/Cmd+Z
Copy / Paste Ctrl/Cmd+C / V
Duplicate Ctrl/Cmd+D
Delete Delete / Backspace
Select all Ctrl/Cmd+A
Group / Ungroup Ctrl/Cmd+G / Shift+Ctrl/Cmd+G
Lock Ctrl/Cmd+Shift+L
Zoom Ctrl/Cmd +/-
Pan Space + drag
Frame selection F
Split clip S
Marker M
Add keyframe K
Search/Command Palette Ctrl/Cmd+K
Escape Esc
Every shortcut must map to a Command ID and remain remappable. Buttons, menus, drag actions and AI commands must
invoke the same Command Bus.


---

## Page 6

AI-Native Video Editor — Complete UX/UI/Layout Schema Page 6
15. SEARCH EVERYTHING / COMMAND PALETTE
• Ctrl/Cmd+K opens one universal search.
• Search commands, assets, scenes, layers, effects, templates, shortcuts and AI actions.
• Examples: “add blur”, “select Scene 04”, “show graph editor”, “insert lower third”, “lock selected”, “export 4K”.
• Deterministic commands appear first; AI suggestions can appear below.
• Command palette is the discoverability fallback for every important feature.
16. DRAG / DROP RULES
Drop target Result
Empty canvas Create object at drop point
Existing media object Replace source while preserving compatible properties
Timeline track Insert at playhead
Scene tab Add/move asset to scene
Effect slot Apply effect
Transition boundary Apply transition
Animation slot Apply animation
Library folder Move asset
Component slot Replace component input
17. ANIMATION LIBRARY
Category Examples Behavior
Entrance Fade, slide, scale, pop, type-on, reveal One-click + editable parameters
Exit Fade, slide, blur-out, scale Non-destructive
Emphasis Pulse, bounce, shake, glow Parameter editable
Motion Pan, zoom, orbit, follow path Keyframes/procedural
Text Character/word reveal, kinetic Preserves text
Image Ken Burns, parallax, camera push Editable transform/camera
Graphic Chart draw, map route, number count Data/parameter driven
3D Orbit, camera move, depth reveal Advanced controls
18. EFFECT LIBRARY
Category Examples UI rule
Color Exposure, curves, HSL, LUT Simple first; scopes in Advanced
Blur Gaussian, directional, radial, lens Preview + amount
Stylize Glow, grain, sharpen, vignette, chromatic aberration Thumbnail + editable controls
Distort Warp, displacement, ripple, bulge, lens Reorderable effect stack
Time Echo, trails, temporal blur, frame blend Timeline-aware
AI/restoration Denoise, upscale, deblur, stabilize Show compute/cost state where relevant
19. TRANSITION LIBRARY
• Transitions live between clips.
• Drag a transition onto a cut; trim its edges to change duration.
• Hover previews the transition using neighboring clips.
• Inspector controls duration, direction, softness, amount and custom parameters.
• Advanced users can open procedural/shader controls when supported.
• AI can modify only selected boundaries.
20. ALIGN / DISTRIBUTE / SMART GUIDES
Feature Behavior
Smart guides Alignment lines when edges/centers approach objects/canvas


---

## Page 7

AI-Native Video Editor — Complete UX/UI/Layout Schema Page 7
Feature Behavior
Snap Canvas, grid, guides, object edges/centers, timeline markers
Align Left, center, right, top, middle, bottom
Distribute Horizontal/vertical spacing
Tidy Normalize spacing/alignment
Safe zones Optional title/action safe overlays
21. GROUP / LOCK / HIERARCHY
• Group: Ctrl/Cmd+G; creates a Scene Graph parent without flattening.
• Isolation: double-click group; breadcrumb shows hierarchy.
• Lock: prevents accidental edits and displays lock icon.
• Hide: no visual output, structure preserved.
• Solo: preview only selected layer/track.
• Parenting: visual pick-whip in Advanced.
• Null/control objects: drive multiple layers.
22. CROP / MASK / FRAME
Tool Beginner Creator Advanced
Crop Direct handles Aspect presets + numeric Animated crop
Mask Simple shapes Bezier/feather/invert Tracking/roto
Frame Drag into frame Fit/fill controls Custom path frame
Reframe Smart fit/fill Manual Subject-aware AI assist
23. NON-DESTRUCTIVE MEDIA MODEL
SOURCE ASSET → MEDIA OBJECT
→ Transform → Crop/Reframe → Color → Effects → Speed/Time → Mask → Animation
→ COMPOSITE OUTPUT
Rule: original user footage is never silently replaced. Replacement is explicit or permission-controlled. Generated, stock and
original media are visibly distinguishable in the asset system.


---

## Page 8

AI-Native Video Editor — Complete UX/UI/Layout Schema Page 8
24. AI-NATIVE UI WIRING
USER REQUEST / AI REQUEST
↓
INTENT
↓
PLAN
↓
TASK GRAPH
↓
VALIDATE CAPABILITY + TARGET + PERMISSION
↓
COMMAND BUS
↓
EDITOR CORE
↓
SCENE GRAPH
↓
CANVAS + TIMELINE + INSPECTOR UPDATE
AI must not maintain a secret parallel editor. AI creates the same editable layers, properties, keyframes, effects and
compositions a human would create.
25. AI ACTION APPROVAL MODEL
Action Default UX
Tiny edit Immediate when auto-apply enabled
Small multi-step Apply + compact change chip + Undo
Large edit Plan/preview before applying
Replacement/destructive Explicit confirmation unless permission granted
Expensive generation Show estimated cost/compute before execution
Complex build Checkpoint by scene/phase
26. AI CHANGE HISTORY
• One AI request = one meaningful history group even if it contains many commands.
• Example: “AI — Cinematic Intro” → 67 commands.
• Undo can remove the whole operation; Advanced view can inspect individual commands.
• Revisions should be delta edits: inspect only the affected scene/object/property when possible.
27. COMPONENT / TEMPLATE UX
• Save as Component: keeps internal editable structure and exposes selected parameters.
• Save as Template: reusable composition with placeholders.
• Fork: independent variation.
• Update from Original: optional linked-instance update.
• Detach: independent instance.
• Master controls: title, colors, logo, duration, image, data and animation parameters.
28. ASSET METADATA
Field Examples
Type image / video / audio / SVG / 3D / template / component
Source user / stock / generated / recorded / imported
Tags documentary, map, India, cinematic
Dimensions/duration 1920×1080 / 00:00:12.4
Usage recent, favorite, scene references, project usage
Editability flattened / editable / procedural / component
AI metadata prompt, model, references, version
Rights license/source metadata where applicable
29. RESPONSIVE BROWSER BEHAVIOR
Viewport Behavior
>1440 px Full library + canvas + inspector + timeline


---

## Page 9

AI-Native Video Editor — Complete UX/UI/Layout Schema Page 9
Viewport Behavior
1024–1440 px Library can collapse to icon rail; inspector docked
768–1024 px Library/inspector become drawers; canvas prioritized
<768 px Use review/light-edit mode rather than forcing full professional density
30. VISUAL DESIGN TOKENS
Token Decision
Hierarchy Canvas is visual center; panels secondary
Density Compact but breathable; avoid legacy-editor clutter
Corners Moderate radius for cards/panels; crisp selection outlines
Typography Clear sans-serif; consistent numeric formatting
Icons One consistent icon family + tooltips
Selection One unmistakable selection language across canvas/timeline
Motion Short UI transitions; never delay work
Empty states Explain next step + one primary action
Errors What failed + why + fix/retry
31. REQUIRED UI STATES
Component States
Button default, hover, pressed, focused, disabled, loading
Asset card default, hover, selected, dragging, unavailable, generating
Layer normal, selected, locked, hidden, solo, muted, warning
Canvas object normal, selected, multi-selected, locked, masked, cropped, editing
Timeline clip normal, selected, trim-left, trim-right, dragging, disabled
AI action thinking, planning, approval, executing, success, partial, failed
Render queued, preview, rendering, complete, warning, failed
32. QA / ERROR UX
• Missing media → badge + Relink.
• Missing font → substitute preview + replace action.
• Text overflow → warning + Auto-fit.
• Out-of-frame object → warning + Reveal/Fit.
• Unsupported effect → explicit fallback indicator.
• Render failure → exact scene/layer + retry from checkpoint.
• Performance issue → proxy/preview-quality suggestion.


---

## Page 10

AI-Native Video Editor — Complete UX/UI/Layout Schema Page 10
33. DEVELOPER IMPLEMENTATION CONTRACT
UI surface Must map to
Button Command ID
Keyboard shortcut Command ID
Context-menu item Command ID
Drag/drop Command ID
AI action Plan → Command IDs
Inspector property Scene Graph property
Timeline operation Scene Graph + command transaction
Library asset Asset Registry entry
Template/component Project/Composition graph
Undo item Command transaction/history group
34. FEATURE IMPLEMENTATION TEMPLATE
For EVERY capability, define before coding:
1 DATA — stored schema
2 UI — exact entry point
3 CANVAS — direct manipulation
4 TIMELINE — temporal representation
5 INSPECTOR — editable properties
6 CONTEXT MENU — right-click actions
7 SHORTCUT — keyboard action
8 DRAG/DROP — accepted sources/targets
9 ANIMATION — keyframe/procedural behavior
10 AI — command/API behavior
11 RENDER — evaluation path
12 HISTORY — undo transaction boundary
13 QA — failure/warning states
14 VIEWS — Beginner / Creator / Advanced exposure
15 ACCESSIBILITY — keyboard/focus/labels
35. END-TO-END EXAMPLE — IMAGE OBJECT
Step Pre-decided UX
Add Drag from Media to canvas/timeline
Select Bounding box + handles
Move Drag; smart guides/snap
Scale Corner proportional; side axis; modifiers
Rotate Rotation handle + snapping
Crop Dedicated Crop mode
Mask Inspector → Mask + canvas handles
Animate Animate button or animation library
Effects Effect library / inspector stack
Replace Explicit Replace Media
Group/lock Ctrl/Cmd+G and lock
Reuse Save Component/Template
AI Same editable structure via Command Bus
Undo One logical action / one named AI operation
36. END-TO-END EXAMPLE — TEXT
Step UX
Insert Text preset or T; click canvas
Edit Double-click and type
Basic style Font, size, bold, italic, underline, color, align
Layout Box size, wrapping, line/letter spacing
Animate Preset library or Animate button
Advanced Per-character, path, variable font, 3D, expressions
Reuse Save Component/Template
AI Modify editable text/layers; never flatten by default


---

## Page 11

AI-Native Video Editor — Complete UX/UI/Layout Schema Page 11
37. END-TO-END EXAMPLE — SCENE
Step UX
Create + New Scene → Blank / Template / Duplicate / Selection / AI
Add assets Drag to canvas/timeline
Arrange Direct canvas + timeline
Animate Presets first; custom keyframes deeper
Transition Drag onto cut
Review Play + markers/comments
AI revision Select scene → AI edits only that scope
Reuse Save scene as template/component
Render Scene preview or full export
38. FINAL MASTER UI ARCHITECTURE
TOP BAR
■
■■■■■■■■■■■■■■■■■■■■■■■■■
PROJECT SHARE/EXPORT
■
■■■■■■■■■■■■■■■■■■■■■■
■ ■
LEFT LIBRARIES CENTER STAGE
■ ■
Media CANVAS / STAGE
Templates Selection
Text Transform
Shapes Crop / Mask
Graphics Guides / Snap
Stickers ■
Frames Context Toolbar
Audio ■
Effects ■■■■■■■■■■■■
Transitions TIMELINE INSPECTOR
Animations ■ ■
Components ■■■■■■■■■■■
■
COMMAND BUS
■
EDITOR CORE
Scene Graph / Animation / Compositor / Effects /
Audio / Tracking / 2D / 3D / Simulation / Render
■
GPU
■
OUTPUT
AI → Intent → Plan → Validate → Command Bus → same Editor Core
39. NON-NEGOTIABLE UX RULES
• Never build separate engines for Beginner/Creator/Advanced.
• Never flatten editable objects just to simplify UI.
• Never create a separate AI editing pathway.
• Do not put every feature into the main toolbar; use context + progressive disclosure.
• Basic move/scale/rotate/crop must work directly on canvas.
• Right-click must be useful but never the only access route.
• Keyboard shortcuts are accelerators, not prerequisites.
• Every feature must have defined interaction states.
• Expensive AI/generation actions need clear state and cost/permission behavior.
• Every multi-step operation must have a sensible undo boundary.
• Every feature follows DATA + UI + CANVAS + TIMELINE + INSPECTOR + MENU + SHORTCUT + AI + RENDER + HISTORY + QA.
40. DEVELOPMENT ORDER
Phase Build
1 Design system + layout shell + view switching + command palette
2 Canvas selection/manipulation + snapping + handles


---

## Page 12

AI-Native Video Editor — Complete UX/UI/Layout Schema Page 12
Phase Build
3 Scene Graph + timeline + scenes + playback
4 Libraries + drag/drop + asset registry
5 Inspector + text/shape/media panels
6 Keyframes + animation/effects/transitions libraries
7 Groups + masks + compositing + advanced interactions
8 History/undo + templates/components
9 AI Command API + validation + change preview
10 3D/tracking/procedural/shader workflows
11 Performance + browser rendering + export
12 Accessibility + QA + collaboration + polish
41. FINAL ACCEPTANCE TEST
• Create project → scenes → drag assets → arrange on canvas/timeline.
• Select any object → move, scale, rotate, crop, mask, group, lock.
• Style text directly on canvas with common typography controls.
• Apply animation/effects/transitions from visual libraries.
• Use deeper controls only when needed.
• Use keyboard shortcuts without losing mouse discoverability.
• Right-click major objects/clips and receive relevant actions.
• Switch Beginner/Creator/Advanced without changing project data.
• Ask AI for a change and receive the same editable structures a human would create.
• Undo an AI operation as one meaningful history step.
• Save complex creations as reusable components/templates.
• Preview and final render share the same scene evaluation logic.
42. MASTER DESIGN DECISION
The product should feel like Canva on the surface, CapCut/Clipchamp in the media workflow, After Effects in animation depth,
Fusion in compositing concepts, and Blender in 3D/procedural capability — while remaining one unified browser-native
editor.
This document is the UI/UX wiring layer that sits on top of the previously defined 44-system editor feature architecture. It exists specifically so
developers can implement capabilities without repeatedly inventing layout, interaction or discoverability patterns.
Golden rule: If a user can perform an operation manually, AI can perform that same operation through the same Command
Bus and Scene Graph — and the result stays manually editable.
