# Phase 1 status: accounts, database, storage, cloud save

Date: 2026-10-25. Branch `claude/fix-5`. Plan: docs/PHASE1-PLAN.md. Decisions: D-326, D-327.

## What works (built and tested here)

| Part | Where | Proof |
|---|---|---|
| Tables `projects` and `media`, owner-only row-level security, private `media` bucket with owner-folder rules, revision trigger | `supabase/migrations/20261025000000_phase1_projects_media.sql`, `supabase/config.toml` | `npm run cloud:test` (supabase/tests/policies.sql): another person cannot read, change or delete a row or a file, `anon` sees nothing, a stale revision updates nothing, the owner cannot be changed. Fails when the policies are removed (checked once). Ran on PostgreSQL 16 with stand-in `auth`/`storage` schemas. |
| Client behind one interface | `src/cloud/backend.ts`, `src/cloud/supabase.ts` | typecheck; used by the e2e below |
| Account slot (APP-020): Log in / Create account, email shown, Save to cloud, Open from cloud (rename, delete), Log out | `src/ui/cloud-ui.ts`, mounted in `src/main.ts` | e2e/phase1-cloud.spec.ts, 3 tests, passing in Chromium 153 |
| Save uploads only missing media (by fingerprint); JSON has references only | cloud-ui.ts `save` | e2e: bytes in the owner's folder equal the file; a second save uploads nothing and moves the revision 1 → 2 |
| Open on a fresh browser downloads the media, opens as a new local project | cloud-ui.ts `openOne` | e2e: a new browser context with no media logs in, opens, and has the file's exact bytes in its media store |
| Two saves from different places never overwrite each other | revision check, conflict dialog | SQL test (stale revision updates nothing); the dialog itself is not driven by an e2e |
| Local only keeps working | cloud-ui.ts | e2e: no cloud set up → "not set up" message, no history change; server down → "cannot be reached" in the login dialog |

## Blocked here (not a code problem)

- **Real local Supabase (`npm run cloud:start`) did not start in the sandbox**: the network policy refuses the image downloads (ghcr.io blob host 403, public ECR 403, Docker Hub 429). So the browser test talks to a stand-in API (`e2e/cloud-fake.ts`) that answers the same requests supabase-js sends, and the SQL tests use stand-in `auth`/`storage` schemas. Both are written to be replaced by the real thing without code changes.

## For the owner's PC (about 10 minutes)

1. Install Docker Desktop, then `npm run cloud:start`. It prints `API URL` and `anon key`.
2. Copy `.env.example` to `.env.local`, fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, run `npm run dev`.
3. `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run cloud:test` → "policy tests passed".
4. In the editor: Log in → Create account (local Supabase confirms emails automatically) → import a picture, add it → Save to cloud.
5. Open Supabase Studio (http://127.0.0.1:54323): the `projects` row and the file under Storage › media › your id.
6. Open the editor in another browser (or a private window), log in, Open from cloud: the project and the picture come back.
7. `npm run cloud:stop` while the editor is open: Save to cloud says the server cannot be reached; local autosave still says Saved.

## Not done yet (remaining list)

- Google login button (the interface has `signInWithProvider('google')`; needs a Google client id in `supabase/config.toml`).
- Automatic cloud sync; saving is a button. A local project's link to its cloud project is kept per browser.
- Resumable upload for very large files (one request per file now; the bucket limit is 1 GB).
- Removing cloud media that no project uses any more (files stay in the bucket).
- Thumbnails of cloud projects are stored but not shown in the list yet.
- An e2e run against a real `supabase start` (blocked above).
- Hosting choice (Supabase Cloud free plan recommended first; see the plan).
