LIMIT MODE (read first, obey throughout)
- One session, one run, parts in the order below. No sub-agents, no parallel agents, no teams.
- After each part: run only the unit tests and e2e specs that part touches, commit, push. No full suite per part.
- Full `npm run verify` exactly once, at the very end. Then fix failures and re-run only the failed specs.
- CI: check once after the final push. No polling, loops, wakeups or scheduled check-ins.
- Short plain status messages: what is built, what is in progress.
- Never merge a PR. Draft PR only.
- No unrequested features, no dead buttons, nothing marked "Planned".
- Completeness: every checklist item is DONE (with proof) or BLOCKED (outside reason). Nothing "deferred".
- If usage runs out: stop, commit, push, write reports/ROUND-B-HANDOFF.md (done / in progress / not started, exact next step).

BRANCH AND FIRST STEP
- Branch `claude/round-b-ai-mode` already exists (from `claude/round-a-panel`, plus one commit with docs/reference/autodraft/). Check it out. Draft PR to `claude/round-a-panel`.
- Read AGENTS.md, docs/PROCESS.md, docs/STATUS.md, docs/DECISIONS.md, briefs/ROUND-A.md, reports/ROUND-A.md, docs/CHECKLIST-MASTER.md, docs/CONTRACTS-P3.md, docs/EDITOR-OWNERSHIP.md.
- LOOK AT every picture in docs/reference/autodraft/ and every picture in reports/round-a/ before writing any UI.
- Save this whole prompt unchanged as briefs/ROUND-B.md and commit it. Append its rules and items to docs/CHECKLIST-MASTER.md.

WHAT THIS ROUND BUILDS
1. "AI mode": a second layout of the SAME editor and the single home of the Director. The Director's whole flow moves into it; the panel's Director room and the editor's small chat dock are replaced by it.
2. A UI pass over the user panel, because the owner rejected Round A's page layouts, colours and Studio forms (Part B5).
Round C (later) adds the Claude MCP connector, ready-made Style upload and the Admin: do not build those.

THE MODEL (final, unchanged)
Project = container = one style, with many Videos. Video = one editor project with its own brief, plan, chats, assets. First Video sets the Project style; "+ New video" follows it. No user Style cards. The plan JSON/code is never shown to a normal user.

HARD RULES
- One editor, two layouts. AI mode uses the same engine, Scene Graph, Command Bus, canvas, timeline data and history. No second store, no copy of the project. Every change is a validated command; one Apply = one transaction = one undo step. src/core and the frozen contracts are not changed.
- Anything that costs credits shows a card with the cost and waits for Approve. Director's conversation is free. Nothing is spent silently.
- Director reads the canvas fresh on every message (open scene, layers, selection, hand edits). It never overwrites a hand-edited layer without asking.
- Everything Director says or may do comes from Platform Config: rulebook, prompts, refusals, field library, limits, memory caps, rewrite counts. Limits are decided on the server when a gateway is set.
- All of it must run offline on the mock model. Real models go only through the gateway; no key and no provider host in any browser file.
- Bundle: the editor's first load must not grow by the Director. AI mode's Director UI and client are lazy chunks loaded when AI mode first opens. Update scripts/assert-editor-bundle.mjs deliberately to state this rule; report measured sizes. The panel never loads editor code.
- No admin route, link or login anywhere outside owner/. owner/ is not touched.
- No new npm dependency. No schema change.
- English and Hindi for every string. Plain sentences for every error.

