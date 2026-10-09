# Starter block library v2

Fourteen original source blocks, isolated from the editor. PR #21 was confirmed
merged before branching from main `69bcb5e`. No renderer, schema, sandbox or
runtime dependency changes. This library is **built; browser appearance and
pixel parity are not yet verified in this environment**.

## Contract and use

`src/blocks/library/index.ts` exports `blockLibrary` (frozen entries with id,
name, category and source) and `getLibraryBlock(id)`. Each source is one
parenthesized JavaScript object accepted by the existing `compileBlock`.
Compile once, validate/default parameters with `validateParams`, then pass the
successful unchanged compiler result to the existing `createSandbox().render`.
Dispose the client when finished. Never evaluate source on the application main
thread. The test harness evaluates only checked-in trusted fixtures against a
recording context; it is not the production execution path.

Every block has version `1.0.0`, 5–9 parameters, a thumbnail time, explicit duration,
and fewer than 12,000 source characters (enforced per item). Dimensions scale from
a 960×540 design space; non-16:9 dimensions stretch that space. Canvas outside the
drawn artwork stays transparent. A panel or paper shape may itself be opaque.
No images, fonts, real logos, external assets, network calls or copied artwork
are used. Text uses the installed Arial fallback policy of the original gallery.

`t` is clip-local seconds; rendering is stateless. Confetti uses closed-form
ballistic motion and clamps age at its lifetime. Glitch offsets and the decorative
sparkline use indexed seeded samples. All other motion is analytic. Each source
balances its own save/restore; the existing worker owns clearing and clipping.
Defaults fill omitted fields, unknown fields and invalid values are rejected;
numeric step is a UI hint, not quantization. For reproducibility keep source,
parameters, time, seed, dimensions, browser and fonts identical.

## Selection guide

All items below are Claimed for visual output, with compilation, parameter
validation and recording-call determinism tested locally. The last column gives
three sentences an AI can use when choosing the block.

| ID                | Name                 | Category           | Parameters                                                  | Best use                              | AI selection guidance                                                                                                                                                                                                 |
| ----------------- | -------------------- | ------------------ | ----------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lower-third       | Offset lower third   | Titles             | title, subtitle, ink, accent, plate, seconds, width         | Speaker identification                | Pick this for a speaker introduction over footage. Keep the title a name and the subtitle a short role. Choose another block for full-screen quotations.                                                              |
| kinetic-quote     | Measured words       | Typography         | text, author, ink, accent, seconds, size, stagger           | Single-line quotation                 | Pick this for a short statement that deserves individual letter motion. Keep the quote concise so its rhythm remains readable. Use the attribution field for a source or speaker.                                     |
| typewriter-title  | Cursor note          | Typography         | text, caption, ink, accent, rate, size, blink               | Typed chapter heading                 | Pick this for a short typed heading or journal-style note. Set rate so the entire title appears during the clip. Keep the caption small and descriptive.                                                              |
| bar-chart         | Three-way comparison | Data               | title, first, second, third, ink, accent, seconds           | Three numeric comparisons             | Pick this to compare three nonnegative values on one fixed 0–100 scale. Enter real values rather than relying on the illustrative defaults. Use the title to explain the units and categories A, B and C.             |
| line-chart        | Trace of progress    | Data               | title, start, middle, end, ink, accent, seconds, thickness  | Three-sample trend                    | Pick this for an honest trend through three supplied samples. The vertical scale is fixed at 0–100 and interpolation is linear. Use a native chart for more observations or precise axis labels.                      |
| progress-ring     | Open orbit progress  | Data               | value, label, ink, accent, radius, thickness, seconds       | Completion or goal indicator          | Pick this for a bounded percentage or completion metric. Set the label to name the measured goal. Do not use the decorative ring as a multi-category pie chart.                                                       |
| counter-sparkline | Metric with a pulse  | Data               | from, to, label, suffix, ink, accent, seconds, volatility   | Headline metric with decorative trend | Pick this for a large count with an explicitly illustrative sparkline. Supply the real target in the number parameter. The seeded line is decoration and must not be presented as measured history.                   |
| subscribe-bell    | Follow and chime     | Calls to action    | label, caption, ink, accent, plate, ring, seconds           | Generic follow reminder               | Pick this for a platform-neutral follow or subscribe reminder. Change the wording to match the actual action. The button is animation artwork and does not implement an interactive subscription.                     |
| callout-arrow     | Bent path callout    | Annotations        | label, ink, accent, targetX, targetY, thickness, seconds    | Point at a detail in footage          | Pick this to annotate a specific point behind a transparent overlay. Set target coordinates as percentages of the canvas. Keep the label short and position the underlying shot accordingly.                          |
| countdown         | Quiet countdown      | Time               | seconds, finish, label, ink, accent, radius, thickness      | Short pre-roll countdown              | Pick this for a calm countdown before a segment starts. Set the clip long enough to reach the configured finish time. The count uses clip-local seconds and never the wall clock.                                     |
| shape-reveal      | Folded compass mark  | Shapes             | accent, second, size, turn, gap, seconds, stroke            | Abstract identity reveal              | Pick this for an original abstract shape mark when no logo asset exists. Describe it as placeholder identity artwork, not an established brand. Use another workflow when a supplied logo must be reproduced exactly. |
| glitch-text       | Signal offset title  | Typography         | text, ink, accent, echo, amount, speed, size                | Digital or signal-themed title        | Pick this for restrained channel-offset typography. Keep offset low for readable titles and avoid long exposure to rapid motion. The effect is deterministic graphic displacement, not a pixel distortion filter.     |
| ribbon-wave       | Tidal ribbons        | Background accents | accent, second, amplitude, speed, bands, thickness, opacity | Transparent ambient motion            | Pick this for flowing accents behind a title. The canvas remains transparent between the ribbon strokes. Keep amplitude and opacity low when foreground readability matters.                                          |
| particle-confetti | Paper celebration    | Particles          | accent, second, count, speed, gravity, life, size, spread   | Celebration over footage              | Pick this for a finite paper-confetti burst. Set a fixed seed to preserve the arrangement during scrubbing and export. Adjust speed and gravity together to keep the burst near the subject.                          |

