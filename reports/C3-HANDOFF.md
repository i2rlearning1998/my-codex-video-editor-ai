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

## Next task: C — audio engine
C–J not started. Do not redo previous C2 speech or thumbnail work. Follow task order,
only task unit tests + typecheck, commit/push after each; no UI/CSS/e2e/CI polling.

Task A validation: 42 speech unit tests passed; typecheck passed both configurations.
Initial test expectations corrected for English metadata and the five TTS engines.

Task B validation: 17 recorder tests passed; typecheck passed both configurations.
Initial track-array typing errors were fixed. WebM duration assertion now checks
actual Segment metadata (same 0.040 s expectation), plus seek index/packet integrity.
