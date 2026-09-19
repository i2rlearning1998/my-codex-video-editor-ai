# Transform interaction contract - revision 3

**Tier 2.2.2, 2026-09-12.** This revision changes only corner scaling from freeform to proportional by default. Tier 2.2.1 visual-center rotation, generic edges, and text width grips remain unchanged. It does not change schema-1 spatial semantics in [TRANSFORM_CONTRACT.md](TRANSFORM_CONTRACT.md).

## Local origin versus interaction pivot

Local geometry origin remains `(0,0)`. Canonical position maps that origin into parent space, and local matrices remain `T(position) * R(clockwise degrees) * S(scale)`. There is no new anchor field, persisted matrix, or parent representation.

The interaction rotation pivot is the visual selection bounds center. For local center `c`, preserve parent-space `C = L_before * c`. Given a new rotation, compute `position_after = C - (R_after * S_before) * c`. This updates canonical position and rotation together, preserving the center through every ancestor transform. Direct core SET_PROPERTY(rotation) retains its frozen stored-property meaning; the Canvas and inspector interaction builders add the position compensation explicitly. Rotation on an empty group has no visual pivot and is rejected by the inspector.

## Coordinates and selection overlay

Client pointer coordinates minus canvas bounding rectangle give CSS pixels. Invert the derived fit matrix to obtain composition coordinates, then invert the baseline parent world matrix for parent coordinates. The canvas is not independently CSS-transformed. Device pixel ratio affects only backing pixels (existing cap 2); fit, padding, centering, pointer deltas, and hit sizes remain logical.

A drawable box uses its local width/height corners under the full world matrix. A group box encloses descendant drawable corners in group-local space before applying its full world matrix. The box is a transformed quadrilateral, never replaced with a screen axis-aligned rectangle. Its diagonal midpoint is the visual center, including inherited shear. Groups still have no stored size.

`SelectionOverlay` is derived on demand from canonical state plus the active numeric preview. It contains bounds, corners, center, rotation stem/handle, capabilities, and handle records. Drawing and hit testing share these records. Handles follow the box orientation with normalized screen basis vectors; their graphics do not shrink with zoom or DPR. No duplicate authoritative geometry is retained.

The rotation disc has radius 8 CSS pixels and a rotation glyph. A connector runs from the top-side midpoint to a point 34 CSS pixels outward along the top-side normal, chosen away from the center. It remains outside rotated/reflected/sheared bounds, separated from corner hit regions. Corners are 8px squares; generic edges are 6px squares; text width grips are distinct 5x14px bars. Hover highlights a handle and updates the cursor; rotation uses grab/grabbing and resize cursors follow screen axes.

## Type capabilities and picking

| Type                                   | Body move | Center rotation | Corners            | Generic edges | Text width grips |
| -------------------------------------- | --------- | --------------- | ------------------ | ------------- | ---------------- |
| Text                                   | Yes       | Yes             | Whole-object scale | No            | Left/right       |
| Shape, image, video, audio placeholder | Yes       | Yes             | Scale              | Four          | No               |
| Group with drawable bounds             | Yes       | Yes             | Scale              | Four          | No               |

The immutable policy map is an explicit input extension point. Unknown types default to no interactions; future consumers can supply policy definitions. This does not implement plugin loading, new document types, future crop, or another engine capability registry. Geometry must also be safely invertible for active handles. Collapsed geometry remains selectable through the Scene list and repairable through inspector scale values.

Hit-test priority is: rotation, corner/generic edge resize, text width grips, drawable body, empty canvas. Hit radii are 12 CSS pixels for rotation and 10 for other handles, larger than their graphics. Within overlapping resize hit regions, corners use top-left, top-right, bottom-right, bottom-left order, then edges use top, right, bottom, left. Tiny views use this deterministic priority; the inspector is the accessible alternative when handles overlap.

Body picking otherwise preserves reverse paint order and composition clipping. An already-selected group remains selected when its descendant body is dragged; choose a child in the Scene list to transform it individually. Empty/outside-composition body clicks clear selection. Selection and hover never issue commands or autosave.

## Move and resize

Movement adds parent-space pointer delta to baseline local position. It never reparents or uses MOVE_LAYER, which retains its frozen local-preserving reparent/reorder meaning.

Corners resize in baseline rotated local axes with the opposite corner fixed in parent/world space. Resolve signed scales by inverse rotation of the pointer-to-fixed-corner vector, then compensate position so the fixed corner stays fixed. The initial pointer-to-handle grab offset is retained. Rotation, nonuniform/negative scale, nested parents, and nonzero group-local bounds are supported without shear decomposition.

Corner dragging always preserves the initial signed scale ratio for every type, including text: choose the candidate relative multiplier farthest from 1, X winning ties, and apply it to both baseline scales. This preserves existing aspect ratio even when baseline scales differ. Shift retains the same proportional behavior; it does not enable freeform scaling. Crossing the opposite corner permits zero/negative scale under the frozen contract. Collapsed results can be repaired in the inspector.

