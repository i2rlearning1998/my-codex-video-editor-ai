import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/platform-config';
import { styleReply } from '../../src/director/style-chat';
import type { StyleFields } from '../../src/project/workspace';

const c = defaultConfig();
const base = (): StyleFields => ({
  look: {
    palette: ['#ffffff', '#111111'],
    headingFont: 'Inter',
    bodyFont: 'Inter',
    captionStyle: '',
  },
  graphics: '',
  voice: '',
  music: '',
  scriptRules: '',
});

describe('[RDB-024] Style chat interpreter', () => {
  it('a mood word proposes the owner palette and leaves the input unchanged', () => {
    const cur = base();
    const r = styleReply(c, cur, 'Make it darker please');
    expect(r.kind).toBe('proposal');
    if (r.kind !== 'proposal') return;
    expect(r.next.look.palette).toEqual(
      c.director.styleChat.moods.find((m) => m.id === 'dark')!.palette,
    );
    expect(r.changes.map((x) => x.field)).toEqual(['palette']);
    expect(cur.look.palette).toEqual(['#ffffff', '#111111']);
  });
  it('fonts, voice, music and a rule in one message are all listed before and after', () => {
    const r = styleReply(
      c,
      base(),
      'Use Poppins for headings. Voice: calm female. No music. Always end with a question',
    );
    expect(r.kind).toBe('proposal');
    if (r.kind !== 'proposal') return;
    expect(r.next.look.headingFont).toBe('Poppins');
    expect(r.next.look.bodyFont).toBe('Inter');
    expect(r.next.voice).toBe('calm female');
    expect(r.next.music).toBe('None');
    expect(r.next.scriptRules).toBe('Always end with a question');
    expect(r.changes.map((x) => x.field).sort()).toEqual(
      ['headingFont', 'music', 'scriptRules', 'voice'].sort(),
    );
  });
  it('hex colours become the palette; Hindi mood words work', () => {
    const r = styleReply(c, base(), 'colours #112233 and #ffcc00');
    expect(r.kind === 'proposal' && r.next.look.palette).toEqual([
      '#112233',
      '#ffcc00',
    ]);
    const hi = styleReply(c, base(), 'रंग गहरा करो', 'hi');
    expect(hi.kind).toBe('proposal');
  });
  it('asks ONE question when unsure, says so when nothing changes, refuses with the owner words', () => {
    expect(styleReply(c, base(), 'make it nicer').kind).toBe('question');
    expect(styleReply(c, base(), 'heading font Inter').kind).toBe('same');
    expect(styleReply(c, base(), 'delete scene 2 of this video').kind).toBe(
      'only',
    );
    const refusal = c.director.refusals.find((x) => x.keywords.length)!;
    const r = styleReply(c, base(), `please ${refusal.keywords[0]}`);
    expect(r.kind).toBe('refusal');
  });
});
