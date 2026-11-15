LIMIT MODE (read first, obey throughout)
- One session, one run, parts in the order below. No sub-agents, no parallel agents, no teams.
- After each part: run only the unit tests and e2e specs that part touches, commit, push. No full suite per part.
- Full `npm run verify` exactly once, at the very end. Then fix failures and re-run only the failed specs.
- CI: check once after the final push. No polling, loops, wakeups or scheduled check-ins.
- Short plain status messages: what is built, what is in progress.
- Never merge a PR. Draft PR only.
- No unrequested features, no dead buttons, nothing marked "Planned".
- Completeness: every checklist item is DONE (with proof) or BLOCKED (outside reason). Nothing "deferred".
- The owner is away from his PC. YOU are the tester: act like a rough, impatient, wrong-clicking user in real Chromium (Playwright), open and LOOK at every screenshot you take, and keep inventing "what would a user do wrong here?" cases until nothing new breaks.
- If usage runs out: stop, commit, push, write reports/ROUND-C1-HANDOFF.md (done / in progress / not started, exact next step).

BRANCH AND FIRST STEP
- Create `claude/round-c1-power` from `claude/round-b-ai-mode`. Draft PR to `claude/round-b-ai-mode`.
- Read AGENTS.md, docs/PROCESS.md, docs/STATUS.md, docs/DECISIONS.md, briefs/ROUND-B.md, reports/ROUND-B.md, docs/CHECKLIST-MASTER.md, docs/video-plan.md, docs/GRAPHICS-BLOCKS.md, docs/CODE-LAYER.md, docs/FREECODE.md, docs/FREECODE-AUTHORING.md, docs/CREATOR-PACK-AUTHORING.md, docs/COMPOSITION-ADAPTER.md, docs/CAPABILITY-SHEET.md, docs/LIBRARY.md, and the code in src/video-plan, src/director, src/ai-mode, src/providers, src/gateway, src/composition, src/creator-pack, src/code-layer, src/blocks, src/platform-config.
- Save this whole prompt unchanged as briefs/ROUND-C1.md and commit it. Append its rules and items to docs/CHECKLIST-MASTER.md.