## Gallery and verification

Run `npm run blocks:gallery`, then choose an entry in **Library**. Selection
loads its exact source and triggers the existing compiler. It appears in the
existing custom-block selector; the controls are generated from its ParamSpec.
Time starts at its thumbnailTime. Scrub, change parameters, inspect the source,
then press **Export check**. The existing checker must report `pass: true`,
`maxDifference: 0`, `tolerance: 0` at its five sample times. Its diagnostic
`displayRoundTripMaxDifference` is separate from parity, as documented in
CODE-LAYER.md; no comparison or tolerance was changed here.

`npm run blocks:library:check` runs the 43 unit tests then the 14 Playwright cases.
The browser cases click Library buttons, require nontransparent pixels and some
fully transparent pixels at the thumbnail pose, compare visible 3→1→3 pixels,
and invoke the **existing** export checker for exact five-time worker/display
parity. Console and page errors fail the test. The normal `npm run check` includes
the new unit tests. The default `npm run verify` searches only `e2e/`, so the new
browser suite requires the separate command on an owner or CI machine; existing
CI does **not** automatically run it. Workflow and existing e2e edits were outside
this task's allowed paths. A future CI session should add this command explicitly.

The library follows the custom worker path: parity compares independently rendered
worker buffers, plus matching visible/Offscreen display uploads. It does not prove
native main-thread rendering, encoded video, cross-machine fonts, or editor
integration. No direct execution fallback has been added.

## Decisions and limits

- D-250: The owner's new-folder scope takes precedence over generic wave updates.
  Decisions, progress and gaps stay in the three authorized documents; ledger,
  status, changelog, other briefs and workflow files remain unchanged.
- D-251: Store self-contained source fixtures, rather than a second trusted runtime
  registry. This guarantees that AI can copy each actual implementation into the
  existing compiler and preserves the working sandbox without modifications.
- D-252: Add only a Library selection section to the gallery. Reuse its current
  compile, parameter, scrub, benchmark and export-check controls unchanged.
- D-253: Browser regression tests and their isolated configuration live under the
  authorized tests folder. No tolerance is weakened and no test is skipped to
  manufacture a passing result. Pixel parity remains Claimed until those cases run.
- D-254: Data charts expose three values, not an arbitrary data-table parser. The
  counter sparkline is explicitly labelled illustrative, never measured history.
  Shape reveal is an original abstract mark, not an uploaded-logo capability.

Known limits: single-line text (long input is compressed to fit); three-sample
charts on a fixed 0–100 scale; no data import, text wrapping, custom fonts or
image logo; aspect stretching outside 16:9; no automatic entrance/exit padding;
countdown and typing duration must be chosen to fit configured content. Confetti
fades to empty after its lifetime by design. Empty strings or fully transparent
colors can intentionally hide artwork. Visual quality, 1080p performance and
hardware-specific rasterization require owner/browser testing. No item is wired
into the editor or its media exporter.
