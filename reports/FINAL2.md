# Report: FINAL2, integration part 2 (all the UI; 2026-10-18)

Branch `claude/final-2` from `claude/final-1`, draft PR #42 (base `claude/final-1`). U1, U2, U10 and U11 were built here; U3 to U9 by six sub-agents in git worktrees, merged here (D-286). Schema 9 unchanged. Decisions D-276 to D-286. Ledger rows F2-001 to F2-090.

## Parts

| Part | Done | Not done / limits |
| ---- | ---- | ----------------- |
| U1 Settings | Stock & API keys (8 providers plus Iconify "No key needed"): Show, Save (masked), Test (Working / Key not valid / Too many requests / No internet), Clear, how-to and free tier; Offline voice & captions with status and Download / Cancel / Remove; accent colour, 8 swatches per theme, kept per theme, applied at startup and on every theme switch. F2-001, F2-002. | Sarvam and Deepgram have no free test request: they say "checked the first time you use it". No pre-paint accent script (a chosen accent can show purple for one frame). Literals: 4 replaced, the default token values and transition chip colours left (D-276). |
| U2 Elements stock | Photos, Videos (Pexels + Pixabay), Icons, Stickers (Iconify), Audio (Freesound): search (400 ms), provider switch, orientation, 2-column cards with licence badge, Load more, attribution; add / drag to canvas or timeline with progress and Cancel; credit in Media › Details; every error in plain words. F2-003, F2-004. | Audio preview play is built but not asserted in e2e. |
| U3 Voice-over | Record & create › Voice-over: text, language, engine + voice with status and fix buttons, speed, Preview, Save to Media (progress, cancel), Add to timeline; Hindi hint. F2-010, F2-011. | No paid engine was called for real (no keys here). |
| U4 Recorder | Camera, Screen (+ mic switch), Screen + camera (picture-in-picture), Mic (V7 flow): device pickers, permission help, 3-2-1, level meter, pause / resume / stop / discard, elapsed time, Media and optional timeline. F2-012, F2-013. | Real screen sharing is replaced by a canvas stream in e2e; leaving mid-recording and busy devices not tested. |
| U5 Audio | Mixer (master 0-200 %, master and lane meters, mute, solo), clip Audio: fade presets, volume keyframes, Reduce noise (Beta) with limits; master volume in playback and `ExportInput.masterVolume` (unit test). F2-020 to F2-024. | Waveforms: no change needed (already from the cache). |
| U6 Text | Font picker (search, chips, Hindi filter, recent, downloadable fonts, offline states, coverage), direction Auto / LTR / RTL with flipping alignment, lists with level and style, Elements › Tables (picker, cell editing on canvas and panel, header, widths, borders). F2-030 to F2-033. | Rich-text runs accept only system and bundled fonts while editing. |
| U7 Effects | Masks (shapes, modes, feather, expansion, invert, keyframe, matte, canvas handles), one grouped blend control, chroma key (eyedropper, similarity, smoothness, spill, feather, quality, GPU notice); export parity smoke test. F2-040 to F2-043. | Path / polygon handle drags, matte selection and real GPU keying not tested. |
| U8 Media | Details with probe info; Reconnect media dialog on load (candidates, Pick file, Pick folder, skip keeps placeholders); plain notes for codecs, rotation, variable frame rate. F2-050, F2-051 (F2-052 Claimed). | No "Fix timing" button (the probe API has none; timing already follows the file). Rotation / VFR notes unit-tested only (H.264 fixtures). |
| U9 Captions, nesting | Transcribe and Auto captions from the clip menu, the right rail and the canvas bar; five styles with previews; SRT / VTT; caption edits keep words in step; Nest / Open / Un-nest with a breadcrumb. F2-060 to F2-062. | Child timing inside a nested clip cannot be edited (no engine command yet). Transcribe ignores reversed clips. |
| U10 Composition, camera, leftovers | Build video from an AI composition (slot dialog: Media, Upload, Stock, later; live checklist; add as new scenes or open as new project); scene Camera panel (presets, values, keyframes, Preview camera, badge); library panels 380 px from 1440 px; the brief lists stock providers and key status; code export keeps control values. F2-070 to F2-072. | While previewing the camera, canvas picking is off with a hint (the inverse mapping was not wired). Style cards already showed their own thumbnail. |
| U11 Offline Whisper | Lazy `@huggingface/transformers` runner, files downloaded in the user's browser into IndexedDB, size-only checks until pinned, `npm run models:pin`, "Offline captions setup: 3 steps" in docs/SPEECH-API.md; offline TTS says Not available and points to cloud voices. F2-090. | Not run against the real model here (Hugging Face is blocked); the owner's manual test is step 18 below. |

## Screenshots (1920 × 1080, reports/final-ui/)

u1-settings-accent, u1-settings-offline, u2-stock-photos, u3-voiceover, u4-recorder, u5-audio, u5-audio-tab, u6-fonts, u6-table, u7-effects, u8-relink, u8-details, u9-captions, u9-nesting, u10-build, u10-camera, u11-whisper. Each was opened; fixes made: accent swatch selection ring (U1), camera badge moved into the canvas footer and the camera panel refreshing after a preset (U10), Settings download row updating in place so Cancel stays clickable (U11); the sub-agents list theirs in their notes (D-278 to D-283).

## Checks

Full `npm run verify` once at the end, in the sandbox's Chromium 141.0.7390.37 (no Chrome or Edge here; D-030), Playwright 1.63.0.

