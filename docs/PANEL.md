# User panel and website (P2-R1)

Three pages, one origin:

| Page    | Path      | Who sees it                                                                                                                   |
| ------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Website | `/site/`  | Everyone. Landing, Styles, showcase, pricing and FAQ from `config.site`; log in, sign up, password reset. No demo, no editor. |
| Panel   | `/panel/` | Signed-in people only. Logged out: sent to `/site/#/login`.                                                                   |
| Editor  | `/`       | Signed-in people only (`src/boot.ts` checks the session before the editor loads).                                             |

There is no guest mode (owner rule 5).

## Accounts

The panel and website use `CloudBackend` (`src/cloud/backend.ts`). In this
round it is `localAccountBackend` (`src/cloud/local.ts`): people live in this
browser (`aive.localCloud`, PBKDF2 password hashes); the reset code goes to a
local outbox that the reset form shows. The Supabase backend
(`src/cloud/supabase.ts`) has the same interface and is switched on in P2-C.

## Screens (all text from the config or `src/panel/strings.ts`, English and Hindi)

- **Home**: greeting, credits, a Director prompt box, Style cards, Continue
  projects, Learn.
- **Styles**: search, format chips, "On my plan", price hints, a lock with
  Upgrade for Styles the plan lacks.
- **Brief Room**: the Style's `brief.fields` rendered by `src/panel/form.ts`
  (every field type, show-if, validation), brief strength, the model picker and
  the estimated cost. Drafts are saved per Style as you type.
- **Director**: the interview from the Style's rules (answered fields
  skipped, capped, free text, the creative-upgrade line once). Requests that
  match an owner refusal get the owner's reply and alternative, never model
  text.
- **Plan card**: scenes with their method, Cheaper and Richer swaps (a method
  the plan lacks offers Upgrade), per-scene and total credits for the chosen
  model, the balance, a shortage message with Top up, a cheaper model or
  cheaper scenes, Approve (reserves the maximum) and Cancel.
- **Live Build**: the steps, a progress bar and scene preview; a failure
  refunds everything; Open in editor hands the plan to the editor, whose own
  Build video makes the editable scenes (the AI card and its build states work
  as in D-347).
- **Studio**: one screen per `config.studios` entry, its inputs from config,
  the cost before the run, a consent tick where the config asks (voice clone);
  results go to the Asset Library of the chosen project.
- **Asset Library**: per project; Copy to project copies (the original stays).
- **Projects**: the editor's project library (search, This week, Trash; New
  with Director, New blank, Open, Rename, Duplicate, Trash, Restore, Delete
  forever). The editor's File menu keeps New, Open and Open example.
- **Credits & Plan**: plan cards (INR or USD), what things cost, top up with
  the payment providers from config (only the test payment works now), the
  ledger history, usage against the plan's limits.
- **Brand Kit** (plans with `brand-kit`), **Settings** (name, language,
  theme), **Learn** (from `config.learn`).

## Not connected in this round

Supabase accounts and storage, real AI providers, real payments, the Admin
app. Each is behind its interface and says "not connected" when asked.

## P2-R2 changes

- **Server or offline.** With `VITE_GATEWAY_URL` the panel talks to the gateway server (`src/panel/remote.ts`): credits, ledger, usage, plan switch, top-up, models and every model call. Without it the in-browser mock gateway runs, and only the mock models are offered. Real provider adapters never ship to the browser.
- **Accounts.** With `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` the website and panel use Supabase (email confirmation, reset with an emailed code, refreshing sessions; Google only with `VITE_GOOGLE_CLIENT_ID`); else the local account backend.
- **One person's data.** Projects, the Asset Library and the editor's autosave belong to the signed-in person; data made before accounts goes to the first person who signs in on the browser.
- **Director.** The Plan card asks the chosen model (the free planner with the mock), shows optional upgrades with their credit effect and the server's estimate plus the media models. The chat uses a connected model to read answers; refusals never reach a model. Live Build makes AI pictures and the voice through the server; the editor imports them before Build video.
- **Limits.** New project and Studio runs check the plan's limits first and show the owner's sentence with Upgrade; the editor stops an export over the plan's monthly limit the same way. The panel writes the plan's export limit to `aive.limits.<user>` for the editor when no server is used.
- **Aurora Ink.** `src/panel/aurora.css` is the one token file (colours from `src/panel/aurora-tokens.ts` and the config's `brand.colors`; Plus Jakarta Sans, Noto Sans Devanagari, JetBrains Mono; light theme). The aurora gradient is used only for Director, build progress and primary actions; gold for credits. Card pictures are drawn from the config (`src/panel/art.ts`). Brief fields sit in the config's `brief.groups`; the website has a scroll story and FAQ items from `site.sections[].items`.
