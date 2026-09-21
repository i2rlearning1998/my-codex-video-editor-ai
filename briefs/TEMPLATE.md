# Brief W<n>: <title>

Wave: <n>. Base tag: `w<n-1>`. End tag: `w<n>`. Branch: `wave-<n>-<slug>`.
Authority: `AGENTS.md`, then this brief, then `docs/FEATURES.md`.

## 1. Goal

<Two or three sentences. What can the owner do after this wave that he cannot do now?>

## 2. In scope (ledger IDs)

<Explicit list of IDs, grouped. Nothing outside this list may be built.>

## 3. Out of scope

<Explicit list. Name the tempting things that must not be touched.>

## 4. Ledger Change Requests to apply first

<None, or a list: Add / Dropped / Reword rows, exactly as they must appear.>

## 5. Contracts, schema and dependencies

<Frozen contracts touched (if any), schema version change (if any, with migration and fixture), dependencies approved for this wave.>

## 6. Design notes

<Interaction details that are easy to get wrong: exact behavior, edge cases, keyboard, cursor, snapping rules, error messages. This is where past "80 percent done" failures are prevented.>

## 7. Steps

<Ordered steps, each with acceptance.>

## 8. Required tests

<Per ledger ID: what the Playwright test must prove. Fixtures to use from tests/fixtures/media.>

## 9. Acceptance

- [ ] `npm run verify` exits 0
- [ ] Every in-scope P0 ID is Verified, or listed as not done with a reason
- [ ] Report, patch, stat and tag exist; working tree clean

## 10. Stop rules

<When to stop and report instead of improvising.>

---

## Standard start prompt (owner pastes this into a new Codex thread)

```
Read AGENTS.md, docs/PROCESS.md and briefs/W<n>.md now. Execute the brief exactly as written and follow the session protocol in AGENTS.md. Do not start any other wave. Finish by writing reports/W<n>.md, creating the patch and tag, and then stop.
```