WHY THIS ROUND EXISTS (the owner's words, summarised; this is the product)
The editor was built so that a user can ask the AI for ANY video and the AI builds it, without lowering quality, from its own strong imagination, layer by layer, fully editable, with controllers (code layers Tier A, B, C). A documentary needs motion graphics, stock footage, photos, text, icons, stickers, captions, music; the AI must find and place all of it itself. If the tool lacks something, the AI writes it in code (a new graphic, saved for reuse). Today the Director can only use the 17 built-in graphics blocks, never searches stock, and the Video Plan can say far less than the editor can do. This round removes those limits. Round C2 (Claude MCP connector, plugin, skill) and Round C3 (ready-made Style package and gallery, Admin tabs, Claude-like chat behaviours) come later: do not build them. The owner will redo the look of AI mode and the panel in a separate UI phase: do not restyle anything beyond what a part below needs.

HARD RULES
- One editor, one engine, one Scene Graph, one Command Bus. The Video Plan is a document, not the project schema. Schema 9 and src/core are not changed. Plan fields map only to commands the editor already has; if one is missing, that field is BLOCKED with the exact reason (never change core).
- Never lower quality: every existing plan (docs/samples, tests/fixtures, Round A and B fixtures, v2 and v3 plans) must build to the SAME project as before (snapshot tests). Add the proof for each.
- NOTHING is hard-coded to one provider. The owner adds platforms later in Admin (stock photos and videos, icons, stickers, sound effects, music, captions and speech, voices, image and video generation, web search). Everything goes by provider KIND from a registry, and the AI learns what exists from the live Platform Config, never from a fixed list in code. A provider added in config must work without any code change (proved by a test with a fake REST provider on a local HTTP server).
- Keys, provider hosts and fetching live on the server (the gateway) when one is set; no key or provider host in any browser file. With no gateway, the offline mock and fixtures run the same flows.
- Anything that costs credits shows its cost on a card and waits for Approve. The Director's conversation stays free. Nothing is spent silently; failure or cancel refunds fully.
- Everything the Director says or may do comes from Platform Config (rulebook, prompts, playbooks, limits, web rules, provider list). Limits are decided on the server when a gateway is set.
- Plan JSON, code and provider details are never shown to a normal user. Custom graphics code may exist in the project as a code layer (that is the product), but the chat shows results, not code.
- Bundle: the editor's first load must not grow. The block compiler (TypeScript parser), capability sheet, tools and Director code are lazy chunks. Update scripts/assert-editor-bundle.mjs deliberately and report measured sizes. The panel never loads editor code.
- No admin route, link or login outside owner/. owner/ is not touched (the owner edits the new config in the existing Platform Config tab until Round C3).
- No new npm dependency. English and Hindi for every string. Plain sentences for every error.
- The shared tools (Part C1.1) live in a DOM-free module (src/tools/), so Round C2 can run them on a server. Anything that needs a browser (rendering frames, baking, the sandbox) goes behind an interface that the browser supplies. A Node test must import and run the tools with no DOM.

PART C1.0 Audit (short, written first, in reports/ROUND-C1.md)
1. A table: every editor capability group (docs/FEATURES.md groups FX, TR, MSK, CLR, ANI, VID, AUD, TXT, SHP, TPL, CAM/camera, CODE, CP, LIB, captions, nesting, export) -> can the Video Plan v3 say it? -> the existing command or API that does it (file) -> the plan field you add in C1.2.
2. Where each stock provider, icon/sticker source, sound source, captions engine and voice engine is called from today, and which of them the Director and the plan builder can reach.
3. Find with git log -S where the FIX7 rule ("a build never searches stock") came from and record the reason in DECISIONS (do not guess).

PART C1.1 Provider registry v2, capability discovery, shared tools
1. Platform Config (zod, defaults, migration; keep old configs valid): a media-provider registry. Each entry: id, name, kinds[] (stock-photo, stock-video, icon, sticker, sound-effect, music, speech-to-text, text-to-speech, image-gen, video-gen, web-search; the list is data, new kinds can be added in config), enabled, plans allowed, per-call cost, rate limit, a short "good for" hint the AI reads, and an adapter: `builtin:<name>` (Pexels, Pixabay, Iconify, Freesound, and whatever src/providers and the gateway already have, registered as entries) or `rest` with a descriptor: https base URL, auth style (header name or query name) with a key-vault reference, request mapping (query, orientation, page, limit), response mapping (items path, title, thumbnail, preview, download URL, width, height, duration, licence, attribution) written as plain path expressions, no code.
2. REST runtime on the server side of the gateway: https only, host fixed to the descriptor's host, no private or local addresses (SSRF guard, re-checked after redirects), timeouts, byte and item caps, key from the vault, response validated. Mock/fixture runtime when no gateway.
3. `searchMedia({kind, query, orientation, minDuration, providers?, limit})`: asks all enabled providers of that kind in parallel (plan, limits and credits from config), merges, dedupes, ranks, returns candidates with provider, licence and attribution. One provider failing never fails the rest; the failure is reported in the result.
4. Capability sheet v2: built at run time from the code registries AND the live Platform Config. It lists the enabled providers by kind with their hints and limits, the plan v4 fields, FX/transition/caption/camera/kit ids, the registered blocks, the Project's own graphics kit, and the web rules. It carries a hash. When the owner adds or disables a provider, the next Director call sees it. Test: add a fake REST stock provider to the config; the sheet lists it; a plan that needs footage finds items from it; disable it; it disappears. `npm run docs:capability-sheet` still works.
5. src/tools/ DOM-free registry used by the Director now (and MCP in Round C2): getCapabilities, searchMedia, searchWeb, fetchPage, listLibrary, validatePlan, checkBlock, buildPlan, renderFrames (browser-supplied), registerBlock. Each tool: typed input, typed output, plain-sentence errors, cost declared, audit-logged in the usage log.
6. The editor's own Stock panels list the same registry, so a provider the owner adds appears there too (filter by provider). Existing stock panels keep working as before.

PART C1.2 Video Plan v4: the plan can say what the editor can do
1. `version: 4`; versions 2 and 3 still read and build the same project.
2. New layer, scene and plan fields, each mapped to an existing command or API (name it in the audit table): effects and filters and adjustments (the FX catalog ids and params), transition per scene and per clip, masks, blend mode, chroma key, colour grading, keyframes and Creator presets (ids and control values), speed, trim (sourceIn/out), reverse, volume and fades per layer, music ducking, text effects and fonts, captions style, nested group, camera shots (already there), stickers and icons as layers, image and video fit modes, layer order and lanes, hide/lock, names. Validate every id against the real catalog; unknown ids are plain errors with the nearest valid ids named.
3. `defs.blocks[]`: custom graphics defined inside the plan: `{id, tier: "B" | "C", source, meta?}`. Layers `kind: "block"` may use a def id or a registered id. Tier B is checked with the existing compiler; Tier C with the existing static checks (checkPack / policy). Params a def declares become the layer's controllers in the right panel (existing code-layer path). A def is limited like a Creator Pack item (source size, 32 params). Up to 40 defs per plan.
4. Every accepted def is also saved as a Creator Pack item (motion-b or motion-c) in the Video's AI library, so it can be reused by id in later scenes, later Videos of the Project (the Project's graphics kit) and shows in the editor's AI panel.
5. Builder stays headless and deterministic: same plan and same services give the same project. A Node test builds a v4 plan with fake services and validates the project against schema 9.
6. Docs: docs/video-plan.md v4 section; `npm run docs:plan-cheatsheet` regenerated.

