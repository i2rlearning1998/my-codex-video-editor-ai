// ROUND-B B3: the field library. Director sorts the first message into a
// video type (deterministic here; a real interview model may only choose
// among the owner's types), fills what the message already says, and the
// Brief card asks only for the rest. Every block, type, keyword and option
// is the owner's (Platform Config, director.fieldLibrary). Pure.
import type {
  DirectorRules,
  FieldBlock,
  PlatformConfig,
  VideoType,
} from '../platform-config';
import { DIRECTOR_LINES } from '../platform-config/director-defaults';

export type Library = DirectorRules['fieldLibrary'];
/** "You decide": Director picks. */
export const YOU_DECIDE = '*';
export type BriefValues = Record<string, string>;
type Lang = 'en' | 'hi';
type Txt = { en: string; hi?: string | undefined };
const say = (x: Txt | undefined, lang: Lang) =>
  x ? (lang === 'hi' && x.hi ? x.hi : x.en) : '';
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ');

/** One of Director's fixed lines (the owner's, else the built-in sample). */
export function line(
  c: PlatformConfig,
  key: string,
  lang: Lang,
  vars: Record<string, string | number> = {},
): string {
  const text = say(c.director.lines[key] ?? DIRECTOR_LINES[key], lang) || key;
  return text.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

export const typeById = (lib: Library, id: string): VideoType =>
  lib.types.find((t) => t.id === id) ??
  lib.types.find((t) => t.id === lib.fallbackType) ??
  lib.types[0]!;
export const blockById = (lib: Library, id: string): FieldBlock | undefined =>
  lib.blocks.find((b) => b.id === id);

/** The type whose keywords the message names most (ties: the owner's order). */
export function classifyType(lib: Library, text: string): VideoType {
  const t = ` ${norm(text)} `;
  let best: VideoType | null = null;
  let score = 0;
  for (const type of lib.types) {
    const hits = type.keywords.filter((k) => t.includes(k.toLowerCase()));
    if (hits.length > score) {
      best = type;
      score = hits.length;
    }
  }
  return best ?? typeById(lib, lib.fallbackType);
}

const LINK = /https?:\/\/[^\s]+/i;
/** What a message already answers, for the blocks of a type. */
export function fillFromText(
  lib: Library,
  type: VideoType,
  text: string,
): BriefValues {
  const out: BriefValues = {};
  const t = ` ${norm(text)} `;
  const has = (id: string) => type.blocks.some((b) => b.id === id);
  for (const ref of type.blocks) {
    const block = blockById(lib, ref.id);
    if (!block) continue;
    for (const [value, words] of Object.entries(block.hints))
      if (words.some((w) => t.includes(w.toLowerCase()))) {
        out[block.id] = value;
        break;
      }
  }
  const link = LINK.exec(text)?.[0];
  if (link && has('reference')) out.reference = link;
  const clean = text.trim();
  // A long pasted text is the person's own script.
  const long = clean.length > 400 && /[.!?।]\s/.test(clean);
  if (long && has('script')) out.script = 'mine';
  const main = has('topic') ? 'topic' : has('product') ? 'product' : null;
  if (main && clean) out[main] = clean.slice(0, 4000);
  return out;
}

export interface StyleLike {
  voice: string;
  music: string;
  scriptRules: string;
  look: { palette: readonly string[]; captionStyle: string };
}
/** Blocks the Project's style already answers (so the card is shorter). */
export function fillFromStyle(
  lib: Library,
  type: VideoType,
  style: StyleLike | null,
): BriefValues {
  if (!style) return {};
  const out: BriefValues = {};
  for (const ref of type.blocks) {
    const block = blockById(lib, ref.id);
    const v =
      block?.styleField === 'voice'
        ? style.voice
        : block?.styleField === 'music'
          ? style.music
          : block?.styleField === 'script'
            ? style.scriptRules
            : block?.styleField === 'captions'
              ? style.look.captionStyle
              : block?.styleField === 'look'
                ? style.look.palette.join(', ')
                : '';
    if (block && v.trim()) out[block.id] = `style:${v.trim()}`;
  }
  return out;
}

/** The blocks the card still asks for: required first, in the type's order. */
export function remaining(
  lib: Library,
  type: VideoType,
  values: BriefValues,
): { block: FieldBlock; required: boolean }[] {
  return type.blocks
    .filter((ref) => !(values[ref.id] ?? '').trim())
    .map((ref) => ({ block: blockById(lib, ref.id), required: ref.required }))
    .filter((x): x is { block: FieldBlock; required: boolean } => !!x.block)
    .sort((a, b) => Number(b.required) - Number(a.required));
}
/** Required blocks with no answer ("You decide" is an answer where allowed). */
export function missingRequired(
  lib: Library,
  type: VideoType,
  values: BriefValues,
): FieldBlock[] {
  return type.blocks
    .filter((ref) => ref.required)
    .map((ref) => blockById(lib, ref.id))
    .filter((b): b is FieldBlock => !!b)
    .filter((b) => {
      const v = (values[b.id] ?? '').trim();
      return !v || (v === YOU_DECIDE && !b.youDecide);
    });
}

/** A value as the person reads it. */
export function shown(block: FieldBlock, value: string, lang: Lang): string {
  if (value === YOU_DECIDE) return lang === 'hi' ? 'आप तय करें' : 'You decide';
  if (value.startsWith('style:')) return value.slice(6);
  const opt = block.options.find((o) => o.value === value);
  return opt ? say(opt.label, lang) : value;
}
/** The brief as "Label: value" lines (the Video sheet's brief). */
export function briefLines(
  lib: Library,
  type: VideoType,
  values: BriefValues,
  lang: Lang,
): string[] {
  const lines = [`Type: ${say(type.name, lang)}`];
  for (const ref of type.blocks) {
    const block = blockById(lib, ref.id);
    const v = (values[ref.id] ?? '').trim();
    if (!block || !v) continue;
    const text = shown(block, v, lang);
    lines.push(
      `${say(block.label, lang)}: ${text.length > 300 ? `${text.slice(0, 299)}…` : text}`,
    );
  }
  return lines;
}

/** The brief as the planner's answers and notes. */
export function toPlannerInput(
  c: PlatformConfig,
  values: BriefValues,
): { answers: Record<string, string | number>; notes: string[] } {
  const v = (id: string) => {
    const x = (values[id] ?? '').trim();
    return x === YOU_DECIDE ? '' : x.startsWith('style:') ? x.slice(6) : x;
  };
  const answers: Record<string, string | number> = {};
  const idea = v('topic') || v('product') || v('notes');
  if (idea) answers.idea = idea;
  if (v('hook')) answers.hook = v('hook');
  const seconds = Number(v('length'));
  if (Number.isFinite(seconds) && seconds > 0)
    answers.scenes = Math.max(
      3,
      Math.round(seconds / c.director.estimate.secondsPerScene),
    );
  const lang = v('language');
  if (v('captions') !== 'off')
    answers.captionLang = lang === 'hi' ? 'hi' : 'en';
  const notes: string[] = [];
  const add = (label: string, id: string) => {
    if (v(id)) notes.push(`${label}: ${v(id).slice(0, 400)}.`);
  };
  add('Language', 'language');
  add('Voice', 'voice');
  add('Music', 'music');
  add('Look', 'look');
  add('Platform', 'platform');
  add('Characters', 'characters');
  add('Reference', 'reference');
  add('Brand', 'brand');
  if (v('topic') && v('product')) add('Product', 'product');
  if (v('topic') && v('notes')) add('Notes', 'notes');
  return { answers, notes };
}
