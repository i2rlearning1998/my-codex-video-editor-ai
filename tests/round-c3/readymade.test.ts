// ROUND-C3 Part 6 (RDC3-060, RDC3-061): the Readymade Style structure and
// Claude's Style tools.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultConfig, platformConfigSchema } from '../../src/platform-config';
import type { PlatformConfig, Style } from '../../src/platform-config';
import { validateStyle, fillTemplate } from '../../src/director/style-check';
import { startC2, type C2 } from '../round-c2/helpers';
import { person, plan } from './helpers';

const config = platformConfigSchema.parse(defaultConfig());
const template = () => ({
  ...plan('{{topic}}'),
  meta: {
    title: '{{topic}}',
    language: '{{language}}',
    aspect: '9:16',
    fps: 30,
  },
  scenes: [
    {
      id: 'open',
      title: '{{topic}}',
      narration: '{{script}}',
      durationHint: '{{length}}',
      notes: 'method:library',
      layers: [{ id: 't', kind: 'title', text: '{{topic}}', anchor: 'center' }],
    },
  ],
});
const readymade = (over: Partial<Style> = {}): Style =>
  ({
    ...config.styles[0]!,
    id: 'facts-in-60',
    status: 'tested',
    planTemplate: template(),
    slots: [
      {
        name: 'topic',
        kind: 'text',
        default: 'Why the sky is blue',
        route: 'later',
      },
      {
        name: 'script',
        kind: 'text',
        default: 'Light scatters.',
        route: 'later',
      },
      { name: 'language', kind: 'choice', default: 'en', route: 'later' },
      { name: 'length', kind: 'text', default: '6', route: 'later' },
    ],
    looks: config.styles[0]!.looks!,
    ...over,
  }) as Style;

describe('[RDC3-060] the Readymade Style structure', () => {
  it('[RDC3-060] the three sample Styles load unchanged with the new fields and pass validateStyle; a template filled with its defaults must be a valid plan v4; slot names must match; 3 or 4 looks; published needs 3 passed tests on 3 topics or a written reason', () => {
    for (const st of config.styles) {
      expect(st.status ?? 'published').toBe('published');
      expect(st.planTemplate).toBeUndefined();
      expect(st.looks).toHaveLength(3);
      expect(validateStyle(st)).toEqual({ ok: true, errors: [] });
    }
    expect(validateStyle(readymade())).toEqual({ ok: true, errors: [] });
    const filled = fillTemplate(template(), {
      topic: 'Rain',
      script: 'It falls.',
      language: 'en',
      length: '7',
    }) as {
      scenes: { durationHint: unknown; title: string }[];
    };
    expect(filled.scenes[0]!.durationHint).toBe(7);
    expect(filled.scenes[0]!.title).toBe('Rain');
    const bad = validateStyle(
      readymade({
        slots: readymade()
          .slots!.filter((x) => x.name !== 'script')
          .concat({
            name: 'brand',
            kind: 'text',
            default: '',
            route: 'later',
          } as never),
      }),
    );
    expect(bad.errors).toContain(
      'Style "facts-in-60": the template uses {{script}}, which is not in its slots.',
    );
    expect(bad.errors).toContain(
      'Style "facts-in-60": the slot "brand" is not used in the template.',
    );
    const broken = validateStyle(
      readymade({ planTemplate: { ...template(), scenes: [] } }),
    );
    expect(broken.ok).toBe(false);
    expect(broken.errors.join(' ')).toMatch(/template with the default values/);
    expect(
      validateStyle(readymade({ looks: readymade().looks!.slice(0, 2) }))
        .errors,
    ).toContain('Style "facts-in-60": a Style offers 3 or 4 looks (it has 2).');
    const pub = validateStyle(
      readymade({
        status: 'published',
        tests: [
          { topic: 'Rain', date: '2026-11-16', passed: true },
          { topic: 'rain', date: '2026-11-16', passed: true },
          { topic: 'Snow', date: '2026-11-16', passed: false },
        ],
      }),
    );
    expect(pub.errors).toContain(
      'Style "facts-in-60": a published Style needs at least 3 passed tests on 3 different topics (it has 1), or the owner\'s written reason to publish anyway.',
    );
    expect(
      validateStyle(
        readymade({
          status: 'published',
          tests: ['A', 'B', 'C'].map((topic) => ({
            topic,
            date: 'x',
            passed: true,
          })),
        }),
      ).ok,
    ).toBe(true);
    expect(
      validateStyle(
        readymade({
          status: 'published',
          publishOverride: 'Tested by hand on five topics in Round C3.',
        }),
      ).ok,
    ).toBe(true);
  });
});

