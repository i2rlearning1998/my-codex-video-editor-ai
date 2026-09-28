# Brief W4-B: video and images on the canvas and in playback

Wave: 4, part B of three. Base: PR #3 head `849bd48` (W4-A). End tag: `w4-b` (created at merge). Branch: `claude/wave-2-timeline-clips-mwy1f3` (PR #3), at the owner's request.
Authority: `AGENTS.md`, then this brief, then `docs/FEATURES.md`.

## 1. Goal

Imported video and images are drawn on the canvas, not as placeholders:

- **Scrubbing and stepping** show the exact source frame.
- **Playback** keeps real time, dropping frames rather than slowing down, and shows a buffering indicator when a decoder falls behind.
- **Speed, reverse and freeze frame** finally have a visible effect.
- **Timeline clips** show a filmstrip (video) or a thumbnail (image).

Audio stays silent until W4-C.

## 2. In scope (ledger IDs)

- Canvas and playback: VID-001, VID-002, PB-009.
- Clip time effects, visible: VID-010, VID-011 (P1), VID-012, moved from W6 by the LCR below.
- Images: VID-005, MED-023, MED-024.
- Timeline: TL-046.

## 3. Out of scope

- **Audio of any kind:** PB-010, PB-011, VID-006 and the AUD items. That is W4-C.
- **Codec-dependent items:** MED-021 (VFR) and MED-022 (rotation metadata). Their named fixtures are H.264 MP4s, which the sandbox Chromium cannot decode. They stay Todo; the owner can check them in Chrome.
- **Other media controls:** crop (VID-003), fit modes (VID-004), the inspector media section (INS-016) and animated GIF clips (VID-008). A GIF draws as the browser's animated image, independent of the timeline.
- **Performance targets** measured on the reference machine (PB-012).
- **WebCodecs** (D-005 keeps it for export and frame-accurate decode later). Preview uses `HTMLVideoElement`.

## 4. Ledger Change Requests to apply first

Move VID-010, VID-011 and VID-012 from W6 to W4, with the wording unchanged.

- **Reason:** the owner prioritised a visible effect for speed, reverse and freeze now.
- **Effect:** W6 keeps effects and chroma key.
- **Record:** D-057.

## 5. Contracts, schema and dependencies

- **Schema stays 4.** No new dependencies. No frozen contract changes.
- **Renderer boundary:** the renderer gains an optional, injected read-only `FrameProvider` in `RenderSource`. It asks the provider for a frame and draws it, still with no engine access and no retained scene data.
- **Decoding** lives in `src/media/frames.ts`: one `HTMLVideoElement` per layer and one decoded image per asset.

## 6. Design notes

**Which source frame is shown**

- The render adapter adds a media descriptor to each image or video item: asset id, source time (`clipSourceTime`, which already applies speed, reverse and freeze), speed and reversed.
- Seeks target the source time plus 1 ms, clamped to the last frame. That keeps floating-point rounding from landing on the previous frame.

**When paused**

- The provider seeks each visible video to its exact time.
- While a seek is in progress, the last decoded frame stays on screen, and it is redrawn when `seeked` fires.
- A layer whose media has no bytes, or has not decoded yet, keeps the placeholder look.

**During playback (PB-009)**

- The transport clock is wall-clock time (unchanged). Forward clips play natively at `playbackRate = speed`, and are re-seeked only if they drift more than 0.25 s. That way late frames are dropped rather than played in slow motion.
- Reversed clips seek frame by frame, issuing a new seek only once the previous one finishes. Frames drop when decoding is slow.
- Frozen clips hold one seek.
- Videos that are no longer visible are paused.
- **Buffering indicator:** "Buffering…" shows in the preview while any visible video, during playback, has no current frame (`readyState < HAVE_CURRENT_DATA`) or is seeking for longer than 250 ms. It hides when playback stops.

**Images**

- An image is decoded once per asset from the media store and drawn with `drawImage` at the layer size.
- EXIF orientation and alpha follow the browser's image decoding (MED-023, MED-024).
- Video with alpha (VP9) is drawn with its transparency.

**Filmstrip (TL-046)**

- Each video asset gets a sprite of up to 12 frames, spread evenly across the source, 96×54 each. It is cached in the media store as `strips/<fingerprint>`, like thumbnails.
- A video clip is filled with 96 px tiles. Each tile shows the sprite frame nearest to the source time at that tile's left edge, so speed, reverse and trims are respected.
- An image clip repeats its thumbnail. An audio clip is unchanged (waveforms are MED-019 and W4-C).

**Shared previews**

- Thumbnails and strips come from one `MediaPreviews` service in `src/media`, shared by the Media tab and the timeline. That way nothing is decoded twice.

**Default image duration (VID-005)**

- Stays 5 s on drop. An image clip can be trimmed longer or shorter, because images have no source length limit.

## 7. Steps

1. Write this brief and apply the LCR.
2. Add a frame-code fixture (a 4 s 30 fps WebM whose frame number is drawn as seven binary blocks), plus the `frame-code.json` project fixture built through engine commands.
3. Build the `MediaPreviews` service (move the thumbnail cache out of the Media panel) and the filmstrip sprites.
4. Build the `FrameProvider` in `src/media/frames.ts`, the adapter media descriptor, canvas drawing, the shell wiring (redraw on frame, the buffering indicator, pausing), and the timeline filmstrip.
5. Write Playwright tests that decode the frame-code pixels from the canvas.
6. Update the docs and write the report. Run verify, push and update the PR.

## 8. Required tests

- **VID-001:** stepping frames with the arrow keys and clicking the ruler show exactly the expected source frame. After a split, both halves show continuous frames. After a trim, the new first frame matches the new in point.
- **PB-009:**
  - During playback, the frame on screen tracks the clock within 3 frames, and time advances at real speed.
  - After pausing, the exact frame shows.
  - With a stalled decoder (simulated with an init script), "Buffering…" appears and then clears.
- **VID-010:** at 2× speed, timeline frame k shows source frame 2k, both when paused and during playback.
- **VID-011:** a reversed clip shows descending frames.
- **VID-012:** a frozen clip shows the same frame across the whole clip.
- **VID-002:** a video layer on an overlay track is moved, scaled and rotated on the canvas, and the frame code is read at its new place.
- **VID-005:** a dropped image clip lasts 5 s and can be trimmed longer.
- **MED-023:** the EXIF-6 JPEG imports as 1200×1600, and its top-left pixel matches the upright orientation.
- **MED-024:** the transparent areas of the alpha PNG and the alpha WebM show the composition background, and their opaque centres show the media colour.
- **TL-046:** a video clip shows tiles with differing sprite frames, and an image clip shows its thumbnail.

## 9. Acceptance

- [ ] `npm run verify` exits 0
- [ ] Every in-scope P0 ID is Verified, or listed as not done with a reason
- [ ] Report written, PR #3 updated, working tree clean

## 10. Stop rules

Stop and report if either of these happens:

- frame-exact seeking cannot be proven with `HTMLVideoElement` in Chromium, which would need WebCodecs (a dependency and design decision);
- the renderer would need engine access.
