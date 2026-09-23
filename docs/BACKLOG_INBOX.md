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
  2026-09-23 | W2-CLAUDE TL-057 test | A marker added at the playhead sits under the playhead handle and cannot be grabbed until the playhead moves; consider raising markers above the playhead handle or a marker hit area in the ruler.
  2026-09-24 | W2-B LYR-002 | The layer list is back-to-front (paint order, first row = backmost). Many editors list front-first; owner to confirm, possible CHANGE.
  2026-09-24 | W2-B CV-008 | Alt+edge (and likely Alt+corner) resize from center is not built; needs a transform-interaction contract review.
  2026-09-24 | W2-B | Asset cards appear under the default Scene/library view but not under the Media tab, which shows only the Import placeholder.
  2026-09-24 | W2-B | The Inspector Timing fields show raw floats after frame nudges (for example 3.0333333333), against the "no raw floating-point numbers in the UI" rule.
  2026-09-24 | W2-B TL-001 | Group children have no timeline rows; a future item could show them nested inside the group clip (expand/collapse).
  2026-09-24 | W2-B follow-up | Resolved: LYR-002 order is front-first (D-043); Inspector raw floats fixed (D-046); Media tab cards became ledger bug MED-035 (D-044).
  2026-09-24 | W2-B follow-up | CV-008 Alt-from-center needs an explicit owner decision to open TRANSFORM_INTERACTION_CONTRACT.md before anyone attempts it (D-045).
