# Tier 1.1 — Transform & Scene Graph Contract Freeze

This is the normative contract for schema-1 spatial data and future consumers. It defines pure geometry and inherited opacity, not rendering, playback, layout, or animation. Changes to these semantics require explicit scope and compatibility review. Tier 2 has not started.

## Coordinates and origin

- Composition/world coordinates are continuous logical pixels with origin `(0, 0)` at the composition's top-left boundary. Positive X points right; positive Y points down. Composition width/height define bounds, not a transform or a unit conversion.
- Subpixel and negative coordinates are valid, as are positions outside composition bounds. Core math does not round, clamp, clip, or account for device pixel ratio, viewport zoom, or pan. Future view adapters must apply their own view transform after the world transform without changing project data.
- Every layer has a local coordinate frame with a **fixed anchor at local `(0, 0)`**. This is the pivot for rotation and scale. `position` maps this origin into its parent's coordinate frame. A root layer's parent frame is the composition frame.
- Local origin is explicit and independent of geometry, intrinsic asset dimensions, descendant bounds, text metrics, or selection. For a future rectangular asset plane, its top-left boundary is local `(0, 0)` and its opposite boundary is `(width, height)` before transforms; pixel centers would be at half-integer coordinates. Text/path layout may extend into negative coordinates but cannot silently change the layer origin. Font metrics and content layout are not implemented here.
- Schema 1 has no adjustable anchor. No center anchor or automatic centering is inferred. Adding an editable anchor later requires a versioned field/migration defaulting existing documents to `(0, 0)`, with local formula `T(position) * R * S * T(-anchor)`. This is a compatibility requirement, not an implemented feature.

## Stored transform values

| Field              | Frozen semantics                                                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `position: [x, y]` | Parent-frame coordinates of the fixed local origin, in logical pixels. Translation is not scaled/rotated by the layer's own scale/rotation; ancestors do transform it.                                                                                       |
| `scale: [sx, sy]`  | Dimensionless local-axis multipliers. `(1, 1)` is identity. Nonuniform scaling is allowed. Negative values reflect an axis; zero collapses an axis and is valid, though it makes inversion singular. Scaling is about local origin, not bounding-box center. |
| `rotation`         | Degrees, positive clockwise in the downward-Y coordinate system. `(1, 0)` rotates to `(0, 1)` at `+90°`. Rotation is about local origin. Stored turns are preserved; e.g. `360` is not rewritten to `0`.                                                     |
| `opacity`          | Scalar in `[0, 1]`, separate from geometry. Effective opacity is the root-to-layer product of local opacities. No addition, percentage conversion, or matrix encoding.                                                                                       |

These are stored **base values**. `animated` and reserved constraints are not evaluated. No time argument or keyframe implementation exists. Future animation evaluation must produce values obeying this same spatial contract.

## Matrix representation and composition order

Pure helpers in `src/core/transforms.ts` use column-vector affine matrices represented by the tuple `[a, b, c, d, e, f]`:

```text
    [ a c e ]   [ x ]
M = [ b d f ] * [ y ]  =>  (a*x + c*y + e, b*x + d*y + f)
    [ 0 0 1 ]   [ 1 ]

L = T(position) * R(rotation) * S(scale)
  = [ cos(θ)*sx  -sin(θ)*sy  x ]
    [ sin(θ)*sx   cos(θ)*sy  y ]
    [ 0           0          1 ]
```

`multiplyMatrices(A, B)` returns `A * B`: apply **B first, then A**. A local point is scaled first, rotated second, translated last. For position `(10, 20)`, scale `(2, 3)`, rotation `90°`, point `(1, 2)` maps to `(4, 22)`.

The implicit composition transform is identity. A layer's world matrix is `W_parent * L_layer`. The helper computes a left-associated root-to-leaf product, starting from identity. Three levels are `((I * L_root) * L_group) * L_leaf`. Never add positions/angles or multiply scale components as a replacement for affine composition. Nonuniform scales combined with rotations can create **shear** in the derived matrix even though each stored layer uses only translation/rotation/scale (TRS). Preserve the full derived affine matrix; do not silently decompose it into lossy TRS values.

## Groups, nesting, opacity and ordering

A group supplies an ordinary local coordinate frame with the same fixed origin and TRS rules. It has no implicit dimensions, recentering, fit-to-children behavior, clipping, or asset plane. Nested groups compose exactly like any other parent-to-child chain.

Groups propagate opacity multiplicatively to each descendant drawable. A group is not an isolated offscreen compositing surface in this contract: future consumers apply each drawable's effective opacity once, avoiding a second ancestor-opacity application. Overlapping children therefore follow per-drawable inherited opacity, which can differ from fading a precomposited group image. Isolated group blending, if later required, needs a separately specified/versioned semantic mode; do not silently reinterpret existing group opacity.

The nested arrays remain the sole hierarchy and ordering source. Parent relationships are derived from containment. For future drawing, sibling order is back-to-front (earlier array entries below later entries), traversed depth-first so a group's descendants remain contiguous in sibling order. Geometry calculations themselves are independent of sibling order. No ordering index or world-matrix state is stored.

`GROUP` inserts an identity frame with opacity 1 at the first selected sibling's position. Children retain their local records and selected scene order, so their world geometry/opacity is preserved. A noncontiguous selection can change stacking relative to unselected siblings; grouping does not promise preservation of the entire composited appearance in that case.

## Reparenting and MOVE_LAYER

`MOVE_LAYER` **preserves the complete stored local transform**, including opacity and metadata. It does not preserve world geometry, effective opacity, or world appearance when changing parents. For a moved layer:

