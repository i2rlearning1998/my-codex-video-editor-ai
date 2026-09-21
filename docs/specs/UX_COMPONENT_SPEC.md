# Master UX/UI Component Specification

> Source: owner-supplied PDF, converted to Markdown by text extraction (11 pages). Table layout is approximate; wording is exact.
> Role: HOW components and interactions should behave, component IDs, keyboard model, phased coding order (engine-first).
> Precedence: this is *reference*. On conflict, `AGENTS.md`, the current brief, `docs/FEATURES.md` and `docs/DECISIONS.md` win. See AGENTS.md section 1.


---

## Page 1

AI-Native Video Editor — MASTER UX/UI COMPONENT SPECIFICATION Page 1
AI-NATIVE VIDEO EDITOR
MASTER UX/UI COMPONENT
SPECIFICATION
Component-level interaction contract for a browser-first, AI-native professional video and
motion-graphics editor.
Purpose: eliminate UX ambiguity before coding. Developers should implement the defined interaction contract rather than
inventing behavior component-by-component.
Layer Contract
Visual Placement, hierarchy, states, sizing and responsive behavior.
Interaction Mouse, keyboard, modifiers, drag/drop, double-click and context menus.
State Idle, hover, focus, selected, multi-selected, locked, editing, loading and error.
Data Scene Graph, Asset Registry and canonical project state.
Commands Every mutation maps to a semantic Command ID.
AI AI uses the same commands and history system as human editing.
QA Objective acceptance criteria for implementation and testing.
Master principle: one editor engine + one Scene Graph + one Command Bus. Beginner, Creator and Advanced are
progressive views of the same editor.


---

## Page 2

AI-Native Video Editor — MASTER UX/UI COMPONENT SPECIFICATION Page 2
1. MASTER UX CONTRACT
•
Direct manipulation first: select, move, resize, rotate, crop and animate directly on canvas whenever practical.
•
Visual discovery: libraries use searchable visual cards, hover previews and drag/drop.
•
Progressive disclosure: Beginner = simple; Creator = professional; Advanced = deep technical controls.
•
Non-destructive by default: source media and editable structure are preserved.
•
AI parity: AI edits the same graph humans edit; there is no hidden parallel editor.
•
Predictable modifiers: Shift constrains; Alt/Option centers; platform modifiers map to common semantic commands.
•
Everything reversible: Undo/Redo is mandatory for user and AI operations.
1.1 Universal component contract
Layer Rule Implementation
Visual Every control has clear affordance and state. No dead/ambiguous buttons.
Interaction Equivalent actions behave consistently
everywhere.
Shared interaction resolver.
Command UI mutation goes through Command Bus. No direct canonical-state mutation.
State Canonical editor state drives UI state. Avoid duplicate sources of truth.
History Gestures and AI operations have deliberate
boundaries.
Transaction/group based.
Accessibility Critical actions have keyboard/menu alternatives. Focusable + labeled.
2. MASTER APPLICATION SHELL
Desktop: Top Bar → Left Library/Assets → Center Canvas → Right Inspector → Bottom Timeline. Canvas receives the largest
flexible region.
Component ID Purpose Responsive rule
shell.topbar Project, undo/redo, search, AI, share, export. Fixed; never scrolls with canvas.
shell.library Media and creative libraries. Docked left; drawer at medium widths.
shell.canvas Primary composition workspace. Maximum flexible area.
shell.inspector Contextual properties. Docked right; drawer at smaller widths.
shell.timeline Scenes, tracks, clips, keyframes. Resizable; can minimize.
shell.commandPalette Global search/actions. Floating; focus trapped while open.
2.1 Top bar
ID Action Command
top.project Click → inline rename; Enter commit; Esc cancel. RENAME_PROJECT
top.undo / redo Click or keyboard shortcut. UNDO / REDO
top.search Global command/search. OPEN_COMMAND_PALETTE
top.ai Open AI panel. OPEN_AI_PANEL
top.share Open sharing/collaboration. OPEN_SHARE
top.export Open export configuration. OPEN_EXPORT
top.account Open project/account settings. OPEN_ACCOUNT
3. CANVAS COMPONENT SYSTEM
3.1 Root interaction
Component Input Exact result
canvas.root Left-click empty Deselect.


