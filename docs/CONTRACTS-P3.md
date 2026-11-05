# CONTRACTS-P3: three parts, built in parallel

Owner decision (5 Nov 2026): the Director-first redesign, the full user panel and the full admin panel are built in **three parts at once**. No real-AI testing starts until all three are merged and integrated. The owner controls limits, costs, windows, chat on/off, vision cost, models and roles from Admin; **no part may hard-code any of them** (they arrive as `P3AdminSettings` or from the Platform Config).

The typed interfaces are in `src/contracts/p3.ts`. That file is frozen: it holds types and one zod schema (`paramDeclSchema`), no logic. A part that needs it changed stops and reports (section 8).

## 1. Parts, branches, owners

| Part                  | Owner               | Branch (stacked on `claude/phase2-r3-ui`) | Brief                              |
| --------------------- | ------------------- | ----------------------------------------- | ---------------------------------- |
| 1 Engine and server   | Codex               | `codex/p3-engine`                         | `briefs/P3-ENGINE.md`              |
| 2 Wiring (no visuals) | Claude Code         | `claude/p3-wiring`                        | `briefs/P3-WIRING.md`              |
| 3 All UI              | Claude (integrator) | `claude/p3-ui`                            | built against mocks, no brief file |

Order of merge: Part 1 and Part 2 are reviewed in full by the integrator (diff, tests, interface conformance, security, honesty of claims), fixed if needed, then merged into `claude/p3-ui`, where the UI is switched from mocks to the real services and the final completeness check runs.

## 2. File ownership (a part never edits another part's files)

**Part 1, Codex**

- `server/payments/**`, `server/entitlements/**`, `server/admin/**`
- `src/studio-engine/**`, `src/memory/**`, `src/admin-client/**` (the thin HTTP `AdminClient`)
- `supabase/migrations/20261105*_p3_engine.sql` and its policy tests
- `tests/p3-engine/**`, `tests/fakes/payments.ts`, `docs/P3-ENGINE.md`, `reports/P3-ENGINE.md`

**Part 2, Claude Code**

- `src/wiring/**` (Style > Project > Chat store, Director service, Studio service, attach and vision, per-scene source)
- `src/director/**` (rulebook, prompts, scope gate, plan JSON; no visuals)
- `src/platform-config/**` (adds `P3AdminSettings` and `model.params` using `paramDeclSchema`; schema version stays 1, additive with defaults)
- `server/keys/**` (key vault), `src/storage-backends/**`, `server/auth.ts` and `src/cloud/**` (login hardening)
- `src/editor-chat/**` (select and edit engine; no dock UI)
- `tests/p3-wiring/**`, `docs/P3-WIRING.md`, `reports/P3-WIRING.md`

**Part 3, integrator**

- every screen and style: `src/panel/screens/**`, `src/panel/*.css`, `src/panel/orb/**`, `src/panel/strings.ts`, `src/admin/**`, `src/site/**`, `src/ui/chat-dock.ts`
- `src/contracts/**` (including `p3-mocks.ts`), `docs/CONTRACTS-P3.md`
- `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/FEATURES.md`, `CHANGELOG.md` (merged from the two reports)

**Shared files with a marked block.** `server/app.ts` and `server/main.ts` are touched by Part 1 and Part 2 only to mount routes, each inside its own block:

```
// P3-ENGINE:begin ... // P3-ENGINE:end
// P3-WIRING:begin ... // P3-WIRING:end
```

No other lines of those files change. `package.json` changes only to add a script; no new runtime dependency without a line in the report (name, version, size, reason, alternative).

## 3. Rules for Part 1 and Part 2 (LIMIT MODE)

The owner has weekly usage limits. Therefore:

1. **One run.** No sub-agents. Work in the order of the brief; commit after each numbered item (`type(scope): summary [IDs]`).
2. **Targeted tests while working** (`npx vitest run <path>`), **one full `npm run verify` at the end**, never in a loop.
3. **Stop early rather than half-do.** If the limit is close, finish the current item, commit, and write the report with the real state. An unfinished item is listed as `Not done`, never as done.
4. Do **not** edit `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/FEATURES.md` or `CHANGELOG.md` (the integrator merges them). Instead the report carries: decisions (numbered from your range, section 4), ledger rows to add, tests by layer, what was **not** tested.
5. No UI. No file under `src/panel/screens`, `src/panel/*.css`, `src/admin`, `src/site`, `src/ui`.
6. Everything that talks to a provider, a payment service or Supabase is proven against local fakes; say so. Live behaviour is **unproven** and the report says so. Never write "works" for something only a fake has run.
7. Schema 9 (project) stays. Config schema version stays 1 (additive fields with defaults only; an old stored config must still parse).
8. Secrets never in code, config, logs, errors or answers. Tests search responses and logs for the fake secret.

## 4. Numbering

- Decisions: Part 1 `D-370` to `D-379`; Part 2 `D-380` to `D-389`; integrator `D-364` to `D-369` and `D-390` on.
- Ledger IDs: `P3E-001...` (Part 1), `P3W-001...` (Part 2), `P3U-001...` (Part 3). Every e2e or unit test title starts with its ID in brackets, as in AGENTS.md.

## 5. Contracts in words (details are in `src/contracts/p3.ts`)

