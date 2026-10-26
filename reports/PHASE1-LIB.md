# Report: Phase 1 library (owner catalog, owner app, instant insert) (2026-10-26)

## 1. Summary

- The shared library (shapes, backgrounds, text styles, font combinations, templates, transitions, themes, styles, sounds) no longer ships inside the editor. It lives in **your** library, published as a signed catalog; the editor only reads it and keeps a copy in the browser.
- You have your own **library manager** (a separate app, only on your computer): log in with password and a 2-step code, upload packs, media files or zips (checked automatically), edit names, tags, licence, order, featured, hidden and schedule, publish, unpublish and roll back. `npm run owner` starts it.
- In the editor, library items appear **in the same frame** as the click or drop, even on a slow network. Videos, photos and sounds from the library appear at once from a small preview and switch to the full file without moving.
- With no network and no saved copy, the editor still opens with a tiny basic pack and says why. A tampered catalog is refused and the saved copy keeps working.
- Cloud: project pictures in Open from cloud, **Free space** for uploaded files no project uses, Google sign-in only when it is set up. AI-built videos keep a training record. Feature keys for later plans (all on).
- Still blocked: a real Supabase server and real Google sign-in (they need your PC and your accounts).

## 2. Scope and results

Every item P1-01 to P1-34 is ledger row LIB-001 to LIB-034 (same number).

| ID | Result | Evidence (test title or file) |
|---|---|---|
| LIB-001, 002, 003 (P1-01 to 03 audit) | Verified | reports/PHASE1-LIB-AUDIT.md; tests/library/docs.test.ts `[LIB-001][LIB-002][LIB-003] the audit names every bundled source…` |
| LIB-004 (format) | Verified | tests/library/catalog.test.ts `[LIB-004] the seeded catalog has a signed manifest…` |
| LIB-005 (inline, heavy media) | Verified | catalog.test.ts `[LIB-005] small items are inlined; sounds carry a waveform poster, a small proxy and the full file` |
| LIB-006 (Ed25519) | Verified | catalog.test.ts `[LIB-006]…`; client.test.ts `[LIB-021][LIB-006]…`; e2e lib-editor `[LIB-021][LIB-006] a catalog with a wrong signature is rejected…` |
| LIB-007 (publish gate) | Verified | catalog.test.ts `[LIB-007] the gate rejects with one plain sentence per reason, fails closed…`; gate-browser.test.ts (real headless Chromium) |
| LIB-008 (versions, rollback) | Verified | catalog.test.ts `[LIB-008]…`; e2e lib-editor `[LIB-027][LIB-008] a rollback in the catalog never changes a project…` |
| LIB-009 (seed) | Verified | catalog.test.ts `[LIB-009] the seed is deterministic…` |
| LIB-010, 015 (catalog server) | Verified | catalog.test.ts `[LIB-010][LIB-015] the catalog server: ETag and 304…` |
| LIB-011 (isolation) | Verified | tests/library/isolation.test.ts `[LIB-011]` (2 tests); `npm run build` runs scripts/assert-editor-bundle.mjs |
| LIB-012, 013, 018, 019 (owner security, audit log) | Verified | tests/library/owner-auth.test.ts `[LIB-018]` ×4, `[LIB-012]`, `[LIB-013]`, `[LIB-019]` |
| LIB-014, 016, 017 (owner app) | Verified | e2e lib-owner `[LIB-017][LIB-014][LIB-016] one command starts the manager…`; e2e lib-editor `[LIB-023][LIB-017] what the owner hides, features, orders, schedules or unpublishes…shows in the editor after a refresh` |
| LIB-020 (client) | Verified | client.test.ts `[LIB-020]…`; e2e lib-editor `[LIB-022][LIB-020][LIB-023][LIB-029] every library category loads from the signed catalog…` |
| LIB-021 (offline, fallback, bad signature) | Verified | client.test.ts `[LIB-021]` ×2; e2e lib-editor `[LIB-021] with no catalog and no saved copy…`, `[LIB-021][LIB-006]…`; e2e h5-library `[TPL-010]` (rewritten to the fallback) |
| LIB-022 (panels from the catalog) | Verified | e2e lib-editor `[LIB-022][LIB-020][LIB-023][LIB-029]…` |
| LIB-023 (placeholder, owner controls, plan lock) | Verified | client.test.ts `[LIB-023]…`; e2e lib-editor (placeholder, lock, and the manager → editor test) |
| LIB-024 (instant insert) | Verified | e2e lib-editor `[LIB-024][LIB-025] on a throttled network every category places at once…` |
| LIB-025 (heavy media poster, proxy, swap) | Verified | same test (poster drawn at once, full file arrives later, selection corners identical) |
| LIB-026 (failed download never blocks) | Verified | e2e lib-editor `[LIB-026] a failed download never blocks…Retry…` |
| LIB-027 (projects keep their copy) | Verified | client.test.ts `[LIB-027][LIB-025]…`; e2e lib-editor `[LIB-027][LIB-008]…` |
| LIB-028 (bundled library removed) | Verified | tests/library/bundle.test.ts `[LIB-028]…`; `npm run build` assertion |
| LIB-029 (e2e set, render identity) | Verified | client.test.ts `[LIB-029] render identity: the catalog gives the panels exactly the records the editor used to bundle`; e2e lib-editor suite |
| LIB-030 (feature keys) | Verified | tests/features.test.ts `[LIB-030]…`; e2e lib-features `[LIB-030] the Export button is normal by default, shows Upgrade…` |
| LIB-031 (training record) | Verified | tests/training/record.test.ts `[LIB-031]…`; e2e phase1-cloud `[LIB-032][LIB-031]…`; `npm run cloud:test` (owner-only table) |
| LIB-032 (cloud leftovers) | Verified (Google round trip BLOCKED) | e2e phase1-cloud `[LIB-032][LIB-031] the Open list shows each project picture, Free space…, Google sign-in shows only when set up…` |
| LIB-033 (Hindi) | Verified | tests/library/hindi.test.ts `[LIB-033]…` |
| LIB-034 (docs, ledger) | Verified | tests/library/docs.test.ts `[LIB-034]…`; `npm run ledger` |