---

## Page 3

AI-Native Video Editor — MASTER UX/UI COMPONENT SPECIFICATION Page 3
Component Input Exact result
canvas.root Drag empty Selection marquee.
canvas.root Wheel Zoom around pointer.
canvas.pan Space + drag Pan canvas.
canvas.zoom Ctrl/Cmd +/- Zoom.
canvas.guides Grid/guides/snap State visibly indicated.
canvas.dropzone Drag asset onto canvas Create/replace by target context.
3.2 Selection box / handles
Selection box = 8 resize handles (TL, TC, TR, ML, MR, BL, BC, BR) + rotation handle. Optional anchor/pivot appears in
Transform/Advanced mode. Multi-selection uses one outer box plus subtle individual outlines.
Input Default Modifier
Click object Select. Shift-click adds/removes.
Drag object Move. Shift constrains axis; snapping active.
Corner handle Proportional X/Y scale. Shift toggles free/proportional; Alt/Option from
center.
Side handle Single-axis scale. Alt/Option from center.
Rotation handle Free rotation. Shift snaps angle.
Double-click Edit mode. Text → inline edit; group → isolation.
Arrow Nudge. Shift + Arrow = larger nudge.
Delete/Backspace Delete. Confirm only when configured destructive.
Esc Cancel/exit/deselect. Context-sensitive.
3.3 Canvas states
State Visual Allowed
Idle No selection chrome. Select/marquee/pan/zoom.
Hover Subtle outline. Click select.
Selected Bounding box + handles. Transform/edit/context.
Multi-selected Outer box + outlines. Transform/group/align/distribute.
Editing Inline editor/caret. Content editing.
Locked Lock indicator. No normal transform/delete.
Crop Crop boundary/handles. Adjust; Enter commit; Esc cancel.
Loading Progress/skeleton. Unrelated editing remains usable.
Error Localized recovery. Retry/replace/inspect; state preserved.
4. CONTEXT MENUS & CONTEXT TOOLBAR
Target Primary context actions
Empty canvas Paste, Select All, Deselect, Grid, Guides, Snap, Canvas Settings.
Image/Video Cut, Copy, Duplicate, Lock, Hide, Group, Arrange, Replace, Crop, Mask, Extract Frame,
Detach Audio.
Text Cut, Copy, Duplicate, Edit, Style, Animate, Convert to Shape, Component, Lock.
Shape/Graphic Duplicate, Edit Shape, Boolean, Group, Arrange, Convert, Animate, Component.
Group Enter, Ungroup, Duplicate, Lock, Isolate, Component.
Multiple Group, Align, Distribute, Lock, Hide, Duplicate, Combine, Component.


---

## Page 4

AI-Native Video Editor — MASTER UX/UI COMPONENT SPECIFICATION Page 4
Target Primary context actions
Timeline clip Cut, Split, Ripple, Replace, Speed, Reverse, Freeze, Detach Audio, Compound Clip.
4.1 Context toolbar
Selection Visible controls Advanced
None Select, Pan, Zoom, Grid, Guides, Snap. Canvas settings.
Image/Video Position, Scale, Rotate, Crop, Flip, Opacity, Blend, Animate,
Replace.
Anchor, constraints, color/shader.
Text Font, Size, Weight, Color, Align, Spacing, Effects, Animate. Variable fonts, per-character, path,
3D, expressions.
Shape Fill, Stroke, Width, Corners, Boolean, Align, Animate. Parametric geometry, paths,
expressions.
Group/Multiple Move, Scale, Rotate, Align, Distribute, Group, Ungroup, Lock. Hierarchy, parenting, constraints.
Audio Volume, Fade, Speed, Noise Reduction, Ducking, Effects. Routing, automation, DSP.
5. LIBRARY / ASSET BROWSER
Categories: Media | Templates | Text | Shapes | Graphics | Stickers | Frames | Audio | Transitions | Effects | Animations |
Components
Visual layout: Search → category tabs → filter chips → sort → virtualized card grid → preview/details drawer.
ID Behavior Acceptance
library.search Search current library/category. Results update predictably.
library.category Switch category. Context remains predictable.
library.filters Filter by type/style/duration/etc. Active filters visible/removable.
library.card Hover preview; click select; drag insert. Drop target determines operation.
library.preview Inspect/play without applying. No project mutation.
library.details Metadata, variants, parameters, Apply/Insert. Action remains available.
5.1 Drag/drop routing
Drop target Result Command
Empty canvas Create at drop position. CREATE_LAYER + ADD_ASSET
Existing media Replace source; preserve compatible properties. REPLACE_ASSET
Timeline Insert at playhead/target track. INSERT_CLIP
Scene tab Add/move asset to scene. ADD_ASSET_TO_SCENE
Effect slot Apply effect. ADD_EFFECT
Transition boundary Apply transition. CREATE_TRANSITION
Animation slot Apply animation preset. APPLY_ANIMATION
Component input Replace component input. SET_COMPONENT_INPUT
6. INSPECTOR SYSTEM
Inspector: Quick Properties → Transform → Appearance → Animation → Effects → Masks → Advanced. Show roughly 5–8
high-frequency controls initially; deeper controls use disclosure. Users may pin favorites.
Section Normal controls Advanced
Quick Context-specific common actions. Pin/unpin properties.
Transform X/Y, W/H, rotation, opacity. Anchor, constraints, parent, expressions.
Appearance Fill, stroke, blend, shadow. Color pipeline, shader parameters.


