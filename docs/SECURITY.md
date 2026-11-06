# SECURITY.md: what is protected, how it is tested, what is still open

This is an honest list. It does **not** say the product is "unhackable". A real,
independent security review (penetration test) is still needed before launch.

## Where each rule is enforced

| Rule                                                                                        | Where                                                                                            | Test                                         |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Admin has no route on the user server; it lives in the Owner App behind password + code     | `server/surfaces.ts`, `owner/server/admin-bridge.ts`, `owner/server/app.ts`                      | P4A-001..005                                 |
| Dangerous admin actions ask for a fresh password and code and leave an audit row (no value) | `owner/server/app.ts` (`adminNeedsReauth`)                                                       | P4A-004, P4A-012                             |
| Every signed-in route needs a valid token; forged, expired, "alg none" tokens are refused   | `server/auth.ts`                                                                                 | P4S-001, P4S-002                             |
| A person cannot become admin by editing their own profile (only `app_metadata` counts)      | `server/auth.ts`                                                                                 | P4S-002                                      |
| One person never reaches another's data; the person is always the token's, never the body's | every route in `server/app.ts` uses `caller.userId`                                              | P4S-003                                      |
| Numbers, sizes and JSON are checked (range, integer, size 256 KB, `__proto__`)              | `n()`, `str()`, `readBody` in `server/app.ts`                                                    | P4S-004                                      |
| Credits are charged by the server at the owner's price, once per key                        | `/v1/workspace/style-fee`, the ledger                                                            | P4S-005                                      |
| No provider address or key name in the public settings; keys are never sent to a browser    | `publicConfig` in `server/app.ts`; the vault (`server/keys`) returns last 4 only                 | P4S-006, P4A-007                             |
| The offline test payment never runs when `AUTH_MODE=supabase`                               | `/v1/plan`, `/v1/topup`                                                                          | P4S-007                                      |
| Rate limits per address, failed sign-in lockout, allowed sites only, security headers       | `server/app.ts` (`SERVER_IP_PER_MINUTE`, `SERVER_BAD_AUTH_PER_MINUTE`, `SERVER_ORIGINS`)         | P4S-008                                      |
| Payment webhooks are signature-checked and replay-checked before any credit                 | `server/payments`                                                                                | P4S-009 and `tests/p3-engine`                |
| Cloud space is limited by the database, not only the editor                                 | `supabase/migrations/20261108000000_p4_security.sql` (trigger), `usage_of()` used by the gateway | **not run on a real Supabase** (P4S-010)     |
| Every table is per-person (row-level security); people cannot write plan, credits or ledger | `supabase/migrations/*`                                                                          | needs a live Supabase to prove (owner round) |

## Behind a proxy

Set `TRUST_PROXY=1` only when a trusted proxy sets `X-Forwarded-For`; otherwise every visitor looks like the proxy and shares one rate limit. Set `SERVER_HTTPS=1` when served over HTTPS (adds HSTS).

## Still open (not done, said plainly)

- The SQL migration of this round and all earlier Supabase migrations were **not run against a real Supabase** (the sandbox cannot start it). Run `supabase db reset` and the owner's real-API round first.
- No independent penetration test, no dependency audit (`npm audit`) beyond what CI shows, no bot protection (CAPTCHA) on sign-up.
- The rate limiter keeps its counters in memory: with several server copies, each has its own count. A shared limiter (Redis, or the CDN) is a deployment step.
- Director prompts are part of the public settings (they are the owner's text, not secrets); move them server-side if they should be private.
- The Owner App listens on 127.0.0.1 only. Putting it on the internet needs HTTPS, a VPN or Cloudflare Access in front, and passkeys (see `owner/README.md`).
- Local mode (`AUTH_MODE=local`) is for development; never run a live site in it.
