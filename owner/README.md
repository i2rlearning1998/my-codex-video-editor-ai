# Owner library manager

The owner's own product for the shared library (Phase 1, docs/LIBRARY.md). It lives in this repository but is never part of the editor: nothing under `src/` imports it, the editor's dev server refuses `/owner/` paths, and the editor build is checked for its routes (`tests/library/isolation.test.ts`).

## Start it (one command)

```
npm run owner:create -- --email you@example.com      # once: the one owner account
npm run owner                                        # the manager and the catalog server
```

- The library manager opens at http://127.0.0.1:4300/ (log in with your password and the 6-digit code from an authenticator app; `owner:create` prints the 2-step secret).
- The catalog server (read only, the stand-in for the CDN) runs at http://127.0.0.1:4310/.
- To point an editor build at it: `VITE_LIBRARY_CATALOG_URL=http://127.0.0.1:4310/` in `.env.local`, and the public key from `owner/keys/catalog-public.txt` as `VITE_LIBRARY_PUBLIC_KEY`. In `npm run dev` the editor already uses its own local catalog and this key.
- Ports: `OWNER_PORT`, `CATALOG_PORT`. Folders: `LIBRARY_DATA_DIR` (owner-data/), `LIBRARY_CATALOG_DIR` (catalog-out/), `LIBRARY_KEYS_DIR` (owner/keys/). All three are ignored by git.

## Command line

| Command                                               | What it does                                                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `npm run library:keys`                                | makes the signing key (refuses to replace one; `-- --force` replaces it)                                       |
| `npm run library:seed`                                | publishes the first catalog from the seed content (`library/seed/`)                                            |
| `npm run library:publish -- <files, folders or zips>` | the publish gate, then a new catalog version (`--license name --credit text` for media without a details file) |
| `npm run library:rollback -- <version>`               | re-points the catalog to an older version                                                                      |
| `npm run library:versions`                            | lists the versions                                                                                             |

## Security (built now)

scrypt password hash, TOTP 2-step codes (RFC 6238), a lockout after 5 wrong tries (15 minutes), constant-time compares, a strict Content Security Policy and security headers, a CSRF token plus an Origin check on every change, an HttpOnly SameSite=Strict session cookie, re-authentication within 5 minutes for unpublish, delete, rollback and key rotation, and an append-only, hash-chained audit log of every action. It binds to 127.0.0.1 only and sends no CORS headers. There is no sign-up route.

## Launch gate (deployment, not built now)

Passkeys, Cloudflare Access or a VPN in front of the manager, HTTPS (then `OWNER_SECURE_COOKIE=1`), and a real CDN for the catalog folder are deployment steps of the launch gate.

## Admin (P4 Part 3)

The Owner App is also the Admin. After login the second row of tabs holds: Dashboard, AI Providers & Models, Users, Plans & Credits, Feature flags, Director rules, Projects & Styles, Stock & offline engines, Admin audit, Emergency switch and Platform Config.

- **Own address and login.** The Admin is only at the Owner App's address (127.0.0.1:4300 here), behind the same password + 6-digit code. Nothing on the website, the panel or the editor links to it.
- **A separate server.** The Admin API runs inside the Owner App process on its own internal port (127.0.0.1, not reachable from the network, secret per start). The user server (`npm run server`) answers 404 for every admin route (`server/surfaces.ts`).
- **Re-login for dangerous actions.** Keys, settings, refunds, credits, plan changes, suspension and the emergency switch ask again for the password and a fresh code (5 minutes), and leave an audit row (what and who, never the value).
- **Keys.** A key is typed into the vault screen once, encrypted with `KEY_VAULT_SECRET`, and never shown again (last 4 only).
- **Same data as the user server.** In local mode both read the same `SERVER_DATA` folder (set the same value for both). With Supabase set (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) both use the database.
- **Nothing is pre-assigned.** Add a provider (any name, type, address), its key, its models (kind and capability tags), then choose the model for each job. Each choice only lists models that can do the job.
- The older mock page at `/admin/` exists in dev and tests only; a normal build does not contain it.
