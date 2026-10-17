# Report: FINAL1, integration part 1 (engines; 2026-10-17)

Branch `claude/final-1` from `claude/j-composition` (PR #39). Engine only: no UI file was edited for this part. Schema 9.

## Steps

| Step | Done | Not done |
| ---- | ---- | -------- |
| 1 Merge engines | `codex/c3-render-effects` (masks, blend, chroma) and `codex/c3-media-probe` (probe, rotation, VFR, relink) merged without conflicts; their unit tests pass. One migration chain 4 → 9; `tests/final/migrations.test.ts` opens a fixture from each schema 4 to 8 and refuses a future one. | — |
| 2 Captions and nesting | Built by a sub-agent in its own worktree, then merged here: `src/captions` (auto caption via an injectable STT, five style presets, layers via commands, cue editing, re-split, SRT/VTT, karaoke, the composition captions hook) and `src/nesting` (nest and flatten as one undo step, time mapping with trim and speed, cycle and depth 5 guard, enter/exit helpers). docs/CAPTIONS-API.md, docs/NESTING-API.md, D-270, D-271. | Nested clips: inner presets, effects and transitions are kept but not drawn; audio cannot be nested; flatten refuses a transformed, faded, reversed or frozen nested clip. Captions: no text outline or shadow (styles use a box). |
| 3 Camera | Optional `composition.camera` (keyframable x, y, zoom, rotation and a seeded shake), `SET_COMPOSITION_CAMERA`, presets as data, drawn in the shared preview/export path, joined export, composition camera moves applied. docs/CAMERA-API.md, D-272. | No parallax (item depth); FPS changes do not re-snap camera keyframes. |
| 4 Composition decisions | Themes keep the colours the AI set (already marked manual by the core; tested). `replace: true` on a library slot fill (timing and stacking place; tested). D-273. | — |
| 5 Local speech | One attempt: huggingface.co is refused by the network policy, so no official hash could be pinned; no permissive English TTS without eSpeak. Engines stay `unavailable`; the owner's exact steps are in docs/SPEECH-API.md (FINAL1 Step 5). D-274. | Both local engines. |

## Merge conflicts

- None in git. The real merge fallout was older tests still expecting schema 8 after Codex's 8 → 9 audio bump (already failing on the base). They now expect 9. The generated fixtures were regenerated at 9, and the old v8 code-layer file is kept as `v8-code-layer.json` for the migration test (D-275).
- The sub-agent's branch merged cleanly over the camera work. Its timeline test edits overlapped mine with identical changes.

## Final schema

9. The scene camera is an optional field (D-181 precedent), so there is no bump.

## API for the UI pass

- **Captions:** `autoCaption`, `captionCommands`, `CAPTION_STYLES`, `editCaptionCommands`, `resplit`, `toSrt`, `parseSrt`, `toVtt`, `parseVtt`, `karaokeCommands`, `createCaptionsHook`.
- **Nesting:** `nestClips`, `flattenNested`, `enterNested`, `exitNested`, `nestedEditView`, `isNestedClip`, `MAX_NEST_DEPTH`.
- **Camera:** `SET_COMPOSITION_CAMERA`, `cameraPreset`, `CAMERA_PRESETS`, `sceneCameraAt`, `cameraFromTracks`.
- **Composition:** `createSlotFills`, `buildProjectFromComposition` (slot fills may use `replace`), `buildCompositionsFromPack`.
- **Speech status:** local engines report `unavailable` with a plain reason.

## Checks (run once at the end)

- `npm run typecheck` (both configs): passed. `npx prettier --check .`: passed.
- `npx vitest run`: **1163 passed, 2 failed, 1 skipped** (117 files). The 2 failures are the known sandbox-only `tests/blocks/worker.test.ts` tests ("Sandbox unavailable").
- No e2e, as the brief says. The known e2e flakes (LAY-004, LAY-038, ANI-003, PB-010) and pre-existing failures (TXT-040, CV-044/045) were not run.

## Risks

- The camera moves the picture but not hit-testing; the UI must make clear that edits are at the resting place, or turn the camera off while editing.
- Nested clips rely on a `nested` record in clip metadata. The core `UNGROUP` must not be offered on them; use `flattenNested`.
- The J4 text editor writes only `text`; the UI must call `editCaptionCommands` on commit, or a caption's stored words go stale.
- No live STT, TTS, network or device was used; all tests use fakes.
