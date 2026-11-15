# ROUND-C1-FINISH (owner prompt, saved verbatim)

LIMIT MODE (read first, obey throughout)

- One session, one run, parts in order. No sub-agents, no parallel agents.
- After each part: run only the tests that part touches, commit, push. No full suite per part.
- Full `npm run verify` exactly once at the very end; then re-run only failed specs.
- CI: check once after the final push. No polling, loops or scheduled check-ins.
- Short plain status messages. Never merge. No unrequested features, no restyling.
- Every item below is DONE with proof or BLOCKED with an outside reason. "Not built" is not allowed.
- You are the tester: rough, impatient, wrong-clicking user in real Chromium. Look at every screenshot.
- If usage runs out: stop, commit, push, write reports/ROUND-C1-HANDOFF.md.

BRANCH

- Stay on `claude/round-c1-power`, same draft PR #54. Read briefs/ROUND-C1.md and reports/ROUND-C1.md first. This session finishes Round C1; it adds nothing new. Save this prompt as briefs/ROUND-C1-FINISH.md.

PART F1 Red tests (do this first; they may be caused by this round)

1. PB-010 and PB-009 did not fail on Round B's CI. Run each spec 10 times on `claude/round-b-ai-mode` and 10 times on this branch (`--repeat-each 10`). If this branch is worse, find the change that caused it (scene fade-in, poster/first-content frame, lazy chunks, thumbnail service) with git bisect on the specific spec, and fix the code, not the test. If it is equally flaky on both, prove it with the numbers and say so.
2. LAY-048: reproduce at the CI viewport and find the cause; fix without weakening the assertion.
3. "Projects dialog picture check": say if it is a DEV-012 baseline test. If yes, mark BLOCKED with the reason and the regenerate command. If no, it is a regression: fix it.
4. The 4 DEV-012 failures stay BLOCKED until the UI phase (reason and commands already in the report).

PART F2 Looking at the result (C1.5.2, C1.6.2)

1. `renderFrames(project, times[])` in the browser through the editor's own render adapter, off-screen, small PNGs, supplied to src/tools through the browser interface.
2. Authoring loop sample-frame step: after validation, render frames of every new graphic; a blank frame or drawing outside the canvas triggers ONE fix call with the findings; two failures refuse with the owner's text and charge nothing.
3. Vision check through the gateway when the model has vision ("does this match the plan, what is wrong?"); skipped, with a plain note, when it has none. Test with a scripted mock model.
4. Tests: blank graphic, off-canvas graphic, graphic that throws, graphic that loops, cancel during the check, reload and resume.

PART F3 Media choices (C1.3)

1. Review & swap shows "Picked by AI" and up to four alternatives per media layer; swapping is one undo step.
2. The Brief card's asset rule (order, aiImagesMax, aiVideosMax, onlyMine) fills `meta.assets` of the plan; "Use only my files" tested with nothing uploaded.
3. A reference link in the Brief card goes to the research step (C1.4.3) through fetchPage, wrapped as untrusted. Test with the injection fixture.

PART F4 Captions and voices by provider kind (C1.3.5)
Speech-to-text and text-to-speech providers go through the same registry, REST descriptor and capability sheet as stock. Test: add a fake REST captions provider and a fake REST voice provider in config; the capability sheet lists them; a plan uses them; disable them; they disappear; the offline engines still work with none configured. Licence/attribution kept.

PART F5 Rough-use tests that are missing
List every item of the ROUGH-USE CONDITIONS in briefs/ROUND-C1.md in the report with its test name, or BLOCKED with a reason. Write the missing ones now. Then invent at least five more per part (F1 to F4), test them, and list them.

FINISH

- Ledger rows RDC1- for everything new; update reports/ROUND-C1.md: the checklist with every item DONE or BLOCKED, replace the "Not built" list, updated test counts, the cause of PB-010, PB-009, LAY-048, and a note that no real model or provider was used.
- docs/DECISIONS.md, docs/STATUS.md, CHANGELOG.md.
- One full `npm run verify`, fix, re-run failed specs only, push, check CI once, report in plain words and stop.

CHECKLIST (DONE with proof, or BLOCKED with outside reason)
[ ] F1 PB-010/PB-009 cause found (numbers on both branches) [ ] LAY-048 cause [ ] Projects dialog check classified [ ] DEV-012 reason kept
[ ] F2 renderFrames in browser [ ] sample-frame fix loop [ ] vision check or plain skip [ ] tests
[ ] F3 Picked by AI + alternatives [ ] Brief asset rule into the plan [ ] reference link to research [ ] injection test
[ ] F4 captions and voices by kind with add/remove test
[ ] F5 every rough-use condition has a test or BLOCKED reason [ ] five new per part
[ ] report, ledger, decisions [ ] full verify once [ ] CI checked once
