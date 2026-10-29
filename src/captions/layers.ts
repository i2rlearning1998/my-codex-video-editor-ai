// CAP (D-270): a caption track becomes ordinary editor layers: one text
// layer per cue (inside a group with its box when the style has one), each
// with its own clip on one new text lane at the top. So moving, trimming,
// animation, the theme and export all just work. Each text layer keeps its
// cue in the string property `captionCue` (JSON: version, id, start, end,
// words, language, style id), so editing can find cues again. No schema
// change; deterministic ids from `idPrefix`.
import {
  createLayer,
  number,
  vector2,
  type Command,
  type Layer,
  type Property,
} from '../core';
import type { CaptionCue } from '../speech/captions';
import { karaokeProperty } from './karaoke';
import type { CaptionStyle } from './styles';
import type { CaptionTrack } from './track';

export const CAPTION_CUE_KEY = 'captionCue';
const LINE_HEIGHT = 1.2;

export interface CaptionPlacement {
  readonly compositionId: string;
  /** The scene's canvas size. */
  readonly width: number;
  readonly height: number;
  /** Seconds subtracted from cue times (a scene's start in a joined video). */
  readonly offset?: number;
  /** Cues are cut at this scene time (the scene's length). */
  readonly end?: number;
  /** Prefix of every id made (layers, clips and the lane). */
  readonly idPrefix: string;
  /** Ids already in the project; made ids avoid them (and are added). */
  readonly usedIds?: Set<string>;
  /** Where the caption lane goes (MOVE_TRACK index; default 0, the top). */
  readonly laneIndex?: number;
}
export interface CaptionCommands {
  readonly label: string;
  readonly commands: Command[];
  readonly trackId: string;
  /** The text layer of each placed cue, in cue order. */
  readonly textLayerIds: string[];
}
/** What `captionCue` holds. */
export interface CaptionCueMarker {
  readonly version: 1;
  readonly id: string;
  readonly start: number;
  readonly end: number;
  readonly words: CaptionCue['words'];
  readonly approximate?: true;
  readonly language: string;
  readonly styleId: string;
}

const plain = <T extends 'string' | 'color' | 'boolean'>(
  type: T,
  value: T extends 'boolean' ? boolean : string,
) =>
  ({
    type,
    value,
    animated: false,
    keyframes: [],
    constraints: [],
  }) as unknown as Property;

function idMaker(prefix: string, used: Set<string>) {
  return (suffix: string) => {
    const base = `${prefix}-${suffix}`.slice(0, 120);
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  };
}

/** The box and text geometry of a caption on a canvas. */
export function captionLayout(
  style: CaptionStyle,
  lines: number,
  canvas: { readonly width: number; readonly height: number },
) {
  // FIX9: sizes follow the SHORT side, so a tall 9:16 video does not get
  // captions 1.8 times too big (they wrapped into extra lines and were cut).
  const scale = Math.min(canvas.width, canvas.height) / 1080;
  const fontSize = Math.round(style.fontSize * scale);
  const pad = style.box ? Math.round(style.box.padding * scale) : 0;
  const lower = style.position === 'lower-third';
  const width = Math.round(canvas.width * (lower ? 0.55 : 0.84));
  const textHeight = Math.ceil(fontSize * LINE_HEIGHT * lines);
  const height = textHeight + pad * 2;
  const margin = Math.round(canvas.height * 0.07);
  // FIX7: a tall (9:16) video plays under the app's own buttons and title
  // at the bottom, so its captions keep out of the lowest fifth.
  const portrait = canvas.height > canvas.width;
  const bottomSafe = portrait ? Math.round(canvas.height * 0.2) : margin;
  const x = lower
    ? Math.round(canvas.width * 0.06)
    : (canvas.width - width) / 2;
  const raw =
    style.position === 'top'
      ? margin
      : style.position === 'middle'
        ? (canvas.height - height) / 2
        : style.position === 'lower-third'
          ? Math.round(canvas.height * 0.72)
          : canvas.height - bottomSafe - height;
  const y = Math.max(
    margin,
    Math.min(raw, canvas.height - bottomSafe - height),
  );
  return { fontSize, pad, x, y, width, height, textHeight };
}

/** Scripts whose letters run wider than Latin ones (Devanagari and kin). */
const WIDE_SCRIPT =
  /^(hi|mr|ne|sa|bn|gu|pa|ta|te|kn|ml|or|as|ur|ar|fa|th)\b/i;

/**
 * FIX9: how many characters fit on one caption line of this style on this
 * canvas. Cues used to break at a fixed 42 characters whatever the canvas was,
 * so on a narrow (9:16) video a line wrapped again inside its box and the
 * last words were cut off. The average advance is taken a little wide so a
 * line never wraps on its own; the style's own limit is the ceiling.
 */
export function captionMaxChars(
  style: CaptionStyle,
  canvas: { readonly width: number; readonly height: number },
  language = 'en',
): number {
  const layout = captionLayout(style, 1, canvas);
  const inner = layout.width - layout.pad * 2;
  const em =
    (WIDE_SCRIPT.test(language) ? 0.66 : 0.58) *
    (style.textCase === 'upper' ? 1.2 : 1) *
    (style.fontWeight >= 700 ? 1.06 : 1);
  const fit = Math.floor(inner / (layout.fontSize * em));
  return Math.max(16, Math.min(style.maxCharsPerLine, fit));
}

