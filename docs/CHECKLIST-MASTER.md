# CHECKLIST-MASTER: Round A (briefs/ROUND-A.md)

One line per rule of THE MODEL, the HARD RULES and each part's items. Status
is DONE (with proof) or BLOCKED (with an outside reason). The final report
(reports/ROUND-A.md) repeats this list with its proof column filled in.

## The model

| #   | Rule                                                                                                          | Status | Proof |
| --- | ------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| M1  | Project is a container and one style: style record, memory, assets, many Videos                               | [ ]    |       |
| M2  | Video is one video in a Project: own brief, plan, chats, assets, editor project file                          | [ ]    |       |
| M3  | The first Video of a Project sets its style; "+ New video" follows it                                         | [ ]    |       |
| M4  | No user Style cards: no "Save as Style", "Save to your styles", "Make this my Style", no My Styles page       | [ ]    |       |
| M5  | Ready-made Styles are the owner's; the Styles page is only their gallery; choosing one makes Project + Video  | [ ]    |       |
| M6  | Delete a Video: that Video only; delete a Project: with all its Videos; both via Trash (config days), Restore | [ ]    |       |
| M7  | The editor project file (schema 9) does not change; Project/Video links are panel metadata                    | [ ]    |       |

## Hard rules

| #   | Rule                                                                                                                                    | Status | Proof |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| H1  | Everything seen or allowed comes from Platform Config (zod, defaults): start options, limits, Studio tools, fields, options, costs      | [ ]    |       |
| H2  | Limits decided on the server when a gateway is set; never trust the browser                                                             | [ ]    |       |
| H3  | No admin route, link or login in website, panel or editor; owner/ and admin surface untouched                                           | [ ]    |       |
| H4  | No new npm dependency, no schema change, src/core untouched, panel and website out of the editor bundle                                 | [ ]    |       |
| H5  | No user data lost; existing local data migrated                                                                                         | [ ]    |       |
| H6  | Every user-visible string in English and Hindi; plain sentences for every error                                                         | [ ]    |       |
| H7  | Cinematic panel look in both themes; empty, loading, error states; 1440 and 390 px; no sideways scroll; Settings > Animations respected | [ ]    |       |

## Part A0

| #    | Item                                                                                                            | Status | Proof |
| ---- | --------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| A0.1 | This checklist file                                                                                             | [ ]    |       |
| A0.2 | Library baseline pack in a production build with no catalog; built-preview e2e; build check passes; size stated | [ ]    |       |
| A0.3 | The false sentence "Autodraft screenshots not available" corrected (STATUS, P4 report)                          | [ ]    |       |
| A0.4 | Audit table: Styles code, Asset Library code, Studio result to editor path                                      | [ ]    |       |

## Part A1

| #    | Item                                                                                                                                                                                             | Status | Proof |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ----- |
| A1.1 | Project and Video in the panel metadata layer and the server store, behind existing interfaces                                                                                                   | [ ]    |       |
| A1.2 | One idempotent migration with fixture tests: Style to Project, its projects to Videos; lone and Manual projects to a Project with one Video; assets, Trash and Director pause follow their Video | [ ]    |       |
| A1.3 | Project style record (look, graphics notes, voice and music, script rules, examples); from a ready-made Style, else from the first built Video's plan; editable                                  | [ ]    |       |
| A1.4 | Per-Video style override; "Update project style from this video"                                                                                                                                 | [ ]    |       |

## Part A2

| #    | Item                                                                                                                                                 | Status | Proof |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| A2.1 | Home: Director box with the Orb, ready-made Styles row, Continue (unfinished Videos, newest first)                                                   | [ ]    |       |
| A2.2 | Projects page: cards (cover from newest Video, name, video count, origin tag), "+ New project", Trash                                                | [ ]    |       |
| A2.3 | New project dialog: options from config per plan; Ready-made Style, Director, Start with editor live; Your own Claude off and hidden                 | [ ]    |       |
| A2.4 | Round B seam marked in code for options 1 and 2                                                                                                      | [ ]    |       |
| A2.5 | Project page: name, style summary, "+ New video" (in this style / empty editor), numbered Videos with state, tabs Videos, Style, Assets, Memory      | [ ]    |       |
| A2.6 | Video card: thumbnail, name, state, menu (Open, Open in editor, Rename, Duplicate, Delete, Exports); click opens; editor Back returns to the Project | [ ]    |       |
| A2.7 | Styles page: ready-made gallery only                                                                                                                 | [ ]    |       |
| A2.8 | Removed: My Styles, every Save as/to Style entry, Style review/accept, the old Start screen; tests updated, none weakened                            | [ ]    |       |

