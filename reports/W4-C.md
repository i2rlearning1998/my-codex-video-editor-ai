# Report: Wave 4 part C (W4-C): audio playback, sync, waveforms (2026-09-24)

## 1. Summary

The editor now makes sound:
- **Playback:** audio files, the sound of video clips, and detached audio all play, in step with the picture.
- **Mute:** a muted track is silent from the next play. Any edit pauses playback, which is existing behaviour.
- **Solo:** switching Solo on or off changes what you hear immediately, even while playing.
- **Scrubbing:** clicking or dragging the playhead while paused plays a short blip of what is under it.
- **Waveforms:** audio clips show a waveform on the timeline that follows trims, and audio cards in the Media tab show one too.

**How this was proven:**
- A dev/test-only, read-only view (`getMedia()`) reports which clips are sounding, the master level, and the positions of the audio and of each video.
- **Sync:** in the sandbox, audio and picture stayed **13–21 ms** apart. The limit is 33 ms (one frame at 30 fps).
- **What was not checked:** nobody listened. The proof is the scheduled sources, the measured output level and the measured positions.

## 2. Scope and results

| ID      | Result   | Evidence                                                                                                                                                                                         |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AUD-005 | Verified | `[AUD-005] playback sounds every audible clip from the playhead and stops on pause` (sources, master level above silence, silence after pause, reschedule after a seek)                            |
| PB-010  | Verified | `[PB-010] audio and picture stay within one frame during playback`: every sample after 0.6 s is within 1/30 s. It uses the WebM twin of the named MP4 fixture (the sandbox has no H.264 or AAC)    |
| VID-006 | Verified | `[VID-006] detached audio plays from its own clip and the video clip goes silent`                                                                                                                |
| AUD-007 | Verified | `[AUD-007] track mute and solo change what is heard`                                                                                                                                             |
| PB-011  | Verified | `[PB-011] scrubbing a paused playhead plays a short snippet of the clips under it`                                                                                                               |
| MED-019 | Verified | `[MED-019] audio waveforms are made in the background and cached across reloads` (300 bytes stored for 3 s; no decode after a reload)                                                             |
| TL-047  | Verified | `[TL-047] an audio clip draws its waveform and it follows a trim` (the beep columns move 40 px after a 0.5 s trim)                                                                                |

- In-scope items Verified: 7 of 7 (6 P0 + PB-011, which is P1).

## 3. Checks (real output tails)

- `npm run verify`: exit 0.
- Build: `dist/assets/index-CTFaTrA6.js 281.64 kB │ gzip: 83.66 kB`, `✓ built in 812ms`.
- Unit and jsdom: `Test Files 20 passed (20)`, `Tests 319 passed (319)`. The 3 new unit tests cover the scheduling maths and waveform peaks.
- E2E: `96 passed (2.3m)` = 95 normal passes (7 new) + 1 expected failure (the DEV-006 probe). Browser: Chromium 141 (fallback, D-030).
- Hook: `assert-no-test-hook: OK`.
- Ledger: `Ledger: 495 items | Verified 110 | Claimed 11 | Todo 374`, `Ledger OK`.

**Stability:**
- PB-010 **failed in 2 of 3 runs** in my first repeated run. At that point PB-011 also failed, for a reason I found: its throttle dropped a scrub, and it now plays a trailing snippet.
- After that fix, these later runs all passed:
  - the audio spec ×3: `21 passed`;
  - the audio and playback specs ×3: `51 passed`;
  - AUD-005 and PB-010 ×10: `20 passed`;
  - PB-010 ×6 with gap logging: maximum gaps 12.9–20.9 ms.
- I could not reproduce or explain the first two PB-010 failures, so treat PB-010 as the item to watch.

## 4. Try-it script (about 10 minutes; use headphones)