---

## Page 5

AI-Native Video Editor — MASTER UX/UI COMPONENT SPECIFICATION Page 5
Section Normal controls Advanced
Animation Preset, duration, easing. Keyframes, graph editor, custom curves.
Effects Add/remove/reorder/bypass. Per-effect parameters, masks, expressions.
Masks Create/edit, feather, opacity. Track matte, animated paths, boolean logic.
Advanced Technical properties. Full graph/state exposure.
7. TEXT COMPONENT SYSTEM
Surface Controls Behavior
Canvas inline Content, caret, selection, formatting. Double-click enters text edit.
Quick toolbar Font, size, bold, italic, underline, color, align. Immediate property updates.
Inspector Spacing, wrapping, layout, style, animation. Disclosure sections.
Timeline Text clip, animation/keyframes. Trim, move, animate.
Context menu Edit, style, animate, convert, component. Same Command IDs as other surfaces.
•
Spacing: letter spacing, line height, paragraph spacing, padding.
•
Layout: auto/fixed size, wrapping, RTL and vertical alignment.
•
Style: fill, stroke, shadow, background, opacity and blend.
•
Animation: entrance/emphasis/exit; character/word/line targeting.
•
Advanced: text-on-path, variable fonts, per-character transforms, 3D and expressions.
8. TIMELINE COMPONENT SYSTEM
Scene strip: [Intro] [Scene 01] [Scene 02] [Scene 03] [Outro] [+ New Scene]
Transport: Previous/Step | Play/Pause | Timecode | Loop | Preview Quality
Component Exact contract
timeline.sceneStrip Click activates; drag reorders; double-click renames; + creates.
timeline.transport Previous/step, play/pause, timecode, loop, preview quality.
timeline.ruler Timecode, snap, markers, playhead.
timeline.trackHeader Lock, hide, solo, mute, color, label, expand/collapse.
timeline.clip Select, move, trim, split, ripple, speed, replace.
timeline.keyframe Creator/Advanced diamonds; Beginner can show animation badge.
timeline.search Search clips/tracks/markers.
timeline.resize Drag top boundary; persist user preference.
8.1 Timeline inputs
Input Result
Click clip Select clip.
Drag clip body Move in time/track.
Drag trim edge Trim start/end.
S Split at playhead.
Right-click Clip context menu.
Double-click Open clip/nested content where applicable.
Drag transition Adjust duration.
Drag keyframe Move keyframe in time/value context.
9. SCENE SYSTEM


---

## Page 6

