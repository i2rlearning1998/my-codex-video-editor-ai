# Report: T-series (T1 to T7) — drag and drop, timeline drops, layout, Player bar, text, readable UI (2026-10-04)

## 1. Summary

- **Drag and drop works the same way from every source.** Media cards, library cards, shape presets, My Templates and the text box can all be dragged to the canvas or the timeline. Esc cancels a drag, and a drag can no longer get stuck.
- **OS files.** Files dropped from your computer are imported and placed where you drop them.
- **Canvas drops.** While you drag over the canvas, an outline at the item's real size snaps to the canvas centre and edges.
- **Timeline drops follow Clipchamp's rules.** Over another clip, the left third inserts before it, the right third inserts after it, and the middle replaces it. A "+" line makes a new lane, and a lane of another kind refuses. A lane an edit leaves empty disappears in the same undo step.
- **Layout.** The "Timeline" title row is gone; drag the Player bar to resize the timeline. The scene strip is hidden until you open it, and the status row is larger.
- **Player bar.** It has first and last frame and a timecode you can type a time into.
- **Text.** A text box grows line by line while you type and does not jump when you finish. Auto height can be turned off, with a mark when text is clipped.
- **Readable UI.** Text, icons and buttons are larger, both themes meet AA contrast, and the placeholder wordmark "AI-Native" shows across the app.
- **Not done.** The Windows Chrome stuck-drag state never reproduced here, so T1 fixes the three defects found (D-169). Track header toggles are still 20 px wide (backlog).

## 2. Scope and results

| ID                              | Result   | Evidence                                                                           |
| ------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| MED-039, MED-040, MED-041       | Verified | e2e/t1-drag.spec.ts (30-drag soak, repeated after a new project; OS-file overlay) |
| CV-061                          | Verified | e2e/t2-canvas-drop.spec.ts                                                         |
| TL-076 to TL-080                | Verified | e2e/t3-timeline-drop.spec.ts                                                       |
| TL-065, TL-066, TL-067 reworded | Verified | e2e/j8-empty.spec.ts, e2e/j9-drag.spec.ts                                          |
| LAY-048 to LAY-050              | Verified | e2e/t4-layout.spec.ts                                                              |
| TL-081 to TL-083                | Verified | e2e/t5-player.spec.ts (TL-073 updated in e2e/j13-player.spec.ts)                   |
| TXT-042 to TXT-044              | Verified | e2e/t6-text-grow.spec.ts                                                           |
| LAY-051                         | Verified | tests/h2-tokens.test.ts (palette AA, both themes)                                  |
| LAY-052 to LAY-055              | Verified | e2e/t7-readable.spec.ts                                                            |

- In-scope items Verified: 25 of 25.
- Not done, with reason:
  - The track header's toggles keep a 20 px width. A 32 px hit area needs a wider header, which would move every timeline coordinate. Logged in the backlog.

## 3. Checks

- `npm run verify`: exit 0, on commit 3e9c76f.
- Format: clean. Typecheck: clean. Build: `index` JS 782.00 kB (240.04 kB gzip), CSS 128.11 kB, export worker 555.64 kB. The built `index.html` carries the AI-Native title and wordmark.
- Unit and jsdom tests: 406 passed in 38 files.
- E2E tests: 330 passed, 0 failed, in the sandbox's Chromium 141 (no H.264 or AAC; D-030). The test hook is absent from the production build (assert-no-test-hook OK).
- Ledger validation: 626 items, 301 Verified, 12 Claimed, 313 Todo. Ledger OK.
- Two problems turned up in the final full runs and were fixed before the green run:
  - **CV-042:** the Layers list's 320 px cap made T7's taller rows scroll, so a drag across the list missed. The list now uses the panel's height (30e178c).
  - **CV-003 marquee (intermittent from T4 on, 3 of 28 runs):** the strip's `transitionend` listener also caught transitions bubbling from inside the hidden strip and refitted the canvas mid-drag. It now reacts only to the strip's own slide (3e9c76f). Afterwards the CV-003 tests passed 42 of 42.
- CI: checked once after the final push (see the PR).

## 4. Try-it scripts for the owner (per part)

