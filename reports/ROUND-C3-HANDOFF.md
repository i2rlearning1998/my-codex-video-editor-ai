# Round C3 handoff

Branch `claude/round-c3-parity`, draft PR #56 to `claude/round-c2-mcp`. LIMIT MODE: targeted specs only.

| Part | State | Ledger |
| --- | --- | --- |
| 0 Fix what C2 left (CI read, code graphics in the card, OAuth grants in the store, login paths, Connect Claude page) | Done | RDC3-001 to 009 |
| 1 The Director's logic, shared | Done | RDC3-010 to 017 |
| 2 Assets step for Claude | Done | RDC3-020 to 024 |
| 3 Project style, Style chat, upgrade step | Done | RDC3-030 to 034 |
| 4 Editor's full power (code-graphic ops, capability matrix, guard, live data, check-and-fix) | Done | RDC3-040 to 043 |
| 5 A Claude video is a tool video (AI library) | Done | RDC3-050 to 052 |
| 6 Readymade Style structure and Door 2 | Not started | |
| 7 Rulebook appliesTo (schema and manual done in Part 1), C3 TEXTS, skill | Partly: `appliesTo` and Claude's manual view exist; TEXTS not loaded | |
| 8 Docs, report | Not started | |

Last commit: see `git log -1`. Next step: Part 6, the Readymade Style fields on styleSchema (status exists already, optional), validateStyle, the panel's published-only lists, list_styles/get_style(style_id)/create_project(style_id)/start_video_from_style.