PART C1.3 Finding media on its own (replaces the FIX7 rule)
1. The plan carries the brief's asset rule: `meta.assets: {order, aiImagesMax, aiVideosMax, onlyMine}`; default order is mine, library, stock, ai; "Use only my files" is respected exactly.
2. For each media layer the builder calls searchMedia for its kind, picks the best candidate that passes the checks (licence allowed, orientation and resolution fit, footage long enough, not already used by another layer), imports it through the existing importer into the media store, and records the pick with up to four alternatives and a "picked by AI" mark. Review & swap shows them. A layer may give several queries; they are tried in order.
3. Footage is cut to what the scene needs (sourceIn and length).
4. Nothing found: the layer becomes the named empty slot with the "needs asset" flag as today, and the Director gets the outcome and offers: reword the search, make a code graphic, or an AI image if the rule allows.
5. Icons, stickers, emoji, sound effects, music, captions (speech-to-text provider or the offline engine) and voices go by their kinds through the same registry. Licence and attribution are kept (existing metadata) and listed with the export.
6. Storage, plan limits and credits are counted for what the build imports.

PART C1.4 Web tools
1. `searchWeb(query)` and `fetchPage(url)` in the tools layer, server-side only. Platform Config `director.web`: enabled, allowed and blocked domains, pages per Video, bytes per page, whether it costs credits. SSRF guard as in C1.1. Returns plain readable text and the source address. Offline: fixtures.
2. Prompt-injection rule: fetched text is data, wrapped and labelled as untrusted, never followed as instructions. Test with a fixture page that tries to give orders.
3. The planner may run a short research step before planning: up to N tool requests from a fixed list (searchMedia, searchWeb, fetchPage, listLibrary), as a JSON request the runtime executes and feeds back; then the plan. The Brief card's "link to a video like this" and reference inputs use it. Test with a scripted mock model.

PART C1.5 Custom graphics: the authoring loop
1. The planner prompt gets the code authoring guides (docs/FREECODE-AUTHORING.md, the code-layer authoring guide, docs/GRAPHICS-BLOCKS.md "rules learned") through Platform Config playbook text, not hard-coded. Tier choice rule: A before B before C.
2. Loop: plan with defs -> validator (compile, static check) -> one repair call with the exact errors (existing pattern) -> sample frames (C1.6) -> one fix call if a frame is blank or outside the canvas -> build. Two failures: refuse with the owner's text and charge nothing.
3. The Plan card shows each new graphic as "New graphic" with its configured cost, a name and one line of what it shows.
4. AI mode scene work: "change this graphic" or "make a new one here" edits or adds a def as ONE undo step (re-bake, same controllers). The offline mock must still work for the common asks and say plainly, in one sentence, what needs the real model.

PART C1.6 Looking at the result
1. Layout validator (pure, no DOM): safe-area margins from config, layers inside the canvas, text fits its box (estimate offline with a font-metrics table; in the browser use real text measuring on the built layers), overlapping text, low contrast, wrong media aspect. Runs inside validatePlan and again on the built layers. Findings are plain sentences with a suggested fix; errors block, warnings show.
2. `renderFrames(project, times[])` returns small PNGs using the editor's own render adapter off-screen (reuse the poster and thumbnail code). Used by: the sample-frame step above; a vision-capable model call "does this match the plan, what is wrong?" through the gateway (skipped when the model has no vision); tests; thumbnails.
3. Thumbnails: Project cover, Video card, scene ribbon and Asset Library show a real frame of the Video, taken at the first moment with content (never a black frame from a fade-in). Fix the black stage and black thumbnail after a build (scene fade-in from 0:00).
4. The mock plan must keep every text inside the 9:16 frame: use the validator.
5. LAY-048 (timeline height expected 540, received 230 in CI): find the cause (test or code) and fix it without weakening the assertion. DEV-012 baselines: BLOCKED until the UI phase; write that reason and the commands to regenerate.

