# Audio engine — Task C

## Current state before this change

`src/media/audio.ts` already decoded whole assets at 48 kHz and scheduled clips
with trim, speed, reverse, mute and session solo filtering. `src/audio/graph.ts`
already provided one graph for playback, scrubbing and `src/export/mixdown.ts`:
stereo downmix, EQ, compressor, clip dB keys/fades, panning and normalization.
Ducking used precomputed envelopes. Playback exposed one master RMS debug value;
waveform peaks had a separate media-store cache. There was no master/track volume,
keyframe easing, per-track metering or denoising. Those existing systems are reused.

## Persisted fields and migration

Schema **9**, with an 8→9 migration that changes only the version:

- `project.settings.masterVolume?: number`, linear 0–2, default 1.
- `track.volume?: number`, linear 0–2, default 1.
- Existing `clip.metadata.audio` adds optional `volume` (0–2) and `denoise`
  (`off | low | high`, absent means off).
- Existing `volumeKeys[{time,db}]` accepts optional core `easing`; old keys retain
  their original linear-dB calculation. New keys use `easeProgress`, including
  hold and cubic easing. Times remain clip-local seconds.

The strict project schema required a version increment. Constructor and explicit
`engine.load` now use the migration registry at the session boundary; ordinary
commands still validate current-version drafts. No missing fields are inserted.
Old fixtures retain identical scene content/default gains, load clears history,
and unsupported future versions are rejected. The audio tests exercise those
paths. No UI, CSS, text rendering or other engine feature was edited.

## Commands, gains and UI wiring

`setMixerVolume(engine, input, label?)` registers the `audio-mixer` capability and
commits one undo step. Input is either `{scope:'master',volume}` or
`{scope:'track',compositionId,trackId,volume}`. Locked tracks reject edits.
`setClipAudio` remains the existing validated clip command; preserve the other
settings when changing volume, denoise or keys. Existing track/clip mute and
session solo continue to filter sound; no duplicate mute/solo fields were added.

`mixedGainAt(clip, localSeconds)` is the pure shared gain function:
master × track × clip linear volume × keyed dB gain × fades × duck envelope.
The unchanged graph retains EQ/compression/pan/normalization. Its existing
200-samples/second gain automation approximation now evaluates the shared curve.
`fadePreset(settings, 'in'|'out'|'both', seconds=0.5)` returns settings to commit
through `setClipAudio`. Existing fades scale when their sum exceeds clip length.
Normalization analysis excludes master/track gain, keeping it a clip measurement.

The UI agent must wire:

1. Project master slider (0–200%) to `setMixerVolume`. On startup/project change,
   call `AudioEngine.setMasterVolume(project.settings.masterVolume ?? 1)`.
2. Pass the **same** project value as `ExportInput.masterVolume` when starting an
   export. Alternatively supply the fourth argument to
   `listAudibleClips(composition, assets, soloIds, masterVolume)` when assembling
   playback/export clips. Default is unity. This UI pass is required: old callers
   do not know the new project field.
3. Track sliders use the track command; `listAudibleClips` reads persisted track
   volume automatically. Clip sliders/keys/fade buttons/denoise selector use the
   existing clip command. Percent display is value × 100; do not convert dB keys
   into linear percentages in storage.
4. Subscribe to `audioEngine.meters.subscribe(listener)`. `sample()` is called by
   the existing playback sync path; UI may also call it on its paint tick.
   Show master and per-track peak/RMS, including clipping above 1. These meters
   measure post-gain sound (track readings include the applied master factor).
5. Show processing errors from `audioEngine.debug.processingError`. Offer disable
   denoise or `retryProcessing()`. Never label a failed denoise as raw playback.

## Meter and analysis API

`AudioMeters` exposes `subscribe`, `sample`, `destination`, `connectMaster`,
`clearTracks`, `dispose`; readings are `{master:{peak,rms},tracks:{[id]:{peak,rms}}}`.
Each track sums through its analyser. Track buses remain until disposal so a
paused transport sync does not cut an in-progress scrub snippet. A UI should only
show IDs present in its current project. `measureLevel(Float32Array)` is pure.

