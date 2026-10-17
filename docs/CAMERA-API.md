# Scene camera (FINAL1)

A scene (composition) may hold an optional `camera`. It moves the whole scene's picture (zoom, pan, tilt, a seeded handheld drift) in the preview and the export. A scene without a camera draws exactly as before.

## Data (schema 9, optional field)

`composition.camera = {x, y, zoom, rotation, shake?}`

- `x`, `y`, `zoom` and `rotation` are ordinary number properties (`{type: 'number', value, animated, keyframes, constraints}`), so they keyframe with the editor's model and easing (`linear`, `ease-in`, `ease-out`, `ease-in-out`, `hold`, cubic).
  - `x` and `y`: offsets from the canvas centre, in composition pixels.
  - `zoom`: a positive factor, 0 to 100; 0 is refused.
  - `rotation`: degrees; the picture turns the other way.
- `shake`: optional `{amplitude, frequency, seed}` (pixels, Hz, uint32): a smooth, seeded drift, the same in the preview and the export.
- Like `playRange` (D-181), it is an optional field: an existing schema 9 document is valid unchanged, so there is no version bump.

## API

| Name                                                                     | Where                    | What                                                                                                            |
| ------------------------------------------------------------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `SET_COMPOSITION_CAMERA {compositionId, camera \| null}`                 | core command             | Sets or removes a scene's camera; one undo step.                                                                |
| `sceneCameraSchema`, `SceneCamera`                                       | src/core/model.ts        | The schema and its type.                                                                                        |
| `sceneCameraAt(composition, time)`                                       | src/camera/scene.ts      | The camera values at a time, or null.                                                                           |
| `sceneCameraMatrix(composition, time)`                                   | src/camera/scene.ts      | The matrix the picture is drawn through (via `cameraMatrix`), or null.                                          |
| `cameraFromTracks({x, y, zoom, rotation, shake})`                        | src/camera/scene.ts      | Builds a camera from `[time, value, easing?]` keyframes.                                                        |
| `cameraPreset(preset, canvas, start, duration, seed?)`, `CAMERA_PRESETS` | src/camera/scene.ts      | Presets as data: `push-in`, `pull-out`, `pan-left`, `pan-right`, `pan-up`, `pan-down`, `ken-burns`, `handheld`. |
| `joinSceneCameras(scenes)`                                               | src/camera/scene.ts      | The joined export's camera (used by `joinScenes`).                                                              |
| `cameraFromMoves(moves)`                                                 | src/composition/build.ts | A Composition Spec scene's camera moves as one scene camera.                                                    |

## How it draws

`drawComposition` (src/render/canvas.ts) draws every item through `view × camera × item`. The artboard's background, its clip and the editor's overlays (selection, guides, handles) stay in `view`. So the camera moves the picture inside the frame, and edges never show past the artboard. The preview, Export frame and the export worker share this path.

Picking and editing use the resting geometry, as the W5-C presets do (D-072): a click selects a layer where it is without the camera.

## Joined export

`joinScenes` gives the joined composition one camera:

- each scene's keyframes are moved to that scene's place in the joined video;
- a scene's last value holds until the cut;
- a scene without a camera stays still;
- one shake is used per export: the first one found.

## Composition adapter

A Composition Spec's `cameraMoves` now become the scene camera; they are no longer reported as missing. Each move adds two keyframes: one at its start with its easing, and one at its end that holds until the next move. Two cases give a warning:

- item `depth` is not applied (the camera moves the whole scene; no parallax);
- shakes that change between moves (the first one is used).

## Gaps

- No parallax: the camera moves every layer alike.
- `SET_COMPOSITION_FPS` does not re-snap camera keyframes to the new frame grid.
- Camera keyframes are not shown on the timeline, and there is no UI yet. The UI pass must add a camera panel: the presets, then the x, y, zoom and rotation fields with stopwatches.
