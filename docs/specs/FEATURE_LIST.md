# Master Core Feature List (44 systems, 6 tiers)

> Source: owner-supplied PDF, converted to Markdown by text extraction (6 pages). Table layout is approximate; wording is exact.
> Role: WHAT the full product contains. Vision and reference. docs/FEATURES.md is the actionable scope.
> Precedence: this is *reference*. On conflict, `AGENTS.md`, the current brief, `docs/FEATURES.md` and `docs/DECISIONS.md` win. See AGENTS.md section 1.


---

## Page 1

AI-Native Video Editor — Master Core Feature List Page 1
AI-NATIVE VIDEO EDITOR — MASTER CORE FEATURE LIST
Developer handoff reference • 44 core systems • table format • Designed around one powerful editor engine with Beginner / Creator / Advanced views.
# Core System Priority Tier Feature Group Features / Capabilities
1 Project & Composition
Engine
Tier 1 — Foundation Project system Projects • Multiple compositions • Nested compositions • Pre-compositions • Sequences • Scenes • Sub-scenes •
Master composition • Multiple timelines • Project versions • Autosave • Crash recovery • Project snapshots • Project
duplication • Project branching • Project templates
Tier 1 — Foundation Composition settings Resolution • Width / height • FPS • Duration • Pixel aspect ratio • Color space • HDR • Bit depth • Background • Audio
sample rate • Audio channels • Working color space
2 Powerful Timeline Engine Tier 1 — Foundation Basic Unlimited video tracks • Unlimited audio tracks • Unlimited layers • Track locking • Track hiding • Solo • Mute •
Enable/disable • Track grouping • Track colors • Track labels
Tier 1 — Foundation Editing Cut • Split • Trim • Ripple trim • Roll edit • Slip edit • Slide edit • Extend edit • Replace edit • Lift • Extract • Duplicate
• Move • Snap • Magnetic snapping • Timeline markers
Tier 1 — Foundation Advanced Nested timelines • Compound clips • Multicam • Adjustment layers • Track mattes • Blend modes • Track parenting •
Layer dependencies • Time remapping • Freeze frame • Reverse • Variable speed
3 Scene Graph / Layer
System
Tier 1 — Foundation Layer model Position • Rotation • Scale • Anchor point • Opacity • Visibility • Blend mode • Parent / child relationships • Masks •
Effects • Keyframes • Expressions • Metadata
Tier 1 — Foundation Structure Composition nodes • Background • Video • Text • Shape groups • Camera • Light • Nested compositions • Arbitrary
editable layer hierarchy
4 Transform & Motion
Engine
Tier 1 — Foundation 2D transforms Position • X/Y independent control • Rotation • Scale • Skew • Anchor point • Opacity • Orientation
Tier 1 — Foundation Motion paths Bezier paths • Pen tool • Freehand paths • Motion paths • Path animation • Follow path • Orient along path • Path
offset • Path morphing
Tier 1 — Foundation Motion behaviour Ease in • Ease out • Custom Bezier • Spring • Bounce • Elastic • Inertia • Overshoot • Noise • Wiggle • Procedural
motion
5 Keyframe & Animation
Engine
Tier 1 — Foundation Keyframes Property keyframes • Transform keyframes • Effect keyframes • Mask keyframes • Camera keyframes • Audio
automation • Color keyframes
Tier 1 — Foundation Interpolation Linear • Bezier • Hold • Ease • Custom curves • Spring • Physics-based • Procedural
Tier 1 — Foundation Graph editor Value Graph • Speed Graph • Bezier Handles • Velocity • Acceleration
Tier 1 — Foundation Advanced Keyframe grouping • Keyframe copy/paste • Time stretch • Time reverse • Keyframe scaling • Keyframe looping •
Cycle • Ping-pong • Expression-driven animation
6 Shape & Vector Graphics
Engine
Tier 2 — Professional
2D
Primitive/vector
support
Rectangle • Rounded rectangle • Circle • Ellipse • Polygon • Star • Line • Bezier path • Freehand path • Custom SVG •
Boolean operations
Tier 2 — Professional
2D
Shape operations Merge • Add • Subtract • Intersect • Exclude • Offset paths • Trim paths • Repeater • Morph • Path deformation
Tier 2 — Professional
2D
Stroke Width • Dash • Gap • Cap • Join • Gradient stroke • Animated stroke
7 Text / Typography Engine Tier 2 — Professional
2D
Text Rich text • Multiple fonts • Font families • Font weights • Letter spacing • Line spacing • Paragraph alignment • Text
boxes • Auto sizing • Text wrapping • RTL • Multilingual


