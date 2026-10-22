# FIX3 checklist

States: `[x]` DONE (code + test or opened screenshot), `[B]` BLOCKED (external reason), `[ ]` not ticked, `[F]` needs full run later (time box: full e2e not run this round).

## Part 1, panels
- [ ] 1.1 Shared panel shell: one scroller per panel that fills to the bottom
- [ ] 1.2 Toast never hides a panel's scroll area
- [ ] 1.3 Composition and Themes cards show Built after a build
- [ ] 1.4 Real geometry test for every panel at 1920 × 940 and 1366 × 768

## Part 2, Whisper
- [ ] 2.1 Root cause per suspect (a) to (e)
- [ ] 2.2 Pipeline in a module Web Worker; Cancel terminates it
- [ ] 2.3 Real steps, heartbeat watchdog, per-step timeouts
- [ ] 2.4 Smallest model by default, language flags, configurable model source
- [ ] 2.5 Self-test runs in the worker with step timings
- [ ] 2.6 Long-task diagnostics
- [ ] 2.7 Tests: responsiveness, flood, heartbeat loss, failures, success, real runner
- [ ] 2.8 Report per suspect

## Part 3
- [ ] 3.1 Other main-thread freezes

## Part 4
- [ ] 4.1 Shelf fix verified at 1366 × 768
- [ ] 4.2 One toast, auto-hide, never over a panel
- [ ] 4.3 docs/samples plan-hi-honey.json and plan-en-honey.json with a unit test
- [ ] 4.4 Camera panel: one Camera title
- [ ] 4.5 Build dialog label width
- [ ] 4.6 Composition card status with a unit test for all three states

## End
- [ ] E1 reports/FIX3.md, screenshots opened
- [ ] E2 Try-it script
- [ ] E3 Full verify (not run: time box)
