LIMIT MODE (read first, obey throughout)
- One session, one run, parts in the order below. No sub-agents, no parallel agents, no teams.
- After each part: run only the unit tests and e2e specs that part touches, commit, push. Do not run the full suite per part.
- Full `npm run verify` exactly once, at the very end. Then fix failures and re-run only the failed specs.
- CI: check once after the final push (CLAUDE.md rule). No polling, no loops, no wakeups, no scheduled check-ins.
- Short status messages in plain words: what is built, what is in progress. Never just "CI running".
- Never merge a PR. Draft PR only.
- No unrequested features, no leftover dead buttons, nothing marked "Planned".
- Completeness: every item in the checklist at the end is either DONE (with proof) or BLOCKED (with an outside reason). "Deferred" and "not built" are not allowed.
- If usage runs out: stop, commit, push, write reports/ROUND-A-HANDOFF.md (done / in progress / not started, exact next step).

BRANCH AND FIRST STEP
- New branch `claude/round-a-panel` from `claude/p4-flow`. Draft PR to `claude/p4-flow`.
- Read AGENTS.md, docs/PROCESS.md, docs/STATUS.md, docs/DECISIONS.md, docs/PLATFORM-CONFIG.md, docs/EDITOR-OWNERSHIP.md, reports/P4.md.
- Save this whole prompt unchanged as briefs/ROUND-A.md and commit it. It is the brief.

WHY THIS ROUND EXISTS
The owner found the user panel confusing and several things built differently from what he asked. The model below is final. Round A rebuilds the panel around it. Round B (later) adds an "AI mode" in the editor that will hold the Director flow. Round C (later) adds the Claude MCP connector, ready-made Style upload and the Admin. Do not build Round B or C work now.

THE MODEL (final, do not reinterpret)
- Project = a container = one style. It holds: style (look, graphics type, animation manner, voice, script rules), memory, assets, and many Videos.
- Video = one video inside a Project. It has its own brief, plan, chats, assets and editor project file.
- The first Video of a Project sets the Project's style. "+ New video" inside the Project follows that style.
- Users have no Style cards of their own. Their Projects are their styles. There is no "Save as Style" / "Save to your styles" / "Make this my Style" / My Styles page.
- Ready-made Styles are the owner's. The Styles page is only a gallery of them. Choosing one creates a new Project with its first Video.
- Delete a Video = only that Video. Delete a Project = the Project with all its Videos. Both go to Trash first (days from Platform Config), with Restore.
- The editor project file (schema 9) does not change. Project/Video links are panel metadata.

HARD RULES
- Everything the user sees or may do comes from Platform Config (zod-validated, with defaults): start options per plan, limits (projects, videos per project, trash days), Studio tools, their fields and option lists, credit costs. Nothing fixed in code, so the later Admin only edits config.
- Limits are decided on the server when a gateway is set (existing entitlements service). Never trust the browser.
- No admin route, link or login anywhere in website, panel or editor. Do not touch owner/ or the admin surface in this round.
- No new npm dependency. No schema change. src/core untouched. Panel and website stay out of the editor bundle (build check must pass).
- No user data may be lost. Existing local data is migrated (Part A1).
- Every user-visible string in English and Hindi. Plain sentences for every error.
- UI: the existing cinematic panel look (aurora/cinema tokens, both themes) is the floor. No plain or text-only screens. Every new screen: empty, loading and error states; works at 1440 px and 390 px; no sideways scroll on a phone; Settings > Animations respected.

PART A0. Foundation and audit
1. docs/CHECKLIST-MASTER.md: one line per rule of THE MODEL, HARD RULES and each part's items. The final report ticks every line with proof.
2. Editor library fallback: a production build with no catalog configured must still show sound effects, the Text panel's styles and font combinations, and themes. Bundle a baseline pack as the fallback; a reachable catalog adds to or overrides it. Add an e2e that runs against a built preview with no catalog and counts sounds and text items. Keep the build-size check passing and state the size change.
3. Correct the false sentence "Autodraft screenshots not available" in docs/STATUS.md and reports/P4.md (they were provided; the fields were wrong).
4. Audit, written into the report as a table (matches model / does not / missing): the Styles code, the Asset Library code, and the path by which a Studio result reaches the editor.

