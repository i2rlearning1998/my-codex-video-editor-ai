# P3 engine integration notes (5 November 2026)

Based on `a8f1e1f`, preserving earlier engine commits, plus owner-requested cherry-picks `01c7322` and `54c332b` (contract rev 1.3). No UI or frozen-contract changes.

## Implemented exports

| Module                                  | Export                                                                  | Consumer                                          |
| --------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------- |
| `server/entitlements/index.ts`          | `createEntitlementService(deps): EntitlementService`                    | Server wiring                                     |
| `src/admin-client/http.ts`              | `createHttpAdminClient(base, token): AdminClient`                       | Admin wiring; origin or origin ending `/v1`       |
| `server/admin/audit.ts`                 | `nextAuditRow(previous, input)`, `verifyAuditChain(rows)`               | Persistent Store implementations                  |
| `src/studio-engine/index.ts`            | `createStudioEngine(): StudioEngine`                                    | Studio service                                    |
| `src/studio-engine/reference-params.ts` | `REFERENCE_PARAMS`, `REFERENCE_PARAMS_STATUS`                           | Owner reference only; explicitly unverified       |
| `src/memory/index.ts`                   | `createMemoryEngine(): MemoryEngine`, `estimateTokens(text)`            | Director/memory wiring                            |
| `src/memory/prompts.ts`                 | `SUMMARY_PROMPT`, `FACTS_PROMPT`, `STYLE_PROMPT`, `REPAIR_STYLE_PROMPT` | Exported prompts for later owner-config migration |

## Payments and persistent Store

Ownership is resolved. `createPaymentGateways(env, options?)` implements the frozen gateway interface. `createPaymentService(deps)` owns configured-price checkout, receipt application and refund requests; `createPaymentRoutes` mounts `/v1/payments/checkout`, `/webhook/:provider` and `/me` inside the app's marked blocks. No UI is changed.

