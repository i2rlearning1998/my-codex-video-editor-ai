# 08 Story-comic explainer (the Storywise look)

A recipe for a vertical (9:16) educational story: hand-drawn flat cartoon scenes, a diagram on top, a title tag, a logo and a Hindi or English narration. It was proven on the "Circumference of the Earth" test video (about two minutes, 10 chapters, built as ONE timeline).

## What you bring

- 8 to 12 flat-cartoon pictures, all in the same style (see **Pictures** below). Name each file in words the plan can match: `library-eratosthenes.png`, `street-rider-talking.png`, `desert-measuring-stick.png`.
- The narration as ONE audio file (for example `narration-full.mp3`). The plan names it in `narrationTrack`; the video lasts at least as long.
- Nothing else. The title tag, logo, diagrams, angles, arrows, bubbles and formulas are layers of the plan.

## Pictures

Make picture 1 first, then ask for every other picture with "Same style, same characters as the previous images." in the same chat. Ask for portrait 9:16 and no text, watermark or logo in the picture.

Style line to paste first (with two or three reference frames of the look you want):

> Flat 2D cartoon illustration, like a children's educational comic. Thick, slightly wobbly dark-brown ink outlines. Flat cel-shaded colour with one soft shadow tone, no gradients, no glow, no painterly texture, no 3D, no photorealism, no anime. Simplified shapes and low detail. Muted dusty palette. Caricatured characters: big nose, small dot eyes, simple hands. Same faces and clothes in every image. Portrait 9:16. No text, no watermark.

Per picture: the place, who is in it and what they do, and where to keep the picture empty ("leave the top 35 % plain: a diagram goes there"). For a second pose of the same scene say "exactly the same scene, only the rider raises a hand". Props that must move or float (a globe, a well, a walking camel) are separate pictures on a plain off-white background, "clean cut-out look".

## The plan

Use `"version": 3` and `"meta": { "build": "timeline" }`. Each chapter is one narrated beat (its `durationHint` follows the narration). Layer times are relative to the chapter.

| Job                                | Layer                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Scene picture                      | `media`, `size: "full"`; two poses of one scene: `poses: [{ "query": "street rider pointing", "start": 6 }]` |
| A picture that fades into the next | `feather` and `featherEdge`                                                                                  |
| A prop that arrives                | `media` with `enter: "zoom"` or `pop`                                                                        |
| A character walking across         | `media` cut-out with `move` (to, duration, `linear`) and `loop: "float"`                                     |
| Title tag, logo (every chapter)    | `overlays[]`: a `title` with `highlight` for the tag; a `shape` ellipse and a `text` for the logo            |
| Label such as "10.5°" or "800 km"  | `text` with `fontSize`, `weight` and `highlight` (a white or orange box)                                     |
| Sun ray, route, radius             | `shape` `arrow` or `line` with `from`, `to`, `dash` and `enter: "wipe"` (it draws on)                        |
| Angle between two lines            | `shape` `arc`: `at` the corner, `radius`, `startAngle`, `endAngle`                                           |
| Circle or Earth outline            | `shape` `ellipse` with `stroke` and no `color`                                                               |
| Measuring tool                     | `shape` `protractor`                                                                                         |
| A character thinks or says         | `bubble` `thought` or `speech`                                                                               |
| Slow push in, hold, pull out       | `cameras[]` of the chapter                                                                                   |

Positions are percent of the canvas (`at: { "x": 50, "y": 12 }` is the centre, a bit below the top). To place a diagram on a picture, look at the picture, note where the stick, the horizon or the person is, and give those percents. Rays and arcs that touch a point in the picture use that same point for `to` and `at`.

## Checks before you build

1. Every media query names one file (or two or three words of its name); the audio file is named in `narrationTrack.query`.
2. Layers of a chapter end inside the chapter; the last chapter lasts as long as the narration.
3. Text is short: one idea per label, 60 characters at most.
4. Build, then watch the whole video once with the sound on, and fix timings in the timeline (everything is on one timeline, so drag the layer).

The code for the Circumference video is the plan in `docs/samples/plan-v3-diagram.json` (a small diagram-only version) and the field list in [07 Plan cheatsheet](07-plan-cheatsheet.md).
