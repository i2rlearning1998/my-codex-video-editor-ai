# Creator Pack and Controllers spec

Owner goal: the AI is a CREATOR, not only a user of the tool's libraries. For every thing a video needs it asks "does the tool already have this?". Yes: use it. No: write it (code or data), REGISTER it in the matching library so it becomes a normal reusable layer/template, then use it. Libraries and templates therefore grow with every video, with no quality reduction. Every complex thing also gets simple CONTROLLERS (sliders, buttons, colour pickers) so a beginner changes it the way an editor would change keyframes; editors can still open the real keyframes. Revision 1, 2026-10-15. Source of truth for the Codex task `codex/creator-pack` and the Claude Code task `claude/p-series`.

Phase plan: NOW everything is authored in the Claude chat and imported into the tool as a Creator Pack file (for testing). LATER the same pack format comes from the API in the tool's chat panel. Nothing in this spec may depend on which of the two produced the pack.

## 1. The loop: Create -> Register -> Use
1. **Check**: the AI first reads the tool's catalog (section 8) and decides per needed item: exists / near match (use it with other params) / missing.
2. **Create** (only for missing items): the AI writes a pack item (section 3). Authoring preference stays A > B > C from CODE-TIERS-SPEC: native data if the thing can be built from layers, else a Block, else free code. Always expose controllers (section 5).
3. **Gate**: the importer validates and render-checks each item (section 6). An item that fails is rejected with a plain-language reason; the rest of the pack still imports.
4. **Register**: accepted items are stored in the user's library (section 4) and appear in the normal panels with a "Creator pack" badge.
5. **Use**: a `composition` item (section 3.7) places the finished video/scene on the timeline using library items by id. Any item can also be dragged or clicked in from the panels like any other library item.

## 2. File format ("Creator Pack text", `.creatorpack.txt` or `.json`)
Two accepted forms. Both produce the same in-memory pack.
- **Pure JSON**: one object (section 3) with every code string inline. Used by tools and by the API.
- **Pack text** (for authoring in chat, no escaping of code): a JSON manifest, then named raw sections:
```
=== PACK ===
{ "format": "creator-pack", "version": 1, "pack": { ... }, "items": [ { "id": "motion-sparks", "type": "motion", "data": { "source": {"$ref": "sparks"} } } ] }
=== SOURCE sparks ===
export default { meta: {...}, init(){}, renderFrame(){} }
=== END ===
```
`{"$ref": "name"}` is replaced by the section text. Unknown, duplicate or unused sections are errors. Sizes: pack text at most 4 MB, one source at most 1 MB, at most 200 items per pack. Drag and drop of the file, a paste dialog, and the existing Import menu ("Import creator pack") all use one parser.

## 3. Pack object and item kinds
```
{ "format": "creator-pack", "version": 1,
  "pack": { "id": "kebab-id", "name": {"en","hi"}, "version": 1, "author": "ai"|"human", "createdWith": "claude-chat"|"api"|"codex", "notes": "short text" },
  "items": [ ... ] }
```
Item common fields are the library fields: `id` (lower case, digits, dashes, 3 to 64), `name {en, hi}`, `tags` (max 12), `type`, `data`, plus optional `thumbnailTime`, `controls` (section 5; for `motion` the controls are `meta.params` and `controls` must be absent, for `preset` they are `data.controls`), `needs` (ids of other items it uses). Full ids are stored as `<packId>/<itemId>`.

Existing library kinds (schema in `src/library/schema.ts`, unchanged, now also accepted inside a pack): `shape`, `background`, `text`, `template`. New kinds:

3.1 **`motion`** (animation as a layer): `data = { tier: 'B'|'C', source, meta }` exactly the code-layer contract (CODE-TIERS-SPEC 3). `meta.params` ARE the controllers. Registered as a code-layer template under Elements > Animations (and My Templates > Code animations). Using it creates a code layer with default params.
3.2 **`preset`** (keyframe animation generator): see section 5.3. Registered under the Animate panel > "Creator" tab.
3.3 **`font`** (phase 2, not in the first build): `data = { family, style, weight, format:'woff2', data: 'data:font/woff2;base64,...', license }`. Only fonts the AI/owner may legally embed (own drawn glyph fonts, OFL). Max 300 KB per font. Registered in the font picker.
3.4 **`textStyle`** is the existing `text` kind (it may add more optional fields later); a new look is just a new item.
3.5 **`shape`**: polygons in a 100 x 100 box as today; the AI draws new shapes by computing polygons in code at AUTHORING time (the chat may run code to produce the numbers); the pack stores plain numbers only. Max 400 points per ring.
3.6 **`background`**: existing kind; animated backgrounds are `motion` items with `meta.category: 'background'` and are shown under Backgrounds too.
3.7 **`composition`** (the finished video, or a scene): `data = { spec }` where `spec` is a Composition Spec v1 document (`src/ai-spec`) whose items may reference library items by id (`{"library": "<packId>/<itemId>"}` in addition to its native item kinds). Its `parameters` are the controllers of the whole composition (title text, main colour, speed). Importing it asks: "Add as new scenes / replace current scene". Applied in ONE undo step. Anything the adapter cannot yet express (effects, transitions, camera) is applied by the same command-bus calls the editor uses (ADD effect, transitions, camera) once the adapter is extended (P-series part P4); until then the importer reports it as "skipped: not supported yet", never silently.

