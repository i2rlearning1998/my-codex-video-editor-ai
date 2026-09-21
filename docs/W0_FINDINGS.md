# W0 findings: baseline check of the T3 app (2026-09-20)

## How this was tested (and the limits)

- Claude opened the **production build in `dist/` from the owner's zip (built 14 Sep)** in Chromium 141 and used real mouse and keyboard through Playwright at 1440x1000. State was read through the app's own **Export JSON**. A project with tracks (`reference/nle-example.json`) was generated with the app's own engine code and opened through the app's real Open project input.
- Not the same as the owner's Chrome, not the dev server, and only the built version. If the source changed after 14 Sep, results may differ. Each check ran once; failures were re-run in isolation and confirmed. Nothing here is automated in the repo yet (Wave 0 lite adds that for a few items).
- Two early "failures" were mistakes in the test, not bugs, and were corrected: the app asks `window.confirm` before opening a project (a headless browser dismisses it), and clicking Export moves keyboard focus so later shortcuts did nothing.

## Result: 24 of 27 checks pass, 3 bugs

| ID      | Result  | Note                                                                                                                                                                             |
| ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| APP-004 | Pass    | valid project opens; invalid files rejected with a message, session unchanged                                                                                                    |
| APP-005 | Pass    | downloads `project.json`, schema 4                                                                                                                                               |
| PRJ-009 | Pass    | edit and project survive reload                                                                                                                                                  |
| MED-014 | Pass    | drag asset creates a clip; locked track and incompatible track reject with a status-bar message (the message can be overwritten by the autosave text within about half a second) |
| CV-001  | Pass    | select and deselect                                                                                                                                                              |
| CV-002  | Pass    | Shift and Ctrl toggle                                                                                                                                                            |
| CV-003  | Pass    | marquee                                                                                                                                                                          |
| CV-004  | Pass    | drag moves, one Undo restores                                                                                                                                                    |
| CV-007  | Pass    | corner scaling is proportional (also without Shift); opposite corner fixed                                                                                                       |
| CV-009  | Pass    | rotation handle rotates around the centre                                                                                                                                        |
| CV-011  | Pass    | text width grip changes width, font size and scale unchanged                                                                                                                     |
| CV-016  | Pass    | canvas zoom Fit, plus, minus                                                                                                                                                     |
| LYR-001 | Pass    | list, canvas and timeline selection stay in sync                                                                                                                                 |
| TL-004  | **Bug** | see below                                                                                                                                                                        |
| TL-009  | Pass    | ruler click and drag seek; canvas content follows time                                                                                                                           |
| TL-012  | Pass    | timeline zoom buttons                                                                                                                                                            |
| TL-016  | Pass    | within-track and cross-track moves, one Undo each                                                                                                                                |
| TL-018  | Pass    | left trim, clamped at source start and against the left neighbour                                                                                                                |
| TL-019  | **Bug** | see below                                                                                                                                                                        |
| TL-021  | Pass    | Split button and S key                                                                                                                                                           |
| TL-023  | Pass    | Duplicate button and Ctrl+D                                                                                                                                                      |
| TL-025  | Pass    | Delete key, one Undo restores                                                                                                                                                    |
| TL-035  | Pass    | Marker button                                                                                                                                                                    |
| PB-001  | Pass    | 1.000 s after about 1 s; Stop returns to 0 and holds                                                                                                                             |
| INS-002 | Pass    | Position X edit, one Undo restores                                                                                                                                               |
| HIS-001 | Pass    | drag is one step, Redo reapplies                                                                                                                                                 |
| REL-001 | **Bug** | see below                                                                                                                                                                        |

## Bugs (confirmed, reproduced in isolation)

**TL-004: Delete and Backspace delete clips on a locked track.**
Steps: open `nle-example.json`; click the lock button on Video 1; click clip-a; press Delete (or Backspace).
Expected: clip stays, status shows "Track is locked". Actual: the clip is removed (6 of 6 runs).
Correctly blocked on a locked track: drag, left and right trim, drag to another track, Split button, Duplicate button, S key, Ctrl+D.

**TL-019: right trim can overlap the next clip.**
Steps: open `nle-example.json`; drag clip-a's right trim handle 200 px to the right (clip-a is 0 to 2 s, clip-b starts at 3 s).
Expected: stops at 3 s (duration 3). Actual: duration 4.47 s, so clip-a (0 to 4.47) overlaps clip-b (3 to 5) on the same track. Trimming by exactly 1 s works. The left trim is protected against its neighbour, so this is one-sided.

**REL-001: console error on every fresh load.**
Steps: open the app in a fresh browser profile; open the console.
Expected: no errors. Actual: `Failed to load resource: 404`. Cause: `index.html` has no icon link, so the browser requests `/favicon.ico`.

## Other observations (not in the ledger as bugs; input for Waves 1 and 2)

- Ctrl+Z does not undo after a canvas drag (only when focus is inside the timeline). Ledger item KEY-003 (global shortcuts).
- Timeline shortcuts (Delete, S, Ctrl+D) do nothing after clicking a toolbar button outside the timeline, such as Export.
- Arrow-key nudge exists (ArrowRight moved the layer by 1 px); Shift+Arrow was not checked. CV-006 set to `Claimed`.
- Timeline body is fixed at about 122 px high at 1080p as well; only about 3 track rows show. At 1280x720 the Scene list is cut off below the Assets tiles.
- "Coming later" label overlaps the asset tiles; track names are truncated ("VIDEO · Vid...").
- Dragging a clip over a locked track and releasing applies only the horizontal move and rejects the vertical one. Unclear intended behavior; decide in Wave 2.
- Open project and Open example use the browser's native confirm dialog.
- No layout overflow at 1024x768, 1280x720, 1920x1080.

## Ledger changes made from this

TL-004, TL-019, REL-001 set to `Bug`; CV-006 set to `Claimed`; REL-001 moved to Wave 1; DEV-008 moved to Wave 4; DEV-012 moved to Wave 1.