---

## Page 2

AI-Native Video Editor — Master Core Feature List Page 2
# Core System Priority Tier Feature Group Features / Capabilities
Tier 2 — Professional
2D
Text animation Character animation • Word animation • Line animation • Letter spacing animation • Position • Rotation • Scale •
Opacity • Blur • Masking
Tier 2 — Professional
2D
Advanced text Text along path • Text on curve • Text morphing • Kinetic typography • 3D text • Variable fonts • Per-character styling
8 Masking & Matte Engine Tier 2 — Professional
2D
Masks Bezier mask • Freehand mask • Shape mask • Feather • Expansion • Opacity • Invert • Animated masks
Tier 2 — Professional
2D
Mattes Alpha matte • Luma matte • Track matte • Inverted matte • Dynamic matte
Tier 2 — Professional
2D
Advanced Mask tracking • Object-based masking • Rotoscoping • Edge refinement • Motion-aware masks
9 Compositing Engine Tier 2 — Professional
2D
Blend modes Normal • Multiply • Screen • Overlay • Soft light • Hard light • Add • Difference • Darken • Lighten • Additional blend
modes
Tier 2 — Professional
2D
Compositing Alpha compositing • Premultiplication • Transparency • Layer ordering • Depth ordering • Matte compositing •
Adjustment layers • Nested compositing
Tier 2 — Professional
2D
Advanced Deep compositing architecture • Multi-pass rendering • Render-to-texture • GPU/offscreen buffers • Intermediate
surfaces
10 Effects Engine Tier 2 — Professional
2D
Color Exposure • Contrast • Brightness • Saturation • Temperature • Tint • Curves • Levels • HSL • Color wheels • LUT •
HDR grading
Tier 2 — Professional
2D
Blur Gaussian blur • Directional blur • Motion blur • Radial blur • Zoom blur • Lens blur
Tier 2 — Professional
2D
Stylization Glow • Bloom • Film grain • Noise • Sharpen • Vignette • Chromatic aberration • Distortion • Displacement • Pixelation
• Posterization
Tier 2 — Professional
2D
Distortion Turbulent displacement • Warp • Liquify • Mesh warp • Bulge • Wave • Ripple • Lens distortion
11 Particle & Procedural
Simulation Engine
Tier 3 — Motion
Graphics
Particles Particle emitters • Particle physics • Gravity • Wind • Turbulence • Collision • Attraction • Repulsion • Velocity • Life
cycle • Randomness • Size over lifetime • Color over lifetime
Tier 3 — Motion
Graphics
GPU/future
simulation
GPU particle simulation • Smoke-like effects • Dust • Sparks • Rain • Snow • Fire-like effects • Confetti • Energy
particles • Magical effects
12 Camera Engine Tier 5 — 3D Camera Position • Rotation • FOV • Zoom • Focus • Depth of field • Aperture • Focus distance • Camera shake
Tier 5 — 3D Animation Camera path • Dolly • Pan • Tilt • Orbit • Crane • Zoom • Rack focus
13 3D Engine Tier 5 — 3D 3D objects 3D layers • 3D models • GLTF/GLB • OBJ • FBX eventually • Materials • Textures • Lighting • Shadows
Tier 5 — 3D 3D transforms X/Y/Z position • X/Y/Z rotation • Scale • Anchor
Tier 5 — 3D Lighting Point light • Spot light • Area light • Directional light • Ambient light
Tier 5 — 3D Rendering Shadows • Reflections • Ambient occlusion • Depth • Fog • Volumetric effects
14 Motion Graphics Engine Tier 3 — Motion
Graphics
Procedural graphics Shapes • Paths • Text • Graphs • Charts • Maps • Infographics • Timelines • Diagrams • Data visualization
Tier 3 — Motion
Graphics
Procedural animation AI-generated animation functions • Path animation • Spring • Repeater • Morph • Follow path • Composable animation
primitives
Tier 3 — Motion
Graphics
Graphics scripting JavaScript / TypeScript • Expressions • Procedural nodes • Shader code • Sandboxed execution


---

## Page 3