export function captionMarker(
  cue: CaptionCue,
  track: Pick<CaptionTrack, 'language' | 'style'>,
): CaptionCueMarker {
  return {
    version: 1,
    id: cue.id,
    start: cue.start,
    end: cue.end,
    words: cue.words.map((word) => ({ ...word })),
    ...(cue.approximate ? { approximate: true as const } : {}),
    language: track.language,
    styleId: track.style.id,
  };
}

/** The text (and box) layer of one cue, timed in scene time. */
export function captionLayer(
  cue: CaptionCue,
  track: Pick<CaptionTrack, 'language' | 'style'>,
  canvas: { readonly width: number; readonly height: number },
  ids: { readonly text: string; readonly box: string; readonly group: string },
  offset = 0,
  end = Infinity,
): Layer {
  const style = track.style;
  const start = Math.max(0, cue.start - offset);
  const duration = Math.min(cue.end - offset, end) - start;
  const layout = captionLayout(style, cue.lines.length, canvas);
  const content = cue.lines.join('\n');
  const text = createLayer(
    ids.text,
    'text',
    `Caption: ${cue.lines.join(' ')}`.slice(0, 256),
    duration,
  );
  text.startTime = start;
  text.properties = {
    width: number(layout.width - layout.pad * 2),
    height: number(layout.textHeight),
    text: plain('string', content),
    fontSize: number(layout.fontSize),
    fill: plain('color', style.color),
    fontFamily: plain('string', style.fontFamily),
    fontWeight: number(style.fontWeight),
    textAlign: plain('string', style.align),
    lineHeight: number(LINE_HEIGHT),
    ...(style.textCase !== 'none'
      ? { textCase: plain('string', style.textCase) }
      : {}),
    [CAPTION_CUE_KEY]: plain(
      'string',
      JSON.stringify(captionMarker(cue, track)),
    ),
    ...(style.karaoke && cue.words.length
      ? { textRuns: karaokeProperty(cue, content, style, offset) }
      : {}),
  };
  if (!style.box) {
    text.transform.position = vector2(
      layout.x + layout.pad,
      layout.y + layout.pad,
    );
    return text;
  }
  text.transform.position = vector2(layout.pad, layout.pad);
  const box = createLayer(ids.box, 'shape', 'Caption box', duration);
  box.startTime = start;
  box.properties = {
    width: number(layout.width),
    height: number(layout.height),
    shapeKind: plain('string', 'rectangle'),
    fill: plain('color', style.box.color),
    fillOpacity: number(style.box.opacity),
    cornerRadius: number(Math.round(style.box.radius * (canvas.height / 1080))),
  };
  const group = createLayer(
    ids.group,
    'group',
    `Caption ${cue.id}`.slice(0, 256),
    duration,
  );
  group.startTime = start;
  group.transform.position = vector2(layout.x, layout.y);
  group.children = [box, text];
  return group;
}

/**
 * The commands that add `track` to one scene: a new text lane ("Captions")
 * and a layer and clip per cue that starts inside the scene (cut at `end`).
 * Run as one transaction.
 */
export function captionCommands(
  track: CaptionTrack,
  placement: CaptionPlacement,
): CaptionCommands {
  const used = placement.usedIds ?? new Set<string>();
  const id = idMaker(placement.idPrefix, used);
  const offset = placement.offset ?? 0;
  const end = placement.end ?? Infinity;
  const { compositionId } = placement;
  const trackId = id('lane');
  const commands: Command[] = [
    {
      type: 'CREATE_TRACK',
      compositionId,
      track: {
        id: trackId,
        name: 'Captions',
        type: 'text',
        order: 1_000_000,
        enabled: true,
        locked: false,
        muted: false,
        clips: [],
      },
    },
    {
      type: 'MOVE_TRACK',
      compositionId,
      trackId,
      index: placement.laneIndex ?? 0,
    },
  ];
  const textLayerIds: string[] = [];
  track.cues.forEach((cue, index) => {
    const start = cue.start - offset;
    if (start < -1e-9 || start >= end - 1e-6) return;
    if (Math.min(cue.end - offset, end) - Math.max(0, start) <= 1e-6) return;
    const n = index + 1;
    const ids = {
      text: id(`text-${n}`),
      box: id(`box-${n}`),
      group: id(`cue-${n}`),
    };
    const layer = captionLayer(cue, track, placement, ids, offset, end);
    textLayerIds.push(ids.text);
    commands.push(
      { type: 'CREATE_LAYER', compositionId, parentId: null, layer },
      {
        type: 'CREATE_CLIP',
        compositionId,
        trackId,
        clip: {
          id: id(`clip-${n}`),
          name: layer.name,
          layerId: layer.id,
          assetId: null,
          startTime: layer.startTime,
          duration: layer.duration,
          sourceIn: 0,
          sourceOut: layer.duration,
          enabled: true,
          speed: 1,
          transitionMetadata: {},
          effectMetadata: {},
          metadata: { role: 'caption' },
        },
      },
    );
  });
  // A lane without clips is not added.
  return {
    label: 'Add captions',
    commands: textLayerIds.length ? commands : [],
    trackId,
    textLayerIds,
  };
}
