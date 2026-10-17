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

## C3 Task A update (2026-10-17; supersedes checkpoint gaps above)

`createSarvam` and `createGoogleCloudTts` now implement the same TTS interface.
Sarvam uses `api-subscription-key`, Bulbul v3, a curated four-speaker catalog in
11 languages, WAV output and a 2,500-character request cap. Pitch is unavailable.
Google uses `x-goog-api-key`, `/v1/voices` and `/v1/text:synthesize`, with LINEAR16
WAV and a 5,000-byte text limit. Pitch is a ratio in our API, converted to Google's
semitones. All new calls have injectable fetch/codec and reuse C1 errors/keys.
These adapters are fixture-tested, not live-account or audio-quality verified.

### Signup and free allowances

| Provider | Free allowance checked 2026-10-17                                                                                                                                                                                          | Key signup                                                                                                                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sarvam   | Signup credits, not a recurring free tier. Current pricing page does not specify a guaranteed numeric credit amount. Bulbul v3 is ₹3/1,000 characters after credits; read the actual balance in the account.               | Create an account at `https://dashboard.sarvam.ai/`, create an API subscription key, store it with `setKey('sarvam','apiKey',value)`. The pricing page also directs account signup to `https://indus.sarvam.ai/`.                               |
| Google   | Standard and WaveNet: up to 4 million characters/month on the current pricing page. Other voice SKUs have different allowances; do not treat every listed voice as free. Billing must be enabled and overages are charged. | Create/select a Google Cloud project, enable billing and Cloud Text-to-Speech API, create an API key in APIs & Services → Credentials, restrict it to that API and the application's origins, then `setKey('google-cloud-tts','apiKey',value)`. |

Sources: [Sarvam REST](https://docs.sarvam.ai/api-reference/text-to-speech/convert),
[Sarvam pricing](https://www.sarvam.ai/api-pricing),
[Google pricing](https://cloud.google.com/text-to-speech/pricing),
[Google setup](https://docs.cloud.google.com/text-to-speech/docs/get-started),
[Google header authentication](https://docs.cloud.google.com/docs/authentication/api-keys-use),
[Google synthesis](https://docs.cloud.google.com/text-to-speech/docs/reference/rest/v1/text/synthesize).

### Registry/status contract

Call `registerSpeechProviders(deps?)` once at startup to bridge seven engines into
C1's shared registry. Use `createSpeechRegistry(deps?, catalog?)` for isolated
instances/tests. `catalog.listByKind` returns five TTS and two STT entries;
`get(id)` returns the typed synthesis/transcription interface. Stock `search` and
`getDownload` explicitly reject for speech entries.
`getSpeechStatus(speechRegistry)` or `speechRegistry.getSpeechStatus()` returns
per-engine `ready`, `needs-key`, `needs-download` (with `sizeBytes`), or `unavailable`
(with reason). Here `ready` means configured, not a successful paid account probe;
`needs-download` is reserved until a verified local runner is installed.
`listVoices(lang)` now filters by language. ElevenLabs uses its supplied language
label, MiniMax recognizes English/Hindi voice-id prefixes; unknown metadata is
excluded from a language-filtered list instead of relabelled. `listSpeechVoices`
wraps an empty list with typed `LANGUAGE_UNAVAILABLE`/`MODEL_UNAVAILABLE` results.
Both default local engines are explicitly **unavailable** and make no requests.

### Bounded local attempt and infrastructure

`models.ts` is the single config: candidate URLs/published approximate sizes,
reviewed manifest type (exact bytes + SHA-256 + licence), and concrete blockers.
No verified file hashes are available in this checkpoint, so executable manifests
are intentionally empty. SHA values were not invented. SpeechT5's example
speaker-embedding licence could not be verified from the retrievable dataset
metadata; fetching its raw card failed. Whisper tiny's ONNX metadata endpoint
also failed to retrieve, preventing verification of exact pinned hashes. Neither
has an installed, validated lazy browser runner. This bounded attempt is deferred
to Task K, per the user's rule. This is not a claim those models are unusable.

`createModelLoader(store?, fetch?)` is implemented now: `load(file, {signal,
onProgress,offline})`, `has(file)`, `ModelStore`, `createIndexedModelStore`.
It downloads on demand, enforces exact size and SHA-256, rechecks cached blobs,
evicts corruption, commits only complete verified blobs atomically in IndexedDB,
and supports abort/progress/offline cache hits. Retry is resume-safe by restarting
an interrupted file; HTTP Range continuation is not implemented. Fixtures verify
corruption, cancellation, restart and cache behavior without model downloads.
No inference runner, playable local voice, model runtime dependency or real model
size measurement is claimed. Task K must add the runner and verified config.

### Updated caption splitting and UI wiring

`toCaptionCues` now splits long segments proportionally by word code-point length
when there are no word timestamps, marking every such cue `approximate: true`
and leaving its highlight words empty. Exact word-aligned input retains original
word timestamps and is not approximate. Impossible single-word duration/layout or
minimum-duration constraints still reject explicitly. Show an approximate-timing
badge; do not animate guessed karaoke timing as aligned speech.

The UI agent must register engines, show key/download/unavailable states, choose
Sarvam/Google for Hindi, display provider billing limits, filter voice pickers,
wire preview/Save/import/cancel, retain media speech metadata and show caption
approximation. No UI, project schema or existing rendering path was changed.
