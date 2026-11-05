# Keys and settings (P2-R2)

Every key is a named placeholder until the owner sets it. `npm run keys:check`
prints which are present (names only, never values). `.env.example` lists them
all. Browser values (`VITE_*`) go in `.env.local`; everything else goes in the
**server's** environment only. A provider key never reaches a browser: the
Platform Config holds only its NAME (`providers[].keyRef`).

| Variable                    | Where it goes                                                  | What it unlocks                                                      | How to check it works                                                      |
| --------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`         | .env.local (browser build)                                     | Real accounts and cloud projects in the panel, website and editor    | The website's Sign up sends a confirmation email                           |
| `VITE_SUPABASE_ANON_KEY`    | .env.local (browser build)                                     | Same as VITE_SUPABASE_URL (the public anon key, safe in the browser) | Log in works; the panel shows your email in Settings                       |
| `VITE_GOOGLE_CLIENT_ID`     | .env.local (browser build), optional                           | The Continue with Google button                                      | The button shows on Log in                                                 |
| `VITE_GATEWAY_URL`          | .env.local (browser build)                                     | The panel uses the gateway server (real models, server credits)      | Credits & Plan shows the server's ledger                                   |
| `SUPABASE_URL`              | server environment                                             | The server stores credits, usage and settings in Supabase            | npm run server prints store: supabase                                      |
| `SUPABASE_SERVICE_ROLE_KEY` | server environment only (never the browser)                    | Same as SUPABASE_URL (writes the ledger and usage)                   | npm run server prints store: supabase                                      |
| `SUPABASE_JWT_SECRET`       | server environment (or SUPABASE_JWKS_URL)                      | The server accepts Supabase sign-ins (AUTH_MODE=supabase)            | GET /v1/me with a logged-in panel answers 200                              |
| `SUPABASE_JWKS_URL`         | server environment (instead of SUPABASE_JWT_SECRET)            | Same, with the project's public keys                                 | Same as SUPABASE_JWT_SECRET                                                |
| `ANTHROPIC_API_KEY`         | server environment only                                        | Claude models (Director, Write)                                      | Panel model picker shows Balanced without 'Not connected yet'              |
| `OPENAI_API_KEY`            | server environment only                                        | GPT models and OpenAI images (Images, Thumbnail, AI image scenes)    | Studio › Images makes a picture                                            |
| `GEMINI_API_KEY`            | server environment only                                        | Gemini models                                                        | GET /v1/models shows gemini-fast connected                                 |
| `XAI_API_KEY`               | server environment only                                        | Grok models                                                          | GET /v1/models shows grok-balanced connected                               |
| `ELEVENLABS_API_KEY`        | server environment only                                        | ElevenLabs voices (Studio › Voice, voice-over scenes)                | Studio › Voice plays the result                                            |
| `VIDEO_JOBS_API_KEY`        | server environment only (plus the provider's address in Admin) | AI video scenes through a video-job service                          | GET /v1/models shows video-standard connected                              |
| `AUTH_MODE`                 | server environment                                             | supabase for real sign-ins; local for tests and offline              | npm run server prints the auth mode                                        |
| `LOCAL_AUTH_SECRET`         | server environment (local mode only)                           | Local test sign-ins; never on a public server                        | npm run server starts                                                      |
| `SERVER_ORIGINS`            | server environment                                             | Which sites may call the server                                      | The panel's calls are not refused with 'This site may not use the server.' |

Until a key is set, its provider shows **Not connected yet** in the panel and
`GET /v1/models` lists its models with `connected: false`. Nothing else
changes: the offline mock keeps the panel working.

## P3 server variables

- `RAZORPAY_KEY_ID`: server environment only. Leave empty until configured; never put it in a browser build.
- `RAZORPAY_KEY_SECRET`: server environment only. Leave empty until configured; never put it in a browser build.
- `RAZORPAY_WEBHOOK_SECRET`: server environment only. Leave empty until configured; never put it in a browser build.
- `STRIPE_SECRET_KEY`: server environment only. Leave empty until configured; never put it in a browser build.
- `STRIPE_WEBHOOK_SECRET`: server environment only. Leave empty until configured; never put it in a browser build.
- `PAYPAL_CLIENT_ID`: server environment only. Leave empty until configured; never put it in a browser build.
- `PAYPAL_CLIENT_SECRET`: server environment only. Leave empty until configured; never put it in a browser build.
- `PAYPAL_WEBHOOK_ID`: server environment only. Leave empty until configured; never put it in a browser build.
- `ENTITLEMENT_SECRET`: server environment only. Leave empty until configured; never put it in a browser build.
- `KEY_VAULT_SECRET`: server environment only. Leave empty until configured; never put it in a browser build.

`KEY_VAULT_SECRET` is consumed by Part 2 encryption. Payment webhooks use their dedicated signing secret, not the API secret. PayPal verification fetches only a fixed PayPal certificate URL pattern; no secret appears in a URL.
