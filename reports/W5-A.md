# Report: Wave 5 part A (W5-A): Export v1 (2026-09-24)

## 1. Summary

The editor can now make a real video file.
- **Where it starts:** **Export** in the top bar opens a dialog.
- **Format:** MP4 (H.264 video, AAC audio) wherever the browser can encode it (Chrome and Edge on Windows and macOS). Otherwise WebM (VP9 and Opus), and the dialog says why.
- **Frames and sound:** the export is frame-exact, and includes the mixed sound in sync.
- **Match with preview:** it looks like the preview.
- **While it runs:** a progress bar shows the time left, and Cancel removes the half-written file.
- **Pre-flight:** media missing from this browser is caught before starting.
- **Still frame:** "Export frame (PNG)" saves the playhead frame.
- **Project JSON:** export moved to the File menu.

This PR (#4) is stacked on PR #3, as you decided.

## 2. Scope and results

| ID      | Result                                    | Evidence                                                                                                                                                                                                       |
| ------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EXP-001 | Verified                                  | `[EXP-001][APP-015][EXP-003][EXP-005] Export writes a frame-exact video file named as asked`: every field, the format explanation, the file name. In the sandbox the file is WebM; in the CI job (Chrome, `REQUIRE_H264=1`) it must be MP4 |
| EXP-002 | Verified                                  | `[EXP-002] progress shows percent, frames and time left; the editor stays responsive; Cancel stops cleanly` (4K export; the longest gap between painted frames stayed under 250 ms; nothing left in OPFS)                     |
| EXP-003 | Verified                                  | Every frame 30..119 of the exported file reads back as its exact source frame; 120 frames in total                                                                                                              |
| EXP-004 | Verified                                  | `[EXP-004] the audio mix is in the file and in sync with the picture`: beep onsets and flash frames within 1/30 s at 1 s and 2 s; the tone is present before 3 s and silence follows                                  |
| EXP-005 | Verified                                  | Mediabunny read-back in Node (codec, size, fps, frame count, duration, audio track), plus the one-off ffmpeg check below (reworded per D-062)                                                                   |
| EXP-006 | Verified                                  | `[EXP-006] presets fill the dialog, and a Shorts export is 1080x1920 with the frame letterboxed` (black bars checked in the decoded frame)                                                                        |
| EXP-007 | Verified                                  | `[EXP-007][EXP-009]`: an exported frame compared with the preview-drawn PNG at the same time, mean pixel difference under 4 of 255; the frame code is identical                                                     |
| EXP-008 | Verified                                  | `[EXP-008] media missing from this browser is listed and blocks the export`                                                                                                                                    |
| EXP-009 | Verified                                  | The PNG is 1280×720 (read from the IHDR chunk) and matches the export                                                                                                                                            |
| APP-015 | Verified                                  | The top-bar **Export** button opens the dialog                                                                                                                                                                  |
| APP-005 | Verified (was Claimed)                    | `[APP-005] project JSON export moved to the File menu and still downloads the project`                                                                                                                           |

## 3. Checks (real output tails)

- `npm run verify`: exit 0.
- Build:
  - main bundle `index-CAmm0mO8.js 297.03 kB │ gzip: 88.59 kB`, up 15.4 kB for the dialog and client (Mediabunny is not in it);
  - worker chunk `worker-BT4im1AB.js 518.56 kB`;
  - `✓ built in 2.39s`.
- Unit and jsdom: `Test Files 21 passed (21)`, `Tests 327 passed (327)` (8 new export-settings tests).
- E2E: `103 passed (2.6m)` = 102 normal passes (7 new) + 1 expected failure (the DEV-006 probe). The export spec ×3: `21 passed`. Browser: Chromium 141.
- Hook: `assert-no-test-hook: OK`. Ledger: `Ledger OK`.

**One-off ffmpeg check (ffmpeg 7.0.2) of files exported in the e2e run:**

```
frame code test.webm   Duration: 00:00:04.00 · Video: vp9 (Profile 0), yuv420p, 1280x720, 30 fps · frame= 120
AV Sync Fixture.webm   Duration: 00:00:04.02 · Video: vp9, 1280x720, 30 fps · Audio: opus, 48000 Hz, stereo · frame= 120
Frame Code Fixture.webm (Shorts, 1 s range)   Duration: 00:00:01.00 · Video: vp9, 1080x1920, 30 fps · frame= 30
```

**CI on the final commit `e6dab64`:** both workflow runs are green ([35961746711](https://github.com/i2rlearning1998/my-codex-video-editor-ai/actions/runs/35961746711) and [35961749987](https://github.com/i2rlearning1998/my-codex-video-editor-ai/actions/runs/35961749987)). Each ran two jobs:

- `verify`, the full `npm run verify` on Linux headless Chromium;
- `export-mp4`, the export tests in Chrome on Windows with MP4 required.

Earlier commits had failed `verify` on Linux with a `blob:` URL `net::ERR_ABORTED` in the EXP-007 test. The cause was the test's in-page decoder abandoning a half-loaded exported file. The test now buffers the whole file before decoding it (commit `e6dab64`); the product code did not change.

**CI `export-mp4` job:** passed; see section 11.

## 4. Try-it script (about 10 minutes, in Chrome)

| #   | Do this                                                                                                     | Expect                                                                                         | ID               | Claude ran it          |
| --- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------- | ---------------------- |
| 1   | Open any project with imported video and sound; click **Export** (top right)                                | The Export dialog; the format line says **MP4 (H.264 video, AAC audio)** in Chrome            | APP-015, EXP-001 | Y (WebM in the sandbox) |
| 2   | Pick **YouTube 1080p**, keep High, click Export                                                             | Progress with percent, frames and time left; then an `.mp4` downloads                         | EXP-002, EXP-006 | Y (WebM)               |
| 3   | Play the file in your normal video player                                                                   | The same picture as the preview, with sound in sync                                           | EXP-004, EXP-007 | Y (measured)           |
| 4   | Export again with **Shorts, Reels and TikTok**                                                              | A 1080×1920 file with black bars above and below a 16:9 project                               | EXP-006          | Y                      |
| 5   | Start a **YouTube 4K** export and press **Cancel**                                                          | "Export cancelled"; nothing downloads                                                         | EXP-002          | Y                      |
| 6   | Put the playhead somewhere, click **Export frame (PNG)**                                                    | A PNG of exactly that frame                                                                   | EXP-009          | Y                      |
| 7   | Open `tests/fixtures/projects/frame-code.json` in a fresh browser profile without importing its video; click Export | A red list naming the missing file; Export is disabled                                   | EXP-008          | Y                      |
| 8   | Menu → **Export project JSON (.json)**                                                                      | `project.json` downloads, as before                                                           | APP-005          | Y                      |

## 5. Deviations from the brief

- **EXP-002 responsiveness:** the brief planned to edit the project name during an export. The dialog is modal, so the proof instead measures that the page keeps painting (the longest gap between painted frames stayed under 250 ms) and that Cancel responds.
- **Closing the dialog cancels the export.** There is no background export yet (W9).

## 6. Decisions made

- D-062: the EXP-005 rewording.
- D-063: the Mediabunny dependency.
- D-064: the export architecture.
- D-065: the CI MP4 job.

## 7. Not tested, known gaps, risks

- **MP4 exports** are proven by the CI job in Chrome on Windows (section 11). They are not proven on macOS, and the sandbox itself proves WebM.
- **Speed:** not measured on the reference machine. 1080p and 4K encode time depends on the hardware encoder.
- **Only the latest export file** is kept in browser storage, and old ones are deleted on the next export. A download interrupted by the browser therefore needs a re-export.
- **Rotation metadata on phone videos** (MED-022) is not applied in export either.
- **GIFs** export as their first frame.
- **Fonts:** EXP-008 checks media only; it cannot check fonts until custom fonts exist (W3).
- Not tested on macOS; Windows only through the CI job.

## 8. Architecture and contract impact

- **New modules:** `src/export/` (settings, mixdown, worker, client) and `src/ui/export-dialog.ts`.
- **Renderer:** `drawComposition` gains `DrawOptions` (`overlays`, `surround`). Additive, and the default behaviour is unchanged.
- **Moved:** `listAudibleClips` moves from the shell to `src/media/audio.ts`, shared by playback and export.
- **Build:** `vite.config.ts` pre-bundles `mediabunny`.
- **Playwright:** honours `PLAYWRIGHT_CHANNEL`.
- **Unchanged:** schema 4 and all frozen contracts.
- **New dependency:** `mediabunny` 1.59.1, MPL-2.0, used unmodified (D-063).

## 9. Ledger and backlog

- **To Verified:** EXP-001 to EXP-009, APP-015 and APP-005. EXP-001 is Verified through the CI MP4 job; see section 11.
- **LCR:** EXP-005 reworded (D-062).

## 10. Git

- Branch `claude/wave-5-export`, PR #4, stacked on PR #3.
- Tag `w5-a` is to be created at merge.

## 11. CI `export-mp4` result

- **Run:** [35961250548](https://github.com/i2rlearning1998/my-codex-video-editor-ai/actions/runs/35961250548), job `export-mp4`.
- **Setup:** `windows-latest`, Google Chrome (`PLAYWRIGHT_CHANNEL=chrome`), `REQUIRE_H264=1`, commit `eeeb22c`. The proof artifact is `export-mp4-proof`.
- **Result:** every test ran and passed on the first attempt, with no retries. In this mode the tests require the format line to say MP4, the files to end in `.mp4`, and the read-back to show `avc` video and `aac` audio.

```
Running 7 tests using 1 worker
  ok 1 … [EXP-001][APP-015][EXP-003][EXP-005] Export writes a frame-exact video file named as asked (6.9s)
  ok 2 … [EXP-002] progress shows percent, frames and time left; … Cancel stops cleanly (2.6s)
  ok 3 … [EXP-006] presets fill the dialog, and a Shorts export is 1080x1920 with the frame letterboxed (3.8s)
  ok 4 … [EXP-007][EXP-009] the exported frames match the preview render; … PNG (3.0s)
  ok 5 … [EXP-004] the audio mix is in the file and in sync with the picture (3.2s)
  ok 6 … [EXP-008] media missing from this browser is listed and blocks the export (1.6s)
  ok 7 … [APP-005] project JSON export moved to the File menu and still downloads the project (968ms)
  7 passed (29.2s)
```

- **What this proves:** MP4 export with frame-exact H.264 video and AAC audio in sync, in real Chrome on Windows.
- **Follow-up (not done here):** the same job pattern could prove MED-003 (MP4, MOV and M4A import), which is still Claimed.

## Owner tick-list

| ID                         | OK / BUG / MISSING / CHANGE | One sentence |
| -------------------------- | --------------------------- | ------------ |
| EXP-001 / APP-015 (MP4)    |                             |              |
| EXP-002                    |                             |              |
| EXP-004 / EXP-007          |                             |              |
| EXP-006                    |                             |              |
| EXP-008 / EXP-009          |                             |              |
| APP-005                    |                             |              |
