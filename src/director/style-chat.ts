// ROUND-B B4: the Style chat. A small conversation that only edits a
// Project's style record. Pure: a message and the style in, the proposed
// fields with a before/after list out. The word lists and every sentence
// are the owner's (Platform Config, director.styleChat and director.lines).
// Offline this is the whole interpreter; nothing here calls a model.
import type { PlatformConfig } from '../platform-config';
import type { StyleFields } from '../project/workspace';
import { refusalFor } from './refusals';

export type StyleField =
  | 'palette'
  | 'headingFont'
  | 'bodyFont'
  | 'captionStyle'
  | 'graphics'
  | 'voice'
  | 'music'
  | 'scriptRules';
export interface StyleChange {
  field: StyleField;
  before: string;
  after: string;
}
export type StyleReply =
  | { kind: 'refusal'; text: string }
  | { kind: 'question' }
  | { kind: 'same' }
  | { kind: 'only' }
  | { kind: 'proposal'; next: StyleFields; changes: StyleChange[] };

const HEX = /#[0-9a-f]{6}\b/gi;
const clean = (s: string) =>
  s
    .replace(/^[\s:=,\-–]+/, '')
    .replace(/[\s.।!]+$/, '')
    .trim()
    .slice(0, 200);
/** The text after one of the cue words, up to the next sentence end or cue. */
function after(text: string, cues: string[], stops: string[]): string | null {
  const lower = text.toLowerCase();
  for (const cue of cues) {
    const at = lower.indexOf(cue);
    if (at < 0) continue;
    let rest = text.slice(at + cue.length);
    rest = rest.replace(
      /^\s*(should be|to be|to|is|as|with|use|=|:|को|में|रखो|रखें)\s+/i,
      '',
    );
    let end = rest.length;
    const low = rest.toLowerCase();
    for (const stop of [...stops, '. ', '; ', '। ', ' and the ', ' और ']) {
      const i = low.indexOf(stop);
      if (i > 0 && i < end) end = i;
    }
    const value = clean(rest.slice(0, end));
    if (value) return value;
  }
  return null;
}

const CUES: Record<
  'voice' | 'music' | 'captions' | 'graphics' | 'rule',
  string[]
> = {
  voice: ['voice', 'narrator', 'आवाज़', 'आवाज'],
  music: ['music', 'संगीत', 'म्यूज़िक', 'म्यूजिक'],
  captions: ['captions', 'caption', 'subtitles', 'कैप्शन'],
  graphics: ['graphics', 'animation', 'ग्राफ़िक्स', 'ग्राफिक्स', 'एनिमेशन'],
  rule: ['rule:', 'script rule', 'always ', 'never ', 'नियम', 'हमेशा ', 'कभी '],
};
const ALL_CUES = Object.values(CUES).flat();
const VIDEO_WORDS = ['this video', 'the video', 'scene ', 'इस वीडियो', 'सीन '];
const NO = /\b(no|without|remove|drop)\b|नहीं|हटाओ|हटा दो|बिना/i;