let s: C2;
beforeAll(async () => {
  s = await startC2({}, (c: PlatformConfig) => {
    c.styles.push(readymade() as never);
    c.workspace.ownerEmails = ['owner@example.com'];
  });
});
afterAll(() => s.close());

describe("[RDC3-061] Claude's Readymade Style tools", () => {
  it('[RDC3-061] list_styles shows published Styles only (the owner also sees a Tested one, marked); get_style(style_id) names its fields, looks and slots; create_project(style_id) applies its style; start_video_from_style builds the first draft from the template', async () => {
    const { client } = await person(s, 'c3-styles');
    const list = await s.call(client, 'list_styles');
    expect(list.text).toContain('- story-explainer: ');
    expect(list.text).not.toContain('facts-in-60');
    expect(
      (await s.call(client, 'get_style', { style_id: 'facts-in-60' })).text,
    ).toBe('There is no Style "facts-in-60". Call list_styles.');
    // The owner's own account.
    const prof = (await s.store.profile('c3-styles'))!;
    await s.store.saveProfile({ ...prof, email: 'owner@example.com' });
    const owner = await person(s, 'c3-styles');
    const all = await s.call(owner.client, 'list_styles');
    expect(all.text).toContain('- facts-in-60: ');
    expect(all.text).toContain('(tested, only the owner sees it)');
    const g = await s.call(owner.client, 'get_style', {
      style_id: 'facts-in-60',
    });
    expect(g.text).toMatch(
      /What changes per video \(slots\): topic \(text, default "Why the sky is blue"\)/,
    );
    expect(g.text).toMatch(/Looks: chalk \(Chalkboard: /);
    expect(g.text).not.toMatch(/[{[]\s*"/);
    const p = await s.call(owner.client, 'create_project', {
      name: 'Facts',
      style_id: 'facts-in-60',
    });
    expect(p.text).toMatch(
      /It uses the Style ".*": new videos start from its look and rules\.$/,
    );
    const pid = /project_id (proj-[0-9a-f-]+)/.exec(p.text)![1]!;
    const v = await s.call(owner.client, 'create_video', {
      project_id: pid,
      name: 'Rain',
    });
    const vid = /video_id ([0-9a-f-]{36})/.exec(v.text)![1]!;
    const bad = await s.call(owner.client, 'start_video_from_style', {
      video_id: vid,
      answers: { colour: 'red' },
    });
    expect(bad.text).toBe(
      'The Style has no slot "colour". Its slots: topic, script, language, length.',
    );
    const built = await s.call(owner.client, 'start_video_from_style', {
      video_id: vid,
      answers: { topic: 'Why rain falls', script: 'Drops grow heavy.' },
    });
    expect(built.text).toMatch(/^Built 1 scenes:\n1\. Why rain falls: /);
    expect(
      (await s.call(owner.client, 'get_style', { project_id: pid })).text,
    ).toMatch(/^Style of "Facts":/);
    // A Project without a template Style.
    const p2 = await s.call(owner.client, 'create_project', { name: 'Plain' });
    const pid2 = /project_id (proj-[0-9a-f-]+)/.exec(p2.text)![1]!;
    const v2 = await s.call(owner.client, 'create_video', {
      project_id: pid2,
      name: 'X',
    });
    const vid2 = /video_id ([0-9a-f-]{36})/.exec(v2.text)![1]!;
    expect(
      (await s.call(owner.client, 'start_video_from_style', { video_id: vid2 }))
        .text,
    ).toBe(
      "This video's Project has no Readymade Style with a template. Plan it with submit_plan.",
    );
  });
});
