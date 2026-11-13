# CHECKLIST-MASTER: Round A (briefs/ROUND-A.md)

One line per rule of THE MODEL, the HARD RULES and each part's items. Status
is DONE (with proof) or BLOCKED (with an outside reason). The final report
(reports/ROUND-A.md) repeats this list with its proof column filled in.

## The model

| #   | Rule                                                                                                          | Status | Proof                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| M1  | Project is a container and one style: style record, memory, assets, many Videos                               | DONE   | RDA-008 (Style, Assets, Memory tabs), workspace.test.ts                                              |
| M2  | Video is one video in a Project: own brief, plan, chats, assets, editor project file                          | DONE   | RDA-009; Video id = editor project id (D-412)                                                        |
| M3  | The first Video of a Project sets its style; "+ New video" follows it                                         | DONE   | RDA-005 (first built Video fills an empty style; + New video follows it, style notes to the planner) |
| M4  | No user Style cards: no "Save as Style", "Save to your styles", "Make this my Style", no My Styles page       | DONE   | RDA-011 asserts none; my-styles.ts removed; strings removed                                          |
| M5  | Ready-made Styles are the owner's; the Styles page is only their gallery; choosing one makes Project + Video  | DONE   | RDA-011, RDA-006 gallery in the dialog                                                               |
| M6  | Delete a Video: that Video only; delete a Project: with all its Videos; both via Trash (config days), Restore | DONE   | RDA-004, RDA-009, RDA-010 (Trash days from config)                                                   |
| M7  | The editor project file (schema 9) does not change; Project/Video links are panel metadata                    | DONE   | schema 9 unchanged; panel metadata only (D-412)                                                      |

## Hard rules

| #   | Rule                                                                                                                                    | Status | Proof                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | Everything seen or allowed comes from Platform Config (zod, defaults): start options, limits, Studio tools, fields, options, costs      | DONE   | D-413, D-416: start options, limits, Trash days, Studio tools, fields, options, costs in Platform Config; RDA-006, RDA-013, RDA-019 change them by config |
| H2  | Limits decided on the server when a gateway is set; never trust the browser                                                             | DONE   | RDA-002 (server registry), RDA-020 (server down refuses)                                                                                                  |
| H3  | No admin route, link or login in website, panel or editor; owner/ and admin surface untouched                                           | DONE   | no admin route or link added; owner/ untouched (git diff)                                                                                                 |
| H4  | No new npm dependency, no schema change, src/core untouched, panel and website out of the editor bundle                                 | DONE   | no package change; schema 9; src/core untouched; build bundle check passes                                                                                |
| H5  | No user data lost; existing local data migrated                                                                                         | DONE   | RDA-003, RDA-016 (migration keeps .v1)                                                                                                                    |
| H6  | Every user-visible string in English and Hindi; plain sentences for every error                                                         | DONE   | all new strings in src/panel/strings.ts and the editor locales, en and hi                                                                                 |
| H7  | Cinematic panel look in both themes; empty, loading, error states; 1440 and 390 px; no sideways scroll; Settings > Animations respected | DONE   | reports/round-a/ (dark, light, 1440, 390; no sideways scroll measured); motion through cinema.css rules                                                   |

## Part A0

| #    | Item                                                                                                            | Status | Proof                                                                                                                        |
| ---- | --------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| A0.1 | This checklist file                                                                                             | DONE   | this file                                                                                                                    |
| A0.2 | Library baseline pack in a production build with no catalog; built-preview e2e; build check passes; size stated | DONE   | RDA-001 (e2e/round-a-baseline.spec.ts against vite preview); bundle check passes; +1.7 MB static files, no JavaScript growth |
| A0.3 | The false sentence "Autodraft screenshots not available" corrected (STATUS, P4 report)                          | DONE   | docs/STATUS.md, reports/P4.md                                                                                                |
| A0.4 | Audit table: Styles code, Asset Library code, Studio result to editor path                                      | DONE   | reports/ROUND-A.md section 10                                                                                                |

