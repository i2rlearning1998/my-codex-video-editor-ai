// ROUND-C4: what an Admin save changes, with no restart. Part 3 (RDC4-051,
// RDC4-052): the field library editor's rules, history and rollback, and a
// new field reaching Claude's get_brief_fields and the Director's Brief
// card. Part 4.2 (RDC4-062): rewrites, the attachment limit, a refusal
// sentence, an interview question and a Style chat mood. Part 5.2 (RDC4-063):
// a tool switched off and a credit rule. Part 5.3 (RDC4-064): Studio fields.
// Part 5.4 (RDC4-065): a provider, a model and an assignment.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startC4, type C4 } from './helpers';
import { newVideo, person, plan } from '../round-c3/helpers';
import type { PlatformConfig } from '../../src/platform-config';
import { line, remaining, typeById } from '../../src/director/field-library';
import { refusalFor } from '../../src/director/refusals';
import { pendingQuestions, startInterview } from '../../src/director/interview';
import { styleReply } from '../../src/director/style-chat';
import { rewritesLeft } from '../../src/director/plan-costs';
import { emptyStyle } from '../../src/project/workspace';
import { bt } from '../../src/director/style-builder';

let c: C4;
beforeAll(async () => {
  c = await startC4();
});
afterAll(() => c.close());

/** The live config as the owner's screens read it. */
const live = async (): Promise<PlatformConfig> =>
  (await c.owner('GET', '/api/admin/config')).body.config;
/** One save through the same path every Admin tab uses (asks for the code). */
async function save(edit: (x: PlatformConfig) => void) {
  const next = await live();
  edit(next);
  const r = await c.owner('POST', '/api/admin/config', {
    body: { config: next, note: 'c4 test', publish: true },
    reauth: true,
  });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
}
/** What the panel, the website and the Director read. */
const publicConfig = async (): Promise<PlatformConfig> =>
  (await c.s.api('/v1/config')).body.config;

