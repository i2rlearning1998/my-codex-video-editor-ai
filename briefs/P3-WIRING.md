# Brief P3-WIRING: data model, Director and Studio services, attach and vision, key vault, storage backends, login hardening, editor chat engine

Part 2 of 3. Implementer: Claude Code. Branch: `claude/p3-wiring`, created from `claude/phase2-r3-ui`.
Authority: `AGENTS.md`, then this brief, then `docs/CONTRACTS-P3.md` and `src/contracts/p3.ts`. This brief overrides the end-of-session steps of AGENTS.md section 2 where `docs/CONTRACTS-P3.md` section 3 says so (no edits to STATUS, DECISIONS, FEATURES, CHANGELOG; no tag; no review patch). Read `docs/CONTRACTS-P3.md`, `src/contracts/p3.ts`, `docs/PLATFORM-CONFIG.md`, `docs/GATEWAY.md`, `docs/SERVER.md`, `docs/EDITOR-OWNERSHIP.md`, `src/director/**`, `src/panel/services.ts`, `src/cloud/backend.ts`, `server/auth.ts` fully first.

**This part has no visuals.** Do not touch `src/panel/screens/**`, any `.css`, `src/panel/strings.ts`, `src/admin/**`, `src/site/**`, `src/ui/**`. The integrator builds every screen against the services you implement.

## 1. Goal

After this part the Director, Studio, memory levels, attachments with vision, key vault, storage backends, login guard and editor chat engine all exist as tested code behind the interfaces in `src/contracts/p3.ts`, so the screens can be switched from mocks to real services without changing their shape.

## 2. Parts built by someone else (code against the contract, do not build)

Part 1 (Codex) delivers, with these export names:

- `src/memory/index.ts` → `createMemoryEngine(): MemoryEngine`
- `src/studio-engine/index.ts` → `createStudioEngine(): StudioEngine`
- `server/entitlements/index.ts` → `createEntitlementService(deps): EntitlementService`

They may not exist when you start. Take them by **dependency injection** (constructor argument typed from `src/contracts/p3.ts`), never import them in code that must compile today; wire the real ones in one file, `src/wiring/engines.ts`, written as a lazy `import()` with a clear error if the module is absent. In your tests use small stand-ins you write under `tests/p3-wiring/stubs/`.

## 3. In scope (build in this order, commit after each)

**W1. Config additions** (`src/platform-config/**`, additive with defaults, version stays 1; old stored configs must still parse; extend the config unit tests)

- `models[].params: ParamDecl[]` (import `paramDeclSchema` from `src/contracts/p3.ts`); default `[]`.
- `p3` section producing `P3AdminSettings` (chat on/off, per-day message limit, history tokens; vision on/off, credits per image, max images per message; memory settings; entitlement ttl; webhook window) plus `p3Settings(config): P3AdminSettings`. Defaults are **placeholders flagged as samples**; the owner sets the real values in Admin.
- `campaigns[]` (id, name, window start and end, bonus percent on top-ups, plans it applies to, enabled), `styleCaps` (per plan: max Styles, max projects, max chats per project), `combos[]` (named model sets: role → model id, plan features required, enabled). Pure readers: `activeCampaigns(config, now)`, `capFor(config, planId)`, `comboModels(config, comboId)`.
- Validation: a combo naming an unknown model or a role the model does not serve is refused with a plain sentence; a campaign ending before it starts is refused.

**W2. Data model and three memory levels** (`src/wiring/store/**`)

- A store for `StyleRecord`, `ProjectMemory`, `ChatRecord` per signed-in person, local-first in IndexedDB, behind an interface so Supabase can be added later (do not add Supabase tables in this part). Records carry the owner; a person sees only their own (same rule as the Projects library, D-356).
- Style caps from config are enforced on create (plain sentence + `upgrade: '/credits'`).
- The three start paths of `StartPath` (`style`, `brief`, `blank`) all create the same chat; `brief` turns the Style's Brief answers into the first facts.
- "Make this my Style" = `MemoryEngine.distillStyle` → saved as `draft`; `acceptStyle` applies the person's edits and makes it `active`, version +1. A draft is never read into a Director call.
- Style is read-only into every call: the context given to a model always starts with the Style block; no code path writes a Style during a chat.

**W3. Director service** (`src/wiring/director-service.ts`, `src/director/**`; contract: `DirectorService`, `DirectorEvent`, `StartPath`)

- `send` streams events in this order: `state: thinking`, tokens/`question`/`plan`, `memory` (facts added), `done` with credits used. Refusals are matched by the owner's keywords **before any model is asked** and emit `state: refusing` then `refusal`. A building plan emits `state: building`. A gateway failure becomes one `failure` event with the owner's sentence; the held credits are refunded.
- Prompts come from config (`director.prompts`); the memory context block (Style, project facts, chat summary, recent turns) is added by code. Summaries run when history passes `maxHistoryTokens`. Chat on/off, per-day limit and `aiOff` are checked through the injected entitlement service **before** the call.
- Scope gate: the Director answers only about video work; an off-topic message gets the owner's scope refusal, not a model call.
- Plan JSON keeps going through the editor's `validatePlan` with repair-once, as `llm-planner.ts` does today. Do not weaken it.
- Per-scene source: each plan scene carries `source: 'ai' | 'stock' | 'library' | 'mine'` (extend the plan scene notes convention already used for `method:`; no change to the video plan schema). `mine` means the person's own file ("mera apna"): the build leaves a frame the editor shows as "needs your file".

**W4. Attach and vision** (`src/wiring/attach.ts`)