AI-Native Video Editor — Master Core Feature List Page 3
# Core System Priority Tier Feature Group Features / Capabilities
15 Expression / Scripting
Engine
Tier 3 — Motion
Graphics
Expressions Expressions • Variables • Functions • Property references • Layer references • Time functions • Math functions •
Random/noise • Conditional logic • Safe loops • Custom procedural functions
Tier 3 — Motion
Graphics
Security Sandboxed execution • No arbitrary system access • Permission-controlled APIs • Resource/time limits
16 Tracking Engine Tier 4 — Pro Video Tracking Point tracking • Planar tracking • Object tracking • Face tracking • Motion tracking • Camera tracking
Tier 4 — Pro Video Uses Text follows subject • Graphics attach to building • Map pin follows person • Screen replacement • Face blur • Object
replacement • Motion graphics integration
17 Video Processing Engine Tier 4 — Pro Video Media Import video • Import image • Image sequences • GIF • SVG • ProRes • H.264 • H.265 • WebM • Alpha video • RAW
formats eventually
Tier 4 — Pro Video Video operations Crop • Reframe • Resize • Rotate • Stabilize • Speed • Reverse • Frame interpolation • Optical flow
Tier 4 — Pro Video Advanced pipeline Proxy generation • Background decoding • Streaming decode • Cache • Thumbnail generation • Waveform generation
• Proxy switching
18 Audio Engine Tier 4 — Pro Video Audio editing Multiple audio tracks • Trim • Split • Fade • Crossfade • Volume automation • Pan • Stereo • Mono
Tier 4 — Pro Video Audio effects EQ • Compressor • Limiter • Reverb • Delay • Noise reduction • De-esser • Distortion
Tier 4 — Pro Video Mixing Master bus • Track buses • Sends • Ducking • Sidechain • Automation
Tier 4 — Pro Video AI support Narration-aware ducking • Beat-aware editing • Voice/music/SFX alignment • Command-based audio changes
19 Transition Engine Tier 2 — Professional
2D
Basic Cut • Dissolve • Fade • Wipe • Slide • Zoom
Tier 2 — Professional
2D
Advanced Mask transition • Shape transition • Glitch • Liquid • Morph • Camera transition • 3D transition • Custom shader
transition
Tier 2 — Professional
2D
Procedural Parameter-driven transitions • AI-generated transition recipes • Sandboxed transition code
20 Time & Temporal Effect
Engine
Tier 2 — Professional
2D
Temporal controls Time remapping • Speed ramp • Freeze frame • Frame hold • Reverse • Time displacement • Echo • Frame blending •
Motion interpolation • Optical flow • Temporal blur • Ghosting • Trail effects
21 Color Management Tier 4 — Pro Video Color pipeline Rec.709 • sRGB • HDR • Log footage • Linear workflow • LUTs • Color transforms • Tone mapping • Gamma •
Exposure
Tier 4 — Pro Video Scopes Waveform • Vectorscope • Histogram • RGB parade
22 Video Quality /
Restoration Tools
Tier 4 — Pro Video Restoration Denoise • Sharpen • Deblur • Stabilization • Upscaling • Frame interpolation • Artifact reduction • Compression
cleanup • Deflicker • Rolling shutter correction
23 AI-Assisted Editing Core Tier 6 — AI-Native AI commands Edit clip timing • Create cinematic text animation • Add scene-specific graphics • Animate charts • Create camera
movement • Audio ducking • Apply effects • Build/edit compositions
Tier 6 — AI-Native Execution AI intent → plan → validated commands → Command Bus → Editor Core • AI works through editor APIs rather than direct
internal-state mutation
24 Non-Destructive Editing Tier 2 — Professional
2D
Core Original assets preserved • Source layers • Crop as non-destructive operation • Color as non-destructive operation •
Effects as non-destructive operation • Speed as non-destructive operation • Animation as non-destructive operation •
Reversible edits
25 History / Undo Engine Tier 1 — Foundation History Undo • Redo • Unlimited history • Named checkpoints • Snapshots • Branching • Version comparison • Revert • AI
change grouping
Tier 1 — Foundation AI edit grouping Group a multi-command AI edit • One-click undo of complete AI operation • Named AI actions


---

## Page 4

