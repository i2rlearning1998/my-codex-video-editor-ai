# Report: Round A, the user panel rebuilt around Project and Video (13 Nov 2026)

## 1. Summary

- A **Project** is now a container and one style; a **Video** is one editor project inside it. Your old Styles became Projects and your old projects became their Videos, once, with nothing lost (the old data is kept beside the new).
- New pages: Projects, the New project dialog (Ready-made Style, Director, Start with editor; "Your own Claude" stays hidden until its config flag is on), the Project page (Videos, Style, Assets, Memory), Video cards with their menu, a Trash for Projects and Videos. The Styles page is the ready-made gallery only. My Styles, "Save to your styles", Style review and the old Start screen are gone.
- Limits on projects and videos per project come from the Platform Config and are decided by the server when a gateway is used; a server that cannot be reached never lets one through.
- The Asset Library goes Project, Video, three libraries, with Studio Libraries per tool, search and a type filter. In the editor, the import dialogs list Project, then Video, and a new "Import from your Library" brings Studio results into the open video.
- Studio follows your Autodraft field lists (Image, Video, Story, SEO, Voice with four tabs, Captions), all from config, drawn by one reusable form.
- The editor now shows sound effects, text styles and themes even with no catalog set up.
- Not done in this round (by the brief): Round B (AI mode in the editor) and Round C (Claude connector, Style upload, Admin).

## 2. Scope and results

| ID | Result | Evidence |
| --- | --- | --- |
| RDA-001 | Verified | e2e/round-a-baseline.spec.ts (built preview, no catalog); tests/library/baseline.test.ts |
| RDA-002 | Verified | e2e/round-a-library.spec.ts `[RDA-020] [RDA-002]`; tests/security/attacks.test.ts `[RDA-002]` |
| RDA-003 | Verified | e2e/round-a-panel.spec.ts `[RDA-016] [RDA-003]`; tests/panel/workspace.test.ts (fixture tests/fixtures/workspace/v1.json) |
| RDA-004 | Verified | e2e/round-a-panel.spec.ts `[RDA-010] [RDA-004]`; tests/panel/workspace.test.ts |
| RDA-005 | Verified | e2e/round-a-panel.spec.ts `[RDA-008] [RDA-005]`; tests/panel/workspace.test.ts (style sources) |
| RDA-006 to RDA-016 | Verified | e2e/round-a-panel.spec.ts |
| RDA-017 to RDA-020 | Verified | e2e/round-a-library.spec.ts |
| P3U-012, P3U-013, P4F-001 to P4F-006, P4F-011, P4S-005, P4U-002 | Dropped | the removed Style flow and old Voice tabs (D-414, D-413) |

- In-scope P0 items Verified: 20 of 20.
- Not done, with reason: none of the checklist; see section 7 for what was not tested.

## 3. Checks

One full `npm run verify` on 2026-11-12 (Linux sandbox; e2e in Playwright 1.63.0's Chromium, build 1243; the sandbox has no Chrome or Edge, D-030).

| Step | Result |
| ---- | ------ |
| Format check | Passed |
| Typecheck | Passed |
| Unit and jsdom tests (Vitest) | 1,561 passed, 2 failed, 3 skipped. The 2 failures are `tests/blocks/worker.test.ts` (WebAssembly is not allowed in this sandbox); they fail the same way on `claude/p4-flow`. Because this stopped the verify chain, the next steps were run one by one. |
| Build and bundle check (`npm run build`) | Passed (editor, panel, website and admin pages separate; no server secret or admin code in a browser file) |
| E2E (Playwright, desktop) | 770 passed, 2 failed, 8 did not run (serial file after a failure), in about 1.4 h. |
| Hook assertion | Passed |
| Ledger (`npm run ledger`) | Passed |

The 2 e2e failures, fixed and re-run:

- LIB-023: the baseline pack brought back a sound the owner had unpublished. Fixed: a category the catalog holds is the catalog's alone (D-411). Re-run: passed.
- RA-006: the test's text check matched "mediaImport" by accident. Fixed in the test (it now checks each button's own text). Re-run: passed.

