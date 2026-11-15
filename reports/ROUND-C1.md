# Report: Round C1, the AI's power (15 Nov 2026)

## 1. Summary

The AI can now use what the editor can do, and find what it needs without a fixed list of providers. The owner adds stock, icon, sticker, music, sound and web-search providers as data in Platform Config (a REST provider needs no code); they run on the gateway with the keys there, and the Director learns them from a capability sheet built from the live config. A Video Plan v4 can say effects, colour grade, blend, chroma key, masks, transitions, keyframes, presets, speed, trim, sound, fonts, fit, groups, lock and names, and can define its own new graphics in code (Tier B and Tier C), which become code layers with their own controllers and are saved to the Project's AI library. A v4 build finds footage, photos, icons, stickers and music on its own, with alternatives and credit lines. Older plans build exactly the same project as before. Four proof videos were built through the Director in AI mode with no hand edits.

Still not possible: rendering sample frames in the browser for the AI to look at (the step exists in the planner but AI mode supplies no frames), a vision-model check, and anything against a real model or a real provider: **no real model and no real provider were used in this round**; every answer came from scripted offline answers, fake providers on local servers or fixtures.

## 2. Audit (C1.0)

### 2.1 Editor capability → Video Plan

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

### 2.2 Where media and speech sources were called (before this round)

