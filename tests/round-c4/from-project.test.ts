// ROUND-C4 Part 2 (RDC4-030 to RDC4-034): "Make a Style from a Project".
// The owner names his own user account once (password and code); only that
// account's Projects are listed, read-only, one audit row per read, off
// while the emergency switch is on. A Video's plan becomes a Draft Style
// whose slots, looks, kit and Brief fields come from it; once Published it
// starts a person's Project through Claude with the template filled.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startC4, type C4 } from './helpers';
import { approved, newVideo, person, plan } from '../round-c3/helpers';
import { defaultConfig, type Style } from '../../src/platform-config';
import { bt, draftStyleFromVideo } from '../../src/director/style-builder';
import { validateStyle, fillTemplate } from '../../src/director/style-check';
import { buildVideoFromPlan } from '../../src/video-plan';

const BARS = readFileSync('tests/fixtures/round-c1/bar-rise.block.js', 'utf8');
let c: C4;
let projectId = '';
let videoId = '';
let handVideo = '';
const ME = 'me-c4@example.com';

beforeAll(async () => {
  c = await startC4();
  // The owner's own user account: made through Claude, with a code graphic.
  const { client } = await person(c.s, 'c4-me');
  const prof = (await c.s.store.profile('c4-me'))!;
  await c.s.store.saveProfile({ ...prof, email: ME });
  ({ projectId, videoId } = await newVideo(c.s, client));
  const p = plan('Volcanoes');
  (p as Record<string, unknown>).defs = {
    blocks: [
      { id: 'bar-rise', tier: 'B', source: BARS, summary: 'Bars rise.' },
    ],
  };
  p.scenes[1]!.layers.push(
    { id: 'g', kind: 'block', block: 'bar-rise' } as never,
    {
      id: 'lava',
      kind: 'media',
      mediaIntent: { query: 'lava flow', type: 'video' },
    } as never,
  );
  await approved(c.s, client, videoId, p);
  // A second Video with no plan (made by hand).
  const v2 = await c.s.call(client, 'create_video', {
    project_id: projectId,
    name: 'By hand',
  });
  handVideo = /video_id ([0-9a-f-]{36})/.exec(v2.text)![1]!;
  // Someone else's account.
  const other = await person(c.s, 'c4-other');
  await newVideo(c.s, other.client);
});
afterAll(() => c.close());

describe("[RDC4-030] the owner's account", () => {
  it('[RDC4-030] nothing is listed before the account is set; setting it asks for the password and code, is audited and adds the email to the owner emails (Draft Styles visible to it)', async () => {
    const none = await c.owner('GET', '/api/styles/from-project');
    expect(none.status).toBe(400);
    expect(none.body.error).toMatch(/Set your user account first/);
    expect(
      (await c.owner('POST', '/api/styles/account', { body: { email: ME } }))
        .status,
    ).toBe(403);
    const ok = await c.owner('POST', '/api/styles/account', {
      body: { email: ME },
      reauth: true,
    });
    expect(ok.body.account.email).toBe(ME);
    expect(c.audit().some((r) => r.action === 'style account')).toBe(true);
    const live = (await c.s.api('/v1/config', { token: c.s.admin })).body
      .config;
    expect(live.workspace.ownerEmails).toContain(ME);
  });
});

describe('[RDC4-031] reading the account', () => {
  it("[RDC4-031] only that account's Projects are listed (read-only), each read is one audit row in the gateway's chain and the Owner App's log; another account's Video is refused; the emergency switch stops it", async () => {
    const r = await c.owner('GET', '/api/styles/from-project');
    expect(r.status).toBe(200);
    expect(r.body.projects).toHaveLength(1);
    expect(r.body.projects[0].id).toBe(projectId);
    const vids = r.body.projects[0].videos as {
      id: string;
      hasPlan: boolean;
    }[];
    expect(vids.find((v) => v.id === videoId)?.hasPlan).toBe(true);
    expect(vids.find((v) => v.id === handVideo)?.hasPlan).toBe(false);
    const rows = await c.s.store.audit();
    const actions = (rows ?? []).map((x: { action: string }) => x.action);
    expect(actions).toContain('style.read-project');
    expect(c.audit().some((x) => x.action === 'style read-project')).toBe(true);
    // Another account's Project is not there.
    const other = await c.owner('POST', '/api/styles/from-project', {
      body: { project: 'proj-not-mine', video: videoId },
    });
    expect(other.status).toBe(404);
    // The emergency switch.
    const em = await c.s.store.emergency();
    await c.s.store.commitAdmin({
      key: 'c4-em-on',
      emergency: { ...em, aiOff: true },
      audit: {
        actor: 'admin',
        action: 'emergency',
        target: 'ai',
        detail: {},
        at: new Date().toISOString(),
      },
    } as never);
    const off = await c.owner('GET', '/api/styles/from-project');
    expect(off.status).toBe(423);
    await c.s.store.commitAdmin({
      key: 'c4-em-off',
      emergency: { ...em, aiOff: false },
      audit: {
        actor: 'admin',
        action: 'emergency',
        target: 'ai',
        detail: {},
        at: new Date().toISOString(),
      },
    } as never);
  });
});

