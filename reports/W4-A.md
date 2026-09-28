# Report: Wave 4 part A (W4-A): media import, browser media storage, thumbnails (2026-09-24)

This report also covers two owner-authorized fixes made just before W4-A on the same branch: CV-022 (group click and double-click, D-050) and CV-008 (Alt resize-from-center, interaction contract revision 4, D-051).

## 1. Summary

You can now bring your own media into a project:
- Click **Import**, or drop video, audio and image files anywhere on the editor.
- Each file appears as a card in the **Media** tab, with a thumbnail, its name and its length (or "Image"). A progress row shows the file being imported, and **Cancel** stops it cleanly.
- Files are kept in the browser's own storage (OPFS, or IndexedDB if OPFS is unavailable), so they are still there after a reload. The project file stores only references.
- A card can be dragged onto a timeline track to create a clip at the drop time, or onto the canvas to place a layer centred where you drop it.

Two bugs are fixed:
- **MED-035:** the Media tab now shows the cards.
- **TL-017:** dragging several clips to another track now keeps their track offsets.

**What you will not see yet:** the actual picture or sound of imported media on the canvas or in playback. That is W4-B (video and images) and W4-C (audio). Imported layers still draw as placeholders.

## 2. Scope and results

| ID                      | Result                  | Evidence                                                                                                                                                                                                                                                        |
| ----------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEV-008                 | Verified                | Unit tests `[DEV-008] media fixture pack` (manifest byte check; `media-example.json` rebuilt through engine commands). E2E `[DEV-008] the media fixture project resolves its references once its files are imported`                                            |
| MED-001                 | Verified                | `[MED-001][MED-007][MED-018] Import button adds video, audio and image cards with thumbnails and badges`                                                                                                                                                         |
| MED-002                 | Verified                | `[MED-002] dropping files from the OS imports them and opens Project Media`                                                                                                                                                                                      |
| MED-003                 | **Claimed**             | `[MED-003] every browser-decodable format imports; other files get a clear message` proves WebM (VP9, with alpha), MP3, WAV, OGG, PNG, JPG, WebP, GIF and SVG, and the messages. MP4 (H.264), MOV and M4A are unproven: the sandbox Chromium cannot decode them (D-056) |
| MED-004                 | Verified                | `[MED-004] import shows progress and Cancel leaves nothing behind` (the disk is slowed with an init script)                                                                                                                                                      |
| MED-006                 | Verified                | `[MED-006][MED-018] imported media and thumbnails survive a reload; the project keeps references only`, `[MED-006] without OPFS the media store falls back to IndexedDB and still survives a reload`                                                              |
| MED-007                 | Verified                | MED-001 test (thumbnail, name, `00:02` / `00:03` / `Image` badges, audio icon)                                                                                                                                                                                   |
| MED-009                 | Verified                | `[MED-009] the search box filters media cards by name`                                                                                                                                                                                                           |
| MED-013, MED-014        | Verified                | `[MED-013][MED-014] dragging an imported card onto a track creates a clip at the drop time` (includes the incompatible-track and locked-track refusals)                                                                                                           |
| MED-015                 | Verified                | `[MED-015] dragging an imported image onto the canvas centres a layer on the drop point`                                                                                                                                                                         |
| MED-018                 | Verified                | MED-001 and MED-006 tests: thumbnails are made in the background and stored; after a reload no thumbnail is encoded again (counted with an init script)                                                                                                          |
| MED-035                 | Verified (was Bug)      | `[MED-035] the Media tab lists the project media cards and other tabs do not` (the old `test.fail` was removed)                                                                                                                                                  |
| TL-017                  | Verified (was Bug)      | `[TL-017] multi-selected clips dragged to another track keep their track offsets` (was a `test.fail`), plus a ghost-per-track check and the impossible-shift case                                                                                                 |
| CV-022 (pre-W4)         | Verified (was Bug)      | `[CV-022] clicking inside a group selects the group; double-click selects the child; Esc exits`                                                                                                                                                                  |
| CV-008 (pre-W4)         | Verified (was Bug)      | `[CV-008] Alt+edge and Alt+corner drags resize from the center`, and `[CV-008]` unit tests                                                                                                                                                                       |

- In-scope W4-A P0 items Verified: 12 of 13. MED-003 is Claimed (reason above).
- Known product bugs left in the ledger: **none**. The only expected failure is the DEV-006 guard probe.

