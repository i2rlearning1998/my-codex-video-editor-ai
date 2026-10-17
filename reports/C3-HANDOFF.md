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

## Next task: B — recorder
C–J not started. Do not redo previous C2 speech or thumbnail work. Follow task order,
only task unit tests + typecheck, commit/push after each; no UI/CSS/e2e/CI polling.

Task A validation: 42 speech unit tests passed; typecheck passed both configurations.
Initial test expectations corrected for English metadata and the five TTS engines.
