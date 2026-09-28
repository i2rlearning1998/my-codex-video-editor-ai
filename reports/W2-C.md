# Report: Wave 2 continuation W2-C, clipboard, linked audio/video, risky Claimed items (2026-09-24)

## 1. Summary
You can now cut, copy and paste clips (Ctrl+X, Ctrl+C, Ctrl+V, the palette, and the timeline and canvas right-click menus). Pasted clips land at the playhead and push later clips instead of overlapping.

Clips can be linked: linked clips move, nudge, split, delete and copy together, show a link badge, and can be unlinked. **Detach audio** creates a separate audio clip on an Audio track, with its own derived audio asset. It is correct in the data model but not audible, because no audio engine exists yet.

Of the eight "risky" Claimed items, six were proven: HIS-002, HIS-004, CV-031, INS-002/INS-003 (one ledger row each), PRJ-012 and CV-011. Two are real bugs, now recorded with reproductions and not fixed, as instructed:
- **TL-017:** a multi-selection dragged to another track collapses onto one track.
- **CV-022:** clicking inside a group selects the inner layer instead of the group, and there is no double-click isolation.

## 2. Scope and results
| ID | Result | Evidence |
|---|---|---|
| TL-027 | Verified | `[TL-027] copy, cut and paste clips at the playhead onto the selected track`; unit tests in `tests/clip-model.test.ts` |
| TL-032 | Verified | `[TL-032] linked clips move, split, delete and copy together; unlink and detach audio`; unit tests |
| HIS-002 | Verified | `[HIS-002] canvas, inspector and timeline edits all undo back to the start and redo to the end` |
| HIS-004 | Verified | `[HIS-004] history keeps the latest 100 steps and stays responsive over a long session` |
| CV-031 | Verified | `[CV-031] layers are drawn only inside their active time range` |
| INS-002 | Verified | `[INS-002] editing Position X in the inspector moves the layer on the canvas in one undo step` |
| INS-003 | Verified | `[INS-003] Position Y, scale, rotation and opacity fields edit the layer and follow canvas gestures` |
| PRJ-012 | Verified | `[PRJ-012] switching the active composition shows its canvas and timeline and resets selection` (new fixture `two-scenes.json`) |
| CV-011 | Verified | `[CV-011] text-width grips change the text box width and reflow without changing font size` |
| TL-017 | **Bug** | The time part is proven by `[TL-017] multi-selected clips move together in time…`. The track part is reproduced by `test.fail('[TL-017] multi-selected clips dragged to another track keep their track offsets')`. |
| CV-022 | Verified (fixed after the first report, D-050) | `[CV-022] clicking inside a group selects the group; double-click selects the child; Esc exits` (was a `test.fail`) |

- In-scope items Verified: 9 of 11. Bug: 2 (TL-017, CV-022), recorded and not fixed (D-049).

