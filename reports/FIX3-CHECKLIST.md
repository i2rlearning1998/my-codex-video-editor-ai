# FIX3 checklist

States: `[x]` DONE (code + test or opened screenshot), `[B]` BLOCKED (external reason), `[ ]` not ticked, `[F]` needs full run later (time box: full e2e not run this round).

## Part 1, panels
- [x] 1.1 Shared panel shell: one scroller per panel that fills to the bottom (Media, AI, My Templates shelves; FX3-001, screenshots reports/fix3/panel-*.png opened). Other panels were not audited.
- [ ] 1.2 Toast never hides a panel's scroll area (not done)
- [ ] 1.3 Composition cards show Built after a build: status badge done (Built / Needs assets / Not built); scene count on the card, thumbnail change, Rebuild and Themes cards not done
- [ ] 1.4 Geometry test for every panel: only Media, AI and My Templates (desktop) and Media (1366); the full list of panels, the right panel types and check (c) "last item fully revealed" are not done
## Part 2, Whisper
- [x] 2.1 Root cause per suspect (a) to (e), see reports/FIX3.md §2
- [x] 2.2 Pipeline in a module Web Worker; Cancel terminates it (FX3-002, FX3-003)
- [ ] 2.3 Heartbeat watchdog (15 s, 120 s during one run) and the stopped-responding message are done (screenshot reports/fix3/whisper-stalled.png opened); the new step labels ("Downloading model 42 / 75 MB", "Found N captions") and the 60 s download-stall timeout are not done
- [ ] 2.4 Smallest model by default (tiny is already the only active model); the Settings "Model source" URL is not done
- [ ] 2.5 Self-test in the worker with step timings (not done)
- [ ] 2.6 Long-task diagnostics (not done)
- [x] 2.7 Tests: responsiveness (CPU-bound fake inside the worker), 20 000-event flood, heartbeat loss, Cancel; failure classes and success are the existing FX1-010 and U11 tests, now running through the worker (all pass)
- [B] 2.7b Real runner with the real model: huggingface.co is refused by the sandbox network (D-274)
- [x] 2.8 Report per suspect (reports/FIX3.md §2)
## Part 3
- [ ] 3.1 Other main-thread freezes (not audited)
## Part 4
- [ ] 4.1 Shelf fix at 1366 × 768: Media passes, but its cards get 51 % of the panel (target 60 %); not ticked
- [ ] 4.2 One toast, auto-hide, never over a panel (not done)
- [x] 4.3 docs/samples plan-hi-honey.json and plan-en-honey.json with a unit test
- [ ] 4.4 Camera panel: one Camera title (code change made; no test and no screenshot)
- [ ] 4.5 Build dialog label width (CSS change made; no test and no screenshot)
- [x] 4.6 Composition card status with a unit test for all three states
## End
- [x] E1 reports/FIX3.md, screenshots opened
- [x] E2 Try-it script
- [F] E3 Full verify (not run: time box)

Counts: DONE 9 · BLOCKED 1 · needs full run later 1 · not ticked 12.