PART C1.7 Director rules for power
1. Rulebook v2 in Platform Config (Admin edits it later): never refuse what a code graphic or a provider can make; design new from the topic and script, never copy a reference; check the layout; use providers by kind; do not show code or JSON to the user; say what you may tell users. Write these as config text with English and Hindi.
2. Playbook slots: `director.playbooks[videoTypeId]` text, loaded into the context pack for the video type. The owner and Claude write the playbook texts separately: do not write them; leave sample text only in test fixtures.
3. Video types for later Styles must be configurable data: documentary, explainer, reel and short, recorded-video enhance, logo reveal and intro, product promo, educational animation. Make sure the field library, planner and capability sheet take the type from config, nothing from code.

PROOF VIDEOS (real Chromium, built through the Director flow on the offline mock model with scripted answers and fake providers; this is the heart of the round)
For each, save screenshots at three times and the layer list, open the right panel on a custom or code layer, drag a controller and show the canvas change (one undo step), and run Undo.
1. Explainer: two NEW code graphics (one Tier B, one Tier C), reused in two scenes, narration and captions.
2. Documentary: stock footage and photos from a fake REST provider added in config, icons, a music bed, effects and a colour grade on footage, lower thirds, captions.
3. Reel: kinetic text, FX, speed ramp, transitions, music.
4. Recorded-video enhance: a fixture clip, captions, zoom keyframes, lower thirds, a chroma-keyed overlay.
Each must build with zero hand-editing and be fully editable layer by layer.

ROUGH-USE CONDITIONS (each needs a test; invent at least five more per part and test them)
A provider returns nothing, a bad format, a huge file, a 500, a slow reply, a redirect to a private address; two providers return the same picture; every provider disabled; the owner disables a provider between plan and build; a stock pick whose licence is not allowed; footage shorter than the scene; "use only my files" with nothing uploaded; a code graphic that throws, loops, draws outside the canvas or is blank; a def with the same id as a built-in; a def whose params clash; the Director asks for a tool not on the list; the research step loops past N; a fetched page with prompt-injection text; a very long page; a non-UTF-8 page; plan v2 and v3 fixtures; a plan with 40 scenes and 400 layers; cancel during stock download, during code check, during build; reload at each step and resume; server unreachable (nothing spent, input kept); not enough credits; text longer than its box in Hindi; a 1:1 and a 16:9 project; a layer the user hand-edited then "change this graphic"; undo after an AI graphic change then redo; the same plan built twice (same project).

FINISH
- Ledger rows (prefix RDC1-) each with an e2e or unit test whose title starts with its ID (e2e only for visible behaviour). Update tests that stated the FIX7 rule or the 17-block limit to state the new behaviour; never weaken a test. docs/DECISIONS.md from the next free number, docs/STATUS.md, CHANGELOG.md.
- reports/ROUND-C1.md from reports/TEMPLATE.md: the audit tables, the ticked checklist, bundle sizes before and after, test counts by layer and browser, what was NOT tested (say plainly that no real model and no real provider were used), the four proof videos with screenshot paths, an owner try-it script of at most 15 steps.
- One full `npm run verify`, fix, re-run failed specs only, push, check CI once, report in plain words and stop.

CHECKLIST (DONE with proof, or BLOCKED with outside reason)
[ ] C1.0 audit table + FIX7 origin
[ ] C1.1 registry in config + migration  [ ] REST descriptor runtime + SSRF guard  [ ] searchMedia  [ ] capability sheet v2 from live config + test with a provider added and removed  [ ] src/tools DOM-free + Node test  [ ] editor Stock panels read the registry
[ ] C1.2 plan v4 fields, each mapped or BLOCKED  [ ] defs.blocks Tier B and C + controllers in the right panel  [ ] defs saved to the Video's AI library and the Project kit  [ ] old plans build the same project (snapshots)  [ ] headless Node build  [ ] docs
[ ] C1.3 asset rule from the brief  [ ] auto-pick with alternatives and "picked by AI"  [ ] footage cut  [ ] not-found flow  [ ] icons, stickers, sounds, music, captions, voices by kind  [ ] licences kept  [ ] limits and credits counted
[ ] C1.4 searchWeb and fetchPage with rules and SSRF guard  [ ] injection test  [ ] research step
[ ] C1.5 authoring guides via config  [ ] repair and fix loop  [ ] Plan card shows New graphic and cost  [ ] AI mode edit of a graphic as one undo step
[ ] C1.6 layout validator  [ ] renderFrames  [ ] vision check when supported  [ ] real thumbnails everywhere, no black first frame  [ ] mock text inside the frame  [ ] LAY-048  [ ] DEV-012 reason written
[ ] C1.7 rulebook v2  [ ] playbook slots  [ ] video types from config
[ ] four proof videos  [ ] rough-use tests  [ ] config-first  [ ] server-side limits and keys  [ ] bundle rule and sizes  [ ] English + Hindi  [ ] report, ledger, decisions  [ ] full verify once  [ ] CI checked once
