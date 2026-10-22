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

## Audit (A9)
Measured in Node, 2 minutes of stereo 48 kHz: waveform peaks 54 ms, resample 141 ms (now in the worker). Other audio passes (analyze, ducking, mixdown, record-panel peaks) are single linear passes; a 10 minute clip is about 0.3 s each. None was moved.

## Not verified here
Real Hugging Face download, real Pexels/Pixabay/Freesound/cloud TTS, Google Fonts, real Chrome on Windows (the sandbox cannot reach them).