PART A1. Data model and migration
- Introduce Project (container) and Video in the panel's metadata layer and the server store, behind the existing interfaces.
- Migrate existing data once, idempotently, with a test on fixtures: an existing user Style becomes a Project and its projects become that Project's Videos; an existing project with no Style becomes a Project holding one Video of the same name; "Manual" projects likewise. Asset Library entries, Trash entries and Director pause state follow their Video.
- Project style record: look (palette, fonts, caption style), graphics notes, voice and music defaults, script rules text, examples (which Videos count). Filled from a ready-made Style when the Project starts from one; otherwise empty until the first Video is built, then filled from that Video's plan. Editable by the user.
- Per-Video style override: a change made for one Video stays in that Video. "Update project style from this video" writes it to the Project.

PART A2. Pages
- Home: Director box (with the Orb), a row of ready-made Styles, Continue (unfinished Videos, most recent first).
- Projects page: Project cards (cover from newest Video, name, video count, origin tag: Style name / Director / Manual / Claude), "+ New project", Trash.
- "+ New project" dialog, start options from config, per plan:
  1. Ready-made Style: the gallery inside the dialog; choosing creates the Project and its first Video.
  2. Director: creates the Project and first Video, starts the conversation.
  3. Start with editor: creates the Project and an empty Video, opens the editor. Style record stays empty.
  4. Your own Claude: a config flag, default OFF in this round (connector is Round C). When off it is not shown at all.
  Until Round B, options 1 and 2 open the existing Director flow bound to the new Video. Mark this clearly in code as the Round B seam.
- Project page: name and one-line style summary; large "+ New video" (same options in short form: in this style / empty editor); Videos as a numbered series with state (waiting at brief / plan / assets, built); tabs Videos, Style, Assets, Memory.
  - Style tab: view and edit the style record; list of example Videos with on/off. (The style chat is Round B; leave no placeholder.)
  - Assets tab: this Project's assets grouped by Video.
  - Memory tab: project memory (add, pin, forget), reusing the existing memory screen.
- Video card: thumbnail, name, state, menu (Open, Open in editor, Rename, Duplicate, Delete, Exports). There is no separate Video page; click opens the Video (Director flow if AI-made and unfinished, else editor). Editor Back returns to the Project page.
- Styles page: ready-made gallery only.
- Remove: My Styles page, every "Save as/to Style" entry, Style review/accept screens, the old Start screen. Update tests that stated the old flow to state this one; never weaken a test.

PART A3. Assets Library
- Top level: Project cards and one Studio Libraries card, in creation order, with search and a type filter (images, video, audio, graphics, templates).
- Project -> its Video cards -> three libraries per Video: AI, My Templates, Media.
- Studio Libraries -> one card per Studio tool, results inside.
- Saving rules: Director-made assets -> that Video's AI library; uploads and editor "Save to cloud" -> Media; editor "Save to My Templates" -> My Templates; Studio results -> Studio Libraries (or a chosen Video). Regenerating keeps the old asset and adds the new one. Delete -> Trash -> Restore.
- Editor: the two existing import dialogs ("Import AI templates from your AI libraries", "Import Templates from your Cloud") list Project -> Video -> items and copy the chosen ones into the open Video. If the audit shows Studio results cannot reach the editor, add a third dialog of the same design in Media: "Import from your Library". These dialogs are the only editor UI change in this round besides A0.2.

