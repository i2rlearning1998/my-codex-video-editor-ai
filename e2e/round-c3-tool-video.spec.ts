// ROUND-C3 Part 5 (RDC3-050): a video Claude builds is a tool video: the
// panel pulls in its Project, Video, file and AI library; the Asset Library
// lists the graphic under the Video's AI library; the editor opens the same
// layers and lists the graphic in its AI category.
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, expect, allowError, hook, showCategory } from './fixtures';
import { signUp } from './p2-helpers';
import { startC2Stack, type C2Stack } from './round-c2-stack';

const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
let stack: C2Stack | null = null;
test.afterEach(async () => {
  await stack?.close();
  stack = null;
});
const BARS = readFileSync('tests/fixtures/round-c1/bar-rise.block.js', 'utf8');
const text = (r: unknown) =>
  (r as { content: { text?: string }[] }).content[0]?.text ?? '';

test("[RDC3-050] a video Claude builds is a tool video: the panel shows its Project and Video, the Asset Library lists its graphic in the Video's AI library, the editor opens the same layers and its AI category lists the graphic", async ({
  page,
}) => {
  test.setTimeout(240_000);
  stack = await startC2Stack();
  const url = stack.url;
  await page.addInitScript((u) => {
    (window as { __AIVE_GATEWAY_URL__?: string }).__AIVE_GATEWAY_URL__ = u;
  }, url);
  await page.route('https://claude.ai/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }),
  );
  allowError(
    page,
    (m) => /401|404|Failed to load resource/.test(m),
    'RDC3-050: the panel reads the connector state; a 401 or 404 there is shown as its sentence.',
  );
  await signUp(page);
  // The person allows Claude on the consent page.
  const reg = (await (
    await fetch(`${url}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Claude',
        redirect_uris: [CALLBACK],
      }),
    })
  ).json()) as { client_id: string };
  const verifier = randomBytes(32).toString('base64url');
  const auth = await fetch(
    `${url}/oauth/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: reg.client_id,
      redirect_uri: CALLBACK,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      state: 'c3',
    })}`,
    { redirect: 'manual' },
  );
  await page.goto(
    auth.headers.get('location')!.replace(/^https?:\/\/[^/]+/, ''),
  );
  await page.locator('#claude-allow').click();
  await expect(page).toHaveURL(/code=/);
  const tok = (await (
    await fetch(`${url}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: new URL(page.url()).searchParams.get('code')!,
        redirect_uri: CALLBACK,
        client_id: reg.client_id,
        code_verifier: verifier,
      }),
    })
  ).json()) as { access_token: string };
  const claude = await stack.claude(tok.access_token);
  const call = async (name: string, args: Record<string, unknown>) =>
    text(await claude.callTool({ name, arguments: args }));
  const p = await call('create_project', { name: 'Charts by Claude' });
  const projectId = /project_id (proj-[0-9a-f-]+)/.exec(p)![1]!;
  const v = await call('create_video', { project_id: projectId, name: 'Bars' });
  const videoId = /video_id ([0-9a-f-]{36})/.exec(v)![1]!;
  expect(
    await call('submit_plan', {
      video_id: videoId,
      plan: {
        format: 'video-plan',
        version: 4,
        meta: { title: 'Bars', language: 'en', aspect: '16:9', fps: 30 },
        captions: { enabled: false },
        defs: {
          blocks: [
            { id: 'bar-rise', tier: 'B', source: BARS, summary: 'Bars rise.' },
          ],
        },
        scenes: [
          {
            id: 's1',
            title: 'Growth',
            narration: 'It grows.',
            durationHint: 3,
            layers: [{ id: 'g', kind: 'block', block: 'bar-rise' }],
          },
        ],
      },
    }),
  ).toMatch(/^Built 1 scenes/);
  await call('get_plan_cost', { video_id: videoId });
  await call('approve_plan', { video_id: videoId });
  // The panel pulls it in: Project, Video with its tag, the AI library card.
  await page.goto('/panel/#/projects');
  const card = page.locator(`[data-ws-project="${projectId}"]`);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.locator('[data-claude-tag]')).toHaveText(
    'Made with Claude',
  );
  await page.goto(`/panel/#/assets/v/${encodeURIComponent(videoId)}/ai`);
  await expect(page.locator('main h1')).toHaveText('AI Libraries');
  await page.goto(`/panel/#/assets/v/${encodeURIComponent(videoId)}/ai/pack`);
  await expect(
    page.locator(`[data-asset="claude-gfx-${videoId}-bar-rise"]`),
  ).toBeVisible({ timeout: 30_000 });
  // The editor opens the same file for the same person: its code layer is
  // there (no test stub person on the editor page).
  await page.evaluate(() => localStorage.setItem('aive.e2e.noAutoLogin', '1'));
  await page.goto(`/?open=${encodeURIComponent(videoId)}`);
  await expect
    .poll(async () => {
      const h = await hook(page);
      return h.project.id;
    })
    .toBe(videoId);
  const state = (await hook(page)) as unknown as {
    project: {
      compositions: { layers: { code?: { templateId?: string } }[] }[];
    };
  };
  const layers = state.project.compositions
    .flatMap((c) => c.layers)
    .map((l) => l.code?.templateId ?? '');
  expect(layers).toContain('plan-graphics-bar-rise');
  // The editor's AI category lists the graphic (this Video's My library).
  await showCategory(page, 'AI');
  await expect(page.locator('#library-ai')).toContainText('Rising bars');
});
