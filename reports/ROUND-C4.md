# Report: Round C4, the Admin Styles Builder, the field library editor and the Admin gaps (2026-11-16)

## 1. Summary

- The owner can now make a Readymade Style entirely in the Admin, with no code and no JSON file: edit every field, write or upload the plan template, check it, record tests, publish, roll back, delete and restore, copy, order, limit it to plans, and export or import it.
- He can turn one of his own Videos (made with Claude) into a Draft Style in one step: the plan becomes the template, the topic, narration, language, length and media become slots, his Project's look becomes look 1 and the Video's code graphics go into the kit.
- New Admin tabs **Brief fields** (the field library editor) and **Director limits** (every Director setting that had no screen, including web search, the layout check and where media comes from). A coverage list (docs/ADMIN-COVERAGE.md) and a test make sure no setting is left without a screen or a written reason.
- The MCP tab shows every action that can cost credits through Claude, with its rule and a multiplier or fixed price, plus the file limits.
- A scene that only reuses media the person already has now costs only what is new, for the Director and for Claude alike.
- **The card export and the editor export do not match yet near motion and the scene cut.** This was measured, not assumed, and is recorded as a Bug (section 3).
- **Nothing ran against a real Claude, a real Supabase or a public address.** Everything is proven in the harness (the real server, the official MCP client, the Owner App with its login, and the panel in Playwright Chromium).

## 2. Scope and results

| ID | Result | Evidence |
|---|---|---|
| RDC4-001, 002 | Verified | tests/round-c4/leftovers.test.ts |
| RDC4-003, 026, 027, 035 | Verified | e2e/round-c4-panel.spec.ts |
| RDC4-004 | **Bug** (test.fail) | e2e/round-c4-export-compare.spec.ts, reports/round-c4/export-compare.json |
| RDC4-005 | Verified | tests/round-c4/reuse-cost.test.ts |
| RDC4-010 to 025 | Verified | tests/round-c4/builder.test.ts |
| RDC4-030 to 034 | Verified | tests/round-c4/from-project.test.ts |
| RDC4-040, 041, 050, 060, 070 | Verified | e2e/round-c4-admin.spec.ts (Owner App in the browser) |
| RDC4-051, 052, 062 to 065 | Verified | tests/round-c4/effects.test.ts |
| RDC4-061 | Verified | tests/round-c4/coverage.test.ts |
| RDC4-066 | Verified | e2e/round-c4-director.spec.ts |

The brief's items and where they ended:

| Brief item | Result |
|---|---|
| 0.1 legacy sample Styles, "Add a template" | Done (RDC4-001, 015, 040) |
| 0.2 looks in English and Hindi, warning | Done (RDC4-002, 040) |
| 0.3 New project dialog published-only | Done (RDC4-003) |
| 0.4 card vs editor export, measured | Done as measured; the result is a **Bug** (RDC4-004) |
| 0.5 reused media charged only for what is new | Done (RDC4-005) |
| 1.1 to 1.9 the builder | Done (RDC4-010 to 027, 040), except the parts below |
| 1.2 poster picked from a video frame | **Blocked** (owner decision): needs the headless browser gate on the Owner App; upload only, as the brief allows |
| 1.3 frame sample | Done as an SVG sketch of scene 1 (not a rendered frame; D-469) |
| 2.1 to 2.4 Style from a Project | Done for Claude-made Videos (RDC4-030 to 034) |
| 2.2 Director-made Videos | **Blocked** (owner decision): their plans live in the person's browser (Round A); keeping them on the server is a choice for the owner |
| 2.2 sample from the Video's last export | **Blocked** (architecture, D-445): the chat export file is made on the person's device; the server keeps only its id |
| 2.4 the panel gallery path with a Style made from a Video | Done (RDC4-035) and through Claude (RDC4-034) |
| 3.1 to 3.4 field library editor | Done (RDC4-050 to 052) |
| 4, 4.1, 4.2 Director limits and coverage | Done (RDC4-060 to 062, 066) |
| 5.1 Library manager one click | Done (RDC4-060) |
| 5.2 MCP credit rules and limits | Done (RDC4-063, 070) |
| 5.3 Studio fields | Done (RDC4-064) |
| 5.4 providers and assignments | Done (RDC4-065) |
| 5.5 verify-only Admin tabs | Done (RDC4-070); nothing found broken |

- In-scope rows Verified: 41 of 42. RDC4-004 is a Bug with its reproduction.
- "Verified" means proven in the harness, not with a real Claude or Supabase.

## 3. Checks

LIMIT MODE: the full e2e suite and `npm run verify` were not run locally. Only each part's specs were run.

