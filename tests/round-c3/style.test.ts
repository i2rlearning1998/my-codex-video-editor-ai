// ROUND-C3 Part 3 (RDC3-030 to RDC3-033): the Project's style for Claude
// and the upgrade step.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startC2, type C2 } from '../round-c2/helpers';
import { approved, newVideo, person, plan } from './helpers';

let s: C2;
beforeAll(async () => {
  s = await startC2();
});
afterAll(() => s.close());

const styled = () => ({
  ...plan('Rivers'),
  feel: {
    palette: { background: '#102030', text: '#ffffff', accent: '#ffcc00' },
    headingFont: 'Poppins',
    bodyFont: 'Inter',
    captionStyle: 'bold-box',
    pacing: 'slow',
  },
});

describe('[RDC3-030] the Project style is saved from the first approved video', () => {
  it("[RDC3-030] approve_plan of a Project's first video saves its style (styleFromPlan) and says so in one sentence; get_style reads it in sentences; a second video adds an example without replacing it", async () => {
    const { client } = await person(s, 'c3-style');
    const { projectId, videoId } = await newVideo(s, client);
    expect(
      (await s.call(client, 'get_style', { project_id: projectId })).text,
    ).toBe(
      'This Project has no style yet. It is saved from the first approved video.',
    );
    const ok = await approved(s, client, videoId, styled() as never);
    expect(ok.text).toMatch(
      /This Project's style was saved from this video \(look, fonts, captions, voice, music, script\): later videos in this Project start from it\.$/,
    );
    const st = (await s.call(client, 'get_style', { project_id: projectId }))
      .text;
    expect(st).toContain('Colours: #102030, #ffffff, #ffcc00.');
    expect(st).toContain('Fonts: Poppins for headings, Inter for text.');
    expect(st).toContain('Example videos: 1.');
    expect(st).not.toMatch(/[{[]\s*"/);
    const v2 = await s.call(client, 'create_video', {
      project_id: projectId,
      name: 'Two',
      video_type: 'explainer',
    });
    const second = /video_id ([0-9a-f-]{36})/.exec(v2.text)![1]!;
    const again = await approved(s, client, second, plan('Two') as never);
    expect(again.text).not.toContain('style was saved');
    expect(
      (await s.call(client, 'get_style', { project_id: projectId })).text,
    ).toContain('Example videos: 2.');
  });
});

describe('[RDC3-031] a new video starts from the Project style', () => {
  it("[RDC3-031] create_video in a Project with a style says its Brief starts from it, and get_brief_fields shows the style's answers", async () => {
    const { client } = await person(s, 'c3-prefill');
    const { projectId, videoId } = await newVideo(s, client);
    await approved(s, client, videoId, styled() as never);
    const v = await s.call(client, 'create_video', {
      project_id: projectId,
      name: 'Next',
      video_type: 'explainer',
    });
    expect(v.text).toMatch(/Its Brief starts from the Project's style/);
    const id = /video_id ([0-9a-f-]{36})/.exec(v.text)![1]!;
    const f = await s.call(client, 'get_brief_fields', { video_id: id });
    expect(f.text).toMatch(/\(from the Project's style\)/);
  });
});

describe('[RDC3-032] the Style chat for Claude', () => {
  it('[RDC3-032] style_chat proposes a before/after list and saves nothing; apply_style_change saves it for later videos only; unclear, same and refused messages each get one sentence', async () => {
    const { client } = await person(s, 'c3-chat');
    const { projectId, videoId } = await newVideo(s, client);
    await approved(s, client, videoId, styled() as never);
    const before = (
      await s.call(client, 'get_style', { project_id: projectId })
    ).text;
    const r = await s.call(client, 'style_chat', {
      project_id: projectId,
      message: 'Use #ff0000 as the accent colour',
    });
    expect(r.text).toMatch(
      /^Proposed changes \(nothing is saved yet\):\n- palette: /,
    );
    expect(r.text).toContain('They apply to later videos only.');
    expect(
      (await s.call(client, 'get_style', { project_id: projectId })).text,
    ).toBe(before);
    const ok = await s.call(client, 'apply_style_change', {
      project_id: projectId,
    });
    expect(ok.text).toMatch(
      /^Saved\. Later videos in "Science" use the new style; videos already made are unchanged\.$/,
    );
    expect(
      (await s.call(client, 'get_style', { project_id: projectId })).text,
    ).toContain('#ff0000');
    expect(
      (await s.call(client, 'apply_style_change', { project_id: projectId }))
        .text,
    ).toBe('There is no proposed change. Call style_chat first.');
    const unclear = await s.call(client, 'style_chat', {
      project_id: projectId,
      message: 'hmm',
    });
    expect(unclear.text).toMatch(
      /^It is not clear what to change\.|^The style already is like that/,
    );
  });
});

describe('[RDC3-033] the upgrade step for Claude', () => {
  it('[RDC3-033] submit_plan keeps the "Extra ideas" (the Video sheet too); get_plan_cost lists them as removable, or asks for one or two when none were given; a Style can turn the step off', async () => {
    const { client } = await person(s, 'c3-ideas');
    const { videoId } = await newVideo(s, client);
    await s.call(client, 'submit_plan', {
      video_id: videoId,
      plan: plan(),
      extra_ideas: ['A size comparison: the Nile beside a city'],
    });
    const cost = await s.call(client, 'get_plan_cost', { video_id: videoId });
    expect(cost.text).toContain(
      'Extra ideas (the person can remove them): A size comparison: the Nile beside a city.',
    );
    const mem = await s.call(client, 'read_memory', { video_id: videoId });
    expect(mem.text).toContain(
      'Extra ideas: A size comparison: the Nile beside a city.',
    );
    await s.call(client, 'submit_plan', { video_id: videoId, plan: plan() });
    expect(
      (await s.call(client, 'get_plan_cost', { video_id: videoId })).text,
    ).toContain(
      'Extra ideas: none were given. Think of one or two upgrades beyond what was asked',
    );
  });
});