Re-run of the failed and not-run specs (`lib-editor.spec.ts`, RA-006, RDA-001): all passed except LIB-024 when it runs right after LIB-020 to LIB-023 in one run. It then fails at "photo click: requests on the critical path", or a click times out. It fails the same way on `claude/p4-flow` (checked in a separate worktree), so Round A did not cause it. It passes when run alone and passed in the full verify. Recorded as a known sandbox flake; not chased. One helper in `lib-editor.spec.ts` was fixed: the Back button can hide between the check and the click, so the helper checks again instead of waiting 30 s (LIB-027 had timed out on it). Nothing was weakened.

CI: see section 12.

## 4. Try-it script for the owner (about 10 minutes)

| # | Do this | Expect | ID | I ran it | Screenshot |
| --- | --- | --- | --- | --- | --- |
| 1 | Open Projects, press **New project** | Three ways to start: Ready-made Style, Director, Start with editor (no Claude) | RDA-006 | Y (test) | reports/round-a/new-project-dark-1440.png |
| 2 | Type a name, choose **Start with editor** | The editor opens on an empty video | RDA-006 | Y (test) | none |
| 3 | Press the browser's Back, then Leave without saving | You land on that Project's page | RDA-006 | Y (test) | reports/round-a/project-videos-dark-1440.png |
| 4 | **+ New video › Empty editor**, Back again | Two numbered Video cards | RDA-008 | Y (test) | reports/round-a/project-videos-light-1440.png |
| 5 | Style tab: write a voice and a heading font, Save | The line under the title shows them | RDA-005 | Y (test) | reports/round-a/project-style-dark-1440.png |
| 6 | Style tab: "Change it for" Video 1, change the voice, Save; then Update project style from this video | The project keeps its voice until you press Update | RDA-005 | Y (test) | none |
| 7 | Video card ⋯: Rename with a long Hindi name, Duplicate, Exports, Delete | Name kept (80 characters), a copy appears, "No exports yet", the video goes to the Trash | RDA-009 | Y (test) | none |
| 8 | Projects ⋯ Delete, then Trash, Restore | The Project and all its Videos come back | RDA-010 | Y (test) | reports/round-a/projects-trash-dark-1440.png |
| 9 | Styles, Use this Style | A new Project tagged with the Style's name; Director's brief opens | RDA-011 | Y (test) | reports/round-a/styles-dark-1440.png |
| 10 | Home | Director box with the Orb, Styles row, Continue with the unfinished video | RDA-012 | Y (test) | reports/round-a/home-dark-1440.png |
| 11 | Studio › Story: Make it with an empty plot, then pick an idea and Make it | "This field is required" under the plot; then the story is saved and listed under Generated history | RDA-019 | Y (test) | reports/round-a/studio-story-dark-1440.png |
| 12 | Studio › Voice | Four tabs: AI Voiceover, AI Sound, Audio to Audio, Voice Clone | RDA-019 | Y (test) | reports/round-a/studio-voiceover-dark-1440.png |
| 13 | Asset Library: search a word, try the type chips | Matching items with where they live | RDA-017 | Y (test) | reports/round-a/library-search-dark-1440.png |
| 14 | In the editor: Media › Import ▾ › Import from your Library | Studio Libraries and your Projects, each with their Videos; chosen items land in Media once | RDA-018 | Y (test) | reports/round-a/editor-import-library-dark-1440.png |
| 15 | Open the editor with no catalog set up (a build) | Audio shows 12 sounds, Text its styles and combinations, Theme 8 themes | RDA-001 | Y (test) | none |

Every step was run by an automated browser test, not by hand. The 390 px and light screenshots of each screen are beside the ones named (`-390`, `-light`).

## 5. Deviations from the brief

