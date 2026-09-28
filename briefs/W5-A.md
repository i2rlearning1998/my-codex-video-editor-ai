# Brief W5-A: Export v1 (a real video file out)

Wave: 5, part A. Base: PR #3 head `c4b8720` (W4-C). End tag: `w5-a` (created at merge).
Branch: `claude/wave-5-export`, a new PR stacked on PR #3. The PR targets PR #3's branch and is retargeted to `main` once PR #3 merges (owner decision).
Authority: `AGENTS.md`, then this brief, then `docs/FEATURES.md`.

## 1. Goal

The owner clicks **Export**, picks a preset (YouTube, Shorts, Instagram, WhatsApp or custom), and gets a real video file with picture and sound:

- **Format:** MP4 (H.264 + AAC) where the browser can encode it, otherwise WebM (VP9 + Opus).
- **Accuracy:** frame-exact, with the audio in sync, and the same as the preview.
- **Behaviour:** a progress bar with the time left and Cancel. The editor stays usable.
- **Pre-flight:** missing media is caught before the export starts.
- **Still frame:** the current frame can be saved as a PNG.

## 2. In scope (ledger IDs)

- Export: EXP-001 to EXP-009.
- Top bar: APP-015 (the primary Export button opens the Export dialog).

## 3. Out of scope

- **Anything not built yet stays out of the picture:**
  - animation (W5-B), shapes (W5-D), effects and transitions (W6);
  - fonts beyond the current text rendering (W3), so EXP-008 covers media only until fonts can be missing;
  - in/out range markers (TL-038). The export range is typed in as start and end times.
- **Full-feature export (W9):** background export, a queue, hardware-acceleration controls, HDR and other container formats.
- **Streaming decode of very long audio.** The mixdown uses the W4-C decoder, which decodes whole files.

## 4. Ledger Change Requests to apply first

- **Reword EXP-005** to: "Exported files pass container checks in e2e by an independent read-back (codec, resolution, fps, duration, audio); a one-off ffprobe check is recorded in the report".
  - **Reason:** the owner approved Mediabunny read-back instead of a permanent ffprobe dependency.
  - **Record:** D-062.

## 5. Contracts, schema and dependencies

**New runtime dependency: `mediabunny` 1.59.1** (owner-approved).

- **License: MPL-2.0.** That is file-level copyleft. Using it unmodified is fine, but any change to Mediabunny's own files would have to be published under MPL-2.0. We will not modify it.
- **Size:** 10.8 MB unpacked on npm. It is tree-shakable ESM with two type-only dependencies.
- **Bundle cost:** about 507 KB minified (129 KB gzip) for the parts used.
- **Loading:** it loads only inside the export worker (a separate chunk), so the main editor bundle does not grow. The report gives the measured chunk sizes.
- **Alternatives considered:**
  - `mp4-muxer` / `webm-muxer`: Mediabunny's author replaced them with it.
  - A hand-written muxer: too risky.
  - ffmpeg.wasm: about 30 MB, and slow.

**Unchanged:** schema 4 and all frozen contracts.

**Renderer change (additive):** `drawComposition` gains an `overlays` option (default true). Export passes false, so no selection handles or composition border are drawn. The renderer still has no engine access.

**Modules:**

- `src/export/`: settings and presets (pure), the audio mixdown (main thread), the worker, and the main-thread client.
- `src/ui/export-dialog.ts`: the dialog.

**CI (owner-approved):** a new job runs the MP4 export test in real Google Chrome on the GitHub runner, with H.264 required.

## 6. Design notes

**One drawing path**

- Export draws each frame with the same `drawComposition` as the preview, at output resolution. The composition is fitted into the output frame, with black bars if the aspect ratio differs.
- The same text measurer runs on an OffscreenCanvas in the worker, with the same font.

**Frame-accurate decode (D-005)**

- In the worker, Mediabunny demuxes each video file and decodes frames with WebCodecs (`VideoSampleSink`).
- For every output frame, the frame for each layer's `clipSourceTime` is fetched in order. That respects speed, reverse and freeze.
- Images are decoded once with `createImageBitmap`.
- No `HTMLVideoElement` is used, so the output does not depend on playback speed (EXP-003).

**Audio mixdown (EXP-004)**

- On the main thread, an `OfflineAudioContext` (48 kHz stereo) renders the export range.
- It uses the same audible-clip list and `clipSchedule` maths as playback (D-061): mute and solo are respected, and frozen clips are silent.
- The rendered samples are handed to the worker and encoded as AAC (MP4) or Opus (WebM).

