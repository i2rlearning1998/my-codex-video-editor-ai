# Brief W4-C: audio playback, sync, waveforms

Wave: 4, part C of three. Base: PR #3 head `99e0cdf` (W4-B). End tag: `w4-c` (created at merge). Branch: `claude/wave-2-timeline-clips-mwy1f3` (PR #3), at the owner's request.
Authority: `AGENTS.md`, then this brief, then `docs/FEATURES.md`.

## 1. Goal

Audio is heard during playback:

- **What plays:** audio files, the sound of video clips, and detached audio.
- **Sync:** it stays in sync with the picture within one frame.
- **Mute and solo:** track Mute and Solo audibly silence tracks.
- **Scrubbing:** scrubbing plays short snippets.
- **Waveforms:** audio clips and audio cards show waveforms that follow trims.

## 2. In scope (ledger IDs)

- Playback and sync: PB-010, PB-011 (P1), AUD-005.
- Detach and mute/solo: VID-006, AUD-007.
- Waveforms: MED-019, TL-047.

## 3. Out of scope

- **Mixing and processing:** volume, fades, pan, meters, EQ and pitch preservation (AUD-002, AUD-003, AUD-006, AUD-009 to AUD-012). Speed changes shift the pitch, as the browser's native playback-rate does.
- **Voiceover recording and the music library:** AUD-008, AUD-013.
- **Export mixdown:** AUD-015.
- **AUD-004:** it duplicates VID-006 and stays in W7 for "extract" workflows.
- **Streaming decode of very long files.** Audio is decoded whole into memory, and files over 512 MB are skipped with a message (backlog).

## 4. Ledger Change Requests to apply first

Move AUD-005 and AUD-007 from W7 to W4, with the wording unchanged.

- **Reason:** the owner asked for audible playback, detach and mute in W4.
- **Record:** D-060.

## 5. Contracts, schema and dependencies

- **Schema stays 4.** No new dependencies. No contract changes.
- **The Web Audio engine** lives in `src/media/audio.ts`, outside `src/core`.
- **The read-only test hook** gains `getMedia()`, a snapshot of audio and video positions for the sync proof. It stays dev/test-only and does not mutate anything.

## 6. Design notes

**Decoding**

- Each audio-bearing asset is decoded once with `decodeAudioData` (an OfflineAudioContext, so no user gesture is needed) and cached in memory.
- A video asset with no audio track decodes to "silent", with no error.
- A detached audio clip decodes its source video's bytes (`audio-of:<videoAssetId>`, D-048).

**Which clips are audible**

- Clips on audio tracks, and video clips not marked `audioDetached`.
- The clip must be enabled, and its track not muted. When any track is soloed, only soloed tracks play (D-034).
- Frozen clips are silent.

**Scheduling (AUD-005)**

- **When scheduled:** on play, on any seek, on edits and on mute or solo changes, the engine stops all sources and schedules every audible clip from the transport's continuous clock.
- **Per clip:** an `AudioBufferSourceNode` at `playbackRate = speed`. Reversed clips use a reversed copy of the buffer.
- **Latency:** start offsets are advanced by `baseLatency + outputLatency`, so the audible sound matches the picture.
- **Re-anchoring:** if the audio clock and the transport differ by more than 50 ms, the engine reschedules.
- **Stopping:** pausing stops all sources.

**Picture sync (PB-010)**

- The transport clock is exposed as continuous time; the displayed time stays frame-quantised.
- Forward-playing videos are steered toward it by nudging `playbackRate` up to ±20% when they drift by more than half a frame. They are seeked only past 0.25 s (D-058).
- Result: audio and picture agree within one frame once playback has settled (about 0.5 s).

**Scrub snippets (PB-011)**

- When paused and the playhead moves, an 80 ms snippet of every audible clip under the playhead plays, at most one every 80 ms.

**Waveforms (MED-019, TL-047)**

- Peaks are stored at 100 values per second as bytes, cached in the media store as `waves/<fingerprint>`. They are made once per source in the background.
- **Audio cards** draw the waveform instead of the icon.
- **Audio clips** draw their visible source window on a canvas behind the label, one column per pixel through `clipSourceTime`. This follows trims, speed and reverse.
- Colours come from a new token, `--color-waveform`.

**Test hook `getMedia()`**

- `audio.state` and `audio.position`: the transport time now audible, or null.
- `audio.sources`: clip id, track id and rate.
- `audio.level`: the master RMS.
- `audio.snippets` and `audio.lastSnippet`.
- `video`: key, current time, playback rate and paused, per decoder.
- `transport`: the continuous clock.

## 7. Steps

1. Write the brief and apply the LCR.
2. Build the audio module (decode cache, waveform cache, engine), with unit tests for the pure scheduling maths.
3. Wire the shell, timeline, Media panel and frame provider (nudging), and extend the test hook.
4. Add an `av-sync.json` fixture project built through engine commands.
5. Write Playwright tests.
6. Update the docs and write the report. Run verify, push and update the PR.

## 8. Required tests

- **AUD-005:** playing the A/V clip produces master level above silence, and the scheduled source covers the clip. Pausing stops it; seeking and playing again reschedules from the new time.
- **PB-010:** during playback of the A/V WebM twin, after settling, the audible audio position and the video element position agree within one frame (1/30 s) on every sample.
- **VID-006:** after Detach audio, the video clip has no source and the new audio clip does. The level stays audible.
- **AUD-007:**
  - Muting the Audio track removes its source.
  - Soloing the Video track leaves only the video clips' sources.
  - Un-muting restores them.
- **PB-011:** clicking the ruler while paused plays a snippet for the clips under the playhead.
- **MED-019:** the WAV card shows a waveform. It is stored in the media store, and after a reload it is drawn without decoding again.
- **TL-047:** the detached A/V audio clip's waveform shows the beeps at whole seconds. After trimming the start by 0.5 s, the beeps move 40 px left.

## 9. Acceptance

- [ ] `npm run verify` exits 0
- [ ] Every in-scope P0 ID is Verified, or listed as not done with a reason
- [ ] Report written, PR #3 updated, working tree clean

## 10. Stop rules

Stop and report if either of these happens:

- the sandbox browser cannot run an AudioContext at all, so audio could not be proven;
- sync within one frame would need WebCodecs or an AudioWorklet redesign.
