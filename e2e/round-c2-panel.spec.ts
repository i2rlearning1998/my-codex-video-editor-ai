// ROUND-C2 Parts 2, 3 and 6 in the panel (RDC2-040 to RDC2-042): Door 4
// ("Create with your own Claude"), the consent page during a real OAuth
// handshake, and what Claude made showing in the panel (Made with Claude).
// The server is the real process (round-c2-stack); Claude is an MCP client.
import { createHash, randomBytes } from 'node:crypto';
import { test, expect, allowError } from './fixtures';
import { signUp } from './p2-helpers';
import { startAi } from './round-b-helpers';
import { startC2Stack, type C2Stack } from './round-c2-stack';

const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
let stack: C2Stack | null = null;
test.afterEach(async () => {
  await stack?.close();
  stack = null;
});

async function panelWithServer(page: import('@playwright/test').Page) {
  stack = await startC2Stack((c) => {
    c.workspace.claudeConnector = true;
  });
  const url = stack.url;
  await page.addInitScript((u) => {
    (window as { __AIVE_GATEWAY_URL__?: string }).__AIVE_GATEWAY_URL__ = u;
  }, url);
  // Claude's callback is outside the test; answer it locally.
  await page.route('https://claude.ai/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }),
  );
  allowError(
    page,
    (m) => /401|404|Failed to load resource/.test(m),
    'RDC2-040: the Door 4 card reads the connections before and after Disconnect; a 401 or 404 there is shown as its plain sentence.',
  );
  await signUp(page);
  return url;
}

/** Claude's side of the handshake up to the consent page's address. */
async function startHandshake(url: string) {
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
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: reg.client_id,
    redirect_uri: CALLBACK,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    state: 'e2e',
  });
  const auth = await fetch(`${url}/oauth/authorize?${q}`, {
    redirect: 'manual',
  });
  return {
    consent: auth.headers.get('location')!,
    clientId: reg.client_id,
    verifier,
  };
}

test('[RDC2-040] Door 4 in New project: Not connected, Copy address, open Claude settings, the consent page with Allow, then Connected and Disconnect', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const url = await panelWithServer(page);
  await page.goto('/panel/#/projects?new=1');
  await page.locator('[data-option="claude"]').click();
  const door = page.locator('#np-door #claude-door');
  await expect(door.locator('#claude-status')).toHaveText('Not connected');
  await expect(door.locator('#claude-copy')).toHaveAttribute(
    'data-address',
    `${url}/mcp`,
  );
  await expect(door.locator('#claude-open-settings')).toHaveAttribute(
    'target',
    '_blank',
  );
  await expect(door.locator('[data-bundle]')).toHaveCount(3);
  await expect(door.locator('#claude-starters li')).toHaveCount(3);
  // Claude connects: the consent page opens in the panel.
  const h = await startHandshake(url);
  expect(h.consent).toMatch(/\/panel\/#\/connect-claude\?request=/);
  await page.goto(h.consent.replace(/^https?:\/\/[^/]+/, ''));
  await expect(page.locator('#claude-consent h1')).toHaveText(
    'Allow Claude to make videos in your account',
  );
  await expect(page.locator('#claude-consent-host')).toHaveText(
    'After this you go back to claude.ai.',
  );
  await page.locator('#claude-allow').click();
  await expect(page).toHaveURL(
    /^https:\/\/claude\.ai\/api\/mcp\/auth_callback\?state=e2e&code=/,
  );
  const code = new URL(page.url()).searchParams.get('code')!;
  const tok = await fetch(`${url}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: CALLBACK,
      client_id: h.clientId,
      code_verifier: h.verifier,
    }),
  });
  expect(tok.status).toBe(200);
  // Back in the panel: Connected, then Disconnect ends it.
  await page.goto('/panel/#/projects?new=1');
  await page.locator('[data-option="claude"]').click();
  await expect(page.locator('#claude-status')).toHaveText('Connected');
  await expect(page.locator('#claude-last-used')).toHaveText('Not used yet');
  await page.locator('#claude-disconnect').click();
  await expect(page.locator('#claude-status')).toHaveText('Not connected');
});

test('[RDC2-041] a consent request that expired, and Cancel, each say what happened in one sentence', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const url = await panelWithServer(page);
  await page.goto(
    '/panel/#/connect-claude?request=00000000-0000-4000-8000-000000000000',
  );
  await expect(page.locator('#claude-consent [role="alert"]')).toHaveText(
    'This request has expired. Go back to Claude and connect again.',
  );
  const h = await startHandshake(url);
  await page.goto(h.consent.replace(/^https?:\/\/[^/]+/, ''));
  await page.locator('#claude-cancel').click();
  await expect(page).toHaveURL(/auth_callback\?state=e2e&error=access_denied$/);
});

test('[RDC2-042] what Claude makes shows in the panel with "Made with Claude", on the Projects page, the Project page and the video card; "+ New video" has Door 4 too', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const url = await panelWithServer(page);
  // The person allows Claude (consent page), then Claude makes a video.
  const h = await startHandshake(url);
  await page.goto(h.consent.replace(/^https?:\/\/[^/]+/, ''));
  await page.locator('#claude-allow').click();
  await expect(page).toHaveURL(/code=/);
  const code = new URL(page.url()).searchParams.get('code')!;
  const t = (await (
    await fetch(`${url}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: CALLBACK,
        client_id: h.clientId,
        code_verifier: h.verifier,
      }),
    })
  ).json()) as { access_token: string };
  const claude = await stack!.claude(t.access_token);
  const text = (r: unknown) =>
    (r as { content: { text?: string }[] }).content[0]?.text ?? '';
  const p = text(
    await claude.callTool({
      name: 'create_project',
      arguments: { name: 'Rivers by Claude' },
    }),
  );
  const projectId = /project_id (proj-[0-9a-f-]+)/.exec(p)![1]!;
  const v = text(
    await claude.callTool({
      name: 'create_video',
      arguments: { project_id: projectId, name: 'Delta' },
    }),
  );
  expect(v).toMatch(/video_id/);
  // The panel pulls it in on its next start.
  await page.goto('/panel/#/projects');
  const card = page.locator(`[data-ws-project="${projectId}"]`);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.locator('[data-claude-tag]')).toHaveText(
    'Made with Claude',
  );
  await card.locator('.ws-thumb').click();
  await expect(page.locator('.rda-title-row [data-claude-tag]')).toHaveText(
    'Made with Claude',
  );
  await expect(page.locator('#video-list [data-claude-tag]')).toHaveCount(1);
  await page.locator('[data-new-video="claude"]').click();
  await expect(page.locator('#video-door #claude-status')).toHaveText(
    'Connected',
  );
});

test("[RDC2-043] AI mode's chat list shows Claude's steps on this Video, newest first, read-only; Editor mode shows nothing new", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const videoId = await startAi(page);
  await page.evaluate((id) => {
    localStorage.setItem(
      `aive.claude.activity.${id}`,
      JSON.stringify([
        { at: '2026-11-15T10:00:00.000Z', text: 'Made the plan' },
        { at: '2026-11-15T10:01:00.000Z', text: 'Built the video' },
      ]),
    );
  }, videoId);
  await page.locator('#ai-chats').click();
  const steps = page.locator('[data-claude-activity]');
  await expect(steps).toHaveCount(2);
  await expect(steps.first().locator('span')).toHaveText('Built the video');
  await expect(steps.locator('button, a, input')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('#layout-editor').click();
  await expect(page.locator('.editor-shell')).not.toHaveClass(/ai-layout/);
  await expect(page.locator('[data-claude-activity]')).toHaveCount(0);
});
