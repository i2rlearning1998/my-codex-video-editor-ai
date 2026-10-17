# C3 handoff
Branch `codex/c2-engines`; draft PR #37 targets `claude/r-all`. Never merge.

## Done this run — Task A cloud and integration work
- Sarvam and Google Cloud TTS adapters, fixtures, header keys, API/signup/allowance docs.
- C1 speech registry bridge and typed status/empty-language results; filtered voice lists.
- Long segment caption splitting with explicit approximate timing; exact words preserved.
- IndexedDB model download infrastructure: exact size/SHA verification, offline cache,
  corruption eviction, progress, abort and restart-safe downloads. Fake-only tests.

## Task A partial, local inference deferred to K
Exact blockers from bounded attempt: SpeechT5 example speaker-embedding licence
not verified (raw dataset card retrieval failed); Whisper ONNX metadata endpoint
retrieval failed, so exact pinned artifact hashes were not verified. A matching
lazy browser inference runner is not installed. `models.ts` records candidates and
blockers, empty executable manifests; registry marks both local engines unavailable.
No playable local voice/STT or fake-runner inference proof is claimed. Task K must
try another runtime/model and install verified pinned files plus runner tests.

## Done — Task B recorder
- Capture modes, countdown, pause/resume/stop/discard, typed permission/device errors,
  elapsed/max duration, peak/RMS subscriptions and cleanup with injectable fakes.
- MP4 preference; WebM encoded-packet remux repairs container duration and seek index.
- Prepared Asset/media-store outputs and separate camera+PiP data. API docs provided.
- No live device/browser proof; memory and background timer limitations documented.

## Done — Task C audio engine
- Shared master/track/clip gains, eased volume keys, fade presets, mixer command,
  per-track/master peak/RMS meters and cached waveform analysis.
- Actual lazy RNNoise WASM runtime with pinned size/hash; same mode-specific buffers
  feed playback and export. Fake runner/node tests; no live model tests.
- Schema 9 adds optional unity-default master/track volume; 8→9 migration and old
  fixture/session-load regression tests. UI must pass persisted master to playback
  and ExportInput.masterVolume (see AUDIO-API.md); UI files were not edited.
- Runtime is first-use CDN-loaded then runs locally. Main-thread batches, five-minute
  denoise source limit, cold-offline/CSP/Safari risks documented; no quality claim.

## Done — Task D text engine
- 62-family catalog, injectable Google Fonts CSS2 loader, IndexedDB binary cache,
  offline states and FontFace registration; export loads the same cached faces.
- Opt-in direction/list/table layout in existing text properties, shared render
  hook, cluster-safe wrapping, table cell handles, validated property constructor.
- Legacy path/schema unchanged. Fake font/metrics/drawing tests; real browser font
  shaping, glyph coverage, Safari worker support and UI wiring remain unverified.
- See docs/TEXT-ENGINE-API.md for limits: structured layout does not combine rich
  runs; cell addresses are provided, individual cell animation tracks are not.

## Next task: E — masks
E–J not started. Do not redo previous C2 speech or thumbnail work. Follow task order,
only task unit tests + typecheck, commit/push after each; no UI/CSS/e2e/CI polling.

Task A validation: 42 speech unit tests passed; typecheck passed both configurations.
Initial test expectations corrected for English metadata and the five TTS engines.

Task B validation: 17 recorder tests passed; typecheck passed both configurations.
Initial track-array typing errors were fixed. WebM duration assertion now checks
actual Segment metadata (same 0.040 s expectation), plus seek index/packet integrity.

Validation for Task C: focused audio unit tests: 18 passed, 1 skipped across 5 files. The skipped test requires OfflineAudioContext, unavailable in Node. `npm run typecheck` passed. No browser, e2e, full-suite or CI run was performed.

Task D validation: `npx vitest run tests/text-engine`: 18 passed (3 files). `npm run typecheck` passed both configurations after correcting a test fixture type. No live network in tests, no e2e/full suite/CI polling.
