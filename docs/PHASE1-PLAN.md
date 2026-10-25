# Phase 1 plan: accounts, database, file storage, cloud save

Plain-language plan for the owner. Phase 1 adds what a real product needs around the editor: people log in, their projects are saved on a server, their media files are stored there too, and they can open their work on another computer. The editor itself does not change; it gains a **Cloud** menu next to the existing local save.

## 1. What we use: Supabase

Supabase is one package that gives us three things we need, all open source:

| Need         | Supabase part | What it does for us                                                                                                                                        |
| ------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login        | **Auth**      | Sign up and log in with email and password now; Google login later with one setting. It also speaks OAuth, which the Claude connector of Phase 2 will use. |
| Database     | **Postgres**  | Tables for projects and media. A "row-level security" rule on every table makes sure a person only ever sees their own rows, even if the editor had a bug. |
| File storage | **Storage**   | A private bucket called `media` for videos, pictures and sounds. Each person has their own folder.                                                         |

No custom server is needed for Phase 1: the editor talks to Supabase directly, and the database rules do the protecting. A small server comes only when we need secret keys (the AI proxy of Phase 2; D-011).

## 2. Tables, rules and buckets

All of this lives in the repository under `supabase/` (SQL migrations), so the same setup can be created on any machine.

**`projects`** (one row per cloud project)

| Column                     | Meaning                                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | the project's cloud id                                                                                                      |
| `owner_id`                 | the logged-in person (filled in automatically)                                                                              |
| `name`                     | shown in the Cloud projects list                                                                                            |
| `schema_version`           | the editor version that wrote it; a newer one is never overwritten by an older editor                                       |
| `document`                 | the project JSON, exactly as the editor saves it (no media bytes, D-004)                                                    |
| `revision`                 | a counter; a save must name the revision it started from, so two tabs or two computers cannot silently overwrite each other |
| `thumbnail`                | a small picture of the first scene for the list                                                                             |
| `created_at`, `updated_at` | times                                                                                                                       |

**`media`** (one row per media file a person uploaded)

| Column                      | Meaning                                                                    |
| --------------------------- | -------------------------------------------------------------------------- |
| `owner_id`                  | the person                                                                 |
| `fingerprint`               | the same content id the editor already uses (`media/<fingerprint>`, D-052) |
| `name`, `mime_type`, `size` | for lists and checks                                                       |

**Row-level security**: on both tables, every read and write is allowed only when `owner_id` is the logged-in person. Without a login nothing is visible.

**Storage bucket `media`** (private): a file is stored at `<person id>/<fingerprint>`. The bucket's rules allow a person to read and write only inside their own folder. Files up to 1 GB each (a setting).

## 3. How the editor talks to it

- `src/cloud/` holds the client module behind one interface (`CloudBackend`): sign up, log in, log out, list projects, open, save, rename, delete, upload and download media. `src/core` stays free of any network code (AGENTS.md §4).
- The Supabase JavaScript library (`@supabase/supabase-js`) is loaded only when the person opens the account menu or a cloud action, so the editor starts as fast as before.
- The top bar's account slot (APP-020) shows **Log in** or the person's email with a menu: Save to cloud, Open from cloud, Log out.
- **Save to cloud** writes the project JSON and uploads every media file the project uses that the cloud does not have yet (by fingerprint, so a file is uploaded once).
- **Open from cloud** lists the person's projects; opening one downloads the media files that are not in this browser yet into the browser's media store, then opens the project as a new local project (the local list keeps working).
- **Local-only keeps working.** If the server is off, not configured, or the network drops, cloud actions show a clear message and nothing local changes. The project is never lost: the local autosave runs as before.
- Keys: only the public "anon" key and the server address go into `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). The rules above protect the data; the secret "service role" key is never in the editor. `.env.example` shows the names; real keys are never committed.

## 4. Running it on your PC (no account, no cost)

1. Install Docker Desktop once.
2. `npm run cloud:start` starts the local Supabase (database, login, storage) and prints its address and anon key.
3. Copy them into `.env.local` (see `.env.example`) and run `npm run dev`.
4. `npm run cloud:stop` stops it. `npm run cloud:test` runs the database and rule tests.

## 5. Hosting later: two choices

|                     | Supabase Cloud (their servers)                                                                                                                            | Self-hosted Supabase on a Hostinger VPS                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Cost                | Free plan to start (small limits, pauses after a week of no use); about 25 USD a month for the first paid plan, plus storage and traffic above its limits | the VPS price (roughly 5 to 15 USD a month for 4 to 8 GB RAM); storage limited by the VPS disk             |
| Work for us         | almost none: backups, updates, security patches, email sending are done for us                                                                            | we install Docker, run Supabase's docker setup, set up HTTPS, backups, updates and email sending ourselves |
| Speed and limits    | their CDN for files; auto-scaling database plans                                                                                                          | one machine; big video files fill the disk quickly and use its bandwidth                                   |
| Risk                | depends on a company (but it is open source, so we can move off it)                                                                                       | if the VPS breaks, we fix it; a missed backup can lose data                                                |
| Moving between them | the same SQL migrations and the same editor code work on both; moving is a database dump plus copying the storage files                                   | same                                                                                                       |

**Recommendation**: start on **Supabase Cloud's free plan** for the first real users (nothing to maintain, real backups), and keep the self-hosted VPS as the cheaper option once usage and storage are known. Big video storage is the main cost on either side; later we can put media files on a cheaper object store (for example Cloudflare R2) without changing the editor's interface.

## 6. What Phase 1 does not do yet

- Google login (the switch is ready in `supabase/config.toml`; it needs a Google client id).
- Sharing a project with another person, comments, real-time collaboration (ADV-008).
- Very large uploads in pieces (resumable upload); files are uploaded in one request for now.
- Automatic background cloud sync; saving to the cloud is a button for now.