Claude ran every step below through the e2e tests named in section 2; the screenshots are in each test's output folder. Claude did not run them by hand in a browser.

**T1 Drag and drop (about 2 minutes)**

1. Import a picture and a video (Media › Import). Drag the picture card onto the canvas. Expect: a small chip follows the pointer, and the picture lands where you release. (MED-039)
2. Drag the video card onto the timeline at about 3 s. Expect: its clip starts there. (MED-041)
3. Click a Media card once. Expect: it is added at the canvas centre with its clip at the playhead. (MED-041)
4. Start dragging a card, then press Esc. Expect: nothing is added, and the pointer is normal again. (MED-039)
5. Drag a file from your desktop onto the canvas. Expect: a full-window "drop" overlay, then the file is imported and placed where you dropped it, and the overlay goes. (MED-040)
6. Do about 20 mixed drags and clicks from Media, Elements and Text, then File › New project and repeat. Expect: every one works. (MED-039)

**T2 Canvas drop preview (about 1 minute)**

1. Elements › drag the rectangle over the canvas. Expect: a dashed outline at its real size, and the canvas is highlighted. (CV-061)
2. Move near the centre. Expect: the outline snaps, and centre guides show. (CV-061)
3. Release. Expect: the rectangle lands exactly at the outline. One Ctrl+Z removes it. (CV-061)

**T3 Timeline drop rules (about 2 minutes)**

1. Add two rectangles (Elements, click twice). Expect: two lanes. Drag the lower clip into the upper lane, after the first clip. Expect: one lane is left. One Ctrl+Z gives two lanes again. (TL-076)
2. Drag the rounded rectangle over empty time on a lane. Expect: a clip-sized coloured block with the name, a length pill and a vertical line; the lane is not outlined. (TL-077)
3. Drop over the right third of a clip, then over the left third. Expect: after it, then before it, and later clips move right. (TL-078)
4. Drag over the middle of a clip. Expect: a "Replace" label on it; the drop replaces it in one undo step. (TL-078)
5. Drag to the bottom edge of a lane. Expect: a purple line with "+"; the drop makes a new lane. Drag a picture over a text lane. Expect: not-allowed, and nothing happens. (TL-079)
6. Drag a clip onto a "+" line, then off the timeline, and release. Expect: it stays faint while dragged and goes back where it was. (TL-080)

**T4 Layout (about 1 minute)**

1. Expect no "Timeline" title. Drag the Player bar's empty background up. Expect: the timeline grows. Reload. Expect: the height is kept. (LAY-048)
2. Click the filmstrip button left of "Scenes". Expect: the scene strip slides in. Reload. Expect: it stays open. Click again to hide it. (LAY-049)
3. Look at the row under the canvas. Expect: larger icons and text, and every control still there. (LAY-050)

**T5 Player bar (about 1 minute)**

1. Expect: Split, Duplicate and + Marker on the left; seven playback buttons in the centre, Play the largest; zoom, fit and collapse on the right. (TL-081)
2. Click Last frame, then First frame. Expect: the playhead jumps to the scene's end, then its start. (TL-082)
3. Click the timecode, type 0:04.5 and press Enter. Expect: the playhead moves to 4.5 s, and the timecode reads 0:04 / 0:10. (TL-082)
4. Ctrl+K › "Stop". Expect: playback stops and the playhead goes to the start. (TL-083)

**T6 Text (about 1 minute)**

1. Text › Add a text box, then type five lines with Enter. Expect: the selection box grows with every line. (TXT-042)
2. Press Esc. Expect: nothing moves. (TXT-042)
3. Type a long sentence in a text box. Expect: it wraps and the box keeps its width. (TXT-043)
4. Spacing › turn Auto height off, then add lines. Expect: the box keeps its height, and a small "…" badge marks the clipped text. Turn it on again. Expect: the box grows to fit. (TXT-044)

**T7 Readable, branded UI (about 1 minute)**

1. Reload. Expect: "AI-Native" on the loading screen and in the top bar. (LAY-053)
2. Switch between dark and light. Expect: all text is readable on every panel. (LAY-051, LAY-052)
3. Hover and select clips, drag a selection box on the canvas, and hover a gap. Expect: each state is clearly visible in both themes. (LAY-054)
4. Narrow the window to tablet width. Expect: no sideways scrolling, and the Player bar still fits. (LAY-055)