## Part A1

| #    | Item                                                                                                                                                                                             | Status | Proof                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------- |
| A1.1 | Project and Video in the panel metadata layer and the server store, behind existing interfaces                                                                                                   | DONE   | src/project/workspace.ts, src/project/registry.ts, Store workspaceRegistry (memory, file, Supabase) |
| A1.2 | One idempotent migration with fixture tests: Style to Project, its projects to Videos; lone and Manual projects to a Project with one Video; assets, Trash and Director pause follow their Video | DONE   | RDA-003, RDA-016; tests/fixtures/workspace/v1.json                                                  |
| A1.3 | Project style record (look, graphics notes, voice and music, script rules, examples); from a ready-made Style, else from the first built Video's plan; editable                                  | DONE   | RDA-005; src/project/style-from.ts                                                                  |
| A1.4 | Per-Video style override; "Update project style from this video"                                                                                                                                 | DONE   | RDA-005 (Style tab, promote)                                                                        |

## Part A2

| #    | Item                                                                                                                                                 | Status | Proof                                                                                                           |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| A2.1 | Home: Director box with the Orb, ready-made Styles row, Continue (unfinished Videos, newest first)                                                   | DONE   | RDA-012                                                                                                         |
| A2.2 | Projects page: cards (cover from newest Video, name, video count, origin tag), "+ New project", Trash                                                | DONE   | RDA-007                                                                                                         |
| A2.3 | New project dialog: options from config per plan; Ready-made Style, Director, Start with editor live; Your own Claude off and hidden                 | DONE   | RDA-006                                                                                                         |
| A2.4 | Round B seam marked in code for options 1 and 2                                                                                                      | DONE   | "ROUND-B SEAM" in src/panel/screens/workspace.ts, director-room.ts, flow.ts                                     |
| A2.5 | Project page: name, style summary, "+ New video" (in this style / empty editor), numbered Videos with state, tabs Videos, Style, Assets, Memory      | DONE   | RDA-007, RDA-008                                                                                                |
| A2.6 | Video card: thumbnail, name, state, menu (Open, Open in editor, Rename, Duplicate, Delete, Exports); click opens; editor Back returns to the Project | DONE   | RDA-009, RDA-006 (editor Back to the Project page)                                                              |
| A2.7 | Styles page: ready-made gallery only                                                                                                                 | DONE   | RDA-011                                                                                                         |
| A2.8 | Removed: My Styles, every Save as/to Style entry, Style review/accept, the old Start screen; tests updated, none weakened                            | DONE   | RDA-011; old tests rewritten (p4-flow, p3u-mine, p2-panel, p2-limits, p4-studio, p2-server); Dropped rows D-414 |

## Part A3

| #    | Item                                                                                                                                                            | Status | Proof                                                                                                          |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| A3.1 | Top level: Project cards and one Studio Libraries card in creation order; search; type filter                                                                   | DONE   | RDA-017                                                                                                        |
| A3.2 | Project, its Video cards, three libraries per Video; Studio Libraries, one card per tool                                                                        | DONE   | RDA-017                                                                                                        |
| A3.3 | Saving rules (Director to AI, uploads and Save to cloud to Media, Save to My Templates, Studio to Studio Libraries or a chosen Video); regenerate keeps the old | DONE   | RDA-017 (Studio to a Video or Studio Libraries; regenerate keeps the old); Director to AI (flow.ts library ai) |
| A3.4 | Delete to Trash, Restore                                                                                                                                        | DONE   | RDA-017                                                                                                        |
| A3.5 | Editor import dialogs list Project, Video, items and copy into the open Video; third dialog "Import from your Library" in Media                                 | DONE   | RDA-018                                                                                                        |

## Part A4

