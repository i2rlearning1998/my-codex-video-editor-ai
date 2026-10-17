# C1 series: providers and accent palettes

## Done

- New `src/providers/` framework: generic kinds/registry, multi-field local key store, masked display, uncached key probe, injectable transport, cancellation/body timeout, sanitized typed errors, local per-key rate budgets and fail-fast Retry-After/exponential backoff.
- Pixabay images/videos; Pexels photos/videos; Iconify icons and OpenMoji/Noto stickers with commercial-friendly licence filtering; Freesound audio previews with per-sound licence classification. Responses are validated, not blindly cast. Original synthetic JSON fixtures match documented response shapes.
- Search cache in memory + IndexedDB, configurable default 10 minutes; Pixabay enforces its documented 24 hours. Streaming stock import enforces 200 MiB default and returns media bytes plus licence metadata. `attachStockLicense` stores it under existing `Asset.metadata.stockLicense`, requiring no schema change.
- New `src/appearance/` engine: eight immutable dark accents and eight light accents; original purple/hover/pressed/soft tokens retained; WCAG contrast helper; five-variable application; independent preferences; existing dark/light/system resolution; storage-failure fallbacks.
- Docs list exact APIs and UI integration; read-only purple/indigo source inventory covers 13 files / 59 occurrences, with explicit exclusions for content colours and warnings against global replacement.
- No src/ui, src/style.css, existing CSS, e2e, dependencies, schema or editor files edited. Existing code is read only, including metadata and token inspection. New modules import existing core types only where needed for the metadata helper.

## Tests and checks (actual runs)

| Check | Outcome |
| --- | --- |
| `npx vitest run tests/providers` (after task 1) | 30 passed, 6 files; 381 ms |
| `npm run typecheck` (one invocation at end) | Failed: one TS2352 at src/providers/shared.ts, Definition incorrectly asserted as full Provider |
| `npx vitest run tests/appearance` (after typecheck) | 23 passed, 1 file; 243 ms |
| `git diff --check` | Passed |

Typecheck correction: `hasKeys` now accepts precisely `Pick<Provider, 'id' | 'requiresKey' | 'keyFields'>`; removed the incorrect assertion at its call site. This is a type-only contract correction, with no runtime logic change. The once-only typecheck was not repeated, so **final typecheck is unverified**, not reported green. The first compiler stopped before the chained e2e TypeScript project. No e2e execution, full verify, CI polling, live provider requests or live network in tests. Each unit folder ran once, at its task boundary; provider tests were not repeated at the end.

## UI agent must wire

1. Instantiate/register provider factories; Stock tabs call listByKind/search, cancel superseded requests, use returned nextPage and exact quality ids, display keyFields, testKey outcomes, prominent provider attribution, author/source and actual licence badges.
2. On import, wrap bytes as File for existing media import; its addAsset callback must call attachStockLicense before the existing library ADD_ASSET command. Preserve metadata through deduplication/replacement. Without this callback wiring, the old importer does not attach returned licence metadata automatically.
3. Call loadAppearance once and applyAccent after theme startup; repeat on theme toggle/system-mode change and accent selection. Save both independent choices and retain session state when persistence fails.
4. Migrate legacy accent aliases deliberately: current CSS uses accent-fill/fill-hover/text/border, focus-ring, region-accent and accent-pressed as well as the five requested variables. This module alone cannot recolour all those existing rules. See APPEARANCE-API.md.
5. The unchanged raw dark purple does not meet 4.5:1 with white; black is the new contrast token. Existing default buttons use a darker fill with white, which must remain until the UI agent deliberately adapts the fill/contrast pair. Default accent colours are preserved; a blind alias migration cannot promise every button remains visually identical.

## Terms, limits and CORS findings

- Provider docs checked 2026-10-17; links in PROVIDERS-API.md. Pixabay requires 24-hour caching, source display and no systematic mass downloads/permanent photo hotlinking. Its commercial-content permission has restrictions, not a blanket clearance of every depicted trademark/person.
- Pexels API display attribution is separate from its content licence. Its documented endpoints include /v1/videos/search; monthly remaining/reset headers and a conservative client 31-day budget are used. Across tabs/devices the provider remains authoritative.
- Iconify's allow-list keeps original licence names/URLs, including share-alike requirements for OpenMoji. Unknown/noncommercial sets are excluded. Icon dimensions are set-level hints; imported media probing is authoritative. Search total is a lower bound, not an invented global count.
- Freesound original audio needs OAuth; this task imports named MP3 previews only. Commercial API use has separate negotiated terms; commercial sound licences do not waive those API terms. Unknown/NC sound licences are not marked commercially usable.
- CDN CORS/browser credential preflight was not tested live. Download TypeError is reported as CORS_BLOCKED with conditional wording because browsers cannot distinguish CORS from offline/DNS failures. A future authenticated server proxy is the planned solution; never use no-cors to obtain unreadable bytes. Redirected requests are rejected, so redirected CDN endpoints may also require a future controlled proxy.
- Keys are locally stored plaintext per the requested BYO-key design, never logged or included in error text/cache keys/project metadata. Only Pixabay requires a key query parameter; Pexels/Freesound use headers. IndexedDB expiry is logical; disk pruning, cross-tab rate-budget sharing, encrypted/server key management, TTS/STT engines, and UI are not built.

## Exact exported APIs

Providers: `createProviderRegistry`, `registry`, `register`, `list`, `get`, `listByKind`; `createPixabay`, `createPexels`, `createIconify`, `createFreesound`; `createKeyStore`, `keyStore`, `getKey`, `setKey`, `clearKey`, `hasKeys`, `maskKey`, `testKey`; `createNetwork`, `retryAfter`, `searchCacheKey`; `createSearchCache`, `indexedDbCache`; `importStockItem`, `attachStockLicense`; `ProviderError`, `assertActive`, `soundLicense`; `PIXABAY_LICENSE`, `PEXELS_LICENSE`, `COMMERCIAL_ICON_LICENSES`, `STICKER_PREFIXES`. Exported interfaces/type aliases are enumerated in PROVIDERS-API.md.

Appearance: `DARK_ACCENTS`, `LIGHT_ACCENTS`, `MODE_COLORS`, `accentPalette`, `contrastRatio`, `applyAccent`, `loadAppearance`, `saveAppearance`, `resolveMode`, `APPEARANCE_KEY`, `EXISTING_THEME_KEY`; types `AppearanceMode`, `AccentPalette`, `ModePreference`, `Appearance`, `AppearanceStorage`, `AccentRoot`.

## Delivery

Branch `codex/c1-providers` from `claude/r-all`; one draft PR targets `claude/r-all`, never merged. Task 1 was committed/pushed after its tests; task 2 and the final type-contract correction are committed/pushed together. No browser try-it steps were executed; after UI wiring, an owner can supply a key, search/select/import one item and inspect its retained licence, then independently choose dark/light accents and toggle modes.