## 5. Deviations from the brief

- **T3 moves.** A plain move of one clip keeps the earlier move behaviour: the grab offset, the frame grid, snapping and the push preview. The new rules (the "+" line, Replace, refused lanes) take over only when the pointer is on those targets. Several clips or linked clips move as before. (D-171)
- **T5 timecode.** It shows whole seconds, as the brief's "0:00 / 0:10" does. The field you type into accepts hundredths.
- **T5 Marker label.** It stays "+ Marker", so existing tests and habits still find it.
- **T7 exceptions.** Number-field step arrows, the playhead handle, the track toggles and the clips (at least 28 px, from T3) are allowed under 32 px. The reasons are written in the scan test.

## 6. Decisions made

D-169 (T1), D-170 (T2), D-171 (T3), D-172 (T4), D-173 (T5), D-174 (T6) and D-175 (T7), in docs/DECISIONS.md.

## 7. Not tested, known gaps, risks

- **Stuck drag on Windows Chrome.** The owner's stuck-drag state was never reproduced in the sandbox Chromium. The three defects found are fixed, and the 30-drag soak passes.
- **Tested browser only.** The e2e browser is the sandbox's Chromium (no H.264 or AAC). Windows Chrome is checked only by the CI `export-mp4` job.
- **Drag ghost appearance** is not measured; only its presence is.
- **Shared HTML5 path.** HTML5 Media drags still exist only for folder drops. The scene strip, the board and the Layers rows keep their own HTML5 reordering (backlog).
- **Text overflow badge.** It is checked through the hook (`textOverflow`), not by reading canvas pixels.
- **Fixed-height text box height.** H stays read-only; turning Auto height off keeps the current height.
- **Known sandbox flakes.** PB-010 (the sandbox-only flake noted in STATUS). HIS-004 can time out under parallel load; it takes about 18 s alone, both before and after T3.

## 8. Architecture and contract impact

- **Schema version change:** none (still 6). New properties are read defensively: `textFixedHeight`.
- **New dependencies:** none.
- **Files added:**
  - `src/ui/drag-controller.ts`, `src/ui/timeline-drop.ts`
  - `src/brand/brand.ts`; `src/brand/icons/index.ts` (moved from `src/ui/icons.ts`, which now re-exports it)
  - e2e specs `t1` to `t7`
- **Contracts touched:** none. The core engine now removes lanes an edit empties (`removeEmptiedLanes`, in the same history entry).

## 9. Ledger and backlog

- **Added:** MED-039 to MED-041, CV-061, TL-076 to TL-083, LAY-048 to LAY-055, TXT-042 to TXT-044.
- **Reworded:** TL-065, TL-066, TL-067.
- **Added to docs/BACKLOG_INBOX.md:** 2 lines.
  - T1: HTML5 reordering in the strip, the board and the Layers rows.
  - T7: the width of the track toggles.

## 10. Git

- Branch: `claude/t-series` (from `claude/j-series`); draft PR #18, stacked on PR #17. Not merged.
- Commits: c001718 (T1), 8dd25b9 (T2), 322639d (T3), 21a132a (T4), accc3d1 (T5), f8175b7 (T6), fcc166c (T7), 30e178c and 3e9c76f (fixes from the final verify).

## Owner tick-list

| ID                 | OK / BUG / MISSING / CHANGE | One sentence |
| ------------------ | --------------------------- | ------------ |
| MED-039            |                             |              |
| MED-040            |                             |              |
| MED-041            |                             |              |
| CV-061             |                             |              |
| TL-076             |                             |              |
| TL-077             |                             |              |
| TL-078             |                             |              |
| TL-079             |                             |              |
| TL-080             |                             |              |
| LAY-048            |                             |              |
| LAY-049            |                             |              |
| LAY-050            |                             |              |
| TL-081             |                             |              |
| TL-082             |                             |              |
| TL-083             |                             |              |
| TXT-042            |                             |              |
| TXT-043            |                             |              |
| TXT-044            |                             |              |
| LAY-051 to LAY-055 |                             |              |
