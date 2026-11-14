// P2-R2 (P2B-18): the capability sheet the planning model reads. It is made
// from the code's own registries (the Video Plan schema lists, the starter
// kit, the graphics blocks and their settings, transitions, caption styles,
// camera controllers), so it never drifts from what the editor can build.
// `npm run docs:capability-sheet` writes the same text to docs.
import { CAMERA_EASINGS, CONTROLLERS } from '../ai-spec/camera-names';
import { blocks } from '../blocks/starters';
import type { ParamSpec } from '../blocks/types';
import { hash } from '../gateway/adapters/mock';
import {
  KIT_CAPTION_STYLES,
  KIT_ITEMS,
  KIT_TRANSITIONS,
} from '../video-plan/kit-ids';
import {
  PLAN_ANCHORS,
  PLAN_ASPECTS,
  PLAN_DASHES,
  PLAN_ENTERS,
  PLAN_FORMAT,
  PLAN_LAYER_KINDS,
  PLAN_LIMITS,
  PLAN_LOOPS,
  PLAN_MEDIA_TYPES,
  PLAN_SHAPES,
  PLAN_SIZES,
  PLAN_VERSION,
  PLAN_FITS,
  PLAN_KEYFRAME_PROPS,
  PLAN_EASINGS,
  PLAN_DEF_LIMITS,
} from '../video-plan/schema';
import {
  BLEND_IDS,
  CLIP_TRANSITION_IDS,
  FX_IDS,
  PIXEL_TRANSITION_IDS,
} from '../video-plan/validate-v4';

const list = (v: readonly string[]) => v.join(', ');
const param = (p: ParamSpec) => {
  switch (p.type) {
    case 'number':
      return `${p.name} (number ${p.min}..${p.max}, default ${p.default})`;
    case 'select':
      return `${p.name} (one of ${p.options.join('|')})`;
    case 'bool':
      return `${p.name} (true|false)`;
    case 'color':
      return `${p.name} (colour #rrggbb)`;
    default:
      return `${p.name} (text)`;
  }
};

/** The plain-text sheet (stable for the same code). */
export function capabilitySheetText(): string {
  const lines = [
    `PLAN FORMAT: {"format": "${PLAN_FORMAT}", "version": ${PLAN_VERSION}, "meta": {"title", "language", "aspect", "fps", "build": "scenes"}, "scenes": [...], "overlays": [], "captions": {"enabled": true|false, "style"?}}`,
    `SCENE: {"id": a-z0-9-, "title", "narration", "durationHint" (seconds), "layers": [...], "sfx": [], "notes": "method:<id>", "transitionOut"?: {"type", "duration"}}`,
    `LIMITS: ${PLAN_LIMITS.scenes} scenes, ${PLAN_LIMITS.layers} layers, narration ${PLAN_LIMITS.narration} chars, text ${PLAN_LIMITS.text} chars.`,
    `ASPECTS: ${list(PLAN_ASPECTS)}`,
    `LAYER KINDS: ${list(PLAN_LAYER_KINDS)}`,
    `  title/text need "text"; media needs "mediaIntent": {"query", "type": ${list(PLAN_MEDIA_TYPES)}}; kit needs "kit"; shape needs "shape"; block needs "block" and optional "params".`,
    `  Positions are percent of the canvas: "at": {"x", "y"}, "width", "height"; lines, arrows: "from", "to"; arc: "radius", "startAngle", "endAngle" (degrees, 0 = right, clockwise).`,
    `ANCHORS: ${list(PLAN_ANCHORS)}`,
    `SIZES: ${list(PLAN_SIZES)}`,
    `ENTER/EXIT: ${list(PLAN_ENTERS)}`,
    `LOOPS: ${list(PLAN_LOOPS)}`,
    `SHAPES: ${list(PLAN_SHAPES)}; dash: ${list(PLAN_DASHES)}; colours "#rrggbb"`,
    `KIT ITEMS: ${list(KIT_ITEMS)}`,
    `TRANSITIONS: ${list(KIT_TRANSITIONS)}`,
    `CAPTION STYLES: ${list(KIT_CAPTION_STYLES)}`,
    `CAMERA CONTROLLERS: ${list(CONTROLLERS)}; easings: ${list(CAMERA_EASINGS)}`,
    'VERSION 4 LAYER FIELDS (all optional):',
    `  name; fx: [{"id", "params"?}] with ids ${list(FX_IDS)}`,
    '  grade: {"exposure", "contrast", "saturation", "temperature"} each -100..100',
    `  blend: ${list(BLEND_IDS.map((b) => b.replace('blend.', '')))}`,
    '  chromaKey: {"color": "#rrggbb", "similarity"?, "smoothness"?, "spill"?} (pictures and videos)',
    '  mask: {"shape": "rect"|"ellipse", "x", "y", "width", "height" (percent of the layer), "feather"?, "invert"?}',
    `  transitionIn: {"type", "duration"?} with types ${list(CLIP_TRANSITION_IDS)}`,
    `  keyframes: [{"property": ${list(PLAN_KEYFRAME_PROPS)}, "at" (s from layer start), "value" (x, y in percent; scale 1 = 100%; rotation degrees; opacity 0..1), "easing"?: ${list(PLAN_EASINGS)}}]`,
    '  preset: {"id", "controls"?} (a Creator preset of the Project kit); speed 0.1..8; reverse; sourceIn (s); volume 0..2; fadeIn; fadeOut (s)',
    `  font; letterSpacing; fit: ${list(PLAN_FITS)}; group (layers with the same group id become one group); order (higher on top); locked`,
    '  media: "queries": [up to 4 searches tried in order]; "minDuration" (s); mediaIntent.type also "sticker"',
    `SCENE TRANSITIONS (v4): also ${list(PIXEL_TRANSITION_IDS)}`,
    'META (v4): "videoType" (a type id below), "assets": {"order": ["mine","library","stock","ai"], "aiImagesMax", "aiVideosMax", "onlyMine"}',
    `NEW GRAPHICS (v4): "defs": {"blocks": [{"id", "tier": "B"|"C", "source", "meta"? (Tier C: name, duration, params), "summary"}]}; at most ${PLAN_DEF_LIMITS.defs} per plan, ${PLAN_DEF_LIMITS.params} settings each, source up to ${PLAN_DEF_LIMITS.source} characters. A layer {"kind": "block", "block": "<def id>", "params"} uses it; reuse the same id in later scenes. Never reuse a built-in id.`,
    'GRAPHICS BLOCKS (kind "block"; code layers the editor renders exactly; use these ids and settings, or a new graphic above):',
    ...blocks.map(
      (b) =>
        `- ${b.id}: ${b.name} [${b.category}], ${b.defaultDuration} s. Settings: ${b.params.map(param).join('; ') || 'none'}`,
    ),
  ];
  return lines.join('\n');
}
let cached: { text: string; version: string } | null = null;
/** The sheet and its version (a hash of its text). */
export function capabilitySheet(): { text: string; version: string } {
  if (!cached) {
    const text = capabilitySheetText();
    cached = { text, version: hash(text).toString(36) };
  }
  return cached;
}