AI-Native Video Editor — MASTER UX/UI COMPONENT SPECIFICATION Page 6
Action Behavior Command
+ New Scene Blank / Template / Duplicate / From Selection / AI Plan. CREATE_COMPOSITION
Activate Scene becomes editing context. SET_ACTIVE_COMPOSITION
Rename Inline rename; Enter commit; Esc cancel. RENAME_COMPOSITION
Reorder Drag scene tab. REORDER_COMPOSITION
Duplicate Independent editable copy. DUPLICATE_COMPOSITION
Nest Double-click opens with breadcrumb. NEST_COMPOSITION
Delete Dependency check then delete. DELETE_COMPOSITION
AI Plan Preview structure before large apply. AI_PLAN_COMPOSITION
10. ANIMATION COMPONENT SYSTEM
Component Beginner Creator Advanced
Animation picker Preset cards. Preset + duration/easing. Custom curves/property
targeting.
Keyframes Simple animation toggle. Add/delete/move. Graph editor/interpolation/expr
essions.
Motion path Drag path. Edit points. Constraints/tangents/procedur
al paths.
Easing Preset chips. Bezier/easing. Custom curve/expression.
Preview Hover/play preview. Apply preview. Inspect generated keyframes.
11. EFFECTS / TRANSITIONS
System UI Behavior
Effects Visual cards + search/filter. Drag to object/track; inspector opens
parameters.
Transitions Visual cards. Drop on clip boundary; duration editable.
Animations Visual preset cards. Drop to object; deterministic keyframes.
Effect stack Ordered inspector list. Reorder, bypass, duplicate, remove, reset.
12. GROUP / HIERARCHY / LOCK
Action Contract
Group Ctrl/Cmd+G; editable GROUP node; children remain addressable.
Ungroup Shift+Ctrl/Cmd+G; preserve child world transforms.
Isolation Double-click/Enter; breadcrumb shows hierarchy.
Lock Ctrl/Cmd+Shift+L; locked nodes unavailable to normal editing.
Hide Visibility off; node remains in graph/render state.
Parent Advanced by default; child transform becomes local to parent.
Multi-select Shift-click toggles membership; marquee follows configured selection mode.
13. KEYBOARD CONTRACT
Shortcut Action Command ID
Space Play/Pause TOGGLE_PLAYBACK
Ctrl/Cmd+Z Undo UNDO
Shift+Ctrl/Cmd+Z Redo REDO


---

## Page 7

AI-Native Video Editor — MASTER UX/UI COMPONENT SPECIFICATION Page 7
Shortcut Action Command ID
Ctrl/Cmd+C / V Copy / Paste COPY / PASTE
Ctrl/Cmd+D Duplicate DUPLICATE
Delete / Backspace Delete DELETE
Ctrl/Cmd+A Select All SELECT_ALL
Ctrl/Cmd+G Group GROUP
Shift+Ctrl/Cmd+G Ungroup UNGROUP
Ctrl/Cmd+Shift+L Lock LOCK
Ctrl/Cmd +/- Zoom ZOOM
Space + drag Pan PAN_CANVAS
F Frame selection FRAME_SELECTION
S Split SPLIT_CLIP
M Marker ADD_MARKER
K Add keyframe ADD_KEYFRAME
Ctrl/Cmd+K Command palette OPEN_COMMAND_PALETTE
Esc Cancel/exit/deselect CANCEL_OR_EXIT
All shortcuts must be remappable. Platform-specific modifiers resolve to the same semantic command.
14. AI-NATIVE UI CONTRACT
Component Behavior
ai.input Natural language; understands current selection, scene and project context.
ai.context Shows objects/assets/style/profile/settings being used.
ai.plan Large operations show structured plan before execution.
ai.preview Shows proposed change/result before commit where feasible.
ai.apply Commits a Command Bus transaction.
ai.undo Reverts AI change group as one meaningful history item.
ai.cost Shows estimated compute/credits for expensive generation.
ai.history Shows prior AI actions and inspect/revert controls.
14.1 AI approval levels
Action Default UI
Tiny Auto-apply. Small change chip + Undo.
Small multi-step Apply with change chip. Grouped history item.
Large build Preview/plan first. Plan → Preview → Apply.
Destructive/replacement Explicit confirmation. Affected assets + before/after.
Expensive generation Budget confirmation. Estimated cost + expected output.
AI path: Intent → Plan → Task Graph → Capability/permission/cost validation → Command Bus → Scene Graph →
Canvas/Timeline/Inspector → History.
15. COMPONENT → DATA → COMMAND → HISTORY
UI Canonical data Commands History
Canvas transform Layer.transform MOVE_LAYER / SET_PROPERTY One gesture
Inspector property Property.value SET_PROPERTY One committed edit


