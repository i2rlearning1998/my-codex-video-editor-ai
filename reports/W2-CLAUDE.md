# Report: Wave 2, W2-CLAUDE, timeline interaction and clip time commands (2026-09-23)

## 1. Summary
The timeline now behaves much more like Clipchamp:
- It keeps extending as you scroll or zoom out near the end.
- Clips have clear trim handles, and trims stop at the next clip and at the end of the source media. This fixes the TL-019 bug.
- Dragging a clip, the playhead or a marker snaps with a visible teal guide line.
- Dragging a clip to another track shows a ghost exactly where it will land.
- Track headers have working Lock, Hide, Solo and Mute toggles, and every timeline gesture has a keyboard equivalent.

Clips gained Speed, Reverse and Freeze frame in both right-click menus, all undoable and shown as badges. **These three change clip timing and state only.** You will not see or hear the effect in the preview until the media pipeline decodes real video (VID-010 to VID-012, Wave 6). This session also fixed the e2e blocker, so `npm run verify` runs green in this sandbox.

## 2. Scope and results
| ID | Result | Evidence (test title or file) |
|---|---|---|
| TL-055 | Verified | `[TL-055] scrolling or zooming out near the end keeps extending the ruler; the playhead stops at the content end` |
| TL-056 | Verified | `[TL-056] clips show dedicated trim handles with a resize cursor and a grip on hover; dragging one trims` |
| TL-057 | Verified | `[TL-057] clip, playhead and marker drags snap with a visible guide line` |
| TL-058 | Verified | `[TL-058] a cross-track drag shows a ghost at the landing track and time, commits it in one step, and Escape cancels` |
| TL-059 | Verified | `[TL-059] Lock, Hide, Solo and Mute toggles show pressed state; Solo previews only soloed tracks without history` |
| TL-060, TL-044 | Verified | `[TL-060][TL-044] keyboard nudges, moves across tracks, trims to the playhead and jumps between cuts` |
| TL-019, TL-018 | Verified (TL-019 was Bug) | `[TL-019][TL-018] trims stop at the neighbouring clip and at the end of the source media`; the `test.fail` in `e2e/bugs.spec.ts` was removed |
| VID-015 | Verified | `[VID-015] Speed from the timeline and canvas menus changes duration, shows a badge, refuses overlaps and round-trips undo/redo` plus `tests/clip-time.test.ts` |
| VID-016 | Verified | `[VID-016] Reverse toggles from the timeline and canvas menus with a badge and undo/redo` plus the reversed-split unit test |
| VID-017 | Verified | `[VID-017] Freeze frame holds the frame under the playhead from both menus with a badge and undo/redo` |

- In-scope P0 items Verified: 12 of 12 (TL-018, TL-019, TL-044, TL-055 to TL-060, VID-015 to VID-017).
- Not done: none. The prerequisite (e2e running in this environment) is done; see D-030.

