# Schema v7 proposal — code and camera layers

**PROPOSAL ONLY. Nothing in this branch changes the schema, migrations or editor.**

## Real baseline and version prerequisite

Read against main `9362645`: `src/core/model.ts` has `SCHEMA_VERSION = 5`.
`src/core/serialization.ts` registers consecutive migrations 1→2 (timing),
2→3 (keyframes), 3→4 (tracks) and 4→5 (version promotion for optional easing).
There is no version 6 schema or 5→6 migration in this baseline. D-228: “v7” is
reserved here as the requested proposal name. Integration must first reconcile
any intervening v6 design with Claude, or explicitly approve renumbering this
proposal to the next version. Do not invent a silent no-op v6 or skip the registry's
consecutive migration contract. No implementation can ship from this proposal
until that sequencing is resolved.

Current layers are strict objects with type group/video/audio/image/text/shape,
startTime, duration, transform, properties, empty effects/masks, nullable assetId
and children. **Layer has no metadata field.** Clip has metadata/effectMetadata/
transitionMetadata. Properties already support number, string, boolean, vector2
and color, animated flags and `{time,value,easing?}` keyframes. The existing
property system is sufficient for parameter animation; adding a parallel param
keyframe format would duplicate state.

## Minimal proposed additions

| Location                  | Proposed field/change                   | Default and invariant                                                                         |
| ------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------- |
| Layer.type                | Add `code` and `camera`                 | Existing values unchanged                                                                     |
| Layer.code                | Nullable strict object `{source, seed}` | null on existing and non-code layers; required on code layers                                 |
| Layer.cameraDepth         | number 0..1                             | 1 on existing drawable layers; 0 opts out of camera motion                                    |
| Composition.cameraLayerId | layer ID or null                        | null preserves all old rendering; reference must name a root camera layer in this composition |

`code.source` is the exact validated block-object source string (≤32768 characters),
not a function, URL or compiled bytecode. It includes id/version/name/category/
ParamSpec/defaultDuration metadata, so a second persisted copy is unnecessary.
`code.seed` is an explicit unsigned 32-bit integer, stable across saves and seeks.
A duplicate layer initially copies its seed; a separate “new seed” command may
change it. Compile on import/edit and cache the parsed definition outside project
JSON, never execute to discover metadata. Unknown validator versions or rejected
source leave the project inspectable but the layer disabled with an error; they
must not trigger an unsafe fallback. The validator policy version belongs in the
application cache/export provenance, not a mutable trust flag in project data.

Use existing `Layer.properties` for these values (all actual entries retain the
normal `{type,value,animated,keyframes,constraints}` shape):

| Layer  | Property IDs                                       | Types/defaults                                                                                           |
| ------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| code   | `block_<ParamSpec.name>`                           | number/color/string/boolean from each declared default; select maps to string with membership validation |
| camera | `camera_x`, `camera_y`                             | number 0, offsets from viewport centre                                                                   |
| camera | `camera_zoom`, `camera_rotation`                   | number 1 (>0), number 0 degrees                                                                          |
| camera | `camera_shake_amplitude`, `camera_shake_frequency` | number 0 (≥0), number 4 (0..1000 Hz)                                                                     |
| camera | `camera_shake_seed`                                | number 0, nonanimated uint32 integer                                                                     |

Code params are per-layer, not per-clip overrides. Number/color support existing
interpolation; text/select/bool use hold. Clamp evaluated numeric values to the
ParamSpec range after interpolation (including overshooting cubic curves), but
do not quantize to UI step. Source-defined defaults fill missing properties at
creation, never silently overwrite user keyframes on recompile. Unknown/removed
params require an explicit edit/migration decision with undo; preserve the old
source and values until that command succeeds. Bound parameter names to 64 safe
identifier characters when persisting so prefixed IDs fit the current 128-character
idSchema. The PoC compiler itself does not yet impose this integration prefix limit.

Camera layers are nonrendering, root-only, assetId null, children empty. Existing
transform fields remain identity/unanimated on cameras; camera motion lives only
in the properties above, avoiding two conflicting transform systems. Only the
composition's selected camera applies, during that camera layer's active time
range; outside it the camera is identity. Overlapping unselected cameras do nothing.
No camera blending/nesting is proposed. Drawables remain under their current
parent/group transform; cameraDepth is evaluated per final world-space drawable,
without multiplying the camera twice for ancestors. CameraDepth is initially
static; animating it is a separate future requirement.

Code layers have assetId null and children empty. Logical drawing size initially
uses the composition resolution; their existing transform controls placement and
scale. The current PoC frame limit is ≤4096 per side / 8,388,608 pixels, whereas
compositions permit up to 32768 per side. Integration must reject unsupported
code-layer export sizes explicitly, or separately approve and test a higher limit;
never silently downscale or change visual size. No external image/font dependencies
are supported by the current block subset.

## Proposed migration and validation work

Once the real predecessor version is agreed, its migration to v7 should deep-copy
project data, add `code:null` and `cameraDepth:1` recursively to old layers and
`cameraLayerId:null` to each composition, then validate the complete result.
Do not alter any old transform, timing, property, asset, track, clip metadata or
keyframe. Defaults introduce no new layers and must produce identical old pixels.
New camera creation fills the properties above. New code creation parses source,
sets duration from defaultDuration, fills property defaults, and assigns a seed
once. All of this is creation-command behavior, not migration of old projects.

Later implementation must extend layer discriminants, strict validators, asset
compatibility (current code assumes non-group asset types correspond), object-track
compatibility (currently group/shape), capability registration and selection rules.
Camera layers should have no clips initially; code layers may use object-track
clips once clip-local time mapping is tested. Update reference checks, serialization,
copy/paste, deletion of the active camera, import failure recovery and undo/redo.
Do not treat `code` as a generated media asset merely to bypass those validators.

Required migration tests: untouched v5 fixture values and rendered output through
the approved chain; recursive defaults; round trip; invalid camera references;
non-code layer carrying source; duplicate/invalid params; missing defaults; source
size limits; unchanged existing audio/video clip metadata; old clients rejecting
future versions clearly. New-client export must fail clearly on invalid source or
unsupported fonts/resolutions, never silently erase a layer.

## Risks and open integration choices

- Approval of v6/v7 sequencing is a prerequisite, not implemented here.
- Untrusted source persists across imports; validation does not grant trust.
  Production hardening needs a separately reviewed origin/CSP boundary.
- Built-in blocks use the full trusted library API, while pasted blocks use a
  restricted subset. A later built-in registry may require a source-kind union;
  this minimal source-only proposal deliberately does not serialize JS functions
  or silently treat a registry ID as untrusted source.
- Code edits can change parameter types and appearance; migration must be explicit
  and undoable. Version text alone does not identify content; use source hashing
  for runtime cache keys and reproducible exports.
- Font availability, rasterization and color settings affect exact pixels.
  System Arial in the PoC is not a portable bundled-font solution.
- Worker scheduling/cancellation, camera-aware hit testing, group transforms,
  retiming and clip reuse require integration tests. No such changes are included.
- Old clients cannot understand code/camera types. Keep backups and a clear
  unsupported-version error; no lossy downgrade is proposed.
