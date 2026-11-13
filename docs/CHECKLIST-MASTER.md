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

# Round B (briefs/ROUND-B.md)

Same rule: DONE (with proof) or BLOCKED (with an outside reason). reports/ROUND-B.md repeats this list.

## Limit mode and model

| #   | Item                                                                                                                                                          | Status | Proof |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| L1  | One editor, two layouts: same engine, Scene Graph, Command Bus, history; one Apply = one transaction = one undo step; src/core and frozen contracts unchanged |        |       |
| L2  | Anything that costs credits shows a card with the cost and waits for Approve; Director's conversation is free                                                 |        |       |
| L3  | Director reads the canvas fresh on every message; never overwrites a hand-edited layer without asking                                                         |        |       |
| L4  | Config-first: rulebook, prompts, refusals, field library, limits, memory caps, rewrite counts from Platform Config                                            |        |       |
| L5  | Server-side limits when a gateway is set                                                                                                                      |        |       |
| L6  | Runs offline on the mock model; no key or provider host in any browser file                                                                                   |        |       |
| L7  | Bundle rule: Director is a lazy chunk; assert-editor-bundle states it; sizes measured                                                                         |        |       |
| L8  | No admin route outside owner/; owner/ untouched; no new npm dependency; no schema change                                                                      |        |       |
| L9  | English and Hindi for every string; plain sentences for errors                                                                                                |        |       |
| L10 | The plan JSON or code is never shown to a normal user                                                                                                         |        |       |

## Part B0

| #    | Item                                                                                                      | Status                              | Proof |
| ---- | --------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----- |
| B0.1 | Top bar at 820 px: no overlap; the Editor                                                                 | AI switch fits at every tested size |       |     |
| B0.2 | Visual baselines: manually dispatched workflow, artifact fetched and committed (or BLOCKED with commands) |                                     |       |
| B0.3 | Studio form with a real model's declared parameters: config form stays; parameters only hide and map      |                                     |       |
| B0.4 | LIB-024 reliable after LIB-020 to LIB-023                                                                 |                                     |       |

## Part B1

| #    | Item                                                                                                     | Status | Proof |
| ---- | -------------------------------------------------------------------------------------------------------- | ------ | ----- |
| B1.1 | Memory levels: account, Project memory, Video sheet, file notes, chats with rolling summary, live canvas |        |       |
| B1.2 | Director chats belong to the Video; existing ones migrated to the Project's first Video                  |        |       |
| B1.3 | One context-pack function with a config token budget; unit tests of budget and drop order                |        |       |
| B1.4 | Video sheet auto-updates; Memory tab reads, edits, pins, forgets; a new chat starts with the same sheet  |        |       |

## Part B2

| #    | Item                                                                                              | Status                                               | Proof |
| ---- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----- |
| B2.1 | Editor                                                                                            | AI switch in the top bar and as a registered command |       |     |
| B2.2 | AI mode layout: Director column, stage, scene ribbon, slim timeline, right drawer, top bar        |                                                      |       |
| B2.3 | Select-only canvas; manual gestures and edit shortcuts off                                        |                                                      |       |
| B2.4 | Controls tab with live preview, one undo step on release                                          |                                                      |       |
| B2.5 | Scene ribbon: open, drag reorder, menu Duplicate, Delete (confirm), Ask Director about this scene |                                                      |       |
| B2.6 | Quick strip: Look, Voice, Music, Captions, Format as proposals                                    |                                                      |       |
| B2.7 | Export from AI mode                                                                               |                                                      |       |
| B2.8 | Editor chat dock removed; its engine reused                                                       |                                                      |       |
| B2.9 | Ask Director in Editor mode (top bar and canvas menu) carries the selection                       |                                                      |       |

## Part B3

| #     | Item                                                                                                                    | Status | Proof |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| B3.1  | Entries open AI mode on the Video; panel Director room, brief, plan and live-build screens removed; Video card menu     |        |       |
| B3.2  | Field library and video types in config; classification; ONE Brief card; style prefill; Use my brand                    |        |       |
| B3.3  | Attachments with file notes; Brief card says what was understood                                                        |        |       |
| B3.4  | Plan card: scenes, credits, Approve, Cheaper, Richer, per-scene edit, rewrites from config                              |        |       |
| B3.5  | Assets card: Make it here (Studio form), Upload, Give me a prompt, Choose from Library, Later; regenerate keeps the old |        |       |
| B3.6  | Build on the canvas; cancel or failure leaves nothing half-built and refunds fully                                      |        |       |
| B3.7  | Five message kinds after the build; several asks become a list of cards                                                 |        |       |
| B3.8  | New scene: one-scene plan card, built in place                                                                          |        |       |
| B3.9  | New video: creates the next Video in the Project                                                                        |        |       |
| B3.10 | First Video fills the Project's style record and says so once                                                           |        |       |
| B3.11 | Restate before cost; ONE question when unsure; alternatives; refusal with no model call                                 |        |       |

