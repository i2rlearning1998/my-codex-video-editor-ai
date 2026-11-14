// ROUND-B B3: the field library, video types and the five message kinds.
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/platform-config';
import {
  YOU_DECIDE,
  briefLines,
  classifyType,
  fillFromStyle,
  fillFromText,
  line,
  missingRequired,
  remaining,
  toPlannerInput,
} from '../../src/director/field-library';
import { sortMessage, splitAsks } from '../../src/director/intents';

const c = defaultConfig();
const lib = c.director.fieldLibrary;

describe('[RDB-014] field library and video types (Platform Config)', () => {
  it('has every named block and a General fallback type', () => {
    const ids = lib.blocks.map((b) => b.id);
    for (const id of [
      'topic',
      'script',
      'language',
      'length',
      'aspect',
      'platform',
      'voice',
      'music',
      'look',
      'captions',
      'reference',
      'characters',
      'brand',
      'product',
      'recording',
      'hook',
      'notes',
    ])
      expect(ids).toContain(id);
    expect(lib.types.some((t) => t.id === lib.fallbackType)).toBe(true);
    for (const t of lib.types)
      for (const b of t.blocks) expect(ids).toContain(b.id);
  });
  it("sorts a first message into a type by the owner's keywords; unknown is General", () => {
    expect(classifyType(lib, 'Explain how rain forms, in Hindi').id).toBe(
      'explainer',
    );
    expect(classifyType(lib, 'A story of a clever crow').id).toBe('story');
    expect(classifyType(lib, 'Promo for my product: steel bottle').id).toBe(
      'product',
    );
    expect(classifyType(lib, 'एक कहानी बनाओ').id).toBe('story');
    expect(classifyType(lib, 'zzz').id).toBe('general');
  });
  it('fills what the message already says and asks only for the rest', () => {
    const type = classifyType(
      lib,
      'Explain how rain forms in Hindi, 1 minute, vertical, no music',
    );
    const v = fillFromText(
      lib,
      type,
      'Explain how rain forms in Hindi, 1 minute, vertical, no music',
    );
    expect(v).toMatchObject({
      language: 'hi',
      length: '60',
      aspect: '9:16',
      music: 'none',
    });
    expect(v.topic).toContain('rain');
    const left = remaining(lib, type, v).map((x) => x.block.id);
    expect(left).not.toContain('language');
    expect(left).not.toContain('length');
    expect(left).toContain('voice');
    expect(missingRequired(lib, type, v)).toEqual([]);
  });
  it('a required block is missing until answered; "You decide" answers a block that allows it', () => {
    const type = lib.types.find((t) => t.id === 'explainer')!;
    expect(missingRequired(lib, type, {}).map((b) => b.id)).toEqual([
      'topic',
      'language',
      'length',
    ]);
    const v = { topic: YOU_DECIDE, language: YOU_DECIDE, length: YOU_DECIDE };
    // The topic cannot be left to Director.
    expect(missingRequired(lib, type, v).map((b) => b.id)).toEqual(['topic']);
  });
  it('a Project style prefills its blocks, so the card is shorter', () => {
    const type = lib.types.find((t) => t.id === 'explainer')!;
    const none = remaining(lib, type, {}).length;
    const styled = fillFromStyle(lib, type, {
      voice: 'Warm female, Hindi',
      music: 'Calm sitar',
      scriptRules: '',
      look: { palette: [], captionStyle: 'bold-box' },
    });
    expect(styled).toMatchObject({
      voice: 'style:Warm female, Hindi',
      music: 'style:Calm sitar',
      captions: 'style:bold-box',
    });
    expect(remaining(lib, type, styled).length).toBe(none - 3);
    expect(briefLines(lib, type, { ...styled, topic: 'rain' }, 'en')).toContain(
      'Voice: Warm female, Hindi',
    );
  });
  it('a pasted script and a link are understood', () => {
    const script = `${'This is my script. '.repeat(30)} https://example.com/like-this`;
    const type = classifyType(lib, script);
    const v = fillFromText(lib, type, script);
    expect(v.script ?? 'mine').toBe('mine');
    expect(v.reference ?? 'https://example.com/like-this').toBe(
      'https://example.com/like-this',
    );
  });
  it('turns the brief into planner answers and notes', () => {
    const p = toPlannerInput(c, {
      topic: 'rain',
      length: '60',
      language: 'hi',
      voice: 'tts',
      music: YOU_DECIDE,
    });
    expect(p.answers.idea).toBe('rain');
    expect(p.answers.scenes).toBe(
      Math.max(3, Math.round(60 / c.director.estimate.secondsPerScene)),
    );
    expect(p.answers.captionLang).toBe('hi');
    expect(p.notes.join(' ')).toContain('Voice: tts');
    expect(p.notes.join(' ')).not.toContain('Music');
  });
  it("Director's lines come from config, with the built-in sample as fallback", () => {
    expect(line(c, 'newVideo.ask', 'en')).toContain('new video');
    expect(line(c, 'newVideo.ask', 'hi')).toContain('नया वीडियो');
    const mine = {
      ...c,
      director: {
        ...c.director,
        lines: { 'newVideo.ask': { en: 'OWNER TEXT' } },
      },
    };
    expect(line(mine, 'newVideo.ask', 'en')).toBe('OWNER TEXT');
    expect(line(c, 'build.done', 'en', { scenes: 5, credits: 12 })).toContain(
      '5 scenes',
    );
  });
});

describe('[RDB-019] every message after the build is sorted into one of five kinds', () => {
  const kinds = (t: string, sel = false) =>
    sortMessage(t, sel).map((a) => a.kind);
  it('question, selection, scene, new scene, new video', () => {
    expect(kinds('Why is the title blue?')).toEqual(['question']);
    expect(kinds('make it red', true)).toEqual(['selection']);
    expect(kinds('make the title red', false)).toEqual(['scene']);
    expect(kinds('make the whole scene darker', true)).toEqual(['scene']);
    expect(kinds('add a new scene about clouds')).toEqual(['new-scene']);
    expect(kinds('make another video about wind')).toEqual(['new-video']);
    expect(kinds('नया सीन जोड़ो बादलों पर')).toEqual(['new-scene']);
    expect(kinds('क्या यह ठीक है')).toEqual(['question']);
  });
  it('three asks in one message become three', () => {
    const asks = splitAsks(
      'Make the title red; add a new scene about clouds\nwhy is it slow?',
    );
    expect(asks).toHaveLength(3);
    expect(
      kinds(
        'Make the title red; add a new scene about clouds\nwhy is it slow?',
      ),
    ).toEqual(['scene', 'new-scene', 'question']);
    expect(
      kinds('1. bigger title 2. new scene on rivers 3. another video on wind'),
    ).toEqual(['scene', 'new-scene', 'new-video']);
  });
  it('a vague ask is marked unsure', () => {
    expect(sortMessage('change it', false)[0]!.unsure).toBe(true);
    expect(sortMessage('make the title red', false)[0]!.unsure).toBe(false);
  });
});
