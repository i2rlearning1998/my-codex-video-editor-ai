// ROUND-C3 Part 4 (RDC3-040, RDC3-042, RDC3-043): the editor's full power
// for Claude: code graphics through edit_video, new families (frame,
// markers, master volume), live data in start_here, the check-and-fix loop.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startC2, type C2 } from '../round-c2/helpers';
import { approved, newVideo, person, plan } from './helpers';

let s: C2;
beforeAll(async () => {
  s = await startC2();
});
afterAll(() => s.close());
const BARS = readFileSync('tests/fixtures/round-c1/bar-rise.block.js', 'utf8');
const graphic = (source = BARS, id = 'bar-rise') => ({
  id,
  tier: 'B',
  source,
  summary: 'Bars.',
});

describe('[RDC3-040] code graphics through the connector', () => {
  it("[RDC3-040] add_graphic shows its cost first, then adds a checked code graphic and saves it to the Project AI library; read_graphic shows its code; set_graphic_params and replace_graphic_code change it as one step, keeping the person's settings; a broken graphic gets its checks back", async () => {
    const { client } = await person(s, 'c3-gfx');
    const { videoId } = await newVideo(s, client);
    await approved(s, client, videoId);
    const op = { op: 'add_graphic', scene: 1, graphic: graphic() };
    const ask = await s.call(client, 'edit_video', {
      video_id: videoId,
      ops: [op],
    });
    expect(ask.text).toMatch(
      /^1 new graphic\.\nIt costs up to \d+ credits .* Nothing was changed or charged\./,
    );
    const key = /confirm_scene "([^"]+)"/.exec(ask.text)![1]!;
    const done = await s.call(client, 'edit_video', {
      video_id: videoId,
      ops: [op],
      confirm_scene: key,
    });
    expect(done.text).toMatch(/^Done as one step\. \d+ credits were spent/);
    expect(done.text).toContain('"Rising bars"');
    const mem = await s.call(client, 'read_memory', { video_id: videoId });
    expect(mem.text).toContain("1 graphic saved to the Project's AI library.");
    const code = await s.call(client, 'read_graphic', {
      video_id: videoId,
      scene: 1,
      layer: 'Rising bars',
    });
    expect(code.text).toMatch(
      /^Graphic "Rising bars" \(tier B\)\. Settings: color = #ffb703, bars = 5, speed = 1\.\nCode:\n\(\{/,
    );
    await s.call(client, 'edit_video', {
      video_id: videoId,
      ops: [
        {
          op: 'set_graphic_params',
          scene: 1,
          layer: 'Rising bars',
          params: { bars: 9 },
        },
      ],
    });
    expect(
      (
        await s.call(client, 'read_graphic', {
          video_id: videoId,
          scene: 1,
          layer: 'Rising bars',
        })
      ).text,
    ).toContain('bars = 9');
    const wrong = await s.call(client, 'edit_video', {
      video_id: videoId,
      ops: [
        {
          op: 'set_graphic_params',
          scene: 1,
          layer: 'Rising bars',
          params: { size: 2 },
        },
      ],
    });
    expect(wrong.text).toBe(
      'Nothing was changed: "Rising bars" has no setting "size". Its settings: color, bars, speed.',
    );
    // A rewrite: the person's 9 bars stay.
    const faster = BARS.replace('default: 1 }', 'default: 2 }');
    await s.call(client, 'edit_video', {
      video_id: videoId,
      ops: [
        {
          op: 'replace_graphic_code',
          scene: 1,
          layer: 'Rising bars',
          graphic: graphic(faster),
        },
      ],
    });
    const after = (
      await s.call(client, 'read_graphic', {
        video_id: videoId,
        scene: 1,
        layer: 'Rising bars',
      })
    ).text;
    expect(after).toContain('bars = 9');
    expect(after).toContain('default: 2 }');
    // Broken code: its checks come back; nothing changes.
    const broken = await s.call(client, 'edit_video', {
      video_id: videoId,
      ops: [
        {
          op: 'replace_graphic_code',
          scene: 1,
          layer: 'Rising bars',
          graphic: graphic('({ id: 1 })'),
        },
      ],
    });
    expect(broken.text).toMatch(
      /^Nothing was changed: The graphic "bar-rise" failed its checks: .* Fix exactly these and send it again\.$/,
    );
  });
  it("[RDC3-040] a plan's new graphics (defs) join the Project AI library; set_frame, add_marker and set_master_volume reach the frame, markers and the mix", async () => {
    const { client } = await person(s, 'c3-defs');
    const { videoId } = await newVideo(s, client);
    const p = plan();
    (p as Record<string, unknown>).defs = { blocks: [graphic()] };
    p.scenes[0]!.layers.push({
      id: 'g',
      kind: 'block',
      block: 'bar-rise',
    } as never);
    const sub = await s.call(client, 'submit_plan', { video_id: videoId, plan: p });
    expect(sub.text, sub.text).toMatch(/^Built 2 scenes/);
    await s.call(client, 'get_plan_cost', { video_id: videoId });
    await s.call(client, 'approve_plan', { video_id: videoId });
    const r = await s.call(client, 'edit_video', {
      video_id: videoId,
      ops: [
        { op: 'set_frame', aspect: '9:16', fps: 25 },
        { op: 'add_marker', scene: 1, at: 1, label: 'Beat' },
        { op: 'set_master_volume', volume: 0.5 },
      ],
    });
    expect(r.text).toMatch(/^Done as one step\./);
    const row = (await s.store.cloudProject('c3-defs', videoId))!;
    const doc = JSON.parse(row.document);
    expect(doc.compositions[0].height).toBeGreaterThan(
      doc.compositions[0].width,
    );
    expect(doc.compositions[0].fps).toBe(25);
    expect(
      doc.compositions[0].markers.map((m: { label: string }) => m.label),
    ).toContain('Beat');
    expect(doc.settings.masterVolume).toBe(0.5);
    const d = await s.store.claudeDoc('c3-defs');
    const lib = Object.values(d.projects)[0]!.library!;
    expect(lib.map((g) => g.id)).toEqual(['bar-rise']);
  });
});