## 3. Checks (real output tails; the full log was `/tmp/claude-0/v.log`, not committed)

- `npm run verify`: exit 0.
- Prettier, typecheck and build are clean: `dist/assets/index-DviJXQAb.js 264.49 kB │ gzip: 77.97 kB`, `✓ built in 863ms`.
- Unit and jsdom: `Test Files 20 passed (20)`, `Tests 316 passed (316)` = 175 unit (11 new: 6 media, 5 CV-008 maths) + 141 jsdom.
- E2E: `79 passed (1.8m)` = 78 normal passes + 1 expected failure (the DEV-006 probe). 12 of the passes are new (11 media, plus the TL-017 track test).
  - Browser: Chromium 141 (fallback, D-030).
  - The media and risky specs were also run with `--repeat-each=3`: `63 passed`.
- Hook: `assert-no-test-hook: OK`.
- Ledger: `Ledger: 495 items | Verified 93 | Claimed 11 | Todo 391`, `Ledger OK`.
- CI: GitHub Actions still runs only when started by hand. This push was not dispatched.

## 4. Try-it script (about 10 minutes; use the files in `tests/fixtures/media`)

| #   | Do this                                                                                                   | Expect                                                                                          | ID                | Claude ran it       | Screenshot                                   |
| --- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------- | ------------------- | -------------------------------------------- |
| 1   | Click **Media** in the left rail                                                                          | "No media yet" with a hint to import or drop                                                    | MED-007           | Y (automated)       | —                                            |
| 2   | Click **Import** and choose `video_testsrc_720p_2s_vp9_opus.webm`, `audio_tone_440hz_3s.wav` and `image_gradient_1920x1080.png` | Three cards: a colour-bar thumbnail with `00:02`, an audio icon with `00:03`, and a gradient with "Image"; an "Imported 3 files" toast | MED-001, MED-007, MED-018 | Y | `…MED-001*/media-tab.png` |
| 3   | Import `video_testsrc_1080p_2s_h264_aac.mp4`, `video_testsrc_360p_2s_h264.mov` and `audio_tone_440hz_3s.m4a` in **Chrome** | Three more cards with durations. **Not verifiable in the sandbox**, so please check this one        | MED-003           | N (no H.264 or AAC) | —                                            |
| 4   | Import `not_media.txt` and `corrupt_random_bytes.mp4`                                                     | Two red messages that explain why; no new cards                                                 | MED-003           | Y                   | —                                            |
| 5   | Drag two or three files from your file manager onto the canvas                                            | "Drop files to import…" overlay, then new cards, and the Media tab opens                         | MED-002           | Y (synthetic drop)  | —                                            |
| 6   | Import the same PNG again                                                                                 | "…is already in Project Media"; no second card                                                  | MED-002           | Y                   | —                                            |
| 7   | Type `tone` in the search box, then clear it                                                              | Only the audio card remains, then all cards come back                                           | MED-009           | Y                   | —                                            |
| 8   | Reload the page (F5) and open Media                                                                       | Same cards, thumbnails appear straight away                                                     | MED-006, MED-018  | Y                   | —                                            |
| 9   | Import a large video (a few hundred MB) and click **Cancel** during the progress                          | The progress row disappears, "Import cancelled", no new card                                    | MED-004           | Y (simulated slow disk) | —                                        |
| 10  | Open `nle-example.json`, then drag the WebM card onto the empty Video 3 track at about 1 s               | A clip appears at about 1 s, lasting 2 s                                                        | MED-013           | Y                   | —                                            |
| 11  | Drag the WAV card onto Video 2; lock Video 3 and drag the WebM card onto it                               | Two red messages: "not compatible" and "is locked"                                              | MED-014           | Y                   | —                                            |
| 12  | Drag the gradient PNG onto the middle of the canvas                                                       | A layer centred where you dropped it, scaled to fit the frame (it draws as a placeholder until W4-B) | MED-015           | Y                   | —                                            |
| 13  | In `nle-example.json`, select clip-a and clip-c, then drag clip-a down one track                          | Two ghosts; clip-a lands on Video 2 and clip-c on Video 3                                       | TL-017            | Y                   | `…TL-017*/two-ghosts.png`                    |
| 14  | In the example, click the lime card, double-click it twice, then press Esc three times                    | "Card arrangement", then "Front card", then an inner layer; Esc steps back out and deselects    | CV-022            | Y                   | `…CV-022*/group-isolation.png`               |
| 15  | Select the "New perspectives" badge and Alt-drag its right edge                                           | It grows on both sides around its centre                                                        | CV-008            | Y                   | `…CV-008*/alt-center.png`                    |

