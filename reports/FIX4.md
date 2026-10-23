# FIX4 report

Branch `claude/fix-4`, on top of `claude/fix-3` (PR #45). Local verify is the gate; CI is left alone.

| Item | What changed | Proof |
| --- | --- | --- |
| A1 Toast | One toast at a time, bottom-centre, pauses on hover; moves to the top while a dialog is open | FX4-001, FX4-002; `reports/fix4/a1-toast.png` |
| A2/A3 Panels | Shelf header tighter on short windows; Media area is 60 % of the panel at 1366x768 | FX4-003, fix3-panels (both sizes) |
| A4 Composition card | "Built · N scenes" / "Needs assets · N scenes", poster of the first scene, "Build again" menu item | FX4-004; `a4-card.png` |
| A5 Whisper stages | Model start names its stages (speech engine, model, ready); load stalls after 60 s without a stage or progress, a run after 120 s | tests/speech/whisper.test.ts, FX3-003 |
| A6 Model source | Settings › Offline › Model source (https address, default Hugging Face), used for the download URL and the runner's host | FX4-006, FX4-007, FX4-008; `a6-model-source.png` |
| A7 Worker self-test | A short-lived worker reports WebAssembly, isolation, cores, library import; added to Copy diagnostics on a failed run | FX3-003 (no stray requests) |
| A8 Long tasks | PerformanceObserver counts page long tasks during a captions run or self-test; in Copy diagnostics | covered by typecheck and FX3-002 (page stays free) |
| A9 Resample | The 16 kHz resample (the long loop) runs in the worker. Decoding stays on the page (`decodeAudioData` is not available in workers) and is already native/async | FX3-002 |
| A10 Kit thumbnails | Starter kit cards draw the real item with the open theme's palette | FX4-004; `a10-kit.png` |

## V3: Video Plan v3 (the test video's gaps)
Found by building a real 9:16 Storywise-style test video (Circumference of the Earth, 126 s) from 10 pictures. The plan format was scene-based and small; the engine already had much more than the plan could say. v3 is one timeline plus the missing layer kinds.

| Gap seen in the test video | Fix | Proof |
| --- | --- | --- |
| 10 scenes, 10 timelines, 10 audio files, 12 scene / 180 s / 32 slot caps | `meta.build: "timeline"`: the whole plan is ONE scene; chapters are stretches of it; caps are now 40 chapters, 400 layers, 1800 s; Composition Spec items 600 per scene, 2000 total, 256 assets; one media slot per picture however often it is used | plan-v3.test.ts, FX4-010 |
| Logo and title tag baked into a picture, repeated per scene | `overlays[]` (real, editable layers over the whole video) | plan-v3.test.ts |
| One narration file per scene | `narrationTrack` (one file under the whole video; the video lasts at least as long) | plan-v3.test.ts |
| Text beneath media / kit background above everything | Stacking fixed: later layer covers earlier, kit backgrounds underneath, overlays on top | plan-v3.test.ts, FN3-021 |
| No diagrams | `shape` layers: rectangle, ellipse (outline or filled), line, arrow (dashed), arc, protractor; `enter: "wipe"` draws them on | plan-v3.test.ts |
| No soft edge | `feather` and `featherEdge` (a mask with feather) | plan-v3.test.ts |
| No thought or speech bubbles | `bubble` layers (body, tail, text) | plan-v3.test.ts |
| Character only swapped between 3 pictures | `poses`, `move`, `loop` (float, pulse, wiggle, spin) | plan-v3.test.ts; the camel walk in the test video |
| Plain text | `color`, `fontSize`, `weight`, `highlight`, `outline` (text effects) | plan-v3.test.ts |
| Anchors only | `at`, `width`, `height`, `rotation`, `opacity` in percent | plan-v3.test.ts |
| One camera shot per scene | `scene.cameras[]` with start and duration | plan-v3.test.ts |
| Review & swap broke on a timeline | In timeline mode it keeps the media swap, hides the per-scene controls and says why | FX4-010 |

Checked and **not** gaps: Hindi fonts (Noto Sans Devanagari and Poppins are bundled in `public/fonts`); MP4 export (the exporter writes H.264 MP4 where the browser can encode it; the sandbox Chromium cannot, so it fell back to WebM).
Still open: in-tool AI image generation (needs a provider key); a Hindi voice (needs a cloud TTS key).
Docs: `docs/video-plan.md` (v3 section), `docs/creator-playbook/07-plan-cheatsheet.md` (regenerated), new chapter `08-story-comic-explainer.md`, sample `docs/samples/plan-v3-diagram.json`.

## Audit (A9)
Measured in Node, 2 minutes of stereo 48 kHz: waveform peaks 54 ms, resample 141 ms (now in the worker). Other audio passes (analyze, ducking, mixdown, record-panel peaks) are single linear passes; a 10 minute clip is about 0.3 s each. None was moved.

## Tests run
typecheck (app and e2e), `prettier --check .`, full vitest (1240 passed; 2 tests in `tests/blocks/worker.test.ts` fail without these changes too: the sandbox has no WebAssembly in the worker), e2e on desktop: final3-plan, fix1-build, final2-u10-build, q4-ai-import, b1-styles, fix4.

## Not verified here
Real Hugging Face download, real Pexels/Pixabay/Freesound/cloud TTS, Google Fonts, real Chrome on Windows (the sandbox cannot reach them).