## 3. Checks (real output tails; the full log was `e2e-results/W2-CLAUDE-verify.log`, which is gitignored and not in the PR)
- `npm run verify`: exit 0.
- Format: `All matched files use Prettier code style!`. Typecheck: exit 0.
- Build: `✓ built in 815ms`; JS 229.32 kB (gzip 66.92), CSS 29.49 kB (gzip 5.72). Wave 1 was 213.16 / 27.87 kB.
- Unit and jsdom: `Test Files 18 passed (18)`, `Tests 294 passed (294)` = 153 unit (7 new in `tests/clip-time.test.ts`) + 141 jsdom.
- E2E: `33 passed (42.8s)` = 31 normal passes + 2 expected failures (the TL-004 bug reproduction and the intentional DEV-006 guard probe). Zero unexpected, flaky or skipped. Browser: **Chromium 141.0.7390.37** (the sandbox's pre-installed Playwright Chromium, because no Chrome or Edge is installed here). Node 22.22.2, npm 10.9.7.
- Hook: `assert-no-test-hook: OK (no __AIVE__ in production build)`.
- Ledger: `Ledger: 494 items | Verified 48 | Claimed 40 | Todo 405 | Bug 1`; `Tests: 29 file(s) scanned, 49 IDs proven by active tests, 2 IDs with test.fail reproductions`; `Ledger OK`.
- CI: the workflow runs on the PR push; its result is not known at the time of writing.

## 4. Try-it script for the owner (about 10 minutes; open Menu → Open project → `tests/fixtures/projects/nle-example.json`)
| # | Do this | Expect | ID | Claude ran it (Y/N) | Screenshot |
|---|---|---|---|---|---|
| 1 | Hover over the timeline and scroll right (Shift+wheel or trackpad) past 5 s, and keep going | The ruler keeps adding seconds; empty room never runs out | TL-055 | Y (automated) | `test-results/timeline-w2--TL-055-*/infinite-scrolled.png` |
| 2 | Click the ruler far past the last clip | The playhead stops at the content end (5 s) | TL-055 | Y (automated) | — |
| 3 | Hover a clip's left or right edge | A resize cursor appears and a white grip bar shows on both edges; the body shows a hand | TL-056 | Y (automated) | `…TL-056-*/trim-handle-hover.png` |
| 4 | Drag clip-a's right edge far to the right | It stops exactly at clip-b's start (3 s) | TL-019 | Y (automated) | — |
| 5 | Click the ruler at 2.5 s, then drag clip-a slowly right | A teal line appears when its end touches the playhead, and the clip lands there | TL-057 | Y (automated) | `…TL-057-*/snap-clip.png` |
| 6 | Drag the playhead handle toward clip-b's start | A teal line appears and the playhead sticks to 3 s | TL-057 | Y (automated) | — |
| 7 | Drag clip-c (Video 2) down onto Video 3 and hold | A dashed ghost appears in Video 3 at the landing time, and the original stays faded in Video 2 | TL-058 | Y (automated) | `…TL-058-*/cross-track-ghost.png` |
| 8 | Release, then Undo; drag again and press Escape before releasing | Release moves it in one step and Undo restores it; Escape leaves everything as it was | TL-058 | Y (automated) | — |
| 9 | On a track header, click Lock, Hide, Solo and Mute one at a time | Each turns into a filled (pressed) button with a tooltip. Solo on Video 1 hides Video 2's green box on the canvas and does not add an Undo step | TL-059 | Y (automated) | `…TL-059-*/track-solo.png` |
| 10 | Click clip-b, then press Alt+← and Shift+Alt+←; then Ctrl+Z twice | It moves one frame, then ten more; two undos restore it | TL-060 | Y (automated) | — |
| 11 | Click clip-c, then press Alt+↓ and Alt+↑ | It moves to Video 3 and back | TL-060 | Y (automated) | — |
| 12 | Click clip-b, click the ruler at 4 s and press `]`; click at 3.5 s and press `[` | The end, then the start, trims to the playhead | TL-060 | Y (automated) | — |
| 13 | With the timeline focused, press ↓ and ↑ | The playhead jumps to the next or previous clip edge or marker | TL-044 | Y (automated) | — |
| 14 | Right-click clip-c → Speed › → 2×; then Undo and Redo | It becomes half as long with a "2×" badge; Undo and Redo swap it back and forth. Trying 0.25× on clip-a shows "Not enough room" | VID-015 | Y (automated) | `…VID-015-*/speed-badge.png` |
| 15 | Right-click the green box on the canvas (at 1.5 s) → Reverse, then Freeze frame | Reverse and freeze badges appear on clip-c; the menus show a check; both undo | VID-016, VID-017 | Y (automated) | — |

Claude ran every step as an automated Playwright test in real Chromium and inspected the TL-057, TL-058 and TL-059 screenshots by eye. No manual hand-testing was possible here, and no Windows Chrome run was done. Screenshots are regenerated by `npm run e2e` under `test-results/` and are not committed.

## 5. Deviations from the brief
- Branch is `claude/wave-2-timeline-clips-mwy1f3` (assigned by the session), not `wave-2-<slug>`.
- The review patch is based on `main` (`78c9652`, the merge of `w1.2`) because that is the actual base. The tag `w2-claude` is **not pushed**: this session may only push its branch. Create the tag at merge.
- The e2e browser is Chromium, not Google Chrome or Edge (DEV-001 wording). This is recorded as D-030. On the owner's Windows machine, Chrome is still used.
- An inspector re-render bug (D-031) was fixed outside the ledger scope because it failed two existing e2e tests in Chromium and blocked all proof.
- Track header label now shows only the track name (for example "Video 1"). The type prefix moved to the tooltip, because four toggles plus two reorder arrows left no room.

## 6. Decisions made
D-030 to D-037 in `docs/DECISIONS.md`:
- D-030: Chromium fallback for e2e.
- D-031: blur the inspector before it re-renders.
- D-032: the LCR.
- D-033: speed uses the existing field; reverse and freeze are stored in `clip.metadata` (schema stays 4).
- D-034: Solo is session-only.
- D-035: timeline-scoped keyboard commands.
- D-036: the infinite-span rule.
- D-037: snap threshold and trim-bound ordering.

## 7. Not tested, known gaps, risks
- **Not tested in Google Chrome or Edge, and not on Windows.** Only Chromium 141 on Linux ran here. The minimum Node version was not re-checked.
- **Speed, reverse and freeze have no visible or audible preview effect yet**, because no media is decoded. The source-time maths (`clipSourceTime`) is unit-tested only.
- Mute stores state only (there is no audio engine yet). Solo is not saved with the project.
- Moving a clip with the mouse or with Alt+arrows can still overlap a neighbour (TL-020 and TL-030 are out of scope). Alt+↑/↓ has no overlap check either.
- TL-004 is still a Bug: Delete on a locked track still removes the clip. The new commands (speed, reverse, freeze, trims and moves through clip commands) do refuse locked tracks.
- A marker added at the playhead sits under the playhead handle and cannot be dragged until the playhead moves (backlog line).
- Most older `timeline.ts` strings are still hard-coded English. New strings use translation keys, and the Hindi strings are machine-quality and need a native review.
- Not tested: touch or pen, screen readers, very long projects near the 24 h span cap, performance with many clips, the Hindi UI for the new menus, the palette running the new speed and keyboard commands in the browser (covered by the KEY-001 unit test only), and splitting a reversed clip in the browser (unit test only).

## 8. Architecture and contract impact
- Schema version: none (stays 4). Reverse and freeze are stored in the existing `clip.metadata`.
- New dependencies: none.
- New commands: `SET_CLIP_SPEED`, `SET_CLIP_REVERSED`, `SET_CLIP_FREEZE_FRAME`. They are validated, refused on locked tracks and use the normal transaction and history path.
- New core helpers in `src/core/timeline.ts`: `clipTimeEffects`, `clipSourceTime`, `retimeClip`, `clipTrimBounds`, `trackAcceptsLayer`.
- Session and render: `EditorSession.soloTrackIds/toggleSolo` (transient); an optional `RenderSource.soloTrackIds`; the test hook and debug report expose `soloTrackIds`.
- Files added: `e2e/timeline-w2.spec.ts`, `tests/clip-time.test.ts`, `briefs/W2-CLAUDE.md`, this report.
- Main files changed: `src/ui/timeline.ts`, `src/ui/timeline-model.ts`, `src/ui/editing.ts`, `src/ui/shell.ts`, `src/commands/*`, `src/ui/session.ts`, `src/render/adapter.ts`, `src/style.css`, `src/ui/tokens.css`, `src/ui/icons.ts`, both locales, `playwright.config.ts`, `e2e/reliability.spec.ts`.
- Contracts: no frozen contract changed, and the transform maths is untouched.

## 9. Ledger and backlog
- Status changes: TL-018 Claimed → Verified; TL-019 Bug → Verified; TL-044 and TL-055 to TL-060 Todo → Verified; VID-015 to VID-017 Todo → Verified.
- LCR applied: TL-055 to TL-060 and VID-015 to VID-017 were appended before implementation; the W2 wave counts and totals were updated (494 items).
- Added to `docs/BACKLOG_INBOX.md`: 8 lines. These include the out-of-scope items (waveforms, nested breadcrumbs, track colours) and the Wave 3 candidates: Cut/Copy/Paste, Replace, Detach Audio and Compound Clip.

## 10. Git
- Branch: `claude/wave-2-timeline-clips-mwy1f3`. Tag: `w2-claude` is to be created at merge (not pushed from this session).
- `git log --oneline main..HEAD`: see the PR. It holds about 9 commits: the e2e fix, the LCR and brief, core commands, keyboard and menus, the timeline UI, browser tests, the header fix and docs, and this report.
- Review patch: `npm run patch -- 78c9652 HEAD W2-CLAUDE` writes `reports/W2-CLAUDE.patch` and `.stat.txt`. Both paths are gitignored and this container is ephemeral, so **the PR diff is the review record**. Regenerate the patch locally after fetching the branch if Claude review needs the file.

## Owner tick-list (owner fills this in and sends it to Claude)
| ID | OK / BUG / MISSING / CHANGE | One sentence |
|---|---|---|
| TL-055 | | |
| TL-056 | | |
| TL-057 | | |
| TL-058 | | |
| TL-059 | | |
| TL-060 / TL-044 | | |
| TL-018 / TL-019 | | |
| VID-015 | | |
| VID-016 | | |
| VID-017 | | |
