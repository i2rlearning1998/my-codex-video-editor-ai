# Teaching-graphics blocks

Code-drawn blocks for explainer videos. They are registered starter blocks
(`src/blocks/graphics/`), so a Video Plan layer (`kind: "block"`), a
Composition Spec (`code-block`) and the code-layer panel can all use them. Each
one is a pure function of the clip time `t`, draws on a transparent
canvas-sized frame, and is baked per frame like any code layer.

| Block id        | What it draws                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `earth-globe`   | Spinning orthographic globe (Natural Earth 50m land), day/night, city pins, rings, meridians, sun rays, zoom to the limb |
| `story-map`     | Flat map that pans and zooms between two views, city dots, a dotted route that draws itself                              |
| `ink-mark`      | Hand-drawn tick, cross, question mark, circles, arrows, underline, right-angle                                           |
| `stick-diagram` | Stick, ground, shadow sweep, protractor, angle count-up, zoom in/out                                                     |
| `sun-earth`     | Glowing sun, small Earth, dotted line and labels                                                                         |
| `earth-arc`     | Cross-section: parallel rays, radii, angle arc, red arc, zoom out to the 360° picture                                    |
| `soft-panel`    | Solid panel with a soft lower edge, to hide art behind a diagram                                                         |

## In a Video Plan

```json
{
  "id": "globeA",
  "kind": "block",
  "block": "earth-globe",
  "start": 2,
  "duration": 5.2,
  "params": { "cx": 50, "cy": 54, "radius": 31, "spinAt": 1.4, "spinDur": 2.4 }
}
```

`block` is the id above; `params` are validated against the block's declared
params (numbers, colours as `#RRGGBB`, text, booleans, selects; unknown names
are rejected). Times inside `params` are seconds from the block's own start;
`-1` turns a timed part off.

## Rules learned from building a 126 s explainer

- Use `meta.build: "timeline"` for one continuous video. In a timeline the
  **layer order is the stacking order**, last layer on top (media is not forced
  underneath any more).
- A media layer made larger than the canvas needs an explicit `height` (percent
  of the canvas height) that keeps the picture's aspect; without it the height
  is capped at 90% and the picture shrinks to fit.
- Poses of one media layer cut into each other; only the first fades in and
  only the last fades out.
- A block may declare a lower bake `fps` (`soft-panel` 1, `ink-mark` 15), which
  cuts export time for still or slow art.
- Registered blocks bake on the main thread (no sandbox worker, no pixel
  copy). Free code and imported blocks still run in the sandbox.
- Export bakes every code frame first (about 0.3 to 0.5 s per full-size frame).
  A video with ~3000 baked frames needs ~15 to 25 minutes in a slow browser.

## Physics-explainer blocks (v8)

| Block           | What it shows                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `angle-proof`   | Two sticks on a curved Earth: parallel rays, different shadow angles, normals meeting at the centre, equal angle at the centre.                       |
| `route-measure` | Camel walks the winding road with an odometer (distance), then the straight line (displacement). Draws over a `story-map` with the same view numbers. |
| `well-beam`     | Noon sunbeam into a well: glow, sparkles, ripples.                                                                                                    |
| `slice-circle`  | 7.2° wedge copied 50 times around a disc with a running km total (360 ÷ 7.2 = 50, 50 × 800 = 40,000 km).                                              |
| `sun-scale`     | Sun pushed far away: fanning rays turn parallel.                                                                                                      |
| `dust`          | Floating golden specks so a still picture breathes.                                                                                                   |

`flat-map` gained a `cy` param (view centre y %).
