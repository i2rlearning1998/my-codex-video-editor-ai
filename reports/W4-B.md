# Report: Wave 4 part B (W4-B): video and images on the canvas and in playback (2026-09-24)

## 1. Summary

Imported video and images are now drawn on the canvas instead of grey placeholders:
- **Scrubbing and stepping:** clicking the ruler or stepping frames shows exactly the right source frame.
- **Playback:** runs in real time. If the computer cannot decode fast enough, frames are skipped rather than the video slowing down, and a "Buffering…" note appears.
- **Speed, Reverse and Freeze frame** now visibly change the picture.
- **Images:** photos with rotation metadata (EXIF) draw upright, and transparent PNG and WebM files show what is behind them.
- **Timeline:** video clips show a filmstrip, and image clips show their thumbnail.

**Still silent:** audio (including detached audio) arrives in W4-C.

**How this was proven:** a special test video shows its own frame number as white blocks. The browser tests read those blocks back from the canvas pixels, so every "shows frame N" claim is checked against real decoded pixels.

## 2. Scope and results

| ID      | Result   | Evidence                                                                                                                                            |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| VID-001 | Verified | `[VID-001] seeking, frame steps, split and trim show the exact source frame`                                                                        |
| PB-009  | Verified | `[PB-009] playback keeps real time and tracks the clock; paused shows the exact frame; a stalled decoder shows Buffering` (the stall is simulated)   |
| VID-010 | Verified | `[VID-010] a 2x clip shows every second source frame, paused and playing`                                                                           |
| VID-011 | Verified | `[VID-011] a reversed clip shows descending source frames`                                                                                          |
| VID-012 | Verified | `[VID-012] a frozen clip holds the frame under the playhead for its whole length`                                                                   |
| VID-002 | Verified | `[VID-002] a video on an overlay track moves, scales and rotates on the canvas and keeps playing its frames` (see the note in section 7 about rotation) |
| VID-005 | Verified | `[VID-005] a dropped image lasts 5 s and can be trimmed longer`                                                                                     |
| MED-023 | Verified | `[MED-023] an EXIF-rotated photo imports and draws upright`                                                                                         |
| MED-024 | Verified | `[MED-024] PNG and WebM transparency shows the composition behind`                                                                                  |
| TL-046  | Verified | `[TL-046] video clips show a filmstrip and image clips their thumbnail`                                                                             |

- In-scope P0 items Verified: 9 of 9. The P1 item VID-011 is also Verified.

## 3. Checks (real output tails)

- `npm run verify`: exit 0.
- Build: `dist/assets/index-DmeKVf9T.js 271.54 kB │ gzip: 80.27 kB`, `✓ built in 852ms`.
- Unit and jsdom: `Test Files 20 passed (20)`, `Tests 316 passed (316)`. The DEV-008 builder now also rebuilds `frame-code.json`.
- E2E: `89 passed (2.2m)` = 88 normal passes (10 new) + 1 expected failure (the DEV-006 probe). Browser: Chromium 141 (fallback, D-030).
  - The W4-B spec was also run with `--repeat-each=3`: `30 passed`.
- Hook: `assert-no-test-hook: OK`.
- Ledger: `Ledger: 495 items | Verified 103 | Claimed 11 | Todo 381`, `Ledger OK`.

## 4. Try-it script (about 10 minutes)

