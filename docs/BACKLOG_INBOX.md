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
  2026-09-24 | W2-C TL-027 | A pasted linked pair can shift apart when only one target track is occupied (the insert rule runs per track); consider landing linked groups as one block.
  2026-09-24 | W2-C TL-032 | Trimming a linked clip trims only that clip; linked trimming is not built.
  2026-09-24 | W4-A follow-up | Resolved: CV-008 is built under interaction contract revision 4 (D-051); CV-022, TL-017 and MED-035 are fixed.
  2026-09-24 | W4-A MED | Unused media bytes stay in OPFS or IndexedDB after undo or opening another project; add garbage collection once asset delete (MED-011) exists.
  2026-09-24 | W4-A MED | Files dropped on a timeline track or the canvas are imported only; they could also be placed at the drop point in one step.
  2026-09-24 | W4-A MED | Media cards have no "missing media" badge when a project references bytes this browser lacks (MED-020 Relink covers it).
  2026-09-24 | W4-A MED | The import queue is sequential; a second import while one runs is refused with a message rather than queued.
  2026-09-24 | W4-B VID | Reversed clips play by seeking frame by frame, which can look choppy on long-GOP footage; a WebCodecs decoder (D-005) would make reverse smooth.
  2026-09-24 | W4-B TL | The "No layers in this composition." line below the tracks shows even when every layer is a clip (legacy-row empty state).
  2026-09-24 | W4-B MED | Animated GIFs draw as the browser's live animation, not in step with the timeline (VID-008).
  2026-09-24 | W4-C AUD | Audio is decoded whole into memory (files over 512 MB are silent); long recordings need streaming decode.
  2026-09-24 | W4-C AUD | Track mute is a project edit, so it pauses playback; consider applying mute live without stopping (like solo).
  2026-09-24 | W2-E CV | Add link (right-click): attach a URL to a layer. Dropped from W2-E by the owner; revisit when a web or PDF export exists (D-068).
  2026-09-24 | W2-E CV | Context toolbar rows for groups, multi-selections and audio layers, and the "None" row (Select, Pan, Zoom, Grid, Guides, Snap), from UX spec 4.1.
  2026-09-24 | W5-C ANI | Grey out the toolbar's Animate button for group children (they have no clip, so presets cannot apply); today clicking it does nothing.
  2026-09-26 | W2-F1 CV | The timeline menu uses the shared capability rules but still renders its own buttons; move it onto the shared menu renderer (context-menu.ts) with the timeline clip context.
  2026-09-26 | W2-F1 CV | The spec's cluster items Refresh (reset) and Comment are not built; Lock waits for CV-024.
  2026-09-26 | W2-F1 CV | Front and back layer order have no shortcut (the global matcher takes no Alt chords, and Shift changes the bracket key on most layouts).
  2026-09-26 | W2-F5 TXT | Copy style (CV-039) copies only size and color from text; it could also carry the W2-F5 font, weight, italic, alignment, spacing and case.
  2026-09-26 | W2-F5 TXT | Letter spacing or a wider font can push unwrapped text past its box's right edge, where it is clipped (as a large font size already is); consider growing the width like the height.
