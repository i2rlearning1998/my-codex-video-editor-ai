# Report: V7 series, Clipchamp clone rev 4 and 5 (V7a to V7h) (2026-10-11)

## 1. Summary

- The right rail is always there; a selection only changes its categories and the panel opens from a rail click (drawer icon closes it). Icons are never under 16 px.
- The timeline has 18 px of padding (the playhead at 0 is whole), an empty project is just a centred drop box, the marquee auto-scroll is bounded, the collapsed player always fits.
- The timeline range is Auto (Clipchamp) or a fixed Manual range that no clip edit changes; export has Start frame / End frame and covers exactly that range.
- The Scene outliner has proper vertical menus, themed 32 px rows, and Duplicate collection keeps its tree.
- Transitions live in one place (the right panel); scenes can have transitions between them, played and exported across the cut.
- Audio: the PR #14 engine is ported; the right Audio panel (Volume, Mute, Pan, EQ, Compressor, Loudness, Voice/Music ducking), sound fades, a 12-sound pack, voiceover recording.
- Not done: a real offline neural text-to-speech voice (Piper needs GPL espeak-ng); browser voices are preview only. Screen and camera recording stays Planned.

## 2. Scope and results

| ID                        | Result                        | Evidence (test title or file)                                                                 |
| ------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------- |
| LAY-063 (reworded, B24 B25) | Verified                    | e2e/v1-shell.spec.ts `[LAY-063] the right rail is always shown…`                              |
| LAY-065 (B26)             | Verified                      | e2e/v1-shell.spec.ts `[LAY-065] no rendered icon is smaller than 16 px…`                      |
| TL-101 to TL-104 (B27 B28 B32 B35) | Verified             | e2e/v7-timeline.spec.ts (TL-104 at 800, 900 and 1080 px)                                      |
| TL-087, TL-097, PB-016 (reworded; B29 B30 B31) | Verified | e2e/u6-frames.spec.ts, e2e/v2-timeline.spec.ts `[TL-097]` (wheel on an unfocused field)       |
| PB-017 (spec 11.1 proof)  | Verified                      | e2e/v7-range.spec.ts; tests/v7-range.test.ts                                                  |
| EXP-020 (spec 11.2 proof) | Verified                      | e2e/export.spec.ts `[EXP-020]` ×2 (30 frames from frame 40; audio 1.000 s for frames 20–50)   |
| LYR-018 (B33 B34)         | Verified                      | e2e/v7-outliner.spec.ts ×2 (menus, Shift+F10, Duplicate tree, Delete keeps pixels, rename ×3) |
| TR-017 (B36)              | Verified                      | e2e/v7-transitions.spec.ts                                                                    |
| TR-018 (B37)              | Verified                      | e2e/v7-transitions.spec.ts (playback darkens at the cut); e2e/export.spec.ts (joined export)  |
| TR-010, TR-015            | Dropped (LCR, D-212)          | the left Transitions category no longer exists; TR-017 proves the features in the right panel |
| AUD-011, AUD-012, AUD-015, AUD-017, AUD-009 | Verified        | e2e/audio-w7.spec.ts (PR #14, ported); tests/audio-*.test.ts; e2e/v7-audio.spec.ts            |
| AUD-002                   | Claimed                       | clip volume and mute work (e2e/v7-audio.spec.ts, export RMS test); master volume and volume keyframes on the timeline are not built |
| AUD-003 (preview == export) | Verified                    | e2e/export.spec.ts `[AUD-002][AUD-003][AUD-015] preview == export…` (Volume 50 %, Fade in 1 s, RMS) |
| AUD-019, AUD-020 (B38)    | Verified                      | e2e/v7-audio.spec.ts                                                                          |
| AUD-021                   | Verified                      | e2e/v7-audio.spec.ts (12 sounds, hover preview, search, click and drag)                       |
| AUD-013                   | Claimed                       | sound effects only; no music library (Stock music is Planned)                                 |
| AUD-008, AUD-022          | Verified                      | e2e/v7-record.spec.ts ×2 (Chromium fake microphone; refusal and Retry; Keep/Discard)          |
| AUD-023                   | Verified (with the test voice provider) | e2e/v7-record.spec.ts (save, unsaved changes / Discard, replace in one step)        |
| Real neural TTS voice     | Not done                      | D-214: Piper needs espeak-ng (GPL-3); no permissive offline engine added                      |

- In-scope P0 items Verified: all named P0 items above except AUD-002 (Claimed, see above).
- Not done, with reason: offline neural voices (GPL, D-214); Screen and camera / Camera / Screen recording (Planned by the spec); master volume, meters, noise suppression, volume keyframe UI (out of scope per spec 11.3); AUD-010 pitch preservation (PR #14 D-208, now D-209).

## 3. Checks (paste the real output tails, not a description)

- `npm run verify`: exit 0 (the second run; the first failed on three tests, fixed in 89edd18: two older tests still named the left Transitions category and the planned scene chip, and the recording meter read 0 between the fake microphone's beeps; it now holds its peak).
- Format: all files pass. Typecheck: pass. Build: built in 4.97 s.
- Unit and jsdom tests: 660 passed in 57 files.
- E2E tests: 397 passed (31.3 min), 0 failed, in Chromium 141.0.7390.37 (sandbox fallback, D-030), one worker.
- Test hook: `assert-no-test-hook: OK (no __AIVE__ in production build)`.
- Ledger validation: `Ledger: 684 items | Verified 367 | Claimed 16 | Todo 299 | Dropped 2` · `Ledger OK`.
- CI: not polled (owner rule).

## 4. Try-it script for the owner (max 15 steps, about 10 minutes)

| #   | Do this                                                                 | Expect                                                                                   | ID              | Claude ran it (Y/N)  | Screenshot |
| --- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------- | -------------------- | ---------- |
| 1   | Open the app; click the headline                                        | The right rail shows its categories; the panel stays closed; click Effects: it opens       | LAY-063         | Y (e2e)              | test output |
| 2   | Click Effects again, then the drawer icon after reopening               | It closes both ways; a click on the empty canvas leaves only Auto Caption                | LAY-063         | Y (e2e)              | test output |
| 3   | New project                                                              | Only a centred drop box in the timeline, nothing scrolls                                 | TL-102          | Y (e2e)              | test output |
| 4   | Example project: drag a marquee down to the lanes' bottom edge and hold  | It scrolls slowly (≤ 300 px/s) and stops when you let go                                 | TL-103          | Y (e2e)              | test output |
| 5   | Frame row: click "Control timeline: Manual mode"; set Start 20, End 150  | Dims before 20 and after 150; move or stretch a clip: Start/End stay                     | PB-017          | Y (e2e)              | test output |
| 6   | Play                                                                    | Starts at 20, stops at 150                                                               | PB-017, PB-016  | Y (e2e)              | test output |
| 7   | Export › More options: Start frame 40, End frame 70                      | Seconds show 1.333 / 2.333; the file has 30 frames                                       | EXP-020         | Y (e2e)              | test output |
| 8   | Scene panel: make a collection, right-click it                           | A vertical menu with icons and shortcuts; Duplicate keeps the nested tree                | LYR-018         | Y (e2e)              | test output |
| 9   | Show the scene strip, add a blank scene, click the "+" between the cards | Fade through black is added; the right Transition panel opens; play across the cut: it fades | TR-018      | Y (e2e)              | test output |
| 10  | Import an audio file, select its clip                                    | The rail is Audio, Fade, Speed; set Volume 50 %, open the groups                          | AUD-019         | Y (e2e)              | test output |
| 11  | Export and listen                                                        | The sound is half as loud and fades in                                                  | AUD-003         | Y (e2e, RMS measured)| test output |
| 12  | Left Audio category: hover Ding, click it                                | It plays on hover; a Ding clip lands at the playhead on a new audio lane                  | AUD-021         | Y (e2e)              | test output |
| 13  | Record & create › Audio › Record                                         | 3-2-1, a moving meter, Stop, review, Add to timeline: "Recording 1"                      | AUD-022         | Y (fake microphone)  | test output |
| 14  | Record & create › Text to speech                                         | The right panel; pick a browser voice: Preview works, Save says "Preview only"            | AUD-023         | N (sandbox has no voices; the fake provider was tested) | none |

## 5. Deviations from the brief

- Text to speech provider 1 (offline neural, Piper via onnxruntime-web) is not shipped: Piper's phonemizer espeak-ng is GPL-3 and the brief forbids GPL (D-214). The interface, the full panel, browser voices (preview only) and a fake test provider are shipped, as the spec allows.
- Scene-to-scene transitions are stored as a reserved marker on the incoming scene (schema 7 has no free composition field; D-199). They play across the cut in the editor while playing (not on a paused frame) and in the joined export.
- The Sound panel's three UI tests from PR #14 were rebuilt against the new right Audio panel (same IDs plus AUD-019); its engine tests were ported unchanged except the schema version (5 → 7).

## 6. Decisions made

D-196 to D-217 in docs/DECISIONS.md. PR #14's decisions were renumbered:

| PR #14 | Here  |
| ------ | ----- |
| D-200  | D-201 |
| D-201  | D-202 |
| D-202  | D-203 |
| D-203  | D-204 |
| D-204  | D-205 |
| D-205  | D-206 |
| D-206  | D-207 |
| D-207  | D-208 |
| D-208  | D-209 |
| D-209  | D-210 |
| D-210  | D-211 |

## 7. Not tested, known gaps, risks

- Real microphones and real speech voices were not tested (sandbox): recording uses Chromium's fake device; text to speech uses the fake provider. Browser voices (speechSynthesis) are untested here; the sandbox has none.
- MP4/H.264 export paths were not run (sandbox Chromium encodes WebM only); the CI job export-mp4 is not run (no CI polling).
- Scene transitions are not drawn on a paused editor frame, only while playing and in the export.
- Moving a scene keeps its incoming transition; the transition then joins it to its new neighbour.
- Known sandbox timing flakes under parallel load (each passes alone): PB-010 (owner decision), PB-009, VID-010, EXP-001, HIS-004, TPL-015 (D-216).
- The sound pack is imported into Media on first use (by design, so it exports).

## 8. Architecture and contract impact

- Schema version change: none (7).
- New dependencies: none.
- Files added: src/audio/* (ported) and src/audio/sound-pack.ts, src/audio/tts/*; src/core/scene-transitions.ts; src/render/scene-transitions.ts; src/ui/record-panel.ts, sound-pack-panel.ts, scene-transition-actions.ts, right-panel/tts-panel.ts (audio-tab.ts rewritten); e2e/v7-*.spec.ts, e2e/audio-w7.spec.ts; tests for range, scene transitions and the ported audio.
- Contracts touched: none. New core helpers only (scene transition markers; SET_COMPOSITION_RANGE gains `auto`).

## 9. Ledger and backlog

- Status changes: LAY-061, LAY-063, TL-087, TL-097, PB-016 reworded; TR-010, TR-015 Dropped; AUD-003, AUD-008, AUD-009, AUD-011, AUD-012, AUD-015, AUD-017 Verified; AUD-002, AUD-013 Claimed.
- LCR applied: LAY-065, TL-101 to TL-104, PB-017, EXP-020, LYR-018, TR-017, TR-018, AUD-019 to AUD-023 added.
- Added to docs/BACKLOG_INBOX.md: 0.

## 10. Git

- Branch: `claude/v7-series` (draft PR #26 to `claude/v-series`). No tag.
- Commits: one per part (V7a+b, V7c, V7d, V7e, V7f, V7g, V7h, docs).

## Owner tick-list (owner fills this in and sends it to Claude)

| ID  | OK / BUG / MISSING / CHANGE | One sentence |
| --- | --------------------------- | ------------ |
|     |                             |              |
