// ROUND-C3: shared steps of the connector tests (the C2 stack: the real
// server in this process, Claude as the MCP SDK client).
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { C2 } from '../round-c2/helpers';

export const plan = (title = 'Rivers', scenes = 2) => ({
  format: 'video-plan',
  version: 4,
  meta: { title, language: 'en', aspect: '16:9', fps: 30 },
  captions: { enabled: false },
  scenes: Array.from({ length: scenes }, (_, i) => ({
    id: `s${i + 1}`,
    title: i === 0 ? 'Opening' : `Scene ${i + 1}`,
    narration: i === 0 ? 'Every river starts small.' : 'And finds the sea.',
    durationHint: 3,
    notes: 'method:library',
    layers: [
      {
        id: `t${i + 1}`,
        kind: 'title',
        text: i === 0 ? 'Where rivers begin' : 'The sea',
        anchor: 'center',
      },
    ],
  })),
});
export async function person(s: C2, name: string) {
  const { access } = await s.connect(name);
  return { client: await s.claude(access), token: s.token(name) };
}
export async function newVideo(s: C2, c: Client, type = 'explainer') {
  const p = await s.call(c, 'create_project', { name: 'Science' });
  const projectId = /project_id (proj-[0-9a-f-]+)/.exec(p.text)![1]!;
  const v = await s.call(c, 'create_video', {
    project_id: projectId,
    name: 'Rivers',
    video_type: type,
  });
  const videoId = /video_id ([0-9a-f-]{36})/.exec(v.text)![1]!;
  return { projectId, videoId };
}
/** submit_plan, get_plan_cost and approve_plan in the right order. */
export async function approved(s: C2, c: Client, videoId: string, p = plan()) {
  await s.call(c, 'submit_plan', { video_id: videoId, plan: p });
  await s.call(c, 'get_plan_cost', { video_id: videoId });
  return s.call(c, 'approve_plan', { video_id: videoId });
}
