# Report: Round C1, the AI's power (15 Nov 2026, finished the same day)

## 1. Summary

The AI can use what the editor can do and find what it needs without a fixed list of providers. The owner adds stock, icon, sticker, music, sound, web-search, voice and captions providers as data in Platform Config (a REST provider needs no code); they run on the gateway with the keys there, and the Director learns them from a capability sheet built from the live config. A Video Plan v4 can say effects, colour grade, blend, chroma key, masks, transitions, keyframes, presets, speed, trim, sound, fonts, fit, groups, lock, names, voice and captions providers, and can define its own new graphics in code (Tier B and Tier C), which become code layers with their own controllers and are saved to the Project's AI library. Before the Plan card, AI mode draws every new graphic off screen with the editor's own renderer and asks for one fix when one is blank, cut off, throws or never finishes a frame; a model that can see pictures also looks at the built frames. A v4 build finds footage, photos, icons, stickers and music on its own; Review & swap says what was "Picked by AI" with credit lines and other choices. Older plans build exactly the same project as before. Four proof videos were built through the Director in AI mode with no hand edits.

The finishing session (briefs/ROUND-C1-FINISH.md) also fixed two tests this round had broken (PB-009 and PB-010: the new project cover re-seeked the stage's video) and found the cause of LAY-048 (its test aimed at a bar that was still moving).

**No real model and no real provider were used in this round.** Every answer came from scripted offline answers, fake providers on local servers or fixtures.

## 2. Scope and results

### 2.0 Audit (C1.0)

#### 2.0.1 Editor capability → Video Plan

| Group | Plan v3 could say it? | Existing command or API (file) | v4 field |
| --- | --- | --- | --- |
| FX effects, filters, adjustments | No | `SET_CLIP_FX` (src/core/fx.ts, src/fx) | `layer.fx[]` |
| CLR colour grade | No | `adjust.*` in the `SET_CLIP_FX` stack | `layer.grade` |
| Blend modes | No | `plugin:layer-blend:SET` (src/blend/commands.ts) | `layer.blend` |
| Chroma key | No | `plugin:chroma-key:SET` (src/chroma/commands.ts) | `layer.chromaKey` |
| MSK masks | Soft edge only (`feather`) | `plugin:layer-masks:SET` (src/masks/commands.ts) | `layer.mask` |
| TR clip transitions | No | `SET_CLIP_TRANSITION` | `layer.transitionIn` |
| TR scene transitions | Basic kit list | scene-transition marker (src/composition/build.ts) | `transitionOut.type` also `transition.*` |
| ANI keyframes | One `move` | `SET_PROPERTY` with keyframes | `layer.keyframes[]` |
| ANI / CP Creator presets | No | `presetCommands` (src/ui/creator-presets.ts) | `layer.preset` |
| VID speed, reverse, trim | No | `SET_CLIP_SPEED`, `SET_CLIP_REVERSED`, `SET_CLIP_TIMING` | `speed`, `reverse`, `sourceIn` |
| VID speed ramp | No | none (one speed per clip) | BLOCKED |
| AUD volume, fades | Music volume and ducking only | `plugin:audio:SET` (src/audio/settings.ts) | `volume`, `fadeIn`, `fadeOut`; `music.sourceIn` |
| TXT fonts | Plan-wide fonts | text properties | `font`, `letterSpacing` |
| Captions style | Yes | captions hook | unchanged |
| SHP shapes, bubbles | Yes | Tier A items | unchanged |
| Stickers and icons as layers | Icon and emoji | provider registry | `mediaIntent.type: sticker` |
| Fit modes | No | VID-004 rule (scale and position) | `fit` |
| Nesting / groups | No | `GROUP` | `group` |
| Layer order | Build order | build order | `order` |
| Hide / lock | No | `locked` property (D-126); no hide command | `locked`; hide BLOCKED |
| Names | No | `SET_LAYER_NAME` | `name` |
| CAM camera | Yes | camera shots | unchanged |
| CODE / CP new graphics | Built-in blocks only | `SET_LAYER_CODE`, `checkPack`, `compileBlock` | `defs.blocks[]` |
| TPL / LIB kit | Starter kit | composition adapter | unchanged; Project kit in the sheet |
| Export | n/a | export dialog | credit lines returned with the build |

#### 2.0.2 Where media and speech sources were called (before this round)

| Source | Called from | Director reach | Plan builder reach |
| --- | --- | --- | --- |
| Pexels, Pixabay, Iconify, Freesound | src/providers, editor Stock panels (person's keys in Settings) | No | Only for a pick the person kept (FIX7) |
| Gateway media models (OpenAI images, ElevenLabs, video jobs) | src/gateway/adapters/media.ts | Studio and the Assets card | No |
| Captions (offline Whisper, cloud STT) | src/speech, src/captions | No | Captions from narration text |
| Voices (cloud TTS) | src/speech | No | `voice` dep in runPlanBuild |
| Sound pack, catalog sounds | library client | No | `sound` dep (catalog sfx, own files) |

After this round the Director and the v4 builder reach every enabled provider by kind through `searchMedia`. Since the finish (F4), voices and captions also go through the registry by kind (text-to-speech, speech-to-text), next to the existing engines.

#### 2.0.3 FIX7 origin

`git log -S` finds commit 5f59e38 (2026-10-29) "feat(plan): missing assets are never auto-fetched; all-or-nothing build with rollback and a missing-files list [FIX7-001..003]". No brief file or decision gives a further reason. v2 and v3 plans keep that rule; v4 replaces it (D-427).


### 2.1 Checklist (briefs/ROUND-C1.md and briefs/ROUND-C1-FINISH.md)

| ID | Item | Status | Proof or reason |
| --- | --- | --- | --- |
| C1.0 | Audit table and FIX7 origin | DONE | section 2.0; D-427 |
| C1.1a | Registry in config and migration | DONE | RDC1-001 |
| C1.1b | REST descriptor runtime and SSRF guard | DONE | RDC1-002, RDC1-006 |
| C1.1c | searchMedia | DONE | RDC1-003 |
| C1.1d | Capability sheet v2 from live config, provider added and removed | DONE | RDC1-004, RDC1-006, RDC1-070 |
| C1.1e | src/tools DOM-free and Node test | DONE | RDC1-005 |
| C1.1f | Editor Stock panels read the registry | DONE | RDC1-008 |
| C1.2a | Plan v4 fields, each mapped or BLOCKED | DONE; speed ramp, hide and extra lanes BLOCKED (no editor command; src/core may not change) | RDC1-011, RDC1-012; docs/video-plan.md |
| C1.2b | defs.blocks Tier B and C with controllers | DONE | RDC1-013, RDC1-050 |
| C1.2c | Defs saved to the AI library and Project kit | DONE | RDC1-013, RDC1-005 |
| C1.2d | Old plans build the same project | DONE | RDC1-010 |
| C1.2e | Headless Node build | DONE | RDC1-012 |
| C1.2f | Docs | DONE | docs/video-plan.md, cheatsheet, docs/CAPABILITY-SHEET.md |
| C1.3a | Asset rule from the brief | DONE | RDC1-067, RDC1-094 |
| C1.3b | Auto-pick with alternatives and "picked by AI" | DONE | RDC1-014, RDC1-066, RDC1-095 |
| C1.3c | Footage cut | DONE | RDC1-012 |
| C1.3d | Not-found flow | DONE | RDC1-060, RDC1-067 |
| C1.3e | Icons, stickers, sounds, music, captions, voices by kind | DONE | RDC1-051, RDC1-052, RDC1-070 to RDC1-073 |
| C1.3f | Licences kept | DONE | RDC1-014, RDC1-008, RDC1-071, RDC1-073 |
| C1.3g | Limits and credits counted | DONE | RDC1-003, RDC1-006, RDC1-072, RDC1-096 |
| C1.4a | searchWeb and fetchPage with rules and SSRF guard | DONE | RDC1-020 |
| C1.4b | Injection test | DONE | RDC1-021, RDC1-068 |
| C1.4c | Research step (and the Brief's link) | DONE | RDC1-030, RDC1-068, RDC1-095 |
| C1.5a | Authoring guides via config | DONE | RDC1-033 |
| C1.5b | Repair and fix loop | DONE | RDC1-031, RDC1-063, RDC1-064 |
| C1.5c | Plan card shows New graphic and cost | DONE | RDC1-050 |
| C1.5d | AI mode edit of a graphic as one undo step | DONE | RDC1-034, RDC1-050 |
| C1.6a | Layout validator | DONE | RDC1-040 |
| C1.6b | renderFrames in the browser | DONE | RDC1-061, RDC1-064, RDC1-068 (the vision frames go through the tool) |
| C1.6c | Vision check when supported, plain skip otherwise | DONE | RDC1-062 |
| C1.6d | Real thumbnails, no black first frame | DONE | RDC1-042, RDC1-091 |
| C1.6e | Mock text inside the frame | DONE | RDC1-043 |
| C1.6f | LAY-048 | DONE (cause found and fixed in the test's aim; section 3.2) | LAY-048, LAY-004, RDC1-091 |
| C1.6g | DEV-012 reason written | BLOCKED until the UI phase: baselines are per operating system image; refresh them on the CI image with `npm run visual:update` (the manually dispatched workflow) and commit the artifact | D-430, D-431 |
| C1.7a to c | Rulebook v2, playbook slots, video types from config | DONE | RDC1-033 |
| F1a | PB-010 and PB-009 cause found, with numbers on both branches | DONE | section 3.2; D-431 |
| F1b | LAY-048 cause | DONE | section 3.2 |
| F1c | Projects dialog check classified | DONE: a DEV-012 baseline test; its sandbox baseline refreshed for the intended new cover; the CI-image baseline is BLOCKED as above | D-431 |
| F1d | DEV-012 reason kept | DONE | C1.6g |
| F2 | renderFrames in browser, sample-frame fix loop, vision check or plain skip, tests | DONE | RDC1-061 to RDC1-065, RDC1-092, RDC1-093 |
| F3 | Picked by AI and alternatives, Brief asset rule into the plan, reference link to research, injection test | DONE | RDC1-066 to RDC1-068, RDC1-094, RDC1-095 |
| F4 | Captions and voices by kind with add and remove test | DONE | RDC1-070 to RDC1-073, RDC1-096, RDC1-097 |
| F5 | Every rough-use condition has a test or a BLOCKED reason; five new per part | DONE | section 3.3 |
| P | Four proof videos | DONE | RDC1-050 to RDC1-053 |
| G | Config-first, server-side limits and keys, bundle rule and sizes, English and Hindi | DONE | D-425 to D-427, D-434; section 3 |

RDC1 ledger rows: 45, all Verified by tests named in the ledger.

## 3. Checks (paste the real output tails, not a description)

One full `npm run verify` at the end of the finish (sandbox, Node 22, Playwright Chromium from /opt/pw-browsers):

- Format check: passed. Typecheck: passed.
- Unit and jsdom: 1,673 passed, 3 skipped, 2 failed. The 2 failures are both in `tests/blocks/worker.test.ts` ("Cannot read properties of undefined (reading 'instantiate')"). They fail the same way on `claude/round-b-ai-mode` in this sandbox, and this round does not touch `src/blocks`. They come from the sandbox, not this round.
- Build: passed. Editor first load is 9 chunks, 5,992,123 bytes (Round B 6,026,000). The bundle check passed.
- E2E: 825 passed, 0 failed, 0 flaky (1.9 h). No spec had to be re-run.
- Test-hook check: passed. Ledger: passed (warnings only, about rows the round did not touch).

CI, checked once (run 43706108577 on `fe6ea58`, the last code commit; later commits only change docs): the unit tests passed there (so the 2 worker failures happen only in the sandbox). E2E: 819 passed, 2 flaky (RDC1-091 and TL-096, both drag-timing tests that passed on retry), 4 failed. The 4 failures are the DEV-012 screenshot baselines, which stay BLOCKED until the UI phase (D-430). `export-mp4` passed. The PR-event run of the same commit stopped at `npm ci` (a runner install failure; it ran no tests).

Bundle (`scripts/assert-editor-bundle.mjs`): editor first load Round B 6,026,000 bytes in 8 chunks; Round C1 5,991,926 bytes in 9 chunks (plan build, Review & swap, the v4 builder, the frame renderer and the speech tools are lazy); with its lazy chunks 8,414,699 bytes. The check fails above 6,026,000 bytes or if Round C1 code is in the first load.

### 3.1 Proof videos (real Chromium 141, offline model with scripted answers, fake providers)

| # | Video | Test | Screenshots and layer list |
| --- | --- | --- | --- |
| 1 | Explainer: Tier B "Rising bars" and Tier C "Orbit ring", each in two scenes, captions; controller "Bars" dragged (one step), Undo; offline "make a new graphic" answered in one sentence; "make it faster" proposal applied, undone, redone | RDC1-050 | reports/round-c1/proof1-explainer-t1..t3.png, -controller.png, -layers.txt |
| 2 | Documentary: river footage (filter + grade) and fort photo from the REST provider added in config (the editorial-only gate photo passed over), map pin icon, calm piano music, lower third, captions; "Specks" dragged | RDC1-051 | reports/round-c1/proof2-documentary-* |
| 3 | Reel 9:16: kinetic title block, glow and vibrant filter, clip at 2x, zoom pixel transition, sticker with rotation keyframes, music; "stagger" dragged | RDC1-052 | reports/round-c1/proof3-reel-* |
| 4 | Recorded-video enhance: the person's own talk-recording.webm found by name, scale keyframes, lower third, chroma-keyed map overlay, captions; ink circle "size" dragged | RDC1-053 | reports/round-c1/proof4-recording-* |

Seen when looking at the screenshots: the Assets card first said "Waiting for files" for media the build had already found (fixed: v4 asks only for AI-made pictures); the stage was blank after a build because everything faded in from 0:00 (fixed: first moment with content); in proof 4 the captions cover the lower third (now a layout warning; the plan in the test still does it).


Seen when looking at the screenshots in the finish: the Assets card offered "Make it here" (an AI picture) for a plan whose Brief said "Use only my files" (fixed: no AI actions then, RDC1-067); a reload during planning left an approved Brief card with no button (fixed: the Brief comes back with a plain line, RDC1-065); Review & swap of a build made in AI mode was empty (fixed: the build keeps its plan state, RDC1-066).

Finish screenshots: reports/round-c1/f2-checking.png, f2-blank-fixed.png, f2-outside-refused.png, f2-reload-resume.png, f3-brief-media.png, f3-only-mine-assets.png, f3-picked-by-ai.png, f3-alternatives.png, f4-voice-captions.png.

### 3.2 The red tests (F1)

| Test | Round B (sandbox, 10 runs each) | This branch before | Cause | After |
| --- | --- | --- | --- | --- |
| PB-010 | 10 of 10 | 0 of 10 | The project cover (new this round, commit 55056c8; commits 322e195 and 682d952 pass) was drawn on every autosave through the stage's own video decoders and re-seeked the playing video | 10 of 10 (20 of 20 with PB-009) |
| PB-009 | 10 of 10 | 9 of 10 (paused frame 77 instead of 78) | The same seek, while paused | 10 of 10 |
| LAY-048 (and LAY-004) | failed in Round B's CI too | failed in CI | The test measured the Player bar during the 300 ms Expand or Collapse animation; on a slow machine the press landed where the bar had been (reproduced at 1920 × 940: height 282 instead of 540) | 20 of 20 with the tests waiting for the animation; assertions unchanged |
| DEV-012 Projects dialog | passes | fails | This round's intended change: the card shows the real cover | sandbox baseline refreshed; CI-image baselines BLOCKED (C1.6g) |

Under a heavier parallel run (two audio-sync tests, 15 runs each) both branches show the known sandbox audio-timing noise: Round B 1 of 30, this branch 3 of 30 (owner decision 2026-09-24; not re-investigated). The new timing test of an autosave during playback was replaced by deterministic ones for that reason.

### 3.3 Rough-use conditions (briefs/ROUND-C1.md) and the tests that cover them

| Condition | Test |
| --- | --- |
| A provider returns nothing, a bad format, a huge file, a 500, a slow reply, a redirect to a private address | RDC1-002, RDC1-003 (tools.test cases nothing, badformat, huge, error, slow, private) |
| Two providers return the same picture | RDC1-003 |
| Every provider disabled | RDC1-003, RDC1-060 |
| The owner disables a provider between plan and build | RDC1-006 |
| A stock pick whose licence is not allowed | RDC1-060, RDC1-051 |
| Footage shorter than the scene | RDC1-060 |
| "Use only my files" with nothing uploaded | RDC1-060, RDC1-067 |
| A code graphic that throws, loops, draws outside the canvas or is blank | RDC1-063, RDC1-064, RDC1-093 |
| A def with the same id as a built-in; a def whose params clash | RDC1-031, RDC1-060 |
| The Director asks for a tool not on the list; the research step loops past N | RDC1-030 |
| A fetched page with prompt-injection text | RDC1-021, RDC1-068 |
| A very long page; a non-UTF-8 page | RDC1-020 |
| Plan v2 and v3 fixtures | RDC1-010, RDC1-011 |
| A plan with 40 scenes and 400 layers | RDC1-060 |
| Cancel during stock download, during code check, during build | RDC1-060 (download, build), RDC1-063, RDC1-065, RDC1-093 (code check) |
| Reload at each step and resume | RDB-032 (Brief, Plan, Assets, build), RDC1-065 (during planning and the frame check) |
| Server unreachable (nothing spent, input kept) | RDB-040; RDC1-096 (speech without a server) |
| Not enough credits | RDB-039, RDC1-006, RDC1-096 |
| Text longer than its box in Hindi | RDC1-040 |
| A 1:1 and a 16:9 project | RDC1-060, RDC1-040 |
| A layer the user hand-edited then "change this graphic" | RDB-035, RDC1-034 |
| Undo after an AI graphic change then redo | RDC1-034, RDC1-050 |
| The same plan built twice (same project) | RDC1-012, RDC1-060 |

Invented for the finish (at least five per part):
- F1 (RDC1-091): a paused frame stays exact through two autosaves; a project with video gets a non-empty cover; a project without video gets its own drawn cover (not black) and the stage does not move; Collapse and Expand pressed fast four times; a press on the bar during the Expand animation.
- F2 (RDC1-092, RDC1-093): two graphics with one bad (only it is named); a chatty vision model (eight problems, each cut); the edge threshold at 20 % and 25 %; no frames and a crashing check; a Tier C graphic that throws as it starts; Stop pressed twice.
- F3 (RDC1-094, RDC1-095): the owner's own Brief caps; an unknown or removed choice; only-mine never allows AI; odd links (javascript:, ftp:, file:, words, spaces, 2,100 characters) are not read; swapping to the current pick adds no step; Undo and Redo between picks; a blocked site said in one sentence.
- F4 (RDC1-096, RDC1-097): no audio and not-base64 audio; no words and broken word times; a third call in a minute; no credits (nothing sent); no server; a reply over its cap; the named voice failing during a build (silent with one reason).

## 4. Try-it script for the owner (max 15 steps, about 10 minutes)

| # | Do this | Expect | ID | Ran it | Screenshot |
| --- | --- | --- | --- | --- | --- |
| 1 | Owner App › Platform Config: add a REST stock provider (the `fakeProvider` shape in tests/round-c1/fake-rest.ts with your provider's address, key name and paths), publish | Saved; an http address or a pasted key is refused | RDC1-001 | Y (unit) | — |
| 2 | Put the key in the vault under the key name | Key not shown back | RDC1-006 | Y (server test) | — |
| 3 | Editor › Elements › Photos › Stock | Your provider is a choice beside Pixabay and Pexels | RDC1-008 | Y | — |
| 4 | Home: "Make a documentary about old forts, 1 minute, in English" | AI mode, Brief card with "Pictures and footage" | RDC1-067 | Y | f3-brief-media.png |
| 5 | Pick "Use only my files", Make the plan, Approve | The Assets card asks for every file; no "Make it here" | RDC1-067 | Y | f3-only-mine-assets.png |
| 6 | New Video: same message, leave Pictures and footage to Director, paste a link in "A video or page like this" (turn on director.web first) | "Reading the page you linked", then the plan | RDC1-068 | Y (fixture page) | — |
| 7 | Ask for an explainer with a new graphic (needs a real model) | "Drawing sample frames of the new graphics…" with Stop, then the Plan card | RDC1-064 | Y (scripted) | f2-checking.png |
| 8 | Press Stop once while it says that | "I stopped making the plan. Nothing was charged…"; the Brief stays | RDC1-065 | Y | — |
| 9 | Approve, Build | Scenes arrive; the stage shows content | RDC1-042 | Y (scripted) | proof1-explainer-t2.png |
| 10 | Built card › Review & swap media | Each file says Picked by AI, its credit line, "n other choices" | RDC1-066 | Y | f3-picked-by-ai.png |
| 11 | Swap one, then Ctrl+Z | The other file, one step; Undo brings the first back | RDC1-066 | Y | f3-alternatives.png |
| 12 | Add a voice and a captions provider (kinds text-to-speech, speech-to-text, with a `speech` part) and plan a narrated video | The narration is spoken by your voice; Media › Details shows its licence and credit | RDC1-073 | Y (fixtures) | f4-voice-captions.png |
| 13 | Turn those two off and plan again | They are not offered; captions still come from the narration text | RDC1-073 | Y | — |
| 14 | Play a video project right after an edit | Sound and picture stay together (PB-010) | PB-010 | Y | — |
| 15 | Open an old project's plan (v2 or v3) and Build video | Builds exactly as before | RDC1-010 | Y (unit) | — |

## 5. Deviations from the brief

- Speed ramp, hide and extra lanes cannot be said in a plan: no editor command exists and src/core may not change (BLOCKED, D-427).
- The schema version of Platform Config stays 1: new fields have defaults, which is the migration (D-426).
- P2R2-016 and P2R2-017 state the Round C1 prompt behaviour; the isolation test lists `src/tools` with the Director-side code (D-425).
- The vision check's problems after its one fix are notes, not a refusal (D-432).
- LAY-048 and LAY-004: the tests wait for the expand animation before aiming; the assertions are unchanged (D-431).
- The Projects dialog sandbox baseline was refreshed for the intended new cover (D-431).
- No sub-agents were used.

## 6. Decisions made

D-425 to D-435 in docs/DECISIONS.md.

## 7. Not tested, known gaps, risks

- **No real model and no real provider were used.** Every Director answer was the offline model with scripted answers; every provider (stock, web, voice, captions) was a fake HTTP server or fixtures. The real REST path ran only against local servers with a test DNS and transport seam. Vision was tested only with a scripted model and the request shape (the gateway's vision extra is proven by P3W-018 against fake providers).
- DEV-012's baselines on the CI image are BLOCKED until the UI phase.
- PB-010 and other audio-timing tests can still flake under heavy parallel load in the sandbox (known since 2026-09-24).
- Two `tests/blocks/worker.test.ts` tests fail in this sandbox on the Round B base too (`Cannot read properties of undefined (reading 'instantiate')`); src/blocks was not changed.
- A v4 build downloads REST picks in the browser from the provider's file URL (only search runs on the server).
- Sample frames show each new graphic alone at full canvas, not at its place in the plan; a graphic placed off the canvas by the plan is caught by the layout validator instead.
- Hindi strings were added for every new line; the Hindi wording was not reviewed by a native speaker.

## 8. Architecture and contract impact

- Schema version change: none (schema 9). Platform Config schemaVersion 1 with defaulted new fields (`mediaProviders`, the descriptor's `speech` part, `director.assets.briefChoices`, the Brief block `media`).
- New dependencies: none.
- Added: src/tools/*, src/tools/speech.ts, src/platform-config/media-providers.ts, src/video-plan/{validate-v4,defs,build-v4,resolve-v4,layout-check}.ts, src/director/{plan-loop,brief-media}.ts, src/ai-mode/graphic-edit.ts, src/render/first-content.ts, src/ui/{plan-media,registry-providers,render-frames,sample-frames}.ts, server/tools.ts, tests/round-c1/*, e2e/round-c1-*.
- Contracts touched: none. The network guard gained a POST that follows no redirect.

## 9. Ledger and backlog

- RDC1-001 to RDC1-097 (45 rows), all Verified; RDC1-042 and RDC1-005 reworded (D-435).
- Tests changed to state new behaviour (not weakened): P2R2-016, P2R2-017, P2R1-021, RDC1-005 (tool list), LAY-048 and LAY-004 (wait for the animation).

## 10. Git

- Branch `claude/round-c1-power`, draft PR #54 to `claude/round-b-ai-mode`.

## Owner tick-list (owner fills this in and sends it to Claude)

| ID | OK / BUG / MISSING / CHANGE | One sentence |
| --- | --- | --- |
| | | |
