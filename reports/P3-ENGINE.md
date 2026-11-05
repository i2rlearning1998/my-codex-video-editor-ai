# Report: P3-ENGINE persistence resume (5 November 2026)

## 1. Summary

Preserved the previous engine work and cherry-picked owner-specified `01c7322` and `54c332b` as `87e680e` and `131d2f0`. No reset, merge or rebase onto UI work.
The Store ownership blocker is resolved. Added persistent payment receipts/accounting, encrypted-secret records, daily counters, flags, suspension, emergency state and audit operations to Memory/File/Supabase implementations.
Added hosted-payment adapter shapes and routes, persistent admin routes, and atomic chat admission. E4 validation still never changes values; E4/E5 remain intact.
Payment/admin behavior has local fake proof, not live-provider proof. PayPal end-to-end activation and actual provider-cost metrics remain Not done for the reasons below.

## 2. Scope and results

| Item / IDs | Result | Evidence |
| --- | --- | --- |
| E1 / P3E-050 | Built and verified against local Stripe/Razorpay HTTP fakes | Checkout shapes, signature, wrong key, tamper, stale, malformed rejection |
| E1 / P3E-051 | Built and verified in FileStore | Ten concurrent duplicates grant once, restart replay, unknown user, amount mismatch, monthly grant dedupe, refund balance clamp/shortfall |
| E1/E3 Store / P3E-052 | Built and verified in Memory/File | Opaque secrets, suspension, flags, capped daily increment, idempotent admin mutation, audit copy isolation |
| E1 / P3E-054 | Built and verified against local PayPal fake/generated certificate | OAuth/approval shape and RSA-SHA256/CRC32 verification; rejects tamper, stale and untrusted certificate URL |
| E1 / P3E-057 | Built and verified, pure Store fixture | Gateway reads payment updates and cannot reserve revoked credits |
| E2 / P3E-010..016 | Built and verified in unit/local HTTP tests | Previous signing/action checks preserved; concurrent chat check-and-count consumes exactly allowance |
| E3 / P3E-020..021,053 | Built and verified in pure/local HTTP tests | Client/audit helpers retained; 12 non-admin route/method refusals; audited mutations; identical credit request applies once; refund goes through fake; keys path falls through; response/log secret scan |
| E3 / P3E-055 | Static SQL checks only | RLS/private-secret/append-only declarations inspected |
| E3 / P3E-056 | Built but runtime unverified | Isolated PostgreSQL policy harness skipped: server binaries absent |
| E4 / P3E-030..033 | Previous built-and-verified behavior retained | 22 Studio tests |
| E5 / P3E-040..044 | Previous built-and-verified behavior retained | 5 memory tests |
| E1 PayPal activation / E3 actual provider costs | Not done | Frozen config cannot select PayPal; approval capture/renewal-period orchestration missing; UsageRow has no provider cost |

In-scope P0 end-to-end acceptance is not certified. There are no live payment, browser, cross-process database or real webhook claims. The E1/E3 rows above describe tested subsets, not whole-item completion.

## 3. Checks

Requested dependency install: `npm ci --ignore-scripts --no-audit --no-fund`, exit 0, 150 packages added. No package or lockfile edits. The prior missing Supabase/Transformers type errors disappeared after installation.

Targeted tests (unit/local HTTP; no browser proof):

```text
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

 RUN  v4.1.11 /workspace/scratch/a2711b159a0a/my-codex-video-editor-ai


 Test Files  12 passed (12)
      Tests  58 passed | 4 skipped (62)
   Start at  11:37:42
   Duration  1.16s (transform 2.47s, setup 777ms, import 2.83s, tests 956ms, environment 2ms)
```

58 passed, 4 skipped across 12 files: 50 P3 tests plus 8 existing/shared Store and server-wiring tests. Skips: two live Supabase Store cases, one existing live Supabase wiring case, one local SQL runtime case. The final metrics-unavailable change was separately checked with P3E-053 (1 passed).

Full `npm run verify` was invoked once in this run:

Exit **1**, at `npm test`, after **format and both TypeScript checks passed**. No second full verify was run. Build, the e2e command, hook assertion and ledger gate were not reached. CI not run/polled.
Failures are outside the edited ownership scope; they were not suppressed or repaired here. `LIB-028` finds bundled library content in `library/index.json`; `LIB-007` receives a combined rejection entry instead of only the deliberately bad theme. No baseline rerun was made to establish their origin.