describe('[RDC4-032] the Draft Style', () => {
  it('[RDC4-032] a Video made by hand gives the plain sentence and stops', async () => {
    const r = await c.owner('POST', '/api/styles/from-project', {
      body: { project: projectId, video: handVideo },
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe(bt('from-project-no-plan'));
  });

  let made: Style;
  it('[RDC4-033] a Video with a plan gives a Draft that passes validateStyle with its slots filled by defaults: topic, language, length, each narration and each medium become slots; the code graphic reaches the kit; the cost range is the approved cost plus the margin; it builds a first draft offline', async () => {
    const r = await c.owner('POST', '/api/styles/from-project', {
      body: { project: projectId, video: videoId, margin: 0.5 },
    });
    expect(r.status).toBe(200);
    made = r.body.style as Style;
    expect(made.status).toBe('draft');
    expect(validateStyle(made)).toEqual({ ok: true, errors: [] });
    const names = made.slots!.map((s) => s.name);
    for (const n of [
      'topic',
      'language',
      'length',
      'narration-1',
      'narration-2',
      'lava-flow',
    ])
      expect(names).toContain(n);
    expect(made.slots!.find((s) => s.name === 'lava-flow')?.kind).toBe('video');
    expect(made.kit!.blocks).toContain('bar-rise');
    expect(made.kit!.items![0]!.source).toBe(BARS);
    expect(made.priceHint!.max).toBeGreaterThanOrEqual(made.priceHint!.min);
    expect(made.brief.fields.map((f) => (f as { id: string }).id)).toContain(
      'lava-flow',
    );
    const filled = fillTemplate(
      made.planTemplate,
      Object.fromEntries(made.slots!.map((s) => [s.name, s.default])),
    );
    const built = await buildVideoFromPlan(filled, {
      resolve: { local: () => [], stock: async () => [] },
      importCandidate: async () => {
        throw new Error('none');
      },
    });
    expect(built.errors).toEqual([]);
    expect(built.project).not.toBeNull();
    // The pure function, without the server: same result shape.
    const again = draftStyleFromVideo(
      defaultConfig(),
      { plan: null, name: 'X' },
      'x',
    );
    expect(again).toEqual({ ok: false, message: bt('from-project-no-plan') });
  });

  it('[RDC4-034] once Published, a person starts from it through Claude: list_styles, get_style, create_project(style_id) (its graphic joins the library), start_video_from_style with the answers filled into the template', async () => {
    const pub = await c.owner('POST', '/api/styles/status', {
      body: {
        id: made.id,
        to: 'published',
        override: "Made from the owner's tested Video.",
      },
      reauth: true,
    });
    expect(pub.status).toBe(200);
    const { client } = await person(c.s, 'c4-buyer');
    expect((await c.s.call(client, 'list_styles', {})).text).toContain(
      `- ${made.id}:`,
    );
    const st = await c.s.call(client, 'get_style', { style_id: made.id });
    expect(st.text).toContain('topic');
    const p = await c.s.call(client, 'create_project', {
      name: 'Mine',
      style_id: made.id,
    });
    const pid = /project_id (proj-[0-9a-f-]+)/.exec(p.text)![1]!;
    const doc = await c.s.store.claudeDoc('c4-buyer');
    expect(doc.projects[pid]!.library?.map((g) => g.id)).toContain('bar-rise');
    const v = await c.s.call(client, 'create_video', {
      project_id: pid,
      name: 'Deserts',
    });
    const vid = /video_id ([0-9a-f-]{36})/.exec(v.text)![1]!;
    const r = await c.s.call(client, 'start_video_from_style', {
      video_id: vid,
      answers: { topic: 'How deserts form' },
    });
    expect(r.isError).toBe(false);
    const d2 = await c.s.store.claudeDoc('c4-buyer');
    const planned = d2.projects[pid]!.videos[vid]!.plan as {
      meta: { title: string };
    };
    expect(planned.meta.title).toBe('How deserts form');
  });
});
