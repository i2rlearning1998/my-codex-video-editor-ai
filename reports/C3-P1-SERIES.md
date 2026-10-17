# C3 P1 render effects

- E masks: implemented, focused unit validation; browser appearance/performance unverified.
  APIs: setLayerMasks, evaluateMask, getMaskHandles, moveHandle, hitTestMask,
  rasterMask, createMaskCache, drawMaskedItems; see MASKS-API.md for full exports.
  UI: handles/type/order/feather/expansion/opacity/invert/mode, keyframes/easing,
  matte source/type/invert, command commit on release, render warnings.
- F blend modes: not started. Next task.
- G chroma key: not started.

Existing-file edits for E: src/core/model.ts (optional masks/matte validation; no
version bump); src/render/adapter.ts (evaluated mask scopes, including groups);
src/render/canvas.ts (shared isolated mask pass, preserving FX transition pairing).
No shared reports/indexes, UI, CSS, export-worker or e2e files changed.
Risks: linear feather and approximate ellipse/path distances; full-frame CPU cost,
readback/CORS, memory and Safari/mobile. No measured performance or pixel-parity
claims. Matte uses raw source content and remains visible; missing source fails closed.

E validation: 12 unit tests passed (tests/masks); typecheck passed both TS configs. Initial JSON command/test fixture typing errors fixed and rechecked. No e2e/full suite/CI polling.