## 4. Registry (where accepted items live)
- Store: the user's My library store in OPFS/IndexedDB (same family as My Templates; not an undo step, per UNDO-RULES). Key = `<packId>/<itemId>`. Importing a pack with an existing `pack.id`: same version = skip, higher version = replace (after a confirm), lower = ask.
- A project keeps its own copy of every item it uses (as code layers already do), so a project opens anywhere. The library is a convenience, not a dependency.
- Panels: shape -> Elements > Shapes; text -> Text > Styles; background -> Elements > Backgrounds; motion -> Elements > Animations; preset -> Animate > Creator; template/composition -> Templates > Creator packs; font -> font picker. Every item shows a "Creator pack" badge and its pack name; Delete (soft, Restore), Rename, Export item as `.creatorpack.json` are available.
- Reverse direction (same store): "Save to my library" on any native layer/group (text style, shape, animated group) writes an item of the right kind. This spec does not build it first, but the store and kinds must allow it.

## 5. Controllers
### 5.1 One control vocabulary
A control is a `ParamSpec`, the same shape used by code `meta.params` and Composition Spec `parameters`: `{ name, label {en,hi}, type, default, group?, help? }` plus type fields. Types: `number` (min, max, step, unit), `color`, `text` (maxLength), `bool`, `select` (options), and new: `angle` (degrees, dial), `point` (x, y as fractions of the canvas, drag handle on the canvas), `range` (two numbers), `easing` (the editor's CSS curves), `media` (a slot the user fills from Media). `group` is `basic` (shown) or `advanced` (collapsed). Max 24 controls per item, max 8 shown as basic.
- Writing rules for the AI: plain beginner words ("Speed", "How many sparks", "Wave height"), never code words; each visible colour, each text string, the speed and the size/count of the main effect MUST be a control; sensible min/max so no value breaks the picture; defaults produce the best-looking result.

### 5.2 Where controls show
Right rail category "Controls" for the selected layer (for a code layer this is the existing "Animation settings", renamed Controls). Basic controls first, "More" for advanced. Live update: controllers of `preset` and of native layers apply instantly; controllers of a `motion` item re-render (Draft bake while dragging, Full on release; that fix is part of P3).

### 5.3 `preset` = a keyframe generator driven by controls
Declarative, never code. `data = { appliesTo: ['any'|'text'|'shape'|'image'|'video'|'code'|'group'], controls: [ParamSpec], tracks: [ { property, keys: [ { t, v, ease? } ] } ], loop?: {mode:'none'|'repeat'|'pingpong'} }`.
- `t` is 0..1 of the preset duration; `v` is a number or a string expression. Expressions use ONLY: numbers, `$name` (a control), `+ - * / ( )`, and the functions `sin cos min max clamp lerp abs round` plus constants `PI`, and the context values `W`, `H` (canvas px), `w`, `h` (layer px). No loops, no property access, no calls to anything else. A hand-written evaluator (no `eval`, no `Function`) parses at import; a bad expression rejects the item.
- Special controls `duration` (s), `delay` (s) and `easing` are recognised by every preset and shown automatically.
- Examples that must work: Move (angle, distance, duration, easing: x = `cos($angle*PI/180)*$distance*W`, y likewise), Spin, Pulse, Wobble, Pop-in, Orbit (circle path with radius, speed), Follow path (a `point` list control), Camera push (zoom from/to, shake), Bounce (gravity, floor, bounciness as a closed-form damped formula).
- Applying a preset writes ordinary keyframes onto the layer (the existing keyframe schema), plus `layer.metadata.preset = { id, params }` (no schema bump, D-033 pattern).
- **Sync rule (honest version)**: controls -> keyframes always. Changing a control re-generates the preset's keyframes (one undo step). If the editor changes those keyframes by hand in 2D mode, the layer is marked "Edited manually": the controls show greyed with a note and a "Reset to controls" button that regenerates and discards the manual edits (with a confirm). Controls and keyframes are never silently out of step.

## 6. Quality gate (nothing enters the library unless it passes)
Per item, in this order; the first failure rejects the item with line/field and a plain fix hint:
1. **Schema**: kind schema, ids, sizes, names in both languages (the AI must supply `hi`; an empty or copied `hi` falls back to `en` with a warning, not a rejection).
2. **Policy**: no network, no external URLs/assets (`data:` only), fonts only by the font rules, no real brand logos or protected characters, original content only.
3. **Compile/validate**: `motion` through the CODE-TIERS classifier (B or C validator); `preset` expressions parse and evaluate for default controls AND for min/max extremes with no NaN/Infinity; `composition` through `validateSpec` and `resolveSpec`.
4. **Render check** (motion, template, composition, shape, text): render 3 frames (start, middle, near end) at 1280 x 720 or the item size. Reject if the frames are fully transparent, fully one colour (unless the item says `allowBlank`), throw, or exceed the time budget (default 5 s per frame, 60 s total bake for the check). For `motion`, bake the thumbnail twice and require identical bytes (determinism).
5. **Controls check**: every control changes the rendered result at least once across its range (compare the middle frame at min and max); a control that does nothing is a warning shown to the author, not a rejection. Defaults must lie inside min/max.
6. A review dialog lists every item with a thumbnail (hover plays), status (OK / warning / rejected + reason) and a checkbox; "Add selected to library" and, for compositions, "Add to timeline". The result is a short report the user can copy back to the AI to repair ("Copy report").

## 7. Safety and honesty rules
- Same sandbox rules as Tier C: pack code runs only in the sandboxed iframe or worker; presets and compositions are data and never execute code.
- Quality is never lowered to gain a control: a `motion` item always renders at full project resolution; controls only change its params.
- Honest limits stated in the UI/docs: a `motion` item's inside is not selectable as separate layers (only its controls change); things that really are bone rigs, real physics or shaders get high-level controls (pose, gravity, intensity) not per-element editing; cross-GPU pixel parity is not promised.
- Pack ids/names are shown to the user; importing never runs anything until the user confirms the review dialog.

## 8. Catalog for the AI ("what does the tool already have?")
- Button "Copy library index for AI" (Import menu and later automatic in the API chat): a compact text of ids, English names, tags, kinds and control names of every library item (built-in and creator), every effect/filter/adjustment/transition id (from the 80-entry catalog and `src/fx`), the 14 Blocks, the Animate presets, the fonts available, and the canvas/fps. Target size under 40 KB; if larger, grouped by pack with only names.
- In the chat phase the user pastes this once at the start of a video request; the AI must mention which existing ids it reuses and which new items it created.
- `docs/CREATOR-PACK-AUTHORING.md` (Codex): the AI's system prompt: the loop (section 1), A > B > C, the pack text format with a full worked example per kind, control-writing rules, expression language, the quality gate checklist, licence/originality rules, and a short "storyboard first, then items, then composition" order.

## 9. Work split
- **Codex, `codex/creator-pack` (new folders only, no UI, no schema, no editor edits)**: `src/creator-pack/`: pack text parser, pack/item schemas (zod) reusing `src/library/schema.ts`, `preset` expression evaluator + generator (pure functions, tested incl. extremes), policy checks, `npm run pack:check <file>` offline validator printing the same report as the review dialog (without renders), `docs/CREATOR-PACK.md`, `docs/CREATOR-PACK-AUTHORING.md`, 8 example packs (one per kind plus a full small video). Narrow, one job.
- **Claude Code, `claude/p-series` (after Codex is merged or its PR is stacked)**: P1 importer UI (Import creator pack, paste, drag/drop, review dialog, report) for existing kinds + `motion`, registry store and panel badges; P2 `preset` support (Controls category for layers, Animate > Creator, Edited-manually rule); P3 `motion` live preview (Draft bake), code-layer context menu, first-load behaviour; P4 `composition` adapter (media slots, effects, transitions, camera moves, library references) and "Copy library index for AI"; P5 `font` kind; later "Save to my library" for native layers. Limit mode, one section at a time.
- **Claude (this chat)**: writes the spec, the first test packs (one small pack per kind), then real topic -> pack requests while testing.

## 10. Proof (what "done" means)
- A test pack with a new shape, a new text style, a new background, a particle `motion`, a Move `preset`, and a 3-scene `composition` imports, passes the gate, shows in the right panels, uses its items on the timeline, exports, and the exported frames equal the preview within the existing tolerances (record the measured maximum).
- A bad pack (infinite loop, fetch call, NaN expression, missing `hi`, huge source, control that is out of range) is rejected or warned with the exact reasons and leaves the editor and library untouched.
- Controls: changing each control of each example item changes the render; a `preset` regenerates keyframes in one undo step; the Edited-manually rule is tested.
- Re-importing the same pack is idempotent; deleting an item does not break projects that already used it.

## 11. Decisions
- D1: pack text format with `=== SOURCE name ===` sections is the chat-phase authoring format; JSON is the machine format.
- D2: the item kinds are exactly section 3 for v1 of the format; new kinds need a spec revision.
- D3: presets are declarative data with a tiny safe expression language, never code.
- D4: no schema bump for presets (layer.metadata.preset); code layers already use schema 8; fonts need no schema change (stored in the library store and embedded in the project copy).
- D5: controllers -> keyframes one way, with the Edited-manually rule; no hidden two-way sync.
- D6: nothing is registered without the gate; a rejected item never blocks the rest of the pack.
- D7: open for the owner: where hosted/shared packs live (later), and whether creator packs can be shared between users (later; not in this build).