```text
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/library/bundle.test.ts > Phase 1 library: nothing bundled > [LIB-028] the editor source holds no library payloads; only the fallback pack and one theme remain, and the built editor is checked
AssertionError: expected 'library/index.json: bundled library f…' to be '' // Object.is equality

- Expected
+ Received

+ library/index.json: bundled library file
+ library/index.json: contains bundled library content ("shape-star-5")
+ library/index.json: contains bundled library content (Starter Pack 1)
+

 ❯ tests/library/bundle.test.ts:50:26
     48|         },
     49|       );
     50|       expect(run.stderr).toBe('');
       |                          ^
     51|       expect(run.status).toBe(0);
     52|     }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  tests/library/gate-browser.test.ts > Phase 1 publish gate in headless Chromium > [LIB-007] render checks pass a good pack and reject a bad one; media get a poster, a proxy and their size
AssertionError: expected [ Array(1) ] to deeply equal [ 'bad-theme-contrast.json' ]

- Expected
+ Received

  [
-   "bad-theme-contrast.json",
+   "shape.json, theme-sunny.json, bad-theme-contrast.json, audio_tone_440hz_3s.wav, audio_tone_440hz_3s.wav.meta.json, image_testsrc_1200x800.jpg, image_testsrc_1200x800.jpg.meta.json, video_testsrc_720p_2s_vp9_opus.webm, video_testsrc_720p_2s_vp9_opus.webm.meta.json",
  ]

 ❯ tests/library/gate-browser.test.ts:58:53
     56|       },
     57|     );
     58|     expect(result.gate.rejected.map((r) => r.file)).toEqual([
       |                                                     ^
     59|       'bad-theme-contrast.json',
     60|     ]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed | 194 passed (196)
      Tests  2 failed | 1454 passed | 5 skipped (1461)
   Start at  11:41:51
   Duration  57.60s (transform 25.76s, setup 5.49s, import 58.65s, tests 139.48s, environment 3.39s)
```

The full npm test run includes an existing headless library gate; it failed. No successful user-facing browser proof or browser-version measurement is claimed for P3. Local P3 HTTP and unit tests passed within this run.

Mutation proof, restored immediately after each targeted run:

| Removed protection | Observed result |
| --- | --- |
| Raw HMAC comparison | P3E-050: 2 failed, 1 skipped |
| Store duplicate-event branch | P3E-051: 1 failed, 2 skipped |
| Admin caller gate | P3E-053: 1 failed |

Earlier-run mutation evidence remains: signing comparison, suspension gate, hidden-field exclusion, context bound and style-rule cap each produced a failing named test. No mutation remains. SQL enforcement, PayPal RSA mutation and every possible failure branch were not mutation-proven.

## 4. Try-it script for the owner

| # | Do this | Expect | ID | Codex ran it | Screenshot |
| --- | --- | --- | --- | --- | --- |
| 1 | Run `npx vitest run tests/p3-engine tests/server/store.test.ts tests/server/supabase-wiring.test.ts` | Local fake proof; explicit environmental skips | P3E-010..057 | Y | No browser involved |
| 2 | Supply `p3Settings()` and configured return origins to `createServerApp` | P3 endpoints enabled; missing settings fail closed | P3E-053 | Y, fake settings | N/A |
| 3 | Send the same signed fixture ten times, reopen FileStore | One grant; replay duplicate | P3E-051 | Y | N/A |
| 4 | Send non-admin requests to each owned admin path | Plain 403 and refusal audit | P3E-053 | Y, local HTTP | N/A |
| 5 | Repeat a credit adjustment request ID | One ledger change and one audit change | P3E-053 | Y | N/A |
| 6 | Revoke a refund after credits were spent | Available balance stays nonnegative; shortfall recorded | P3E-051 | Y | N/A |
| 7 | Ask for financial metrics | 503 cost-unavailable, partial observed data has null costs | P3E-053 | Y | N/A |
| 8 | Integrator applies migration to isolated PostgreSQL and runs `tests/p3-engine/policies.sql` | Real RLS and immutable-audit proof | P3E-056 | N, binaries absent | N/A |

## 5. Deviations from the brief

- **PayPal remains partial.** `src/platform-config/schema.ts` permits only mock/razorpay/stripe payment kinds and belongs to Part 2. The adapter can produce approval URLs and verify a supported completed-capture fixture, but end-to-end order approval/capture orchestration and subscription period resolution are not implemented. It is not enabled by pretending to be another provider. Required integrator change: add PayPal to the config kind, then finish capture and billing-period mapping before live use.
- **Actual provider cost is unavailable.** Existing `UsageRow` records credits/time/model/outcome, not actual provider USD cost; frozen `AdminMetrics` requires numeric cost. The metrics endpoint therefore returns 503 `metrics-cost-unavailable` plus a partial object with null costs. It never presents fabricated zero cost. Add persisted provider-cost observations and an unavailable representation in the shared contract before switching the dashboard to it.
- Payment callbacks need `ServerOptions.p3Settings()` from Part 2 config; the base startup does not invent admin limits. Provider plan IDs and Razorpay cycle counts are trusted injected options, not user payloads.
- Durable claims deliberately refuse blind retries after ambiguous provider I/O. Automated reconciliation and repeated partial refunds against the same payment are not built.
- Gateway cancellation request shapes exist; cancellation-event entitlement downgrade/end-of-period policy is not implemented. Unknown provider event shapes fail closed; only explicitly normalized events are accepted.
- The existing Studio array-parameter and separate memory-context-budget contract gaps remain documented in `docs/P3-ENGINE.md`; no frozen interface was edited.

