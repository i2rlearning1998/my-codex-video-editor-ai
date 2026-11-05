# Report: P3-WIRING, Part 2 of 3 (2026-11-05)

## 1. Summary

The Director, Studio, the three memory levels, attachments with pictures, the key vault, storage backends, the sign-in guard and the editor's chat engine now exist as tested code behind the interfaces in `src/contracts/p3.ts`. There are no screens: the integrator (Part 3) switches the UI from its mocks to these services.

Everything that talks to a model provider, Google Drive or Supabase has only been run against **local fakes**. Live behaviour is unproven.

Part 1 (Codex: memory logic, Studio fields engine, entitlements) was not merged when this was built. Every use of it goes through a small stand-in written from the contract (`tests/p3-wiring/stubs/engines.ts`), and the real modules are wired in one place (`src/wiring/engines.ts`).

## 2. Scope and results

Every brief item W1 to W9 is built. Ledger IDs P3W-001 to P3W-037 each have a passing unit test that names them (Vitest, Node). None of them is an e2e test, because this part has no screens.

| Item | IDs | Result | Evidence |
| --- | --- | --- | --- |
| W1 config additions | P3W-001 to P3W-004 | Verified (unit) | `tests/p3-wiring/config.test.ts` |
| W2 data model and memory levels | P3W-005 to P3W-008 | Verified (unit) | `tests/p3-wiring/store.test.ts` |
| W3 Director service | P3W-009 to P3W-015 | Verified (unit, fake providers) | `tests/p3-wiring/director.test.ts` |
| W4 attach and vision | P3W-016 to P3W-018 | Verified (unit, fake providers); PDF: simple PDFs only | `tests/p3-wiring/attach.test.ts` |
| W5 Studio service | P3W-019 to P3W-022 | Verified (unit, fake providers) | `tests/p3-wiring/studio.test.ts` |
| W6 key vault | P3W-023 to P3W-026 | Verified (unit and through the real server, fake providers) | `tests/p3-wiring/vault.test.ts` |
| W7 storage backends | P3W-027 to P3W-029 | Verified (unit); Drive against a fake only | `tests/p3-wiring/storage.test.ts` |
| W8 login hardening | P3W-030 to P3W-033 | Verified (unit) for the guard, the local backend and the server checks; the Supabase path is built but not tested | `tests/p3-wiring/login.test.ts` |
| W9 editor chat engine | P3W-034 to P3W-037 | Verified (unit, real EditorEngine; real server with the fake Anthropic for charging) | `tests/p3-wiring/editor-chat.test.ts` |

- Not done, with reason:
  - **Vision and Studio parameters on the gateway server.** The server's adapters must be wrapped with `visionAdapters(...)`, and `/v1/run` must pass `images` and `params` through. Both lines are outside the `P3-WIRING` block of `server/app.ts`, so they are left to the integrator. The browser-side gateway and the tests use the wrapped adapters.
  - **PDF.** Built without a dependency, but it reads only simple PDFs (standard-encoded text, uncompressed or Flate). PDFs with custom font encodings (common for Hindi), scanned or encrypted PDFs are refused with "No text could be read from this PDF. Paste the text instead."

### Ledger rows (ready to paste into `docs/FEATURES.md`, new section "P3-WIRING")

