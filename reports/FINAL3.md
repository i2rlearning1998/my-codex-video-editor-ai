# Report: FINAL3, leftovers, Canva text, Blender camera, Video Plan v2 (2026-10-21)

## 1. Summary

- Every e2e test now runs at the owner's 1920 × 940 window (none pinned to 1600 × 1072), plus the 1366 × 768 panel smoke test.
- Text works like Canva: auto-width and fixed-width boxes with exact heights, corner handles that scale the font, double-click selects all, a visible caret, soft line breaks, lists by paragraph (bullet, numbered, checklist, levels), Hindi typing kept whole, a Text tab with headings and 24 font combinations, uploaded fonts, ten effects plus Curve, format tools and a format painter.
- Cameras work like Blender, without keyframes: cameras and shots on a Camera track, code controllers (push in, orbit, shake, whip pan and more), presets, lens, sensor, shift, clipping, depth of field, guides, safe areas, passepartout, background image, Track To, Preview camera that keeps layers editable, an on-canvas camera frame, and layer depth for parallax.
- A Video Plan v2 pasted into AI › Import builds a whole video: media from the project or stock with alternatives, narration, captions, camera, transitions and ducked music; Review & swap; the feel saves as a theme; a Creator playbook in docs.
- Checklist: 174 DONE, 1 BLOCKED (T4.7: the list of failing catalogue fonts needs Google Fonts, which the sandbox cannot reach), 2 not ticked (A1 and E3: no complete green full run, see §3).

## 2. Scope and results

| ID      | Result   | Evidence                                                                                 |
| ------- | -------- | ---------------------------------------------------------------------------------------- |
| FN3-001 | Verified | e2e/final3-a.spec.ts                                                                     |
| FN3-002 | Verified | e2e/final3-a.spec.ts                                                                     |
| FN3-003 | Verified | e2e/final3-a.spec.ts, tests/final3/nested-audio.test.ts                                  |
| FN3-004 | Verified | e2e/final3-a.spec.ts                                                                     |
| FN3-005 | Verified | e2e/final3-text.spec.ts, tests/final3/text.test.ts                                       |
| FN3-006 | Verified | e2e/final3-text.spec.ts, tests/final3/text.test.ts                                       |
| FN3-007 | Verified | tests/final3/text.test.ts                                                                |
| FN3-008 | Verified | e2e/final3-text.spec.ts, tests/final3/text.test.ts                                       |
| FN3-009 | Verified | e2e/final3-text.spec.ts                                                                  |
| FN3-010 | Verified | tests/interaction.test.ts                                                                |
| FN3-011 | Verified | e2e/final3-text.spec.ts                                                                  |
| FN3-012 | Verified | e2e/final3-text.spec.ts, tests/final3/fonts.test.ts                                      |
| FN3-013 | Verified | tests/final3/camera.test.ts                                                              |
| FN3-014 | Verified | tests/final3/camera.test.ts                                                              |
| FN3-015 | Verified | e2e/final3-camera.spec.ts                                                                |
| FN3-016 | Verified | e2e/final3-camera.spec.ts                                                                |
| FN3-017 | Verified | e2e/final3-camera.spec.ts                                                                |
| FN3-018 | Verified | e2e/final3-camera.spec.ts                                                                |
| FN3-019 | Verified | tests/final3/plan.test.ts                                                                |
| FN3-020 | Verified | tests/final3/plan.test.ts                                                                |
| FN3-021 | Verified | e2e/final3-plan.spec.ts                                                                  |
| FN3-022 | Verified | e2e/final3-plan.spec.ts                                                                  |
| FN3-023 | Verified | e2e/final3-plan.spec.ts                                                                  |
| FN3-024 | Verified | e2e/final3-plan.spec.ts                                                                  |
| FN3-025 | Verified | e2e/final3-plan.spec.ts                                                                  |
| FN3-026 | Verified | e2e/final3-more.spec.ts                                                                  |
| FN3-027 | Verified | e2e/final3-more.spec.ts                                                                  |
| FN3-028 | Verified | e2e/final3-more.spec.ts                                                                  |
| FN3-029 | Verified | e2e/final3-more.spec.ts                                                                  |
| FN3-030 | Verified | e2e/final3-more.spec.ts                                                                  |

- In-scope items Verified: 30 of 30 ledger rows; checklist 174 DONE, 1 BLOCKED (T4.7, external), 2 not ticked (A1, E3).
- Not done, with reason: none.

## 3. Checks

**3rd full verify poora nahi hua; 2nd run ke 4 failures (CV-049, TXT-036, CV-037, CODE-006) alag-alag specs me pass hue.**