- Format (`prettier --check` on every changed file): passes. Typecheck: `tsc --noEmit` and `tsc --noEmit -p tsconfig.e2e.json`: both pass.
- Build (`npm run build`): passes. **Editor first load: 5,994,353 bytes, unchanged from Round C3** (limit C3 + 3,000). With lazy chunks 8,649,162 bytes. The Owner App grows by one transpiled module (owner/ui/builder.ts) and its server by owner/server/styles.ts; the panel grows by a few lines (plan lock).
- Unit tests (Vitest): tests/round-c4: 32 passed in 6 files. Also run and passing: tests/round-c3, round-c2, round-c1, platform-config, admin-app, director, panel (after two updates, section 5).
- E2E (Playwright Chromium, Linux sandbox, not Google Chrome): round-c4-admin 5 passed, round-c4-panel 4 passed, round-c4-director 1 passed, round-c4-export-compare 1 expected failure.
- Ledger: `Ledger OK` (1420 items, Verified 1089, Bug 2).
- CI: checked once after the last push (see the closing message).

### 0.4 measured: card export vs editor export

One Claude video (Tier B block "bar-rise" and Tier C free code "orbit-ring", 9:16, 24 fps, 4 s) exported through the chat card and through the editor's Export dialog; both files decoded in the browser at the same moments and scaled to 180 x 320.

| Time | Mean difference (of 255) | Largest | Pixels over 8 |
|---|---|---|---|
| 0.5 s | 0.06 | 44 | 0.43% |
| 1.2 s | 0.24 | 36 | **1.55%** |
| 1.9 s | **4.61** | 64 | **19.06%** |
| 2.6 s | 0.08 | 16 | 0.42% |
| 3.4 s | 0.09 | 18 | 0.38% |

The rule (mean under 1.5 and no frame with more than 0.5% of pixels over 8) fails at 1.2 s and 1.9 s. The still parts agree closely; the differences sit where things move and next to the cut at 2.0 s, which points to a one-frame time offset between the two encodes rather than different drawing. Not fixed in this round (BACKLOG).

## 4. Try-it script for the owner (a real test with a tunnel and a real Claude)

| # | Do this | Expect | ID | Ran here | Screenshot |
|---|---|---|---|---|---|
| 1 | `npm run owner`; log in; Admin › Readymade Styles | Three samples, each "Uses the Director's form only" | RDC4-015 | Y (harness) | reports/round-c4/screens/styles-list.png |
| 2 | My user account: your panel email; confirm with the code | Saved; your account now sees Draft Styles | RDC4-030 | Y (harness) | — |
| 3 | In claude.ai with the connector: make a 40 s Circumference video, approve it | A Claude-made Video in your account | RDC4-034 | N (real Claude) | — |
| 4 | Make a Style from a Project › List my Projects › Make a Draft Style on that Video | The Style editor opens with slots, look 1 and the kit | RDC4-033 | Y (harness) | reports/round-c4/screens/from-project.png |
| 5 | Check the Style | "The Style passes its checks", a first draft and a sketch | RDC4-022 | Y | reports/round-c4/screens/style-editor.png |
| 6 | Write Hindi names for the looks; Save with a note | Version 2; the look warnings go away | RDC4-002 | Y | — |
| 7 | Upload a sample video and poster | The player shows it | RDC4-023 | Y (harness, poster) | — |
| 8 | Make three videos from it in your panel on three topics; add three passed tests | Tests saved | RDC4-016 | N (real Claude for the videos) | — |
| 9 | Move to Tested, then to Published (code asked) | Published | RDC4-016 | Y (harness) | reports/round-c4/screens/style-history.png |
| 10 | Log in to the panel with another account: Styles page and Home | Your Style is there | RDC4-027 | Y | — |
| 11 | Ask that account's Claude for "the list of Readymade Styles", then to start a Project from yours | It is listed; the first video is built from your template | RDC4-034 | Y (harness) | — |
| 12 | Availability by plan: tick only Pro; look as a Free person | Locked with Upgrade and "This Style is part of the Pro plan." | RDC4-026 | Y | — |
| 13 | Versions › Roll back to version 1 (code asked) | A new version with the old content | RDC4-018 | Y | — |
| 14 | Admin › Brief fields: add a block to a type, preview, save | Claude's get_brief_fields lists it | RDC4-051 | Y (harness) | reports/round-c4/screens/brief-fields.png |
| 15 | Admin › Director limits and MCP: change rewrites and the build multiplier | The plan card and get_plan_cost follow | RDC4-062, 063 | Y (harness) | reports/round-c4/screens/director-limits.png, mcp-pricing.png |

## 5. Deviations from the brief