| ID | Pri | Wave | Status | Feature |
| --- | --- | --- | --- | --- |
| P3W-001 | P0 | W10 | Verified | Config: an old stored config still parses; `p3` settings (chat, vision, memory, attach, login, entitlement ttl, webhook window) and `models[].params` get sample defaults; `p3Settings(config)` |
| P3W-002 | P0 | W10 | Verified | Config: combos (role → model) refused with a plain sentence when a model is unknown or does not serve the role; `comboModels` |
| P3W-003 | P0 | W10 | Verified | Config: campaigns refused when they end before they start or name an unknown plan; `activeCampaigns(config, now, plan)` |
| P3W-004 | P0 | W10 | Verified | Config: style caps per plan (`capFor`); unknown plans refused |
| P3W-005 | P0 | W10 | Verified | Style, project memory and chat records are per person; another person sees none of them |
| P3W-006 | P0 | W10 | Verified | Style, project and chats-per-project caps enforced on create with a plain sentence and Upgrade |
| P3W-007 | P0 | W10 | Verified | The three start paths (Style, Brief, blank) make the same chat; Brief answers become the first facts |
| P3W-008 | P0 | W10 | Verified | "Make this my Style" saves a draft; a draft is never read into a call; accept makes it active, version + 1 |
| P3W-009 | P0 | W10 | Verified | Refusals and the scope gate run before any model call: zero requests, zero credits |
| P3W-010 | P0 | W10 | Verified | A message streams thinking, the reply, a question, memory and done; credits charged from one hold |
| P3W-011 | P0 | W10 | Verified | The model context starts with the Style block; no chat writes a Style |
| P3W-012 | P0 | W10 | Verified | Chat off, the daily limit, aiOff and a suspended person stop a message before any call or hold |
| P3W-013 | P0 | W10 | Verified | A gateway failure is one failure event and the hold is refunded |
| P3W-014 | P0 | W10 | Verified | A plan goes through validatePlan with one repair; each scene carries a source (ai, stock, library, mine); a failing plan is refused with the owner's sentence and costs nothing |
| P3W-015 | P0 | W10 | Verified | A long history is summarised before the call |
| P3W-016 | P0 | W10 | Verified | Attach checks type, size and vision from settings; bytes in the media store, never the chat; text and simple PDFs read as data |
| P3W-017 | P0 | W10 | Verified | The vision cost (credits per image) is in the estimate and in the ledger; too many pictures are refused before any call |
| P3W-018 | P0 | W10 | Verified | A model without vision is never sent an image; the person is told which models can; Anthropic, OpenAI and Gemini image inputs in their documented shapes |
| P3W-019 | P0 | W10 | Verified | Studio form from the chosen model's params; preview and estimate from the assembled units |
| P3W-020 | P0 | W10 | Verified | Studio run reserves, calls with the assembled prompt and params, settles and saves to the Asset Library |
| P3W-021 | P0 | W10 | Verified | Studio provider failure refunds the whole hold and saves nothing; an invalid form or a refused entitlement makes no call |
| P3W-022 | P0 | W10 | Verified | Enhance rewrites only the prompt text fields, costs credits and leaves choices alone |
| P3W-023 | P0 | W10 | Verified | Key vault: AES-256-GCM at rest with a random IV per value; list shows the last four characters only |
| P3W-024 | P0 | W10 | Verified | Key vault: a wrong KEY_VAULT_SECRET cannot decrypt; only provider key names; a reason is required |
| P3W-025 | P0 | W10 | Verified | Key vault: Test makes the provider's cheapest call; a bad key fails without leaking it |
| P3W-026 | P0 | W10 | Verified | /v1/admin/keys is admin only; a vault key connects the provider (vault first, then env); no answer or log holds the key |
| P3W-027 | P0 | W10 | Verified | Storage backends platform, local and Drive (fake) pass one contract test |
| P3W-028 | P0 | W10 | Verified | The plan's storage limit is respected on put |
| P3W-029 | P0 | W10 | Verified | Storage choice per person in prefs; Drive without a token is not connected |
| P3W-030 | P0 | W10 | Verified | Sign-in guard: per-email and per-IP counters, growing lock, window, maximum |
| P3W-031 | P0 | W10 | Verified | One sentence for an unknown email and a wrong password; the local backend goes through the guard |
| P3W-032 | P0 | W10 | Verified | A suspended person cannot sign in; the server refuses suspended people and sessions older than a password change |
| P3W-033 | P0 | W10 | Verified | The password rule at sign-up and reset comes from config |
| P3W-034 | P0 | W10 | Verified | Editor chat: a proposal is checked by the editor validators and applies as one undo step |
| P3W-035 | P0 | W10 | Verified | Editor chat: an invalid proposal is repaired once, then one plain failure |
| P3W-036 | P0 | W10 | Verified | Editor chat: discard leaves the project byte-identical; an unknown selection or a blocked plan makes no call |
| P3W-037 | P0 | W10 | Verified | Editor chat: each call is charged on the gateway server like any call |

## 3. Checks

One full `npm run verify` ran at the end (1 h 30 min). It exited 1. Then only the failed tests were run again.

