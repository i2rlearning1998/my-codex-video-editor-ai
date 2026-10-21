# Report: FIX1, bug fixes from the owner's real-browser test (2026-10-21)

Branch `claude/fix-1` from `claude/final-2`, one draft PR to `claude/final-2`. Built by one agent, no sub-agents. Schema 9 unchanged (one additive core command, `SET_NESTED_CONTENT`). No new npm dependencies. Decisions D-287 to D-294. Ledger rows FX1-001 to FX1-018.

## 1. Summary

The owner's findings at 1920 × 940 with real Pexels and Pixabay keys are fixed: panels scroll, stock video imports, one Text to speech tool, visible Whisper failures with Copy diagnostics, the audio mixer on the right, complete nested clips, clearer AI import, and text editing without browser autofill and with a visible caret. Every fix has an e2e test written against real-shaped answers, but no real third-party service could be reached from the sandbox (section 7). The owner's try-it script (section 4) checks them with real keys.

## 2. Parts

| Part | Done | Not done / could not verify against the real service |
| ---- | ---- | ---------------------------------------------------- |
| F9 test infra | e2e default viewport 1920 × 940; `laptop-1366` project (1366 × 768) for the panel-scroll smoke test; Pexels and Pixabay fixtures copy the real shapes (HLS entries with null sizes, Pixabay `large` with url "" and size 0). | Fixtures were written from the published API shapes, not captured live. |
| F1 panels | One scroll rule for every left and right panel and both rails; Media, AI and My Templates keep search, Import, drop zone and chips fixed while only the cards scroll (short windows pin the chips); the selection action cluster never covers the floating toolbar. FX1-001, FX1-002. | — |
| F2 stock | Pexels `/videos/search` with a tolerant mapper (MP4 only, best up to 1080p); Pixabay skips empty renditions, default medium; quality choice in Details; download progress with size, Cancel, Retry; truthful errors (offline only when the browser is offline, timeout, HTTP 403/404/429/5xx, blocked download) with Copy diagnostics; icons on a light tile, de-duplicated, added at 30 % of the canvas's shorter side, recolourable; stickers a mixed set with no share-alike sets; licence chip; stock adds import quietly (no "Restored" toast); downloaded files keep their real extension (webm, wav, gif …). FX1-003 to FX1-007. | Real Pexels and Pixabay answers, real CDN downloads and Iconify were not reachable. The "Restored" toast did not reproduce; the likely cause (a re-add of a file deleted from Media) is now quiet. |
| F3 voice | One Text to speech card under Record & create; cloud engines only (Sarvam, Google, ElevenLabs, MiniMax); browser and offline voices and the old Speech panel are behind flags (off); Add pause; character count and limit; a missing key shows buttons to Settings that focus the key field; real errors (key not valid or no quota, too many requests, timeout). FX1-008, FX1-009. | No paid engine was called for real. |
| F4 diagnostics + Whisper | Copy diagnostics on every failure (sanitised: no keys, tokens, query strings or media); captions show each step (Loading model, Reading sound, Listening N %) with Cancel; failures are classified with plain text; Settings › Run self-test. Root cause of "nothing happens": the dialog's refresh overwrote its own error. FX1-010, FX1-011. | Hugging Face downloads and a real Whisper run could not be tested (blocked here). |
| F5 audio | Left Audio: libraries only (Sound effects, Music from stock, My audio) with sticky tabs; Mixer in the right panel's Project audio (nothing selected); one slider-row grid everywhere (label, full-width slider, number with unit). FX1-012, FX1-013. | — |
| F6 nested clips | Double-click opens a nested clip with its real lanes and clips; move, trim, split, delete, add from Media, effects and text editing work inside; each edit is one undo step in the main history; "Back to main timeline" and Escape leave; a block map shows where the inside sits. FX1-014. | Effects and Speed tabs for the nested clip itself in the right rail; audio cannot be nested. |
| F7 import / build | Severity colours (error red, warning amber, info neutral, OK green); plain wording for missing optional kit items; Build video keeps the items, replaces a lone empty scene, opens the scene strip and shows "Added n scenes" for 10 s with Show scenes. FX1-015, FX1-016. | — |
| F8 text | The text editor turns off autocomplete, autocorrect, autocapitalize and writing suggestions; a 2 px blinking caret in the text colour (black or white below 3:1 contrast); Google Fonts asked for with each family's real weights (single-weight fonts without `:wght@`); rows drawn in their own face; font errors say why with Retry; Hindi filter hides fonts that fail the Devanagari check. FX1-017, FX1-018. | Real Google Fonts and real Devanagari coverage were mocked (fonts.googleapis.com is not reachable here). The weight table is from the catalogue as known; a family not in it is asked for with 400 and 700. |

