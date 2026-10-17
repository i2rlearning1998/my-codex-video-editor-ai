# Blend modes (Task F)

`src/blend`: `BLEND_MODES`, `BLEND_OPTIONS`, `BlendMode`, `BlendWarning`,
`resolveBlendMode(value,onWarning?)`, `applyBlendMode(context,value,onWarning?)`,
`blendPixel(backRGBA,sourceRGBA,mode)`, `setLayerBlendMode(engine,input,label?)`.

Optional layer `blendMode` defaults to normal; no migration/version bump. Unknown
strings are retained but render normal with `UNSUPPORTED_BLEND_MODE`. A Canvas
that rejects an operation also resets to source-over with that warning.

UI dropdown data includes display names/categories:
- Normal: Normal.
- Darken: Multiply, Darken, Color Burn.
- Lighten: Screen, Lighten, Color Dodge.
- Contrast: Overlay, Hard Light, Soft Light.
- Comparison: Difference, Exclusion.
- Component: Hue, Saturation, Color, Luminosity.
Stored values are lowercase, spaces replaced by hyphens (except normal).

Call `setLayerBlendMode(engine,{compositionId,layerId,blendMode})` on selection:
one validated command/undo, locked tracks rejected. Wire warning display. Do not
change clip FX blend settings when setting this independent layer property.

Groups containing explicit layer blend modes isolate their children first. Each
child blends with earlier siblings in that transparent group; the resulting group
blends with its parent. Unmodified legacy groups retain their old path. The group
must have its own blendMode to blend as a whole with the scene backdrop. Masks run
before this final blend. Existing clip FX/transition blending stays internal to the
isolated item. Preview and export use the same Canvas globalCompositeOperation path.

`blendPixel` is an unpremultiplied-byte reference for unit fixtures, not a second
runtime renderer. Formula source: https://www.w3.org/TR/compositing-1/ sections
10.1–10.2. Native Canvas/GPU/browser agreement is not proven by these tests.
Tests use small numeric fixtures (all 16 modes, component colors, alpha), fake
operation support, group scope projection, undo and an unchanged old fixture.
No browser/e2e/CI checks, no pixel parity or performance claim. Full-output isolated
surfaces cost memory; Safari/mobile native mode support remains unverified.