- Format check: passed ("All matched files use Prettier code style!"). Typecheck: passed (app and e2e configs).
- Unit and jsdom tests (Vitest, Node 20): 195 files, 1,451 passed, 2 skipped (the Supabase store contract tests, which need a live project). This includes the 46 P3-WIRING tests and the SQL policy tests on a throwaway PostgreSQL 16.
- Build: passed. Bundle check: "Editor bundle: 92 files, no owner app, no server code, no bundled library payloads. Editor page 16 chunks without panel, website or gateway code; panel and website without the editor."
- E2E (Playwright, the sandbox's Chromium, HeadlessChrome 153, at 1920 × 940 plus the 1366 project): 690 passed, 9 failed, 10 did not run.
  - **P2R1-018: from this round, fixed.** I had added a full stop to the sign-in failure sentence ("The email or password is wrong."), and the panel test checks the exact text. The sentence is back to what it was; re-run alone, it passes.
  - **P2R2-034 and P2R2-008: not from this round.** P2R2-034 is a 14 px sideways scroll on the panel home at 360 px. P2R2-008 is a click time-out and a null server address in the test. Both were run on `claude/phase2-r3-ui` itself and fail the same way there. This part touches no screen.
  - **F2-012, LIB-024, FX4-001, FX4-002, FX4-004, FX4-010 (1366 px): known old failures** (docs/BACKLOG_INBOX.md, "known, not from this round").
  - DEV-006, the error guard's deliberate failing probe, ran as expected.
- Re-run after the fix: `npx vitest run tests/p3-wiring tests/cloud` 48 passed (46 + 2). In the browser, P2R1-018 passed, and F2-012, LIB-024, P2R2-034 and P2R2-008 failed as they do on the base branch.
- Ledger (`npm run ledger`, the last step of verify): refuses the 37 new IDs ("test references unknown ledger ID P3W-0xx"), because `docs/FEATURES.md` is the integrator's file. With the rows of section 2 pasted in (done locally, then reverted) it says **"Ledger OK"**. So the blocked step is the ledger, and pasting the rows unblocks it.
- CI: not checked (LIMIT MODE: local verify is the gate; the branch is not pushed).

## 4. Try-it script for the owner

This part has no screens, so there is nothing to click yet. The integrator's Part 3 report will have the try-it script. What can be run now:

| # | Do this | Expect | ID | Ran it | Screenshot |
| --- | --- | --- | --- | --- | --- |
| 1 | `npx vitest run tests/p3-wiring` | 46 tests pass, all against local fakes | P3W-001 to P3W-037 | Y | none (no UI) |

## 5. Deviations from the brief

- **`tests/panel/isolation.test.ts`** (not a Part 2 file): one line adds `src/wiring` to the list of panel-side folders. Without it, the existing import-boundary test counts the Director and Studio services as editor code, because they use the gateway and Director. The editor still imports none of them; `src/editor-chat` (editor side) imports no gateway, Director or panel code.
- **`server/app.ts`**: besides mounting the routes, four small `P3-WIRING` blocks were needed: an import; the vault setup (it replaces the server's env with the vault-first view); a JSON body reader for PUT and DELETE (the server read POST bodies only); and PUT and DELETE in the CORS methods header. No existing line changed.
- **Gateway adapters** (`src/gateway/**`, not a Part 2 file): the brief asks to extend the Anthropic, OpenAI and Gemini request builders. To stay inside Part 2's files this is done by wrapping them (`src/wiring/vision.ts`): the wrappers reuse each adapter's own request and parse code and add the images in the documented shapes. `src/gateway` is unchanged.
- **Key vault store**: the brief says the sealed values go "in the Store". `server/store.ts` is not a Part 2 file, so the vault has its own small store: a `keys.json` file next to the server's data (mode 600), or memory when the server's store is in memory. A Supabase table for the vault is not built.
- **Audit rows**: Part 1's chained audit log is not merged yet. Until it is, the vault's rows go to the server log (names, reasons and the last four characters only). `p3Setup` takes the real `audit` function as its last argument.
- **`docs/FEATURES.md`** could not be edited (integrator file), so `npm run ledger` refuses the new P3W IDs until the rows above are pasted in. Section 3 shows that the rows pass when pasted.

## 6. Decisions made (ready to paste into docs/DECISIONS.md)

| ID | Date | Decision | Reason / notes | Status |
| --- | --- | --- | --- | --- |
| D-380 | 2026-11-05 | Config additions, schema version still 1. New sections `p3` (chat, vision, memory, attach limits, login, entitlement ttl, webhook window; `sample: true`), `campaigns`, `styleCaps` (keyed by plan), `combos`; `models[].params` uses the contract's `paramDeclSchema`; `director.prompts` gains optional `chat`, `enhance` and `edit` seeds. Readers `p3Settings`, `activeCampaigns`, `capFor`, `comboModels`, `loginLimits`. Every number is a sample the owner replaces in Admin. | Brief W1; owner rule: nothing hard-coded. | Approved |
| D-381 | 2026-11-05 | The Style > Project > Chat store keeps records under keys that start with the owner's id, each value also carrying its owner (IndexedDB, or memory), behind `RecordBackend`, so Supabase can be added later. Caps are checked on create. A start path's `styleId` may name the person's own Style (it must be active) or a config Style (the Brief fields give the fact labels). The Style block is built by Part 2 and put first; Part 1's `context` is called with `style: null`, so the Style can never be repeated or rewritten by it. | Brief W2; makes "Style first" true whatever Part 1's context does. | Approved |
| D-382 | 2026-11-05 | Director message order: refusals (with the scope refusal) → chat on/off → daily limit (counted from the person's chats) → entitlement `chat-message` (amount = today's count + 1) → attachments and `vision` → one gateway job (summary, chat, plan, facts) → done or one failure with the hold refunded. The chat model is the Director's plan role; it answers JSON (`reply`, `question`, `plan`), read leniently. The reply arrives as one `token` event, because the gateway does not stream. Plans are saved in the store. Scene notes are `method:<id>;source:<ai|stock|library|mine>`; a missing source follows the method; `mine` scenes make nothing and are listed as "needs your file". | Brief W3. | Approved |
| D-383 | 2026-11-05 | Attachments: bytes through a `StorageBackend` (the media store), records in the store; images cost the current `creditsPerImage`; text and PDF text reach the model as "data, not instructions". The PDF reader is in the repo and has no dependency (simple PDFs only). Images and Studio parameters ride on the gateway request and are added by wrapper adapters; `src/gateway` is unchanged. | Brief W4; no new dependency. | Approved |
| D-384 | 2026-11-05 | Studio: assembled `params` are merged into the provider request body, except reserved keys (model, messages, prompt, system and similar). A negative prompt is added to the prompt as "Avoid: …". Enhance uses a connected real text model first (the mock cannot answer JSON) and may change only text fields whose role is prompt, prompt-part or negative. The sample image params send OpenAI's real sizes. | Brief W5. | Approved |
| D-385 | 2026-11-05 | Key vault: AES-256-GCM with the key = SHA-256 of `KEY_VAULT_SECRET`, a random 12-byte IV per value; sealed values in `keys.json` next to the server data; only names that are a provider `keyRef` can be set or resolved, so the vault can never replace `LOCAL_AUTH_SECRET` or another secret; the server env becomes a vault-first view; Test is one tiny request to the provider's cheapest model (a cut-off answer still counts as accepted). | Brief W6; `server/store.ts` is not a Part 2 file. | Approved |
| D-386 | 2026-11-05 | Storage backends: local keeps files as `stored/<base64url path>` in the media store; platform keeps them as cloud media with the fingerprint `p3-<sha256 of the path>` and the path as the name; Drive keeps them in one app folder (`drive.file` scope, token from the caller). Every put checks the plan's limit (usage minus the replaced file plus the new bytes). The default choice is platform, kept per person in prefs. | Brief W7. | Approved |
| D-387 | 2026-11-05 | Sign-in guard: failures counted per email and per IP in a window; a lock begins at the limit and doubles with each further failure, up to a maximum; success clears the email, not the IP. Suspension is told only after the right password. The server refuses suspended people and tokens issued before a password change (hooks `suspended`, `sessionsValidFrom`). Supabase: Supabase Auth checks passwords and rate-limits on its own server; this guard is an extra lock in the browser, and a password change also signs out the person's other sessions (`signOut({ scope: 'others' })`). | Brief W8; does not claim more than the browser can enforce. | Approved |
| D-388 | 2026-11-05 | Editor chat engine: proposals may use only 17 command types (properties, names, timing, keyframes, clip settings, a scene's background, markers) and only the selected scenes; every proposal is checked with `EditorEngine.preview`; one repair with the exact errors; a proposal is checked again if the project changed before `apply`. The model call is injected (`remoteAsk` uses the server's `/v1/run`), so editor code imports no gateway or Director. | Brief W9; editor bundle rules. | Approved |
| D-389 | 2026-11-05 | Process: `src/wiring` is panel and server code in the isolation test; the P3W ledger rows are in this report for the integrator; nothing in the editor imports `src/wiring` or `src/editor-chat` yet, so neither is in the editor's bundle (the build's bundle check passes). | CONTRACTS-P3 section 3. | Approved |

## 7. Not tested, known gaps, risks

- **Only fakes:** every provider call (Anthropic, OpenAI, Gemini, xAI, ElevenLabs), image input for vision, and Studio parameters in real provider bodies. Live behaviour is unproven.
- **Google Drive:** proven against a local fake of the Drive v3 endpoints only. Real OAuth, quotas and resumable uploads are untested.
- **Supabase:** the sign-in guard, the password rule and "sign out other sessions" in `src/cloud/supabase.ts` are built but not run, not even against the stand-in.
- **IndexedDB store** (`indexedDbBackend`) is not run in tests (no IndexedDB in Node); the same store logic is tested on the memory backend.
- **Built against stand-ins for Part 1:** the memory engine (`summarise`, `context`, `extractFacts`, `distillStyle`), the Studio engine (`buildForm`, `visible`, `defaults`, `validate`, `assemble`) and the entitlement service (`check`). When Part 1 merges, its own behaviour (for example how it assembles prompts) may change results; the wiring itself does not depend on those details.
- **Server-side vision and Studio parameters** are not wired (section 2).
- **Streaming:** replies arrive as one `token` event, not word by word.
- **Session revocation in the local backend:** it keeps one session per browser, so "other sessions" do not exist there; the server and Supabase paths carry the rule.
- **PDF:** custom-encoded (common for Hindi), scanned and encrypted PDFs are refused.
- **Concurrency:** chat daily counts and caps are checked per browser store, not across devices; the server's entitlement check (Part 1) is the authority.
- **Base-branch failures for the backlog:** P2R2-034 (panel home 14 px too wide at 360 px) and P2R2-008 (the server e2e) fail on `claude/phase2-r3-ui` too; they belong in the known list next to F2-012, LIB-024 and the FX4 ones.
- **No e2e:** this part has no screens. Its behaviour in a real browser is tested when Part 3 switches the UI to these services.

## 8. Architecture and contract impact

- Schema version change: none (project schema 9; config schema 1, additive).
- New dependencies: none.
- Files added: `src/wiring/**`, `src/editor-chat/index.ts`, `src/storage-backends/index.ts`, `src/cloud/login-guard.ts`, `server/keys/index.ts`, `server/keys/mount.ts`, `tests/p3-wiring/**`, `docs/P3-WIRING.md`, this report.
- Files changed: `src/platform-config/{schema,defaults,prompts,resolve}.ts`, `src/director/{planner,llm-planner,build}.ts`, `src/cloud/{local,supabase}.ts`, `server/auth.ts`, the `P3-WIRING` blocks of `server/app.ts`, `tests/panel/isolation.test.ts` (one line, section 5).
- Contracts touched: none. `src/contracts/p3.ts` is unchanged, and the code compiles against it without `any`.

## 9. Ledger and backlog

- Status changes made: none (the rows above are for the integrator).
- Ledger Change Requests applied: none.
- Added to `docs/BACKLOG_INBOX.md`: none (integrator file).

## 10. Git

- Branch: `claude/p3-wiring` (from `claude/phase2-r3-ui`). No tag, no review patch (CONTRACTS-P3 section 3). Not pushed: the brief says to push only if the owner asks.
- Commits (oldest first):
  - `e37144b feat(config): P3 settings, model params, campaigns, style caps, combos [P3W-001..004]`
  - `688db13 feat(wiring): Style > Project > Chat store, caps, start paths, Style drafts [P3W-005..008]`
  - `3d10e39 feat(director): Director service, scope gate, per-scene source, chat prompt in config [P3W-009..015]`
  - `6377918 test(panel): src/wiring is panel and server code in the isolation check [P2R1-021]`
  - `e7124db feat(wiring): attach and vision: limits, PDF text without a dependency, vision request shapes, vision cost [P3W-016..018]`
  - `9e3e181 feat(wiring): Studio service: form from model params, estimate, run with settle and refund, Enhance [P3W-019..022]`
  - `dcebd1f feat(server): key vault, AES-256-GCM at rest, vault-first key resolution, /v1/admin/keys [P3W-023..026]`
  - `e828b9e feat(storage): platform, local and Drive storage backends with the plan's storage limit [P3W-027..029]`
  - `d1f8e45 feat(auth): sign-in guard with growing locks, one failure sentence, suspended and revoked sessions refused, password rule from config [P3W-030..033]`
  - `329f825 feat(editor-chat): select-and-edit engine: proposals checked by the editor validators, one repair, one undo step [P3W-034..037]`
  - `1c2ed31 fix(auth): keep the sign-in failure sentence as it was; literal storage test titles [P2R1-018][P3W-027][P3W-028]`
  - plus this report's commit