AI-Native Video Editor — Master Core Feature List Page 4
# Core System Priority Tier Feature Group Features / Capabilities
26 Nesting / Precomposition Tier 2 — Professional
2D
Structure Nested compositions • Precompositions • Reusable scene sections • Independent editing of nested sections • Master
composition
Tier 2 — Professional
2D
Example structures Intro • Scene 01 • Map animation • Outro • Nested graphics groups
27 Data-Driven Graphics Tier 3 — Motion
Graphics
Data inputs Structured data input • JSON/data objects • Dynamic values • Data binding
Tier 3 — Motion
Graphics
Outputs Charts • Graphs • Bars • Lines • Pie charts • Infographics • Animated numbers • Data-driven labels
28 Map / Geo Graphics
Engine
Tier 3 — Motion
Graphics
2D maps World map • Country map • State map • City map • Routes • Pins • Labels • Borders • Animated paths • Camera zoom
Tier 3 — Motion
Graphics
Advanced Geographic projections • 3D globe eventually • Map styling • Geo-referenced animation
29 Template / Component
Engine
Tier 3 — Motion
Graphics
Reusable components Save composition as component • Drag-and-drop reuse • Editable animation • Editable effects • Editable expressions •
Editable parameters
Tier 3 — Motion
Graphics
Template operations Save as template • Duplicate • Fork • Update from original • Detach • Version dependencies
30 Parametric Design
System
Tier 3 — Motion
Graphics
Parameters Duration • Direction • Distance • Ease • Spring • Intensity • Scale • Color • Speed • Other exposed controls
Tier 3 — Motion
Graphics
Architecture Hard-coded animation replaced by parameterized recipes • AI manipulates parameters • User edits parameters
without rebuilding composition
31 Shader / GPU Effect
Engine
Tier 3 — Motion
Graphics
GPU/shader Custom shaders • Fragment shaders • Vertex shaders • GPU effects • GPU particles • Procedural textures • Distortion
• Noise • Displacement • Custom transitions
Tier 3 — Motion
Graphics
Safety Sandboxed shader execution • Resource limits • Validation • Capability/permission checks
32 Render Engine Tier 6 — AI-Native Pipeline Scene Graph • Frame evaluation • Animation evaluation • Compositing • Effects • GPU rendering • Frame generation •
Encoding
Tier 6 — AI-Native Render modes Real-time preview • Draft quality • Full quality • Proxy mode • Cached frames • Parallel rendering • GPU acceleration •
Browser rendering • Cloud rendering fallback
33 Performance Engine Tier 6 — AI-Native GPU/concurrency GPU acceleration • WebGPU • Multithreading • Web Workers • Offscreen rendering
Tier 6 — AI-Native Caching/optimization Frame caching • Asset caching • Proxy media • Lazy loading • Incremental rendering • Dependency graph evaluation •
Dirty-region rendering • Memoization • Background processing
Tier 6 — AI-Native Performance goal Smooth editing of large compositions • Efficient evaluation of hundreds of layers • Avoid unnecessary re-rendering
34 Professional Import /
Export
Tier 4 — Pro Video Export formats MP4 • WebM • MOV • Image sequence • PNG sequence • JPEG sequence • GIF • Audio-only
Tier 4 — Pro Video Professional export Alpha • ProRes eventually • DNx eventually • High bit depth • HDR • Custom bitrate • Custom GOP • Frame rate •
Resolution
35 Color / Video / Audio
Preview Pipeline
Tier 4 — Pro Video Consistency Shared evaluation logic between preview and final render • Preview ≈ final render • Consistent color processing •
Consistent audio timing • Consistent effect evaluation
36 Collaboration-Ready Core Tier 6 — AI-Native Collaboration Real-time collaboration • Comments • Review • Versioning • Permissions • Team projects • Asset permissions •
Shared templates • Shared styles • Shared AI profiles


---

## Page 5