PART A4. Studio forms (from the owner's Autodraft screenshots; these field lists are the spec)
Default enabled tools: Image, Video, Story, SEO, Voice, Captions. Other existing tools stay in config but disabled by default. All option lists, limits and credit costs are config values; the lists below are the defaults.
- Image (tabs: Image Generation; Upscale and Remove Background only when a model is assigned to them): aspect ratio 1:1, 3:2, 2:3, 16:9, 9:16, 4:3, 3:4; model select; style cards with pictures; prompt with "Use reference image" upload and "Enhance prompt"; count; Advanced: negative prompt (default list), prompt strength slider, seed (-1 = random), NSFW threshold; "My generations" list.
- Story: story plot (800 chars); Dialogue / Narration toggle; language chips English, Hindi, Marathi, Telugu, Bengali, Gujarati, Tamil, Kannada; category chips All, Animal, Family, Horror, Magic/Fantasy, Moral, Business; template story ideas per category with "View more"; duration 5, 10, 15, 20, 25, 30 min; generated history.
- Video: first frame and last frame upload (JPEG, PNG, WEBP up to 10 MB, swap); prompt with "Generate prompt"; model select; video style None, Realistic, Village, 3D, Anime; resolution 480p, 720p, 1080p (plan-gated by config); aspect Landscape / Portrait; duration 5, 7, 10 s; audio On/Off with audio choice.
- Voice family, four tabs: AI Voiceover (script 1500 chars, voice picker with preview, Lite / Pro, emotion chips, history); AI Sound (description 5000 chars, duration); Audio to Audio (sample upload MP3 up to 10 MB, tips); Voice Clone (sample upload, how-it-works, consent tick, cloned-voice history). No Music tab.
- SEO: title, description, language chips Hindi, Bengali, Marathi, Odia, Telugu, English, Kannada, Malayalam, Tamil; category chips Moral, Rhymes, Horror, Fantasy, Family, Animal; output as Titles, Description, Tags, Hashtags.
- Every tool: cost shown before Run; required fields checked under the field; progress; result saved; history shows that tool's Studio Library. A field the chosen model does not accept is not shown.
- Export the form as one reusable component (Round B will show it inside the Director's asset step).

ROUGH-USE CONDITIONS (each needs a test)
Delete the last Video of a Project (Project stays, empty state); delete a Project with Videos then Restore (everything returns); open a trashed Video's link; rename with long and Hindi names; duplicate a Video; two tabs on the same Project; reload in the middle of New project; browser Back at every step; limit reached (projects, videos per project, storage) shows the owner's sentence and creates nothing; offline or server down never lets a limit pass and never loses typed input; importing the same item twice; a Project with zero Videos; migration run twice.

FINISH
- Screenshots of every new or changed screen, dark and light, 1440 and 390, in reports/round-a/.
- Ledger rows (prefix RDA-), each with an e2e test whose title starts with its ID. docs/DECISIONS.md from the next free number. docs/STATUS.md, CHANGELOG.md.
- reports/ROUND-A.md from reports/TEMPLATE.md: the ticked CHECKLIST-MASTER, the audit table, test counts by layer and browser, what was NOT tested, an owner try-it script of at most 15 steps with screenshot paths.
- One full `npm run verify`, fix, re-run failed specs only, push, check CI once, report in plain words and stop.

CHECKLIST (DONE with proof, or BLOCKED with outside reason)
[ ] A0.1 checklist file  [ ] A0.2 library fallback + built-preview test  [ ] A0.3 false sentence corrected  [ ] A0.4 audit table
[ ] A1 model  [ ] A1 migration, idempotent, no data loss  [ ] A1 style record and per-Video override
[ ] A2 Home  [ ] A2 Projects page  [ ] A2 New project dialog (3 options live, Claude flag off)  [ ] A2 Project page, 4 tabs  [ ] A2 Video card and menu  [ ] A2 Styles gallery  [ ] A2 old Style screens removed
[ ] A3 library layout, search, filter  [ ] A3 saving rules  [ ] A3 Trash/Restore  [ ] A3 editor import dialogs
[ ] A4 Image  [ ] A4 Story  [ ] A4 Video  [ ] A4 Voice (4 tabs)  [ ] A4 SEO  [ ] A4 Captions kept  [ ] A4 reusable form
[ ] Config-first for every new value  [ ] Server-side limits  [ ] English + Hindi  [ ] States and 390 px  [ ] Rough-use tests  [ ] Screenshots  [ ] Report, ledger, decisions  [ ] Full verify once  [ ] CI checked once
