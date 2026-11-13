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

CHECKS_PLACEHOLDER

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

CHECKLIST_PLACEHOLDER

## 12. Git

- Branch: `claude/round-a-panel`, draft PR to `claude/p4-flow`.