(In English: the 3rd full verify did not finish (the owner stopped it); the 2nd run's 4 failures (CV-049, TXT-036, CV-037, CODE-006) passed when their specs were run on their own.)

Browser: the sandbox's pre-installed Chromium (Playwright build 1194), not Google Chrome; it cannot decode or encode H.264 or AAC.

| Run | Format | Typecheck | Unit (Vitest) | Build | E2E (1920 × 940 + 1366 × 768 smoke) | Hook assertion | Ledger |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1st | pass | pass | 1225 passed, 3 failed (KEY-001 `plan-review`, fixed; 2 in tests/blocks/worker.test.ts) | pass | 551 passed, 30 failed | pass | 33 errors (the failed tests) |
| 2nd (after the D-301 fixes) | pass | pass | 1227 passed, 2 failed (tests/blocks/worker.test.ts), 1 skipped | pass | 577 passed, 4 failed (CV-049, TXT-036, CV-037, CODE-006) | pass | 844 items, Verified 521, Claimed 19, Todo 299, Dropped 5; 5 errors (the 4 failed tests' IDs) |
| 3rd | stopped by the owner before it finished | | | | | | |

After the 2nd run: CV-049, TXT-036 and CV-037 were fixed in the product (old text layers keep their stored box, D-301) and CODE-006's test waits for a bake that is not yet listed. Their specs, run on their own: h1-rotated, h3-canvas and text-style 22 passed, x3-settings 5 passed, 0 failed. No complete full run has been made with these last fixes.

The 2 unit failures in tests/blocks/worker.test.ts fail without this round's changes too (the test worker here has no WebAssembly); not chased. The 1366 × 768 smoke tests (FX1-001, FX1-002) passed in the 2nd run.

## 4. Try-it script for the owner (about 20 minutes)

| #   | Do this                                                                                                 | Expect                                                                                             | ID               | Ran | Screenshot                       |
| --- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------- | --- | -------------------------------- |
| 1   | Open the editor in a 1920 × 940 window; Text › Add a heading                                            | A heading about 8 % of the canvas tall, one line, centred                                          | FN3-005, FN3-011 | Y   | reports/final3/b-text-tab.png    |
| 2   | Double-click it and type "Shyam Monani"                                                                 | All text was selected; a 2 px blinking caret; the box grows sideways and never wraps               | FN3-005, FN3-009 | Y   |                                  |
| 3   | Escape, drag a side handle inwards                                                                      | The box becomes fixed width, the text wraps and the box grows taller                               | FN3-005          | Y   |                                  |
| 4   | Double-click that side handle                                                                           | Back to auto width, one line                                                                       | FN3-005          | Y   |                                  |
| 5   | Drag a corner handle outwards                                                                           | The font gets bigger in proportion (one undo step)                                                 | FN3-010          | Y   |                                  |
| 6   | Type three lines, then List › Bullets; Enter on an empty bullet                                         | Three bullets, no extra one; the empty bullet leaves the list                                      | FN3-006          | Y   |                                  |
| 7   | Toolbar aA four times; Advanced › Superscript, Kerning off, Change all                                  | UPPER, lower, Title, none; the text rises; every text changes typography                           | FN3-026          | Y   |                                  |
| 8   | Colour › Linear, then Add colour until it stops                                                         | Up to 10 colours, then Add is disabled                                                             | FN3-026          | Y   | reports/final3/b-text-gradient.png |
| 9   | Effects › try each of the ten effects, move a slider, Remove effect; then Curve                         | Each effect draws; Remove clears it; Curve bends the text                                          | FN3-027, FN3-008 | Y   | reports/final3/b-text-effects.png  |
| 10  | Font › Upload a .woff2; then filter Serif; search a catalogue font while offline                        | Listed under Uploaded fonts and used; filters narrow the list; a reason and Retry                  | FN3-012, FN3-028 | Y   |                                  |
| 11  | Animate › Typewriter on a heading; scrub half way; export a frame                                       | Part of the text in the editor and in the exported frame (Hindi conjuncts stay whole: unit test)                                        | FN3-008, FN3-030 | Y   |                                  |
| 12  | Select nothing; scene toolbar › Camera; Add camera                                                      | The right Camera section; a shot on a Camera track at the top of the timeline                     | FN3-015          | Y   | reports/final3/c-camera-panel.png  |
| 13  | Presets › Punch-in; Preview camera on; scrub                                                            | The picture pushes in smoothly; layers still select and move                                       | FN3-016          | Y   | reports/final3/c-preview-camera.png |
| 14  | Preview camera off; with the shot selected drag inside the frame, wheel, Alt-drag                       | The camera frame moves, zooms and orbits the start framing; one step each                          | FN3-017          | Y   | reports/final3/c-camera-frame.png  |
| 15  | Controller › Orbit, Randomise; Lens › 85 mm                                                             | Parameters only, no keyframes; one step each                                                       | FN3-015          | Y   |                                  |
| 16  | Overlays › Thirds, Safe areas, Passepartout; export a frame                                             | Drawn in the editor only, not in the export                                                        | FN3-029          | Y   | reports/final3/c-camera-overlays.png |
| 17  | Background › an image, depth Front; export; then Include in render and export again                     | Seen in the editor; exported only with Include in render                                           | FN3-029          | Y   |                                  |
| 18  | Track To › a layer; Depth of field › Pick on canvas › click a layer                                     | The camera aims at it; it becomes the focus object                                                 | FN3-029          | Y   |                                  |
| 19  | Split, duplicate, then delete the shots; fold the Camera track                                          | Shots behave like clips; deleting the last removes the track                                       | FN3-015          | Y   |                                  |
| 20  | Add a camera on scene 2; reload                                                                         | Scene 1 unchanged; shots are still there                                                           | FN3-018          | Y   |                                  |
| 21  | Settings › Stock & API keys: save a Pixabay key; AI › Import › paste tests/fixtures/plans/honey-en.json | A green check; Build video                                                                         | FN3-024          | Y   |                                  |
| 22  | Build video                                                                                             | Progress steps, then three scenes replace the empty one; the scene strip opens; one Undo removes all | FN3-021          | Y   | reports/final3/d-build.png         |
| 23  | Without a voice key, build again                                                                        | A silent-video banner; captions still timed                                                         | FN3-022          | Y   |                                  |
| 24  | Review › pick another media alternative; change a scene's narration                                     | The media swaps in place with its animation; the voice and captions are made again                 | FN3-023          | Y   | reports/final3/d-review.png        |
| 25  | Review › Export plan, then Compare to plan                                                              | A .json with your swaps; a list of what changed                                                    | FN3-023          | Y   |                                  |
| 26  | AI category                                                                                             | The plan with its status, its feel as a theme, the starter kit                                     | FN3-025          | Y   | reports/final3/d-ai.png            |
| 27  | Review › Save feel as theme; Theme › My themes › Apply                                           | It says what it holds; colours and fonts change, content stays                                     | FN3-025          | Y   |                                  |
| 28  | Nest an audio clip with a video; play; select the nest › Effects, Speed 2x                              | Sound plays inside the nest; the effect covers the nest; it halves in length                       | FN3-003, FN3-004 | Y   |                                  |

"Ran" means the step is run by the named Playwright test at 1920 × 940 (the screenshots come from those runs and were opened); the owner's own Chrome on Windows was not available here.

## 5. Deviations from the brief

- T4.7: the Devanagari coverage check runs and hides failing fonts from the Hindi filter, but the list of which catalogue fonts fail cannot be produced here: it needs fonts.googleapis.com, which the sandbox's network policy refuses. BLOCKED (D-297).
- CI was not touched and not polled, as the brief says.

## 6. Decisions made

D-295 (Part A), D-296 and D-297 (text model and Text tab), D-298 and D-299 (camera and the cameraShots hook), D-300 (Video Plan v2). The transform interaction contract is revision 9 (text handles and the camera frame).

## 7. Not tested, known gaps, risks

- Real Google Fonts, Pexels, Pixabay and cloud voices: every test mocks them (no live network in the sandbox). The owner should try a real key and real fonts.
- H.264 and AAC: the sandbox Chromium cannot decode or encode them; exports in tests are WebM.
- Real IME hardware input: Devanagari composition is proven with composition events in unit tests and the existing TXT-004 e2e, not with a physical keyboard.
- Depth-of-field blur is a cheap per-layer blur by depth (no bokeh shape); Blades, Rotation and Ratio are stored and shown but only change the blur's shape slightly.
- Plan builds at 1366 × 768 were only covered by the panel smoke test.
- Known and not chased (as the brief says): tests/blocks/worker.test.ts (2), and the listed flakes LAY-004, LAY-038, ANI-003, PB-010 and known failures TXT-040, CV-044/045, DEV-006 (the expected probe). None of them failed in the 2nd run except as listed above.
- No complete green full verify exists for the final commit (the 3rd run was stopped).

## 8. Architecture and contract impact

- Schema version change: none (schema 9). New data uses string and number properties read defensively and clip metadata.
- New dependencies: none.
- Files added: `src/camera/*` additions (shots, shot commands, rig names), `src/render/camera-overlay.ts`, `src/ui/camera-section.ts`, `src/ui/camera-frame.ts`, `src/video-plan/*`, `src/ui/plan-*.ts`, text model files under `src/render` and `src/text-engine`, docs/camera.md, docs/video-plan.md, docs/creator-playbook/, tests/final3/*, e2e/final3-*.spec.ts. The FINAL2 keyframed camera panel was removed (older scene cameras still play).
- Contracts touched: TRANSFORM_INTERACTION_CONTRACT.md revision 9 (text box handles and the camera frame gestures).

## 9. Ledger and backlog

- Status changes made: FN3-001 to FN3-030 added as Verified.
- Ledger Change Requests applied: none beyond the new FN3 section.
- Added to docs/BACKLOG_INBOX.md: 0.

## 10. Git

- Branch: `claude/final-3` (from `claude/fix-1`, PR #43). No tag (stacked draft PR; the owner merges).
- One draft PR against `claude/fix-1`.

## Owner tick-list

| ID      | OK / BUG / MISSING / CHANGE | One sentence |
| ------- | --------------------------- | ------------ |
| FN3-001 |                             |              |
| FN3-005 |                             |              |
| FN3-015 |                             |              |
| FN3-021 |                             |              |