| Source | Called from | Director reach | Plan builder reach |
| --- | --- | --- | --- |
| Pexels, Pixabay, Iconify, Freesound | src/providers, editor Stock panels (person's keys in Settings) | No | Only for a pick the person kept (FIX7) |
| Gateway media models (OpenAI images, ElevenLabs, video jobs) | src/gateway/adapters/media.ts | Studio and the Assets card | No |
| Captions (offline Whisper, cloud STT) | src/speech, src/captions | No | Captions from narration text |
| Voices (cloud TTS) | src/speech | No | `voice` dep in runPlanBuild |
| Sound pack, catalog sounds | library client | No | `sound` dep (catalog sfx, own files) |

After this round the Director and the v4 builder reach every enabled provider by kind through `searchMedia`. Captions and voices still use the existing engines (not moved to the registry).

### 2.3 FIX7 origin

`git log -S` finds commit 5f59e38 (2026-10-29) "feat(plan): missing assets are never auto-fetched; all-or-nothing build with rollback and a missing-files list [FIX7-001..003]". No brief file or decision gives a further reason. v2 and v3 plans keep that rule; v4 replaces it (D-427).

## 3. Scope and results

| ID | Item | Status | Proof or reason |
| --- | --- | --- | --- |
| C1.0 | Audit table and FIX7 origin | DONE | reports/ROUND-C1.md section 1; D-427 |
| C1.1a | Registry in config and migration | DONE | RDC1-001 |
| C1.1b | REST descriptor runtime and SSRF guard | DONE | RDC1-002, RDC1-006 |
| C1.1c | searchMedia | DONE | RDC1-003 |
| C1.1d | Capability sheet v2 from live config, provider added and removed | DONE | RDC1-004, RDC1-006 |
| C1.1e | src/tools DOM-free and Node test | DONE | RDC1-005 |
| C1.1f | Editor Stock panels read the registry | DONE | RDC1-008 |
| C1.2a | Plan v4 fields, each mapped or BLOCKED | DONE (speed ramp, hide and extra lanes BLOCKED: no command in the editor, core may not change) | RDC1-011, RDC1-012; docs/video-plan.md |
| C1.2b | defs.blocks Tier B and C with controllers in the right panel | DONE | RDC1-013, RDC1-050 |
| C1.2c | Defs saved to the AI library and Project kit | DONE (unit and build path; the AI panel listing was not separately asserted in e2e) | RDC1-013, RDC1-005 |
| C1.2d | Old plans build the same project | DONE | RDC1-010 |
| C1.2e | Headless Node build | DONE | RDC1-012 |
| C1.2f | Docs | DONE | docs/video-plan.md v4, cheatsheet regenerated, docs/CAPABILITY-SHEET.md |
| C1.3a | Asset rule from the brief | DONE (plan field `meta.assets`; the Brief card does not yet write it: the plan carries it when the model writes it) | RDC1-014, RDC1-060 |
| C1.3b | Auto-pick with alternatives and picked by AI | DONE (Review & swap shows the alternatives as before; a "picked by AI" label in Review & swap was not added) | RDC1-014, RDC1-051 |
| C1.3c | Footage cut | DONE | RDC1-012 |
| C1.3d | Not-found flow | DONE (the reason names rewording, a code graphic or an AI picture; Director does not yet turn it into offer buttons) | RDC1-060 |
| C1.3e | Icons, stickers, sounds, music, captions, voices by kind | DONE for icons, stickers, music (RDC1-051, RDC1-052); captions and voices still use the existing engines, not the registry |  |
| C1.3f | Licences kept | DONE | RDC1-014, RDC1-008 |
| C1.3g | Limits and credits counted | DONE for paid searches (RDC1-003, RDC1-006); storage of imported media counts through the existing import |  |
| C1.4a | searchWeb and fetchPage with rules and SSRF guard | DONE | RDC1-020 |
| C1.4b | Injection test | DONE | RDC1-021 |
| C1.4c | Research step | DONE (the Brief card's reference link is not yet routed into it) | RDC1-030 |
| C1.5a | Authoring guides via config | DONE (slot `director.authoring.guide`; the owner fills the text) | RDC1-033 |
| C1.5b | Repair and fix loop | DONE | RDC1-031 |
| C1.5c | Plan card shows New graphic and cost | DONE | RDC1-050 |
| C1.5d | AI mode edit of a graphic as one undo step | DONE | RDC1-034, RDC1-050 |
| C1.6a | Layout validator | DONE | RDC1-040 |
| C1.6b | renderFrames | NOT DONE (interface and tool only; no browser implementation) |  |
| C1.6c | Vision check | NOT DONE |  |
| C1.6d | Real thumbnails, no black first frame | DONE for scene posters, the cover, the AI card and the stage | RDC1-042, proof screenshots |
| C1.6e | Mock text inside the frame | DONE | RDC1-043 |
| C1.6f | LAY-048 | NOT DONE (fails only in CI, passes here; cause not found) |  |
| C1.6g | DEV-012 reason written | DONE (BLOCKED until the UI phase) | D-430 |
| C1.7a | Rulebook v2 | DONE | RDC1-033 |
| C1.7b | Playbook slots | DONE | RDC1-033 |
| C1.7c | Video types from config | DONE | RDC1-033 |
| P | Four proof videos | DONE | RDC1-050 to RDC1-053 |
| R | Rough-use tests | DONE for the listed tool, plan and build cases (RDC1-002, 003, 020, 021, 030, 031, 060); NOT DONE: reload at each step, cancel during code check, server unreachable for tools in e2e |  |
| G | Config-first, server-side keys and limits, bundle, English and Hindi | DONE | D-425 to D-427 |

- RDC1 rows: 26 added, all Verified by tests named in the ledger.
- Not done, with reason: browser renderFrames and the vision check (time; the interfaces exist), LAY-048 (CI-only failure, not reproduced), reload at each step / cancel during code check / unreachable server e2e for the new flows, "picked by AI" label in Review & swap, Brief card writing `meta.assets`, the Brief card's reference link routed into research, captions and voices through the registry.

## 4. Checks

VERIFY_PLACEHOLDER

Bundle (measured by `scripts/assert-editor-bundle.mjs`): editor first load Round B 6,026,000 bytes in 8 chunks; Round C1 5,989,007 bytes in 9 chunks (plan build, Review & swap and the v4 builder became lazy); with lazy chunks 8,295,276 → 8,364,733 bytes. The check now fails above 6,026,000 bytes or if Round C1 code is in the first load.

## 5. Proof videos (real Chromium 141, offline model with scripted answers, fake providers)

| # | Video | Test | Screenshots and layer list |
| --- | --- | --- | --- |
| 1 | Explainer: Tier B "Rising bars" and Tier C "Orbit ring", each in two scenes, captions; controller "Bars" dragged (one step), Undo; offline "make a new graphic" answered in one sentence; "make it faster" proposal applied, undone, redone | RDC1-050 | reports/round-c1/proof1-explainer-t1..t3.png, -controller.png, -layers.txt |
| 2 | Documentary: river footage (filter + grade) and fort photo from the REST provider added in config (the editorial-only gate photo passed over), map pin icon, calm piano music, lower third, captions; "Specks" dragged | RDC1-051 | reports/round-c1/proof2-documentary-* |
| 3 | Reel 9:16: kinetic title block, glow and vibrant filter, clip at 2x, zoom pixel transition, sticker with rotation keyframes, music; "stagger" dragged | RDC1-052 | reports/round-c1/proof3-reel-* |
| 4 | Recorded-video enhance: the person's own talk-recording.webm found by name, scale keyframes, lower third, chroma-keyed map overlay, captions; ink circle "size" dragged | RDC1-053 | reports/round-c1/proof4-recording-* |

Seen when looking at the screenshots: the Assets card first said "Waiting for files" for media the build had already found (fixed: v4 asks only for AI-made pictures); the stage was blank after a build because everything faded in from 0:00 (fixed: first moment with content); in proof 4 the captions cover the lower third (now a layout warning; the plan in the test still does it).

## 6. Try-it script for the owner (about 10 minutes)

| # | Do this | Expect | ID | Ran it | Screenshot |
| --- | --- | --- | --- | --- | --- |
| 1 | Owner App › Platform Config: add a REST provider (copy the `fakeProvider` shape from tests/round-c1/fake-rest.ts with your real provider's address, key name and paths), publish | Saved; an http address or a pasted key is refused | RDC1-001 | Y (unit) | — |
| 2 | Put the key in the vault under the key name | Key not shown back | RDC1-006 | Y (server test) | — |
| 3 | Editor › Elements › Photos › Stock | Your provider is a choice beside Pixabay/Pexels | RDC1-008 | Y | — |
| 4 | Search with it, click a result | Added with its credit and licence (Media › Details) | RDC1-008 | Y | — |
| 5 | Home: "Make a documentary about <topic>, 1 minute, in English" | AI mode, Brief card | RDC1-051 | Y | proof2-documentary-t1.png |
| 6 | Make the plan (with a real model) | Plan card; new graphics listed with their cost, no code or JSON | RDC1-050 | Y (scripted) | proof1-explainer-t1.png |
| 7 | Approve, Build | Scenes arrive; stock picked by Director; stage shows content, not black | RDC1-014, RDC1-042 | Y (scripted) | proof2-documentary-t1.png |
| 8 | Review & swap | Each found picture with up to four alternatives | RDC1-014 | N | — |
| 9 | Select a new graphic, Controls tab, drag a slider | Canvas changes; one undo step | RDC1-050 | Y | proof1-explainer-controller.png |
| 10 | Say "make it faster" with the graphic selected | A proposal; Apply is one step | RDC1-050 | Y | — |
| 11 | Say "make a new graphic here" | With a real model: a paid card, then a proposal; offline: one sentence that it needs the model | RDC1-034 | Y (offline only) | — |
| 12 | Open AI › the "New graphics" pack | The plan's graphics are there for reuse | RDC1-013 | N | — |
| 13 | Turn your provider off in Platform Config, plan again | It is not offered or used | RDC1-004 | Y (unit, server) | — |
| 14 | Turn on `director.web`, ask Director about a topic with a link | Research step reads the page (needs a web-search provider and a real model) | RDC1-030 | N (no real model) | — |
| 15 | Open an old project's plan (v2/v3) and Build video | Builds exactly as before | RDC1-010 | Y (unit) | — |

## 7. Deviations from the brief

- Speed ramp, hide and extra lanes cannot be said in a plan: no editor command exists and src/core may not change (BLOCKED, D-427).
- The schema version of Platform Config stays 1: new fields have defaults, which is the migration (D-426).
- The planner prompt test P2R2-017 now states that an owner prompt saved before Round C1 gets the rulebook, playbook, authoring and research sections appended; with their placeholders, the owner's text is used exactly. P2R2-016 compares the docs with the code part of the sheet (the live part depends on config).
- The isolation test lists `src/tools` with the Director-side code (D-425).
- No sub-agents were used.

## 8. Decisions made

D-425 to D-430 in docs/DECISIONS.md.

## 9. Not tested, known gaps, risks

- **No real model and no real provider were used.** Every Director answer was the offline model with scripted answers; every provider was a fake HTTP server or fixtures. The real REST path ran only against a local server with a test DNS and transport seam.
- Not built: browser `renderFrames` (so AI mode sends no sample frames and the frame-fix step never runs there), the vision check, a "picked by AI" label in Review & swap, the Brief card writing `meta.assets`, the reference link feeding research, captions and voices through the registry.
- Not tested in e2e: reload at each new step, cancel during code check or stock download, server unreachable for the tools, the gateway path in the browser (unit and server tests only), web tools with a real search provider.
- LAY-048 still fails only in CI (with LAY-004); passes here; cause not found.
- Two `tests/blocks/worker.test.ts` tests fail in this sandbox (`Cannot read properties of undefined (reading 'instantiate')` in the worker build); src/blocks was not changed; see section 4.
- A v4 build downloads REST picks in the browser from the provider's file URL (only search runs on the server).
- DEV-012 baselines: BLOCKED until the UI phase (D-430).

## 10. Architecture and contract impact

- Schema version change: none (schema 9). Platform Config schemaVersion 1 with defaulted new fields.
- New dependencies: none.
- Files added: src/tools/*, src/platform-config/media-providers.ts, src/video-plan/{validate-v4,defs,build-v4,resolve-v4,layout-check}.ts, src/director/plan-loop.ts, src/ai-mode/graphic-edit.ts, src/render/first-content.ts, src/ui/{plan-media,registry-providers}.ts, server/tools.ts, tests/round-c1/*, e2e/round-c1-*.
- Contracts touched: none.

## 11. Ledger and backlog

- Added RDC1-001 to RDC1-060 (26 rows), all Verified.
- Tests changed to state the new behaviour (not weakened): P2R2-016, P2R2-017 (prompt from config with the power sections), P2R1-021 (src/tools classified).

## 12. Git

- Branch `claude/round-c1-power`, draft PR to `claude/round-b-ai-mode`.
