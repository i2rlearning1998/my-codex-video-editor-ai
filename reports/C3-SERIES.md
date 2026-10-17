# C3 series

| Task | Status | APIs / UI wiring |
| --- | --- | --- |
| A Speech | Cloud/registry/captions/cache done; local inference deferred to K | `createSarvam`, `createGoogleCloudTts`, `registerSpeechProviders`, `createSpeechRegistry`, `getSpeechStatus`, `listSpeechVoices`, `createModelLoader`, `createIndexedModelStore`; UI: language/voice/key picker, status reason, Save/import, cancel/progress, approximate caption badge |
| B Recorder | Implemented; unit verified | `startRecording`, `listDevices`, `getPermissionStates`, `selectRecordingMime`, `repairWebM`, `toMediaItem`, `browserRecorderDependencies`; UI: capture/device dialog, permissions, countdown, meter/timer, pause/resume/stop/discard, preview, media-store writes and Asset command, PiP placement |
| C Audio | Not started | Pending |
| D Text | Not started | Pending |
| E Masks | Not started | Pending |
| F Blend | Not started | Pending |
| G Chroma | Not started | Pending |
| H Media | Not started | Pending |
| I Captions/nesting | Not started | Pending |
| J Composition | Not started | Pending |
| K Local retry | Required later | See concrete blockers in handoff |

No UI or schema change; no runtime/model dependency installed. Research-only model
sizes: SpeechT5 selected quantized files approximately 177.8 MB (MIT model; speaker
licence unverified), Whisper tiny approximately 40.8 MB (MIT original, Apache-2.0
conversion card). No hashes invented or model downloads performed. Neither local
engine is available. Byte-cache tests are not inference proof. Provider CORS/CSP,
account billing, actual audio quality and Safari/mobile remain unverified. WebM,
WebGL and render parity are pending tasks, not claims. Signup/pricing sources and
exact UI contracts are in docs/SPEECH-API.md.

Task A validation: 42 speech unit tests passed; typecheck passed both configurations.
Initial test expectations corrected for English metadata and the five TTS engines.

Task B reuses existing Mediabunny 1.59.1 (MPL-2.0), dynamically imported for remux;
no dependency/model added. Fixture repair writes 0.040 s container duration and
preserves Opus packet bytes/timestamps plus Cues. Fake tests do not establish
Safari/mobile behavior. Capture/remux is in memory (200 MiB default cap); background
throttling can delay the 100 ms maximum-duration check. Camera/screen tracks have
separate blobs and layout, not a composited recording. See docs/RECORDER-API.md.

Task B validation: 17 recorder tests passed; typecheck passed both configurations.
Initial track-array typing errors were fixed. WebM duration assertion now checks
actual Segment metadata (same 0.040 s expectation), plus seek index/packet integrity.
