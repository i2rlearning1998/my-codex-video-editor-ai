# Composition adapter (J)

A Creator Pack `style` (docs/STYLES.md) tells the AI how to make a video. The AI answers with a Creator Pack whose `composition` item describes the whole video. The adapter (`src/composition`) turns that composition into a real, validated project, headless, through the ordinary Command Bus. It never fetches anything, never runs a provider and never changes the schema.

## The composition item

`item.type: "composition"`, `item.data`:

| Field       | Meaning                                                                                                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spec`      | A Composition Spec v1 (docs/AI-SPEC.md): canvas, parameters, asset slots, blocks, scenes with text, shapes, media slots, audio slots, code blocks, FX, camera moves and transitions. Scene items may also be library references `{"library": "pack/item"}` (CP-D7). |
| `slots`     | Optional, per spec asset slot: `type` (`image`, `video`, `audio` or `logo`; a logo is an image slot), `hint` (what to put there) and `required` (default: true when a scene item uses the slot).                                                                    |
| `voiceOver` | Optional `{text, lang, voiceId?, required?}`: a narration the speech engine makes. It is the slot `voice-over` (audio).                                                                                                                                             |
| `captions`  | Optional `true`: captions over the voice-over, made by the captions engine.                                                                                                                                                                                         |

All three new fields are optional; an older composition is unchanged.

## API (`src/composition/index.ts`)

- `compositionDataOf(input)`: reads a Creator Pack composition item, its `data`, or a bare spec.
- `compositionSlots(data)`: every slot (`id`, `type`, `hint`, `required`), the voice-over last.
- `createSlotFills(data, initial?)`: `fillSlot(slotId, fill)` → `{ok}` or `{ok:false, reason}`, `clearSlot`, `fillOf`, `listUnfilledSlots()`, `toRecord()`.
- A `SlotFill` is one of:
  - `{kind: 'library', id, replace?}`: an editor library item (image and logo slots only); it is inserted at the slot's box, on top of the scene. With `replace: true` it takes the slot's place instead: the slot item's start and length, and its lane goes just behind the next item the scene draws after the slot.
  - `{kind: 'stock', asset, provider, itemId}`: a stock item already imported (`importStockItem`, then the media store) as an asset record; the provider and item are kept in the asset's metadata.
  - `{kind: 'file', asset}`: the person's file, already imported as an asset record.
- `buildProjectFromComposition(composition, options)` → `{project, warnings, missing, errors}`. Options: `slotFills` (a record or a `SlotFills`), `style`, `theme`, `parameters`, `library(id)`, `captions` (the hook below), `name`, `now`.
- `buildCompositionsFromPack(packText, options)` and `buildReport(build)`: every composition of a pack, with the pack's own style, theme and native items (as `pack/item` library ids).
- `emptySlotProperties(slot)`: the empty-slot frame's shape properties.
- CLI: `npm run composition:build -- <pack file> [--json] [--out=dir]`.

## What is built, and how

| Composition part                                     | Built with                                             | Notes                                                                                                                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scenes, text, shapes, scene backgrounds, code blocks | The Tier A importer (`tierACommands`, D-233)           | One scene per spec scene, in order; ids are the plan's with the suffix `_c`.                                                                                                                                                         |
| Media slots (image, video, logo)                     | Tier A with an item hook                               | Filled: the layer and clip point at the asset. Empty and required: an empty-slot frame (a dashed outline over a faint fill, a shape layer with the string property `compositionSlot`). Empty and optional: left out, with a warning. |
| Audio slots (music, sounds)                          | Tier A with the hook                                   | Filled: an audio clip. Empty: left out (no picture); reported when required.                                                                                                                                                         |
| Library references and library fills                 | `libraryCommands` (src/ui/library-insert.ts, DOM-free) | A reference spans its scene, centred; a fill sits at the slot's box. A missing id is a warning with its id and name; a template cannot sit inside a scene (warning). They are added after the spec's items, so they are on top.      |
| FX                                                   | `SET_CLIP_FX` (D-189)                                  | The spec's FX stack on the item's clip. The editor seeds effects from the clip id, so the spec's FX seeds are not kept.                                                                                                              |
| Transitions                                          | The reserved scene-transition marker (D-199)           | Clamped to what the two scenes allow (warning); an unknown id is a warning.                                                                                                                                                          |
| Voice-over                                           | Audio layers and clips                                 | One clip per scene, cut from the narration in order (`sourceIn` = the scene's start), so a joined export plays it continuously. A narration longer than the video is cut (warning).                                                  |
| Captions                                             | The `captions` hook                                    | The adapter does not make captions. With `captions: true` and no hook, `missing` lists them.                                                                                                                                         |
| Camera moves                                         | —                                                      | Not built: projects have no camera yet (src/camera is not wired). Each move is in `missing` as a feature.                                                                                                                            |
| Theme                                                | `applyThemeCommands` (T1)                              | `options.theme`, else the style's `look.themeId` (a built-in theme). It sets scene backgrounds, text fonts and colours and slotted shape fills.                                                                                      |
| Style                                                | Checks only                                            | `output.aspect` and `output.fps` against the canvas (warnings); `look.palette.background` is the background when no theme is given.                                                                                                  |

`missing` (typed) holds what someone must still supply: `slot` (a required slot), `voice-over` (with the request to give the speech engine), `captions` and `feature` (camera moves). `warnings` (`{code, message}`) holds what was left out or changed. An invalid composition gives `project: null` and `errors`; nothing throws for empty slots or missing library items.

Deterministic: ids come from the plan, fixed names or a seeded generator (the spec id); `now` defaults to a fixed time. The same input gives the same project byte for byte (tested with a snapshot). The project validates against the current schema; the schema version is not changed.

## Steps for the UI

1. Read the composition (`compositionDataOf`) and make `createSlotFills(data)`.
2. Show `fills.slots`: each with its type icon, hint and a Required badge. For each slot offer the library (image and logo), stock (search a provider, `importStockItem`, then the media import to get an asset record) and the person's file (the media import). Call `fillSlot`; show its `reason` when it refuses.
3. For the voice-over slot, offer Make voice-over: `synthesizeToMedia(text, {lang, voiceId})` from src/speech, import the result as an audio asset, then `fillSlot('voice-over', {kind: 'file', asset})`.
4. Call `buildProjectFromComposition(data, {slotFills: fills, style, theme, library, captions})`. Show `missing` as a checklist (what is still empty) and `warnings` as a list; let the person build anyway: empty required slots are frames they can replace later.
5. Open the result with `engine.load(project)` (a validated session boundary) or add its scenes to the open project.

## Steps for the AI connector

1. Send the brief (docs/BRIEF-FORM.md) with the style.
2. Read the reply as a pack; run `checkPack`, then `buildCompositionsFromPack(text, {library})`.
3. Feed `errors` back to the AI as a repair prompt. Ask the person for every `missing` slot (or fill it from the library and stock first, per the style's asset policy). Make the voice-over with the speech engine. Build again with the fills.
4. `npm run composition:build -- reply.txt --json` does steps 2 and 3's reading from the command line.

## Gaps

- Library items are placed on top of the spec's own items, unless a slot fill says `replace: true`; a library reference (`{library}`) is always on top.
- A library fill uses the library item's own size and length, not the slot's.
- Captions need the captions engine's hook; the adapter has none of its own.
- Asset bytes are never checked here: a filled asset must already be in the media store.
