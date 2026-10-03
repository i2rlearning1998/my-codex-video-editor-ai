# J-SERIES: progress checklist

Brief: the owner's J-series message (2026-10-03): fix the PR #16 test findings (J1 to J6), then a Clipchamp-style timeline, Player panel and right panels (J7 to J15). One branch `claude/j-series`, stacked on `claude/i-series` (PR #16 is still open), one draft PR (never merged by Claude). Reference: `docs/reference/clipchamp-panels-and-menus.pdf` (owner upload).

Decisions start at D-151 (the I-series used D-136 to D-150, so D-150 is taken).

Tick an item only when its step is committed and `npm run verify` is green. One commit per step.

- [x] Audit report (reports/J-AUDIT.md)
- [ ] J1 Scene isolation
- [ ] J2 Gradient fill and keyboard undo
- [ ] J3 NumberField everywhere
- [ ] J4 Real text editing
- [ ] J5 Weights and vertical align
- [ ] J6 Element timing, Alt text, Resize canvas to selection
- [ ] J7 Lane model
- [ ] J8 Empty and loading states
- [ ] J9 Drag and drop guides
- [ ] J10 Clip and selection visuals
- [ ] J11 Magnetic snapping and gaps
- [ ] J12 Transitions
- [ ] J13 Player panel and collapse
- [ ] J14 Right-click menus
- [ ] J15 Right-panel redesign
- [ ] Report, ledger, docs, draft PR

## Notes for a resuming session

- Run e2e with the snapshot scripts used by earlier series (one at a time): copy the tree to a snapshot directory and run Playwright there, so edits in the working tree do not race the dev server.
- The sandbox browser is Chromium 141 (no H.264 or AAC). PB-010 is a known sandbox-only flake (STATUS.md).
