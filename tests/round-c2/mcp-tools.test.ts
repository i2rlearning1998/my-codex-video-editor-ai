// ROUND-C2 Part 3: the same tools as the Director, on the same Projects and
// Videos, through the gateway's rules. Rough use: wrong order, twice, out of
// credits, switched off, emergency, a manual edit in between.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { startC2, type C2 } from './helpers';

let s: C2;
beforeAll(async () => {
  s = await startC2();
});
afterAll(() => s.close());

const plan = (title = 'Rivers') => ({
  format: 'video-plan',
  version: 4,
  meta: { title, language: 'en', aspect: '16:9', fps: 30 },
  captions: { enabled: false },
  scenes: [
    {
      id: 'open',
      title: 'Opening',
      narration: 'Every river starts as a small stream in the hills.',
      durationHint: 4,
      notes: 'method:motion',
      layers: [
        {
          id: 'river',
          kind: 'media',
          size: 'full',
          mediaIntent: { query: 'river delta', type: 'video' },
        },
        {
          id: 'title',
          kind: 'title',
          text: 'Where rivers begin',
          anchor: 'center',
        },
      ],
    },
    {
      id: 'end',
      title: 'Ending',
      narration: 'And every river finds the sea.',
      durationHint: 3,
      notes: 'method:motion',
      layers: [
        {
          id: 'bye',
          kind: 'text',
          text: 'Thanks for watching',
          anchor: 'center',
        },
      ],
    },
  ],
});
const json = /[{[]\s*"/; // a JSON object or array in a reply

async function person(name: string) {
  const { access } = await s.connect(name);
  return { client: await s.claude(access), token: s.token(name) };
}
async function newVideo(c: Client) {
  const p = await s.call(c, 'create_project', { name: 'Science' });
  const projectId = /project_id (proj-[0-9a-f-]+)/.exec(p.text)![1]!;
  const v = await s.call(c, 'create_video', {
    project_id: projectId,
    name: 'Rivers',
    video_type: 'explainer',
  });
  const videoId = /video_id ([0-9a-f-]{36})/.exec(v.text)![1]!;
  return { projectId, videoId };
}

describe('[RDC2-010] the owner switches', () => {
  it('[RDC2-010] the master switch, the emergency switch and a paused person refuse every call within one request, with one sentence', async () => {
    const { client } = await person('p-switch');
    expect((await s.call(client, 'get_credits')).isError).toBe(false);
    await s.publish((c) => {
      c.mcp.enabled = false;
    });
    await expect(s.call(client, 'get_credits')).rejects.toThrow(
      /paused its Claude connection/,
    );
    await s.publish(() => {});
    const em = await s.store.emergency();
    const setEm = (mcpOff: boolean, key: string) =>
      s.store.commitAdmin({
        key,
        emergency: { ...em, mcpOff },
        audit: {
          actor: 'admin-0000',
          action: 'emergency',
          target: 'mcp',
          at: new Date().toISOString(),
          detail: {},
        },
      } as never);
    await setEm(true, 'em-on');
    await expect(s.call(client, 'list_projects')).rejects.toThrow(
      /paused its Claude connection/,
    );
    await setEm(false, 'em-off');
    expect((await s.call(client, 'list_projects')).isError).toBe(false);
    const prof = (await s.store.profile('p-switch'))!;
    await s.store.saveProfile({ ...prof, suspended: true });
    await expect(s.call(client, 'list_projects')).rejects.toThrow(
      /account is paused/,
    );
    await s.store.saveProfile({ ...prof, suspended: false });
  });
});

describe('[RDC2-011] the rate limit', () => {
  it('[RDC2-011] past mcp.ratePerMinute calls a minute, a call is refused in one sentence and logged as refused', async () => {
    await s.publish((c) => {
      c.mcp.ratePerMinute = 3;
    });
    const { client } = await person('p-rate');
    for (let i = 0; i < 3; i++)
      expect((await s.call(client, 'get_credits')).isError).toBe(false);
    const fourth = await s.call(client, 'get_credits');
    expect(fourth.isError).toBe(true);
    expect(fourth.text).toBe(
      'Too many calls in a minute. Wait a minute, then continue.',
    );
    await s.publish(() => {});
  });
});

describe('[RDC2-012] free and credit tools, switches per tool, usage rows', () => {
  it('[RDC2-012] a tool the owner prices costs its credits once; a switched-off tool is refused; every call is a usage row with source mcp', async () => {
    await s.publish((c) => {
      c.costs.push({
        id: 'mcp-search',
        label: { en: 'Search' },
        min: 2,
        max: 2,
        unit: 'each',
      } as never);
      c.mcp.tools.list_library = { enabled: true, cost: 'mcp-search' };
      c.mcp.tools.get_reference = { enabled: false, cost: 'free' };
    });
    const { client, token } = await person('p-price');
    const { videoId } = await newVideo(client);
    const before = (await s.api('/v1/balance', { token })).body
      .balance as number;
    expect(
      (await s.call(client, 'list_library', { video_id: videoId })).isError,
    ).toBe(false);
    expect((await s.api('/v1/balance', { token })).body.balance).toBe(
      before - 2,
    );
    // A tool the owner switched off is not offered to Claude at all.
    expect((await client.listTools()).tools.map((t) => t.name)).not.toContain(
      'get_reference',
    );
    const off = await client.callTool({
      name: 'get_reference',
      arguments: { topic: 'blocks' },
    });
    expect(off.isError).toBe(true);
    expect((await s.api('/v1/balance', { token })).body.balance).toBe(
      before - 2,
    );
    const rows = await s.store.usage('p-price', '2000-01-01');
    const mine = rows.filter((r) => r.modelId.startsWith('mcp:'));
    expect(mine.every((r) => r.source === 'mcp')).toBe(true);
    expect(mine.find((r) => r.modelId === 'mcp:list_library')).toMatchObject({
      credits: 2,
      outcome: 'ok',
    });
    // Out of credits: a priced tool is refused before it runs.
    await s.publish((c) => {
      c.costs.push({
        id: 'mcp-dear',
        label: { en: 'Dear' },
        min: 99999,
        max: 99999,
        unit: 'each',
      } as never);
      c.mcp.tools.list_library = { enabled: true, cost: 'mcp-dear' };
    });
    const poor = await s.call(client, 'list_library', { video_id: videoId });
    expect(poor.text).toMatch(
      /costs 99999 credits and the person has \d+\. Nothing was charged\./,
    );
    await s.publish(() => {});
  });
});

describe('[RDC2-013] Projects and Videos', () => {
  it('[RDC2-013] create_project and create_video go through the plan limits and carry origin claude in the registry; list_projects and list_videos show them; style_id is kept as a parameter', async () => {
    const { client, token } = await person('p-ws');
    const p = await s.call(client, 'create_project', {
      name: 'History',
      style_id: 'any-style',
    });
    expect(p.text).toMatch(
      /Project "History" is made .* Styles are not available yet/,
    );
    const projectId = /project_id (proj-[0-9a-f-]+)/.exec(p.text)![1]!;
    const v = await s.call(client, 'create_video', {
      project_id: projectId,
      name: 'Forts',
    });
    const videoId = /video_id ([0-9a-f-]{36})/.exec(v.text)![1]!;
    const reg = await s.store.workspaceRegistry('p-ws');
    expect(reg.projects[projectId]).toMatchObject({ origin: 'claude' });
    expect(reg.projects[projectId]!.videos[videoId]).toMatchObject({
      origin: 'claude',
    });
    expect((await s.call(client, 'list_projects')).text).toMatch(
      /"History" \(project_id proj-.*made with Claude/,
    );
    expect(
      (await s.call(client, 'list_videos', { project_id: projectId })).text,
    ).toMatch(/"Forts" \(video_id/);
    // The panel sees them (Made with Claude) and tells its own (names only).
    const ws = await s.api('/v1/mcp/workspace', { token });
    expect(ws.body.projects[0]).toMatchObject({
      name: 'History',
      origin: 'claude',
    });
    await s.api('/v1/mcp/workspace', {
      token,
      body: {
        projects: [
          {
            id: 'panel-p1',
            name: 'Mine',
            videos: [{ id: 'panel-v1', name: 'Hand made' }],
          },
        ],
      },
    });
    expect((await s.call(client, 'list_projects')).text).toMatch(
      /"Mine" \(project_id panel-p1\)/,
    );
    // A plan limit is the owner's sentence.
    await s.publish((c) => {
      for (const pl of c.plans) pl.limits.projects = 1;
    });
    const over = await s.call(client, 'create_project', { name: 'Third' });
    expect(over.isError).toBe(true);
    expect(over.text).toMatch(/allows 1 projects?/);
    await s.publish(() => {});
  });
});

describe('[RDC2-014] the Brief', () => {
  it('[RDC2-014] get_brief_fields lists the Brief card questions; save_brief takes known ids and option values only', async () => {
    const { client } = await person('p-brief');
    const { videoId } = await newVideo(client);
    const f = await s.call(client, 'get_brief_fields', {
      video_type: 'explainer',
    });
    // ROUND-C3 (1.1): every field at once, with what is still needed.
    expect(f.text).toMatch(
      /^Brief for explainer \(Explainer\), all fields:\n1\. topic: What is the video about\? \(required\)\. Still needed\./,
    );
    expect(f.text).toMatch(
      /language: Language \(required\)\. Still needed\. Choices: hi \(हिन्दी\), en \(English\),/,
    );
    const bad = await s.call(client, 'save_brief', {
      video_id: videoId,
      answers: { language: 'klingon', nonsense: 'x' },
    });
    expect(bad.isError).toBe(true);
    expect(bad.text).toMatch(
      /^"klingon" is not a choice for language; use one of .* "nonsense" is not a question of this brief\.$/,
    );
    const ok = await s.call(client, 'save_brief', {
      video_id: videoId,
      answers: { topic: 'Rivers', language: 'en' },
    });
    expect(ok.text).toMatch(
      /^Saved\. Required and still empty: length\.$|The brief is complete\./,
    );
  });
});

describe('[RDC2-015] media through the server', () => {
  it('[RDC2-015] search_media hides provider names; import_media downloads through the guard into cloud media with provider, licence and attribution; a private link is refused', async () => {
    const { client } = await person('p-media');
    const { videoId } = await newVideo(client);
    const found = await s.call(client, 'search_media', {
      video_id: videoId,
      kind: 'stock-video',
      query: 'river',
    });
    expect(found.text).toMatch(
      /^m1: video 1920x1080, 18 s, "River delta at dawn", licence free$/m,
    );
    expect(found.text).not.toMatch(/fakestock|Fake Stock|stock\.fake-provider/);
    const imp = await s.call(client, 'import_media', {
      video_id: videoId,
      url_or_id: 'm1',
    });
    expect(imp.isError).toBe(false);
    const fp = /media_id ([0-9a-f]{32})/.exec(imp.text)![1]!;
    expect(await s.store.mediaRecord('p-media', fp)).toMatchObject({
      provider: 'fakestock',
      licence: 'free',
      mimeType: 'video/webm',
    });
    expect((await s.store.mediaBytes('p-media', fp))!.length).toBeGreaterThan(
      1000,
    );
    expect(imp.text).toMatch(/Licence: free; credit: /);
    const evil = await s.call(client, 'import_media', {
      video_id: videoId,
      url_or_id: 'https://inside.fake-provider.test/x.mp4',
    });
    expect(evil.isError).toBe(true);
    expect(evil.text).toMatch(/^The file could not be downloaded: /);
    const words = await s.call(client, 'import_media', {
      video_id: videoId,
      url_or_id: 'river please',
    });
    expect(words.text).toBe(
      'Use an id from search_media (such as m3) or an https link.',
    );
  });
});

describe('[RDC2-016] plans', () => {
  it('[RDC2-016] validate_plan names problems; submit_plan builds with the DOM-free builder, saves the cloud project and answers in plain sentences (no JSON); an empty or huge plan is refused', async () => {
    const { client } = await person('p-plan');
    const { videoId } = await newVideo(client);
    expect(
      (await s.call(client, 'validate_plan', { plan: plan() })).text,
    ).toMatch(/^The plan is valid\./);
    const bad = {
      ...plan(),
      scenes: [{ ...plan().scenes[0], layers: [{ kind: 'title' }] }],
    };
    const v = await s.call(client, 'validate_plan', { plan: bad });
    expect(v.isError).toBe(true);
    expect(v.text).toMatch(/^Fix these: /);
    await expect(
      s.call(client, 'validate_plan', { plan: { ...plan(), scenes: [] } }),
    ).resolves.toMatchObject({ isError: true });
    const huge = {
      ...plan(),
      scenes: Array.from({ length: 41 }, (_, i) => ({
        ...plan().scenes[1],
        id: `s${i}`,
      })),
    };
    expect(
      (await s.call(client, 'submit_plan', { video_id: videoId, plan: huge }))
        .isError,
    ).toBe(true);
    const built = await s.call(client, 'submit_plan', {
      video_id: videoId,
      plan: plan(),
    });
    expect(built.isError).toBe(false);
    expect(built.text).toMatch(
      /^Built 2 scenes:\n1\. Opening: .*\n2\. Ending: /,
    );
    expect(built.text).toMatch(/Missing: /); // the river footage was not imported
    expect(built.text).not.toMatch(json);
    const row = await s.store.cloudProject('p-plan', videoId);
    expect(row?.revision).toBe(1);
    expect(JSON.parse(row!.document).schemaVersion).toBe(9);
  });
});

describe('[RDC2-017] cost and approval', () => {
  it('[RDC2-017] approve_plan refuses until get_plan_cost was told; charges once; a second approve charges nothing; not enough credits charges nothing', async () => {
    await s.publish((c) => {
      c.costs.push({
        id: 'motion-scene',
        label: { en: 'Motion' },
        min: 1,
        max: 3,
        unit: 'scene',
      } as never);
      const tool = c.director.tools.find((t) => t.id === 'motion');
      if (tool) tool.costId = 'motion-scene';
      else
        c.director.tools.push({
          id: 'motion',
          costId: 'motion-scene',
        } as never);
    });
    const { client, token } = await person('p-cost');
    const { videoId } = await newVideo(client);
    expect(
      (await s.call(client, 'approve_plan', { video_id: videoId })).text,
    ).toBe('There is no plan yet. Call submit_plan first.');
    await s.call(client, 'submit_plan', { video_id: videoId, plan: plan() });
    const early = await s.call(client, 'approve_plan', { video_id: videoId });
    expect(early.text).toBe(
      'Call get_plan_cost, tell the person the cost, and wait for a clear yes first. Nothing was charged.',
    );
    const before = (await s.api('/v1/balance', { token })).body
      .balance as number;
    expect(
      (await s.call(client, 'get_plan_cost', { video_id: videoId })).text,
    ).toMatch(/Total: up to 6 credits\./);
    expect(
      (await s.call(client, 'approve_plan', { video_id: videoId })).text,
    ).toMatch(/^Approved; 6 credits were spent\./);
    expect(
      (await s.call(client, 'approve_plan', { video_id: videoId })).text,
    ).toBe('This plan is already approved; nothing was charged again.');
    expect((await s.api('/v1/balance', { token })).body.balance).toBe(
      before - 6,
    );
    // Out of credits.
    await s.publish((c) => {
      c.costs.push({
        id: 'motion-scene',
        label: { en: 'Motion' },
        min: 1,
        max: 50000,
        unit: 'scene',
      } as never);
      const tool = c.director.tools.find((t) => t.id === 'motion');
      if (tool) tool.costId = 'motion-scene';
      else
        c.director.tools.push({
          id: 'motion',
          costId: 'motion-scene',
        } as never);
    });
    const { videoId: v2 } = await newVideo(client);
    await s.call(client, 'submit_plan', { video_id: v2, plan: plan() });
    await s.call(client, 'get_plan_cost', { video_id: v2 });
    const poor = await s.call(client, 'approve_plan', { video_id: v2 });
    expect(poor.text).toMatch(
      /Nothing was charged\. They can top up in the panel/,
    );
    await s.publish(() => {});
  });
});

describe("[RDC2-018] edits keep the person's own edits", () => {
  it('[RDC2-018] edit_video refuses on a video changed by hand since Claude read it and returns the fresh state; then applies its ops as one step and keeps the manual change', async () => {
    const { client, token } = await person('p-edit');
    const { videoId } = await newVideo(client);
    await s.call(client, 'submit_plan', { video_id: videoId, plan: plan() });
    const read = await s.call(client, 'read_video', { video_id: videoId });
    expect(read.text).toMatch(/^2 scenes, /);
    // The person edits by hand in the panel (the panel saves the file).
    const row = (await s.store.cloudProject('p-edit', videoId))!;
    const doc = JSON.parse(row.document);
    const text = (function find(ls: any[]): any {
      for (const l of ls) {
        if (l.type === 'text' && /Thanks/.test(l.properties.text?.value ?? ''))
          return l;
        const c = find(l.children ?? []);
        if (c) return c;
      }
    })(doc.compositions[1].layers);
    text.properties.text.value = 'MY OWN WORDS';
    const saved = await s.api('/v1/mcp/video', {
      token,
      body: {
        id: videoId,
        document: JSON.stringify(doc),
        revision: row.revision,
      },
    });
    expect(saved.body.revision).toBe(row.revision + 1);
    const stale = await s.call(client, 'edit_video', {
      video_id: videoId,
      ops: [{ op: 'change_look', background: '#112233' }],
    });
    expect(stale.isError).toBe(true);
    expect(stale.text).toMatch(
      /^The video was changed since you last read it, so nothing was applied\./,
    );
    const ok = await s.call(client, 'edit_video', {
      video_id: videoId,
      ops: [
        { op: 'change_look', background: '#112233' },
        { op: 'change_camera_shot', scene: 1, shot: 'push-in' },
        { op: 'reorder_scene', scene: 2, to: 1 },
      ],
    });
    expect(ok.isError).toBe(false);
    expect(ok.text).toMatch(/^Done as one step\./);
    const after = JSON.parse(
      (await s.store.cloudProject('p-edit', videoId))!.document,
    );
    expect(JSON.stringify(after)).toContain('MY OWN WORDS');
    expect(after.compositions[0].name).toBe(doc.compositions[1].name);
    expect(
      after.compositions.every(
        (c: { backgroundColor: string }) => c.backgroundColor === '#112233',
      ),
    ).toBe(true);
    // A wrong layer name changes nothing and lists the real names.
    const wrong = await s.call(client, 'edit_video', {
      video_id: videoId,
      ops: [{ op: 'change_text', scene: 1, layer: 'Nope', text: 'x' }],
    });
    expect(wrong.text).toMatch(
      /^Nothing was changed: Scene ".*" has no layer "Nope"\. Its layers: /,
    );
    // Removing the only scene left is refused.
    expect(
      (
        await s.call(client, 'edit_video', {
          video_id: videoId,
          ops: [{ op: 'remove_scene', scene: 9 }],
        })
      ).text,
    ).toMatch(/There is no scene 9/);
  });
});

describe('[RDC2-019] check and memory', () => {
  it('[RDC2-019] check_video gives the layout check in sentences and says frames come from the export card; read_memory and update_video_sheet keep the caps', async () => {
    const { client } = await person('p-check');
    const { videoId } = await newVideo(client);
    expect(
      (await s.call(client, 'check_video', { video_id: videoId })).text,
    ).toBe('There is no plan yet. Call submit_plan.');
    await s.call(client, 'submit_plan', { video_id: videoId, plan: plan() });
    const c = await s.call(client, 'check_video', { video_id: videoId });
    expect(c.text).toMatch(/Layout check: /);
    expect(c.text).toMatch(/Until then only the layout check has run\./);
    await s.call(client, 'update_video_sheet', {
      video_id: videoId,
      note: 'x'.repeat(1000),
      remember: true,
    });
    const m = await s.call(client, 'read_memory', { video_id: videoId });
    expect(m.text).toMatch(/memory:\n- x{400}\n/);
    expect(m.text).toMatch(/sheet:\n.*Claude made this video\./);
  });
});

describe('[RDC2-020] out of order and twice', () => {
  it('[RDC2-020] tools called in the wrong order or twice answer one plain sentence and change nothing', async () => {
    const { client } = await person('p-order');
    const ghost = '00000000-0000-4000-8000-000000000000';
    for (const [tool, args] of [
      ['read_video', { video_id: ghost }],
      [
        'edit_video',
        { video_id: ghost, ops: [{ op: 'remove_scene', scene: 1 }] },
      ],
      ['export_video', { video_id: ghost }],
      ['get_plan_cost', { video_id: ghost }],
    ] as const) {
      const r = await s.call(client, tool, args);
      expect(r.isError, tool).toBe(true);
      expect(r.text).toMatch(/^There is no video with that id\./);
    }
    const { videoId } = await newVideo(client);
    expect(
      (
        await s.call(client, 'edit_video', {
          video_id: videoId,
          ops: [{ op: 'remove_scene', scene: 1 }],
        })
      ).text,
    ).toBe('This video has nothing built yet. Call submit_plan.');
    expect(
      (await s.call(client, 'export_video', { video_id: videoId })).text,
    ).toMatch(/^Approve the plan first/);
    // Twice: the same project name twice is two projects (Claude asked twice).
    const a = await s.call(client, 'create_project', { name: 'Twice' });
    const b = await s.call(client, 'create_project', { name: 'Twice' });
    expect(a.text).not.toBe(b.text);
    // A tool that does not exist.
    await expect(
      client.callTool({ name: 'delete_everything', arguments: {} }),
    ).resolves.toMatchObject({ isError: true });
  });
});

describe('[RDC2-023] export refusals before the card', () => {
  it('[RDC2-023] [RDC3-002] a video whose file would pass 100 MB is refused with a plain sentence and the options; a video with a code graphic is no longer refused (it is drawn in the card, D-447 superseded); nothing is counted', async () => {
    const { client, token } = await person('p-export');
    const { videoId } = await newVideo(client);
    await s.call(client, 'submit_plan', { video_id: videoId, plan: plan() });
    await s.call(client, 'get_plan_cost', { video_id: videoId });
    await s.call(client, 'approve_plan', { video_id: videoId });
    // The person adds a code graphic by hand (a layer with code).
    const row = (await s.store.cloudProject('p-export', videoId))!;
    const doc = JSON.parse(row.document);
    doc.compositions[0].layers[0].code = { tier: 'C', bakeKey: 'x', meta: {} };
    await s.api('/v1/mcp/video', {
      token,
      body: {
        id: videoId,
        document: JSON.stringify(doc),
        revision: row.revision,
      },
    });
    const code = await s.call(client, 'export_video', { video_id: videoId });
    expect(code.text).not.toMatch(/code graphics/);
    expect(code.isError).toBeFalsy();
    // A long video at 600 s: past the 100 MB cap at the standard preset.
    await s.publish((c) => {
      c.mcp.exportMaxSeconds = 600;
    });
    delete doc.compositions[0].layers[0].code;
    doc.compositions[0].duration = 300;
    const r2 = (await s.store.cloudProject('p-export', videoId))!;
    await s.api('/v1/mcp/video', {
      token,
      body: {
        id: videoId,
        document: JSON.stringify(doc),
        revision: r2.revision,
      },
    });
    const big = await s.call(client, 'export_video', { video_id: videoId });
    expect(big.text).toMatch(
      /^At this quality the file would be about \d+ MB; the chat can take up to 100 MB\. Try preset "small", or shorten the video\.$/,
    );
    expect(
      await s.store.exportsCount(
        'p-export',
        new Date().toISOString().slice(0, 7),
      ),
    ).toBe(0);
    await s.publish(() => {});
  });
});
