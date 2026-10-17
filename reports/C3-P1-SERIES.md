# C3 P1 render effects

- E masks: implemented, focused unit validation; browser appearance/performance unverified.
  APIs: setLayerMasks, evaluateMask, getMaskHandles, moveHandle, hitTestMask,
  rasterMask, createMaskCache, drawMaskedItems; see MASKS-API.md for full exports.
  UI: handles/type/order/feather/expansion/opacity/invert/mode, keyframes/easing,
  matte source/type/invert, command commit on release, render warnings.
- F blend modes: implemented. APIs: BLEND_OPTIONS, resolveBlendMode, applyBlendMode, blendPixel, setLayerBlendMode. UI: dropdown + warnings, commit via setter. Native Canvas mode support/precision unverified.
- G chroma key: implemented, CPU fixtures/fake backend tests; native WebGL unverified. APIs: setChromaKey, sampleColorAt, applyChromaCpu, createChromaProcessor, processChromaFrame. UI: enable/key/eyedropper/tolerance/softness/spill/edge/invert, full/fast preview, command commit and warnings.

Existing-file edits for E: src/core/model.ts (optional masks/matte validation; no
version bump); src/render/adapter.ts (evaluated mask scopes, including groups);
src/render/canvas.ts (shared isolated mask pass, preserving FX transition pairing).
No shared reports/indexes, UI, CSS, export-worker or e2e files changed.
Risks: linear feather and approximate ellipse/path distances; full-frame CPU cost,
readback/CORS, memory and Safari/mobile. No measured performance or pixel-parity
claims. Matte uses raw source content and remains visible; missing source fails closed.

E validation: 12 unit tests passed (tests/masks); typecheck passed both TS configs. Initial JSON command/test fixture typing errors fixed and rechecked. No e2e/full suite/CI polling.

Existing-file edits for F: core/model.ts optional blendMode; render/adapter.ts group/leaf blend scopes; masks/render.ts final Canvas blend after masking (skip alpha raster when no mask). No schema bump/migration.

F validation: 21 unit tests passed (tests/blend); typecheck passed. Fixed negative-zero output in the byte reference; assertions retained. No browser/e2e/CI run.

Existing-file edits for G: core/model.ts optional image/video chromaKey validation;
render/adapter.ts key projection and preview quality; render/canvas.ts decoded-frame
processing before picture/crop. No version bump/migration or dependency/model.
Risks: readback/CORS, CPU edge-filter cost, native GLSL/Safari/mobile unverified,
possible CPU/GPU rounding differences. Preview fast mode intentionally reduces
resolution; default preview/export share full mode. No real-time claim.

G validation: 7 unit tests passed (tests/chroma); typecheck passed both TS configs after fixing optional decoded-frame typing. Tests use fixtures/fake GPU, no live network/devices. No e2e/full-suite/CI polling.