## 3. Screenshots (1920 × 940, reports/fix1/)

f1-panels-desktop, f1-panels-laptop-1366 (1366 × 768), f2-stock-progress, f2-icon, f2-stickers, f3-tts, f4-captions-error, f4-selftest, f5-project-audio, f5-clip-audio, f6-nest-inside, f7-import, f7-built, f8-caret, f8-fonts. Each was opened. Fixed after looking: the download overlay's text sat under the licence chip on a narrow card, and a downloaded stock video was named `.bin`.

## 4. Checks

One full `npm run verify` at the end, in the sandbox's Chromium 141 (no Chrome or Edge here; D-030), Playwright 1.63.0, window 1920 × 940.

- Format and typecheck: pass. Build: pass. Test-hook assertion: pass.
- Unit + jsdom (Vitest): 1186 passed, 2 failed, 1 skipped. The 2 are `tests/blocks/worker.test.ts`, sandbox-only worker tests that fail the same way on `claude/final-2` (reports/FINAL2.md). Because `npm test` failed, `verify` stopped there; build, e2e, hook and ledger were then run directly, the same commands in the same order.
- e2e: 530 passed, 25 failed (1.1 h, parallel). None was a FIX1 product regression:
  - Intended FIX1 changes, tests updated: LAY-035, LAY-041, LAY-059, LAY-063 (Project audio now sits on the empty right rail), AUD-021 (stock music is a library tab, not a planned tile), F2-001 (the offline voice is behind a flag).
  - Written for the old 1600 × 1072 canvas, pinned to `LEGACY_VIEWPORT` with a comment (D-287): CV-013, LAY-003/LAY-008/LAY-033, LAY-004, INS-018, ANI-007, CV-063, TR-014, TR-016, CODE-006, CODE-011 ×10.
  - Re-run of those 14 spec files: 61 passed, 1 failed (a second LAY-035 assertion about the empty rail), fixed; h4-panels then 5 of 5.
  - Known flakes (LAY-004, LAY-038, ANI-003, PB-010) and known failures (TXT-040, CV-044/045) did not fail in this run; DEV-006 is the deliberate probe (expected failure).
