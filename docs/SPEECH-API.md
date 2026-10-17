# Speech API — C2 checkpoint

## Current state and scope

The existing free preview in `src/audio/tts/browser.ts` is the browser
`SpeechSynthesis` API. It exposes playback, not audio samples or an audio file.
It cannot supply saved/exported audio through this API. Its `canSave` is false.
`src/audio/tts/fake.ts` generates test tones, not spoken language; the registry
only enables it through the test hook. Neither is a local file-producing TTS
engine. No UI or existing TTS implementation was changed in this checkpoint.

The new `src/speech` module provides paid-adapter contracts and fixture-tested
requests, PCM joining for Save, and caption conversion. **Local TTS/STT model
loading is not implemented.** This is not a completed Task 1 or an offline speech
release. No paid request, model download, real voice or browser audio decode was
run during verification.

## Exports

Import from `src/speech/index.ts`:

- `TtsProvider`, `TtsRequest`, `TtsResult`, `Voice`: `kind: 'speech-tts'`, identity,
  key fields, `listVoices(lang?)`, `synthesize(request)`, optional `estimateCost`.
- `SttProvider`, `SttRequest`, `Transcription`, `WordTiming`: `kind: 'speech-stt'`,
  identity, key fields, languages, `transcribe({blob|url, lang?, signal?})`.
- `SpeechProgress`: phase, completed, total (null when unknown), optional file.
- `createElevenLabs(deps?)`, `createMiniMax(deps?)`, `createDeepgram(deps?)`.
- `PaidDependencies`: injectable fetch, C1 key store, audio codec, clock.
- `synthesizeToMedia(text, opts)`, `splitSpeech(text, maxChars=500)`.
- `encodeWav(audio)`, `resampleMono(audio, rate)`, `browserCodec`, `PcmAudio`,
  `AudioCodec`.
- `toCaptionCues(transcription, options?)`, `CaptionCue`, `CaptionOptions`.
- `SpeechError`, `SpeechErrorCode`: `NOT_AVAILABLE`, `INVALID_INPUT`,
  `MODEL_UNAVAILABLE` (reserved for the unfinished local loader).

Transport errors reuse C1 `ProviderError`: missing/invalid key, rate limit,
network, malformed response and abort. Error text never includes provider response
bodies or keys. The transport enforces a 120-second timeout; `Retry-After` blocks
subsequent calls until its deadline without automatic retry or waiting.

## Providers and keys

Use C1 `setKey(provider.id, 'apiKey', value)`; each adapter declares this key field.
Keys are request headers, never URL parameters. Factories do not make requests.

| Provider   | Implemented request                                 | Authentication            | Notes                                                                                      |
| ---------- | --------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| ElevenLabs | GET `/v1/voices`; POST `/v1/text-to-speech/{voice}` | `xi-api-key`              | `eleven_multilingual_v2`, MP3; speed 0.7–1.2; pitch other than 1 is explicitly unavailable |
| MiniMax    | POST `/v1/get_voice`; POST `/v1/t2a_v2`             | `Authorization: Bearer …` | `speech-2.6-hd`, hex MP3 response; application errors checked even on HTTP 200             |
| Deepgram   | POST `/v1/listen`                                   | `Authorization: Token …`  | Nova-3; blob or URL; English/Hindi; preserves supplied word timestamps                     |

Deepgram was chosen for an explicit word-timestamp response contract and both
requested languages. These are paid adapters, not bundled open-source engines;
provider account terms/pricing apply. Fixtures are representative synthetic
responses shaped after the official documentation, not recordings or live results.
Voice language metadata is retained when provided, otherwise `und`; the optional
language hint does not certify a voice's language or filter the list. No adapter
implements a billing estimate. Abort is supported on synthesize/transcribe, not
the current `listVoices` interface.

Primary protocol references:

- <https://elevenlabs.io/docs/api-reference/text-to-speech/convert>
- <https://platform.minimax.io/docs/api-reference/speech-t2a-http>
- <https://platform.minimax.io/docs/api-reference/voice-management-get>
- <https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded>

## Save and media integration

