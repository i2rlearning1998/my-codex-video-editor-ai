# T-SERIES: progress checklist

Brief: the owner's T-series message (2026-10-04): drag-and-drop repair, Clipchamp timeline drop rules, no empty lanes, layout, Player bar, text auto-grow, readable branded UI. One branch `claude/t-series` (from `claude/j-series`; PR #17 is not merged), one draft PR, never merged by Claude.

References: `docs/reference/frames/` (clipchamp_* target, ours_* bugs) and `docs/reference/changes of timeline panel.pdf` (the brief names it `changes_of_timeline_panel.pdf`; the uploaded file has spaces in its name). Both were found on `claude/j-series` and pulled in.

Decisions start at D-169. After a usage limit, the owner says "continue": resume from the first unticked part.

| Part                                   | Status | Last commit   |
| -------------------------------------- | ------ | ------------- |
| T1 Drag-and-drop repair                | done   | c001718       |
| T2 Canvas drop preview                 | done   | 8dd25b9       |
| T3 Timeline drop rules, no empty lanes | done   | (this commit) |
| T4 Layout                              | todo   |               |
| T5 Player bar                          | todo   |               |
| T6 Text live auto-grow                 | todo   |               |
| T7 Readable branded UI, finish         | todo   |               |

## Notes for a resuming session

- Run e2e from a snapshot (`/tmp/claude-0/snaprun.sh <out> <specs>`), one run at a time. Run only the affected specs after each part; run the full `npm run verify` once at the end.
- The sandbox browser is Chromium 141 (no H.264 or AAC). PB-010 is a known sandbox-only flake (STATUS.md).
