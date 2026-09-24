# Brief W5-C: animation presets, fades, Ken Burns and the easing library

Wave: 5, part C. Base: PR #5 head `6b4ca64` (W5-B). End tag: `w5-c` (created at merge). Branch: `claude/wave-5-presets`, PR #6 against `claude/wave-5-animation`.
Authority: `AGENTS.md`, then this brief, then `docs/FEATURES.md`.

## 1. Goal

One click animates a layer:

- **In:** fade, slide, zoom, pop, wipe or typewriter.
- **Out:** the same six.
- **Loop:** pulse, float, spin or wiggle.
- **Ken Burns** on images: a slow pan and zoom.

Durations and loop speeds are adjustable. Presets follow the clip when it is moved or trimmed: a fade-out always ends with the clip.

Keyframes also get an **easing library**: named curves with drawn previews, applied in one click.

## 2. In scope (ledger IDs)

- ANI-007: animation presets.
- ANI-008: Ken Burns.
- ANI-010: easing preset library with visual previews.

## 3. Out of scope

- **Per-character text animation (ANI-012).** Typewriter here reveals characters in order, without per-character motion.
- **Masks (MSK)** and **motion paths (ANI-011).** Wipe is a rectangular reveal drawn by the preset, not a mask.
- **Transitions between clips (TR)** and **audio fades (AUD).**
- **Baking presets into keyframes,** and presets on audio layers.

## 4. Ledger Change Requests to apply first

Reword CV-036, CV-037 and CV-038 so that **Animate** is a live control that opens the presets (ANI-007). The rest of each row is unchanged:

- **CV-036:** "…Crop, Blend and Replace show disabled with a tooltip naming the wave that builds them; Animate opens the animation presets"
- **CV-037:** "…Font, Weight, Align, Spacing and Effects show disabled with a tooltip naming their wave; Animate opens the animation presets"
- **CV-038:** "…Stroke, Width, Corners and Boolean show disabled with a tooltip naming their wave; Animate opens the animation presets. A drawing's toolbar edits its Color, Brush size and Opacity"

## 5. Contracts, schema and dependencies

- **Schema stays 5.**
  - Presets live in `clip.metadata.animation`, following the D-033 pattern: `{ in?, out?, loop?, kenBurns? }`.
  - They are set by a new `SET_CLIP_ANIMATION` command (`clipId`, a `slot`, and a value or null), refused on locked tracks.
  - Values are validated at the command boundary and read defensively. Unknown or invalid values are ignored when drawing.
- **Presets are applied only when drawing** (preview and export share `src/render/presets.ts`), on top of keyframe evaluation. Hit-testing, selection handles and edits use the layer's resting geometry, so an edit during an animation never bakes preset offsets into the layer (D-072).
- The transform contracts are unchanged. Presets produce ordinary transform values, and zoom, pop, pulse and spin scale or rotate about the layer's visual center with the contract's compensation.
- No new dependencies.

## 6. Design notes

- **In and Out presets.** Progress runs over the preset's duration (0.1 to 5 s, default 0.5 s) from the clip start (In) or towards the clip end (Out). In eases out; Out eases in. If In plus Out exceed the clip, both shrink proportionally.
  - **Fade:** opacity 0 → 1.
  - **Slide:** from 15% of the composition height below (the direction can be up, down, left or right), plus a fade.
  - **Zoom:** scale 0.6 → 1 about the center, plus a fade.
  - **Pop:** scale 0 → 1.1 → 1 about the center.
  - **Wipe:** a left-to-right reveal of the layer's box.
  - **Typewriter:** text layers only; shows the first ⌈n·p⌉ characters.
- **Loop presets** run over the whole clip. Their period is 0.5 to 5 s (default 1.5 s).
  - **Pulse:** scale 1 ± 6%.
  - **Float:** y ± 12 px.
  - **Spin:** 360° per period.
  - **Wiggle:** a few degrees of smooth pseudo-random rotation.
- **Ken Burns** is for image layers only: scale 1 → 1.15 about the center, plus a pan of 3% of the layer width, across the whole clip. There is a direction toggle, zoom in or zoom out.
- **The Animate panel** is a popover under the context toolbar. It opens from the toolbar's **Animate** button, and closes with Esc or a click elsewhere.
  - Tabs: In, Out, Loop, and Pan & zoom (image layers only).
  - Each tab has a "None" card, the preset cards (aria-pressed marks the active one), and a Duration or Speed slider with a number field. The Slide cards have a direction select.
  - Choosing a card, or changing a value, is one undo step: "Set animation".
  - Presets show a badge on the timeline clip.
- **Easing library (ANI-010).** The Inspector's keyframe editor gets a grid of named curves, each drawn as a small SVG curve with a dot that runs along it on hover or focus. Clicking one applies it as a custom cubic to the selected keyframes, in one undo step. The curves are:
  - Smooth `.45,0,.55,1`
  - Gentle `.25,.1,.25,1`
  - Snappy `.2,.9,.3,1`
  - Slow start `.7,0,.84,0`
  - Slow end `.16,1,.3,1`
  - Anticipate `.36,0,.66,-.56`
  - Overshoot `.34,1.56,.64,1`

## 7. Steps

1. Brief, LCR and decisions.
2. The command with its validation, then `src/render/presets.ts`. Unit tests.
3. Wire the presets into the renderer and the export worker.
4. The Animate panel, the toolbar button and clip badges.
5. The easing library.
6. Playwright tests, docs, report and verify. Open PR #6.

## 8. Required tests

- **ANI-007:**
  - A Fade In of 1 s: at 0.5 s the canvas pixel is a half blend. Undo removes it.
  - A Slide Out: near the clip end the layer is drawn lower.
  - A Pulse loop changes the size over time.
  - Typewriter shows part of the text half-way through.
  - Changing the duration changes the result.
  - Presets follow a trimmed clip end.
  - The exported frame matches the preview.
- **ANI-008:** Ken Burns on an image clip: the image is larger at the end than at the start, and the pan moves it.
- **ANI-010:** the library shows curve previews. Choosing "Overshoot" sets that cubic on the selected keyframes, and the canvas value half-way changes accordingly.
- **Unit tests:** the preset maths, command validation and proportional shrinking.

## 9. Acceptance

- [ ] `npm run verify` exits 0
- [ ] ANI-007, ANI-008 and ANI-010 are Verified
- [ ] Report written, PR #6 open (not merged), working tree clean

## 10. Stop rules

Stop if the work needs a schema change, a mask system or a new dependency.