Call `synthesizeToMedia(text, {provider, voiceId, lang, rate?, pitch?, signal?,
onProgress?, codec?, maxChars?, now?})`. It splits English/Hindi sentence punctuation
and bounded long spans, synthesizes sequentially, decodes each result, then joins
PCM samples into **one** PCM16 WAV. Concatenating MP3/WAV byte streams is not used.
Mixed sample rates/channel counts are rejected; the default decoder normalizes
through a 48 kHz OfflineAudioContext. The output is:

```
{ blob, mime, name, durationSec,
  metadata: { providerId, voiceId, text, createdAt } }
```

Use the normal media-import path to store the blob and copy this metadata into
`Asset.metadata.speech`; existing Asset metadata accepts JSON, so no schema bump
is needed. The UI agent must perform that import and insert/replace the audio
clip. This module does not itself persist media or change existing Save buttons.
Duration is computed from decoded PCM, not guessed from text. Input is limited to
100,000 UTF-16 code units; decoded chunks are capped at 200 MiB. Cancellation is
checked between asynchronous phases. Native decoding cannot be interrupted, but
its result is discarded after cancellation. Joining may introduce a boundary gap
or click if the provider generates such edges; no crossfade is claimed.

## Captions

No dedicated caption/subtitle model was found in the existing source paths.
`CaptionCue` is a new adapter-neutral type: id, start/end seconds, at most two text
lines, original timestamped words for highlighting. UI conversion to text layers
is still required. Defaults: 42 Unicode code points per line, 0.5–6 seconds.
Segment-only input retains segment timing and does not invent word timestamps.
Impossible constraints (oversized word/segment, overlaps, or a minimum duration
that would overlap the next cue) return `INVALID_INPUT`. Long segment-only text
requires alignment before conversion; silent truncation is never used. Code-point
counting is not pixel measurement or full grapheme-aware Hindi layout.

## Local engines: research, not shipped

Repository decision D-214 excludes the Piper/eSpeak GPL route. Browser phonemizer
licensing must be resolved before selecting an alternative; no GPL runtime or
model was added in this checkpoint. These candidates were inspected:

| Candidate                                         | Published licence                              | Published model file sizes (not measured downloads)                                                  | Status                                                                                                        |
| ------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| SpeechT5 English, Xenova ONNX conversion          | Microsoft model MIT                            | quantized encoder 88.4 MB + merged decoder 71.1 MB + postnet/vocoder 18.3 MB, approximately 177.8 MB | Candidate only; licensed speaker embedding, runtime compatibility and audible quality still need verification |
| Whisper tiny multilingual, Xenova ONNX conversion | OpenAI weights MIT; conversion card Apache-2.0 | quantized encoder 10.1 MB + merged decoder 30.7 MB, approximately 40.8 MB                            | Candidate for Hindi/English transcription; not integrated                                                     |

Sizes exclude tokenizer/config files, runtime and working memory. No offline Hindi
TTS is available in the shipped code; this is an implementation gap, not a claim
that no suitable engine exists anywhere. No model files, runtime dependencies,
URL configuration, OPFS/IndexedDB model cache, download progress or worker runner
have been added. These must be completed before local voices appear in the UI.

Research sources:

- <https://huggingface.co/microsoft/speecht5_tts>
- <https://huggingface.co/Xenova/speecht5_tts/tree/main/onnx>
- <https://huggingface.co/Xenova/whisper-tiny/tree/main/onnx>
- <https://github.com/openai/whisper/blob/main/LICENSE>
- <https://huggingface.co/docs/transformers.js/v3.8.1/installation>

## UI contract and extension

Supply a provider instance and enumerate voices on user request. Keep key setup in
C1's masked key UI. Use `synthesize` for a file-backed preview and
`synthesizeToMedia` for Save; display synthesis progress and wire cancel to an
AbortController. Use `transcribe` then `toCaptionCues` for captions. Display typed
errors, keep browser-only preview labelled unsavable, and hide unfinished local
engines. Paid calls send text/audio to the selected provider; cross-origin policy
or CSP can block browser calls and will need a server proxy where necessary.

To add an engine, implement `TtsProvider` or `SttProvider`, reuse C1 keys/errors,
and inject its transport/codec or model runner for tests. A typed speech registry
bridge to C1's stock-oriented registry is still to be added. Nothing auto-registers
or downloads on module import. Browser/Safari/mobile behavior and paid service
compatibility have not been proven by these fixture-only tests.