export function styleReply(
  c: PlatformConfig,
  current: StyleFields,
  message: string,
  lang: 'en' | 'hi' = 'en',
): StyleReply {
  const text = message.trim();
  const refusal = refusalFor(c.director, text);
  if (refusal) {
    const say = (x?: { en: string; hi?: string | undefined }) =>
      x ? (lang === 'hi' && x.hi ? x.hi : x.en) : '';
    return {
      kind: 'refusal',
      text: [say(refusal.reply), say(refusal.alternative)]
        .filter(Boolean)
        .join(' '),
    };
  }
  const lower = ` ${text.toLowerCase()} `;
  const next: StyleFields = {
    ...current,
    look: { ...current.look, palette: [...current.look.palette] },
  };
  // Colours: hex codes win; else a mood word.
  const hexes = [
    ...new Set((text.match(HEX) ?? []).map((x) => x.toLowerCase())),
  ];
  if (hexes.length) {
    next.look.palette =
      hexes.length >= 2
        ? hexes.slice(0, 8)
        : [...new Set([...hexes, ...current.look.palette])].slice(0, 8);
  } else {
    const mood = c.director.styleChat.moods.find((m) =>
      m.words.some((w) =>
        new RegExp(
          `(^|[^\\p{L}])${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`,
          'u',
        ).test(lower),
      ),
    );
    if (mood) next.look.palette = [...mood.palette];
  }
  // Fonts: a font the owner lists; "body" names the body font, else headings.
  const font = c.director.styleChat.fonts
    .slice()
    .sort((a, b) => b.length - a.length)
    .find((f) => lower.includes(f.toLowerCase()));
  if (font) {
    const at = lower.indexOf(font.toLowerCase());
    const near = lower.slice(Math.max(0, at - 40), at + font.length + 40);
    const body = /body|text font|बॉडी/.test(near);
    const heading = /head|title|हेडिंग|शीर्षक/.test(near);
    if (body && !heading) next.look.bodyFont = font;
    else if (heading && !body) next.look.headingFont = font;
    else {
      next.look.headingFont = font;
      if (/\b(all|every|both)\b|सब/.test(lower)) next.look.bodyFont = font;
    }
  }
  const stops = ALL_CUES;
  const set = (key: 'voice' | 'music', cues: string[]) => {
    const at = cues.find((cue) => lower.includes(cue));
    if (!at) return;
    const before = lower.slice(
      Math.max(0, lower.indexOf(at) - 16),
      lower.indexOf(at),
    );
    if (NO.test(before)) {
      next[key] = lang === 'hi' ? 'नहीं' : 'None';
      return;
    }
    const value = after(
      text,
      cues,
      stops.filter((s) => !cues.includes(s)),
    );
    // "a calm female voice": the words before the cue describe it.
    if (value) next[key] = value;
    else {
      const lead = clean(
        text
          .slice(0, text.toLowerCase().indexOf(at))
          .replace(/^.*\b(use|make|want|with|a|an|the)\b/i, ''),
      );
      if (lead) next[key] = lead;
    }
  };
  set('voice', CUES.voice);
  set('music', CUES.music);
  const captions = after(
    text,
    CUES.captions,
    stops.filter((s) => !CUES.captions.includes(s)),
  );
  if (captions) next.look.captionStyle = captions;
  const graphics = after(
    text,
    CUES.graphics,
    stops.filter((s) => !CUES.graphics.includes(s)),
  );
  if (graphics) next.graphics = graphics;
  const ruleCue = CUES.rule.find((cue) => lower.includes(cue));
  if (ruleCue) {
    const at = text.toLowerCase().indexOf(ruleCue.trim());
    const keep = /always|never|हमेशा|कभी/.test(ruleCue);
    const rule = clean(
      keep ? text.slice(at) : text.slice(at + ruleCue.trim().length),
    );
    if (rule && !current.scriptRules.includes(rule))
      next.scriptRules = [current.scriptRules, rule]
        .filter(Boolean)
        .join('\n')
        .slice(0, 2000);
  }

  const changes: StyleChange[] = [];
  const diff = (field: StyleField, a: string, b: string) => {
    if (a !== b) changes.push({ field, before: a, after: b });
  };
  diff('palette', current.look.palette.join(' '), next.look.palette.join(' '));
  diff('headingFont', current.look.headingFont, next.look.headingFont);
  diff('bodyFont', current.look.bodyFont, next.look.bodyFont);
  diff('captionStyle', current.look.captionStyle, next.look.captionStyle);
  diff('graphics', current.graphics, next.graphics);
  diff('voice', current.voice, next.voice);
  diff('music', current.music, next.music);
  diff('scriptRules', current.scriptRules, next.scriptRules);
  if (changes.length) return { kind: 'proposal', next, changes };
  const named =
    hexes.length > 0 || !!font || ALL_CUES.some((cue) => lower.includes(cue));
  if (named) return { kind: 'same' };
  if (VIDEO_WORDS.some((w) => lower.includes(w))) return { kind: 'only' };
  return { kind: 'question' };
}
