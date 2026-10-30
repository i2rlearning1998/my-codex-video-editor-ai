# Ledger audit (29 Oct 2026)

Every row still marked **Todo** in docs/FEATURES.md, sorted by what it really is. Source: the fix-5 editor audit, the Phase-0-finish prompt and the tests found by `npm run ledger`. Rows whose tests pass were promoted to Verified (13 today).

Todo rows: 300

## A. Parked "finish Phase 0" list (small editor features, not built) (43)

APP-009, LAY-006, LAY-011, KEY-012, KEY-013, KEY-014, CV-005, CV-010, CV-019, CV-033, LYR-009, LYR-013, LYR-014, LYR-015, TL-007, TL-031, TL-034, TL-050, TL-054, PB-007, INS-008, INS-017, HIS-005, TXT-032, TXT-033, SHP-008, SHP-010, SHP-012, SHP-014, SHP-016, SHP-023, FX-013, TR-008, TR-009, MSK-006, AUD-010, AUD-014, AUD-016, EXP-013, EXP-014, EXP-017, EXP-018, REL-006

## B. Built in another form or "not needed" by design; row text is stale (140)

APP-001, APP-002, APP-003, APP-010, APP-011, APP-012, APP-013, APP-014, APP-016, LAY-001, LAY-005, LAY-007, LAY-009, LAY-010, LAY-017, LAY-019, LAY-021, LAY-025, LAY-026, LOC-007, LOC-009, KEY-004, KEY-010, KEY-011, KEY-016, PRJ-007, PRJ-008, PRJ-011, MED-005, MED-008, MED-010, MED-011, MED-016, MED-017, MED-020, MED-021, MED-022, MED-028, MED-029, MED-030, MED-031, CV-014, CV-020, CV-021, CV-023, CV-024, CV-027, CV-028, CV-029, CV-030, CV-032, LYR-003, LYR-004, LYR-005, LYR-007, LYR-010, LYR-011, TL-002, TL-003, TL-005, TL-006, TL-008, TL-010, TL-011, TL-013, TL-015, TL-033, TL-036, TL-037, TL-038, TL-039, TL-040, TL-041, TL-042, TL-043, TL-045, TL-048, TL-049, TL-051, PB-003, PB-004, PB-005, PB-008, PB-012, PB-013, PB-014, INS-001, INS-005, INS-011, INS-012, INS-013, INS-014, INS-015, INS-016, HIS-003, TXT-005, TXT-006, TXT-007, TXT-008, TXT-009, TXT-011, TXT-012, TXT-013, TXT-019, TXT-020, TXT-022, TXT-025, TXT-026, TXT-027, TXT-028, TXT-029, TXT-030, TXT-031, SHP-007, SHP-009, SHP-011, ANI-012, VID-007, VID-013, FX-001, FX-002, FX-005, FX-006, FX-007, FX-008, FX-009, FX-011, FX-012, TR-001, TR-002, TR-003, TR-005, TR-006, TR-007, MSK-002, MSK-003, MSK-005, AUD-001, AUD-004, AUD-006

## C. Later phases (gateway, website, plugin, hosting) or owner-deferred (94)

APP-008, APP-020, LAY-012, LOC-011, LOC-012, PRJ-018, PRJ-019, MED-025, MED-026, MED-027, MED-033, MED-034, CV-034, TL-052, TL-053, HIS-006, TXT-021, TXT-034, TXT-035, TXT-037, SHP-017, SHP-025, ANI-011, ANI-013, ANI-014, ANI-015, ANI-016, ANI-017, ANI-018, ANI-019, ANI-020, VID-014, FX-003, FX-014, MSK-004, CLR-002, CLR-003, CLR-004, CLR-005, CLR-006, CLR-007, CLR-008, CLR-009, TPL-001, TPL-002, TPL-003, TPL-004, TPL-005, TPL-006, TPL-007, TPL-008, TPL-009, EXP-010, EXP-011, EXP-012, EXP-015, EXP-016, REL-002, REL-003, REL-004, REL-005, REL-007, REL-008, REL-009, ACC-001, ACC-002, ACC-003, ACC-004, ACC-005, ACC-006, QA-001, QA-002, LIB-032, ADV-001, ADV-002, ADV-003, ADV-004, ADV-005, ADV-006, ADV-007, ADV-008, AI-001, AI-002, AI-003, AI-004, AI-005, AI-006, AI-007, AI-008, AI-009, AI-010, AI-011, AI-012, AI-013

## D. Not built, not yet classified (23): all built in FIX8 (30 Oct 2026)

Each one now has a passing test with its ID in the title and is Verified, except PRJ-015: the Projects library is in IndexedDB, but the current project's autosave slot deliberately stays in localStorage because it must be written synchronously when the tab closes. So PRJ-015 is Claimed, not Verified (decision, not a gap).

DEV-012, APP-006, APP-007, APP-017, APP-018, APP-019, LOC-008, LOC-010, KEY-015, PRJ-015, PRJ-016, PRJ-017, MED-012, MED-032, CV-015, LYR-006, TL-022, TL-024, TL-026, TL-029, PB-006, VID-004, VID-008

## E. FIX9 (30 Oct 2026)

FIX9-001 to FIX9-007 (scene panel, review from card, scroll, in-panel asset views, captions and Whisper, themes, Draw) each have a passing test with the ID in its title.

## Not promoted

- MED-003: its e2e fails on the base branch too (headless Chromium here lacks the codecs); run it on the Windows PC.
- FX-014: the test is only a proof of concept; the sandboxed plugin API is Phase 4.