Pass `ServerOptions.p3Settings()` (Part 2's current config settings), optionally `paymentOptions` (trusted provider plan mappings), and configured `SERVER_ORIGINS`. Without settings, endpoints return 503. Without provider environment keys, adapters make no request. The server's old mock `/topup` and `/plan` writes are disabled when P3 is enabled. Return addresses must match configured origins. Checkout prices are read from config (major currency units converted to integer minor units), never accepted from a caller.

Stripe uses hosted Checkout, pinned API version 2024-06-20, metadata, provider idempotency keys, raw-body HMAC, signed timestamp and event-age checks. Razorpay uses hosted Payment Links or subscriptions with explicitly injected provider plan ID and billing cycle count; raw-body HMAC and event age are checked. Stripe invoice and Razorpay renewal period starts map to the existing monthly `grant:<plan>:<YYYY-MM>` key. Subscription checkout alone grants no credits; the renewal/invoice event does. A successful renewal updates the profile's plan atomically with its receipt.

PayPal's adapter has OAuth, approval URLs, refund/cancel request shapes and RSA-SHA256 signature verification over transmission ID/time, configured webhook ID and raw-body CRC32. The route prepares its certificate asynchronously from a fixed HTTPS PayPal certificate-host/path allowlist, rejecting redirects; `verifyWebhook` itself remains synchronous. Certificates are bounded in memory and expiry-checked. **PayPal end-to-end checkout is not enabled:** frozen `paymentSchema.kind` excludes PayPal; order approval-to-capture orchestration and subscription billing-period resolution remain unimplemented. Do not enable it by relabelling another provider. Its fixture tests prove only the listed adapter operations.

Memory/File receipts and ledger changes persist together; Supabase uses the supplied transactional RPC. Duplicate event IDs and repeated successful charge IDs never grant twice. Full/partial refund requests are supported by adapters; if `revokeCredits` is requested, settlement revokes the remaining credits that payment gave, capped by available balance (including held reservations); shortfall is recorded. This intentionally revokes the remaining grant even for a partial money refund; the owner should review that policy before live payments. Refund settlement must arrive as a signed webhook. Dashboard-initiated refunds default to no credit revocation. Durable refund intents prevent ambiguous provider failures being blindly repeated. One admin refund operation per payment is allowed; a second partial-refund request needs reconciliation tooling, not a new request ID.

Durable checkout/refund claims remain pending after ambiguous I/O. There is no automatic reconciliation job or manual reconciliation screen yet; an operator must inspect the provider before recovering a pending operation. Successful provider replies finish their operation; refund completion and audit append are atomic. The per-server ledger view refreshes from Store before gateway ledger work, so external payment/admin changes are visible. Store writes also refuse a newly negative available balance. FileStore is single-process/single-instance; Supabase concurrency is designed in SQL but not runtime-proven here.

New Store methods: `profiles`, `payments`, `commitPayment`, `appendAudit`, `audit`, `commitAdmin`, `flags`, `emergency`, `bumpDaily`, `dailyCount`, `putSecret`, `getSecret`, `listSecrets`, `deleteSecret`, `claimOperation`, `getOperation`, `finishOperation`. `listSecrets` returns a name-to-opaque-record map, never plaintext. `bumpDaily(userId,name,day,limit?)` returns the new count, or -1 without increment at the limit. The three-argument form increments without a caller-supplied cap. `Profile.suspended` is optional/default false; existing files get additive empty collections. Apply `supabase/migrations/20261105000000_p3_engine.sql` before enabling the Supabase implementation. Secrets have no authenticated/anon table grant or RLS policy.

## Provider references checked (5 November 2026)

- Stripe raw-body/timestamp signature rules: https://support.stripe.com/questions/webhooks-what-to-do-when-the-http-status-code-starts-with-a-four-%284xx%29-or-five-%285xx%29
- Razorpay HMAC rules: https://d6xcmfyh68wv8.cloudfront.net/docs/webhooks/validate-test/
- Razorpay Payment Links shapes: https://github.com/razorpay/markdown-docs/blob/master/payments/payment-links/apis.md
- PayPal certificate/CRC32 verification: https://developer.paypal.com/api/rest/webhooks/rest/

## Entitlements

`EntitlementDeps` takes the existing Store methods (`profile`, `ledger`, `usage`, `counter`, `exportsCount`, `bumpDaily`), `config()`, `settings()`, `secret()`, a trusted `userState(userId)` lookup, `emergency()`, optional legacy `chatMessagesToday(userId)` (no longer used for admission), and optional `now()`. No suspension or flags are read from user-editable brand-kit data. Missing profiles/plans fail closed. `ENTITLEMENT_SECRET` is resolved server-side by the mounted route, never returned.

Pass `ServerOptions.p3Settings` to use persisted flags, suspension and emergency state, or the trusted non-Store overrides as `ServerOptions.p3Entitlements`. `GET /v1/entitlements` authenticates and resolves a signed payload. It returns 503 if those dependencies or the signing secret are absent. There are no hard-coded P3 settings defaults; Part 2 supplies them. The route does not silently create a profile or grant credits.

The signature covers recursively sorted JSON keys, with array order preserved. Verify checks strict shape, signature, issued time and expiry. Unlimited (`null`) plan limits are omitted from the signed numeric limits map. A suspended state also adds `suspended` to signed flags. Verification proves the signed snapshot at issuance, not that the account has not changed since: authoritative checks reload current state.

`check` reuses `preCheck`, Store counters, usage rows and `CreditLedger`. Counts are requested increments; `store` amount is additional MB; `ai-call` amount is requested credits; `attach`/`vision` amount is image count. Vision checks image count and available credits at the configured per-image price. Chat checks and consumes exactly one daily allowance atomically through Store; the Director must call once per message. Other actions are read-only decisions; Part 2 must still reserve work credits atomically. Legacy gateway routes are not rewritten to call this service in this part. Emergency AI refusal and suspension enforcement are proven through the service tests, not across every existing app call path.

## Admin HTTP client and audit helpers

Paths are under `/v1/admin`: `GET /users`, `GET /users/:id`, POST `/users/:id/credits`, `/plan`, `/suspension`, `/flags`; POST `/refunds`; GET `/flags`, `/audit`, `/emergency`, `/metrics`; POST `/emergency`. Filters/ranges are query parameters. Writes send JSON. Credit adjustments and refunds carry generated `requestId` values. No automatic retries are made; callers invoking the operation a second time create a new request ID. The server enforces a retried identical credit-adjustment request ID and atomically records the change and audit row. Refunds additionally claim the payment before provider I/O.

Bearer tokens are header-only. Redirects are rejected; error messages are fixed plain sentences rather than echoed server bodies. Read responses are schema-checked. Valid optional Hindi text stays optional under strict TypeScript.

Audit helpers compute `sha256(previousHash + canonicalJson(rowWithoutHash))`, starting with an empty previous hash and sequence 1. Verify the full chain from genesis **before** applying pagination/filtering. Store append/commit methods serialize chain allocation; Memory/File commit one cloned snapshot, Supabase uses transactional locks. Admin routes gate Caller.admin, audit refusals, paginate only after chain verification and fall through for unknown paths (including Part 2 keys). A hash chain detects edits against retained hashes, not an attacker who can rewrite the entire chain and its trusted root.

`/metrics` currently returns 503 `metrics-cost-unavailable`, with a `partial` object containing observed revenue/credit/activity totals and **null** provider costs. Existing UsageRow has no actual provider-cost measurement; the frozen AdminMetrics requires a number. No fictitious zero cost is displayed. The integrator must add persisted cost observations and an unavailable representation before this route satisfies AdminMetrics. The thin AdminClient treats the 503 as unavailable. Existing usage retention (50,000 rows in FileStore) also bounds historical metrics fidelity.

## Studio semantics

`buildForm` parses declarations into basic/advanced groups. `visible` sorts by `order`, then ID for ties; hidden parents hide their descendants and conditional cycles fail closed. Missing condition values do not show a field. Call `defaults` explicitly; assembly does not insert defaults.

`validate` is read-only. It reports required, type, finite number, min/max, step, seed integer, option, hexadecimal colour, reference and role errors. It never clamps or corrects values. `assemble` also does not clamp: the caller should validate before submitting. A numeric value outside its declared range is preserved by assembly, and rejected by validation.

Prompt fields precede ordered `Label: value` prompt parts. Negative fields form `negativePrompt`. Scalars go to `params[sends]`; references are keyed by field ID; UI/hidden fields never leave the form. A units-role number is already the declared count/seconds/minutes; a units-role string counts Unicode code points. If `sends` is present on a units field, its original value also goes to that provider parameter. One units-role field is supported; without one the neutral unit count is 1. No unit kind or automatic voice-text pricing is inferred from the Studio name. The reference voice declaration has no units-role field: replace/configure it before provider pricing integration.

**Frozen-type limitation:** `FormValues` supports arrays and `ParamDecl` has `multi`, but `AssembledRequest.params` only permits scalars. Multi-valued prompt parts and references are supported. A list-valued provider parameter is reported as invalid and assembly refuses it; it is not silently encoded into a string. If a provider needs an array parameter, the integrator must extend that contract.

Reference sets cover image, video, voice, music/sound, captions and thumbnail controls. They are data, not active Platform Config; no provider or Autodraft comparison was performed. File IDs have no MIME metadata in `FormValues`, so the wiring/upload layer must enforce `accept` restrictions.

## Memory semantics

No clock, storage, network or random IDs are used by the memory implementation. Text calls are injected. IDs are deterministic hashes with fact-ID collision avoidance, not security identifiers; timestamps derive from supplied records. Caller records are copied, not mutated.

Token estimates use `ceil(UTF-16 character length / 4)`. This is bookkeeping, **not** a tokenizer or a guarantee of a provider's Hindi/English token count. `MemorySettings` has no separate context limit, so `summariseAboveTokens` is used as both summarization threshold/output cap and context estimate budget. If a distinct context cap is required, the integrator must add it or adapt the supplied settings.

Style is included first, unchanged, labelled read-only. An oversized Style causes a plain error instead of being silently truncated. Remaining context space is reserved for newest `keepRecent` turns, then facts (pinned first), then summary; presentation order is Style, facts, summary, recent turns. Context may truncate text to remain within the estimate budget. Stored messages/facts are unaffected.

`summarise` sends older turns and the previous summary to the fakeable text call, retains `keepRecent` verbatim, and records `coversUpTo`. Extracted fact text is normalized with NFKC, whitespace folding and case folding for deduplication. Existing pinned facts survive even if they exceed a newly lowered maxFacts; unpinned facts use remaining slots. The model cannot pin new facts.

`distillStyle` validates JSON with zod, attempts one repair on invalid JSON/shape/rule count, then throws one plain sentence if still invalid. Owner/identity/status fields come from the caller, never the model; the output status is always `draft`. The downstream accept operation belongs to Part 2.

## Proof limits

Tests use MemoryStore/FileStore, local HTTP payment fakes, generated test certificates and fake TextCall implementations. SQL includes an isolated local PostgreSQL policy harness; it skips explicitly if server binaries are absent. No real payments, live Supabase, live models, real webhook signatures, cross-process accounting or browser screens were tested. See `reports/P3-ENGINE.md` for the exact test and mutation results and the verify outcome.