```text
L_after = L_before
W_after = W_newParent * L_before
effectiveOpacity_after = effectiveOpacity_newParent * localOpacity
```

Descendant local records are unchanged as well; their world values follow the new ancestry. Moving to the composition root uses identity parent geometry and opacity 1. Same-parent reordering preserves world geometry/opacity but can change stacking. Index is measured after removal and an omitted index appends. Existing cycle rejection and single-composition scope remain unchanged. A singular destination parent is allowed because preserving local values requires no inverse.

A future, separately authorized world-preserving reparent operation would require `L_new = inverse(W_newParent) * W_old` and a compatible local opacity. It must reject unavailable/unstable inverses, unrepresentable affine results, and impossible opacity ratios. No such command or mode is added in Tier 1.1.

## UNGROUP and future appearance preservation

Current `UNGROUP` remains intentionally conservative. It requires the **stored default transform records**, including position `(0, 0)`, rotation `0`, scale `(1, 1)`, opacity `1`, `animated: false`, empty keyframes/constraints, and no custom group properties. Even geometrically equivalent rotation `360` is rejected. Do not replace this guard with an epsilon-based matrix identity comparison; that could discard meaningful stored data or future metadata. Children replace the group at its current index in their existing order. This works under transformed or singular ancestors without inversion.

Transformed-group ungrouping remains unimplemented and rejected, even for simple cases that might be individually safe. Rejection must be atomic: state, history, redo, and state-change notifications are preserved as covered by regression tests.

The required future geometry/opacity transformation for each direct child is:

```text
L_child_new = L_group * L_child_old
opacity_child_new = opacity_group * opacity_child_old
W_child_new = W_parent * L_child_new ≈ W_child_old
```

This direct product does not need an inverse, including under singular ancestors. Nested descendant local transforms remain unchanged. Child order and the removed group's slot must be preserved. Under inherited-opacity semantics, multiplying each direct child's local opacity also preserves descendant effective opacity.

Before any future implementation can promise world-space appearance preservation, it must:

1. Represent the full affine product, including possible shear/reflection/degeneracy, or prove deterministic lossless representability in the supported fields within a specified error budget and otherwise reject. Current TRS data is insufficient for general products. Never discard shear.
2. Define canonical decomposition and singular-case rules if it retains TRS, validate recomposition, and avoid approximate flattening outside the accepted error budget. No decomposition is provided in this milestone.
3. Preserve or explicitly reject all group properties, animation/constraints, and any future compositing, effects, masks, or layout semantics. Geometry alone cannot prove appearance equivalence once those features exist.
4. Prevalidate every child result and commit a single undoable transaction, with rollback on any failure. If stored shape changes, add a consecutive schema migration before writing that data.

The equation is a frozen requirement and tested mathematical identity (within floating-point tolerance), not permission to broaden the existing command.

## Precision, failure and determinism

- Use JavaScript `number` (IEEE-754 double precision) throughout core calculations. No float32 conversion, integer snapping, random values, clock input, global state, DOM/GPU APIs, or matrix caches are involved.
- Use the documented operation order. Floating-point multiplication is not associative; different parenthesizations can differ in the last bits. The helpers are deterministic for the same inputs/runtime. Cross-engine bit-for-bit equality of transcendental functions is not promised. Compare ordinary-scale expected results with approximately `1e-10` absolute/relative tolerance; choose an explicit scale-aware error budget for future geometry decisions. This is test guidance, not permission to silently snap or quantize data.
- Rotation is reduced by signed remainder modulo `360` before radians conversion. Exact cardinal remainders use exact sine/cosine values. Nearby angles are not snapped. Large stored rotations have only the precision already present in the input double; lost fractional turns cannot be recovered.
- Derived matrices/points canonicalize signed zero to positive zero. Stored data is not normalized or rewritten. Very small products can underflow to zero; consumers cannot assume all nonzero stored scales remain invertible after deep composition.
- Inputs and calculated outputs must be finite. Nonfinite input/output raises `RangeError`. This includes overflow of an intermediate that contaminates the result, even if an algebraically rearranged calculation might avoid it. Never silently return identity, clamp coordinates, or commit derived output to project state on failure. Valid finite schema data can still exceed the numerical range of a requested world calculation; the helper reports that failure without mutating state.
- Inversion normalizes the linear block by its largest absolute coefficient `s`. If `s` is zero or the absolute normalized determinant is **at most `1e-12`**, return `null` for a singular/numerically unsafe inverse. This is a conservative relative determinant rule, not an exact condition-number test. Uniform tiny/huge scales are not rejected solely because of magnitude. A nonfinite resulting inverse raises `RangeError`. There is no pseudo-inverse or fallback identity.
- Opacity multiplication can underflow to zero in extreme ancestry. Zero-opacity nodes still have geometry; opacity is not a geometry-culling rule.

## Architecture and compatibility

The helpers take readonly values from the validated canonical tree and return frozen derived tuples/records. `worldTransform` finds the requested ancestor path and computes only that branch. Unknown layer IDs throw. Unvalidated/cyclic trees are outside its input contract and must pass existing project validation first.

There is no second store, persisted matrix, parent index, scene cache, engine replacement, capability alteration, or UI feature. Engine mutations remain on the existing command/transaction/history path. No persistent field/default or serialized representation changes, so **schemaVersion remains 1 and no migration is necessary**. A regression test verifies schema-1 serialization and derived values survive a round trip. Future renderers must consume this contract; they must not redefine it.
