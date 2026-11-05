# P3-WIRING: how Part 2 connects

Part 2 of the P3 build (brief `briefs/P3-WIRING.md`, contracts `docs/CONTRACTS-P3.md` and `src/contracts/p3.ts`). No screens: every module below is what the screens (Part 3) call instead of the mocks. Everything that talks to a model provider, Google Drive or Supabase has only been run against **local fakes**; live behaviour is unproven.

## Where things are

| What                         | File                                                                                                                   | Used by                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| P3 settings and new config   | `src/platform-config` (`p3`, `campaigns`, `styleCaps`, `combos`, `models[].params`, prompts `chat`, `enhance`, `edit`) | everything                        |
| Readers                      | `p3Settings`, `activeCampaigns`, `capFor`, `comboModels`, `loginLimits`                                                | panel, server                     |
| Style > Project > Chat store | `src/wiring/store` (IndexedDB, or memory)                                                                              | Director service                  |
| Memory levels                | `src/wiring/memory-levels.ts`                                                                                          | Director service                  |
| Director service             | `src/wiring/director-service.ts` (`createDirectorService`)                                                             | Director room, Orb                |
| Attach and vision            | `src/wiring/attach.ts`, `src/wiring/vision.ts`, `src/wiring/pdf-text.ts`                                               | Director service, server adapters |
| Studio service               | `src/wiring/studio-service.ts` (`createStudioService`)                                                                 | Studio screens                    |
| Part 1 engines (lazy)        | `src/wiring/engines.ts` (`loadEngines`, `loadEntitlements`)                                                            | the one place they are wired      |
| Key vault                    | `server/keys/index.ts`, `server/keys/mount.ts`; routes in the `P3-WIRING` blocks of `server/app.ts`                    | Admin keys screen                 |
| Storage backends             | `src/storage-backends` (`createStorageBackend`, `storageChoice`)                                                       | attach, Asset Library, settings   |
| Login guard                  | `src/cloud/login-guard.ts`; local and Supabase backends; `server/auth.ts` (`suspended`, `sessionsValidFrom`)           | sign-in                           |
| Editor chat engine           | `src/editor-chat` (`createEditorChatEngine`, `remoteAsk`)                                                              | the editor's chat dock            |

## Wiring the real services (the integrator)

```ts
import {
  loadEngines,
  createDirectorService,
  createStudioService,
  createAttachments,
  createWiringStore,
  indexedDbBackend,
} from '../wiring';
const { memory, studio } = await loadEngines(); // Part 1; a clear error until merged
const store = createWiringStore({
  backend: indexedDbBackend(),
  owner: () => user?.id ?? null,
  config: () => config,
  planId: () => plan.id,
});
const files = createAttachments({
  config: () => config,
  userId,
  store,
  media: createStorageBackend('local', { media: mediaStore, limitBytes }),
  entitlements,
});
const director = createDirectorService({
  config: () => config,
  userId,
  plan: () => plan,
  store,
  memory,
  entitlements,
  gateway,
  files,
});
const studios = createStudioService({
  config: () => config,
  userId,
  plan: () => plan,
  engine: studio,
  gateway,
  connected,
  entitlements,
  saveAsset,
});
```

- `gateway` is anything with `startJob` (Director) and `run` (Studio): the in-browser gateway or the remote one.
- `entitlements` is Part 1's `EntitlementService` (only `check` is used); on the server `loadEntitlements(deps)`.
- Images and Studio parameters are added by the real adapters (`src/gateway/adapters/extras.ts`), so `serverAdapters` already carries them. `/v1/run` in `server/app.ts` still drops `images` and `params` when it rebuilds the request; that line is outside the `P3-WIRING` block (see the report).
- The key vault keeps its sealed values through the Store's `putSecret`, `getSecret`, `listSecrets` and `deleteSecret` (Part 1, rev 1.2); until they exist the server uses an in-memory stand-in. `fetchTransport` takes an optional `resolveSecret` (vault first, then env).
- The login guard takes `isSuspended(email)` (rev 1.3 note 8); wire it to Part 1's profile flag.

## Rules the code keeps

- Refusals (the owner's keywords, including the scope refusal) run before anything else: no model call, no hold, no credits.
- Chat on/off and the daily limit (config), then the entitlement service, then attachments, all before credits are held.
- One gateway job per message; a failure gives the whole hold back and is one `failure` event.
- The Style block is the first thing in every model context; a draft Style is never read; no chat writes a Style.
- Plans still go through the editor's `validatePlan` with one repair (`llmPlan`). Each scene's notes carry `method:<id>;source:<ai|stock|library|mine>`; `mine` scenes are left for the person's own file.
- Images go only to models with `capabilities.vision`; each image costs `p3.vision.creditsPerImage` (in the estimate and in the ledger).
- The key vault never returns a value (last four characters only), only accepts provider `keyRef` names, and writes an audit row for set, remove and test.
- The editor chat engine changes the project only in `apply`, as one transaction (one undo step).
