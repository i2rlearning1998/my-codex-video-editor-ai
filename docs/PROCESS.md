# PROCESS.md: how work, reports and bugs are handled

## 1. Roles

| Role                           | Does                                                                                                                                                         | Does not                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **Owner**                      | Sets priorities (P0/P1/P2), tests by hand with the try-it script, reports findings by ledger ID                                                              | Write code, paste long logs, record videos                                                            |
| **Claude (lead and reviewer)** | Writes briefs, owns the ledger structure, reviews reports and patches against contracts and scope, triages MISSING and CHANGE, writes Ledger Change Requests | Run the app, run tests, or see the repository directly. Claude reviews text, patches and reports only |
| **Codex (implementer)**        | Implements one brief, proves it with real-browser tests, fixes its own failures, reports honestly, fixes BUGs the owner sends                                | Decide scope, add unlisted features, start the next wave                                              |

## 2. Wave lifecycle

1. **Brief.** Claude writes `briefs/W<n>.md` (scope by ledger ID, non-goals, contracts touched, UI notes, required tests, stop rules).
2. **Session.** The owner starts a new Codex thread and pastes the standard start prompt (see `briefs/TEMPLATE.md`). One brief per thread.
3. **Inner loop (inside Codex).** Implement, run `npm run verify`, fix, repeat until every in-scope P0 item is Verified or explicitly listed as not done.
4. **Report.** Codex writes `reports/W<n>.md`, updates the ledger and `docs/STATUS.md`, creates `reports/W<n>.patch` and `reports/W<n>.stat.txt`, tags `w<n>`.
5. **Owner test.** The owner runs the try-it script from the report (about 10 minutes) and fills the tick-list: each line is an ID and one of `OK`, `BUG`, `MISSING`, `CHANGE`, plus one sentence.
6. **Triage** (section 3). BUGs go straight to Codex. MISSING and CHANGE go to Claude.
7. **Gate review.** The owner sends Claude `reports/W<n>.md`, `reports/W<n>.patch`, `reports/W<n>.stat.txt`, `docs/STATUS.md`, and the tick-list. Claude replies **Accept**, **Accept with fixes** (a fix brief) or **Reject** (with reasons).
8. **Next brief.**

Do not send zips to Claude unless Claude asks. Do not paste long terminal logs; the report already contains the important parts.

## 3. Triage: BUG, MISSING, CHANGE

| Type        | Definition                                                                  | Goes to                                          | Action                                                                               |
| ----------- | --------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| **BUG**     | The ledger item exists, was `Verified` or claimed done, and behaves wrongly | Codex, directly, in the same thread or a new one | Write a failing Playwright test, fix, keep the test as regression, update the ledger |
| **MISSING** | No ledger item covers it, or the item is `Todo`                             | Claude                                           | Claude adds a ledger item (LCR) and plans the wave. It is not a bug                  |
| **CHANGE**  | Works as written but the owner wants different behavior                     | Claude                                           | Claude edits the ledger item (LCR) and re-plans                                      |

Use this test: _find the behavior in `docs/FEATURES.md`._ Present and Verified but wrong means BUG. Not present means MISSING. Present but not what you want means CHANGE.

### Bug message template (owner to Codex)

```
BUG <ID> <one line>
Steps: 1) ...  2) ...
Expected (from ledger): ...
Actual: ...
First write a failing Playwright test for this, then fix it, and keep the test as a regression test.
Then run npm run verify and report in 5 lines.
```

For several bugs use one message with one block per ID. **Batch rule:** test a whole session, collect every finding, send them together. Do not send bugs one at a time. **Escalation rule:** if the same bug is not fixed after two attempts, send Claude the ID, the last patch (`git diff`), and the test output.

## 4. Ledger Change Requests (LCR)

Claude edits scope through an LCR so IDs never shift. Codex applies an LCR as housekeeping at the start of the next session and mentions it in the report.

- **Add:** append a new row in the section with the next free number (`TL-062`), never renumber.
- **Remove:** set status `Dropped` and add a one-line reason in `docs/DECISIONS.md`. Never delete rows.
- **Reword, re-prioritize, move wave:** edit the row in place.
- Codex may otherwise change only the `Status` column.

## 5. What "Verified" means

An item is `Verified` only when all of these hold:

1. A test whose title starts with `[ID]` exists.
2. For browser behavior it is a Playwright test in real Chrome or Edge (jsdom never counts).
3. It passed in the latest `npm run verify` (locally, and in CI once a remote exists).
4. `npm run ledger` accepts the ledger.

`Claimed` means it may exist but is unproven. `Bug` requires a `test.fail('[ID] ...')` reproduction.

## 6. Commands (defined in Wave 0)

| Command                                 | Purpose                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                         | format check, typecheck, unit tests, build (unchanged legacy gate)                                                  |
| `npm run e2e`                           | Playwright tests in real Chrome or Edge                                                                             |
| `npm run e2e:headed`                    | Same with the browser visible                                                                                       |
| `npm run e2e:report`                    | Open the HTML report                                                                                                |
| `npm run ledger`                        | Validate `docs/FEATURES.md` against the tests. Add `-- --summary` for a table, `-- --require-seeds` to close Wave 0 |
| `npm run patch -- <base> <head> <name>` | Write the review patch and stat to `reports/`                                                                       |
| `npm run verify`                        | `check` + `e2e` + hook assertion + `ledger`. The only definition of green                                           |

## 7. Owner try-it script convention

Every report contains a numbered script of at most 15 steps, about 10 minutes. Each step: what to do, what should happen, and the ledger ID. The owner answers each with `OK`, `BUG`, `MISSING` or `CHANGE`. Codex has already run every step itself and lists the screenshot path.

## 8. Context hygiene for Claude chats

- Start each wave in a **new** Claude chat.
- Keep `AGENTS.md`, `docs/PROCESS.md`, `docs/FEATURES.md`, `docs/STATUS.md` and `docs/DECISIONS.md` in the Claude Project files. Replace them after each accepted wave.
- Paste `docs/SESSION_STARTER.md` as the first message of a new chat or as the Project instructions.

## 9. Where things live

| Path                    | Content                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| `AGENTS.md`             | Permanent rules                                                               |
| `briefs/`               | One brief per wave and a template                                             |
| `docs/FEATURES.md`      | Feature Ledger                                                                |
| `docs/STATUS.md`        | Current state, updated every wave                                             |
| `docs/DECISIONS.md`     | Approved decisions                                                            |
| `docs/BACKLOG_INBOX.md` | Unplanned ideas found during work                                             |
| `docs/specs/`           | Vision and reference documents                                                |
| `docs/archive/`         | Superseded documents kept for history                                         |
| `reports/`              | Wave reports, patches and stats                                               |
| `e2e/`                  | Playwright tests                                                              |
| `tests/`                | Vitest tests and fixtures (`tests/fixtures/media`, `tests/fixtures/projects`) |
| `scripts/`              | Ledger, patch and hook assertion scripts                                      |
