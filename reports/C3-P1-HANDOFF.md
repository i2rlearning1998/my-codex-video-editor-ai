# Render effects handoff
Branch codex/c3-render-effects from codex/c2-engines. Draft PR targets codex/c2-engines; never merge.

## E — implemented, browser unverified
Optional masks/matte, geometry + existing easing, handles, signed-distance raster,
static cache, group isolation and raw alpha/luma matte references. One-undo setter.
No schema version bump/migration. Old empty-mask fixture remains unchanged.
Current limitations: ellipse distance/Bezier flatten approximations; animated CPU
cost, Canvas/Safari/mobile/readback behavior not measured. See MASKS-API.md.

## Not done / next
F implemented: optional blendMode, Canvas operation warnings, group isolation, one-undo setter and all-mode reference fixtures. G chroma key is next. No UI or browser proof.

E validation: 12 unit tests passed (tests/masks); typecheck passed both TS configs. Initial JSON command/test fixture typing errors fixed and rechecked. No e2e/full suite/CI polling.

F validation: 21 unit tests passed (tests/blend); typecheck passed. Fixed negative-zero output in the byte reference; assertions retained. No browser/e2e/CI run.
