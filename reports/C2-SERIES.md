# C2 series — partial checkpoint

| Task | Status | Verification |
| --- | --- | --- |
| 0 C1 leftovers | Done | Initial `npm run typecheck` passed; thumbnail folder passed ten times, 12 tests each |
| 1 Speech | Partial | `npx vitest run tests/speech`: 29 passed, 3 files |
| 2 Recorder | Not done | Not run |
| 3 Audio | Not done | Not run |
| 4 Text | Not done | Not run |

## Task 0
The flaky thumbnail test exposed asynchronous content-hash completion reordering
preview-frame queue insertion. `getPreviewFrames` now submits sequential frames.
No assertion was weakened. Commit: `a3942bf668f3d09dbd1d7724f40ca9670ec23a52`.

## Speech API and UI wiring
Exports: `createElevenLabs`, `createMiniMax`, `createDeepgram`,
`synthesizeToMedia`, `splitSpeech`, `encodeWav`, `resampleMono`, `browserCodec`,
`toCaptionCues`, `SpeechError`, plus provider/request/result/cue/PCM types.
UI must supply provider/key setup, wire file preview and Save/import, retain
`Asset.metadata.speech`, display synthesis progress/cancel, and convert cues to
text layers. No existing Save button was changed. Browser SpeechSynthesis remains
preview-only and cannot yield exportable audio. No local engine is shipped yet.

## Licence/size/risk findings
No runtime or model dependency was added. SpeechT5 English (MIT model, roughly
177.8 MB selected quantized ONNX files) and Whisper tiny (MIT original weights,
Apache-2.0 conversion card, roughly 40.8 MB selected quantized files) are candidates
only. Sizes are published file sizes, not measured downloads, and exclude runtime.
Piper/eSpeak conflicts with prior D-214 licensing constraints. Hindi local TTS is
not implemented. See `docs/SPEECH-API.md` for source links and remaining work.
Paid adapters use fixture responses only; CORS/CSP, actual decoding, quality,
Safari/mobile and account service compatibility remain unproven. Long segment-only
captions and unsatisfiable cue constraints reject explicitly. No browser/CI proof
was requested or performed for this checkpoint. WebM repair, denoise parity and
font export remain entirely undone with Tasks 2–4.

See `reports/C2-HANDOFF.md` for the ordered continuation plan.

Checkpoint typecheck: `npm run typecheck` passed both TS configurations.
