# C3 P2 media robustness

H: implemented, unit-tested; native browser/media behavior unverified.
Exports: probeMedia, createMediaProbe, MediaProbeError, mediaSeekTime,
normalizeTimestamps, detectVariableFrameRate, mapFrameTimestamp,
rotatedDimensions, rasterizeOrientedSample, detectMissingMedia, describeMissing,
findRelinkCandidates, relink, batchRelink, prepareRelink.

UI must wire: Details fields/unknown states, async missing-byte check after load,
file/folder selection and match review, confirmed REPLACE_ASSET transaction,
media/audio decoder recreation and new fingerprint thumbnail/waveform refresh.
See docs/MEDIA-PROBE-API.md for exact data and steps.

Existing edits: media/probe.ts detailed video/audio probe; media/import.ts metadata
and readable failure reasons; media/frames.ts shared seek helper; export/worker.ts
shared seek and immediate orientation-aware sample rasterization. No core/schema,
UI/CSS/e2e or shared reports/index edits. No migration/version bump.

14 task unit tests passed; typecheck passed. Fakes only, no browser/e2e/full suite/CI.
Reuses Mediabunny 1.59.1 MPL-2.0; no dependency/model added. VFR is sampled (target
256 packets), bitrate estimated. Risks: platform codecs/image support, native phone
rotation and A/V drift unverified; export canvas copy memory; .001 s seek nudge at
extreme frame rates; relink cache refresh requires UI wiring. No measured numbers
or cross-browser pixel-parity claim.