- In-scope P0 items Verified: 34 of 34 (each with a passing test naming it).
- BLOCKED (external): (1) real Google sign-in round trip: needs your Google client id and Google enabled in Supabase; the button and its rule are built and tested. (2) A run against a real `supabase start`: the sandbox cannot download the Supabase images (D-327); the SQL rules run on a real PostgreSQL 16 here. (3) "Poster within 100 ms" on real hardware: proven here as "the first frame drawn after the release" with no request on the way; this sandbox draws in software, so its frames take 80 to 290 ms (numbers in section 7).

## 3. Checks

- `npm run verify` (one full run, Node 20.19, sandbox): exit 1: format, typecheck, unit tests, build and ledger passed; e2e 676 passed, 9 failed, 5 skipped (1.4 h).
- Format: all files pass Prettier. Typecheck: clean. Build: passed; `scripts/assert-editor-bundle.mjs`: "Editor bundle: 69 files, no owner app, no bundled library payloads." The built editor is 105,769 bytes smaller than `claude/fix-5` (37,547,471 → 37,441,702 bytes).
- Unit and jsdom tests: 1308 passed, 1 skipped, in 152 files (Vitest).
- The 9 e2e failures, then re-run alone:
  - 5 came from this work: the 3 Creator Pack style examples I had put into the seed showed in a fresh AI panel (FX1-016, FX4-004, RA-009/RA-010, S1-003, S1-004, S1-008). Fixed by leaving them out of the seed (D-344). That also found a real bug in the owner's publish gate: it passed effect and transition objects instead of their ids, so every uploaded style naming one was refused. Fixed, with a regression test (`[LIB-007] the gate knows the editor's effect and transition ids`).
  - AUD-021/AUD-013: a press on a sound tile no longer prepared the sound (V7 behaviour). Restored.
  - LAY-038 and LAY-057: passed alone without changes (LAY-057 is a known long-run flake, D-328).
  - Re-run after the fixes: those 9 specs, plus `lib-editor` (6 tests), `b1-styles`, `lib-owner`, `lib-features` and `phase1-cloud`: all passed. The library unit tests passed too (33).
- E2E browser: Playwright's Chromium 153 (HeadlessChrome/153.0.0.0), at 1920 × 940.
- Ledger validation: "Ledger OK" (LIB-001 to LIB-034 Verified).
- `npm run cloud:test`: "policy tests passed" (PostgreSQL 16 with the stand-in Supabase schemas; it fails when the training table's rules are removed).
- CI: not watched (limit mode; the local verify is the gate).

## 4. Try-it script for the owner (about 10 minutes)

| # | Do this | Expect | ID | Ran it here | Screenshot |
|---|---|---|---|---|---|
| 1 | `npm run owner:create -- --email you@example.com --password "<12+ characters>"`; add the printed secret to your authenticator app | "Owner account ready" and a 6-digit code in the app | LIB-012 | Y (e2e) | — |
| 2 | `npm run owner` | Two lines: the library manager at http://127.0.0.1:4300 and the catalog at http://127.0.0.1:4310 | LIB-017 | Y (e2e) | — |
| 3 | Open the manager, log in with email, password and the app's code | The Library tab with every category | LIB-014 | Y (e2e) | — |
| 4 | Upload tab: choose `examples/creator-packs/shape.json` → Upload | "Published shape-pack-shape-kite." and "Catalog version N is live." | LIB-007 | Y (e2e) | — |
| 5 | Upload `examples/creator-packs/bad-missing-field.json` | A red line saying exactly what is wrong; nothing published | LIB-007 | Y (e2e) | — |
| 6 | In a second terminal: `VITE_LIBRARY_CATALOG_URL=http://127.0.0.1:4310/ npm run dev`, open the editor | Elements, Text, Templates, Audio and Theme are full; the kite is in Elements | LIB-022 | Y (e2e) | — |
| 7 | Click a shape, drag a text style onto the canvas, click a sound in Audio | Each appears at once | LIB-024 | Y (e2e, throttled) | — |
| 8 | In the manager: tick Hidden on one sound, Save; Unpublish another (asks for password and code) | Saved; "Not published" | LIB-016, LIB-019 | Y (e2e) | — |
| 9 | Reload the editor, open Audio | Both sounds are gone | LIB-023, LIB-017 | Y (e2e) | — |
| 10 | Versions tab: Roll back to version 1 | The editor (after reload) no longer lists the kite; a project that used it is unchanged | LIB-008, LIB-027 | Y (e2e) | — |
| 11 | Turn the network off in the browser's DevTools and reload the editor | It opens from its saved copy; insert still works | LIB-020 | Y (e2e, unit) | — |
| 12 | Audit tab | Every action you did is listed; "The audit log is intact." | LIB-013 | Y (e2e) | — |
| 13 | The 10-minute real Supabase check below | As described there | APP-020, LIB-031, LIB-032 | N (blocked here) | — |

