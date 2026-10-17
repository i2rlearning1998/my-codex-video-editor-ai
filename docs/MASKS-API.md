# Masks (Task E)

`src/masks/index.ts` exports `Mask`, `Matte`, `maskSchema`, `matteSchema`,
`evaluateMask`, `getMaskHandles`, `moveHandle`, `hitTestMask`, `signedDistance`,
`maskAlpha`, `stackAlpha`, `matteAlpha`, `rasterMask`, `createMaskCache`,
`drawMaskedItems`, `createMaskCanvas`, `setLayerMasks`.

## Model and edits

Layer `masks` is optional; absent/empty means no mask. Existing empty arrays load
unchanged. Layer `matte` is optional `{layerId,type:'alpha'|'luma',invert?}`.
No version bump or migration, per the parallel-branch contract. New documents with
nonempty masks will not load in older builds that only accept the old empty tuple.

Mask `{id,type,geometry,feather?,expansion?,opacity?,invert?,mode?,keyframes?}`:
rect/ellipse geometry is two opposite box corners; polygon is 3+ vertices; path is
start point followed by cubic control1/control2/end triplets. Paths close to start.
Coordinates are layer-local composition units. Defaults: feather/expansion 0,
opacity 1, invert false, mode add. Maximum 32 masks/layer, 300 points/mask,
1,000 sorted unique keys. Keys `{time,value,easing?}` use the existing easing
model, geometry point count is fixed, time is local to the effective layer start.
Before/after the keys, the first/last keyed geometry holds.

`setLayerMasks(engine,{compositionId,layerId,masks,matte?},label?)` is a validated
capability command: one undo, respects locked owning tracks. Omit matte to preserve
it; null clears it. Commit handle drags once on release, not on every move.
`moveHandle` returns a new mask, never mutates it. UI must write an animated handle
edit to the chosen keyframe's geometry; editing base geometry alone does not alter
existing keys. `getMaskHandles` returns vertex/control IDs and positions.

## Rendering and maths

The same Canvas path serves preview and export. Masked groups isolate their complete
child image before masking, so overlapping children are not feathered separately.
Scratch canvases use OffscreenCanvas, with unattached HTML canvas fallback. Static
alpha raster cache has four entries, keyed by geometry/params, matrix and output
size; animated evaluated geometry naturally invalidates it. Matte pixels are live.

Add uses alpha union; subtract multiplies by inverse alpha; intersect multiplies.
A first subtract/intersect starts from full coverage, a first add from zero.
Feather is a linear signed-distance ramp around the edge (not Gaussian blur).
Expansion offsets distance. Ellipse distance is a normalized radial approximation;
cubic paths flatten into 24 segments per cubic. Those approximations are deliberate
and may be visible on highly curved/large paths. Raster samples pixel centers.

Mattes use the referenced layer/group's raw rendered content, including its opacity
and FX, but not its own masks/mattes: this avoids recursive matte cycles. Luma uses
Rec.709 coefficients on encoded RGB times alpha. Inversion happens afterward.
The source remains normally visible; this API does not hide or reorder it. A missing
or inactive source yields transparent target and a readable renderer warning.
Readback/security/canvas failures warn and fail closed, rather than revealing the
unmasked target. Crop/editor overlays are not matte content.

## UI wiring / risks

UI: add/type/delete/reorder masks; draw polygon/Bezier handles; feather/expansion/
opacity/invert/mode controls; geometry keyframes/easing; matte source/type/invert;
renderer warning display. Draw handles using existing layer transforms and commit
through setLayerMasks. No UI/CSS edits.

CPU rasterization/readback can be expensive for animated paths and 1080p/4K. No
performance numbers or real-browser appearance claim. Raster allocation is capped
at 16 megapixels; isolated groups allocate additional full-output canvases. Tainted
media, Safari/mobile memory and real Canvas antialias behavior remain unverified.
Tests cover small alpha fixtures, geometry, easing, cache, group composition,
missing matte, command undo and unchanged old project fixtures using fakes.