| #   | Do this                                                                                                            | Expect                                                                                          | ID      | Claude ran it      | Screenshot                                  |
| --- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------- | ------------------ | ------------------------------------------- |
| 1   | Menu → Open project → `tests/fixtures/projects/frame-code.json`, then Media → Import `video_frame_code_320x180_4s.webm` | An "already in Project Media" note; the clip on Video 1 gets a filmstrip                          | TL-046  | Y                  | —                                           |
| 2   | Click the ruler at 1.5 s                                                                                           | Black frame with white blocks (frame 30 = blocks 1 to 4 from the left, counting from 0); no grey placeholder               | VID-001 | Y                  | `…VID-001*/frame-code.png`                  |
| 3   | Click the timeline, press → a few times                                                                            | The block pattern counts up by one each press                                                   | VID-001 | Y                  | —                                           |
| 4   | Press Space; after two seconds press Space again                                                                   | The blocks flicker in real time, then show a steady pattern                                     | PB-009  | Y                  | —                                           |
| 5   | Right-click the clip → Speed → 2×; play                                                                            | The clip is half as long and plays twice as fast                                                | VID-010 | Y                  | —                                           |
| 6   | Undo; right-click → Reverse; scrub                                                                                 | The pattern counts down as you scrub right                                                      | VID-011 | Y                  | —                                           |
| 7   | Undo; put the playhead at 2 s; right-click → Freeze frame; scrub along the clip                                    | The same pattern for the whole clip                                                             | VID-012 | Y                  | —                                           |
| 8   | Import any video of your own (MP4 in Chrome), drag it to a track and play                                          | Real picture, in sync with the playhead                                                         | PB-009  | N (no H.264 here)  | —                                           |
| 9   | Drag the clip to Video 2, then move, scale and rotate it on the canvas                                             | The video keeps showing its frames at the new place and angle                                   | VID-002 | Y                  | `…VID-002*/picture-in-picture.png`          |
| 10  | Import `image_exif_orientation6_1600x1200.jpg` and drop it on the canvas                                           | A portrait image with the red block at top right                                                | MED-023 | Y                  | —                                           |
| 11  | Import `image_alpha_logo_512.png` and `video_alpha_circle_vp9.webm`, and drop both on the canvas                   | An indigo disc and a red circle with the cream background around them, no black boxes           | MED-024 | Y                  | `…MED-024*/alpha.png`                       |
| 12  | Drop an image card on a track; drag its right edge                                                                 | The clip starts at 5 s long and grows as you drag                                               | VID-005 | Y                  | `…TL-046*/filmstrip.png`                    |

## 5. Deviations from the brief

- **VID-002 rotation:** the move and the proportional scale are canvas gestures, but the 15° rotation is typed into the Inspector's Rotation field. Canvas rotation with the round handle is the same code path proven by CV-009 for every layer type.
- **PB-009 buffering proof:** a stalled decoder is simulated by overriding `HTMLMediaElement.readyState` in the page. A real slow decoder cannot be produced reliably in CI.

## 6. Decisions made

- D-057: the LCR moving VID-010, VID-011 and VID-012 to W4.
- D-058: the frame provider and playback sync.
- D-059: shared previews and the filmstrip.

## 7. Not tested, known gaps, risks

- **H.264 and HEVC** playback (most real phone and camera footage) was not tested; the sandbox Chromium cannot decode it. The code path is the same `HTMLVideoElement`, and try-it step 8 covers it.
- **Performance** on 1080p or 4K footage and the reference machine (PB-012) was not measured. Sixteen simultaneous video layers is the decoder cap.
- **Reversed playback** seeks frame by frame. It is correct but can look choppy on long-GOP camera files (backlog).
- **VFR and rotation-metadata videos** (MED-021 and MED-022) are untested (H.264 fixtures) and stay Todo.
- **GIFs** animate on their own clock, not the timeline (VID-008).
- **Audio** is muted everywhere until W4-C.
- Not tested in Chrome, in Edge or on Windows.

## 8. Architecture and contract impact

- **Renderer:** `RenderSource` gains optional `frames` (a read-only `FrameProvider`) and `playing`. `RenderItem` gains an optional `media` request. The renderer still has no engine access.
- **New files:** `src/media/frames.ts` and `src/media/previews.ts`. The Media panel now uses the shared previews.
- **Unchanged:** schema 4, no dependencies, no contract changes.
- **Files added:**
  - `briefs/W4-B.md`, `reports/W4-B.md`
  - `e2e/media-playback.spec.ts`
  - `tests/fixtures/projects/frame-code.json`
  - `tests/fixtures/media/video_frame_code_320x180_4s.webm`
- **Fixture changes:**
  - The EXIF fixture is regenerated with a red-corner pattern so orientation is visible.
  - The gradient PNG now uses a fixed seed, so the pack is reproducible. `media-example.json` was rebuilt accordingly.

## 9. Ledger and backlog

- **To Verified:** VID-001, VID-002, VID-005, VID-010, VID-011, VID-012, PB-009, MED-023, MED-024 and TL-046.
- **LCR:** VID-010, VID-011 and VID-012 move from W6 to W4 (D-057).
- **Backlog:** 3 lines (smooth reverse, the stray legacy empty-state line, GIF timing).

## 10. Git

- Branch: `claude/wave-2-timeline-clips-mwy1f3` (PR #3).
- Tag: `w4-b` is to be created at merge.

## Owner tick-list

| ID                        | OK / BUG / MISSING / CHANGE | One sentence |
| ------------------------- | --------------------------- | ------------ |
| VID-001                   |                             |              |
| PB-009 (incl. your MP4)   |                             |              |
| VID-010 / VID-011 / VID-012 |                           |              |
| VID-002                   |                             |              |
| VID-005                   |                             |              |
| MED-023 / MED-024         |                             |              |
| TL-046                    |                             |              |