## 6. Decisions made (ready to paste)

| ID | Date | Decision and reason |
| --- | --- | --- |
| D-370 | 2026-11-05 | Validation and assembly never clamp values; UI owns typing corrections. |
| D-371 | 2026-11-05 | Original Store ownership conflict resolved by owner revisions 1.2/1.3; preserved old work and cherry-picked only requested contract commits. |
| D-372 | 2026-11-05 | Stable Studio field order/condition handling; list provider params refused until frozen scalar contract is extended. |
| D-373 | 2026-11-05 | Character-based memory estimate; summariseAboveTokens is context budget pending a dedicated contract field. |
| D-374 | 2026-11-05 | Verify audit from genesis before pagination/filtering; append sequence and mutation share persistence transaction. |
| D-375 | 2026-11-05 | Missing trusted settings fail closed; unlimited plan limits omitted from signed numeric map. |
| D-376 | 2026-11-05 | Existing pinned facts survive lowered limits; draft style repair attempted once. |
| D-377 | 2026-11-05 | Payment receipt and ledger are atomic; subscription renewal uses existing monthly grant key. FileStore is single-process; SQL transactions carry Supabase concurrency design. |
| D-378 | 2026-11-05 | Durable external-operation claims prevent blind retries. Refund credit revocation takes the remaining grant even for partial money refunds, capped by available balance; shortfall is retained. Owner review required before live use. |
| D-379 | 2026-11-05 | Unknown actual provider cost blocks typed metrics rather than showing zero; PayPal remains disabled until its config and lifecycle gaps are resolved. |

## 7. Not tested, known gaps, risks

No live providers, real merchant webhooks, live Supabase, browser UI, real card transactions, automated payment reconciliation or production certificate rotation were tested. PostgreSQL RPC/policies are built but runtime unverified here. Supabase pagination beyond its default server row limit is not implemented; audit/user/metrics queries need explicit paging before large-scale deployment. Historical usage retention also limits metrics fidelity.
FileStore requires one server instance per file; multi-process writers are unsupported. SQL requests are service-role only; do not expose that credential. Certificate validation uses PayPal HTTPS origin plus certificate validity and bounded cache; nonmatching/rotated certificates fail closed. Hosted checkout availability, account-specific provider behavior and API version compatibility need live merchant validation.
PayPal activation, full refund-reconciliation tooling, subscription cancellation policy and actual-cost metrics are explicitly Not done. No UI was wired. No financial outcome is claimed from fixtures alone.

## 8. Architecture and contract impact

- Project schema remains 9; frozen `src/contracts/p3.ts` unchanged. Config schema unchanged.
- No new dependencies; only the requested clean install of locked dependencies.
- Added `server/payments/**`, `server/admin/routes.ts`, P3 tests/fake, one Supabase migration and integration docs. Extended owned Store implementations and shared tests.
- `server/app.ts` changes are inside P3-ENGINE blocks: route mounting/raw webhook handling, P3 options, fresh ledger view, legacy mock-payment guard and refusal auditing. No UI edits.
- Store adds optional profile suspension, opaque secret records, payment/audit/counter/flag/emergency operations. Old files get safe empty collections.
- New env names are synchronized in `.env.example`, `scripts/keys.json`, `docs/KEYS.md`; P2R2-015 passed.

## 9. Ledger and backlog

No shared ledger/index files edited under the brief. Proposed rows: P3E-050..054,057 Verified only for the named local tests; P3E-055 Verified for static inspection only; P3E-056 Not done runtime proof. Existing P3E-010..044 local evidence retained; P3E-016 added for atomic chat admission. Whole E1 and E3 remain partial as listed above.
Ledger change requests: none. BACKLOG_INBOX edits: none; the owned report carries the integration blockers for the integrator.

## 10. Git

Branch `codex/p3-engine`; existing work retained. No tag/review patch/merge under this brief.
Requested contract cherry-picks: `87e680e` (`01c7322`), `131d2f0` (`54c332b`).
Implementation commits: `f6809ff` payments/Store, `5f22279` chat count, `7d940e1` persistent admin, plus final safety/proof/report commit(s).
Owner authorized push. Shell push failed: no GitHub HTTPS username/credentials in this environment. Publication uses the GitHub connector to create a snapshot commit on the same a8f1e1f base. Local logical commits are preserved without reset; connector commit IDs differ. No force update or merge. The final response supplies the published branch link; remote tree equality is checked after fetching.

## Owner tick-list

| ID | OK / BUG / MISSING / CHANGE | One sentence |
| --- | --- | --- |
| E1 | | Review refund revocation policy and PayPal lifecycle gap before live use. |
| E3 | | Supply cost observations and run SQL policy proof before production wiring. |