- `attach` accepts image, audio, video, text and PDF within the limits from settings; stores bytes in the media store, never in the chat record. Images go to a vision-capable model as the adapter's image input (extend the Anthropic, OpenAI and Gemini adapters' request builders, tested against the existing fake servers); a text/PDF file is read to text (PDF: use only what is already in the repo or a pure parser that adds no dependency; if none exists, report PDF as not done).
- Cost: `Attachment.credits` = `creditsPerImage` from settings; `estimate` returns min and max including attachments; vision off or too many images → a plain refusal. A model without `capabilities.vision` is never sent an image; the person is told in one sentence which models can read pictures.

**W5. Studio service** (`src/wiring/studio-service.ts`; contract: `StudioService`)

- `form` = `StudioEngine.buildForm` from the chosen model's `params`; `preview` = `assemble`; `estimate` uses the gateway estimator with the assembled `units`; `run` reserves, calls the model through the gateway with the assembled prompt/params, settles, saves the result to the Asset Library (existing `saveAsset`), and streams `progress`/`result`/`failure`.
- `enhance` calls a text model to improve the prompt fields only (never changes required choices), costs credits like any call, and returns new `FormValues` the person can accept or discard.

**W6. Key vault** (`server/keys/**`; contract: `KeyVault`, `KeyInfo`)

- Values encrypted at rest (AES-256-GCM, key from `KEY_VAULT_SECRET`, random IV per value) in the `Store` through `putSecret/getSecret/listSecrets/deleteSecret` (Part 1 adds them, CONTRACTS-P3 rev 1.2; until then code to that signature and use a stand-in in your tests; do not edit `server/store*.ts`); `list` never returns a value (last four characters only); `set`/`remove` require admin, a reason, and write an audit row **through an injected `audit(row)` function** (Part 1 provides the real audit log; in your tests use a stand-in). `test` makes the provider's cheapest check via the existing adapters against the fake servers.
- The server's secret resolution (`secret:<NAME>` headers) reads the vault first, then the environment; a missing name still means "not connected". Routes `/v1/admin/keys` (GET list, PUT set, DELETE remove, POST test) in the `P3-WIRING` block of `server/app.ts`.
- Test: no response, log or error contains a fake key; a wrong `KEY_VAULT_SECRET` cannot decrypt.

**W7. Storage backends** (`src/storage-backends/**`; contract: `StorageBackend`)

- `platform` (through `CloudBackend` media), `local` (the existing media store), `drive` (Google Drive REST, `drive.file` scope, token supplied by the caller; proven against a local fake of the Drive API only). Per-person choice kept in prefs. `usage()` and the plan's storage limit are respected on `put`. Live Drive is unproven; say so.

**W8. Login hardening** (`server/auth.ts`, `src/cloud/**`; contract: `LoginGuard`)

- Per-email and per-IP attempt counters with an exponential lock (limits are constants only until the owner sets them; put them in `p3` config as samples), constant-time failure message (same sentence for unknown email and wrong password), password policy at sign-up (length from config), session revoke on password change, suspended people cannot sign in. Local backend and Supabase backend both go through the guard where the server sees the request; where Supabase does it itself, document that and do not claim more.

**W9. Editor chat engine** (`src/editor-chat/**`; contract: `EditorChatEngine`, `EditEvent`, `SelectionRef`)

- Resolves `SelectionRef`s against the read-only engine state, builds a context, asks the model for **semantic commands as JSON**, validates every command with the same validators the Command Bus uses (`EditorEngine.preview`), and emits a `proposal`. `apply` runs the commands as one transaction (one undo step); `discard` forgets. A proposal that fails validation is repaired once, then reported as a plain `failure`. Never touches the project except through `apply`. Charges credits per call like any call.

## 4. Out of scope

All screens and styles. Payments, entitlements, admin API, Studio fields engine internals, memory logic internals (Part 1). Changing `src/contracts/p3.ts`, the project schema (stays 9), the video plan schema. Real provider, Drive or Supabase calls. New runtime dependencies without a line in the report.

## 5. Required tests

Under `tests/p3-wiring/**`, titles start with `[P3W-0xx]`. At minimum: config additions parse old configs and refuse bad combos/campaigns; Style cap enforced; draft Style never reaches a call; the three start paths; refusal happens before any model call (assert the fake model got zero requests); chat limit / `aiOff` / vision-off paths; attach limits and vision cost in estimate and in the ledger; a non-vision model never receives an image; Studio `run` reserve/settle/refund on provider failure; vault encryption, no leak, wrong-secret failure; storage backend contract test run on all three backends (drive on its fake); login guard lock, same-message rule, suspended refusal; editor chat proposal validates, repairs once, applies as one undo step, and leaves the project byte-identical when discarded. Run the targeted tests while working; run `npm run verify` once at the end.

## 6. Report (`reports/P3-WIRING.md`)

Same shape as in `briefs/P3-ENGINE.md` section 5, with decisions `D-380` to `D-389` and ledger rows `P3W-001...`. List explicitly what only a fake has run, what was not tested, and anything built against a stand-in for Part 1.

## 7. Acceptance

- [ ] `npm run verify` exits 0 once, at the end (or the exact blocked step is reported)
- [ ] Only Part 2 files from `docs/CONTRACTS-P3.md` section 2 changed, plus the `P3-WIRING` block in `server/app.ts`
- [ ] `src/contracts/p3.ts` unchanged; no `any` casts at the contract boundary
- [ ] No file under the UI paths changed
- [ ] Report written; working tree clean; branch pushed only if the owner asked
