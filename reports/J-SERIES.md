# Report: J-series, J1 to J15 (2026-10-03)

Branch `claude/j-series`, stacked on `claude/i-series` (PR #16, still open). One draft PR (#17), never merged by Claude. Progress is tracked in `briefs/J-SERIES.md`. The audit made before any change is `reports/J-AUDIT.md`. Test screenshots are in each test's output folder (`test-results/<test>/`).

## 1. Summary

**Fixes from the PR #16 test (J1 to J6).**

- **J1 Scene isolation.** Each scene has its own background and its own canvas size. Changing one scene leaves the others alone, and a size change never moves a layer. Undo still uses one stack, but it opens the scene it changed.
- **J2 Gradients and undo.** Gradient colours survive switching between Solid, Linear and Radial. Ctrl+Z works straight after a panel edit, with no extra click.
- **J3 NumberField everywhere.** Every number control has up and down arrows, wheel steps and an inline slider where it has a range. Scrubbing or sliding shows the result on the canvas live and commits once on release.
- **J4 Text editing.** Text is edited on the canvas: caret, selection, IME (Hindi tested), copy and paste, styles on part of the text, and lists.
- **J5 Fonts and weights.** Three bundled open-licence fonts have real weights from 100 to 900. The Bold button shows the real weight. Vertical alignment is exact.
- **J6 Menus.** Show element timing has a popover. Alternative text is saved with a confirmation and an ALT badge. Resize canvas to selection asks first.

**Clipchamp-style timeline, player and right panel (J7 to J15).**

- **J7 Lanes.** Lanes come in three groups (text and shapes, visuals, audio). The top lane is in front, and Arrange moves elements between lanes.
- **J8 Loading and empty states.** A skeleton shows while the editor loads. An empty scene offers + Add text, + Add video and + Add audio.
- **J9 Drag and drop.** You see where a drop will land: a box on the canvas, a ghost clip with its time, a + line for a new lane, and Replace on a clip of the same kind.
- **J10 Clips.** Clips are coloured by kind, with an icon, a hover outline and a clear selection with a length pill on the ruler.
- **J11 Gaps.** Gaps between clips are hatched, with a trash button that closes them. A faint playhead follows the pointer.
- **J12 Transitions.** Cross fade, fade through black or white, wipes and slides work where two clips touch, in the preview and in export.
- **J13 Player bar.** Back and forward 5 s, previous cut, a timecode, Fit, and Collapse for a big preview.
- **J14 Clip menus.** Clip menus have a section per kind, with shortcuts: Edit duration, Rename in place, an Audio submenu and More options.
- **J15 Right panel.** The right panel follows Clipchamp: a header, sections in Clipchamp's order, Filters and Effects lists, a 0.1x to 16x speed slider and Animate grids.

**Still not possible** (greyed out, with their wave):

- Filters and effects other than Original and the shape outline.
- Transitions other than the six built ones.
- Clip volume and audio crossfades (Wave 7).
- Auto captions and Auto cut.

## 2. Scope and results

| Step | ID | Result | Evidence (test title) |
| --- | --- | --- | --- |
| J1 | PRJ-024, PRJ-026 | Verified | `[PRJ-024] [PRJ-026] each scene owns its background…` |
| J1 | PRJ-025 | Verified | `[PRJ-025] a canvas size belongs to its scene and never moves layers…` |
| J1 | HIS-009 | Verified | `[HIS-009] undo and redo revert only their own edit and open the scene it changed` |
| J2 | SHP-029 | Verified | `[SHP-029] Solid, Linear and Radial share one stop list…` |
| J2 | KEY-017 | Verified | `[KEY-017] Ctrl+Z and Ctrl+Shift+Z work right after panel edits…` |
| J3 | INS-018 | Verified | three `[INS-018]` tests (arrows and wheel; live preview and one step; export range, new project size, keyframe time) |
| J4 | TXT-002, TXT-003, TXT-004, TXT-023, TXT-024 | Verified | six tests in `e2e/j4-text.spec.ts` (Text tool, double-click editing, IME Hindi, range styles, lists, copy and paste) |
| J5 | TXT-040, TXT-041, TXT-015 | Verified | `[TXT-040] bundled fonts have real weights…`, `[TXT-041] the Bold button shows the resolved weight…`, `[TXT-015] Top, Middle and Bottom…` |
| J5 | TXT-010 | Claimed | Weights now follow each font; variable font axes are not adjustable |
| J6 | CV-058, CV-059, CV-060 | Verified | the three tests in `e2e/j6-menus.spec.ts` |
| J7 | TL-061, TL-062, TL-063 | Verified | `e2e/j7-lanes.spec.ts`, plus `tests/lanes.test.ts` |
| J8 | TL-064, TL-065 | Verified | `[TL-064] a shimmer skeleton…`, `[TL-065] an empty scene shows + Add text…` |
| J9 | TL-066, TL-067, TL-068 | Verified | `e2e/j9-drag.spec.ts` |
| J10 | TL-069, TL-070 | Verified | `e2e/j10-clips.spec.ts` |
| J11 | TL-071, TL-072 | Verified | `e2e/j11-gaps.spec.ts` |
| J12 | TR-011 | Verified | `[TR-011] a + where two clips touch opens the Transition panel…`, plus `tests/transitions.test.ts` |
| J13 | TL-073, TL-074 | Verified | `e2e/j13-player.spec.ts` |
| J14 | TL-075 | Verified | the two `[TL-075]` tests in `e2e/j14-menus.spec.ts` |
| J15 | LAY-046, LAY-047 | Verified | `e2e/j15-right.spec.ts` |

- In-scope P0 items Verified: all the new and moved J items, except TXT-010 (Claimed, above).
- **Built but not proven by a test:**
  - The shimmer on a clip whose filmstrip or waveform is still decoding (J8). Decoding is too fast to observe reliably.
  - The rounded drag image with the thumbnail (J9). Tests cannot see a drag image.

### Existing tests changed

Each change states the new rule the brief asked for. None was deleted, skipped or loosened, and no viewport changed.

- **J7 lanes.**
  - TL-001 (unit) expects the cards group on a text-and-shapes lane, and an all-clip document to keep its lanes.
  - KEY-001 (unit) picks the lower-lane layer for Bring forward.
  - Several e2e tests that found a new layer by its array position now find it by asset, type or name. The array follows lane order now.
- **J12.** The cross fade is checked in the preview (half and half at the cut) and in exported frames (the exported cut frame is half of the exported frames before and after). A single pixel of the test picture differs between the preview and export sizes, so the two are not compared pixel for pixel.
- **J15.**
  - LAY-035, LAY-042 and LAY-045 follow the new tabs. A picture's own controls are now under Advanced.
  - The clip-speed unit test's upper bound is now 17x, because the limit rose to 16x.

## 3. Checks

- `npm run verify` on the final commit `83e399a`, from a clean `git archive` copy: **exit 0**.
  - Format, typecheck (app and e2e) and build passed. Build: main bundle 758.33 kB (232.50 kB gzip), CSS 120.60 kB, export worker 554.98 kB.
  - Unit and jsdom: 404 passed in 38 files.
  - E2E: 304 passed, including the DEV-006 expected-failure probe, in Chromium 141.0.7390.37 (the sandbox fallback, D-030; no H.264 or AAC), single worker, 17.1 min.
  - Ledger: OK. 603 items: 278 Verified, 12 Claimed, 313 Todo, 0 Bug.
- After each step: typecheck (app and e2e), unit tests and the ledger passed, and the step's own e2e tests plus the specs it touched were run in a snapshot.
- **Earlier full runs.**
  - J11 (`e396fb7`): 295 passed, 2 failed (TL-056 and MED-013), fixed in `5faa082`.
  - The run before the final one (`c39eb33`): 298 passed, 6 failed. Five were caused by J14: Detach audio had left the main clip menu, and shortcut text was part of each entry's name. Both were fixed in `83e399a` without changing the older tests.
- **Export flake.** The sixth failure was `[EXP-001]…frame-exact video file`: it read frame 43 where 44 was expected, once. It passed in the re-run of the affected specs and in the final verify. J12 changed the drawing path that export uses (transitions are applied after presets), but with no transition the composition is passed through unchanged (unit-tested). It is recorded here as seen once and not reproduced; a second failure must be investigated.

## 4. Try-it script for the owner

Open the app (`npm run dev`). For the timeline steps, use File › Open example or the media example where noted.

| # | Do this | Expect | ID | Claude ran it | Screenshot |
| --- | --- | --- | --- | --- | --- |
| 1 | Add a scene; give it a blue background and a Square size; go back to scene 1 | Scene 1 keeps its colour and size, and nothing in it moved | PRJ-024, PRJ-025 | Y (test) | test-results (PRJ-024) |
| 2 | Edit something in scene 2, open scene 1, press Ctrl+Z | Scene 2 opens and the edit is undone | HIS-009 | Y (test) | test-results (HIS-009) |
| 3 | Select a shape: Linear, set red and yellow, then Solid, then Linear again; then press Ctrl+Z without clicking away | The red and yellow stops come back; Ctrl+Z undoes the last change | SHP-029, KEY-017 | Y (test) | test-results (SHP-029) |
| 4 | In any number field: click the arrows, scroll the wheel, drag the slider | Each arrow is one step; while sliding, the canvas changes live; one undo step on release | INS-018 | Y (test) | test-results (INS-018) |
| 5 | Double-click the headline; select a word; press B and change the colour; add a bullet list; type with a Hindi keyboard; press Escape | Only that word changes; the list is drawn; Hindi composes; Escape keeps the text as one undo step | TXT-003, TXT-023, TXT-024, TXT-004 | Y (test) | test-results (TXT-023) |
| 6 | Font panel: Poppins; open the weight list | Thin to Black (100 to 900); Bold shows on for a bold heading | TXT-040, TXT-041 | Y (test) | test-results (TXT-040) |
| 7 | Right-click an element › Show element timing; change Duration | A popover with Start and Duration; the clip highlights; one undo step | CV-058 | Y (test) | test-results (CV-058) |
| 8 | Look at the timeline of the example | Text and shapes on top, pictures below, audio at the bottom, with lines between the groups; drag a text clip onto a picture lane: not allowed | TL-061, TL-062 | Y (test) | test-results (TL-061) |
| 9 | Add a blank scene | The timeline shows + Add text, + Add video, + Add audio | TL-065 | Y (test) | test-results (TL-065) |
| 10 | Drag a Media image over the canvas, then over the timeline between two lanes, then onto an image clip | A box on the canvas; a purple + line between lanes; dropping on the clip offers Replace clip or Add as a new clip | TL-066, TL-067 | Y (test) | test-results (TL-066) |
| 11 | Leave a gap between two clips; press its trash button | The gap is hatched; the button closes it in one step | TL-071 | Y (test) | test-results (TL-071) |
| 12 | Place two pictures end to end; hover the cut, press +, choose Cross fade; play across the cut; export a frame at the cut | The pictures blend over 1 s, the same in the export | TR-011 | Y (test) | test-results (TR-011) `cross-fade.png` |
| 13 | Use Back 5 s, Forward 5 s, Fit and Collapse in the player bar | The playhead jumps 5 s; Fit shows the whole scene; Collapse leaves a big preview | TL-073, TL-074 | Y (test) | test-results (TL-073) `player.png` |
| 14 | Right-click a video clip; use the arrow keys; open Audio › Mute; Rename; Edit duration | Its own section with shortcuts on the right; every action works; Auto cut is greyed (Wave 10) | TL-075 | Y (test) | test-results (TL-075) `video-menu.png` |
| 15 | Select a video clip and look at the right panel; open Speed and drag the slider | Header "Video" with a count; Captions, Sound, Fade, Filters, Effects, Adjust colors, Speed, Transitions, Advanced; speed 0.1x to 16x | LAY-046, LAY-047 | Y (test) | test-results (LAY-046) `right-panel.png` |

## 5. Deviations from the brief

- **J5 TXT-010** stays Claimed. Weights follow each font, but variable font axes are not adjustable.
- **J8 and J9.** The clip-loading shimmer and the drag image are built but not proven by a test (section 2).
- **J12.**
  - Only six transitions are built: cross fade, fade through black and white, wipe left and right, slide left and right. The others are greyed with "Planned: Wave 6 (TR-003)".
  - Audio is not crossfaded under a transition. The audio engine is PR #14, which this series must not touch.
- **J14.** Audio › Mute mutes the clip's lane. Clip volume is Wave 7 (AUD-002).
- **J15.**
  - Filters: only Original works. Effects: only the shape outline works. The rest are greyed and name their wave (FX-004, FX-001, TXT-019).
  - Video Fade stays live (AGENTS.md section 3).
  - The rail labels for Audio and Adjust are the existing "Sound" and "Adjust colors".
- **J15 speed.** The speed limit rises from 8x (D-033) to 16x, so the slider can reach 16x.

## 6. Decisions made

- D-151 (schema 6: per-scene background)
- D-152 (per-scene size)
- D-153 (history scoped to scenes)
- D-154 (gradient stops)
- D-155 (keyboard undo everywhere)
- D-156 (NumberField and live preview)
- D-157 (on-canvas text editing)
- D-158 (fonts and weights)
- D-159 (element timing, alternative text, resize to selection)
- D-160 (lanes)
- D-161 (loading and empty states)
- D-162 (drag and drop)
- D-163 (clip visuals)
- D-164 (gaps and playhead)
- D-165 (transitions)
- D-166 (player)
- D-167 (clip menus)
- D-168 (right panel)

See `docs/DECISIONS.md`.

## 7. Not tested, known gaps, risks

- **PB-010 flake.** PB-010 (audio and picture sync) is a known sandbox-only flake (STATUS.md). By owner decision it is not re-investigated when it shows up in the sandbox.
- **Fonts.** The bundled fonts were checked in Chromium 141 on Linux only, not in Chrome on Windows. Hindi IME was checked with a synthetic composition (`Input.imeSetComposition`), not a real Windows keyboard.
- **Lanes.** A saved document keeps its lanes, so an older project whose lanes mix groups is repaired by moving clips, not repacked. This was checked on the fixtures only.
- **Transitions.**
  - A transition plays only while the two clips touch. Moving a clip away keeps the record but nothing plays.
  - Slides and wipes were checked by unit tests and by eye. Only the cross fade has a pixel e2e.
- **Player.** Previous cut is checked to move back. The exact cut it lands on is covered by the earlier jump-to-cut tests.
- **Right panel.**
  - The speed slider was moved by setting its value and dispatching input and change (Home is a real key). A real mouse drag of a range input was not run.
  - The header's count badge counts selected layers, not clips.
- **Screen readers.** Menus, the rail and the transition grid were checked with the keyboard, not with screen-reader software.
- **Reduced motion and theme contrast** for the J-series panels were checked by screenshot only.

## 8. Architecture and contract impact

### Schema 6

Schema 6 adds exactly one field: `composition.backgroundColor` (D-151).

- Migration 5→6 copies the project background into every scene.
- Regression fixture: `tests/fixtures/projects/v5-scenes.json`.
- A newer version is still refused.

These need no schema change (D-033 pattern, read defensively):

- `textRuns` and `listStyle` (text);
- `fillGradientSaved` (shapes);
- `role: background`;
- `transitionMetadata.in` (transitions).

### Dependencies

No new npm dependencies. The fonts are vendored files, not a package.

| Font | Source | Licence |
| --- | --- | --- |
| Inter (Latin) | @fontsource 5.3.0 packages, `public/fonts` | SIL OFL 1.1, `OFL.txt` beside it |
| Poppins (Latin, Devanagari) | @fontsource 5.3.0 packages, `public/fonts` | SIL OFL 1.1, `OFL.txt` beside it |
| Noto Sans Devanagari (Latin, Devanagari) | @fontsource 5.3.0 packages, `public/fonts` | SIL OFL 1.1, `OFL.txt` beside it |

They are about 1.3 MB in total (D-158).

### New core commands

All are additive:

- `SET_COMPOSITION_BACKGROUND`
- `SET_CLIP_TRANSITION`
- `SET_LAYER_NAME`

New core APIs: `CommandBus.capture` and `EditorEngine.preview` (D-156). The core also gains the lane rule `src/core/lanes.ts` and `src/core/transitions.ts`.

### Files added

- `src/render/fonts.ts`, `src/render/rich-text.ts`, `src/render/transitions.ts`;
- `src/ui/text-editor.ts`, `src/ui/fonts.ts`, `src/ui/element-timing.ts`, `src/ui/drag-state.ts`, `src/ui/transition-panel.ts`;
- `e2e/j1` to `j15` specs;
- `tests/lanes.test.ts`, `tests/rich-text.test.ts`, `tests/transitions.test.ts`.

### Files not touched

`src/audio/*`, the export mixdown, `sound-panel.ts` and PR #14. The right panel's Audio tab is still `src/ui/right-panel/audio-tab.ts`.

### Contracts

None changed. A canvas size change now anchors at the top-left, which is the transform contract's origin (D-152).

## 9. Ledger and backlog

- **LCR J-series, added and Verified:**
  - PRJ-024 to PRJ-026, HIS-009;
  - SHP-029, KEY-017, INS-018;
  - TXT-040, TXT-041;
  - CV-058 to CV-060;
  - TL-061 to TL-075;
  - TR-011;
  - LAY-046, LAY-047.
- **Moved to W2 and Verified:** TXT-002, TXT-003, TXT-004, TXT-023, TXT-024 and TXT-015.
- **Still Claimed:** TXT-010.
- **`docs/BACKLOG_INBOX.md`:** 5 lines added (J-series).

## 10. Git

- Branch `claude/j-series`, draft PR #17, stacked on PR #16. Not merged by Claude.
- One commit per step, plus four follow-up fixes (`582de29`, `087275b`, `5faa082`, `83e399a`).
- No tag: the owner tags after acceptance.
- Review patch: `git diff origin/claude/i-series...claude/j-series`.

## Owner tick-list

| ID | OK / BUG / MISSING / CHANGE | One sentence |
| --- | --- | --- |
| PRJ-024 | | |
| PRJ-025 | | |
| PRJ-026 | | |
| HIS-009 | | |
| SHP-029 | | |
| KEY-017 | | |
| INS-018 | | |
| TXT-002 | | |
| TXT-003 | | |
| TXT-004 | | |
| TXT-023 | | |
| TXT-024 | | |
| TXT-040 | | |
| TXT-041 | | |
| TXT-015 | | |
| CV-058 | | |
| CV-059 | | |
| CV-060 | | |
| TL-061 | | |
| TL-062 | | |
| TL-063 | | |
| TL-064 | | |
| TL-065 | | |
| TL-066 | | |
| TL-067 | | |
| TL-068 | | |
| TL-069 | | |
| TL-070 | | |
| TL-071 | | |
| TL-072 | | |
| TR-011 | | |
| TL-073 | | |
| TL-074 | | |
| TL-075 | | |
| LAY-046 | | |
| LAY-047 | | |
