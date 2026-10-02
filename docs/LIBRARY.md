# LIBRARY.md: the content library

The library is static content the editor ships with: shapes, backgrounds,
text styles and templates. It is data, never code, and it adds ordinary
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
| `src/ui/library-panel.ts`   | The Templates, Elements, Text and Graphics panels (search, previews)  |
| `src/render/paint.ts`       | Gradient fills (`fillGradient`), shared by the preview and the export |

## Manifest format (version 1)

```json
{
  "version": 1,
  "pack": { "id": "starter-1", "name": { "en": "Starter Pack 1", "hi": "स्टार्टर पैक 1" } },
  "items": [ { "id": "shape-star-5", "type": "shape", "name": { "en": "…", "hi": "…" }, "tags": ["star"], "data": { … } } ]
}
```

- Every item has a unique `id` (lower case, digits and dashes), a name in English and Hindi, and up to 12 tags (search matches names and tags).
- A **paint** is a `#rrggbb` colour or a gradient: `{ "type": "linear" | "radial", "angle": 0–360, "stops": [ { "offset": 0–1, "color": "#rrggbb" } ] }` with 2 to 4 stops. Angle 0 runs left to right, 90 top to bottom.
- **shape**: `data` is `{ polygons, width, height, fill }`. `polygons` is a list of polygons in a 100 × 100 box (outer ring first, then holes). `width` and `height` are the default size in px on a 1080 px tall canvas; the editor scales them to the canvas and centres the shape.
- **background**: `data.elements` is 1 to 12 shape elements. They become one layer (or one group) at the back of the scene.
- **text**: `data.elements` is 1 to 4 text elements. Several become one group, centred.
- **template**: `data` is `{ background, elements }` (up to 24 shape or text elements). It becomes a new scene after the open one, with a full-size background rectangle first.
- An **element** is placed in fractions of the canvas: `x`, `y`, `w`, `h`, optional `rotation` (degrees, about its centre) and `opacity`.
  - A shape element has `shape` (`rectangle`, `ellipse` or `polygon` with `polygons` in a 100 × 100 box), optional `radius` (a fraction of the shorter side) and `fill`.
  - A text element has `text` (`{ en, hi }`, inserted in the UI language), `size` (a fraction of the canvas height), `color` and optional `font` (one of the bundled system fonts), `weight` (400, 600, 700), `italic`, `align`, `letterSpacing`, `lineHeight`, `textCase` and `decoration`.

## Adding content

1. Edit `scripts/build-library.mjs` (all content is made from code; nothing is copied from elsewhere).
2. Run `npm run library`, then `npm test` (the manifest test checks the format, the pack sizes, both languages and fonts).
3. Commit the script and the regenerated `public/library/index.json` together.

Rules: original content only; no external images or fonts; names in English and Hindi; schema 5 stays unchanged (everything an item adds is ordinary layer properties).
