# Gateway server (P2-R2)

`server/` is a small Node app (node:http, no framework), started like the
owner app: `server/run.mjs` loads the TypeScript through Vite's module loader.
It hosts the model gateway (`src/gateway`, unchanged in its rules) behind a
versioned JSON API. Provider keys live only in the server's environment; the
Platform Config names them (`providers[].keyRef`), and the browser never
receives one.

## Start

```
LOCAL_AUTH_SECRET=<any long random text> npm run server     # http://127.0.0.1:4400/v1
VITE_GATEWAY_URL=http://127.0.0.1:4400 npm run dev           # panel and editor use it
npm run server:test                                          # its tests
npm run keys:check                                           # which keys are set (names only)
```

Without `VITE_GATEWAY_URL` the panel uses its in-browser mock gateway, so an
offline demo still works (no keys, no server).

## Environment

See docs/KEYS.md for every variable. In short:

| Variable                                     | Use                                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `SERVER_PORT`, `SERVER_HOST`                 | Where it listens (4400, 127.0.0.1).                                                                                 |
| `SERVER_ORIGINS`                             | Comma list of sites allowed to call it (CORS). Others are refused.                                                  |
| `SERVER_DATA`                                | Folder of the file store (`server-data/store.json`) when Supabase is not set.                                       |
| `SERVER_IP_PER_MINUTE`                       | Requests per minute per address (600).                                                                              |
| `AUTH_MODE`                                  | `supabase` (real sign-ins) or `local` (tests, offline).                                                             |
| `SUPABASE_JWT_SECRET` or `SUPABASE_JWKS_URL` | How a Supabase access token is checked.                                                                             |
| `LOCAL_AUTH_SECRET`, `LOCAL_TOKENS=1`        | Local mode: the token secret; `LOCAL_TOKENS=1` lets the panel ask for a dev token. Never on a public server.        |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`  | Use the Supabase store (tables in `supabase/migrations`).                                                           |
| Provider keys                                | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`, `ELEVENLABS_API_KEY`, `VIDEO_JOBS_API_KEY`. |

## API (`/v1`, JSON)

| Call                                              | Who                                 | What                                                                                                                         |
| ------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                                     | anyone                              | `{ok, api}`                                                                                                                  |
| `GET /config`                                     | anyone                              | The live Platform Config and its version (nothing secret is in it).                                                          |
| `POST /config`, `POST /config/publish`            | admin (`app_metadata.role = admin`) | Save a version (refused when invalid), publish one.                                                                          |
| `GET /me`, `/balance`, `/ledger`, `/usage`        | signed in                           | Plan, credits, ledger rows, usage against limits. The first call makes the profile and gives this month's plan credits once. |
| `GET /models`                                     | signed in                           | The models the plan may use, each with `connected` (its key is set).                                                         |
| `POST /estimate`                                  | signed in                           | Min and max credits for a video (`methods`, `briefChars`) or a Studio run.                                                   |
| `POST /reserve` → `/call` → `/settle`             | signed in                           | A job: hold the maximum, call models, settle at what was used (or `fail: true` to refund everything).                        |
| `POST /run`                                       | signed in                           | One call: reserve, call, settle; any failure refunds.                                                                        |
| `POST /limits/check`, `/exports`, `/usage/report` | signed in                           | Limits (exports, storage, clones, projects): check, count an export, report project and storage counts.                      |
| `POST /plan`, `/topup`                            | signed in                           | Test-mode plan switch and top-up through the mock payment (real payments come with Admin).                                   |

Errors are `{error: {code, message, detail}}` with one plain sentence:
401 not signed in, 400 bad input, 402 not enough credits, 403 not allowed,
404 unknown, 413 too large, 429 too many requests, 502 or 504 a provider
problem, 503 not connected.

## Rules it enforces

Everything in src/gateway (plan, model gating, the Director tool allow-list,
limits, budgets, per-person rate) plus: a model whose provider has no key is
"not connected" (never an error trace); every credit change for a person runs
under one lock, so parallel requests never spend the same credits twice; an
idempotency key reserves once; numbers are checked (finite, whole, in range);
bodies over 256 KB are refused; CORS only for `SERVER_ORIGINS`; security
headers on every answer; logs carry method, path, status, a short person id
and time, never a key or token.

## Stores

`Store` (server/store.ts): MemoryStore (tests), FileStore (offline), and
SupabaseStore (server/supabase-store.ts, service-role key). The same contract
tests run on all three; the Supabase one runs only with a live project
(`SUPABASE_TEST_URL`, `SUPABASE_TEST_SERVICE_ROLE_KEY`).

## Tested without keys

The real adapters are tested against local fake servers that speak each
provider's documented HTTP shape (tests/fakes/providers.ts): success, 401,
429 (once and always), 5xx, malformed JSON, slow, truncated. Live behaviour
is unproven until a real key is used.
