# Creator Pack engine (offline v1)

This pure TypeScript library parses and checks authoring packs. It does not run
source, render, register content, alter a project, access DOM, or contact a service.
The creator spec is imported unchanged; editor and library schemas stay unchanged.

## What exists

- JSON and named-source text parser with duplicate/unknown/unused section errors.
- Reused native library schemas, new item/controls schemas, per-item diagnostics.
- Hand-written expression parser/evaluator; preset defaults and individual extremes;
  generation of numeric keyframe tracks in seconds with duration/delay/easing.
- Recipe expansion using only caller-supplied FX IDs and declared control values.
- Conservative URL/network/obvious-loop policy, compileBlock for Tier B;
  static Tier C / pixel-code checks with needsRuntimeCheck.
- Composition Spec validation/planning projection and library dependency checks.
- Eleven valid packs (three of them styles), eight rejected packs, focused unit
  tests, offline CLI.
- B1: the `style` kind, a creative direction for the AI creator (see
  docs/STYLES.md). Its kit ids must exist or be marked optional; Animate presets
  are always known, FX and library ids are checked when a catalog is supplied,
  and an unchecked id is a warning, never a silent pass.

## Run

```sh
npm run pack:check -- examples/creator-packs/shape.json
npm run pack:check -- my-pack.creatorpack.txt --fx=effect.glow,crossfade --known=other/item
npx vitest run tests/creator-pack
```

CLI: exit 0 = all items pass offline checks (warnings allowed); 1 = rejected
pack/items; 2 = file/argument/loader failure. Vite, already installed, loads TS in
middleware mode without a listening server. CLI output is exactly result.report.
Without `--fx` the CLI loads the editor's own FX catalog (`src/fx`), so style
kits and recipes are checked against real ids; `checkPack` itself never imports
one, and an absent catalog there is an empty list.

```ts
import { checkPack, generatePreset } from '../src/creator-pack';
const result = checkPack(textOrObject, { fxCatalog: [], knownLibraryIds: [] });
// result.items: id, type, status, reasons, needsRuntimeCheck, normalized item.
// result.ok means no offline rejection, not runtime approval.
```

Rejected items never become executable objects. Independent valid items retain
their own status. Duplicate ids, dependency cycles and dependencies on rejected
items reject those items. Known IDs are a caller-supplied existence assertion.

## Decisions

- CP-D1: Owner's limit mode overrides general wave bookkeeping: no UI/ledger/status,
  browser tests, CI polling or new dependencies. Required spec/docs/CLI/script and
  tests/examples paths are the explicit exceptions to “new folders only”.
- CP-D2: MB means MiB measured in UTF-8, including expanded packs: 4 MiB pack,
  1 MiB source, 200 items. Plain JSON is bounded to depth 32 / 100000 nodes;
  cyclic, accessor-bearing, nonfinite and prototype-bearing input is rejected.
  Delimiter lines are reserved; raw source line endings normalize to LF.
- CP-D3: Bilingual labels belong to pack controls. Existing Block source labels
  remain English strings; metadata must match after this label projection.
  Native and Composition Spec schemas are reused, not edited. Composition
  parameters use the pack vocabulary at this boundary and are projected to the
  existing scalar parameter schema; unsupported richer parameters fail explicitly.
- CP-D4: Angle needs min/max/step in degrees; point is {x,y} in [0,1]; range is
  [low,high] with min/max/step; media is an opaque slot id (empty means unfilled).
  Expressions are scalar: number/angle controls can drive numeric keys; point lists
  and arbitrary path expressions are not in this grammar. No property access.
- CP-D5: Preset duration=1 s, delay=0 s, easing=linear are added if absent, advanced
  by default and counted in the 24-control limit. Keys are strictly increasing
  normalized times. Returned keys are in seconds; optional loop intent is preserved, not dispatched as editor commands.
  Check defaults and each declared min/max independently, not the exponential
  Cartesian product. This does not prove finite values everywhere in the interior.
- CP-D6: adjust accepts values (catalog keys adjust.<name>) or recipe/code like the
  other right-panel kinds, per the task. Recipes use exactly steps OR from; from
  is an FX id or {steps}. Fixed or nested $param values are resolved. Intensity is
  the host blend control and is therefore allowed without an explicit reference.
  FX metadata and code syntax/behavior still require the real runtime validator.
- CP-D7: A composition library reference is exactly {library:"pack/item"} as a
  scene item. A validation-only shape sentinel preserves count/duration gates;
  native contents still go through validateSpec/resolveSpec. Authored data stays
  intact. Reference expansion is explicitly skipped: not supported yet. No fake
  executable plan is returned. Future importer must expand and revalidate.
- CP-D8: Every visual item warns that runtime/visual checks remain. Tier C and FX
  code always need runtime checking; Tier B compilation is static too. Obvious
  infinite loops and forbidden words are diagnostics, not a security proof.
  Font/audio-preset/textStyle are not v1 kinds (use text for text styles).

- T1 (D-254): `theme` is a v1 kind: palette slots (background, primary, accent,
  text, optional extra), heading and body fonts, a motion style (calm, snappy,
  bouncy, cinematic) and an optional caption style; no controls. The offline
  gate rejects a text colour under 4.5:1 contrast on the background; the
  editor also checks the fonts exist. Examples: theme-sunny.json,
  theme-midnight.json (valid) and bad-theme-contrast.json (rejected).

## Honest limits

No rendering, determinism measurements, FX input/alpha/endpoint verification,
control pixel-sensitivity test, runtime safety guarantee, licensing/originality
recognition, registry, UI, editor application or playback/export proof. No real
network request or code execution is needed for any offline check. False positives
in the conservative word scan are possible, as are obfuscated hazards it misses.
Runtime checks must occur before registration. Pure-data presets can be “ok”;
visual items usually say “warning” until the later importer performs its gate.
