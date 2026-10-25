# Report: FIX5, the owner's bug round C1 to C10 (2026-10-24)

Branch `claude/fix-5` (from `claude/fix-4` at `0b5eda2`). Draft PR to `claude/fix-4`. Codex works in parallel on `codex/fix-5-engine`; nothing in its files (src/render, fx, composition, media, core, blocks, the Build video and AI import dialogs, the effects panels) was edited. Notes for Codex are in `docs/BACKLOG_INBOX.md`.

## 1. Summary
- Library cards (AI, My Templates, Styles) never stay blank; the same AI item is listed once.
- Every audio row has a Play / Stop button; hovering never plays; My audio can be heard.
- The Scene and Audio panels no longer overlap at 1920 × 945 and 1366 × 768.
- The Draw palette's Shape, Line, Sticky note, Text and Table tools open a flyout of choices; Table works.
- Text panel: no My text styles section. Review video plan is readable, and AI › Video plans opens it again.
- The first Play waits for the sound, then starts picture and sound together. Blend list labels are not doubled; menus are at most 60 % of the window.
- Whisper: a long listening run is no longer called stalled (the cause of the owner's failure); downloads and failures name the file and host; a cloud engine is one click away.
- Not done: Dynamic text (TXT-037) and Magic write stay disabled (reasons below). The real Hugging Face download could not be proven here.

## 2. Scope and results
| ID | Part | Result | Evidence |
|---|---|---|---|
| FX5-001 | C1 | Verified | `[FX5-001]` every AI and My Templates card has a drawn thumbnail (pixel check) |
| FX5-002 | C2 | Verified | `[FX5-002]` hover never plays, Play / Stop, one at a time, My audio, category switch; AUD-021 updated |
| FX5-003 | C3 | Verified | `[FX5-003]` geometry at both sizes |
| FX5-004 | C4 | Verified | `[FX5-004]` chosen ellipse, double arrow, note colour, heading style and 2 × 4 table are what is placed; Esc; SHP-027 updated |
| FX5-005 | C5 | Verified | `[FX5-005]`; FN3-011 and TXT-038 updated |
| FX5-006 | C6 | Verified | `[FX5-006]` build, review, leave, AI › Video plans › Open review |
| FX5-007 | C7 | Verified | `[FX5-007]` slowed decoder, one press |
| FX5-008 | C8 | Verified | `[FX5-008]` 16 unique labels, headings never repeat a label, menu height |
| FX5-009 | C9 | Verified (fake server and fake runner only) | `tests/speech/whisper-download.test.ts` (4 tests), `[FX5-009]` in fix3-whisper, FX3-003 updated |
| FX5-010 | C10 | Verified | `[FX5-010]` Audio panel geometry |

C1 root cause: the thumbnail service answers a grey stand-in picture for any kind it cannot draw (motion, code animations, items saved without a poster). The card showed that grey picture instead of its kind icon, so it looked blank. The card now keeps the icon, asks the service once more after 1.5 s, and also replaces an empty (fully transparent) picture. The two "Aa" cards were a Theme card and a Style card (and a pack imported twice would list twice); exact duplicates now show once, and same-named items show their pack name.

C7 root cause (reproduced with a slowed decoder): Play started the picture at once while the sound was still decoding, so a big file started silent or late. Further presses only toggled Pause, which looked like "it needs 3 or 4 presses". The console warnings in the owner's report could not be reproduced here (none appeared in the sandbox run); if they come back, copy them and send them.

C9 root cause: the page's watchdog killed the worker when it sent no heartbeat for 15 s. A single listening run is one blocking call, so the worker cannot beat while it works: the owner's run (transcription 0/5, one thread because the page is not cross-origin isolated) went quiet for 16 s and was stopped. The "load 0/?" lines in his diagnostics are model-start stage messages, not downloads. Fix: a model start gets 60 s of silence, a run gets 10 minutes, and the dialog says "Listening to part N of M… (S s so far)". Separately, downloads now stall only after 60 s without bytes, and name file, host, HTTP status and bytes.

Not done, with reasons:
- TXT-037 Dynamic text: fields that update themselves need the renderer (Codex's src/render) to resolve them each frame. The card stays disabled. Magic write needs the AI service (Wave 10): disabled, tooltip "Needs the AI service (planned)".
- C6.2 scene strip "+" entry: not done (optional, "if cheap"); AI › Video plans covers reopening.
- C4: curved and elbow lines are not built (the engine has no connectors).
- C1 "retry once": done in the card; the service itself was not changed (not mine).

## 3. Checks
- `npm run verify` stops at the unit step: 1260 passed, 3 failed, all known and also failing on `claude/fix-4` (2 in `tests/blocks/worker.test.ts`, no WebAssembly in the sandbox worker; `tests/ai-spec/boundaries.test.ts`). So e2e was run directly: `npx playwright test` (Chromium from /opt/pw-browsers, desktop and laptop-1366 projects): 607 passed, 17 failed, 1 skipped.
- The 17 failures: known flakes ANI-003 (3), PB-010, TPL-015; expected DEV-006 probe; MED-003 (Claimed, no H.264). Failing on `claude/fix-4` too (checked): F2-012 (Recorder), LAY-055 (two). Laptop-1366 runs of fix4.spec (FX4-001, 002, 004, 010) time out because the AI rail button is hidden under More at that height (they were already in that project before this round).
- Regressions that this round caused and fixed after the full run: B1-001, CODE-008, FX4-004 and CP-004 (a card picture was not inserted while its card was still being built). Re-run and passing: b1-styles, x4-templates, p2-creator-pack, fix4 FX4-004. The rest of the suite was not run again after that one-line fix.
- Ledger: `npm run ledger` OK (FX4 rows added as Claimed, FX5 rows Verified).
- CI: not waited for.

## 4. Try-it script for the owner (about 12 minutes; screenshots in `reports/fix5/`)
| # | Do this | Expect | ID | Ran by me | Screenshot |
|---|---|---|---|---|---|
| 1 | AI category after importing a pack with a motion item | Every card shows a picture or its kind icon, never grey | FX5-001 | test | c1-ai.png |
| 2 | Audio category: hover a sound, then click its Play button, then another | Hover is silent; Play plays; the second stops the first | FX5-002 | test | |
| 3 | Import an audio file, open Audio › My audio | The file has a Play button and you can hear it | FX5-002 | test | |
| 4 | Open Scene at a small window (1366 × 768) | Search, new folder button and first row sit apart | FX5-003 | test | c3-after-1366.png |
| 5 | Draw rail item, Shape, pick Ellipse, click the canvas | An ellipse appears; a dashed ghost followed the pointer | FX5-004 | test | c4-flyout.png |
| 6 | Line › Double arrow, drag on the canvas | A double arrow of the dragged length | FX5-004 | test | |
| 7 | Sticky note, pick the green; Text, pick Heading; Table 2 × 4 | Each is what you picked; Ctrl+Z undoes one at a time; Esc cancels a drag | FX5-004 | test | |
| 8 | Text panel | No My text styles; Magic write says it needs the AI service | FX5-005 | test | |
| 9 | AI › Import the honey plan › Build video › Review & swap | A summary and one card per scene; nothing cut off | FX5-006 | test | c6-after-1920.png, c6-after-1366.png |
| 10 | Go to Media, then AI | A Video plans card with Open review brings the review back | FX5-006 | test | |
| 11 | Reopen a project with a large video and press Play once | "Preparing audio…" then picture and sound start together | FX5-007 | test (slowed) | |
| 12 | Right panel › Adjust colors › Blend mode | 16 modes, headings Basic, Darker, Lighter… not repeating; menu scrolls | FX5-008 | test | c8-blend.png |
| 13 | Auto captions with local Whisper on a 2–3 min clip (your machine) | "Listening to part 1 of N… (S s so far)", no "stopped responding" within 10 minutes per part | FX5-009 | NOT run (real model) | |
| 14 | If it fails: Copy diagnostics | Failing host, file, status, bytes and the worker's last message | FX5-009 | test (fake) | |
| 15 | After a failure | "Use a cloud engine instead" or "Add a key" is right there | FX5-009 | test | |

What each diagnostics line means: `failing.host` and `failing.file` name the download that failed; `failing.status` is the server's HTTP answer (none means no answer: blocked or offline); `failing.bytes` is how much arrived before it stopped; `worker.lastMessage` is the last thing the speech engine reported (for example `stage pipeline` means it was building the model, `progress 0/?` that it was reading a file); `worker.crossOriginIsolated: false` means one thread, so a 30 s part can take a minute or more on a slow machine.

## 5. Deviations from the brief
- Branch: the session was configured for `ccr-87664c38-u8vntu`, but the brief asks for `claude/fix-5`; I followed the brief.
- C10 ledger gate: added the missing FX4 rows (as Claimed, proven by existing tests) and the FX5 rows; `npm run ledger` is green. FX4 rows were not promoted to Verified here.

## 6. Decisions made
D-303 to D-310 in `docs/DECISIONS.md`. Decisions the owner should confirm: (1) Dynamic text waits for a render-side field resolver (Codex). (2) Whether to turn on cross-origin isolation in the dev server for faster, multi-thread Whisper (backlog).

## 7. Not tested, known gaps, risks
- The real Hugging Face model path, real Chrome on Windows, real audio output, and the owner's console warnings (C7) were not tested.
- A long Whisper window can still take minutes on one thread; the run has no progress inside one window.
- Library shapes dragged to a size are scaled by their stored box; grouped library shapes keep their own size on drag.
- The Draw flyout covers the left of the canvas while open; a drag must start to the right of it.
- Known flakes not chased: PB-010, PB-009, VID-010, EXP-001, HIS-004, TPL-015, LAY-004, LAY-038, ANI-003. Known failures: TXT-040, CV-044/045, two worker.test.ts tests.

## 8. Architecture and contract impact
- Schema: none (still 5). New dependencies: none.
- New: `src/ui/components/audio-preview.ts`, `tests/speech/whisper-download.test.ts`, `e2e/fix5.spec.ts`, `docs/DRAW-CANVA-RESEARCH.md`. Playback gained an optional `prepare` hook; the model loader gained `ModelDownloadError`.
- Contracts touched: none.
