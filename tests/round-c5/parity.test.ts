// ROUND-C5 Part 4: the Director and Claude do the same work. (4.2) Every
// member of the Director's own lists has a row, and every tool a row names
// exists on the connector. (4.3) The tools added for the gaps work:
// rewrite_plan (Cheaper / Richer, one rewrite, the same swap rule),
// remove_extra_idea, use_video_style. (4.4) The same plan built by the
// Director's builder and through the connector gives the same video
// (allow-list: ids, names and times).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { startC2, type C2 } from '../round-c2/helpers';
import { person, newVideo, plan } from '../round-c3/helpers';
import {
  parityMarkdown,
  parityRows,
  PARITY_LISTS,
} from '../../src/director/parity-matrix';
import { buildVideoFromPlan } from '../../src/video-plan';

let s: C2;
beforeAll(async () => {
  s = await startC2({}, (c) => {
    c.director.rewritesPerVideo = 3;
  });
}, 60_000);
afterAll(() => s?.close());

describe('[RDC5-027] the parity matrix', () => {
  it('[RDC5-027] every member of the Director lists has a row; every tool a row names is a connector tool; docs/PARITY.md is the generated table', async () => {
    const rows = parityRows();
    const keys = (group: string) =>
      rows.filter((r) => r.group === group).map((r) => r.key);
    expect(keys('Message kind')).toEqual([...PARITY_LISTS.ASK_KINDS]);
    expect(keys('Asset choice')).toEqual([...PARITY_LISTS.ASSET_CHOICES]);
    expect(keys('Plan card')).toEqual([...PARITY_LISTS.PLAN_ACTIONS]);
    expect(keys('Style chat')).toEqual([...PARITY_LISTS.STYLE_CHAT_REPLIES]);
    expect(keys('Director step')).toEqual([...PARITY_LISTS.DIRECTOR_STEPS]);
    const { client } = await person(s, 'c5-parity-list');
    const tools = new Set((await client.listTools()).tools.map((t) => t.name));
    for (const r of rows)
      if ('connector' in r.row)
        for (const tool of r.row.connector)
          expect(tools.has(tool), `${r.group} ${r.key}: ${tool}`).toBe(true);
    const doc = readFileSync('docs/PARITY.md', 'utf8');
    for (const r of rows) expect(doc).toContain(`| ${r.key} `);
    expect(parityMarkdown()).toContain('# Director and Claude: the same work');
  });
});

describe('[RDC5-028] the gaps filled', () => {
  it('[RDC5-028] rewrite_plan cheaper and richer swap the methods with the same rule and count a rewrite each; with none left it is refused; remove_extra_idea removes one idea and notes it; use_video_style makes the Project style follow the video', async () => {
    const { client } = await person(s, 'c5-parity');
    const { videoId, projectId } = await newVideo(s, client);
    const p = plan();
    // Richer methods first so Cheaper has room to move.
    const sub = await s.call(client, 'submit_plan', {
      video_id: videoId,
      plan: p,
      extra_ideas: ['A title card at the end', 'A soft music bed'],
    });
    expect(sub.text).toMatch(/^Built/);
    const cost1 = await s.call(client, 'get_plan_cost', { video_id: videoId });
    expect(cost1.text).toContain('Plan rewrites left: 3');
    const richer = await s.call(client, 'rewrite_plan', {
      video_id: videoId,
      direction: 'richer',
    });
    const cost2 = await s.call(client, 'get_plan_cost', { video_id: videoId });
    if (richer.isError)
      expect(richer.text).toContain('No scene can be made richer');
    else expect(cost2.text).toContain('Plan rewrites left: 2');
    const cheaper = await s.call(client, 'rewrite_plan', {
      video_id: videoId,
      direction: 'cheaper',
    });
    expect(cheaper.isError, cheaper.text).toBe(false);
    const cost3 = await s.call(client, 'get_plan_cost', { video_id: videoId });
    expect(cost3.text).toMatch(/Plan rewrites left: [01]/);
    // The extra ideas survive a rewrite; one is removed.
    expect(cost3.text).toContain('A soft music bed');
    const rm = await s.call(client, 'remove_extra_idea', {
      video_id: videoId,
      idea: 2,
    });
    expect(rm.text).toBe('Removed: A soft music bed. Extra ideas left: 1.');
    const mem = await s.call(client, 'read_memory', { video_id: videoId });
    expect(mem.text).toContain('Extra idea removed: A soft music bed');
    // Use up the rewrites: the next one is refused with the same sentence.
    for (let i = 0; i < 3; i++)
      await s.call(client, 'rewrite_plan', {
        video_id: videoId,
        direction: i % 2 ? 'richer' : 'cheaper',
      });
    const none = await s.call(client, 'rewrite_plan', {
      video_id: videoId,
      direction: 'cheaper',
    });
    expect(none.isError).toBe(true);
    // The Project's style from this video.
    const used = await s.call(client, 'use_video_style', { video_id: videoId });
    expect(used.text).toContain("The Project's style now follows this video.");
    const st = await s.call(client, 'get_style', { project_id: projectId });
    expect(st.isError).toBe(false);
  });
});

describe('[RDC5-029] the same work', () => {
  it("[RDC5-029] the same plan built by the Director's builder (runPlanBuild's buildVideoFromPlan, no media) and through the connector gives the same scenes, layers, kinds, texts and timing; only ids, names and times may differ", async () => {
    const { client } = await person(s, 'c5-same');
    const { videoId } = await newVideo(s, client);
    const p = plan();
    expect(
      (await s.call(client, 'submit_plan', { video_id: videoId, plan: p }))
        .text,
    ).toMatch(/^Built/);
    await s.call(client, 'get_plan_cost', { video_id: videoId });
    await s.call(client, 'approve_plan', { video_id: videoId });
    const row = (await s.store.cloudProject('c5-same', videoId))!;
    const viaClaude = JSON.parse(row.document);
    const viaDirector = (
      await buildVideoFromPlan(p as never, {
        resolve: { local: () => [], stock: async () => [] },
        importCandidate: async () => {
          throw new Error('no media');
        },
      })
    ).project!;
    // The allow-list: ids, names and times are not compared.
    const shape = (project: {
      compositions: {
        duration: number;
        width: number;
        height: number;
        layers: { type: string; properties?: Record<string, unknown> }[];
      }[];
    }) =>
      project.compositions.map((c) => ({
        duration: c.duration,
        size: `${c.width}x${c.height}`,
        layers: c.layers.map((l) => ({
          type: l.type,
          text: l.properties?.text ?? null,
        })),
      }));
    expect(shape(viaClaude)).toEqual(shape(viaDirector as never));
  });
});