**Payments.** Hosted checkout only (Razorpay, Stripe, PayPal; `mock` for tests). Credits are granted only from a verified webhook. Ledger key `pay:<provider>:<eventId>`; replay or duplicate adds nothing. Credits come from the config pack or plan, never from the amount in the webhook; a mismatch is rejected. A refund can also revoke the credits that payment gave, as an idempotent ledger row. Webhook age beyond `webhookReplayWindowSeconds` is rejected.

**Entitlements.** `resolve(userId)` returns plan features, limits and flags, HMAC-signed, valid `entitlementTtlSeconds`. `check(userId, action, amount)` is the single decision point; the editor's check is only a convenience. Suspended people and the emergency switch both refuse.

**Admin API.** `/v1/admin/*`, `Caller.admin` only. Every change writes an `AuditRow` in a SHA-256 chain (no route edits a row; a break shows as `chainOk: false`). Emergency switches: `aiOff`, `signupsOff`, `paymentsOff`, with a message the person sees.

**Studio engine.** A form is built from the chosen model's `params` (`ParamDecl`): basic and advanced groups, `showIf`, per-field `role` (prompt part, negative prompt, provider parameter, units for the price, reference file, UI only). `assemble` is code, deterministic, and also returns a readable `preview`. An LLM is used only by "Enhance with Director", which is Part 2's `StudioService.enhance` calling a text model; the engine itself never calls a model.

**Memory.** Style (read-only into every call) > Project (shared by chats) > Chat (thread plus summary). `summarise`, `context`, `extractFacts` and `distillStyle` are pure over an injected `TextCall`, so they are tested with a fake model. "Make this my Style" gives a **draft**; `acceptStyle` makes it active.

**Director and Studio services (Part 2).** `DirectorService` and `StudioService` are the only things the UI talks to. They stream `DirectorEvent`s whose `state` events drive the Orb. Every refusal is the owner's keyword refusal text, matched before any model is asked. Vision cost, chat limits and history size come from `P3AdminSettings`.

**Key vault, storage backends, login guard, editor chat engine (Part 2).** As typed. The vault never returns a value (last four characters only). The editor chat engine returns a **proposal** of ordinary semantic commands; `apply` runs them as one undo step through the Command Bus; nothing else mutates the project.

## 5b. Fixed export names (so the parts connect without seeing each other)

| Module                                  | Export                                                                                                             | Built by |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------- |
| `src/memory/index.ts`                   | `createMemoryEngine(): MemoryEngine`                                                                               | Part 1   |
| `src/studio-engine/index.ts`            | `createStudioEngine(): StudioEngine`                                                                               | Part 1   |
| `src/studio-engine/reference-params.ts` | `REFERENCE_PARAMS: Record<string, ParamDecl[]>` (keys `image`, `video`, `voice`, `music`, `captions`, `thumbnail`) | Part 1   |
| `server/entitlements/index.ts`          | `createEntitlementService(deps): EntitlementService`                                                               | Part 1   |
| `server/payments/index.ts`              | `createPaymentGateways(env): Record<PaymentProviderId, PaymentGateway>`                                            | Part 1   |
| `src/admin-client/http.ts`              | `createHttpAdminClient(base, token: () => string): AdminClient`                                                    | Part 1   |
| `src/platform-config`                   | `p3Settings(config): P3AdminSettings`                                                                              | Part 2   |
| `src/wiring/engines.ts`                 | `loadEngines()` (lazy wiring of Part 1 modules)                                                                    | Part 2   |
| `src/wiring/index.ts`                   | `createDirectorService(deps)`, `createStudioService(deps)`                                                         | Part 2   |
| `server/keys/index.ts`                  | `createKeyVault(store, secret, audit): KeyVault`                                                                   | Part 2   |
| `src/storage-backends/index.ts`         | `createStorageBackend(id, deps): StorageBackend`                                                                   | Part 2   |
| `src/editor-chat/index.ts`              | `createEditorChatEngine(deps): EditorChatEngine`                                                                   | Part 2   |

## 6. Mocks for the UI

`src/contracts/p3-mocks.ts` (integrator) implements `DirectorService`, `StudioService`, `AdminClient`, `KeyVault` and `EntitlementService` in memory, with deterministic data and every state (`thinking`, `refusing`, `building`, failures, empty lists). The UI is built and screenshot-tested against these; the switch to the real services is one adapter file per screen group.

## 7. What the integrator checks before accepting a part

1. `git diff` against the file-ownership list: nothing outside the part's files except the marked blocks.
2. `npm run verify` result, and every claimed test actually exists and names its ID.
3. Interface conformance: the part compiles against `src/contracts/p3.ts` with no casts to `any`.
4. Security read: signature checks, replay, idempotency, constant-time compares, secrets in logs, admin gate on every route, SQL policies.
5. Honesty: every "works" claim has a test; the "not tested" list is not empty; fakes are labelled as fakes.
6. For Part 1 especially: negative tests (bad signature, stale event, duplicate, amount mismatch, non-admin, suspended user) really fail on the wrong input, checked by mutating the code once.

## 8. Changing a contract

Stop and report the exact change and why. The integrator edits `src/contracts/p3.ts`, bumps the note below, and tells the other parts. No part edits it alone.

Contract revision: 1 (5 Nov 2026).