- Format, typecheck, build, test-hook assertion: pass.
- Unit + jsdom (Vitest): 1173 passed, 2 failed. Both are `tests/blocks/worker.test.ts` sandbox-only worker tests, failing the same way before FINAL2.
- e2e: 497 passed, 31 failed in the full run (57 min, parallel).
  - Expected or pre-existing, not chased: DEV-006 (the deliberate probe), TXT-040, CV-044/045.
  - Real regressions, fixed and re-run green: DEV-007 (debug report missing `enteredGroupId`), CODE-004 (a single Tier A spec showed Build video; Add was disabled).
  - Earlier tests updated for intended FINAL2 behaviour, re-run green: SHP-026 (Icons and Stickers tiles; Photos live), TL-075 (Transcribe, Auto captions), CP-008/CP-014 (a composition is buildable), PRJ-001 to PRJ-006 (schema 9, FINAL1 fallout).
  - Caused by the 380 px library width (narrower canvas at the 1600 px e2e viewport): SHP-001, SHP-005, SHP-013, CV-061 ×2, VID-001, VID-010 to VID-012, MED-023, MED-024, CODE-006, CODE-011 ×10. The e2e fixture now keeps the earlier width (`__AIVE_E2E_LIBRARY__='legacy'`, like the D-190 reserve); F2-072 turns it off. All re-run green.
  - PB-009 (a known sandbox timing flake, D-216): passed on re-run.
- Re-runs after the fixes: 12 spec files, 52 of 53 passed (CODE-004 failed, fixed, then x2, u10 and p2 12 of 12); x5 10 of 10.
- Ledger: OK after the re-run (CP-008 and CP-014 pass again).
- Not re-run as one full suite after the fixes (the brief allows one full verify).

## Try it (mock mode, no real keys; about 15 minutes)

1. Open the editor. Menu › Settings › Appearance: pick Teal under Dark theme. Buttons and highlights turn teal. Switch to the light theme (top bar): its own colour shows. (F2-002)
2. Settings › Stock & API keys: type `abc` in Pexels, press Test: "Key not valid" (or "No internet" offline). Clear it. Iconify says "No key needed". (F2-001)
3. Settings › Offline voice & captions: Whisper shows "Needs download (41 MB)" with a size-only note; Offline voice says "Not available yet" and names the cloud voices. (F2-090)
4. Elements: Photos, Videos, Icons, Stickers and Audio are live; Charts, Frames, Grids, 3D and Animations are greyed. Open Photos: a card says "Add your free Pexels key…" with a button to Settings. (F2-004)
5. Elements › Icons (no key needed; needs internet): search "star", press "+" on a card: it lands in Media and on the canvas; Media › ⋯ › Details shows Credit and Licence. (F2-003)
6. Record & create › Voice-over: type a sentence, pick Hindi with no keys: the hint asks for a paid voice with a Settings button. (F2-010, F2-011)
7. Record & create › Camera: allow the camera, 3-2-1, record 3 s, Stop, Save to Media; it is in Media and at the playhead. (F2-012)
8. Audio (left rail): set Master volume to 150 %, press Play: the meters move. Reload: still 150 %. (F2-020)
9. Select an audio or video clip, right panel › Audio: Fade in 1 s, Add volume keyframe, Reduce noise Low. (F2-021 to F2-023)
10. Select a text, toolbar › Font: search, Hindi / Devanagari filter, a recently used list. Right panel › Text: Direction Right to left; List Numbers. (F2-030, F2-031)
11. Elements › Tables: pick 3 × 3, double-click a cell, type, press Tab, Enter. (F2-032, F2-033)
12. Select a picture, right panel › Effects › Masks: Add ellipse, drag a handle, Feather 40. Blend: Multiply. Chroma key: On, eyedropper on the canvas. (F2-040 to F2-042)
13. Import a project JSON whose media are not in this browser: the Reconnect media dialog lists them; Pick folder finds them; or Skip keeps placeholders. (F2-050, F2-051)
14. Right-click a video clip › Auto captions: pick a style, Add captions (needs Deepgram or downloaded Whisper; without them the dialog says which engine needs what). (F2-060, F2-061)
15. Select two clips › right-click › Nest clips; double-click it to enter, the breadcrumb's Back leaves; right-click › Un-nest. (F2-062)
16. AI › Import: paste examples/creator-packs/composition-documentary-mini.json; Build video; Upload a picture for "archive"; Add as new scenes. (F2-070)
17. With nothing selected, toolbar › Camera › Pan left: the badge says "Camera: Pan left"; the canvas stays still until Preview camera is ticked; Play shows the pan. (F2-071)
18. Manual (needs internet): Settings › Offline voice & captions › Download Whisper, then Auto captions with the "Offline Whisper" engine on an English clip and on a Hindi clip. (F2-090)

## With real keys

- Paste a Pexels or Pixabay key in Settings, press Test (Working), then search Photos and Videos; add one; check the credit.
- Paste a Freesound token, open Elements › Audio, play a preview, press "+".
- Paste a Sarvam (Hindi) or ElevenLabs key; Voice-over › pick the engine and a voice › Preview › Save to Media.
- Paste a Deepgram key; right-click a clip with speech › Transcribe, then Auto captions.
- Run `npm run models:pin` once on a computer with internet and commit `src/speech/whisper-models.json`.

## Decisions for the owner

- New dependency `@huggingface/transformers` 4.3.1 (Apache-2.0) as you allowed; installing it also pulls its Node-only packages (`onnxruntime-node`, `sharp`, about 320 MB on disk, installed with `--ignore-scripts`); nothing of them reaches the browser bundle. Keep, or ask for a slimmer runner (`onnxruntime-web` only).
- Camera preview turns canvas picking off instead of mapping clicks through the camera (D-284). Say if you want the full inverse mapping.
- Library panels are 380 px from 1440 px for library categories only (Scene keeps 320 px), so the canvas narrows a little when a library is open on 1440 to 1799 px windows (D-284).
