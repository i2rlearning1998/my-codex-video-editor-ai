# Report: U-series (U1 to U6) — free layers, scrubbing, menus, player, right panel, frame panel (2026-10-05)

Short report, as the brief asked (limit mode): what changed, a try-it script and a tick-list per part. Decisions D-176 to D-182 in docs/DECISIONS.md hold the details.

## Checks

- `npm run verify` on the final commit: exit 0 on commit 6689085: 344 e2e tests passed, plus the DEV-006 guard probe failing as designed.
- Unit and jsdom tests: 407 passed (406 + the U5 frame-rate test).
- Ledger: 640 items, 315 Verified, 12 Claimed, 313 Todo; Ledger OK.
- Browser: the sandbox's Chromium 141 (no H.264 or AAC; D-030). No horizontal scrollbar at the seven H viewports in both themes (LAY-013 and LAY-014, dark and light, in the verify run).
- Schema: still 6. One optional composition field was added (`playRange`, U6). A document without it is valid, so no migration step was needed (D-181).
- New npm dependencies: none. PR #14 files were not touched.
- Not tested:
  - Windows Chrome by hand.
  - The thumbnails' motion in the Animate tab: only the animation name is checked.
  - Loop at End (U6): not built, because no loop control exists yet.
- Known sandbox flakes under parallel load: PB-009, PB-010, VID-010 and HIS-004. They pass when run alone.

## U1 Free layers and free drag (D-176)

What changed:
- Lanes keep their own order, so text can sit under a video.
- A dragged clip floats with the pointer and lands on any lane of its kind.
- Replace is offered only for new items from the library or Media.
- Arrange works between any two kinds.
- Lane names read Video 1, Text 1, Shape 1.

Try it:
1. Add a rectangle and a picture. Expect: two lanes, the picture on top. (TL-084)
2. Drag the rectangle's clip up and down. Expect: a copy follows the pointer and the original stays faint. (TL-084)
3. Drop it on the "+" line above the picture's lane. Expect: its lane is now on top, and the rectangle is in front. (TL-084)
4. Drag one clip over the middle of another. Expect: no "Replace"; it goes before or after. (TL-085)
5. Drag a library shape over the middle of a clip. Expect: "Replace". (TL-085)
6. Select the picture and use Send to back and Bring forward. Expect: it passes the rectangle each time. (CV-062)
7. Group two layers and use Bring to front. Expect: the group moves as one. (CV-062)

## U2 Scrubbing and audio (D-177)

What changed:
- Dragging the playhead redraws continuously from a small frame cache.
- Audio sounds only while playing.

Try it:
1. Import a video and add it.
2. Drag the playhead slowly across it. Expect: the picture follows smoothly. (PB-015)
3. Release. Expect: the exact frame. (PB-015)
4. Drag again with sound on. Expect: silence. (PB-011)
5. Press Play. Expect: sound. (PB-011)
6. Step with the arrow keys. Expect: silence. (PB-011)

## U3 Menus and scrolling (D-178)

What changed:
- Only one menu is open at a time.
- Menus scroll, and the wheel over a menu or panel never zooms the canvas.
- Speed and Audio open as flyouts on hover.

Try it:
1. Right-click the canvas, then right-click a clip. Expect: only the clip menu is open. (LAY-056)
2. Scroll the wheel outside it. Expect: it closes. (LAY-056)
3. Open a long menu in a short window and scroll it. Expect: it scrolls, and the canvas does not zoom. (LAY-057)
4. In the Draw panel, Ctrl+wheel. Expect: the canvas does not zoom. (LAY-057)
5. Right-click a video clip and hover Speed. Expect: a flyout beside it. (LAY-058)
6. Choose 2x. Expect: the clip runs at 2x. (LAY-058)
7. With the keyboard, Right opens the flyout and Left closes it. (LAY-058)

## U4 Scene strip, collapse, ratio (D-179)

What changed:
- The thin collapsed strip and its chevron are gone; the button left of Scenes shows or hides the whole strip.
- Collapse leaves one player bar with a full-width scrubber.
- Every ratio change fits the canvas in the view.

Try it:
1. Click the filmstrip button left of Scenes. Expect: the strip slides in. Click it again to hide it. (PRJ-023)
2. Click Collapse. Expect: only the canvas and one bar with the wand, First frame, Back 5 s, Play, Forward 5 s, the timecode, a long slider and Expand. (TL-086)
3. Drag the slider. Expect: the picture follows. (TL-086)
4. Click Expand. Expect: the lanes and the status row come back. (TL-086)
5. Zoom the canvas in, then choose Ratio › 9:16. Expect: the canvas fits the view. (CV-063)
6. Open an empty scene. Expect: no "This composition…" sentence. (CV-063)

## U5 Right panel, Animate, FPS (D-180)

What changed:
- The right rail shows icons with labels.
- Nothing selected shows no Canvas panel.
- The canvas bar has an FPS chip.
- Animate is a right-rail tab of thumbnails.

Try it:
1. Select a text layer. Expect: the right rail shows labels under 24 px icons. (LAY-059)
2. Press Esc. Expect: the right panel says "Nothing selected". (LAY-059)
3. Click the grey stage beside the canvas. Expect: the bar shows Ratio, Background, FPS and Auto captions. (PRJ-027)
4. FPS › 12 fps. Expect: the chip and the status read 12 fps. (PRJ-027)
5. Press Ctrl+Z. Expect: 30 fps again. (PRJ-027)
6. Select the headline and click Animate in the toolbar. Expect: the right panel opens on Animate, with In, Out and Loop. (ANI-023)
7. Look at the presets. Expect: thumbnails, three per row, None first. (ANI-023)
8. Hover Fade. Expect: its square fades. Click it. Expect: it stays highlighted. (ANI-023)

## U6 Frame panel (D-181)

What changed:
- A frame panel at the timeline's bottom right shows Current, Start and End in frames.
- Start and End are the scene's playback and export range.

Try it:
1. Click › beside Current. Expect: the playhead moves one frame. (TL-087)
2. Shift+click it. Expect: ten frames. (TL-087)
3. Type 45 in Current. Expect: 1.5 s at 30 fps. (TL-087)
4. Set Start 30 and End 60. Expect: the ruler dims outside 1 s to 2 s. (PB-016)
5. Press Play. Expect: it starts at 1 s and stops at 2 s. (PB-016)
6. Open Export › More options. Expect: start 1 and end 2. (PB-016)
7. Type Start 75. Expect: refused, because Start must come before End. (PB-016)
8. Press Ctrl+Z twice. Expect: the whole scene again. (PB-016)

## Owner tick-list

| ID                        | OK / BUG / MISSING / CHANGE | One sentence |
| ------------------------- | --------------------------- | ------------ |
| TL-084, TL-085, CV-062    |                             |              |
| PB-015, PB-011            |                             |              |
| LAY-056, LAY-057, LAY-058 |                             |              |
| PRJ-023, TL-086, CV-063   |                             |              |
| LAY-059, PRJ-027, ANI-023 |                             |              |
| TL-087, PB-016            |                             |              |
