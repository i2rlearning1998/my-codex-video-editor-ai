# C2 handoff

Branch: `codex/c2-engines`, based on `codex/c1-providers`.
Draft PR target: `claude/r-all`. Do not merge.

## Done
- Task 0: initial C1 typecheck passed. Thumbnail preview-frame requests were
  concurrently hashing content before queue insertion, so completion order could
  reorder frames. Requests now enter sequentially. Original assertions retained.
  Ten independent thumbnail runs: 12 passed each, 120 total, zero failures.
- Task 1 partial: typed TTS/STT interfaces using C1 identity, keys and transport;
  ElevenLabs/MiniMax TTS and Deepgram STT with fixtures; sequential speech-to-WAV
  Save helper; PCM encoder/resampler; minimal caption cues; API/current-state docs.
- Speech unit tests: 29 passed (3 files), no live network or real devices.

## Not done
- Task 1 local file-producing English/Hindi TTS and Whisper STT: model/runtime
  selection and actual integration, speaker voice licensing, pinned URL config,
  first-use download/cache/progress/abort, model fake tests, typed registry bridge.
- Tasks 2, 3 and 4: recorder, audio gain/denoise integration, text/font/list/table
  engines have not been started. Existing playback/export/text paths were not edited.
- No UI wiring, browser audio proof, paid calls, downloaded model or quality claim.

## Next
1. Read `docs/SPEECH-API.md`; finish Task 1 before starting the recorder.
   SpeechT5 English and Whisper tiny were researched only. Honor D-214's prior GPL
   constraint; do not silently introduce an eSpeak-based phonemizer. Verify a
   licensed useful speaker embedding and actual supported runtime/model versions.
2. Add injectable local runner, cache and tests. Finish voice/language filtering
   and registry integration. Caption conversion rejects impossible layouts rather
   than fabricating timestamps; consider aligned splitting where needed.
3. Run only speech tests and its end typecheck, commit/push. Then tasks 2, 3, 4 in
   order, with their own tests/typechecks and separate commits/pushes.
4. Continue using the one draft PR; no UI/CSS/e2e edits, CI polling or full verify.

## Publication
Git shell push lacked credentials. GitHub connector tree/commit/update-ref tools
successfully published Task 0; use those for checkpoints if shell auth remains
unavailable. Fetch the published branch to align the local checkout afterward.

Checkpoint typecheck: `npm run typecheck` passed both TS configurations.
