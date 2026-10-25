# PHASE 0 close (claude/fix-5, PR #48, draft)

## Per item (fast round)
| # | Item | Result |
| - | ---- | ------ |
| E1 | Build loader, no freezing | Done. FX5-011, FX5-012 pass in Chromium. Loader: step name, moving percentage, Cancel, "Check again". Remaining long tasks (about 300 ms) are the single validation steps. |
| 1 | 9:16 ratio "hang" | Test mistake, not a freeze: the perf test clicked a chip that is not there when a clip is selected. FX5-014 (Ratio → 9:16 with a clip) passes, 1080 × 1920 at once. Hanging perf variants removed. |
| 2 | Filter drag | FX5-015 passes with the real mouse: the canvas changes before release, release is one undo step ("Filter intensity"), a hover preview clears and adds no history. No fix needed. |
| 3 | First Play | FX5-016 (own project `autoplay-policy`, flag `--autoplay-policy=document-user-activation-required`; the test first proves a context made before any click is suspended): the first press waits ("Preparing audio"), then picture and sound run together, no console warning. No new bug found; FX5-007 fix from round 1 holds. |
| 4 | Whisper | Copy diagnostics already named host, file, HTTP status, bytes and the worker's last message, and the cloud fallback ("Use a cloud engine instead" / "Add key") already existed from FIX5 C9; added a unit proof of the report (FX5-009). The real download is for the owner (below). |
| 5 | Dynamic text | Done, TXT-037 Verified: Text › Dynamic text lists date, time, scene number, page count, counter and timecode with formats; the Scene number field draws 2 in scene 2 and 3 in its copy, and the exported PNG frames differ. Joined video export numbers scenes by start time (built, not browser-proven for a video file). Magic write: disabled, "Needs the AI service (planned)". Scene strip + menu: Open video plan review (FX5-017). |
| 6 | Devanagari | TXT-025 Claimed (Devanagari only): क्ष ज्ञ श्र conjuncts are narrower than their split forms, ि and ी add ink, reph draws, identical pixels in a page canvas and a worker canvas (the export's). Looked at: reports/phase0/devanagari.png shows correct shaping. Not tested: caret, wrap, letter spacing and per-character styling in the editor; other Indic scripts and Arabic. |
| 7 | "Planned: Wave N" | Done. Every such string now says what it needs. Hide (LYR-006), grid (CV-014, rulers not built) and safe areas (CV-015) are live; Text › Captions opens Auto captions. Inventory below. |
| 8 | Ledger, merge plan | `npm run ledger` passes (540 Verified, 35 Claimed, 293 Todo, 5 Dropped). docs/MERGE-PLAN.md: dry run into main has no conflicts. |

## Effects timing at 1920 × 1080 (ms per frame, paused / playing, Chromium in the sandbox, CPU only)
| | Image | Video |
| - | - | - |
| Mask | 17 / 11 | 20 / 17 |
| Mask + chroma key | 78 / 101 | 59 / 59 |
| Blur | 103 / 73 | 76 / 78 |
| Blur + glow | 78 / 75 | 107 / 106 |

Targets (paused under 60, playing under 100) are missed for blur, blur + glow and chroma key on the image. Not done: 9:16 timings, preview-resolution processing. FX5-013 is Claimed. Real speed is for the owner's GPU PC.

## Inventory of controls that are still disabled
| Control | Where | ID | Says now |
| ------- | ----- | -- | -------- |
| Background remover, Magic eraser, Smart crop, Expand, Auto cut, wand | image toolbar, tool panels, Player bar, clip menu | AI-007, AI-008, AI-009, AI-001 | Needs the AI service (planned) |
| Magic write | Text panel | none | Needs the AI service (planned) |
| Comment | canvas menu | ADV-008 | Needs your account (planned) |
| Rulers | Guides menu | CV-014 | Planned for Phase 1 |
| 3D, Charts, Frames, Grids, Animations tiles | Elements, mode switch | ADV-002, SHP-016, MSK-003, SHP-012 | Planned for Phase 1 |
| Scene transition and Animate buttons on the scene bar | scene toolbar | TR-001, ANI-020 | Planned for Phase 1 (the clip transitions and scene markers exist elsewhere: stale buttons) |

Not started, one paragraph each:
- **3D (first Phase 1 item):** a third mode beside Editor and 2D Animation; scenes would hold 3D layers drawn by a WebGL2 pass behind the existing adapter (D-006), with the camera shots already built reused as the 3D camera; schema bump needed.
- **Motion tracking:** analyse a clip in a worker (feature points per frame), store the resulting path as ordinary position keyframes on a layer; no new render path.
- **Multicam:** several video clips on a group of lanes sharing a time base; a cut list chooses the visible one per time and writes ordinary clip splits; sound sync by waveform match.
- **Scripting console:** a sandboxed worker (like the Tier C runtime) with a read-only project snapshot that returns commands, which go through the Command Bus as one undo step.

## Screenshots
reports/phase0/devanagari.png (one visual, opened and checked).

## What the owner must try on his PC
1. First Play in real Chrome with a video + audio project: the first press should start picture and sound together (a short "Preparing audio" note on a big file).
2. Real Whisper download (5 lines): Settings › Offline voice & captions › download the model; Auto captions › Hindi › Create with a Hindi clip; if it fails press Copy diagnostics. The report lines to expect: "failing.host: huggingface.co", "failing.status: <HTTP code or none>", "failing.bytes: <n>", "worker.lastMessage: <last step>"; the dialog then offers "Use a cloud engine instead" or "Add key". Check the Hindi captions read correctly.
3. GPU speed: apply Blur, Glow and a mask to a 1080p clip, press Play and note if it stays smooth; tell me if it stutters.
4. Add a Text › Dynamic text › Scene number and Date to a scene and export a short video: the number and today's date should be in the file.
5. Grid and safe areas: right-click outside the canvas › Guides.

## What I did not test
The full e2e suite (CI will run it once), video export of dynamic text, Whisper with the real model, GPU timings, 1366 × 768 screenshots of every category (bug hunt E4 not done), Hindi in the editor beyond shaping, 9:16 effect timings.
