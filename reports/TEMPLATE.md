# Report: <Wave and name> (<date>)

## 1. Summary
<At most 8 lines, plain language. What can the owner now do that he could not before? What still cannot be done?>

## 2. Scope and results
| ID | Result (Verified / Bug / Not done) | Evidence (test title or file) |
|---|---|---|
| | | |

- In-scope P0 items Verified: N of M
- Not done, with reason: <list or "none">

## 3. Checks (paste the real output tails, not a description)
- `npm run verify`: <exit code>
- Format: <result>  Typecheck: <result>  Build: <result, sizes>
- Unit and jsdom tests: <N passed in F files>
- E2E tests: <N passed, N expected-fail> in <browser and version>
- Ledger validation: <output>
- CI: <not run, no remote | link and result>

## 4. Try-it script for the owner (max 15 steps, about 10 minutes)
| # | Do this | Expect | ID | Codex ran it (Y/N) | Screenshot |
|---|---|---|---|---|---|
| 1 | | | | | |

## 5. Deviations from the brief
<"None" or a list with reasons>

## 6. Decisions made
<Each with reason. Also appended to docs/DECISIONS.md>

## 7. Not tested, known gaps, risks
<Be specific. An empty section is a red flag.>

## 8. Architecture and contract impact
- Schema version change: <none | vX to vY, migration, fixture>
- New dependencies: <name, version, size, reason, alternatives | none>
- Files added, removed, moved: <summary>
- Contracts touched: <none | which and why>

## 9. Ledger and backlog
- Status changes made: <IDs>
- Ledger Change Requests applied: <none | list>
- Added to docs/BACKLOG_INBOX.md: <count>

## 10. Git
- Branch: <>  Tag: <>
- `git log --oneline <prevTag>..HEAD`:
- Review patch: `reports/<Wave>.patch` and `reports/<Wave>.stat.txt`

## Owner tick-list (owner fills this in and sends it to Claude)
| ID | OK / BUG / MISSING / CHANGE | One sentence |
|---|---|---|
| | | |
