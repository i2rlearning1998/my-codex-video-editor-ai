# Captions engine

Engine only (`src/captions`). Nothing in the UI is wired yet. No schema change and no new dependency (D-270).

## How it works

1. **Transcribe** through an injected STT provider (`SttProvider` from src/speech/types.ts: Deepgram, Sarvam, a local engine or a fake in tests). No network call is made here except the provider's own.
2. **Cut cues** with the speech engine's own rules, `toCaptionCues` (src/speech/captions.ts): word-aligned cues keep exact word timings; segment-only results are split by length and marked `approximate`. Options: characters per line, lines per cue (`maxLines`, new and optional, default 2), minimum and maximum duration.
3. **Style** from a preset (plain data): font, size (units at a 1080 px tall canvas, scaled to the scene), weight, colour, alignment, box, position, lines, characters per line, case, karaoke and its highlight colour.
4. **Place** as ordinary layers through the Command Bus: one text lane ("Captions") at the top; per cue a text layer (inside a group with a rounded box when the style has a box) and its clip. Moving, trimming, the theme, animation presets and export work as for any text.
5. **Keep the cue** in each caption text layer: the string property `captionCue` (JSON: version, cue id, start, end, words, approximate, language, style id). Editing finds cues through it; the clip says where the cue is now, so a moved caption keeps its words in step.

## Style presets (`CAPTION_STYLES`)

| Id            | Look                                                                                   |
| ------------- | -------------------------------------------------------------------------------------- |
| `clean`       | Inter 52 / 600, white, centred, a 45 % black box, bottom, 2 lines of 42                |
| `bold-box`    | Poppins 64 / 800, upper case, a solid dark box, bottom, 2 lines of 32                  |
| `karaoke`     | Poppins 60 / 700, spoken words in yellow and the current one underlined, a box, bottom |
| `lower-third` | Inter 44 / 600, left aligned, a navy box at the lower third, 55 % of the width         |
| `minimal`     | Inter 44 / 500, white, no box, bottom, 1 line of 48                                    |

Positions: `bottom`, `middle`, `top`, `lower-third` (any style takes any position).

## API (`src/captions/index.ts`)

| Name                                                                                                                                                  | What it does                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `autoCaption(media, {stt, lang?, style?, position?, language?, maxCharsPerLine?, maxLines?, minDuration?, maxDuration?, signal?, onProgress?})`       | Transcribes a `Blob` or `{url}` and returns a `CaptionTrack` `{version: 1, language, style, cues}`.                                                                                                                                                         |
| `captionTrackFromTranscription(transcription, options)`                                                                                               | The same from a transcription already made (no I/O).                                                                                                                                                                                                        |
| `resplit(track, options)`                                                                                                                             | Cuts a track again (new line length, lines, style), keeping every word's timing; cue ids are renumbered.                                                                                                                                                    |
| `editCueText(cue, text)`, `editTrackCue(track, cueId, text)`                                                                                          | New text, same start and end. Same word count: word timings kept; otherwise spread over the cue by length and marked approximate.                                                                                                                           |
| `cueWords(cue)`                                                                                                                                       | A cue's words, or its text spread over its time.                                                                                                                                                                                                            |
| `captionCommands(track, {compositionId, width, height, idPrefix, offset?, end?, usedIds?, laneIndex?})`                                               | `{label: 'Add captions', commands, trackId, textLayerIds}` for one scene: cues that start inside it (cue time minus `offset`), cut at `end`. Deterministic ids from `idPrefix`, avoiding `usedIds`.                                                         |
| `captionLayer`, `captionLayout`, `captionMarker`, `CAPTION_CUE_KEY`                                                                                   | The pieces of the above.                                                                                                                                                                                                                                    |
| `findCaptions(scene)`                                                                                                                                 | Every caption in a scene: text layer, holder layer, clip, marker, text and the cue where it is now.                                                                                                                                                         |
| `captionTrackOf(scene, {style?, offset?})`                                                                                                            | The scene's captions back as a track (for export or `resplit`).                                                                                                                                                                                             |
| `editCaptionCommands(scene, textLayerId, text)`                                                                                                       | `{label: 'Edit caption', commands}`: the text, the marker and (karaoke) the highlight, timing kept. One undo step.                                                                                                                                          |
| `karaokeWords(cue, text, offset?)`, `karaokeSteps(...)`, `karaokeProperty(...)`, `karaokeCommands(compositionId, layerId, cue, text, style, offset?)` | Karaoke data: each word's time range and character range, and the steps of the highlight as an animated `textRuns` property (held string keyframes, D-070; rich text runs, J4). Only colour and underline change, so the layout never moves. Deterministic. |
| `toSrt(cues)`, `parseSrt(text)`, `toVtt(cues)`, `parseVtt(text)`                                                                                      | Export and import to the millisecond. VTT writes a WebVTT timestamp before every word, so word timings come back (a word's end is read as the next word's start); SRT has no words.                                                                         |
| `createCaptionsHook({cues \| track, style?, position?, language?})`                                                                                   | A `CaptionsHook` for `buildProjectFromComposition` (docs/COMPOSITION-ADAPTER.md). Each cue goes to the scene it starts in, in that scene's time, cut at the scene's end; ids are `captions-<scene>-…`.                                                      |
| `createCaptionsHook({stt, media, ...autoCaption options})`                                                                                            | Transcribes first and resolves to the hook (the adapter's hook is synchronous).                                                                                                                                                                             |

## What the UI must wire

1. **Auto Caption** (right rail, planned): pick the voice-over or a clip's audio (`Blob` from the media store), a provider from the speech registry, a language, a style and a position; call `autoCaption`, then `engine.commands.transaction(...captionCommands(track, {compositionId, width, height, idPrefix: <fresh>}))`. In a joined project use the scene's start as `offset` and its length as `end`.
2. **Edit a caption**: on-canvas text editing should call `editCaptionCommands` on commit for a layer with `captionCue` (the J4 editor writes `text` only today, so the marker's words would go stale).
3. **Captions panel**: list `findCaptions(scene)`; Re-split (`resplit` of `captionTrackOf`, then delete the old lane's layers and add the new track in one transaction); Export SRT or VTT (`toSrt(captionTrackOf(scene).cues)`); Import (`parseSrt` / `parseVtt`, then `captionCommands`).
4. **Composition adapter**: pass `captions: createCaptionsHook(...)` to `buildProjectFromComposition`.

## Gaps

- Text has no outline or shadow (TXT-019), so readable styles use a box.
- The karaoke highlight is colour and underline only (no bouncing or scaling word).
- A re-split replaces layers; it does not keep manual edits to a caption's position or style.
- VTT word ends are approximated by the next word's start; SRT keeps no words. Styling in SRT and VTT files (`<b>`, positions) is dropped on import.
- Captions are not translated; `language` is stored only.
