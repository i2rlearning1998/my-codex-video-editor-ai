# FIX5 handoff (safety net)
Branch claude/fix-5 from claude/fix-4. Setup: `npm ci --ignore-scripts` (onnxruntime-node download fails offline).
- C1 done (library-thumb.ts: placeholder never blank, one retry, blank-picture check; ai-panel dedupe). Test LIB-020 in e2e/fix5.spec.ts.
- C2 done (components/audio-preview.ts, FX5-002).
- C3 done (css + FX5-003).
- C4 done (draw-palette.ts flyouts, FX5-004, docs/DRAW-CANVA-RESEARCH.md).
- C5 done. C6 done (plan-review.ts, ai-panel Video plans, FX5-006).
- C7 done (playback.ts prepare hook + shell, FX5-007).
- C8 done (group names, select menu 60vh, FX5-008).
- C9 done (worker watchdog, download stall + named errors, progress detail, cloud fallback; FX5-009). Real HF path unproven here.
- C10: not done yet.