`analyzeClip(blob, bins=1024)` returns `{waveform:Float32Array,peak,rms,durationSec}`.
Waveform values are per-bin maxima across all channels; RMS covers all channels.
`createClipAnalyzer(decode?)` injects decoding for tests. The cache keys immutable
Blob identity plus bin count, shares concurrent work, returns detached arrays and
removes failed entries. A new Blob invalidates the entry. This is a memory cache;
the pre-existing persistent WaveformCache remains unchanged. Limits: 512 MiB input,
1–65,536 bins. Decode errors propagate rather than reporting fabricated silence.

## Local WASM denoise

`denoisePcm(pcm, mode, runnerLoader?, signal?)`, `createBufferDenoiser(loader?)`,
`denoiseBuffer(buffer, mode)`, `loadRnnoise()`, `audioBufferKey(id,mode)` and
`AudioProcessingError` are exported from `src/audio/denoise.ts`.
Both playback and export call `AudioDecoder.decode(assetId,mode)`, sharing a
mode-specific processed buffer. Processing runs on the entire source before
reverse/trim/speed; seeking never restarts a noise model in the middle. Independent
state per channel avoids channel leakage. RNNoise operates on 480-sample 48 kHz
frames in PCM16 amplitude units. One-frame processing delay is compensated, and a
zero-padded tail is flushed. High is wet output; low mixes 50% dry and 50% wet;
off returns the original buffer without loading anything. This improves noise
suppression, not a promise of studio cleanup or restoration.

Pinned runtime: **@shiguredo/rnnoise-wasm 2025.1.5**. Wrapper Apache-2.0;
embedded RNNoise code/model BSD-3-Clause. Measured from the downloaded npm package:
ESM **4,827,304 bytes**, embedded WASM **3,600,944 bytes** (included in the ESM).
No separate voice/model download. SHA-256 of the ESM:
`e6958293a0118bf9860cb2753332f7562531cc987c914552c426cd7d7180a63e`.

`RNNOISE_RUNTIME` is the single version/URL/size/hash record. First use fetches the
pinned jsDelivr file, checks size/hash, then imports the verified Blob module.
The package embeds WASM/model bytes, so processing is local and **audio is never
uploaded**. Nothing is added to the initial bundle or package dependencies.
A first-use network connection, CORS, Blob-module CSP and WASM support are needed;
offline cold start is not supported. Runtime is memoized for the page lifetime;
HTTP caching is browser-controlled. A deployed app can self-host the exact file
by changing the URL while retaining size/hash. Runtime load failures are typed
`DENOISE_UNAVAILABLE`; invalid PCM is `INVALID_AUDIO`, cancellation `ABORTED`.

Sources/licences:

- <https://github.com/shiguredo/rnnoise-wasm/tree/2025.1.5>
- <https://github.com/shiguredo/rnnoise-wasm/blob/develop/LICENSE>
- <https://github.com/xiph/rnnoise/blob/main/COPYING>
- npm tarball `@shiguredo/rnnoise-wasm@2025.1.5`, declarations and package LICENSE
  inspected during implementation. Jitsi's separate WASM-file packaging was
  considered; the single-file module simplifies exact integrity verification.

## Validation and limits

Tests use fake denoiser state, fake Web Audio nodes and PCM fixtures, with no live
network, models, microphone or camera. They check migration/defaults/undo, gains,
easing/fades, waveform caching, peak/RMS, delay/tail/channel handling, and matching
preview/export buffer requests and gain curves. A real OfflineAudioContext test
is present but skipped when the environment lacks that API. No browser audio,
perceptual denoise quality, cross-browser or GPU parity claim is made.

Denoising currently accepts 48 kHz sources up to five minutes. The shared decoder
already decodes at 48 kHz. It processes in short asynchronous batches on the main
thread, not an AudioWorklet/worker; long source preparation can be noticeable.
Decoded and processed buffers are held in memory. Abort is checked between frames;
it cannot interrupt the shared first-load module import. Meter callbacks are not
loudness-standard measurements. Gains above unity can clip at the output device.