## Part B4

| #    | Item                                                                       | Status | Proof |
| ---- | -------------------------------------------------------------------------- | ------ | ----- |
| B4.1 | Style chat on the Project page Style tab: before/after, applied on confirm |        |       |
| B4.2 | Apply the project's new style to an existing Video in AI mode (a proposal) |        |       |

## AI mode UI

| #   | Item                                                                                 | Status | Proof |
| --- | ------------------------------------------------------------------------------------ | ------ | ----- |
| U1  | Point-and-say bubble on the selected layer                                           |        |       |
| U2  | Drag and drop of assets and files onto layers, slots and the stage                   |        |       |
| U3  | Live proposal preview on the real canvas; Apply, Discard; changed layers highlighted |        |       |
| U4  | Orb states and the stage glow                                                        |        |       |
| U5  | 1920, 1440, 1280 and 1024 px; dark and light; empty, loading, error states           |        |       |
| U6  | Animations Off makes everything still; nothing animates in a hidden tab              |        |       |

## Part B5

| #    | Item                                                                                          | Status | Proof |
| ---- | --------------------------------------------------------------------------------------------- | ------ | ----- |
| B5.1 | Layouts use the width; Studio tools follow the reference layout; stacks at 390 px             |        |       |
| B5.2 | One colour system written in the tokens file; one selected style; a test of computed colours  |        |       |
| B5.3 | Style cards from config thumb only; neutral tile without a picture; default Image style names |        |       |
| B5.4 | Field-by-field match tables for 8 tools                                                       |        |       |
| B5.5 | No native select, checkbox, radio or file input styling in the panel or AI mode               |        |       |
| B5.6 | Panel screenshots: dark, light, 1440, 390                                                     |        |       |

## Rough use (Round B)

| #    | Item                                                                        | Status | Proof |
| ---- | --------------------------------------------------------------------------- | ------ | ----- |
| RB1  | Message sent while a build runs                                             |        |       |
| RB2  | Switch to Editor mode mid-build and back                                    |        |       |
| RB3  | Undo an AI change in Editor mode, return to AI mode: sheet and canvas agree |        |       |
| RB4  | Delete a scene by hand, then ask Director about it                          |        |       |
| RB5  | Hand-edit a layer, then ask Director to change the scene: it asks first     |        |       |
| RB6  | Reload at every step (brief, plan, assets, build) resumes there             |        |       |
| RB7  | Two chats in one Video share the sheet                                      |        |       |
| RB8  | A very long chat still knows the brief                                      |        |       |
| RB9  | Selected layer deleted before Apply: proposal cancelled with one sentence   |        |       |
| RB10 | Proposal applied twice                                                      |        |       |
| RB11 | A control dragged while a proposal is previewing                            |        |       |
| RB12 | Reorder scenes during playback                                              |        |       |
| RB13 | Not enough credits                                                          |        |       |
| RB14 | Server unreachable: nothing spent, nothing lost, input kept                 |        |       |
| RB15 | A huge or unsupported attachment                                            |        |       |
| RB16 | Three asks in one message                                                   |        |       |
| RB17 | A locked layer                                                              |        |       |
| RB18 | Off-topic and prompt-injection messages                                     |        |       |
| RB19 | Hindi input                                                                 |        |       |
| RB20 | Mode switch with Animations Off                                             |        |       |

## Finish (Round B)

| #   | Item                                                                                                      | Status | Proof |
| --- | --------------------------------------------------------------------------------------------------------- | ------ | ----- |
| FB1 | Ledger rows RDB-, each with an e2e test; older tests updated, none weakened; DECISIONS, STATUS, CHANGELOG |        |       |
| FB2 | reports/ROUND-B.md from the template with bundle sizes, reference tables, try-it script                   |        |       |
| FB3 | AI mode screenshots: dark, light, each width                                                              |        |       |
| FB4 | One full npm run verify; failed specs re-run                                                              |        |       |
| FB5 | Pushed; CI checked once                                                                                   |        |       |
