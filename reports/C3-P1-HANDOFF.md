# Render effects handoff
Branch codex/c3-render-effects from codex/c2-engines. Draft PR targets codex/c2-engines; never merge.

## E — implemented, browser unverified
Optional masks/matte, geometry + existing easing, handles, signed-distance raster,
static cache, group isolation and raw alpha/luma matte references. One-undo setter.
No schema version bump/migration. Old empty-mask fixture remains unchanged.
Current limitations: ellipse distance/Bezier flatten approximations; animated CPU
cost, Canvas/Safari/mobile/readback behavior not measured. See MASKS-API.md.

## F — implemented, browser unverified
F implemented: optional blendMode, Canvas operation warnings, group isolation, one-undo setter and all-mode reference fixtures. G implemented below. No UI or browser proof.

E validation: 12 unit tests passed (tests/masks); typecheck passed both TS configs. Initial JSON command/test fixture typing errors fixed and rechecked. No e2e/full suite/CI polling.

F validation: 21 unit tests passed (tests/blend); typecheck passed. Fixed negative-zero output in the byte reference; assertions retained. No browser/e2e/CI run.

## G — implemented, native GPU unverified
Optional image/video chroma key, CPU + WebGL1 base stage and shared CPU edge filters,
fallback selection, eyedropper, full/fast preview, one-undo setter. Shared media render
hook includes crop preview. No real devices, network, GPU or footage tests.

## Next
E/F/G implementation checkpoints are pushed. No further tasks assigned to this branch.
UI wiring and real-browser visual/performance validation remain for later; do not
start H or other parallel tasks. PR #38 targets codex/c2-engines; never merge.

G validation: 7 unit tests passed (tests/chroma); typecheck passed both TS configs after fixing optional decoded-frame typing. Tests use fixtures/fake GPU, no live network/devices. No e2e/full-suite/CI polling.