| #    | Item                                                                                                                                                   | Status | Proof                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------- |
| A4.1 | Image (tabs by model assignment; aspect; model; style cards; prompt, reference, Enhance; count; Advanced; My generations)                              | DONE   | RDA-019 (Image test, Upscale tab test)                              |
| A4.2 | Story (plot 800; Dialogue/Narration; languages; categories; ideas with View more; duration; history)                                                   | DONE   | RDA-019 (Story)                                                     |
| A4.3 | Video (first and last frame with swap; prompt with Generate; model; style; resolution plan-gated; aspect; duration; audio)                             | DONE   | RDA-019 (Video: swap, Generate prompt, 1080p gate)                  |
| A4.4 | Voice: AI Voiceover, AI Sound, Audio to Audio, Voice Clone; no Music tab                                                                               | DONE   | RDA-019 (four tabs, Voice Clone consent)                            |
| A4.5 | SEO (title, description, languages, categories, output Titles, Description, Tags, Hashtags)                                                            | DONE   | RDA-019, P4U-005                                                    |
| A4.6 | Captions kept; other tools in config but disabled by default                                                                                           | DONE   | RDA-019 (Captions listed); P2R1-007 (others off)                    |
| A4.7 | Every tool: cost before Run, required checks under the field, progress, result saved, history from its Studio Library, model-unsupported fields hidden | DONE   | RDA-019, P4U-003 (cost first, error under field, progress, history) |
| A4.8 | The form is one reusable component                                                                                                                     | DONE   | src/panel/studio-form.ts mountStudioForm (target option)            |

## Rough use

| #   | Condition                                                                                | Status | Proof                                          |
| --- | ---------------------------------------------------------------------------------------- | ------ | ---------------------------------------------- |
| R1  | Delete the last Video of a Project: Project stays, empty state                           | DONE   | RDA-009                                        |
| R2  | Delete a Project with Videos, then Restore: everything returns                           | DONE   | RDA-010                                        |
| R3  | Open a trashed Video's link                                                              | DONE   | RDA-010                                        |
| R4  | Rename with long and Hindi names                                                         | DONE   | RDA-009, RDA-004 unit                          |
| R5  | Duplicate a Video                                                                        | DONE   | RDA-009                                        |
| R6  | Two tabs on the same Project                                                             | DONE   | RDA-015                                        |
| R7  | Reload in the middle of New project                                                      | DONE   | RDA-014                                        |
| R8  | Browser Back at every step                                                               | DONE   | RDA-014, RDA-006                               |
| R9  | Limit reached (projects, videos per project, storage): owner's sentence, nothing created | DONE   | RDA-013 (projects, videos); P2R2-027 (storage) |
| R10 | Offline or server down: no limit passes, typed input kept                                | DONE   | RDA-020                                        |
| R11 | Importing the same item twice                                                            | DONE   | RDA-018                                        |
| R12 | A Project with zero Videos                                                               | DONE   | RDA-009, RDA-010, RDA-003 unit                 |
| R13 | Migration run twice                                                                      | DONE   | RDA-016, RDA-003 unit                          |

## Finish

| #   | Item                                                                     | Status | Proof                                                        |
| --- | ------------------------------------------------------------------------ | ------ | ------------------------------------------------------------ |
| F1  | Screenshots of every new or changed screen, dark and light, 1440 and 390 | DONE   | reports/round-a/ (90 screenshots)                            |
| F2  | Ledger rows RDA-, each with an e2e test; DECISIONS; STATUS; CHANGELOG    | DONE   | docs/FEATURES.md RDA rows, D-411 to D-416, STATUS, CHANGELOG |
| F3  | reports/ROUND-A.md from the template                                     | DONE   | reports/ROUND-A.md                                           |
| F4  | One full `npm run verify`; failed specs re-run                           | DONE   | see reports/ROUND-A.md section 3                             |
| F5  | Pushed; CI checked once                                                  | DONE   | see reports/ROUND-A.md section 3                             |
