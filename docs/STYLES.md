# Styles (Creator Pack kind `style`)

A style is a reusable creative direction for the AI creator: what kind of video it is, how it should feel, which library pieces it likes, where its assets come from and what it outputs. Inside a style the AI is free, unless the user locks something in the brief form (docs/BRIEF-FORM.md). A style is never placed on the canvas.

## Fields (`item.data`)

| Field                                            | Meaning                                                                                                                                                      | Limits                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| `category`                                       | `documentary`, `youtube-intro`, `logo-reveal-2d`, `logo-reveal-3d`, `reels`, `education`, `animation-2d`, `animation-3d`, `recorded-video-enhance`, `custom` | one of the ten        |
| `description`                                    | What the style is for                                                                                                                                        | 600 characters        |
| `thumbnail`                                      | Optional base64 `data:` image (png, jpeg, webp, svg)                                                                                                         | 200,000 characters    |
| `brief.mood`, `brief.pacing`, `brief.qualityBar` | How it feels, how fast it cuts, what "good" means                                                                                                            | 200, 300, 300         |
| `brief.structure`                                | The sections in order                                                                                                                                        | 1 to 12 lines of 200  |
| `brief.doNot`                                    | What to avoid                                                                                                                                                | up to 12 lines of 200 |
| `look`                                           | Optional `themeId`, `palette` (background, primary, accent, text, extra), `fonts` (heading, body), `motion` (calm, snappy, bouncy, cinematic)                | hex colours           |
| `kit`                                            | `preferLibrary`, `presets`, `transitions`, `effects`: ids, or `{id, optional: true}`                                                                         | 24 each               |
| `inputs.accepts`                                 | `topic`, `script`, `audio`, `video`, `reference`, `logo`, `brand`                                                                                            | each once             |
| `assetPolicy`                                    | `order` (starts with `library`; `ai` only last), `aiImagesMax` (0 to 50), `aiVideosMax` (0 to 20)                                                            |                       |
| `output`                                         | `aspect` (16:9, 9:16, 1:1, 4:5, 2:3, 21:9, 4:3), `fps` (12 to 120), `durationHint`                                                                           | 60 characters         |
| `defaultFreedom`                                 | `strict`, `guided` or `free`                                                                                                                                 |                       |

## Rules (quality gate)

- Every free-text field refuses URLs (`http://`, `https://`, `www.`, `ftp://`): a style is offline text and never fetches anything.
- Kit ids: a required id that the editor does not have rejects the item ("Unknown kit preset X"). An `optional` id that is missing is a warning. Presets are checked against the Animate presets (In, Out, Loop, Ken Burns) and the pack's own presets; transitions and effects against the FX catalog; `preferLibrary` against the built-in library and My library.
- `pack:check` loads the FX catalog itself, so its result matches the editor's. Without a catalog the kit check is a warning ("Kit ids not checked").
- A positive `aiImagesMax` or `aiVideosMax` needs `ai` in `order`.

## Examples

`examples/creator-packs/style-documentary.json`, `style-youtube-intro.json`, `style-logo-reveal-2d.json` (valid) and `bad-style-kit.json` (rejected: a required preset that does not exist). `expected.json` lists their results. The authoring guide (docs/CREATOR-PACK-AUTHORING.md, "Style") has the logo reveal as the worked example.

## In the editor

- AI › Styles lists every style as a card: the palette swatches, the category icon and the name (`src/ui/style-card.ts`; a style's own `thumbnail` is not used yet).
- "⋯": Rename, Use this style, Duplicate, Export (a one-item `.creatorpack.json` that AI › Import reads again), Move to folder, Details, Delete (with Restore).
- "+" and a click are "Use this style": the New AI video form opens with the style chosen.
- When the brief is copied, the chosen style is written out in full (`=== STYLE ===`): description, mood, pacing, structure, what to avoid, quality bar, look, kit, inputs, asset policy, output and default freedom.