- Ledger: the only errors were the 18 IDs above (Verified with a failing test in the full run's report); all pass in the re-run. The ledger was not re-run against one complete report after the fixes (one full verify allowed).
- Earlier during the parts, FX1-001 failed once after F5: with nothing selected, opening Project audio hid Theme and the reverse. Fixed (both stay on the rail).

## 5. Try it with real keys (about 20 minutes, browser window about 1920 × 940)

1. Settings › Stock & API keys: paste your Pexels key, press Test: "Working". Do the same for Pixabay. (FX1-007)
2. Elements › Videos › Pexels: search "ocean", press "+" on a card: a progress bar with the size and Cancel, then the clip on the timeline. Play it. (FX1-004)
3. Switch to Pixabay, search "city", add a video. It plays; Media › ⋯ › Details shows the quality used and the credit. (FX1-003)
4. On a Pixabay card open Details, pick Small, add it: the smaller file is used. (FX1-003)
5. Turn Wi-Fi off, search again: "No internet". Turn it on, use a wrong key: "Key not valid" with the HTTP status and Copy diagnostics. Paste the diagnostics into a note: no key is in it. (FX1-007)
6. Elements › Icons: thumbnails on a light tile; add one: centred, about a third of the canvas height. Right panel › Colour: change its colour. (FX1-005)
7. Elements › Stickers with an empty search: a mixed set, no repeats; Load more adds more. (FX1-006)
8. Add the same stock item twice, delete it from Media, add it again: no "Restored" toast. (FX1-007)
9. Make the window 1366 × 768: every left panel, the right panel and both rails scroll to their last control; in Media the search, Import and chips stay put while the cards scroll. (FX1-001, FX1-002)
10. Select an element near the top of the canvas: its action buttons never cover the floating toolbar. (FX1-002)
11. Record & create › Text to speech: one tool. With no voice key it shows buttons to Settings; save a Sarvam (Hindi) or Google key there. (FX1-008)
12. Type a Hindi sentence, press Add pause, type more; Preview, then Add to timeline: a "Speech 1" clip with a half-second pause. (FX1-009)
13. Use a wrong voice key: a plain error with Copy diagnostics. (FX1-009)
14. Settings › Offline voice & captions › Run self-test: it downloads Whisper if needed and reports the backend and start time, or a plain reason. (FX1-011)
15. Right-click a video clip with speech › Auto captions › Offline Whisper: each step shows, Cancel works; on failure the message names the cause with Copy diagnostics. (FX1-010)
16. Left rail Audio: only libraries (Sound effects, Music, My audio). Deselect everything, right rail › Project audio: the mixer. (FX1-012)
17. Select a clip: Volume, Opacity and Speed rows keep label, slider and number on one line. (FX1-013)
18. Select two clips › right-click › Nest clips. Double-click it: its own lanes and clips. Trim one, split one, add a picture from Media. (FX1-014)
19. Press Ctrl+Z once: only the last edit inside is undone. Press Escape or "Back to main timeline": the nested clip shows the changes. (FX1-014)
20. AI › Import a pack with a warning: warnings amber, errors red, "Ready to build" green. (FX1-015)
21. Import a composition, Build video on a new project: the empty scene is replaced, the scene strip opens, "Added n scenes" with Show scenes. (FX1-016)
22. Add a text box and type a name or an e-mail: no browser autofill or suggestion pops up; the caret is a visible blinking line in the text's colour. (FX1-018)
23. Make the text white on a white canvas and edit it: the caret turns black. (FX1-018)
24. Toolbar › Font: each font name is drawn in its own font; pick Pacifico: it loads (no error). Pick a font that fails: the reason and Retry. (FX1-017)
25. Font › Hindi / Devanagari: only fonts that really draw Devanagari are listed. (FX1-017)

## 6. Decisions made

D-287 to D-294 (docs/DECISIONS.md). The main ones: the 1920 × 940 e2e viewport with a 1366 smoke project (D-287); the Pexels endpoint and Pixabay quality rules (D-288); one cloud-only TTS tool, the rest behind flags (D-289); a nested clip's inside edited as a scratch scene and written back with `SET_NESTED_CONTENT` (D-292); the font weight table (D-294).

## 7. Not tested, known gaps, risks

- No real third-party service was reachable from the sandbox: Pexels, Pixabay and their CDNs, Iconify, Freesound, Sarvam, Google Cloud TTS, ElevenLabs, MiniMax, Hugging Face (Whisper files), Google Fonts. Every test mocks them with real-shaped answers. The Pexels and Pixabay documentation pages could not be opened either.
- The e2e browser is the sandbox's Chromium 141, not Chrome or Edge (D-030); it cannot decode H.264, so Pexels and Pixabay MP4 files are served as WebM in tests.
- The "Restored" toast and the Whisper silence did not reproduce exactly as reported; the fixes target the likely causes (D-288, D-290).
- Nested clips: no Effects or Speed tab for the nested clip itself; audio cannot be nested.
- Browser autofill differs by browser and extension (password managers); the attributes stop Chrome's and Edge's own suggestions and the common managers, not every extension.
- The font weight table covers the catalogue families; Google may change a family's weights.

## 8. Architecture and contract impact

- Schema: none (9). One additive core command, `SET_NESTED_CONTENT`; `EngineOptions.capabilities` lets a scratch engine share the real engine's capability commands.
- New dependencies: none.
- New files: `src/nesting/view.ts`, `src/ui/nest-engine.ts`, `src/ui/diagnostics.ts`, `src/ui/feature-flags.ts`, `src/speech/whisper-fake.ts`; e2e `fix1-*.spec.ts`; unit `tests/fix1/diagnostics.test.ts`.
- Contracts touched: none.

## 9. Ledger and backlog

- Added: FX1-001 to FX1-018 (section FIX1).
- Earlier tests updated for intended FIX1 behaviour: s1-ui, final2-u2-stock, final2-u3u4, v7-record, final2-u11-whisper, final2-u5-audio, final2-u9, creator-pack style unit test.

## 10. Git

- Branch `claude/fix-1`, no tag (owner merges after review).
- `git log --oneline claude/final-2..claude/fix-1` lists the parts: F9, F1, F2, F3, F4, F5, F6, F7, F8, docs.
