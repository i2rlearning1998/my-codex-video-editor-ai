// CAP (D-270): finding and editing captions already in a scene. Every
// caption text layer keeps its cue in `captionCue`; its clip (or its box
// group's clip) gives where the cue is now, so a moved caption keeps its
// words in step.
import type { Command, Composition, Layer, Property } from '../core';
import type { CaptionCue } from '../speech/captions';
import { karaokeProperty } from './karaoke';
import {
  CAPTION_CUE_KEY,
  captionMarker,
  type CaptionCueMarker,
} from './layers';
import { captionStyle, CAPTION_STYLES, type CaptionStyle } from './styles';
import { editCueText, type CaptionTrack } from './track';

/** Any scene (a draft, a snapshot or a frozen state); read only. */
export interface SceneLike {
  readonly id: string;
  readonly layers: readonly object[];
  readonly tracks: readonly object[];
}
/** A caption found in a scene. Times are scene seconds (where it is now). */
export interface FoundCaption {
  readonly textLayerId: string;
  /** The top-level layer that holds the clip (the box group, or the text). */
  readonly layerId: string;
  readonly clipId: string | null;
  readonly marker: CaptionCueMarker;
  /** The cue at its current place: its clip's start and end. */
  readonly cue: CaptionCue;
  readonly text: string;
}

/** The cue marker of a text layer, or null (read defensively). */
export function readCaptionCue(layer: {
  readonly properties: Readonly<Record<string, unknown>>;
}): CaptionCueMarker | null {
  const property = layer.properties[CAPTION_CUE_KEY] as
    { readonly type?: string; readonly value?: unknown } | undefined;
  if (property?.type !== 'string' || typeof property.value !== 'string')
    return null;
  try {
    const value = JSON.parse(property.value) as Partial<CaptionCueMarker>;
    if (
      value.version !== 1 ||
      typeof value.id !== 'string' ||
      !Number.isFinite(value.start) ||
      !Number.isFinite(value.end) ||
      !Array.isArray(value.words)
    )
      return null;
    return value as CaptionCueMarker;
  } catch {
    return null;
  }
}

const textOf = (layer: Layer) => {
  const text = layer.properties.text;
  return text?.type === 'string' ? text.value : layer.name;
};

/** Every caption in a scene, in time order. */
export function findCaptions(input: SceneLike): FoundCaption[] {
  const composition = input as unknown as Composition;
  const clips = composition.tracks.flatMap((track) => track.clips);
  const found: FoundCaption[] = [];
  const visit = (layers: Layer[], top: Layer | null) => {
    for (const layer of layers) {
      const holder = top ?? layer;
      const marker = layer.type === 'text' ? readCaptionCue(layer) : null;
      if (marker) {
        const clip = clips.find((c) => c.layerId === holder.id) ?? null;
        const start = clip ? clip.startTime : holder.startTime;
        const end = clip
          ? clip.startTime + clip.duration
          : start + holder.duration;
        // Words follow the caption when it is moved.
        const delta = start - marker.start;
        const text = textOf(layer);
        found.push({
          textLayerId: layer.id,
          layerId: holder.id,
          clipId: clip?.id ?? null,
          marker,
          text,
          cue: {
            id: marker.id,
            start,
            end,
            lines: text.split('\n').filter(Boolean),
            words: marker.words.map((word) => ({
              ...word,
              start: word.start + delta,
              end: word.end + delta,
            })),
            ...(marker.approximate ? { approximate: true } : {}),
          },
        });
      }
      visit(layer.children, holder);
    }
  };
  visit(composition.layers, null);
  return found.sort((a, b) => a.cue.start - b.cue.start);
}

/** The scene's captions as a track (for SRT or VTT export, or resplit). */
export function captionTrackOf(
  composition: SceneLike,
  options: { readonly style?: CaptionStyle; readonly offset?: number } = {},
): CaptionTrack {
  const found = findCaptions(composition);
  const offset = options.offset ?? 0;
  const style =
    options.style ??
    captionStyle(
      (CAPTION_STYLES as Record<string, CaptionStyle>)[
        found[0]?.marker.styleId ?? ''
      ] ?? CAPTION_STYLES.clean,
    );
  return {
    version: 1,
    language: found[0]?.marker.language ?? 'und',
    style,
    cues: found.map(({ cue }) => ({
      ...cue,
      start: cue.start + offset,
      end: cue.end + offset,
      words: cue.words.map((w) => ({
        ...w,
        start: w.start + offset,
        end: w.end + offset,
      })),
    })),
  };
}

/**
 * The commands that change one caption's text and keep its timing: the
 * text, the cue marker (word timings kept when the word count is the same)
 * and, for karaoke, the highlight. One undo step ("Edit caption").
 */
export function editCaptionCommands(
  input: SceneLike,
  textLayerId: string,
  text: string,
): { readonly label: string; readonly commands: Command[] } {
  const found = findCaptions(input).find((c) => c.textLayerId === textLayerId);
  if (!found) throw new Error(`Layer ${textLayerId} is not a caption`);
  const cue = editCueText(found.cue, text);
  const content = cue.lines.join('\n');
  const string = (value: string): Property => ({
    type: 'string',
    value,
    animated: false,
    keyframes: [],
    constraints: [],
  });
  const style =
    (CAPTION_STYLES as Record<string, CaptionStyle>)[found.marker.styleId] ??
    CAPTION_STYLES.clean;
  const set = (key: string, property: Property): Command => ({
    type: 'SET_PROPERTY',
    compositionId: input.id,
    layerId: textLayerId,
    target: { kind: 'property', key },
    property,
  });
  // The marker keeps the cue's original frame (its first place).
  const delta = found.cue.start - found.marker.start;
  const shifted: CaptionCue = {
    ...cue,
    start: cue.start - delta,
    end: cue.end - delta,
    words: cue.words.map((w) => ({
      ...w,
      start: w.start - delta,
      end: w.end - delta,
    })),
  };
  const commands: Command[] = [
    set('text', string(content)),
    set(
      CAPTION_CUE_KEY,
      string(
        JSON.stringify(
          captionMarker(shifted, {
            language: found.marker.language,
            style: { ...style, id: found.marker.styleId },
          }),
        ),
      ),
    ),
  ];
  const layer = locate(input as unknown as Composition, textLayerId);
  if (layer?.properties.textRuns?.animated && cue.words.length)
    commands.push(set('textRuns', karaokeProperty(cue, content, style)));
  return { label: 'Edit caption', commands };
}

function locate(composition: Composition, id: string): Layer | undefined {
  const walk = (layers: Layer[]): Layer | undefined => {
    for (const layer of layers) {
      if (layer.id === id) return layer;
      const inner = walk(layer.children);
      if (inner) return inner;
    }
    return undefined;
  };
  return walk(composition.layers);
}
