# Chroma key (Task G)

`src/chroma/index.ts` exports `chromaSchema`, `ChromaKey`, `PixelFrame`, `settings`,
`validateFrame`, `sampleColorAt`, `baseChroma`, `finishChroma`, `applyChromaCpu`,
`CHROMA_FRAGMENT`, `createWebGlChroma`, `ChromaGpu`, `createChromaProcessor`,
`processChromaFrame`, `setChromaKey`.

Optional `layer.chromaKey` applies only to image/video layers. Absence preserves
old rendering. No schema version bump/migration. Configuration:
`{color:'#00ff00',similarity?:0..1,smoothness?:0..1,spill?:0..1,feather?:0..8,shrink?:0..8,invert?:boolean}`.
Defaults: similarity .15, smoothness .1, spill .5, radii 0, invert false. Radii are
integer source pixels. Key distance is normalized Euclidean encoded RGB, not a
perceptual color metric. Smoothstep controls alpha retention. Spill reduces excess
in the key's dominant RGB channel near the key. Invert flips the key retention,
not the original source transparency; spill is independent of inversion.

`setChromaKey(engine,{compositionId,layerId,chromaKey},label?)` commits one undoable
validated edit, rejects locked tracks and non-image/video layers; null removes it.
UI must wire enable/remove, eyedropper, color/tolerance/softness/spill/edge controls,
invert, undo and render warnings. `sampleColorAt(frame,x,y)` uses integer source
pixel coordinates; UI converts its transformed pointer coordinates first.

`applyChromaCpu(frame,config)` returns new RGBA bytes, never mutates input.
`createChromaProcessor(makeGpu?)` exposes process(frame,config,backend='auto') and
dispose(). Result includes frame, backend and optional `GPU_FALLBACK`. Explicit cpu
never initializes GL. Unsupported/lost/failed GL falls back to CPU until disposal.
Injected GPU runners operate the base key/spill stage only; finishChroma always
applies the same shrink (square minimum filter) then feather (square box average).
Edges clamp to source boundaries. Original alpha is multiplied by key retention.

The actual WebGL1 shader runs when supported: nearest-sampled source texture,
non-premultiplied bytes, synchronous readback; compilation/link/context/readback
failures choose CPU. It is not a stub. CPU/shared edge pass remains available.
Tests fake the GPU runner, so native compilation and GPU parity are unverified;
float/byte rounding can differ by a channel between CPU/GPU/browser implementations.
No cross-GPU pixel-parity claim.

Shared render integration keys decoded media before picture crop/border drawing,
including crop preview, then existing FX/mask/blend processing applies. Preview and
export use the same function and default full source resolution. A caller may set
RenderSource.chromaQuality='fast' for a temporary preview with longest edge 960px;
edge radii scale accordingly. Export's default remains full. This switch intentionally
trades detail for responsiveness and does not claim identical low-quality preview.

Buffers cap at 16 megapixels. Source canvas and GL resources are reused, but CPU
edge filters/readback allocate frame buffers; radius 8 on large video may be slow.
No real-time benchmark, real green-screen footage, browser or Safari/mobile proof.
CORS-tainted decoded sources can block readback: renderer reports the layer error,
not an unkeyed result. No network/model/dependency added. UI must expose failures
and avoid promising hardware acceleration when backend is CPU. Black/transparent
source-edge halos may need better source padding or smaller feather radii.
