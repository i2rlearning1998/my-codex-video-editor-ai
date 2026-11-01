# PLATFORM-CONFIG.md: one versioned config for website, panel and editor (P2-0)

Owner rule (1 Nov 2026): **nothing a person sees or the AI may do is fixed in
code.** The owner decides while the product is being built, and changes it later
from Admin without a second round of coding. So the website, the user panel and
the editor all read ONE document, the Platform Config. Admin (Phase 3) is only an
editing screen over it.

## What it holds (one section per owner decision area)

| Section    | Holds                                                                                                                                                | Who reads it                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `brand`    | platform name, logo, colour tokens, default language                                                                                                 | site, panel, editor          |
| `plans`    | plan list: id, names, prices (INR/USD), monthly credits, limits, feature flags, watermark                                                            | panel, billing, gateway      |
| `costs`    | credit cost per action (motion scene, voice minute, image, AI video scene ...), with ranges                                                          | plan card, studios, gateway  |
| `studios`  | Studio Tools: which exist, which model/provider each uses, per-plan access                                                                           | panel, gateway               |
| `styles`   | Styles: card art, playbook id, **brief form** (fields), **interview rules**, plan gating, price range                                                | panel (Brief Room), Director |
| `director` | the Rulebook: persona, allowed tools, budget limits, scope and refusal replies, what the user sees (plan, code, model names), creative-upgrade rules | Director, panel              |
| `site`     | website sections, copy, showcase videos, order                                                                                                       | website                      |
| `backend`  | adapter names and public settings (never secrets): auth, database, storage, payments                                                                 | all (to pick adapters)       |

Secrets (provider keys, service keys, webhook secrets) are NEVER in the config.
They live in the server environment. The config only names which adapter to use.

## Rules that make "no second round of code" true

1. **Forms come from data.** The Brief Room draws its fields from
   `styles[].brief.fields` (type, label, options, required, order, show-if). A new
   field or a new Style is a config change, not a code change. Field types are a
   small closed set the renderer knows (`text`, `longtext`, `choice`, `multi`,
   `toggle`, `number`, `slider`, `color`, `file`, `voice`, `ref`).
2. **Interview from data.** `styles[].interview` and `director.rules` hold the
   questions Director may ask, in what order, when to skip (already answered), a
   cap on the count, and the stop rule. Prompt text lives in config, not in code.
3. **Boundaries from data.** `director.scope` lists what Director can do (a
   capability list); anything else gets the owner-written `refusals[]` reply
   (with an optional alternative). The model never writes its own refusal.
4. **Tools from data.** `director.tools` is an allow-list of Studio/gateway tools
   with per-tool rules (needs approval, max credits per run, plan required).
   The gateway rejects a call to a tool not on the list, whatever the model says.
5. **Visibility from data.** `director.reveal` says what the user sees (plan,
   scene methods, credits, code, model names).
6. **Server enforces.** Limits and credits are checked on the server by the
   gateway from this config. The browser only displays them.
7. **Versioned and reversible.** Every save creates a new immutable version
   (`version`, `publishedAt`, `note`). Publish makes one live; Rollback makes an
   older one live. Readers fetch the live version and cache it by version.
8. **Safe by validation.** A config that fails the schema is refused at save, and
   a reader that gets a bad or missing config falls back to the last good copy,
   then to the built-in default. The product never opens blank.
9. **Migrations.** `schemaVersion` is part of the document; older documents are
   upgraded by pure functions in `migrate.ts` before validation.
10. **Language.** Every owner-written text is `{ en, hi }` (more locales later).

## Code layout (`src/platform-config/`)

- `schema.ts`: zod schema and types for all sections above.
- `defaults.ts`: the built-in default config (sample plans, 4 Styles, a Rulebook
  with the Circumference-video interview as the first Style's interview).
- `migrate.ts`: `schemaVersion` upgrades.
- `source.ts`: `ConfigSource` interface (`getLive()`, `getVersion(n)`, `list()`,
  `save(draft, note)`, `publish(n)`, `rollback(n)`) with a **local** implementation
  now (a JSON file / browser storage) and a **Supabase** one in P2-C (table
  `platform_config`, row per version, RLS: everyone reads the live row, only the
  admin role writes).
- `resolve.ts`: helpers readers use: `planFor(user)`, `limitsFor(plan)`,
  `costOf(action)`, `styleById`, `canUse(plan, feature)`, `text(locale, t)`.
- `form.ts`: turns a `styles[].brief` into a validated form model and back into
  the Brief JSON that Director receives (pure; the UI only renders it).
- tests in `tests/platform-config/`.

## Out of this slice

The admin editing UI (Phase 3), the Supabase table and RLS (P2-C), the gateway
(P2-D), and the panel screens (P2-A, P2-C+). P2-0 ships the schema, defaults,
source interface with the local source, helpers and tests, so every later slice
reads real config from day one.

## Open decisions the owner will set later (they are config values, not code)

Platform name and logo, plan names/prices/credits, free-plan numbers, the
Rulebook text, per-Studio models, the showcase list, and every Style's Brief
form and interview.
