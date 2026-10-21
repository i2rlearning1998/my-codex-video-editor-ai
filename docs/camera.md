# Camera shots (FINAL3 Part C)

A scene can be filmed by one or more **cameras** (Blender-like settings) moved only by **code controllers**. There are no camera keyframes anywhere in the UI: a shot is a controller with parameters and an optional start and end framing.

The older FINAL1 scene camera (`composition.camera`, docs/CAMERA-API.md) still plays and exports in old projects; the Camera section can remove it. When a scene has shots, the shots win.

## Where it lives (schema 9, no bump)

- A **shot** is a layer with `role: "camera"` (a `shape` layer that is never drawn, picked or snapped to) whose clip sits on the scene's **Camera track** (track id starting `camera-track`, type `object`, named "Camera", always at the top). The clip's start and length are the shot's, so shots trim, move, split, duplicate and delete like any clip; the Camera track takes only shots, and shots stay on it.
- The layer holds two JSON string properties, read defensively (missing or bad values fall back to Blender's defaults):
  - `cameraSpec`: the camera (`CameraSpec`, src/camera/rig.ts): `id`, `name`, `type` (`persp` | `ortho`), `lensUnit` (`mm` | `fov`), `focal`, `orthoScale`, `sensorFit`, `sensor`, `shiftX`, `shiftY`, `clipStart`, `clipEnd`, `showLimits`, `dof` (`enabled`, `focusLayer`, `distance`, `fStop`, `blades`, `rotation`, `ratio`), `safeAreas` (EBU defaults: title 10 % × 5 %, action 3.5 % × 3.5 %, center-cut), `passepartout`, `guides` (center, center diagonal, thirds, golden ratio, golden triangles A/B, harmonious triangles A/B), `display` (size, name, sensor), `background` (an image or video asset: alpha, back/front, stretch/fit/crop, offset, rotation, scale, flips, **Include in render**), `trackTo` (target layer, up axis).
  - `cameraShot`: the shot (`Shot`): `cameraId`, `controller`, `easing`, `strength` (0–2), `amount`, `speed`, `seed`, `direction` (1 or −1), `target` (a layer id), `from` and `to` (partial poses: `x`, `y`, `z`, `pan`, `tilt`, `roll`, `focal`).
- Shots of one camera share its `cameraSpec`; changing the camera rewrites every shot that films with it (one undo step).
- A layer's **Depth** is the number property `depth` on a top-level layer (Position panel; 0 = the canvas plane, positive = farther). A perspective camera gives depth parallax and depth of field; 0 changes nothing.

## Controllers

`push-in`, `pull-out`, `pan-left`, `pan-right`, `pan-up`, `pan-down`, `tilt`, `orbit`, `dolly-zoom`, `handheld` (amount, speed, seed), `whip-pan`, `rack-focus` (to the target's depth), `follow` (keeps the target centred), `parallax-drift`, `hold`. Each mixes the start and end framing with the easing (`linear`, `ease-in`, `ease-out`, `ease-in-out`, `smooth`, `snap`) and adds its own motion scaled by `strength`. Presets row: **Slow push**, **Reveal**, **Documentary drift**, **Punch-in**, **Shake hit** (`SHOT_PRESETS`). "Randomise within safe limits" is `randomiseShot`.

Everything is computed in floating point (`poseMatrix`, `shotPose`); nothing is rounded per frame, so a slow push never steps. The preview and the export draw through the same `drawComposition`.

## API

| Name | Where | What |
| --- | --- | --- |
| `cameraShotsCommands(project, plans)` | src/camera/shot-commands.ts | **The plain-data hook**: commands that add the planned shots (and Camera tracks). One transaction = one undo step. |
| `CameraShotPlan` | src/camera/shots.ts | `{sceneId, start, duration, controller, params?, from?, to?}`; `params` holds `easing`, `strength`, `amount`, `speed`, `seed`, `direction`, `target` and `camera` (a camera name: plans naming the same camera share it). |
| `cameraShots` in a Composition Spec scene | src/ai-spec/schema.ts | The same plans inside a scene (no `sceneId`); `target` names an item of the scene. Built by `buildProjectFromComposition`. |
| `addShotCommands`, `updateShotCommands`, `updateCameraCommands`, `duplicateCameraCommands`, `deleteCameraCommands` | src/camera/shot-commands.ts | What the Camera section runs. |
| `cameraShotsOf`, `camerasOf`, `activeShot`, `cameraStateAt`, `cameraMatrixFor`, `shotFramePose`, `frameCorners` | src/camera/shots.ts | Reading shots and evaluating the camera at a time. |
| `poseMatrix`, `shotPose`, `dofBlur`, `insideClip`, `lensZoom`, `fieldOfView`, `focalForFov` | src/camera/rig.ts | The maths (DOM-free). |

## Example 1: a slow push on scene 1

```ts
import { cameraShotsCommands } from './src/camera/shot-commands';
const commands = cameraShotsCommands(engine.state, [
  { sceneId: 'scene-1', start: 0, duration: 6, controller: 'push-in',
    params: { strength: 0.5, easing: 'smooth' } },
]);
engine.commands.transaction('Camera shots', commands);
```

## Example 2: two cameras and a cut, with a follow shot

```ts
cameraShotsCommands(engine.state, [
  { sceneId: 'scene-1', start: 0, duration: 3, controller: 'pan-right',
    params: { camera: 'Wide', strength: 0.8 } },
  // The cut: at 3 s the "Close" camera takes over and follows the logo.
  { sceneId: 'scene-1', start: 3, duration: 4, controller: 'follow',
    params: { camera: 'Close', target: 'logo-layer' },
    from: { focal: 85 }, to: { focal: 85 } },
]);
```

## Example 3: inside a Composition Spec scene, with a reveal and a shake hit

```json
{
  "id": "intro", "name": "Intro", "duration": 8,
  "items": [ { "id": "title", "...": "..." } ],
  "cameraShots": [
    { "start": 0, "duration": 5, "controller": "pull-out", "strength": 1.2,
      "easing": "ease-out", "from": { "tilt": -4 } },
    { "start": 5, "duration": 1, "controller": "handheld", "amount": 18,
      "speed": 7, "strength": 1.5, "target": "title" }
  ]
}
```

## In the editor

- Scene toolbar **Camera** (with nothing selected) or selecting a shot on the Camera track opens the right panel's **Camera** section (not the AI category): Add camera, Add shot, the camera picker, name, Duplicate camera, Delete camera, Preview camera, Show camera frame, Start / End, the shots list, the presets row, then Controller, Start and end framing, Lens, Depth of field (Focus object with **Pick on canvas**), Viewport display (safe areas, passepartout, guides, size, name, sensor), Background image and Track To.
- While editing, the shot's camera frame shows on the canvas (outside dimmed): drag inside to truck, a corner to zoom, the round handle to roll, the wheel to dolly, Alt-drag or the middle button to orbit; Shift is fine. Release is one "Camera framing" step.
- **Preview camera** looks through the camera at the playhead; layers stay selectable and movable where they are seen.
- The Camera track folds to a thin strip with its chevron; it disappears when the scene has no shots.
