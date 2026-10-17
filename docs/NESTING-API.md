# Nested clips (compound clips)

Engine only (`src/nesting`, `src/core/nesting.ts`). Nothing in the UI is wired yet. No schema change and no new dependency (D-271).

## Representation and why

A nested clip is an ordinary **group layer with one clip** on the parent timeline. Its clip carries `clip.metadata.nested`:

```json
{
  "version": 1,
  "duration": 4,
  "clips": [
    {
      "trackId": "ta",
      "trackName": "Text 1",
      "trackType": "text",
      "trackRank": 0,
      "clip": {
        "id": "clip-a",
        "startTime": 0,
        "duration": 4,
        "...": "the clip as it was"
      }
    }
  ]
}
```

- `clips` keeps the clip each child had (its source range, speed, reverse, freeze, effects and settings), with `startTime` relative to the nested clip's anchor, and its lane (id, name, type, rank top first) so a flatten can rebuild the lanes.
- The children keep their times and keyframes in the nested clip's **own time frame**, anchored at `clip.startTime - clip.sourceIn / clip.speed`. When the clips are nested the anchor is the nested clip's start, so the children are not changed at all.

Why a group and not a scene: a group with a clip already behaves as one clip on the timeline (D-039, D-251): it moves, trims, takes presets, effects, transitions and an undo step like any clip, and the canvas, hit testing, selection, export and the outliner already understand groups. A scene (composition) as a source would need a new clip kind and a second playback and export path (`export/join.ts` joins scenes end to end, it does not play one inside another), and a composition reference would be a schema change. The metadata record follows the D-033 pattern: optional, JSON-safe, read defensively, so projects without it are unchanged.

## Time mapping

`nestedTimeAt(clip, t)` (`src/core/timeline.ts`, re-exported as `outerToInner`) is the time in the children's frame shown at outer time `t`:

`anchor + clipSourceTime(clip, t)`: the outer clip's trim (`sourceIn`, `sourceOut`), speed, reverse and freeze, clamped to the clip. At speed 1 with no trim, no reverse and no freeze it returns `t` itself (no floating-point change). `innerToOuter(clip, time)` is the inverse for drawing a playhead inside.

Where it is honoured:

- **Render** (`src/render/adapter.ts`, `deriveRenderItems`, so the preview, hit testing, PNG frames and the export worker): when a group's clip is nested and a time is drawn, its children are re-evaluated at the inner time (`compositionAt`), drawn with that time (activity, masks, media frames) and with their kept clips (a video child shows its own source range and speed). A group without `nested` takes the old path. A test hashes the render items of every project fixture at several times, recorded before the change, and they are identical.
- **Core** (`src/core/commands.ts`): `SET_CLIP_TIMING` on a nested clip (move or trim) shifts its children only by the change of the anchor (a move shifts them with the clip; a trim moves nothing), instead of D-251's edge retiming. `SET_CLIP_SPEED` shifts them when a trimmed clip's anchor moves. `validateProject` does not count a nested clip's children in the scene's length (the outer clip does).

## API (`src/nesting/index.ts`)

| Name                                                                                     | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nestClips(project, compositionId, clipIds, {groupId?, name?})`                          | `{label: 'Nest clips', commands, groupId, clipId}`. Top-level clips on any lanes (not audio, not on locked lanes). One transaction: `GROUP`, `SET_LAYER_TIMING`, `DELETE_CLIP` per clip, `CREATE_TRACK` + `MOVE_TRACK` (a new lane at the topmost selected lane's place, of the group's lane kind) and `CREATE_CLIP` with `metadata.nested`. Lanes the clips leave empty are removed by the engine in the same step (T3).                                                                                                                                                               |
| `flattenNested(project, compositionId, clipId)`                                          | `{label: 'Flatten nested clip', commands, layerIds, dropped}`. One transaction: the nested clip and group go, the children come back as top-level layers at the group's place with their kept clips, timed through the outer trim and speed (media clips multiply their speed; keyframes are re-timed; a child the trim cut away entirely is in `dropped`), on their lanes: the same lane when it still exists and is free, else a new lane with the old id (or a fresh one) at the nested clip's lane place. Nest then flatten restores the layers, timing and lanes exactly (tested). |
| `nestedDepth(layer, clipOf)`                                                             | How many nested levels a layer holds; throws `Nesting cycle` when a tree repeats a layer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `MAX_NEST_DEPTH` (5)                                                                     | `nestClips` throws `Nesting is limited to 5 levels` past it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `outerToInner`, `innerToOuter`, `nestedTimeAt`, `nestedAnchor`                           | The time maps.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `nestedInfo(clip)`, `isNestedClip(clip)`, `NESTED_KEY`                                   | Read the record.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `enterNested(project, state, compositionId, layerId)`, `exitNested(state)`, `NOT_NESTED` | Pure, transient edit state: the path of entered nested clips (never saved, never history). Entering checks the path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `nestedEditView(project, compositionId, state, outerTime)`                               | The layers shown while inside and the playhead's time in their frame.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `resolveNestPath`, `absoluteChildClip`                                                   | The nested clips along a path; a kept child clip at its absolute time.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Errors (all plain `Error`s with a sentence): unknown composition or clip, a clip chosen twice, a locked lane, a clip that is not top-level, audio, a cycle, depth over 5, flattening a moved, rotated, scaled or faded nested clip, a reversed or frozen nested clip, or a child that would play faster than 16x.

## What the UI must wire

1. A **Nest** command (timeline and canvas menus, palette) on a selection of clips: `engine.commands.transaction(result.label, result.commands)`; select `result.groupId`.
2. **Flatten** (Ungroup on a nested clip must call `flattenNested`, not `UNGROUP`; the core `UNGROUP` of a nested group fails validation because its clip would point at a missing layer).
3. **Enter / exit**: double-click a nested clip to enter (`enterNested`), Esc or a breadcrumb to exit; while inside, the timeline lists the children with `absoluteChildClip` timing mapped by `innerToOuter`, and edits target the children (their kept clips live in the record; a UI that edits them must rewrite `metadata.nested` with `SET_CLIP_*`-like commands, not built yet).
4. Speed and Reverse on a nested clip: the capability rule (D-073) offers them only to video and audio clips today; a nested clip should get `time-effects`.
5. Trim limits: `clipTrimBounds` sees a generated clip (no source length); the UI should cap trims at `nestedInfo(clip).duration`.

## Gaps

- Inner clips' own presets, effects, transitions and fades are kept in the record but not drawn while nested (only the outer clip's are). They come back on flatten.
- Audio cannot be nested yet (the audio engine plays track clips only).
- Flattening a nested clip whose group was moved, rotated, scaled or faded is refused (no transform baking yet); a reversed or frozen nested clip is refused too.
- A head trim at a speed other than 1 followed by a slower speed can push children's stored times below 0 (they are clamped).
- Editing inside a nested clip (moving a child's kept clip) has no command yet; only the pure state helpers exist.