- The override reason is 1 to 600 characters as the brief says (C3's check wanted 10 or more; D-461).
- `requires` already means plan features, so plan availability is a new optional field `plans` (D-467).
- make_asset has no separate MCP price rule: it is charged by the Studio's own price, and its row says where that is set (D-474).
- The frame sample is an SVG sketch, not a rendered frame (D-469).
- Two existing tests changed because this round changes what they check: RDC2-009 (the mcp defaults now include `pricing: {}`), and P2R1-021 was failing on the C3 branch (the panel imported an editor UI module); the store moved to src/library with a re-export (D-476).
- Claude's guidance now includes each refusal's sentence (so start_here shows it, as 4.2 asks); the C2/C3 tests still pass.

## 6. Decisions made

D-461 to D-476 in docs/DECISIONS.md.

## 7. Not tested, known gaps, risks

- **Real Claude, real Supabase, public address:** none ran. Claude following list_styles' lock wording, the Style flow in a real chat, the Supabase store for the field library and Styles (they live in Platform Config, which is already in the Supabase store), all unproven live.
- **Card vs editor export:** a Bug (section 3).
- **A Director-made Video as the source of a Style:** not possible today (Blocked, D-470).
- **Owner App screens:** proven in Playwright for the main flows (list, new, check, save, status, tests, history, rollback, filter, fields, limits, MCP tab). Not driven in the browser: import with the clash dialog, the sample upload button and the Deleted list's Restore button (their server routes are proven in RDC4-020, 021, 023).
- **Hindi:** the new Admin strings have Hindi (keyed); the older tabs stay English-only (C2 BACKLOG line). The T1 Hindi texts below are mine; the owner should read them.
- **Phone layout:** the Owner App was not checked on a phone.
- **Full suite:** not run locally (LIMIT MODE).

### T1 in Hindi (for the owner to read)

| Key | Hindi |
|---|---|
| publish-needs-tests | कोई स्टाइल तीन अलग-अलग विषयों पर तीन पास हुए टेस्ट के बाद ही पब्लिश हो सकता है। इसके {m} अलग विषयों पर {n} टेस्ट पास हुए हैं। बाकी टेस्ट जोड़ें, या फिर भी पब्लिश करने का कारण लिखें। |
| publish-blocked-invalid | यह स्टाइल अपनी जाँच में पास नहीं होता, इसलिए इसे टेस्टेड या पब्लिश नहीं किया जा सकता। पहले नीचे लिखी समस्याएँ ठीक करें। |
| template-missing-slot | टेम्पलेट में {{{name}}} है, पर स्लॉट सूची में इस नाम का कोई स्लॉट नहीं है। |
| template-unused-slot | स्लॉट "{name}" सूची में है, पर टेम्पलेट इसे कहीं इस्तेमाल नहीं करता। |
| template-not-plan | यह ऐसा वीडियो प्लान नहीं है जिसे प्लेटफ़ॉर्म पढ़ सके। वह प्लान पेस्ट करें जिससे टेम्पलेट बना था। |
| delete-warning | यह स्टाइल हटाने पर यह सबसे छिप जाएगा। इससे बने प्रोजेक्ट चलते रहेंगे। आप इसे "हटाए गए" सूची से वापस ला सकते हैं। |
| from-project-no-plan | यह वीडियो हाथ से बना है, इसलिए इसमें स्टाइल बनाने लायक कोई प्लान नहीं है। पहले इसे AI मोड में खोलें या Claude से बनाएँ। |
| plan-locked | यह स्टाइल {plan} प्लान में शामिल है। |
| import-newer | यह फ़ाइल प्लेटफ़ॉर्म के नए वर्ज़न से बनी है। कुछ भी नहीं बदला गया। |
| import-clash | इस id का एक स्टाइल पहले से है। इसे कॉपी के रूप में लाएँ, या मौजूदा स्टाइल के नए वर्ज़न के रूप में? |
| rollback-bad | वह वर्ज़न अब पढ़ा नहीं जा सकता, इसलिए उसे वापस नहीं लाया जा सकता। कुछ भी नहीं बदला गया। |
| look-no-hindi | इस लुक का अभी कोई हिंदी नाम नहीं है; हिंदी पढ़ने वालों को अंग्रेज़ी नाम दिखेगा। |

## 8. Architecture and contract impact

- Schema version change: none (schema 9). `src/core` unchanged. Platform Config: additive optional fields only (section in docs/PLATFORM-CONFIG.md).
- New dependencies: none (zip written and read with node:zlib).
- Files added: `src/director/style-builder.ts`, `src/platform-config/admin-coverage.ts`, `owner/server/styles.ts`, `owner/ui/builder.ts`, `docs/ADMIN-COVERAGE.md`, `docs/STYLES-BUILDER.md`, the tests in section 2. Moved: `src/ui/creator-library.ts` → `src/library/creator-library.ts` (re-exported).
- New routes: Owner App `/api/styles/*` and `/api/fields/*` (owner session, CSRF, audit, fresh code for dangerous steps); admin surface `GET /v1/admin/mcp/owner-projects` and `owner-video` (owner only, read-only, audited, off under the emergency switch). No `/v1` or MCP tool name or input changed.
- Contracts touched: none.

## 9. Ledger and backlog

- RDC4-001 to RDC4-070 added (42 rows): 41 Verified, 1 Bug (RDC4-004).
- 5 lines added to docs/BACKLOG_INBOX.md.

## 10. Git

- Branch `claude/round-c4-styles-builder`, draft PR to `claude/round-c3-parity`. No tag, nothing merged.

## Owner tick-list

| ID | OK / BUG / MISSING / CHANGE | One sentence |
|---|---|---|
| RDC4-015 | | |
| RDC4-033 | | |
| RDC4-016 | | |
| RDC4-018 | | |
| RDC4-026 | | |
| RDC4-034 | | |
| RDC4-051 | | |
| RDC4-062 | | |
| RDC4-004 | | |