## 5. Deviations from the brief

- **Cancel semantics:** the brief first said a cancelled batch adds nothing. The implementation, and the corrected brief, keep files that finished before the cancel, because each file is its own undo step. The file being written is removed.
- **Duplicate import restores bytes:** re-importing a file that the project already references (but this browser lacks) stores its bytes without adding an asset. This is what makes the DEV-008 fixture project usable after opening it on a fresh browser. It is not the full Relink flow (MED-020).
- **Media element preload:** probing uses `preload='auto'` rather than `'metadata'` (D-056).

## 6. Decisions made

- D-050: CV-022 group picking.
- D-051: CV-008 and interaction contract revision 4.
- D-052: media storage.
- D-053: the imperative UI, not React.
- D-054: the TL-017 rule.
- D-055: the fixture pack.
- D-056: MED-003 status and preload.

## 7. Not tested, known gaps, risks

- **MP4 (H.264), MOV and M4A** were not imported in any automated test (no decoder in the sandbox Chromium). Real Chrome and Edge include these codecs; try-it step 3 covers them.
- **Multi-GB files (MED-005):** import is written to stream, and the fingerprint reads only 3 MiB. No large-file test exists, and memory use was not measured, so MED-005 stays Todo.
- **Real OS drag and drop** was simulated with dispatched drop events that carry real `File` objects. Playwright cannot drag from the desktop.
- **Orphaned bytes:** media bytes are never deleted (no asset delete yet), so storage grows with every distinct import. This is in the backlog.
- **Thumbnail quality:** the thumbnail is a single frame near 10% of the video. Rotated videos and EXIF-rotated photos use the browser's orientation handling, which was not checked (MED-022 and MED-023 are W4 Todo).
- **Missing media:** a project opened on another browser shows its cards without thumbnails and without a "missing" badge (MED-020).
- Not tested in Chrome, in Edge or on Windows. The Alt key on Windows may briefly focus the browser menu after an Alt-drag, which was not checked.

## 8. Architecture and contract impact

- **New module `src/media`** (store, fingerprint, probe, import) and **new UI file `src/ui/media-panel.ts`**. `src/core` is unchanged apart from the CV-008 `resizeTransform` option.
- **Schema stays 4.** No new dependencies.
- **Contract:** `TRANSFORM_INTERACTION_CONTRACT.md` is now revision 4 (Alt-from-center, and group picking recorded). `TRANSFORM_CONTRACT.md` gets a pointer note only.
- **Files added:**
  - `briefs/W4-A.md`, `reports/W4-A.md`
  - `src/media/*`, `src/ui/media-panel.ts`
  - `scripts/make-media-fixtures.sh`
  - `tests/fixtures/media/*`, `tests/fixtures/projects/media-example.json`
  - `tests/media.test.ts`, `e2e/media-import.spec.ts`
- **Removed:** `e2e/known-bugs.spec.ts` (its MED-035 reproduction is now a passing test).

## 9. Ledger and backlog

- **To Verified:** DEV-008, MED-001, MED-002, MED-004, MED-006, MED-007, MED-009, MED-013, MED-014, MED-015, MED-018, MED-035, TL-017, CV-022 and CV-008.
- **To Claimed:** MED-003.
- No LCR.
- **Backlog:** 5 lines (orphaned bytes, place-on-drop, missing badge, import queue, and the resolved-items note).

## 10. Git

- Branch: `claude/wave-2-timeline-clips-mwy1f3` (PR #3), continuing as the owner asked. This session may push only to that branch.
- Tag: `w4-a` is to be created at merge.

## Owner tick-list

| ID                                   | OK / BUG / MISSING / CHANGE | One sentence |
| ------------------------------------ | --------------------------- | ------------ |
| MED-001 / MED-007 / MED-018          |                             |              |
| MED-002                              |                             |              |
| MED-003 (MP4, MOV, M4A in Chrome)    |                             |              |
| MED-004                              |                             |              |
| MED-006                              |                             |              |
| MED-009                              |                             |              |
| MED-013 / MED-014 / MED-015          |                             |              |
| TL-017                               |                             |              |
| CV-022 / CV-008                      |                             |              |