AI-Native Video Editor — Master Core Feature List Page 5
# Core System Priority Tier Feature Group Features / Capabilities
37 Plugin Architecture Tier 6 — AI-Native Plugin system Text plugin • Shape plugin • Chart plugin • Map plugin • Particle plugin • 3D plugin • Tracking plugin • AI video plugin
• Color plugin • Custom effect plugin
Tier 6 — AI-Native Core principle New capabilities added through plugins • No core rewrite for every new feature • Versioned plugin contracts • Plugin
migrations
38 AI-Safe Execution Layer Tier 6 — AI-Native Execution flow AI intent • Plan • Validated commands • Permission check • Command Bus • Editor
Tier 6 — AI-Native Validation Schema validation • Target validation • Capability validation • Parameter validation • Permission/safety checks •
Reversible command grouping
39 Constraint / Dependency
Engine
Tier 3 — Motion
Graphics
Relationships Property dependencies • Layer dependencies • Parent-child dependencies • Path following • Camera following path •
Audio-driven properties • Data-driven properties
Tier 3 — Motion
Graphics
Examples Text follows null • Null follows camera/path • Scale driven by audio amplitude • Graph height driven by data value
40 Null / Control Object
System
Tier 3 — Motion
Graphics
Controls Null objects • Controllers • Sliders • Color controls • Checkbox controls • Angle controls • Point controls
Tier 3 — Motion
Graphics
Master controls Speed • Intensity • Color • Scale • Global animation controls • One controller driving multiple layers
41 Character / Avatar
Animation Foundation
Tier 5 — 3D Character Rigging • Bones • IK • FK • Character controls • Facial controls • Lip sync • Pose animation • Motion capture
42 Motion Blur / Depth /
Optical Effects
Tier 3 — Motion
Graphics
Cinematic optics Motion blur • Per-object motion blur • Depth of field • Bokeh • Lens flare • Bloom • Chromatic aberration • Film
response • Shutter simulation • Camera shake
43 Professional Review / QA Tier 4 — Pro Video Automatic checks Missing media • Broken assets • Text overflow • Out-of-frame elements • Audio clipping • Subtitle overflow •
Frame-rate mismatch • Resolution mismatch • Missing fonts • Unsupported effects • Render errors
44 Accessibility / UX Layer Tier 6 — AI-Native Modes Beginner view • Creator view • Advanced view • Progressive disclosure
Tier 6 — AI-Native Usability Keyboard shortcuts • Search everything • Command palette • Contextual tools • Drag/drop • Smart defaults • Tooltips
• Guided workflows
Tier 6 — AI-Native Core UX principle Same powerful engine across all views • UI complexity changes; engine capability does not


---

## Page 6

AI-Native Video Editor — Master Core Feature List Page 6
MASTER PRIORITY TIERS
Tier Purpose Included Systems
Tier 1 — Foundation Core architecture required before advanced capability
can be layered safely.
1. Project & Composition Engine, 2. Powerful Timeline Engine, 3. Scene Graph / Layer System, 4. Transform & Motion
Engine, 5. Keyframe & Animation Engine, 25. History / Undo Engine
Tier 2 — Professional 2D High-end 2D editing, compositing, vector graphics,
effects and non-destructive workflow.
6. Shape & Vector Graphics Engine, 7. Text / Typography Engine, 8. Masking & Matte Engine, 9. Compositing Engine,
10. Effects Engine, 19. Transition Engine, 20. Time & Temporal Effect Engine, 24. Non-Destructive Editing, 26. Nesting /
Precomposition
Tier 3 — Motion Graphics Procedural graphics, animation, expressions, data,
maps, particles and GPU/shader capabilities.
11. Particle & Procedural Simulation Engine, 14. Motion Graphics Engine, 15. Expression / Scripting Engine, 27.
Data-Driven Graphics, 28. Map / Geo Graphics Engine, 29. Template / Component Engine, 30. Parametric Design
System, 31. Shader / GPU Effect Engine, 39. Constraint / Dependency Engine, 40. Null / Control Object System, 42.
Motion Blur / Depth / Optical Effects
Tier 4 — Pro Video Professional media, audio, color, tracking, restoration,
export and QA.
16. Tracking Engine, 17. Video Processing Engine, 18. Audio Engine, 21. Color Management, 22. Video Quality /
Restoration Tools, 34. Professional Import / Export, 35. Color / Video / Audio Preview Pipeline, 43. Professional Review /
QA
Tier 5 — 3D 3D layers, cameras, lighting, models, depth and
character foundations.
12. Camera Engine, 13. 3D Engine, 41. Character / Avatar Animation Foundation
Tier 6 — AI-Native AI command/execution, rendering/performance,
collaboration, plugins and adaptive UX.
23. AI-Assisted Editing Core, 32. Render Engine, 33. Performance Engine, 36. Collaboration-Ready Core, 37. Plugin
Architecture, 38. AI-Safe Execution Layer, 44. Accessibility / UX Layer
Developer principle: Build one unified, capability-complete editor core. Beginner, Creator and Advanced are UI views over the same underlying project graph, animation system, compositor, effects system, renderer and
command API. The UI may hide complexity; the engine must not remove capability.