## 3. Checks (real output tails; the full log was `e2e-results/W2-C-verify.log`, which is gitignored)
- `npm run verify`: exit 0. Prettier, typecheck and build are clean: JS 244.24 kB (gzip 71.55), `✓ built in 845ms`.
- Unit and jsdom: `Test Files 19 passed (19)`, `Tests 305 passed (305)` = 164 unit (4 new) + 141 jsdom.
- E2E: `69 passed (1.5m)` = 64 normal passes + 5 expected failures (the DEV-006 probe, CV-008, MED-035, TL-017, CV-022). Browser: Chromium 141 (fallback, D-030).
- Hook: `assert-no-test-hook: OK`. Ledger: `Ledger: 495 items | Verified 78 | Claimed 11 | Todo 402 | Bug 4`, `Ledger OK`.
- CI: GitHub Actions runs only when started by hand (see the PR #3 comment). This push was not dispatched.

## 4. Try-it script (open `nle-example.json`; about 10 minutes)
| # | Do this | Expect | ID | Claude ran it | Screenshot |
|---|---|---|---|---|---|
| 1 | Click clip-a, press Ctrl+C, click the ruler at 2 s, click clip-a, press Ctrl+V | A copy lands at 2 s; clip-b is pushed to 4 s | TL-027 | Y (automated) | `…TL-027*/pasted.png` |
| 2 | Press Ctrl+V again, then Undo twice | A second copy appears; the undos remove both | TL-027 | Y | — |
| 3 | Right-click clip-c → Cut; right-click an empty part of the canvas → Paste | clip-c disappears, then comes back at the playhead on Video 2 | TL-027 | Y | — |
| 4 | Select clip-a, Shift-click clip-c, right-click → Link clips | Both show a link badge | TL-032 | Y | — |
| 5 | Drag clip-a to the right; press Alt+→ | clip-c moves the same amount, staying on Video 2 | TL-032 | Y | — |
| 6 | Click the ruler at 1.5 s, select clip-a, press S | Both clip-a and clip-c split at 1.5 s | TL-032 | Y | — |
| 7 | Undo. Select clip-a, press Delete, then Undo | clip-c is deleted with it; Undo restores both | TL-032 | Y | — |
| 8 | Right-click clip-c → Unlink clips | The badges disappear; they move separately again | TL-032 | Y | — |
| 9 | Right-click clip-b → Detach audio | An "Audio 1" track appears with a "clip-b audio" clip at 3–5 s (silent for now) | TL-032 | Y | `…TL-032*/detached-audio.png` |
| 10 | Make five different edits (canvas drag, an inspector field, a timeline nudge, a marker, a lock), then press Undo until it greys out | Everything returns to how it was; Redo replays it all | HIS-002 | Y | — |
| 11 | Menu → Open project → `two-scenes.json`; switch the composition picker to "Scene 2" | The pink card and its single clip show; the selection clears | PRJ-012 | Y | — |
| 12 | Select clip-a and clip-c, then drag clip-a down one track | **Known bug:** both land on Video 2 instead of Video 2 and Video 3 | TL-017 | Y (expected failure) | — |
| 13 | Click the lime card in the example; double-click it twice; press Esc three times | "Card arrangement" is selected; then "Front card", then an inner layer; Esc steps back out and finally deselects | CV-022 | Y | `…CV-022*/group-isolation.png` |

## Addendum: CV-022 fix (owner priority bump)
- The owner asked for CV-022 to be fixed on this branch. Click selects the group; double-click enters it; Esc exits one level; clicking outside exits (D-050).
- Code: `src/ui/session.ts` (entered group, transient), `src/ui/canvas-interaction.ts` (`resolvePick`, double-click, marquee), `src/commands/shortcuts.ts` (Esc).
- Tests: the e2e `test.fail` became a normal passing test, extended with a whole-group drag and exit-by-outside-click. Two jsdom tests were updated to the new behaviour.
- Verify after the fix: exit 0; unit+jsdom 305 passed; e2e 69 passed = 65 normal + 4 expected failures (DEV-006 probe, CV-008, MED-035, TL-017), Chromium 141; ledger Verified 79 / Claimed 11 / Todo 402 / Bug 3.

## 5. Deviations from the brief
- **Fixture loader:** `openFixtureProject` now waits for each fixture's own project name instead of a hard-coded "NLE Fixture", so it can open the new two-scene fixture.
- **Canvas menu:** the placeholder Cut, Copy and Paste entries became the real actions. This touches CV-020 wording but does not claim it.

## 6. Decisions made
D-047 (clipboard), D-048 (links and detach), D-049 (risky items, including the two Bugs). They are also recorded in `docs/DECISIONS.md`.

## 7. Not tested, known gaps, risks
- **Linked pairs can drift when pasted:** the insert rule runs per track, so a pasted linked pair can shift apart when only one target track is occupied (backlog).
- **Linked trimming** is not built; a trim affects only the clip you drag.
- **Detached audio is silent** until an audio engine exists. Re-attaching audio is not built; Undo is the only way back.
- **The clipboard is in-app only.** Pasting into another browser tab or app, or from the OS clipboard, is out of scope (CV-028).
- **HIS-004** proves the step bound and responsiveness, not a memory ceiling in megabytes; that is not measurable in this harness.
- Not tested in Chrome, in Edge or on Windows.

## 8. Architecture and contract impact
- Schema stays 4. The new metadata keys are `linkId`, `audioDetached` and `detachedFrom`.
- New commands: `SET_CLIP_LINK` and `SET_CLIP_AUDIO_DETACHED`, synchronous and refused on locked tracks.
- A derived-asset convention for detached audio: generated source, references only.
- No dependencies and no contract changes.
- Files added: `briefs/W2-C.md`, `e2e/clipboard-link.spec.ts`, `e2e/risky.spec.ts`, `tests/fixtures/projects/two-scenes.json`, this report.

## 9. Ledger and backlog
- To Verified: TL-027, TL-032, HIS-002, HIS-004, CV-031, INS-002, INS-003, PRJ-012, CV-011.
- To Bug: TL-017, CV-022.
- No LCR.
- Backlog: 2 lines (paste drift, linked trimming).

## 10. Git
- Branch: `claude/wave-2-timeline-clips-mwy1f3` (PR #3, stacked on W2-B). Tag: `w2-c` is to be created at merge.

## Owner tick-list
| ID | OK / BUG / MISSING / CHANGE | One sentence |
|---|---|---|
| TL-027 | | |
| TL-032 | | |
| HIS-002 / HIS-004 | | |
| CV-031 / INS-002 / INS-003 | | |
| PRJ-012 / CV-011 | | |
| TL-017 / CV-022 (known bugs) | | |