## Part A3

| #    | Item                                                                                                                                                            | Status | Proof |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| A3.1 | Top level: Project cards and one Studio Libraries card in creation order; search; type filter                                                                   | [ ]    |       |
| A3.2 | Project, its Video cards, three libraries per Video; Studio Libraries, one card per tool                                                                        | [ ]    |       |
| A3.3 | Saving rules (Director to AI, uploads and Save to cloud to Media, Save to My Templates, Studio to Studio Libraries or a chosen Video); regenerate keeps the old | [ ]    |       |
| A3.4 | Delete to Trash, Restore                                                                                                                                        | [ ]    |       |
| A3.5 | Editor import dialogs list Project, Video, items and copy into the open Video; third dialog "Import from your Library" in Media                                 | [ ]    |       |

## Part A4

| #    | Item                                                                                                                                                   | Status | Proof |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ----- |
| A4.1 | Image (tabs by model assignment; aspect; model; style cards; prompt, reference, Enhance; count; Advanced; My generations)                              | [ ]    |       |
| A4.2 | Story (plot 800; Dialogue/Narration; languages; categories; ideas with View more; duration; history)                                                   | [ ]    |       |
| A4.3 | Video (first and last frame with swap; prompt with Generate; model; style; resolution plan-gated; aspect; duration; audio)                             | [ ]    |       |
| A4.4 | Voice: AI Voiceover, AI Sound, Audio to Audio, Voice Clone; no Music tab                                                                               | [ ]    |       |
| A4.5 | SEO (title, description, languages, categories, output Titles, Description, Tags, Hashtags)                                                            | [ ]    |       |
| A4.6 | Captions kept; other tools in config but disabled by default                                                                                           | [ ]    |       |
| A4.7 | Every tool: cost before Run, required checks under the field, progress, result saved, history from its Studio Library, model-unsupported fields hidden | [ ]    |       |
| A4.8 | The form is one reusable component                                                                                                                     | [ ]    |       |

## Rough use

| #   | Condition                                                                                | Status | Proof |
| --- | ---------------------------------------------------------------------------------------- | ------ | ----- |
| R1  | Delete the last Video of a Project: Project stays, empty state                           | [ ]    |       |
| R2  | Delete a Project with Videos, then Restore: everything returns                           | [ ]    |       |
| R3  | Open a trashed Video's link                                                              | [ ]    |       |
| R4  | Rename with long and Hindi names                                                         | [ ]    |       |
| R5  | Duplicate a Video                                                                        | [ ]    |       |
| R6  | Two tabs on the same Project                                                             | [ ]    |       |
| R7  | Reload in the middle of New project                                                      | [ ]    |       |
| R8  | Browser Back at every step                                                               | [ ]    |       |
| R9  | Limit reached (projects, videos per project, storage): owner's sentence, nothing created | [ ]    |       |
| R10 | Offline or server down: no limit passes, typed input kept                                | [ ]    |       |
| R11 | Importing the same item twice                                                            | [ ]    |       |
| R12 | A Project with zero Videos                                                               | [ ]    |       |
| R13 | Migration run twice                                                                      | [ ]    |       |

## Finish

| #   | Item                                                                     | Status | Proof |
| --- | ------------------------------------------------------------------------ | ------ | ----- |
| F1  | Screenshots of every new or changed screen, dark and light, 1440 and 390 | [ ]    |       |
| F2  | Ledger rows RDA-, each with an e2e test; DECISIONS; STATUS; CHANGELOG    | [ ]    |       |
| F3  | reports/ROUND-A.md from the template                                     | [ ]    |       |
| F4  | One full `npm run verify`; failed specs re-run                           | [ ]    |       |
| F5  | Pushed; CI checked once                                                  | [ ]    |       |
