// ROUND-C3 Part 0.4 (RDC3-006 to RDC3-008): logging in through Claude's
// Connect. The server is the real process (round-c2-stack); Claude is an
// MCP client; accounts are this browser's local accounts (a real Supabase
// is BLOCKED by its keys), except RDC3-008, which uses the Supabase
// stand-in for the email confirmation.
import { createHash, randomBytes } from 'node:crypto';
import { test, expect, allowError } from './fixtures';
import { PASSWORD } from './p2-helpers';
import { fakeCloud } from './cloud-fake';
import { startC2Stack, type C2Stack } from './round-c2-stack';

const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
let stack: C2Stack | null = null;
test.afterEach(async () => {
  await stack?.close();
  stack = null;
});

async function withServer(page: import('@playwright/test').Page) {
  stack = await startC2Stack((c) => {
    c.workspace.claudeConnector = true;
  });
  await page.addInitScript((u) => {
    (window as { __AIVE_GATEWAY_URL__?: string }).__AIVE_GATEWAY_URL__ = u;
  }, stack.url);
  await page.route('https://claude.ai/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }),
  );
  allowError(
    page,
    (m) => /401|404|Failed to load resource/.test(m),
    'RDC3-006: the panel reads the connector state before the person signs in; a 401 there is expected.',
  );
  return stack.url;
}
/** Claude's side: register, then /oauth/authorize; returns the consent page. */
async function connect(url: string) {
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
    state: 'c3',
  });
  const auth = await fetch(`${url}/oauth/authorize?${q}`, {
    redirect: 'manual',
  });
  const consent = auth.headers.get('location')!;
  return {
    path: consent.replace(/^https?:\/\/[^/]+/, ''),
    async token(code: string) {
      const r = await fetch(`${url}/oauth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: CALLBACK,
          client_id: reg.client_id,
          code_verifier: verifier,
        }),
      });
      return (await r.json()) as { access_token: string };
    },
  };
}
async function allow(page: import('@playwright/test').Page) {
  await expect(page.locator('#claude-consent h1')).toHaveText(
    'Allow Claude to make videos in your account',
  );
  await page.locator('#claude-allow').click();
  await expect(page).toHaveURL(/auth_callback\?state=c3&code=/);
  return new URL(page.url()).searchParams.get('code')!;
}

test("[RDC3-006] a person with no account: Claude's Connect opens Sign up with the consent page kept as next; after signing up they land on the consent page, press Allow and Claude gets a token", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const url = await withServer(page);
  const c = await connect(url);
  expect(c.path).toMatch(/^\/panel\/#\/connect-claude\?request=/);
  await page.goto(c.path);
  await expect(page).toHaveURL(/\/site\/#\/signup\?next=/);
  await expect(page.locator('#auth-claude')).toHaveText(
    'Sign up or log in to let your Claude make videos in your account. You will press Allow next.',
  );
  await page.locator('#auth-email').fill(`new-${Date.now()}@example.com`);
  await page.locator('#auth-password').fill(PASSWORD);
  await page.locator('#auth-submit').click();
  const code = await allow(page);
  expect((await c.token(code)).access_token).toMatch(/^mcpa\./);
});

test('[RDC3-007] [RDC3-052] a person with an account who cleared the browser: Connect opens Sign up, Log in keeps next, Allow works; the Claude connection and what Claude made survive the cleared browser and come back after logging in', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const url = await withServer(page);
  const email = `kept-${Date.now()}@example.com`;
  // First visit: sign up, connect, Claude makes a Project.
  let c = await connect(url);
  await page.goto(c.path);
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(PASSWORD);
  await page.locator('#auth-submit').click();
  const token = (await c.token(await allow(page))).access_token;
  const claude = await stack!.claude(token);
  const made = (
    (await claude.callTool({
      name: 'create_project',
      arguments: { name: 'Kept by Claude' },
    })) as { content: { text: string }[] }
  ).content[0]!.text;
  const projectId = /project_id (proj-[0-9a-f-]+)/.exec(made)![1]!;
  // The person clears the browser. The account itself lives on the account
  // server (here: the local account list is kept, as Supabase would).
  await page.goto('/site/');
  await page.evaluate(() => {
    const cloud = JSON.parse(localStorage.getItem('aive.localCloud') ?? '{}');
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(
      'aive.localCloud',
      JSON.stringify({ ...cloud, session: null }),
    );
  });
  await page.context().clearCookies();
  // Claude's connection is the server's record: still there.
  const still = await claude.callTool({ name: 'get_credits', arguments: {} });
  expect((still as { isError?: boolean }).isError).toBeFalsy();
  // Connect again from Claude: Sign up page, the person picks Log in.
  c = await connect(url);
  await page.goto(c.path);
  await expect(page).toHaveURL(/\/site\/#\/signup\?next=/);
  await page.locator('#auth-to-login').click();
  await expect(page).toHaveURL(/\/site\/#\/login\?next=.*connect-claude/);
  await expect(page.locator('#auth-login')).toBeVisible();
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(PASSWORD);
  await page.locator('#auth-submit').click();
  await allow(page);
  // Back in the panel: Claude's Project is pulled in again.
  await page.goto('/panel/#/projects');
  await expect(page.locator(`[data-ws-project="${projectId}"]`)).toBeVisible({
    timeout: 30_000,
  });
});

test('[RDC3-008] sign-up that needs email confirmation: the page says to confirm, then log in and press Allow (or go back to Claude and press Connect again); the confirmation email returns to Log in with next kept', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const cloud = await fakeCloud(page.context());
  cloud.confirmEmail = true;
  const next =
    '/panel/#/connect-claude?request=00000000-0000-4000-8000-000000000000';
  await page.goto(`/site/#/signup?next=${encodeURIComponent(next)}`);
  await page.evaluate(() => localStorage.setItem('aive.e2e.noAutoLogin', '1'));
  await page.reload();
  await page.locator('#auth-email').fill(`wait-${Date.now()}@example.com`);
  await page.locator('#auth-password').fill(PASSWORD);
  await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-error')).toHaveText(
    'Check your email to confirm the account, then log in',
  );
  await expect(page.locator('#auth-note')).toHaveText(
    'Confirm your email, then log in here and press Allow. If this page is closed by then, go back to Claude and press Connect again.',
  );
  const back = cloud.signupRedirects!.at(-1)!;
  expect(back).toMatch(/\/site\/#\/login\?next=/);
  expect(decodeURIComponent(back.split('next=')[1]!)).toBe(next);
});

test("[RDC3-009] the Connect Claude page: the site header's button opens it for a logged-out visitor (what it does, the address with Copy, the two steps, the three downloads, the person's own Claude plan line); without the online service it says so; the panel's Home has the same button and page with Door 4", async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Without the online service: one plain sentence, no address.
  await page.goto('/site/');
  await page.locator('#site-claude').click();
  await expect(page.locator('#site-claude-page [role="alert"]')).toHaveText(
    'Connecting Claude is not set up on this site yet.',
  );
  // With the server, logged out.
  const url = await withServer(page);
  await page.goto('/site/#/');
  await page.reload();
  await page.locator('#site-claude').click();
  await expect(page.locator('#site-claude-page h1')).toHaveText(
    'Make videos with your own Claude',
  );
  await expect(page.locator('#site-claude-address')).toHaveText(`${url}/mcp`);
  await expect(page.locator('#site-claude-copy')).toHaveAttribute(
    'data-address',
    `${url}/mcp`,
  );
  await expect(page.locator('#site-claude-plan')).toHaveText(
    'Your own Claude plan is used for the chat; the video work uses your credits here.',
  );
  await expect(page.locator('#site-claude-bundles [data-bundle]')).toHaveCount(
    3,
  );
  const zip = await page.request.get(
    (await page
      .locator('[data-bundle="video-director.zip"]')
      .getAttribute('href'))!,
  );
  expect(zip.status()).toBe(200);
  // The panel's Home.
  await page.locator('#site-signup').click();
  await page.locator('#auth-email').fill(`home-${Date.now()}@example.com`);
  await page.locator('#auth-password').fill(PASSWORD);
  await page.locator('#auth-submit').click();
  await expect(page).toHaveURL(/\/panel\//);
  await page.goto('/panel/#/home');
  await page.locator('#home-claude').click();
  await expect(page.locator('#panel-claude-page h1')).toHaveText(
    'Make videos with your own Claude',
  );
  await expect(page.locator('#claude-door #claude-status')).toHaveText(
    'Not connected',
  );
});