WHAT AI MODE CONTAINS (decided; build exactly this set)
In AI mode:
- Select a layer or a scene; play, scrub; Undo, Redo.
- Controls: when a layer is selected, the right drawer's Controls tab shows the controllers that layer exposes (a code animation's own controls: colours, text, speeds, counts, switches; a preset's controls) plus a short safe set for ordinary layers (text content, text colour, fill colour, replace picture or video, show/hide). Dragging a number control previews live on the canvas and commits once on release, one undo step (reuse the existing Controls and live-preview code; do not duplicate it).
- Scene ribbon: click to open a scene; drag a card to reorder; card menu: Duplicate, Delete (confirm), "Ask Director about this scene".
- Quick strip above the stage: Look (the Project's looks), Voice, Music (on/off, volume), Captions (on/off, style), Format. Each change is a Director proposal with a live preview, never a silent rewrite.
- Drag and drop of assets and files (below). Export.
Not in AI mode (Editor mode only): free move/resize/rotate, trim, split, keyframes, effects, filters, masks, draw tools, layer order, lanes, text formatting toolbars, the inspector.
Switching Editor <-> AI keeps the selection, playhead and open scene; it is session state, not history.

UI BAR FOR AI MODE (the owner will reject anything less)
It must feel like a different place: "magic, another world", clearly an AI space, easier than the manual editor, driven by select and drag-and-drop. The cinematic tokens are the floor.
- Layout: the canvas is the stage, centred and largest. Left: the Director column (the Orb living at its top; the conversation with its cards; the message box with attach, voice typing and selection chips). Bottom: the scene ribbon (real thumbnails, lengths) and under it a slim read-only timeline of the open scene (clips selectable, playhead, play). Right: a drawer with Controls, Plan, Assets, Memory that closes so the stage grows. Top: the Editor | AI switch, video name, quick strip, credits, Undo, Redo, Export, Back.
- Point and say: clicking a layer shows a small bubble on it with suggested actions for its kind (text: Change text, Bigger, Recolour; picture: Replace, Fit; any: Remove, Something else...) and a one-line input. The selection also shows as a chip in the message box.
- Drag and drop: an asset from the Assets tab or a file from the computer dropped on a layer or an empty asset slot asks Director to place or replace it there (a proposal); dropped on the stage background offers "use in this scene".
- Every proposal previews on the real canvas before Apply (the engine's existing preview path, nothing committed), with Apply and Discard. After Apply the changed layers are briefly highlighted.
- Build happens on the real canvas: scenes arrive one by one, the ribbon fills, the Orb shows building. Before the first build the stage shows a designed empty state, not a blank editor.
- The Orb has states (idle, listening, thinking, speaking, refusing, building) and the stage's glow follows them.
- Motion on mode switch, drawer, cards, ribbon via the motion tokens; Settings > Animations Off makes everything still; nothing animates while the tab is hidden.
- Works at 1920, 1440, 1280 and 1024 px (the drawer becomes an overlay when narrow). Empty, loading and error states for every region. Dark and light.

PART B0. Carry-over fixes
1. Top bar at 820 px wide: "animation2d overlaps undo" (LAY-013/LAY-014 fail in CI). Fix the layout for real; the Editor | AI switch must fit at every tested size.
2. DEV-012 visual baselines fail in CI and the top bar changes in this round: add a manually dispatched workflow that runs the visual update on the CI image and uploads the baselines as an artifact; fetch and commit them. If the artifact cannot be fetched from here, mark BLOCKED with the exact reason and the commands the owner must run.
3. Studio forms: when a real model with declared parameters is chosen, the form is still the config's field form; the model's parameters only hide fields it does not accept and map values (reverses the gap recorded in D-416).
4. LIB-024 is unreliable after LIB-020 to LIB-023: find the cause in the test or helper and fix it without weakening the assertion.

PART B1. Memory and context
- Levels: Account (Brand Kit, language, voice preference); Project memory (style record plus preferences and decisions for every Video); Video sheet (brief, one line per scene, assets, decisions for this Video); file notes (one short note per attached file, so vision reads a file once); chats (many per Video, each with a rolling summary); canvas (never stored, read live).
- Move Director chats from the Project to the Video (migrate existing ones to the Project's first Video). The Project page Memory tab keeps Project memory.
- Context pack per call, one function, token budget from config: rulebook + Style playbook (if the Project came from a ready-made Style) + Project memory + Video sheet + file notes + the chat's summary + its last N turns + live canvas summary + selection. Unit-test the budget and the order of what is dropped first.
- The Video sheet updates automatically after every approved brief, plan, asset choice, build and applied change. The user can read, edit, pin and forget entries in the Memory tab. A new chat in the same Video starts with the same sheet (test it).

PART B2. AI mode shell
- The Editor | AI switch in the top bar and as a registered command. AI mode hides the manual rails, inspector, toolbars and timeline tools and shows the layout above. Editor mode is unchanged.
- Canvas in AI mode: select only; manual gesture layer off; edit shortcuts off (Undo, Redo, play, Escape stay).
- Controls tab, scene ribbon actions, quick strip and Export as listed in WHAT AI MODE CONTAINS.
- Remove the editor chat dock; reuse its engine (proposals, one-transaction apply, limits).
- "Ask Director" in Editor mode (top-bar button and canvas menu entry) switches to AI mode with the selection carried over.

PART B3. Director flow inside AI mode
- Entry: the ROUND-B SEAM from Round A. Ready-made Style and Director starts, the Home box's first message, "+ New video > In this style", and a click on an AI-made Video card all open AI mode on that Video. Remove the panel's Director room, brief room, plan and live-build screens; Home keeps only the start box. Video card menu: Open in AI mode, Open in editor.
- Field library in Platform Config: named field blocks (topic, script, language, length, aspect, platform, voice, music, look, captions, reference, characters, logo and brand, product, recording, hook, notes) and video types that list their blocks and which are required. Director classifies the first message into a type (mock: deterministic rules; real: the interview model), fills what it understood from the message and attachments, and shows ONE Brief card with only the remaining fields, with choices where possible, plus "You decide". "General" is the fallback type. If the Project has a style, its fields are prefilled and the card is shorter. Brand Kit offers "Use my brand" on the card and in the Project's Style tab.
- Inputs the user may already have: a chapter photo or PDF, a link to a video "like this", product photos or a link, a recording, a pasted script. They attach in the message box; each gets a file note; the Brief card says what was understood.
- Plan card: script and scene list (per scene: narration, what is seen, method, credits), total, Approve, Cheaper, Richer, per-scene edit. The only approval before credits are spent. No free rendered preview. Rewrites per Video from config.
- Assets card: only what the plan needs. Per asset: Make it here (the reusable Studio form, prefilled by Director, with its cost), Upload, Give me a prompt (the Video waits; nothing is lost on closing), Choose from Library, Later (an empty named slot). Regenerate keeps the old asset.
- Build on the canvas, cancellable; a cancelled or failed build leaves nothing half-built and refunds fully.
- After the build every message is first sorted into one of five kinds, shown to the user as what Director is about to do: question (free answer); small change to the selection (proposal); scene work (proposal; may change a code animation's controls or code); new scene (a one-scene plan card with cost, built into the right place in the same style); new video ("make this a new video in this project?" creates the next Video). Several asks in one message become a list of cards.
- Director restates in two lines what it understood before anything that costs credits; when unsure it asks ONE question with choices; when something cannot be made it says so and offers alternatives; off-topic messages get the owner's refusal with no model call.
- First Video of a Project: after its build, fill the Project's style record from it and say so once.

PART B4. Style chat (panel, Project page > Style tab)
A small conversation that only edits the Project's style record. Each change is shown as before/after and applied on confirm. It affects Videos made afterwards; an existing Video gets "Apply the project's new style" in AI mode (a proposal).

PART B5. Panel UI pass (the owner rejected Round A's pages; fix all of these)
Problems seen in reports/round-a/: every page is one narrow column pushed to the left with the right half empty; selected states use different colours (gold in the menu, violet/blue gradient on tabs, gold chips, violet card borders); Studio style cards all show the same generated picture in different colours; the Studio tools do not follow the reference screens.
1. Layout: no page may be a left-hugging column with an empty right side. Every page uses the available width with a deliberate composition. Studio tools follow the reference layout in docs/reference/autodraft/: a controls column on the left (settings, option chips, style cards, advanced) and a wide workspace on the right (the main input where the reference puts it, the action button with its credit cost, results/history gallery, and the reference's template or "how it works" panels as the empty state). Project page, Asset Library, Home, Styles, Credits, Settings, Brand Kit: centred max-width compositions or two columns with a real second column (preview, summary, recent, help). Stacks properly at 390 px.
2. One colour system, written at the top of the panel tokens file and applied everywhere: gold = the current selection and the primary action and credits; the aurora gradient = Director/AI moments only; everything else neutral. Menu, tabs, chips, segmented controls, selectable cards and radio rows share ONE selected style. Add a test that reads the computed selected colour of each kind and expects the same token.
3. Studio style cards: a card's picture comes only from its config `thumb` (the owner will upload real sample pictures in Admin, Round C). Remove the generated look-alike art. With no picture a card is a neutral tile with the style's name. Default Image style names: Dream Style, Rural, Horror 2, Anime, Realistic, 3D, Village Style 2, 3D Kids Animation Style, Cartoon Style, Kids Animation Style, Village Style. Same rule for Video styles and voice avatars.
4. Field-by-field match with the reference screens for Image, Story, Video, AI Voiceover, AI Sound, Audio to Audio, Voice Clone, SEO: every field, its place, its limits, its defaults (briefs/ROUND-A.md Part A4 lists them), language chips in their own script, the credit cost on the action button, history lists, tips panels. Copy the fields and working layout, not the brand, colours or pictures. In the report, a table per tool: reference field -> our field -> where it is.
5. No native select, checkbox, radio or file input styling anywhere in the panel or AI mode: use the shared components (New project dialog, Studio forms included).
6. Screenshots of every panel page and every Studio tool after the pass (dark, light, 1440, 390) in reports/round-b/panel/.

ROUGH-USE CONDITIONS (each needs a test)
Message sent while a build runs; switch to Editor mode mid-build and back; undo an AI change in Editor mode, return to AI mode (sheet and canvas agree); delete a scene by hand then ask Director about it; hand-edit a layer then ask Director to change the scene (it asks before touching that layer); reload at every step (brief, plan, assets, build) resumes there; two chats in one Video share the sheet; a very long chat still knows the brief; selected layer deleted before Apply (proposal cancelled with one sentence); proposal applied twice; a control dragged while a proposal is previewing; reorder scenes during playback; not enough credits; server unreachable (nothing spent, nothing lost, input kept); a huge or unsupported attachment; three asks in one message; a locked layer; off-topic and prompt-injection messages; Hindi input; mode switch with Animations Off.

FINISH
- Ledger rows (prefix RDB-) each with an e2e test whose title starts with its ID. Update tests that stated the panel Director room, the dock or Round A's Studio layout to state the new behaviour; never weaken a test. docs/DECISIONS.md from the next free number, docs/STATUS.md, CHANGELOG.md.
- reports/ROUND-B.md from reports/TEMPLATE.md: ticked CHECKLIST-MASTER, bundle sizes before and after, the reference-vs-ours tables, test counts by layer and browser, what was NOT tested (say plainly that no real model was used), an owner try-it script of at most 15 steps with screenshot paths.
- Screenshots of every AI mode state in reports/round-b/ai-mode/ (dark, light, each width).
- One full `npm run verify`, fix, re-run failed specs only, push, check CI once, report in plain words and stop.

CHECKLIST (DONE with proof, or BLOCKED with outside reason)
[ ] B0.1 top bar 820  [ ] B0.2 visual baselines  [ ] B0.3 Studio form with real-model parameters  [ ] B0.4 LIB-024
[ ] B1 levels  [ ] B1 chats per Video + migration  [ ] B1 context pack + budget tests  [ ] B1 sheet auto-update and Memory tab
[ ] B2 switch + command  [ ] B2 layout  [ ] B2 select-only canvas  [ ] B2 Controls tab with live preview  [ ] B2 scene ribbon reorder and menu  [ ] B2 quick strip  [ ] B2 Export  [ ] B2 dock removed  [ ] B2 Ask Director from Editor mode
[ ] B3 entries open AI mode, panel Director screens removed  [ ] B3 field library + types + Brief card  [ ] B3 attachments and file notes  [ ] B3 Plan card  [ ] B3 Assets card with the Studio form  [ ] B3 Build on canvas, cancel safe  [ ] B3 five message kinds  [ ] B3 new scene  [ ] B3 new video  [ ] B3 first Video fills the style
[ ] B4 Style chat  [ ] B4 apply new style to an existing Video
[ ] AI mode UI: point-and-say bubble  [ ] drag and drop  [ ] live proposal preview  [ ] Orb states and stage glow  [ ] four widths, dark and light  [ ] Animations Off
[ ] B5.1 layouts use the width  [ ] B5.2 one colour system + test  [ ] B5.3 style cards from config, no generated art  [ ] B5.4 field match tables for 8 tools  [ ] B5.5 no native controls  [ ] B5.6 panel screenshots
[ ] Config-first  [ ] Server-side limits  [ ] Bundle rule and sizes  [ ] English + Hindi  [ ] Rough-use tests  [ ] Report, ledger, decisions  [ ] Full verify once  [ ] CI checked once
