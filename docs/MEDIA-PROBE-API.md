# Media robustness — Task H

## Existing path and changes

Preview decodes through HTML video/image elements; it already seeks source seconds
and plays forward video against a continuous clock. Export uses Mediabunny sample
selection by presentation timestamps. No frame-count-based speed conversion is
introduced: VFR video keeps its original clock and audio duration.

Export previously retained `sample.toCanvasImageSource()`. That raw source does not
apply the sample's rotation/flip drawing transform, and an internally created
VideoFrame can close in the next microtask. Export now immediately materializes
`sample.draw()` at display dimensions. Mediabunny documents that draw applies
rotation/flip. HTML preview already draws the browser-oriented video; applying
rotation again there would double-rotate phone footage.

## Public API (`src/media-probe/index.ts`)

- `probeMedia(blob,{signal?}?) -> Promise<MediaDetails>`.
- `createMediaProbe({open})`: injected `ProbeSession.read/dispose` for tests or other
  demuxers; `browserProbeDependencies` is the production implementation.
- `MediaProbeError`: `UNSUPPORTED_CODEC`, `UNSUPPORTED_CONTAINER`, `UNREADABLE`,
  `ABORTED` (also has name AbortError). Codec errors include a plain codec reason.
- `normalizeTimestamps(pts)`: sorted unique, finite nonnegative presentation times.
- `detectVariableFrameRate(pts,tolerance=.001)`: null for fewer than 3 unique times.
- `mapFrameTimestamp(pts,time)`: last PTS at/before time, null before the first frame.
  Holds/drops frames on an output grid without changing the media clock.
- `mediaSeekTime(seconds,{end?,reverse?,nudge?})`: shared preview/export seek clamp
  and direction-aware boundary nudge, default .001 s. No nominal-fps rescaling.
- `rotatedDimensions(width,height,rotation)` and
  `rasterizeOrientedSample(sample,makeCanvas?)`: orientation-aware export boundary.
- `detectMissingMedia(assets,availableKeys)`, `describeMissing(asset)`.
- `findRelinkCandidates(missing,pickedFiles)`: ranked name/size/duration/resolution
  matches, excluding a different media kind. Returns score and matched field names.
- `relink(asset,file)`: pure replacement Asset with the **same ID and display name**.
- `batchRelink(missingAssets,pickedFiles)`: pure proposals; ties report AMBIGUOUS,
  no match reports NO_MATCH. Proposals are not auto-committed.
- `prepareRelink(file,store,{signal?,probe?})`: inspect/fingerprint/write replacement
  bytes to a new content key before committing a reference. Leaves original bytes.

## Details panel fields

| Field                      | Meaning / units                                                                 |
| -------------------------- | ------------------------------------------------------------------------------- |
| kind                       | image, audio or video                                                           |
| container                  | Demuxer's MIME container name, or image MIME; null if unknown                   |
| videoCodec / audioCodec    | Demuxed codec IDs; null if absent/unknown                                       |
| width / height             | Display dimensions after aspect/rotation, pixels                                |
| rotation                   | Video rotation metadata, clockwise degrees; null if unknown/image               |
| fps                        | Estimated intended frame rate from sampled packets; null if unknown             |
| isVariableFrameRate        | Sampled timing variability; null if unavailable                                 |
| durationSec                | Media timeline duration, seconds; null for images                               |
| audioChannels / sampleRate | Audio channel count / Hz; null if absent                                        |
| bitrate                    | Estimated **whole-file** bits per duration second, including container overhead |
| hasAudio / sizeBytes       | Audio track present / exact input Blob byte size                                |

Show null as Unknown, not zero. FPS/VFR uses at most the demuxer's target of 256
packets: later changes may not be detected. Very short files can have unknown
metrics. This does not re-encode media or rewrite timestamps. Export's existing
samplesAtTimestamps selects source frames for the CFR output clock. Native forward
preview remains timestamp-based, preserving audio sync rather than stretching VFR.
The .001 s compatibility nudge can cross extremely short frame intervals; no
high-frame-rate boundary precision claim is made.

The default importer now adds details under `asset.metadata.mediaProbe` for video
and audio and preserves readable probe failure reasons. Existing dimensions/duration
and legacy imports without details still work. No project schema change/version
bump/migration. Raster images are inspected with createImageBitmap and orientation
metadata; SVG/platform image-format support depends on that API. The existing
legacy image importer still uses HTML image decode and does not require this API.

## UI load / relink flow

1. After project load, await media store enumeration. Pass a successful key snapshot
   to detectMissingMedia; do not turn storage-access failure into an empty snapshot.
2. Show missing assets and allow file/folder selection. Inspect picked candidates,
   build RelinkFile descriptors (name, size, MIME, fingerprint, details), and display
   ranked matches/reasons. Filename-only matches are suggestions, not identity proof.
   Use existing mediaFingerprint for hashes; probe candidates before writing bytes.
3. Ask the user to confirm replacements, especially shorter/differently sized media.
   No layer transforms, source trims or keyframes are silently changed to fit it.
4. Await prepareRelink on each chosen file. Call relink(oldAsset,prepared), then the
   existing command `{type:'REPLACE_ASSET',assetId:oldAsset.id,asset:replacement}`.
   For a confirmed folder batch, execute replacements in one existing transaction.
5. Rebuild/dispose cached MediaFrames and AudioDecoder instances after replacement;
   retry() alone only clears missing entries and cannot invalidate an already loaded
   old asset ID. Refresh poster/filmstrip/waveform caches for the new fingerprint.
6. Keep original bytes for undo/recovery; orphan collection is separate. Export
   reads the updated source key. Asset IDs, clips, tracks and keyframes stay intact.

No UI is wired here; load checks require async storage outside the pure core.
Relink's input is a prepared descriptor, not an unstored native File. Never point an
asset at replacement bytes until its store write succeeds. A cancelled write does
not commit a project edit. If cancellation arrives after a successful write, an
unreferenced content blob may remain for later collection.

## Validation and risks

14 unit tests with demux-shaped fixtures/fakes: details mapping, codec error,
abort/cleanup, import metadata, VFR mapping, oriented sample draw, candidate ranking,
missing bytes, ambiguity, preserved old fixture/clip/key data and relink undo.
Typecheck passed. No live network/devices, browser, e2e, full suite or CI polling.
Real phone footage, codecs, Safari/mobile orientation and A/V drift unverified.
WebCodecs capability checks can reject a codec that HTML playback alone supports;
this is deliberate export-readiness validation. VFR sampling is not a whole-file
proof. Worker orientation copies allocate full display canvases (32 megapixel cap)
and may increase export memory. No performance numbers or pixel-parity claims.

Reuses existing Mediabunny 1.59.1 (MPL-2.0), lazy-loaded for inspection; no new
runtime dependency or model. Rotation/sample semantics were checked against the
installed library declarations/source, not inferred from nominal frame dimensions.
