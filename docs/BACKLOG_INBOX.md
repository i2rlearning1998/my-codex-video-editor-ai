# BACKLOG_INBOX.md

Unplanned ideas and out-of-scope findings. One line each: `date | found while doing | idea or observation`.
Codex appends here and never builds from it. Claude triages into the ledger with an LCR.

2026-09-22 | W1-CODEX | PRJ-006 transparent background deferred by owner; requires an authorized schema migration in a later wave.

- Wave 1 combined delivery retains imperative DOM panels/dialogs; reconcile with D-003 React migration in a future brief without changing canonical state ownership.
2026-09-23 | W2-CLAUDE brief | Out of scope by owner instruction: waveform rendering for audio clips (TL-047), 3D/nested-timeline breadcrumb navigation (TL-052), custom track colours UI (TL-034 and track colour).
2026-09-23 | W2-CLAUDE brief | Wave 3 candidates, each needs its own design brief: Cut/Copy/Paste clips (clipboard state, TL-027), Replace media (VID-009), Detach audio (cross-track linking, TL-032/VID-006), Compound clip (nesting, TL-052).
2026-09-23 | W2-CLAUDE | Track header expand/collapse (UX spec timeline.trackHeader) has no ledger item yet.
2026-09-23 | W2-CLAUDE | Inspector Timing section could show and edit clip speed, reverse and freeze frame.
2026-09-23 | W2-CLAUDE | Reverse and freeze frame live in clip.metadata under schema 4; promote to first-class clip fields at the next authorized schema bump.
2026-09-23 | W2-CLAUDE | Moving a clip (mouse or Alt+Arrow) can still overlap a neighbour; needs the TL-020/TL-030 insert/overwrite rule.
2026-09-23 | W2-CLAUDE | Most timeline.ts strings (toolbar, menu, aria labels) are still hard-coded English; the LOC-001 literal check does not cover src/ui/timeline.ts yet.