- The editor got one more change besides A0.2 and the import dialogs: its export log now keeps the open video's id, so a Video card's Exports can list them (data only, no editor screen changed; D-415).
- The bundle check now allows exactly one panel storage key (`aive.panel.assets`) in the editor's code, so the editor can read Studio results (D-415); and theme names inside `library-baseline/` (D-411).
- The Director room keeps its memory and chat list under the Video's Project id, so the Memory tab shows what Director remembers for the whole Project (Round B can split chats per Video).
- Voice Clone is a Pro tool, like its cost in the config (`voice-clone` feature).

## 6. Decisions made

D-411 to D-416 in docs/DECISIONS.md.

## 7. Not tested, known gaps, risks

- The Supabase table `workspace_registry` (migration 20261112000000) was not run on a real Supabase; the JSON stores and the server routes are tested.
- Nothing ran against a live provider or payment service.
- A Video's Exports list is tested only in its empty state; recording a real export's video id is not proven by a test.
- "Your own Claude" is shown when its flag is on, but choosing it makes a Project tagged Claude and starts Director: the connector is Round C.
- Enhance prompt and Generate prompt use the writing model; offline they use the mock's fixed wording.
- A model with declared parameters (P3, with a gateway) still draws its own form instead of the Autodraft fields (D-416).
- Two tabs on one Project: a change in one shows in the other on reload or navigation, not live.
- The migration covers the P4 format only (the only earlier workspace format).

## 8. Architecture and contract impact

- Schema version change: none (schema 9). Platform Config gains optional keys only (D-413, D-416).
- New dependencies: none.
- Added: `src/project/registry.ts`, `src/project/style-from.ts`, `src/project/user-assets.ts`, `src/panel/studio-form.ts`, `src/panel/projects.css`, `src/platform-config/studio-defaults.ts`, `scripts/library-baseline.ts`, `public/library-baseline/`, `server/workspace-registry.ts`, `supabase/migrations/20261112000000_round_a_workspace.sql`, tests and fixtures. Removed: `src/panel/screens/my-styles.ts`. Rewritten: `src/project/workspace.ts`, `src/panel/screens/workspace.ts`, `src/panel/screens/library.ts`.
- Contracts touched: none of the frozen editor contracts; `src/core` untouched; `owner/` untouched.

## 9. Ledger and backlog

- Added: RDA-001 to RDA-020 (Verified). Dropped: P3U-012, P3U-013, P4F-001 to P4F-006, P4F-011, P4S-005, P4U-002. Reworded: P3U-014, P4U-005.
- Added to docs/BACKLOG_INBOX.md: 0.

## 10. Audit (A0.4)