describe('[RDC3-042] live data in start_here', () => {
  it("[RDC3-042] start_here gives a version, what Claude can reach in sentences, the modes, Studios and Styles, and what changed since the version this person saw (with the owner's note); list_modes names the modes; create_video takes one", async () => {
    const { client } = await person(s, 'c3-live');
    const first = (await s.call(client, 'start_here')).text;
    expect(first).toMatch(/## Live \(version [0-9a-f]{12}\)/);
    expect(first).toContain('- Code layers (Tier A, B, C): ');
    expect(first).toContain('- Mode editor: ');
    expect(first).toContain('This is the first time this person connected');
    const same = (await s.call(client, 'start_here')).text;
    expect(same).toMatch(/Nothing changed since version [0-9a-f]{12}\./);
    await s.publish((c) => {
      c.mcp.whatsNew = 'Captions now have a karaoke style.';
      c.studios[0]!.enabled = !c.studios[0]!.enabled;
    });
    const changed = (await s.call(client, 'start_here')).text;
    expect(changed).toMatch(
      /Changed since version [0-9a-f]{12}:\n(New|Gone) Studio /,
    );
    expect(changed).toContain(
      'From the owner: Captions now have a karaoke style.',
    );
    expect((await s.call(client, 'list_modes')).text).toMatch(/^- editor: /);
    const p = await s.call(client, 'create_project', { name: 'Modes' });
    const pid = /project_id (proj-[0-9a-f-]+)/.exec(p.text)![1]!;
    expect(
      (
        await s.call(client, 'create_video', {
          project_id: pid,
          name: 'M',
          mode: 'editor',
        })
      ).text,
    ).toMatch(/^Video "M" is made/);
  });
});

describe('[RDC3-043] check, find, fix, check again', () => {
  it('[RDC3-043] a deliberately bad graphic: the check names the problem, replace_graphic_code fixes it, and the check passes; edit_video then saves the fix', async () => {
    const { client } = await person(s, 'c3-loop');
    const { videoId } = await newVideo(s, client);
    await approved(s, client, videoId);
    const bad = await s.call(client, 'edit_video', {
      video_id: videoId,
      ops: [
        {
          op: 'add_graphic',
          scene: 1,
          graphic: graphic(
            '({ id: "x", render() { while (true) {} } })',
            'bad',
          ),
        },
      ],
    });
    expect(bad.text).toMatch(
      /^Nothing was changed: The graphic "bad" failed its checks: /,
    );
    // Claude rewrites it and sends it again: accepted.
    const ask = await s.call(client, 'edit_video', {
      video_id: videoId,
      ops: [{ op: 'add_graphic', scene: 1, graphic: graphic() }],
    });
    const key = /confirm_scene "([^"]+)"/.exec(ask.text)![1]!;
    const ok = await s.call(client, 'edit_video', {
      video_id: videoId,
      ops: [{ op: 'add_graphic', scene: 1, graphic: graphic() }],
      confirm_scene: key,
    });
    expect(ok.text).toMatch(/^Done as one step\./);
    const check = await s.call(client, 'check_video', { video_id: videoId });
    expect(check.isError).toBe(false);
    expect(check.text).toMatch(/Layout check: /);
  });
});
