# Video Plan v2, v3 and v4 (FINAL3 Part D, FIX4 V3, ROUND-C1)

A **Video Plan** describes a whole video by what it says and shows; the editor's auto-builder turns it into scenes in one step. It never names media slots: each media layer says what to look for (`mediaIntent`), and the builder finds it in the project's media, then stock. Version 1 compositions (Composition Spec plus slots, docs/COMPOSITION-ADAPTER.md) still import and still use the slot dialog.

Where: **AI › Import** (paste or drop the JSON, or a Creator Pack whose `composition` item's `data` is a plan) → the plan is checked → **Build video**. Every allowed value is listed in [creator-playbook/07-plan-cheatsheet.md](creator-playbook/07-plan-cheatsheet.md), generated from the code.

## Shape

| Field               | What                                                                                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`, `version` | `"video-plan"`, `3` (`2` still reads)                                                                                                                                                                    |
| `meta`              | `title`, `language` (`en`, `hi`, ...), `aspect` (`16:9`, `9:16`, `1:1`, `4:5`), `fps`, optional `themeId` (a built-in or My themes id)                                                                   |
| `feel`              | optional `palette` (`background`, `text`, `accent`), `headingFont`, `bodyFont`, `captionStyle`, `transition`, `cameraTendency` (`still`, `gentle`, `dynamic`), `pacing` (`slow`, `medium`, `fast`)       |
| `scenes[]`          | `id`, `title`, `narration`, `durationHint`, `background`, `layers[]`, `camera`, `transitionOut`, `sfx[]`, `notes`                                                                                        |
| `layers[]`          | `id`, `kind` (`title`, `text`, `media`, `kit`), `text`, `kit`, `anchor`, `size`, `enter`, `exit`, `mediaIntent` (`query`, `type`: `photo`, `video`, `icon`, `emoji`; `orientation`), `start`, `duration` |
| `captions`          | `enabled` (default on when there is narration), `style`                                                                                                                                                  |
| `music`             | `query`, `volume`, `ducking` (music ducks under the voice)                                                                                                                                               |
| `voice`             | optional `voiceId`, `speed`                                                                                                                                                                              |
| `notes`             | free text, ignored by the builder                                                                                                                                                                        |
| `resolved`          | written by the builder: each media layer's chosen media; kept so a rebuild keeps swaps                                                                                                                   |

Unknown fields are warnings (ignored), never failures. Errors are plain sentences that name the scene and layer, for example: `Scene 1 (open), layer "flower" is media without "mediaIntent" (what to look for).`

The quality gate also warns when a scene's narration is too fast for its hint, a text is too long to read, or a starter-kit id is unknown (that layer is left out); it refuses a video longer than 1800 s (30 min), duplicate ids and a camera target that is not a layer of its scene.

## Version 3: one timeline

A video is **one timeline with layers**, not a row of scenes. `meta.build: "timeline"` builds the whole plan as ONE scene: each plan scene is only a chapter (timing, narration, layers with times relative to the chapter), and every layer, shot and sound lands on the same timeline. This removes the old per-scene costs: no 12-scene or 180 s cap (now 40 chapters, 400 layers per chapter and 1800 s), no copy of the logo in every scene, and one narration file instead of one per scene. `"scenes"` (the default) keeps one editor scene per plan scene, with scene transitions.

| Field (v3)                     | What                                                                                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta.build`                   | `timeline` or `scenes`                                                                                                                                                                              |
| `overlays[]`                   | layers over the whole video (logo, title tag); editable layers, repeated on every scene in `scenes` mode; a picture used again is one media slot                                                    |
| `narrationTrack`               | `query` (file name in Media), `volume`, `start`: one narration file under the whole video; the video lasts at least as long. Without it each scene's `narration` is spoken by the voice             |
| `layer.at`, `width`, `height`  | centre of the layer in percent of the canvas; size in percent                                                                                                                                       |
| `layer.rotation`, `opacity`    | degrees; 0 to 1                                                                                                                                                                                     |
| `layer.move`                   | `to` (percent), `start`, `duration`, `easing`: the layer slides                                                                                                                                     |
| `layer.loop`                   | `float`, `pulse`, `wiggle`, `spin`                                                                                                                                                                  |
| `layer.poses[]`                | media layer only: `{ query, start }` swaps the picture at those times (a talking pose, then a pointing pose)                                                                                        |
| `layer.feather`, `featherEdge` | soft edge of a picture or shape, all sides or one                                                                                                                                                   |
| text look                      | `color`, `fontSize`, `weight`, `highlight` (box behind the text), `outline`                                                                                                                         |
| `kind: "shape"`                | `rectangle`, `ellipse`, `line`, `arrow`, `arc`, `protractor` with `from`/`to`, `stroke`, `strokeWidth`, `dash`, `arrowStart`, `radius`, `startAngle`, `endAngle`; `enter: "wipe"` draws it on       |
| `kind: "bubble"`               | `speech` or `thought` bubble around `text`; `tail`, `color`, `stroke`                                                                                                                               |
| `kind: "block"`                | a code-drawn teaching graphic: `block` (an id from `docs/GRAPHICS-BLOCKS.md`) and `params`; times in `params` are seconds from the layer start; in a timeline the layer order is the stacking order |
| `scene.cameras[]`              | several shots in one scene, each with `start` and `duration`                                                                                                                                        |
| `enter` / `exit`               | also `wipe` and `words`                                                                                                                                                                             |

Rules the builder follows: the later layer of a scene covers the earlier one (kit backgrounds are always underneath, overlays on top); a rotated layer turns about its centre; arcs and the protractor are drawn as shapes (editable like any shape); a thought or speech bubble is a body shape, a tail and a text. `mediaIntent.type: "audio"` finds an audio file in the project's Media (audio is never searched online). A sample is in docs/samples/plan-v3-diagram.json.

## Version 4: the plan can say what the editor can do (ROUND-C1)

`"version": 4`. Versions 2 and 3 still read and build exactly the same project as before (snapshot tests in tests/round-c1/old-plans-same.test.ts). Every v4 field maps to a command or capability the editor already has; nothing in src/core or schema 9 changed. Every id is checked against the real catalog; an unknown id is a plain error that names the nearest valid ids (`there is no blend mode "multiplie". Nearest: blend.multiply, ...`).

| Field (layer)                  | What                                                                               | Existing command or API                                  |
| ------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `name`                         | the layer's name                                                                   | `SET_LAYER_NAME`                                         |
| `fx[]`                         | effects, filters, adjustments `{id, params}` (ids of the FX library)               | `SET_CLIP_FX` (src/core/fx.ts, src/fx)                   |
| `grade`                        | `exposure`, `contrast`, `saturation`, `temperature` (-100..100)                    | `adjust.*` entries in the same `SET_CLIP_FX` stack       |
| `blend`                        | a blend mode (`multiply` or `blend.multiply`)                                      | `plugin:layer-blend:SET` (src/blend)                     |
| `chromaKey`                    | `color`, `similarity`, `smoothness`, `spill`                                       | `plugin:chroma-key:SET` (src/chroma)                     |
| `mask`                         | `rect` or `ellipse` in percent of the layer, `feather`, `invert`                   | `plugin:layer-masks:SET` (src/masks)                     |
| `transitionIn`                 | a clip transition (basic or `transition.*`)                                        | `SET_CLIP_TRANSITION`                                    |
| `keyframes[]`                  | `x`, `y` (percent), `scale`, `rotation`, `opacity` at seconds from the layer start | `SET_PROPERTY` with keyframes                            |
| `preset`                       | a Creator preset of the Project (`id`, `controls`)                                 | `presetCommands` (src/ui/creator-presets.ts)             |
| `speed`, `reverse`, `sourceIn` | playback speed, reverse, where the source starts                                   | `SET_CLIP_SPEED`, `SET_CLIP_REVERSED`, `SET_CLIP_TIMING` |
| `volume`, `fadeIn`, `fadeOut`  | sound of a video or sound layer                                                    | `plugin:audio:SET` (src/audio/settings.ts)               |
| `font`, `letterSpacing`        | text font family and spacing                                                       | text properties via `SET_PROPERTY`                       |
| `fit`                          | `fit`, `fill`, `stretch` for a picture or video                                    | scale and position (VID-004 rule)                        |
| `group`                        | layers with the same group id become one group                                     | `GROUP`                                                  |
| `order`                        | stacking inside the scene (higher on top)                                          | build order                                              |
| `locked`                       | locked layer                                                                       | the `locked` property (D-126)                            |
| `queries[]`, `minDuration`     | several searches tried in order; footage at least this long                        | the v4 media rule below                                  |
| `mediaIntent.type: "sticker"`  | a sticker by kind                                                                  | the provider registry                                    |

Scene: `transitionOut.type` may also be a pixel transition `transition.<id>` (set as the scene transition marker). Plan: `meta.videoType` (a type of the Platform Config), `meta.assets` `{order, aiImagesMax, aiVideosMax, onlyMine}` (default order mine, library, stock, ai), `music.sourceIn`.

**Not expressible (BLOCKED):** a speed ramp (the editor has one speed per clip, `SET_CLIP_SPEED`; there is no time-remap command, and src/core may not change); lanes other than the build's own (each built layer gets its own lane; `order` sets the stacking); hide (there is no hide command, LYR-006 is not built).

### New graphics: `defs.blocks[]`

`{"id", "tier": "B" | "C", "source", "meta"?, "summary"?}`, at most 40 per plan, 32 settings each, source up to 32768 characters. A layer `{"kind": "block", "block": "<def id>", "params"}` uses it, in as many scenes as wanted. Tier B is checked by the block compiler (literal metadata, the drawing policy); Tier C by the Creator Pack checks and policy (init, renderFrame, a duration). A def may not take a built-in block's id, and two settings may not share a name. The settings become the layer's controllers (the code layer's own Controls). Every accepted def is also saved as a Creator Pack motion item (pack `plan-graphics`) in the Project's AI library: the Project's graphics kit, listed in the capability sheet and the AI panel, reusable by id.

### Media on its own (replaces the FIX7 rule for v4)

For each media layer the builder searches by KIND (`photo` → `stock-photo`, `video` → `stock-video`, `icon`, `sticker`/`emoji` → `sticker`, `audio` → `music`) through every enabled provider of the Platform Config's registry (src/tools searchMedia), in the asset rule's order: the person's own files (by name), the library, then stock. A pick must pass the checks: allowed licence (`director.assets.licences`), the right kind, long enough footage, big enough to fill the screen, not used by another layer. The pick is recorded with up to four alternatives and marked "picked by AI" (`picks`); footage is cut with `sourceIn` and the layer's length. Nothing usable: the layer becomes the named empty slot with the "needs asset" flag, and the reason offers rewording the search or a code graphic (or an AI picture when the rule allows). "Use only my files" searches nothing else. The credit lines of the stock used are returned with the build (`credits`). v2 and v3 plans keep the FIX7 rule unchanged.

## How it is built

1. **Media**: the project's media first (by name), then stock: photos and videos from Pexels or Pixabay (the saved key), icons from Iconify, emoji from the sticker sets. Candidates are ranked by the query's words in their title and tags, the orientation and the kind, then by key, so the same plan picks the same media. The top four are kept as alternatives. When nothing is usable the layer becomes a fallback card ("Needs: ...") with a **needs asset** flag; the build never stops for media.
2. **Voice-over**: each narration is spoken by the first ready Text to speech engine. Without one the video is built silent and a banner says why. A scene lasts `max(voice + 0.4 s, durationHint)` (the pacing gives the hint when there is none).
3. **Captions** come from the narration: word timings when the voice gives them, otherwise each word gets time by its length across the spoken part; the style is `captions.style` or `feel.captionStyle`.
4. **Layout**: anchors place layers in canvas fractions (6 % and 8 % margins), sizes are fractions of the width; media keep their shape (`full` covers the canvas). Enter and exit become the clip's In and Out presets.
5. **Camera**: a scene's `camera` becomes a shot on its Camera track (docs/camera.md); otherwise `feel.cameraTendency` picks gentle or dynamic controllers.
6. **Transitions** between scenes (`transitionOut`, else `feel.transition`; `cut` is none), **music** (one bed across the scenes, ducked under the voice) and **sound effects** (the built-in sound pack by name, then stock audio).
7. The scenes are added in **one undo step**: a project that is one empty scene is replaced, otherwise the scenes are appended; the scene strip opens, a toast says "Built N scenes", the first scene opens and nothing is selected.

The build runs headless through the Composition Spec adapter, so it is deterministic: the same plan and the same services give the same project.

## Review & swap

The build summary's **Review & swap** (also the palette's _Review video plan_) opens a left panel: per scene its length, Up, Down, Delete and Regenerate, the narration with **Update voice** (speaks it again and remakes that scene's captions and timing), and each media layer with its flag, up to four alternatives, **Search more** and **Use my own**. A swap keeps the layer's place, animation and the camera. **Export plan** downloads the plan with every choice (importing it builds the same video); **Compare to plan** lists where the project differs. The plan state is kept in this browser per project (`aive.videoPlan.<projectId>`), never in the project.

## Starter kit

Lower thirds (3), title cards (5), an end card, a subscribe button, a callout with an arrow line, a number counter, a quote card and four backgrounds, all coloured from the plan's palette; eight transitions (with dip to black and dip to white) and six caption styles. Ids are in the cheatsheet.

## Example: three scenes (English)

```json
{
  "format": "video-plan",
  "version": 2,
  "meta": {
    "title": "Where honey comes from",
    "language": "en",
    "aspect": "16:9",
    "fps": 30
  },
  "feel": {
    "palette": {
      "background": "#1b1a17",
      "text": "#fff7e6",
      "accent": "#f2a900"
    },
    "headingFont": "Poppins",
    "bodyFont": "Inter",
    "captionStyle": "bold-box",
    "transition": "dip-to-black",
    "cameraTendency": "gentle",
    "pacing": "medium"
  },
  "scenes": [
    {
      "id": "open",
      "title": "Cold open",
      "narration": "Every jar of honey starts with a single flower.",
      "durationHint": 4,
      "layers": [
        {
          "id": "flower",
          "kind": "media",
          "size": "full",
          "mediaIntent": {
            "query": "bee flower macro",
            "type": "photo",
            "orientation": "landscape"
          }
        },
        {
          "id": "title",
          "kind": "title",
          "text": "Where honey comes from",
          "anchor": "center",
          "enter": "slide-up"
        }
      ],
      "camera": { "controller": "push-in", "strength": 0.6 }
    },
    {
      "id": "hive",
      "title": "The hive",
      "narration": "Inside the hive, thousands of bees work together to turn nectar into honey.",
      "layers": [
        {
          "id": "hive-video",
          "kind": "media",
          "size": "full",
          "mediaIntent": { "query": "beehive bees working", "type": "video" }
        },
        {
          "id": "name",
          "kind": "kit",
          "kit": "lower-third-1",
          "text": "The hive|Up to 60,000 bees",
          "enter": "slide-right"
        },
        {
          "id": "count",
          "kind": "kit",
          "kit": "number-counter",
          "text": "60,000|bees in one hive",
          "start": 2.5,
          "enter": "pop"
        }
      ],
      "transitionOut": { "type": "crossfade", "duration": 0.8 },
      "sfx": [{ "query": "bees buzzing", "at": 0, "volume": 0.4 }]
    },
    {
      "id": "close",
      "title": "Close",
      "narration": "So next time you taste honey, thank a bee.",
      "layers": [
        { "id": "bg", "kind": "kit", "kit": "background-spotlight" },
        {
          "id": "thanks",
          "kind": "kit",
          "kit": "end-card",
          "text": "Thank a bee|Subscribe for more nature stories"
        },
        { "id": "cta", "kind": "kit", "kit": "subscribe-cta", "enter": "pop" }
      ]
    }
  ],
  "captions": { "enabled": true },
  "music": { "query": "calm acoustic", "volume": 0.3, "ducking": true },
  "notes": "A short explainer for a nature channel."
}
```

## Example: Hindi (9:16)

```json
{
  "format": "video-plan",
  "version": 2,
  "meta": {
    "title": "चाय की कहानी",
    "language": "hi",
    "aspect": "9:16",
    "fps": 30
  },
  "feel": {
    "captionStyle": "headline",
    "transition": "slide-left",
    "cameraTendency": "dynamic",
    "pacing": "fast"
  },
  "scenes": [
    {
      "id": "khet",
      "narration": "चाय की हर प्याली असम के हरे बागानों से शुरू होती है।",
      "layers": [
        {
          "id": "bagan",
          "kind": "media",
          "size": "full",
          "mediaIntent": {
            "query": "tea garden assam",
            "type": "photo",
            "orientation": "portrait"
          }
        },
        {
          "id": "shirshak",
          "kind": "title",
          "text": "चाय की कहानी",
          "anchor": "top"
        }
      ]
    },
    {
      "id": "pyali",
      "narration": "पत्तियाँ तोड़ी जाती हैं, सुखाई जाती हैं, और फिर बनती है आपकी चाय।",
      "layers": [
        {
          "id": "cup",
          "kind": "media",
          "size": "large",
          "anchor": "center",
          "mediaIntent": { "query": "masala chai cup", "type": "photo" }
        },
        {
          "id": "quote",
          "kind": "kit",
          "kit": "quote-card",
          "text": "एक प्याली, हज़ार कहानियाँ|कहावत",
          "start": 2
        }
      ]
    }
  ]
}
```