describe('[RDC4-051] Brief fields: a new field reaches the Director and Claude', () => {
  it("[RDC4-051] a block added to the explainer type shows in Claude's get_brief_fields and in the Director's Brief card (the same functions over the live config) at once; a block still used cannot be deleted; a type naming an unknown block, a missing fallback type and no types at all are refused in plain sentences", async () => {
    const got = await c.owner('GET', '/api/fields');
    const lib = got.body.library as PlatformConfig['director']['fieldLibrary'];
    lib.blocks.push({
      id: 'mood',
      label: { en: 'Mood', hi: 'मूड' },
      type: 'text',
      options: [],
      hints: {},
      youDecide: true,
    } as never);
    lib.types
      .find((t) => t.id === 'explainer')!
      .blocks.push({ id: 'mood', required: true });
    const r = await c.owner('POST', '/api/fields/save', {
      body: { library: lib, note: 'mood' },
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    // Claude.
    const { client } = await person(c.s, 'c4-fields');
    const { videoId } = await newVideo(c.s, client);
    const fields = await c.s.call(client, 'get_brief_fields', {
      video_id: videoId,
    });
    expect(fields.text).toMatch(/mood: Mood \(required\)\. Still needed\./);
    // The Director's Brief card reads the same library through these.
    const cfg = await publicConfig();
    const fl = cfg.director.fieldLibrary;
    expect(
      remaining(fl, typeById(fl, 'explainer'), {}).map((x) => x.block.id),
    ).toContain('mood');
    // Deleting a block a type uses.
    const used = { ...lib, blocks: lib.blocks.filter((b) => b.id !== 'topic') };
    const d = await c.owner('POST', '/api/fields/save', {
      body: { library: used },
    });
    expect(d.status).toBe(400);
    expect(d.body.error).toMatch(
      /^The block "topic" is still used by video type "/,
    );
    const ghost = JSON.parse(JSON.stringify(lib));
    ghost.types[0].blocks.push({ id: 'nobody-defines-this', required: false });
    expect(
      (await c.owner('POST', '/api/fields/save', { body: { library: ghost } }))
        .body.error,
    ).toContain(
      'uses the block "nobody-defines-this", which no block defines.',
    );
    const noFallback = { ...lib, fallbackType: 'nope' };
    expect(
      (
        await c.owner('POST', '/api/fields/save', {
          body: { library: noFallback },
        })
      ).body.error,
    ).toContain('The fallback type "nope" does not exist.');
    const empty = { ...lib, types: [] };
    expect(
      (await c.owner('POST', '/api/fields/save', { body: { library: empty } }))
        .body.error,
    ).toContain('At least one video type must exist.');
  });

  it("[RDC4-052] the field library's history: every save is a version with a note; the preview uses the panel's own functions; rollback asks for the code, makes a new version, and refuses a version that no longer parses", async () => {
    const h = (await c.owner('GET', '/api/fields')).body.history as {
      version: number;
      note: string;
    }[];
    expect(h.at(-1)?.note).toBe('mood');
    const pv = await c.owner('POST', '/api/fields/preview', {
      body: { text: 'An explainer about how volcanoes erupt' },
    });
    expect(pv.body.filled.topic).toContain('volcanoes');
    expect(pv.body.asks.map((a: { id: string }) => a.id)).toContain('mood');
    expect(
      (await c.owner('POST', '/api/fields/rollback', { body: { version: 1 } }))
        .status,
    ).toBe(403);
    // A first version that can no longer be read.
    const { StyleBook } = await import('../../owner/server/styles');
    const book = new StyleBook(`${c.root}/data`);
    const b = book.read();
    const good = b.history.fields![0]!;
    b.history.fields!.unshift({
      ...good,
      version: 0,
      snapshot: { blocks: 'broken' },
    });
    book.write(b);
    const bad = await c.owner('POST', '/api/fields/rollback', {
      body: { version: 0 },
      reauth: true,
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe(bt('rollback-bad'));
  });
});

describe('[RDC4-062] Director limits take effect', () => {
  it("[RDC4-062] rewrites, the attachment limit, a refusal sentence (Director and Claude's start_here), an interview question and a Style chat mood follow a save with no restart", async () => {
    await save((x) => {
      x.director.rewritesPerVideo = 5;
      x.director.context.maxAttachmentMb = 2;
      x.director.refusals.push({
        id: 'no-weapons-c4',
        when: { en: 'Weapons' },
        reply: { en: 'I do not make videos about weapons.' },
        keywords: ['rocket launcher'],
      });
      x.styles[0]!.interview.questions.unshift({
        id: 'q-c4',
        ask: { en: 'Who will watch this first?' },
        answers: [],
        allowFreeText: true,
        order: -1,
      });
      x.director.styleChat.moods.push({
        id: 'lagoon',
        words: ['lagoon'],
        palette: ['#003344', '#00aa99'],
      });
    });
    const cfg = await publicConfig();
    // Rewrites: Claude's plan card and the Director's number.
    const { client } = await person(c.s, 'c4-limits');
    const { videoId } = await newVideo(c.s, client);
    await c.s.call(client, 'submit_plan', { video_id: videoId, plan: plan() });
    const cost = await c.s.call(client, 'get_plan_cost', { video_id: videoId });
    expect(cost.text).toContain('Plan rewrites left: 5 of 5.');
    expect(rewritesLeft(cfg, 1)).toBe(4);
    // The attachment control's sentence (the Director's line with the limit).
    expect(cfg.director.context.maxAttachmentMb).toBe(2);
    expect(
      line(cfg, 'attach.tooBig', 'en', {
        n: cfg.director.context.maxAttachmentMb,
      }),
    ).toBe('That file is too big. The most is 2 MB.');
    // A refusal: the Director's match, and Claude's start_here guidance.
    expect(
      refusalFor(cfg.director, 'Make a rocket launcher ad')?.reply.en,
    ).toBe('I do not make videos about weapons.');
    const start = await c.s.call(client, 'start_here', {});
    expect(start.text).toContain('I do not make videos about weapons.');
    // The interview asks the new question first.
    const style = cfg.styles[0]!;
    const iv = startInterview(cfg, style, {}, 'en');
    // The Director asks it first (startInterview asks the first question).
    expect(iv.asked[0]).toBe('q-c4');
    expect(iv.messages.map((m) => m.text).join('\n')).toContain(
      'Who will watch this first?',
    );
    expect(pendingQuestions(style, iv).map((q) => q.id)).not.toContain('q-c4');
    // The Style chat uses the new mood.
    const r = styleReply(cfg, emptyStyle(), 'Make it feel like a lagoon');
    expect(JSON.stringify(r)).toContain('#003344');
  });
});

describe('[RDC4-063] the MCP tab: switches and credit rules', () => {
  it("[RDC4-063] a tool switched off in Admin is refused through the SDK client in one sentence; a build multiplier of 2 doubles get_plan_cost's total; a fixed export price is used; the default rules are today's", async () => {
    const { client } = await person(c.s, 'c4-mcp');
    const { videoId } = await newVideo(c.s, client);
    await c.s.call(client, 'submit_plan', { video_id: videoId, plan: plan() });
    const total = async () =>
      Number(
        /Total: up to (\d+)/.exec(
          (await c.s.call(client, 'get_plan_cost', { video_id: videoId })).text,
        )![1],
      );
    const before = await total();
    expect(before).toBeGreaterThan(0);
    await save((x) => {
      x.mcp.pricing = {
        build: { multiplier: 2, fixed: null },
        export: { multiplier: 1, fixed: 7 },
      };
      x.mcp.tools.list_library = { enabled: false, cost: 'free' };
    });
    expect(await total()).toBe(before * 2);
    const off = await c.s.call(client, 'list_library', {});
    expect(off.isError).toBe(true);
    const { mcpPrice } = await import('../../src/platform-config');
    expect(mcpPrice((await publicConfig()).mcp, 'export', 0)).toBe(7);
    expect(mcpPrice({ pricing: {} }, 'new-scene', 9)).toBe(9);
  });
});

describe('[RDC4-064] Studio fields are one list', () => {
  it("[RDC4-064] a field the owner adds to the image Studio (Studios tab, the same config) is in the public config the panel's form reads and in Claude's get_asset_needs at once", async () => {
    await save((x) => {
      const st = x.studios.find((s) => s.role === 'studio-images')!;
      st.inputs.push({
        id: 'mood',
        type: 'text',
        label: { en: 'Mood' },
        required: false,
        options: [],
        order: 99,
      } as never);
    });
    const cfg = await publicConfig();
    const st = cfg.studios.find((s) => s.role === 'studio-images')!;
    expect(st.inputs.map((f) => f.id)).toContain('mood');
    const { client } = await person(c.s, 'c4-studio');
    const { videoId } = await newVideo(c.s, client);
    const p = plan('Deltas');
    p.scenes[0]!.layers.push({
      id: 'd',
      kind: 'media',
      mediaIntent: { query: 'river delta', type: 'photo' },
    } as never);
    await c.s.call(client, 'submit_plan', { video_id: videoId, plan: p });
    const needs = await c.s.call(client, 'get_asset_needs', {
      video_id: videoId,
    });
    const at = needs.text.indexOf(`studio ${st.id} (${st.name.en}; fields: `);
    expect(at).toBeGreaterThan(-1);
    const fieldsText = needs.text.slice(at).split('; ')[1]!;
    expect(fieldsText).toMatch(/^fields: .*\bmood\b/);
  });
});

describe('[RDC4-065] providers and assignments', () => {
  it('[RDC4-065] with no image model, get_asset_needs says no Studio can make a picture; adding a provider, a model and an assignment in the config (offline kind) makes the image Studio appear, with no code change', async () => {
    await save((x) => {
      // No model makes pictures, so the image Studio is switched off too
      // (the config refuses an enabled Studio no model serves).
      for (const m of x.models)
        m.roles = m.roles.filter((r) => r !== 'studio-images');
      for (const st of x.studios)
        if (st.role === 'studio-images') st.enabled = false;
    });
    const { client } = await person(c.s, 'c4-provider');
    const { videoId } = await newVideo(c.s, client);
    const p = plan('Deltas');
    p.scenes[0]!.layers.push({
      id: 'd',
      kind: 'media',
      mediaIntent: { query: 'river delta', type: 'photo' },
    } as never);
    await c.s.call(client, 'submit_plan', { video_id: videoId, plan: p });
    const needs = () =>
      c.s.call(client, 'get_asset_needs', { video_id: videoId });
    const slotLine = (t: string) =>
      t.split('\n').find((l) => l.includes('make it here'))!;
    expect(slotLine((await needs()).text)).toContain(
      'no Studio can make this kind right now',
    );
    await save((x) => {
      const mock = x.providers.find((p) => p.kind === 'mock')!;
      x.providers.push({ ...mock, id: 'mock-c4', name: 'Offline C4' });
      const base = x.models.find((m) => m.providerId === mock.id)!;
      x.models.push({
        ...base,
        id: 'mock-image-c4',
        providerId: 'mock-c4',
        kind: 'image',
        roles: ['studio-images'],
        enabled: true,
      });
      x.assignments['studio-images'] = 'mock-image-c4';
      for (const st of x.studios)
        if (st.role === 'studio-images') st.enabled = true;
    });
    expect(slotLine((await needs()).text)).toMatch(/make it here: studio /);
  });
});
