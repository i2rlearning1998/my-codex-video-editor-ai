# Report: J, the composition adapter for Styles (2026-10-17)

## 1. Summary

- An AI-authored Creator Pack `composition` now becomes a real project, headless and deterministic. The result says what is still missing (empty slots, the voice-over, captions, camera moves) and lists warnings, so the AI connector and the UI know what to ask for.
- Branch `claude/j-composition` from `claude/b1-styles-brief`, with `origin/codex/c2-engines` merged. The merge had no conflicts and typechecks.
- Engine only: no UI file was changed. `src/ui/library-insert.ts` is imported, not edited.
- Schema unchanged; no new npm dependencies.

## 2. Done / not done

| Step | Done | Not done |
| ---- | ---- | -------- |
| 1 Read and extend | The composition data gains optional `slots`, `voiceOver` and `captions` (Creator Pack schema; old packs unchanged). `projectComposition` is shared by the offline check and the adapter. | — |
| 2 Media slots | `compositionSlots`, `createSlotFills` (`fillSlot`, `clearSlot`, `fillOf`, `listUnfilledSlots`, `toRecord`), `fillProblem`. A fill is a library item, an imported stock item or the person's file. Wrong types are refused with a reason. Empty required slots are typed `missing` entries and dashed frames; optional ones are left out with a warning. | A library fill uses the library item's own size and length. |
| 3 Applies | Scenes, text, shapes, code blocks, backgrounds (Tier A); media and audio slots; library references (by id; a missing id is a warning with the id and name); FX (`SET_CLIP_FX`); scene transitions (reserved marker, clamped); the voice-over (one clip per scene, cut in order); captions through a thin optional hook; the theme (given, or the style's built-in theme); style checks. | Camera moves (projects have no camera): listed in `missing`. The adapter does not run the speech engine or a captions engine; it places what they produce. |
| 4 Build | `buildProjectFromComposition(composition, {slotFills, style, theme, parameters, library, captions, name, now})` → `{project, warnings, missing, errors}`, validated against the current schema. The same input gives the same project byte for byte. | — |
| 5 Tests and docs | `tests/composition/adapter.test.ts`: documentary mini fully filled, empty slots, a missing library item, wrong fills, a library logo fill with a theme and style, determinism (snapshot), an invalid composition, and the CLI. Fixtures: `tests/fixtures/compositions/documentary-mini.json` and `logo-reveal.json`. docs/COMPOSITION-ADAPTER.md has the steps for the UI and for the AI connector. | — |
| 6 CLI | `npm run composition:build -- <pack> [--json] [--out=dir]`; example `examples/creator-packs/composition-documentary-mini.json`. | — |

## 3. Checks

- The targeted unit tests all pass:
  - composition, creator-pack, ai-spec, x2-import, b1-brief and t2-ai-brief: 147 tests;
  - Codex's merged speech, text-engine, recorder and audio tests: 95 passed, 1 skipped.
- Typecheck and Prettier pass (`docs/TEXT-ENGINE-API.md` from the merge was re-formatted so the format check passes).
- No full verify and no e2e, as the brief says. No user-visible behaviour changed, so no e2e or ledger row is added.

## 4. Exported API (`src/composition`)

`buildProjectFromComposition`, `compositionDataOf`, `compositionSlots`, `createSlotFills`, `fillProblem`, `emptySlotProperties`, `buildCompositionsFromPack`, `buildReport`, `VOICE_OVER_SLOT`, `BUILD_EPOCH`, and the types `SlotFill`, `SlotFills`, `FillResult`, `CompositionSlot`, `SlotType`, `BuildOptions`, `BuildResult`, `BuildWarning`, `BuildMissing`, `CaptionsHook`, `CaptionsContext`, `CompositionScene`, `PackBuild`. Also `projectComposition` and `compositionDataSchema` / `CompositionData` (src/creator-pack), and the `item` hook of `tierACommands`.

## 5. What the UI agent must wire

- **Slot filling panel:** one row per slot (type icon, hint, Required badge). Each row offers three sources: the library (image and logo slots), stock (search, then `importStockItem`, then the media import) and the person's file (the media import). Call `fillSlot` and show its reason when it refuses.
- **Voice-over:** Make voice-over runs `synthesizeToMedia` with the `missing` request, imports the result and fills `voice-over`.
- **Missing-asset report:** before and after Build, show `missing` as a checklist and `warnings` as a list. Let the person build anyway.
- **Open the result:** `engine.load(project)`. Empty-slot frames carry the string property `compositionSlot` for a later Replace.
- **Captions:** pass the captions engine as `options.captions` once that engine is merged.

## 6. Decisions

D-269.

## 7. Not tested, gaps, risks

- No browser test: the adapter has no UI yet.
- Code blocks inside a composition go through Tier A as before; the fixtures have none.
- Library items sit on top of the spec's items, not between them.
- Theme application recolours text without a manual colour (T1 rule), which can override colours the AI chose.
- Asset bytes are not checked: a filled asset must already be in the media store.

## 8. Git

- Commits: the merge of `codex/c2-engines`, the adapter and fixtures, the pack builder and CLI, then the docs and this report. One draft PR to `claude/b1-styles-brief`.