---

## Page 8

AI-Native Video Editor — MASTER UX/UI COMPONENT SPECIFICATION Page 8
UI Canonical data Commands History
Timeline trim Layer start/duration TRIM_CLIP One trim gesture
Effect stack EffectInstance[] ADD/REMOVE/REORDER_EFFECT One operation
Library insert Asset + Layer ADD_ASSET / CREATE_LAYER One insertion
Animation preset Keyframes + metadata APPLY_ANIMATION One application
AI build Multiple graph nodes Grouped transaction One meaningful AI
change
Template apply Composition graph APPLY_TEMPLATE One application
16. RESPONSIVE BEHAVIOR
Viewport Mode Rule
>1440 px Full professional Library + Canvas + Inspector + Timeline.
1024–1440 Compact desktop Library collapsible; inspector docked if space.
768–1024 Drawer mode Library/Inspector drawers; canvas priority.
<768 Review/light edit Focused panels; simplified timeline; no forced pro density.
Same data and command semantics at every viewport; only presentation changes.
17. ACCESSIBILITY
•
Icon-only controls require accessible names and tooltips.
•
Keyboard navigation has visible focus.
•
Every critical action has a keyboard/menu equivalent.
•
Color is never the sole state indicator.
•
Transform and timeline functions have precision keyboard alternatives.
•
Reduced-motion preference disables non-essential UI animation.
•
Context menus are keyboard reachable.
18. LOADING / ERROR / RECOVERY
State Required UI Rule
Loading asset Skeleton/progress + safe cancel. Do not freeze unrelated editing.
AI generation Progress + stage + cost estimate. Cancel when provider permits.
Missing media Placeholder + relink/replace. Never silently substitute source footage.
Render failure Summary + retry + diagnostic. Preserve project state.
Unsupported feature Reason + compatible fallback. No dead controls.
Network issue Indicator + retry/queue. Local editing where architecture permits.
19. MANDATORY FEATURE SPECIFICATION TEMPLATE
# Before implementation, define
1 DATA — Scene Graph / Asset Registry schema
2 UI — exact placement and states
3 CANVAS — direct manipulation
4 TIMELINE — clips/tracks/keyframes
5 INSPECTOR — controls and disclosure
6 CONTEXT MENU — actions
7 SHORTCUT — keyboard mapping


---

## Page 9

AI-Native Video Editor — MASTER UX/UI COMPONENT SPECIFICATION Page 9
# Before implementation, define
8 DRAG/DROP — source → target routing
9 ANIMATION — keyframe/preview semantics
10 AI — intent, commands, permissions, preview
11 RENDER — preview/final semantics
12 HISTORY — undo/redo boundary
13 QA — acceptance tests
14 MODES — Beginner / Creator / Advanced
15 ACCESSIBILITY — focus/keyboard/labels
20. MASTER COMPONENT CATALOG
Component ID Purpose
shell.topbar Application navigation
shell.library Asset/library dock
shell.canvas Composition canvas
shell.inspector Contextual inspector
shell.timeline Timeline dock
shell.commandPalette Global search/actions
canvas.root Canvas interaction surface
canvas.selection Selection model
canvas.boundingBox Transform box
canvas.handles Scale/rotate handles
canvas.crop Crop mode
canvas.guides Guides/grid/snap
canvas.contextToolbar Selection toolbar
contextMenu.root Context menu
library.search Library search
library.category Category tabs
library.filters Filters
library.card Asset card
library.preview Preview
library.details Details panel
inspector.quick Quick properties
inspector.transform Transform
inspector.appearance Appearance
inspector.animation Animation
inspector.effects Effects
inspector.masks Masks
inspector.advanced Advanced
timeline.sceneStrip Scene tabs
timeline.transport Playback controls
timeline.ruler Time ruler


---

## Page 10