| #   | Do this                                                                                                          | Expect                                                                                | ID      | Claude ran it          |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------- | ---------------------- |
| 1   | Open `tests/fixtures/projects/av-sync.json`; Media → Import `video_av_sync_flash_beep_720p.webm` and `audio_tone_440hz_3s.wav` | Cards appear; the tone card shows a flat waveform                                     | MED-019 | Y                      |
| 2   | Press Play                                                                                                       | A steady tone, plus a beep every second exactly when the picture flashes white        | PB-010, AUD-005 | Y (measured, not heard) |
| 3   | Pause, then click the ruler at 1 s and at 3.5 s                                                                  | A short blip each time                                                                | PB-011  | Y (measured)           |
| 4   | Click Mute on Audio 1 and play                                                                                   | Only the beeps                                                                        | AUD-007 | Y                      |
| 5   | Unmute; while playing, click Solo on Audio 1, then click it again                                                | Only the tone while soloed, both again after                                          | AUD-007 | Y                      |
| 6   | Right-click the video clip → Detach audio; play                                                                  | The beeps still play, now from the new Audio 2 clip; its waveform shows spikes each second | VID-006, TL-047 | Y                |
| 7   | Select that audio clip, put the playhead at 0.5 s and press `[`                                                  | The waveform shifts: the first spike is now 40 px in                                  | TL-047  | Y                      |
| 8   | Import any MP4 with sound in Chrome and play it                                                                  | Sound and picture together                                                            | PB-010  | N (no H.264 or AAC here) |

## 5. Deviations from the brief

- **Mute during playback:** any project edit pauses playback. That is pre-existing session behaviour (`EditorSession` stops on engine changes), so a mute applies from the next play. Solo is session-only and applies live. The brief said changes reschedule while playing; that is true for solo and seeks, not for edits.
- **PB-010 fixture:** proven with `video_av_sync_flash_beep_720p.webm` instead of the MP4 named in the ledger, because of the codec gap. It is marked Verified, because sync does not depend on the codec. Please check try-it step 8 in Chrome; if you want the named file proven, say so and it returns to Claimed.
- **Waveform scaling:** waveforms are normalised to each file's loudest peak, so quiet recordings are still visible.

## 6. Decisions made

- D-060: the LCR moving AUD-005 and AUD-007 to W4.
- D-061: the audio engine, sync steering, snippets and waveforms.

## 7. Not tested, known gaps, risks

- **Nobody listened.** Output level and positions were measured; real loudspeaker output, and latency on your machine, were not.
- **AAC, MP3-in-MP4 and other codec audio** were not tested (only Opus, WAV, MP3 and Vorbis files decode in the sandbox).
- **Memory:** audio is decoded whole. A 1-hour stereo file uses about 1.4 GB of memory, and files over 512 MB are silent (backlog: streaming decode).
- **Pitch:** speed changes shift the pitch (pitch preservation is AUD-010, W7).
- **No mixing controls yet:** volume, fades, pan and meters are W7.
- **Mute during playback** pauses (see section 5).
- Not tested in Chrome, in Edge or on Windows.

## 8. Architecture and contract impact

- **New module `src/media/audio.ts`:**
  - `AudioDecoder`, `WaveformCache` and `AudioEngine`;
  - the pure functions `clipSchedule` and `waveformPeaks`.
- **Playback** exposes a continuous `clock`. The frame provider steers playing videos toward it.
- **Test hook:** gains a read-only `getMedia()` (dev and test builds only; the production-build check still passes).
- **New token** `--color-waveform`.
- **Unchanged:** schema 4, no dependencies, no contract changes.
- **Files added:** `briefs/W4-C.md`, `reports/W4-C.md`, `src/media/audio.ts`, `e2e/media-audio.spec.ts` and `tests/fixtures/projects/av-sync.json`.

## 9. Ledger and backlog

- **To Verified:** AUD-005, AUD-007, PB-010, PB-011, VID-006, MED-019 and TL-047.
- **LCR:** AUD-005 and AUD-007 move from W7 to W4 (D-060).
- **Backlog:** 2 lines (streaming audio decode, and mute applying live without a pause).

## 10. Git

- Branch: `claude/wave-2-timeline-clips-mwy1f3` (PR #3).
- Tag: `w4-c` is to be created at merge.

## Owner tick-list

| ID                      | OK / BUG / MISSING / CHANGE | One sentence |
| ----------------------- | --------------------------- | ------------ |
| AUD-005 / PB-010        |                             |              |
| PB-011                  |                             |              |
| AUD-007                 |                             |              |
| VID-006 / TL-047        |                             |              |
| MED-019                 |                             |              |
| PB-010 with your own MP4 |                            |              |