**Real Supabase check (your PC, about 10 minutes; from reports/PHASE1-STATUS.md):**

1. Install Docker Desktop, then `npm run cloud:start`. It prints `API URL` and `anon key`.
2. Copy `.env.example` to `.env.local`, fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, run `npm run dev`.
3. `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run cloud:test` → "policy tests passed" (now also checks `training_records`).
4. In the editor: Log in → Create account → import a picture, add it → Save to cloud.
5. Supabase Studio (http://127.0.0.1:54323): the `projects` row and the file under Storage › media › your id.
6. Another browser (or a private window): log in, Open from cloud: the project's picture shows in the list; open it, the picture comes back.
7. Account › Free space: lists only files no project uses.
8. For Google: set `VITE_GOOGLE_CLIENT_ID` and enable Google in `supabase/config.toml`; the login dialog then shows "Continue with Google".

## 5. Deviations from the brief

- `node:sqlite` is not in Node 20 (the project's Node), so the owner's store is JSON files (D-330).
- The seed content (the editor's own, already tested library) is checked by the schemas but not by the headless render gate; every owner upload is (D-333).
- Instant insert is proven as "first frame after the release, zero requests on the way" rather than a fixed millisecond budget, because this sandbox renders in software (D-339; numbers in section 7).
- Automatic cloud sync and resumable uploads were in the Phase 1 status's leftovers but not in this brief's P1-32 list; they stay as they were (reports/PHASE1-LIB-AUDIT.md).

## 6. Decisions made

D-329 to D-343 in docs/DECISIONS.md: catalog format (D-329), JSON store (D-330), publish gate (D-331), Ed25519 (D-332), seed (D-333), owner app security (D-334), isolation (D-335), editor client (D-336), catalog media in projects (D-337), bundled library removed (D-338), instant insert (D-339), the e2e guard exception for aborted catalog checks (D-340), training records (D-341), cloud leftovers (D-342), feature keys (D-343).

## 7. Not tested, known gaps, risks

- Real Google sign-in and a real Supabase server (blocked, see above).
- Real CDN, HTTPS, passkeys, Cloudflare Access or a VPN in front of the owner app: launch-gate deployment steps, not built (owner/README.md).
- Measured release-to-first-frame times in this sandbox (software rendering, throttled network, all with zero requests on the way): elements click 113.9 ms and drag 118.7; draw (flowchart) 81.3 and 111.8; text 122.0 and 159.8; audio 209.6 and 121.7; template 174.4; video 278.6 and 146.5; photo 288.2 and 166.7. Each was the first frame after the release, and no network request was made..
- A catalog item whose payload is larger than 8 KB arrives as a file during idle prefetch; until then its card is not listed (the seed has none over 8 KB in the panels' kinds).
- Catalog styles, motion and presets show in AI next to your own items; Rename and Delete do nothing for them (they belong to the catalog).
- Uploading a large video through the manager runs the proxy encode in the headless browser; only small fixtures were tried here.
- The training record keeps command names, not their values, by design (no screen yet).

## 8. Architecture and contract impact

- Schema version change: none (schema 9). Catalog media assets use existing asset fields (metadata `catalog`, `catalogProxy`, `catalogPoster`).
- New dependencies: none (WebCrypto in the browser, node:crypto, node:http and node:zlib on the owner side).
- Files added: `src/library-client/`, `src/features/registry.ts`, `src/training/record.ts`, `src/audio/wav.ts`, `owner/` (catalog tools, server, UI, gate harness), `library/seed/`, `vite.library.ts`, `scripts/assert-editor-bundle.mjs`, one Supabase migration, tests under `tests/library/`, `tests/training/`, e2e `lib-owner`, `lib-editor`, `lib-features`. Removed: `public/library/index.json`, `src/audio/sound-pack.ts`.
- Contracts touched: none.

## 9. Ledger and backlog

- Status changes: LIB-001 to LIB-034 added, all Verified.
- Ledger Change Requests applied: new section LIB (Phase 1 library).
- Added to docs/BACKLOG_INBOX.md: 0.

## 10. Git

- Branch: `claude/phase1-library` (from `claude/fix-5`). Draft PR stacked on `claude/fix-5`. No tag (Phase 1 work is reviewed by PR).
- Commits: see the PR.

## Owner tick-list

| ID | OK / BUG / MISSING / CHANGE | One sentence |
|---|---|---|
| LIB-014 | | |
| LIB-016 | | |
| LIB-017 | | |
| LIB-022 | | |
| LIB-024 | | |
| LIB-025 | | |
| LIB-032 | | |
