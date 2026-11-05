# Brief P3-ENGINE: payments, entitlements, admin API, Studio fields engine, memory logic

Part 1 of 3. Implementer: Codex. Branch: `codex/p3-engine`, created from `claude/phase2-r3-ui`.
Authority: `AGENTS.md`, then this brief, then `docs/CONTRACTS-P3.md` and `src/contracts/p3.ts`. This brief explicitly overrides the end-of-session steps of AGENTS.md section 2 where `docs/CONTRACTS-P3.md` section 3 says so (no edits to STATUS, DECISIONS, FEATURES, CHANGELOG; no tag; no review patch). Read `docs/CONTRACTS-P3.md` and `src/contracts/p3.ts` fully first. Also read `docs/SERVER.md`, `docs/GATEWAY.md`, `server/app.ts`, `server/store.ts`, `server/auth.ts`, `src/gateway/ledger.ts`.

## 1. Goal

After this part the server can take real payments through hosted checkout and grant credits only from a verified webhook, answer "may this person do this?" in one place, run an admin API with an audit trail and emergency switches, and the repo has the Studio fields engine and the memory logic as tested pure code. No screens.

## 2. In scope (build in this order, commit after each)

**E1. Payments** (`server/payments/**`; contract: `PaymentGateway`, `CheckoutRequest`, `PaymentEvent`, `WebhookError`, `PaymentWebhookResult`)

