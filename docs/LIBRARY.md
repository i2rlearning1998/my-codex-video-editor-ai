# LIBRARY.md: the content library

The library is static content the editor ships with: shapes, backgrounds,
text styles, templates and (listed, applied from Wave 6) transitions. It is data, never code, and it adds ordinary
layers through the Command Bus, so everything it adds can be edited, undone
and exported like anything else.

## Files

| Path                        | What it is                                                            |
| --------------------------- | --------------------------------------------------------------------- |
| `public/library/index.json` | The manifest (generated; do not edit by hand)                         |
| `scripts/build-library.mjs` | Generates Starter Pack 1 (`npm run library`), deterministically       |
| `src/library/schema.ts`     | The manifest format and its validator (`parseLibrary`)                |
| `src/library/loader.ts`     | Loads and validates the manifest once per session                     |
| `src/ui/library-insert.ts`  | Turns an item into commands (one undo step)                           |
| `src/ui/library-panel.ts`   | The Templates, Elements, Text and Transitions browse panels (I2)      |
| `src/ui/browse-panel.ts`    | The one browse panel (sections, See all, chips, drill-down, search)   |
| `src/ui/library-actions.ts` | Click and drop inserts, the template dialog, Recently used            |
| `src/ui/my-templates.ts`    | My Templates (saved scenes, in this browser)                          |
| `src/render/paint.ts`       | Gradient fills (`fillGradient`), shared by the preview and the export |

## Manifest format (version 1)

```json
{
  "version": 1,
  "pack": { "id": "starter-1", "name": { "en": "Starter Pack 1", "hi": "स्टार्टर पैक 1" } },
  "templates": [ { "id": "video", "name": { … }, "subcategories": [ { "id": "youtube-shorts", "name": { … }, "width": 1080, "height": 1920 } ] } ],
  "items": [ { "id": "shape-star-5", "type": "shape", "name": { "en": "…", "hi": "…" }, "tags": ["star"], "data": { … } } ]
}
```

- Every item has a unique `id` (lower case, digits and dashes), a name in English and Hindi, and up to 12 tags (search matches names and tags).
- A **paint** is a `#rrggbb` colour or a gradient: `{ "type": "linear" | "radial", "angle": 0–360, "stops": [ { "offset": 0–1, "color": "#rrggbb" } ] }` with 2 to 4 stops. Angle 0 runs left to right, 90 top to bottom.
- **shape**: `data` is `{ polygons, width, height, fill }`. `polygons` is a list of polygons in a 100 × 100 box (outer ring first, then holes). `width` and `height` are the default size in px on a 1080 px tall canvas; the editor scales them to the canvas and centres the shape.
- **background**: `data.elements` is 1 to 12 shape elements. They become one layer (or one group) at the back of the scene.
- **text**: `data.elements` is 1 to 4 text elements. Several become one group, centred.
- **template**: `data` is `{ background, elements, width, height, category, subcategory }` (up to 24 shape or text elements). `width` and `height` are the canvas it was designed for; on another canvas it is scaled to fit and centred (D-139). Adding one asks: replace this scene, add onto it, or a new scene.
- **transition** (I2): `data` is `{ poster, from, to, planned }`. The poster is drawn by code; `planned` names the ledger item that builds it. Transitions are listed, disabled, until Wave 6.
- Every item may name its browse **`section`** (I2): shapes `basic`, `polygons`, `stars`, `arrows`, `flowchart`; backgrounds `gradients` or `backgrounds` (a `featured` tag also lists them under Featured); text `default`, `combinations`, `plain`, `styles`, `titles` or `two-line`; transitions `fades`, `wipes`, `pushes`, `cartoon`, `glitches` or `3d`. The Lines section is built from the editor's line presets (solid, dashed, dotted, arrow, double arrow).
- **Animated titles** (I5): a text item may carry `data.animation` (the clip presets of D-071, for example `{ "in": { "preset": "pop", "duration": 0.6 } }`). The preset goes on the new clip in the same undo step, and the card previews it on hover.
- An **element** is placed in fractions of the canvas: `x`, `y`, `w`, `h`, optional `rotation` (degrees, about its centre) and `opacity`.
  - A shape element has `shape` (`rectangle`, `ellipse` or `polygon` with `polygons` in a 100 × 100 box), optional `radius` (a fraction of the shorter side) and `fill`.
  - A text element has `text` (`{ en, hi }`, inserted in the UI language), `size` (a fraction of the canvas height), `color` and optional `font` (one of the bundled system fonts), `weight` (400, 600, 700), `italic`, `align`, `letterSpacing`, `lineHeight`, `textCase` and `decoration`.

## Template taxonomy (I2, D-143)

`templates` lists the Templates panel's categories in order: All Templates, Video, Graphics, Social media and Education (flat). My Templates are kept in the browser, not in the manifest. Each subcategory carries the canvas size of its designs:

| Subcategory                                                                                      | Size        |
| ------------------------------------------------------------------------------------------------ | ----------- |
| YouTube, Presentation, Code, Sheet, Whiteboard, Landscape video, YouTube videos, Facebook videos | 1920 × 1080 |
| Mobile video, YouTube Shorts, Instagram Reels, Video message                                     | 1080 × 1920 |
| Instagram, Photo collage, Video collage, Instagram post                                          | 1080 × 1080 |
| Feed ad video                                                                                    | 1080 × 1350 |
| Facebook, Facebook post                                                                          | 1200 × 630  |
| LinkedIn post                                                                                    | 1200 × 627  |
| Pinterest pin                                                                                    | 1000 × 1500 |
| YouTube thumbnail                                                                                | 1280 × 720  |
| Invitation (5 × 7 in)                                                                            | 1500 × 2100 |
| Poster (18 × 24 in)                                                                              | 1800 × 2400 |
| CV, Doc (A4 at 150 dpi)                                                                          | 1240 × 1754 |
| Logo                                                                                             | 500 × 500   |
| Business card (3.5 × 2 in)                                                                       | 1050 × 600  |
| Flyer, Menu (Letter at 150 dpi)                                                                  | 1275 × 1650 |
| Brochure                                                                                         | 1650 × 1275 |
| Website                                                                                          | 1366 × 768  |

Starter Pack 1's 12 templates are 16:9 designs, so they sit only in 16:9 subcategories (and Education); the other subcategories say "No templates yet" until a pack fills them.

## Starter Pack 1 contents (after I5)

95 shapes (polygons, stars, arrows, basic shapes and 14 flowchart shapes: terminator, process, decision, data, document, predefined process, connector, manual input, preparation, manual operation, delay, merge, off-page connector, display), 40 backgrounds (gradients and layered), 36 text styles (default, font combinations, plain, styles, two line and 6 animated titles), 12 templates and 17 transitions.

No icon pack is bundled. An ISC-licensed set such as Lucide draws icons as strokes, which needs a stroked-path shape the renderer does not have yet; it is in the backlog.

## Adding content

1. Edit `scripts/build-library.mjs` (all content is made from code; nothing is copied from elsewhere).
2. Run `npm run library`, then `npm test` (the manifest test checks the format, the pack sizes, both languages and fonts).
3. Commit the script and the regenerated `public/library/index.json` together.

Rules: original content only; no external images or fonts; names in English and Hindi; schema 5 stays unchanged (everything an item adds is ordinary layer properties).