Generic left/right edges change only scale X, and top/bottom only scale Y; they change the corresponding visual dimension while intrinsic width/height properties stay unchanged. The opposite edge remains fixed. Resolve along baseline rotated axes and ignore tangential movement. Shift does not affect edges. There are no snapping, skew, perspective, crop, or advanced constraints.

## Text width and editable layout

Text left/right middle grips edit canonical box width, never transform scale or font size. Convert pointer movement through the baseline parent and local inverses. Right grips preserve the top-left world corner. Left grips preserve the top-right world corner by compensating position. Box height grows or shrinks along local positive Y after wrapping; it is not centered on the pointer. Width clamps to at least one local unit and does not flip the text. Shift does not change width-grip behavior.

Text corners are unambiguously whole-object transforms: they change scale/position under the ordinary corner contract, without changing width, height, font size, or wrapping mode.

Width editing activates the existing typed custom-property convention `textWrap: true` and commits numeric width/height. Previous text retains explicit-newline rendering until a width edit. Original string content stays in the canonical `text` property (falling back to layer name if absent). No rasterization replaces editable text. Existing property metadata is retained, and incompatible width/height/wrap property types reject the gesture.

Wrapping is greedy by whitespace-separated tokens, honors explicit newlines, drops line-boundary whitespace, and splits overlong words by Unicode code point. Line height is 1.2 times the effective font size (existing preview cap 4096). The browser measures with Canvas's same Arial 600 font used for drawing. Renderer, interaction preview, and commit share the same injected measurement service. Headless consumers may inject fixed metrics; the fallback is 0.6 times font size per code point. Fonts can differ across platforms; advanced shaping/typography is not promised. A glyph wider than the box occupies its own line and clips horizontally.

Layout rejects more than 100,000 characters, more than 10,000 lines, nonfinite metrics, and overflow. A failed layout cancels rather than partially committing. Committed height is saved with the width; future edits to text/font outside this milestone should rebuild the layout through an explicit command transaction. Live text-content editing and font controls are not added here.

## Rotation and precision

Convert consecutive pointer vectors around the frozen baseline visual center to shortest signed parent-space angle increments in `[-180,180]`, accumulating clockwise degrees. This crosses the angle branch cut without jumps; no rotation normalization is persisted. Parent inverses preserve correct behavior under nested/reflected transforms. An ancestor reflection can reverse the screen direction corresponding to positive stored rotation. More than 180 degrees of motion between samples cannot be inferred.

A pointer within 1e-9 parent units of the pivot cancels. Use JavaScript doubles and shared finite/inverse guards, without committed-value rounding or snapping. Exact return-to-start resets the baseline; rotation requires accumulated angle within 1e-10 degrees of zero (a deliberate full turn remains an edit). Text width changes within `1e-10 * max(1, baselineWidth)` count as numerical no-ops, avoiding writes from tangential motion through inverse transforms. Generic edge scales within `1e-10 * max(1, abs(baselineScale))` of their baseline likewise count as no-ops; this does not round genuine resize values.

## Pointer lifetime, history, and inspector

Primary-button down resolves the handle/body, selects, freezes one canonical baseline, and obtains pointer capture. Failure to capture cancels. Movement of at least 3 CSS pixels starts a transform; smaller movement is a click. Capture retains events outside the canvas and ignores other pointers. Canvas text selection and touch scrolling are disabled only on the canvas.

Updates produce one transient numeric transform and optional text-box preview. They never mutate canonical records, issue commands, create history, or autosave. Pointerup consumes the last position and commits only changed SET_PROPERTY commands in one atomic transaction. Position/rotation, position/scale, or text width/height/wrap/position share that one undo boundary. Undo restores the exact previous snapshot; redo restores the exact final snapshot. A no-op produces no commands.

Escape, pointercancel, lost capture, window blur, viewport resize, selection/composition/document changes, external engine mutations, disposal, invalid coordinates, or arithmetic/layout errors discard the preview and release capture. Cancel produces no committed state event, history, or autosave. No delayed commit or time-based history merging exists.

Inspector edits only X/Y, scale X/Y, rotation, and opacity. Rotation uses the same visual-center compensation and canonical angle as Canvas. Enter/change commits once; Escape resets input. Invalid/empty values and opacity outside `[0,1]` reject and refresh canonical values. During Canvas preview the inspector displays committed values; after release, undo, and redo both surfaces reflect the same engine snapshot.

## Compatibility and stop boundary

Schema remains 1: the existing typed property dictionary already supports numeric dimensions and boolean flags. No structural schema adjustment or migration is needed. Older applications preserve the wrap flag but do not render its new convention. Engine, Command Bus, canonical graph, history, persistence, capability execution, MOVE_LAYER, and transformed-UNGROUP rejection remain unchanged. Tier 2.3, Timeline functionality, playback, animation, effects, AI, 3D, media importing, crop, and services are not started.