- Adapters for Razorpay, Stripe and PayPal using hosted checkout only, over the existing server HTTP transport style (secrets by name from the server environment, e.g. `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`). A missing name means `connected()` is false and no request is made.
- `verifyWebhook` per provider with its documented scheme (Razorpay and Stripe HMAC-SHA256 over the raw body, Stripe timestamp tolerance; PayPal verification via the provider's verify call or certificate scheme, whichever you can prove against your fake). Constant-time compare. Reject stale events beyond `webhookReplayWindowSeconds`.
- `server/payments/routes.ts`: `POST /v1/payments/checkout` (auth), `POST /v1/payments/webhook/<provider>` (no auth, signature only, raw body kept for the signature), `GET /v1/payments/me` (the person's own payments). Mount in `server/app.ts` inside the `P3-ENGINE` block.
- Webhook handling: credits from the CONFIG pack or plan, ledger key `pay:<provider>:<eventId>`; duplicate/replay = `duplicate: true`, nothing added; amount or currency mismatch = `WebhookError('amount-mismatch')`; unknown user = `unknown-user`. Subscription renew grants the plan's monthly credits once per `(plan, period)`. Refund: `refund:<provider>:<eventId>`, optional revoke of the credits that payment gave (never below the person's available balance; the shortfall is recorded, not hidden).
- Secrets for the key vault: add `putSecret/getSecret/listSecrets/deleteSecret` (opaque `{ciphertext, iv, tag, last4, updatedAt}` records, see CONTRACTS-P3 rev 1.2) to the `Store` interface and all three stores, plus a service-role-only `secrets` table in the migration. You own `server/store.ts`, `server/supabase-store.ts` and `tests/server/store.test.ts`.
- Payment records in the `Store` (add methods to the `Store` interface and implement them in memory, file and Supabase stores; the shared contract test must pass on all three).
- Test fake: `tests/fakes/payments.ts` (a local HTTP server per provider that signs webhooks the way the real one does).

**E2. Entitlements** (`server/entitlements/**`; contract: `Entitlements`, `SignedEntitlements`, `EntitlementService`, `LimitAction`)

- `resolve` from the person's plan in config, their flags and suspension; HMAC-SHA256 over canonical JSON (sorted keys) with `ENTITLEMENT_SECRET`; `verify` checks signature (constant time) and expiry.
- `check` covers every `LimitAction`; it reuses the existing limit logic in `src/gateway/checks.ts` and `server/` counters instead of duplicating it; adds `chat-message` (per-day), `attach` and `vision` using the settings passed in (`P3AdminSettings`), never constants. Refusal text comes from config `limitMessages` where it exists, else one plain sentence.
- `GET /v1/entitlements` (auth). Emergency `aiOff` makes `check('ai-call')` fail with a clear failure; suspended people fail every action.

**E3. Admin API** (`server/admin/**`; contract: `AdminClient`, `AdminUserRow`, `AuditRow`, `EmergencySwitches`, `AdminMetrics`)

- All routes under `/v1/admin/*`, 403 for a non-admin, with a plain sentence. Users list/search/filter with cursor; user detail with ledger and payments; adjust credits (idempotent ledger key from a caller-supplied request id; reason required); set plan; suspend; flags; refund (through the payment gateway, with `revokeCredits`); audit; emergency; metrics from usage and ledger.
- Audit log: append-only, SHA-256 chain (`hash = sha256(prevHash + canonical row)`); every admin change and every failed admin attempt writes a row; `audit` returns `chainOk`. Store gets `appendAudit/audit` methods in all three stores. Add the SQL for Supabase (`supabase/migrations/20261105000000_p3_engine.sql`: payments, audit_log append-only with the same "no update/delete even for owner" trigger style as `credit_ledger`, flags, emergency; RLS: people read only their own payments; audit and flags admin-only) with policy tests in the existing style.
- `src/admin-client/http.ts`: the HTTP implementation of `AdminClient` (fetch, bearer token supplied by the caller, plain-sentence errors).

**E4. Studio fields engine** (`src/studio-engine/**`; contract: `ParamDecl`, `FormSpec`, `StudioEngine`, `AssembledRequest`)

- `buildForm`, `visible`, `defaults`, `validate`, `assemble` exactly as typed. `assemble` is deterministic: `prompt` role is the main text; `prompt-part` fields appended as `Label: value` in `order`; `negative` becomes `negativePrompt`; `param` fields go to `params[sends]`; `units` sets the price units (a count, seconds or characters as the param declares); `reference` fields go to `references`; `ui` is never sent. Hidden (showIf) fields are never sent. `validate` never changes a value: it only reports an error for a number outside min/max (and for a missing required field, an unknown option, a wrong type); it returns no corrected values. `assemble` never clamps or corrects either, it sends what it is given. Clamping while the person types is the UI's job, not the engine's.
- Ship reference param sets as **data, not config**, in `src/studio-engine/reference-params.ts`, for the owner to copy into models: image (prompt, negative prompt, aspect, count, seed, prompt strength, style cards, quality), video (prompt, negative prompt, aspect, duration, resolution 480p/720p, seed, camera motion, audio on/off, reference image), voice (text, language, voice, speed, pitch, emotion, pauses), music/sound (prompt, mood, genre, minutes, instrumental toggle), captions (language, style, max line length), thumbnail (title, subject, text overlay, style). These are a **starting point marked unverified**: the owner will replace them after comparing with Autodraft AI.

**E5. Memory logic** (`src/memory/**`; contract: `MemoryEngine`, `StyleRecord`, `ProjectMemory`, `ChatRecord`, `ChatSummary`, `MemorySettings`, `TextCall`)

- `summarise`, `context`, `extractFacts`, `distillStyle` as typed, pure over the injected `TextCall`. Token estimates by a documented character heuristic (no tokenizer dependency). `context` is bounded by `settings` and always puts the Style first and read-only. `extractFacts` deduplicates against existing facts (normalised text) and respects `maxFacts` (pinned facts are never dropped). `distillStyle` returns `status: 'draft'`, validates the model's JSON with zod, repairs once, otherwise fails with one plain sentence; `rules` at most `maxStyleRules`.
- Prompts are plain exported strings in `src/memory/prompts.ts` (the owner will move them to config later).

## 3. Out of scope

Any screen. The Director, the Studio service, key vault, storage backends, login hardening, the editor chat (Part 2). Changing `src/contracts/p3.ts`, the project schema, the config schema, `src/platform-config/**`. Real provider calls. New runtime dependencies (use `node:crypto` and `fetch`).

## 4. Required tests (titles start with the ID)

Unit/server tests under `tests/p3-engine/**`, run against fakes. Each of these must exist and fail when the protection is removed (mutate once and say so in the report):

- `[P3E-0xx]` webhook: good signature applies; bad signature, wrong secret, tampered body, stale timestamp, malformed JSON each rejected with the right `WebhookError.reason`; duplicate event adds credits once; replay after a restart (FileStore) still once; amount mismatch rejected; unknown user rejected; ten parallel identical webhooks add once.
- Refund: with and without revoke; revoke never overspends; refund replay once.
- Entitlements: tamper (changed plan, changed expiry) fails verify; expired fails; suspended refuses every action; emergency `aiOff`; each `LimitAction` allows below and refuses at the limit; limits come from the settings argument.
- Admin: non-admin gets 403 on every route (table-driven over all routes); every change writes one audit row; audit chain verifies and an edited row makes `chainOk` false; credit adjust is idempotent by request id; refund goes through the gateway fake.
- Store contract test passes on Memory, File and (skipped with the reason when no live project) Supabase for the new methods; SQL policy tests: a person cannot read another's payments, cannot read audit or flags, cannot update or delete an audit row.
- Studio engine: table tests per reference param set (each role lands where it should; hidden fields never sent; negative prompt; seed; units); `validate` errors per rule; `assemble` is stable (same input, same output, snapshot).
- Memory: summarise keeps `keepRecent` verbatim and covers older turns; `context` stays under the token bound; facts dedupe and pinned survive; `distillStyle` draft status, repair-once, failure sentence; all with a fake `TextCall`.
- A test that scans every response body and every log line of the server tests for the fake secrets and finds none.

## 5. Report (`reports/P3-ENGINE.md`)

Use `reports/TEMPLATE.md` sections. Add: decisions (D-370 to D-379) as rows ready to paste; ledger rows P3E-001... ready to paste (status Verified only with a passing test naming it); test counts by layer; the mutation checks you made; **what was not tested** (live providers, live Supabase, real webhooks, concurrency across processes); deviations from this brief and why. Do not write "complete" or "all"; list built-and-verified, built-but-unverified, not built.

## 6. Acceptance

- [ ] `npm run verify` exits 0 once, at the end (or the exact blocked step is reported)
- [ ] Only files from section 2 of `docs/CONTRACTS-P3.md` (Part 1) changed, plus the `P3-ENGINE` block in `server/app.ts`
- [ ] `src/contracts/p3.ts` unchanged; code compiles against it without `any` casts
- [ ] No secret value in code, logs, errors or answers
- [ ] Report written; working tree clean; branch pushed only if the owner asked