AI-Native Video Editor — MASTER UX/UI COMPONENT SPECIFICATION Page 10
Component ID Purpose
timeline.playhead Playhead
timeline.trackHeader Track controls
timeline.clip Clip
timeline.keyframe Keyframe
timeline.marker Marker
timeline.search Timeline search
ai.panel AI assistant
ai.context AI context
ai.plan AI plan
ai.preview AI preview
ai.cost Cost/compute
ai.history AI history
export.dialog Export
notification.chip Transient status/change
modal.confirm Confirmation
toast.undo Undoable transient action
21. DEVELOPER IMPLEMENTATION CONTRACT
Event → Interaction Resolver → Command Builder → Command Bus → Validation/Transaction → Scene Graph/Asset
Registry → Derived UI State → Preview/Final Renderer → History/Persistence.
Rule Requirement
No hidden mutation UI framework state is not canonical editor state.
Single source of truth Scene Graph is canonical composition state.
Semantic commands Use CREATE_LAYER, SET_PROPERTY, ADD_EFFECT, etc.
Transactions Compound operations commit atomically when appropriate.
Validation Schema, permission, dependency, capability and cost checks.
Persistence Serializable, versioned, migratable project state.
Renderer parity Preview and final use the same semantic evaluation path.
22. COMPONENT-LEVEL ACCEPTANCE TESTS
•
Selection: select, multi-select, transform and deselect without ambiguous hit behavior.
•
Transform: corner/side/rotation handles obey defined Shift and Alt/Option behavior.
•
Context: right-click actions match object type and hide invalid operations.
•
Library: every draggable asset has deterministic canvas/timeline/slot routing.
•
Inspector: inspector edits and canvas edits update the same Scene Graph properties.
•
Timeline: move/trim/split/keyframe changes synchronize with canvas immediately.
•
History: each gesture and AI operation has intentional undo boundaries.
•
AI parity: AI-created/editable structures remain manually editable.
•
Responsive: reflow does not change command semantics.
•
Recovery: failed imports/renders/generation never corrupt editable project state.
•
Performance: expensive work is asynchronous; UI remains responsive.
23. CODING START ORDER


---

## Page 11

AI-Native Video Editor — MASTER UX/UI COMPONENT SPECIFICATION Page 11
Phase Build Exit condition
0 Repo, TypeScript contracts, schema/versioning, CI. Contracts compile; baseline tests pass.
1 Scene Graph + Command Bus + History. Core mutations are command-driven/reversible.
2 Canvas + selection + bounding box + inspector. Direct manipulation works.
3 Timeline + scenes + transport. Canvas/timeline/scene state synchronized.
4 Text + shapes + media + keyframes. Core creative primitives work.
5 Libraries + templates + components. Visual asset workflow works.
6 Effects + transitions + masks + audio. Professional 2D baseline.
7 WebGPU preview/render + export. Preview/final pipeline works.
8 AI Command API + safe execution. AI edits via same graph/commands.
9+ Tracking, particles, 3D, expressions, procedural systems, generation
orchestration.
All extend same component contract.
24. NON-NEGOTIABLE UX RULES
•
Never build separate Beginner/Pro editors; build one editor with progressive disclosure.
•
Never flatten AI work when an editable graph is possible.
•
Never make users hunt through technical panels for common actions.
•
Never implement equivalent actions differently across UI surfaces.
•
Never hide direct manipulation behind dialogs when canvas interaction can do it.
•
Never perform expensive generation without understandable cost/permission behavior.
•
Never replace user source footage unless explicitly allowed.
•
Never sacrifice editability for AI convenience.
•
Never let feature teams invent independent interaction patterns.
•
Every new capability extends Component → Command → Scene Graph → Render → History.
25. FINAL MASTER BLUEPRINT
USER → SIMPLE SURFACE (Canva-like canvas + visual libraries + approachable timeline) → PROGRESSIVE DISCLOSURE
(Beginner → Creator → Advanced) → INTERACTION LAYER (Mouse + Keyboard + Drag/Drop + Context Menus + Inspector
+ Timeline + AI) → COMMAND BUS → SCENE GRAPH (Layers + Properties + Keyframes + Effects + Masks + Groups +
Assets + Scenes) → EVALUATION/RENDER (WebGPU + Workers + optimized preview/final backends) → OUTPUT
Final decision: this specification is the UX contract. The Scene Graph is the source of truth. The Command Bus is the mutation
boundary. Canvas, Timeline, Inspector, Libraries and AI are coordinated views into one editor.