| Area | Code before Round A | The model says | Verdict |
| --- | --- | --- | --- |
| Styles | src/project/workspace.ts WsStyle, makeStyle, addToStyle | Users have no Style cards; a Project is the style | Does not match |
| Styles | src/panel/screens/workspace.ts saveStyleDialog, newStyleForm, styleCards, styleScreen (#/style/) | No Save as Style; no user Style pages | Does not match |
| Styles | src/panel/screens/my-styles.ts (My Styles, Style review/accept), room.makeStyle, mem.makeStyle | No My Styles, no Make this my Style | Does not match |
| Styles | server POST /v1/workspace/style-fee, config workspace.styleCreation, styleCaps.maxStyles | No Style saving, so no fee | Does not match |
| Styles | pages.ts stylesScreen: ready-made gallery plus "Your Styles" and "My Styles" sections | Gallery of ready-made Styles only | Partly (gallery matches; the two extra sections do not) |
| Styles | Project style record (look, voice, script rules, examples) | Required | Missing |
| Styles | Per-Video style override, Update project style from this video | Required | Missing |
| Styles | Project as a container of Videos | Required | Missing (a Style acted as the container; a "project" was one video) |
| Asset Library | library.ts top level in creation order, Studio Libraries card, one card per tool | Same | Matches |
| Asset Library | Style > Project > AI / My Templates / Media | Project > Video > AI / My Templates / Media | Does not match |
| Asset Library | search and type filter at top level | Required | Missing |
| Asset Library | asset Trash with Restore, expiry by config trashDays | Required | Matches |
| Asset Library | regenerate keeps the old asset (versions) | Required | Matches |
| Asset Library | saving: Director to AI (studioId director, library ai); editor media, My Templates and AI via the editor's index; Studio to a chosen project or Studio Libraries | Same, per Video | Matches (keyed by the editor project id, which becomes the Video id) |
| Studio to editor | Studio results live in the panel's browser store (aive.panel.assets) with a data URL; the editor never reads that store | A Studio result must be importable into a Video | Missing: no path (only Director build files reach the editor, through the handoff) |
| Studio to editor | editor import dialogs (library-import-dialog.ts) list other editor projects' My Templates and AI items, grouped by editor project | Project > Video > items | Does not match (no Project level) |

## 11. CHECKLIST-MASTER, ticked

### The model

| #   | Rule                                                                                                          | Status | Proof |
| --- | ------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| M1  | Project is a container and one style: style record, memory, assets, many Videos                               | DONE | RDA-008 (Style, Assets, Memory tabs), workspace.test.ts                                              |
| M2  | Video is one video in a Project: own brief, plan, chats, assets, editor project file                          | DONE | RDA-009; Video id = editor project id (D-412)                                                        |
| M3  | The first Video of a Project sets its style; "+ New video" follows it                                         | DONE | RDA-005 (first built Video fills an empty style; + New video follows it, style notes to the planner) |
| M4  | No user Style cards: no "Save as Style", "Save to your styles", "Make this my Style", no My Styles page       | DONE | RDA-011 asserts none; my-styles.ts removed; strings removed                                          |
| M5  | Ready-made Styles are the owner's; the Styles page is only their gallery; choosing one makes Project + Video  | DONE | RDA-011, RDA-006 gallery in the dialog                                                               |
| M6  | Delete a Video: that Video only; delete a Project: with all its Videos; both via Trash (config days), Restore | DONE | RDA-004, RDA-009, RDA-010 (Trash days from config)                                                   |
| M7  | The editor project file (schema 9) does not change; Project/Video links are panel metadata                    | DONE | schema 9 unchanged; panel metadata only (D-412)                                                      |

### Hard rules

| #   | Rule                                                                                                                                    | Status | Proof |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| H1  | Everything seen or allowed comes from Platform Config (zod, defaults): start options, limits, Studio tools, fields, options, costs      | DONE | D-413, D-416: start options, limits, Trash days, Studio tools, fields, options, costs in Platform Config; RDA-006, RDA-013, RDA-019 change them by config |
| H2  | Limits decided on the server when a gateway is set; never trust the browser                                                             | DONE | RDA-002 (server registry), RDA-020 (server down refuses)                                                                                                  |
| H3  | No admin route, link or login in website, panel or editor; owner/ and admin surface untouched                                           | DONE | no admin route or link added; owner/ untouched (git diff)                                                                                                 |
| H4  | No new npm dependency, no schema change, src/core untouched, panel and website out of the editor bundle                                 | DONE | no package change; schema 9; src/core untouched; build bundle check passes                                                                                |
| H5  | No user data lost; existing local data migrated                                                                                         | DONE | RDA-003, RDA-016 (migration keeps .v1)                                                                                                                    |
| H6  | Every user-visible string in English and Hindi; plain sentences for every error                                                         | DONE | all new strings in src/panel/strings.ts and the editor locales, en and hi                                                                                 |
| H7  | Cinematic panel look in both themes; empty, loading, error states; 1440 and 390 px; no sideways scroll; Settings > Animations respected | DONE | reports/round-a/ (dark, light, 1440, 390; no sideways scroll measured); motion through cinema.css rules                                                   |

### Part A0

| #    | Item                                                                                                            | Status | Proof |
| ---- | --------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| A0.1 | This checklist file                                                                                             | DONE | this file                                                                                                                    |
| A0.2 | Library baseline pack in a production build with no catalog; built-preview e2e; build check passes; size stated | DONE | RDA-001 (e2e/round-a-baseline.spec.ts against vite preview); bundle check passes; +1.7 MB static files, no JavaScript growth |
| A0.3 | The false sentence "Autodraft screenshots not available" corrected (STATUS, P4 report)                          | DONE | docs/STATUS.md, reports/P4.md                                                                                                |
| A0.4 | Audit table: Styles code, Asset Library code, Studio result to editor path                                      | DONE | reports/ROUND-A.md section 10                                                                                                |

### Part A1

| #    | Item                                                                                                                                                                                             | Status | Proof |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ----- |
| A1.1 | Project and Video in the panel metadata layer and the server store, behind existing interfaces                                                                                                   | DONE | src/project/workspace.ts, src/project/registry.ts, Store workspaceRegistry (memory, file, Supabase) |
| A1.2 | One idempotent migration with fixture tests: Style to Project, its projects to Videos; lone and Manual projects to a Project with one Video; assets, Trash and Director pause follow their Video | DONE | RDA-003, RDA-016; tests/fixtures/workspace/v1.json                                                  |
| A1.3 | Project style record (look, graphics notes, voice and music, script rules, examples); from a ready-made Style, else from the first built Video's plan; editable                                  | DONE | RDA-005; src/project/style-from.ts                                                                  |
| A1.4 | Per-Video style override; "Update project style from this video"                                                                                                                                 | DONE | RDA-005 (Style tab, promote)                                                                        |

### Part A2

| #    | Item                                                                                                                                                 | Status | Proof |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| A2.1 | Home: Director box with the Orb, ready-made Styles row, Continue (unfinished Videos, newest first)                                                   | DONE | RDA-012                                                                                                         |
| A2.2 | Projects page: cards (cover from newest Video, name, video count, origin tag), "+ New project", Trash                                                | DONE | RDA-007                                                                                                         |
| A2.3 | New project dialog: options from config per plan; Ready-made Style, Director, Start with editor live; Your own Claude off and hidden                 | DONE | RDA-006                                                                                                         |
| A2.4 | Round B seam marked in code for options 1 and 2                                                                                                      | DONE | "ROUND-B SEAM" in src/panel/screens/workspace.ts, director-room.ts, flow.ts                                     |
| A2.5 | Project page: name, style summary, "+ New video" (in this style / empty editor), numbered Videos with state, tabs Videos, Style, Assets, Memory      | DONE | RDA-007, RDA-008                                                                                                |
| A2.6 | Video card: thumbnail, name, state, menu (Open, Open in editor, Rename, Duplicate, Delete, Exports); click opens; editor Back returns to the Project | DONE | RDA-009, RDA-006 (editor Back to the Project page)                                                              |
| A2.7 | Styles page: ready-made gallery only                                                                                                                 | DONE | RDA-011                                                                                                         |
| A2.8 | Removed: My Styles, every Save as/to Style entry, Style review/accept, the old Start screen; tests updated, none weakened                            | DONE | RDA-011; old tests rewritten (p4-flow, p3u-mine, p2-panel, p2-limits, p4-studio, p2-server); Dropped rows D-414 |

### Part A3

| #    | Item                                                                                                                                                            | Status | Proof |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| A3.1 | Top level: Project cards and one Studio Libraries card in creation order; search; type filter                                                                   | DONE | RDA-017                                                                                                        |
| A3.2 | Project, its Video cards, three libraries per Video; Studio Libraries, one card per tool                                                                        | DONE | RDA-017                                                                                                        |
| A3.3 | Saving rules (Director to AI, uploads and Save to cloud to Media, Save to My Templates, Studio to Studio Libraries or a chosen Video); regenerate keeps the old | DONE | RDA-017 (Studio to a Video or Studio Libraries; regenerate keeps the old); Director to AI (flow.ts library ai) |
| A3.4 | Delete to Trash, Restore                                                                                                                                        | DONE | RDA-017                                                                                                        |
| A3.5 | Editor import dialogs list Project, Video, items and copy into the open Video; third dialog "Import from your Library" in Media                                 | DONE | RDA-018                                                                                                        |

### Part A4

| #    | Item                                                                                                                                                   | Status | Proof |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ----- |
| A4.1 | Image (tabs by model assignment; aspect; model; style cards; prompt, reference, Enhance; count; Advanced; My generations)                              | DONE | RDA-019 (Image test, Upscale tab test)                              |
| A4.2 | Story (plot 800; Dialogue/Narration; languages; categories; ideas with View more; duration; history)                                                   | DONE | RDA-019 (Story)                                                     |
| A4.3 | Video (first and last frame with swap; prompt with Generate; model; style; resolution plan-gated; aspect; duration; audio)                             | DONE | RDA-019 (Video: swap, Generate prompt, 1080p gate)                  |
| A4.4 | Voice: AI Voiceover, AI Sound, Audio to Audio, Voice Clone; no Music tab                                                                               | DONE | RDA-019 (four tabs, Voice Clone consent)                            |
| A4.5 | SEO (title, description, languages, categories, output Titles, Description, Tags, Hashtags)                                                            | DONE | RDA-019, P4U-005                                                    |
| A4.6 | Captions kept; other tools in config but disabled by default                                                                                           | DONE | RDA-019 (Captions listed); P2R1-007 (others off)                    |
| A4.7 | Every tool: cost before Run, required checks under the field, progress, result saved, history from its Studio Library, model-unsupported fields hidden | DONE | RDA-019, P4U-003 (cost first, error under field, progress, history) |
| A4.8 | The form is one reusable component                                                                                                                     | DONE | src/panel/studio-form.ts mountStudioForm (target option)            |

### Rough use

| #   | Condition                                                                                | Status | Proof |
| --- | ---------------------------------------------------------------------------------------- | ------ | ----- |
| R1  | Delete the last Video of a Project: Project stays, empty state                           | DONE | RDA-009                                        |
| R2  | Delete a Project with Videos, then Restore: everything returns                           | DONE | RDA-010                                        |
| R3  | Open a trashed Video's link                                                              | DONE | RDA-010                                        |
| R4  | Rename with long and Hindi names                                                         | DONE | RDA-009, RDA-004 unit                          |
| R5  | Duplicate a Video                                                                        | DONE | RDA-009                                        |
| R6  | Two tabs on the same Project                                                             | DONE | RDA-015                                        |
| R7  | Reload in the middle of New project                                                      | DONE | RDA-014                                        |
| R8  | Browser Back at every step                                                               | DONE | RDA-014, RDA-006                               |
| R9  | Limit reached (projects, videos per project, storage): owner's sentence, nothing created | DONE | RDA-013 (projects, videos); P2R2-027 (storage) |
| R10 | Offline or server down: no limit passes, typed input kept                                | DONE | RDA-020                                        |
| R11 | Importing the same item twice                                                            | DONE | RDA-018                                        |
| R12 | A Project with zero Videos                                                               | DONE | RDA-009, RDA-010, RDA-003 unit                 |
| R13 | Migration run twice                                                                      | DONE | RDA-016, RDA-003 unit                          |

### Finish

| #   | Item                                                                     | Status | Proof |
| --- | ------------------------------------------------------------------------ | ------ | ----- |
| F1  | Screenshots of every new or changed screen, dark and light, 1440 and 390 | DONE | reports/round-a/ (90 screenshots)                            |
| F2  | Ledger rows RDA-, each with an e2e test; DECISIONS; STATUS; CHANGELOG    | DONE | docs/FEATURES.md RDA rows, D-411 to D-416, STATUS, CHANGELOG |
| F3  | reports/ROUND-A.md from the template                                     | DONE | reports/ROUND-A.md                                           |
| F4  | One full `npm run verify`; failed specs re-run                           | DONE | see reports/ROUND-A.md section 3                             |
| F5  | Pushed; CI checked once                                                  | DONE | see reports/ROUND-A.md section 3                             |

## 12. Git

- Branch: `claude/round-a-panel`, draft PR to `claude/p4-flow`.
- Final push and the one CI check: reported in the PR (#52) and in the session's last message.