**Encoding**

- **Video:** Mediabunny `CanvasSource` from an OffscreenCanvas. Bitrate comes from the quality preset (Low, Medium or High), scaled by pixel count and frame rate.
- **Container:** H.264 + AAC in MP4 when `canEncodeVideo('avc')` and `canEncodeAudio('aac')` both say yes. Otherwise VP9 + Opus in WebM.
- **When MP4 is not possible:** the dialog shows which format will be used and why, so the fallback is never silent.

**Output file**

- Streamed by `StreamTarget` into OPFS (`exports/<id>`), then downloaded, so large exports are not held in memory.
- The OPFS copy is deleted after the download starts.

**Dialog (EXP-001, EXP-006)**

- **Fields:**
  - preset, width × height (even numbers only);
  - frame rate (the composition's rate by default; 24, 25, 30, 50 or 60);
  - quality;
  - range: whole composition, or custom start and end in seconds;
  - format, with an explanation;
  - file name (the project name by default).
- **Presets:**
  - YouTube 1080p 1920×1080, and YouTube 4K 3840×2160;
  - Shorts, Reels and TikTok 1080×1920;
  - Instagram square 1080×1080 and portrait 1080×1350;
  - WhatsApp small 854×480 at low quality;
  - Custom.

**Progress (EXP-002)**

- A percentage, a frame count, and the time left (estimated from the average time per frame).
- Cancel stops the worker, deletes the partial file and shows "Export cancelled".
- The editor stays interactive, because all encoding runs in the worker.

**Pre-flight (EXP-008)**

- Before starting, every asset used in the export range must have its bytes in the media store.
- If any are missing, the dialog lists them by name and Export stays disabled.

**PNG (EXP-009)**

- "Export frame (PNG)" saves the frame at the playhead, at composition size, drawn the same way as the export.

**Top bar (APP-015)**

- The top-bar button becomes "Export" and opens the dialog.
- Project JSON export moves to the File menu as "Export project JSON (.json)". It keeps its existing behaviour.

## 7. Steps

1. Apply the LCR and write this brief. Add the dependency.
2. Build the pure export settings, presets, bitrate and frame plan, with unit tests.
3. Add the renderer `overlays` option and the audio mixdown.
4. Build the worker: decode, draw, encode, stream to OPFS, progress and cancel.
5. Build the client, the dialog and the PNG export. Rewire the top bar.
6. Write Playwright tests, and add the CI MP4 job.
7. Update the docs and write the report (including the one-off ffmpeg check). Run verify, push, and open the stacked PR.

## 8. Required tests

- **EXP-001, APP-015:** the Export button opens the dialog with all fields.
  - An export of the frame-code project downloads a file with the chosen name.
  - Where H.264 exists, it is MP4. In the sandbox it is WebM, with the fallback explained in the dialog.
  - With `REQUIRE_H264=1` (the CI job), the test fails unless the file is MP4 H.264 + AAC.
- **EXP-002:** progress shows a percentage, frames and the time left.
  - During the export, the project name can still be edited.
  - Cancel removes the partial file and shows "Export cancelled".
- **EXP-003:** every exported frame of the frame-code clip shows its exact expected number. The file has duration × fps frames.
- **EXP-004:** in an A/V sync export, the beep onsets and the flash frames line up within one frame, and the tone is present before 3 s.
- **EXP-005:** Mediabunny read-back in Node of the downloaded file: codec, resolution, frame rate, duration and audio track.
- **EXP-006:** each preset fills the dialog correctly. A Shorts export reads back as 1080×1920.
- **EXP-007:** sampled frames of the export match preview renders at the same times within a pixel tolerance.
- **EXP-008:** a project whose media bytes are missing lists them and blocks the export.
- **EXP-009:** the PNG has the composition's size and shows the playhead frame's code.

## 9. Acceptance

- [ ] `npm run verify` exits 0
- [ ] Every in-scope P0 ID is Verified, or listed as not done with a reason
- [ ] The CI MP4 job was dispatched on the branch and its result is recorded
- [ ] Report written, stacked PR opened, working tree clean

## 10. Stop rules

Stop and report if any of these happens:

- WebCodecs VP9 encoding or decoding is unavailable in the sandbox worker. This was checked before starting: both are available.
- Export would need a schema change.
- Mediabunny needs to be modified.
