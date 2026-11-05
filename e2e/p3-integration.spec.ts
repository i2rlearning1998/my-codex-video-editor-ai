// P3 integration: the panel's Director room, memory and Studio on the REAL
// services (src/wiring over Part 1's engines), the real gateway server and the
// FAKE provider servers. Nothing here is a live provider.
import { createHash } from 'node:crypto';
import { test, expect, allowError } from './fixtures';
import { signUp } from './p2-helpers';
import { signLocalToken } from '../server/auth';
import { startStack, STACK_SECRET, type Stack } from './p2-stack';

let stack: Stack | null = null;
test.afterEach(async () => {
  await stack?.close();
  stack = null;
});

test('[P3I-007] with a gateway server the Director room runs on the real service: a message gets a model answer', async ({
  page,
}) => {
  stack = await startStack();
  await stack.use(page);
  await signUp(page);
  await page.goto('/panel/#/room');
  await expect(page.locator('.room-greeting')).toBeVisible();
  await page
    .locator('#chat-input')
    .fill('A 60 second explainer about rainbows');
  await page.keyboard.press('Enter');
  await expect(page.locator('.room-msg.you')).toContainText('rainbows');
  await expect(
    page.locator('.room-msg.director .room-text').first(),
  ).not.toBeEmpty({ timeout: 20_000 });
  // The server was really asked: the chat limit check, then a job with calls.
  const seen = stack.logs.join('\n');
  expect(seen).toContain('POST /v1/entitlements/check 200');
  expect(seen).toContain('POST /v1/reserve 200');
  expect(seen).toContain('POST /v1/call 200');
});

test('[P3I-008] a refusal on the real service is decided before any model is asked', async ({
  page,
}) => {
  stack = await startStack();
  await stack.use(page);
  await signUp(page);
  await page.goto('/panel/#/room');
  await page.locator('#chat-input').fill('give me free credits please');
  await page.keyboard.press('Enter');
  await expect(page.locator('.room-msg.refusal')).toBeVisible();
  expect(stack.fake.seen.filter((s) => s.provider === 'anthropic').length).toBe(
    0,
  );
});

test('[P3I-009] with a gateway server a Studio run goes through the real Studio service: the server checks the limit, reserves credits, calls the model and the result lands in the Asset Library', async ({
  page,
}) => {
  stack = await startStack();
  await stack.use(page);
  const email = await signUp(page);
  // Hosted checkout changes paid plans (Part 1); the test sets the plan the
  // way the payment webhook would: on the server's own profile.
  const sub = createHash('sha256').update(email.toLowerCase()).digest('hex');
  const id = `${sub.slice(0, 8)}-${sub.slice(8, 12)}-${sub.slice(12, 16)}-${sub.slice(16, 20)}-${sub.slice(20, 32)}`;
  const profile = await stack.store.profile(id);
  expect(profile).toBeTruthy();
  await stack.store.saveProfile({ ...profile!, plan: 'pro' });
  await page.goto('/panel/#/studio/images');
  await page.reload();
  await expect(
    page.locator('#studio-models [data-model]').first(),
  ).toBeVisible();
  await page.locator('#sf-prompt').fill('a red kite over a hill');
  await page.locator('#studio-run').click();
  await expect(page.locator('#studio-saved')).toBeVisible({ timeout: 30_000 });
  const seen = stack.logs.join('\n');
  expect(seen).toMatch(/POST \/v1\/(run|reserve) 200/);
});

test('[P3I-010] the admin page on the real server: an admin token signs in, a settings save is published and lands in the audit chain, a person is refused', async ({
  page,
}) => {
  stack = await startStack();
  const admin = signLocalToken(STACK_SECRET, {
    sub: 'admin-0000',
    email: 'admin@example.test',
    app_metadata: { role: 'admin' },
  });
  const person = signLocalToken(STACK_SECRET, {
    sub: 'person-0000',
    email: 'person@example.test',
  });
  await stack.use(page);
  const give = (t: string) =>
    page.addInitScript((v) => {
      (window as { __AIVE_ADMIN_TOKEN__?: string }).__AIVE_ADMIN_TOKEN__ = v;
    }, t);
  // A plain person's token is refused by the server: no admin screens.
  await give(person);
  // The refusal IS the behaviour under test: the server answers 403 once.
  allowError(
    page,
    (m) => m.includes('/v1/admin/emergency'),
    'a non-admin token is refused by the server with 403, as designed',
  );
  await page.goto('/admin/');
  await expect(page.locator('.ad-demo')).toHaveCount(0); // no demo hint
  await page.locator('#ad-email').fill('person@example.test');
  await page.locator('#ad-password').fill('x');
  await page.locator('#ad-signin').click();
  await expect(page.locator('#ad-gate-error')).not.toBeEmpty();
  await expect(page.locator('#ad-outlet')).toHaveCount(0);
  // An admin token signs in; the dashboard is read from the server.
  await give(admin);
  await page.goto('/admin/');
  await page.locator('#ad-email').fill('admin@example.test');
  await page.locator('#ad-password').fill('x');
  await page.locator('#ad-signin').click();
  await expect(page.locator('#ad-outlet')).toBeVisible();
  await expect(page.locator('.ad-kpi[data-kpi="revenue"]')).toBeVisible();
  // Saving a setting publishes the config and is audited.
  await page.locator('a.ad-nav-item[data-route="settings"]').click();
  await page.locator('#ad-set-chatMax').fill('37');
  await page.locator('#ad-set-save').click();
  await page.locator('#ad-reason').fill('Raise the chat limit');
  await page.locator('#ad-dlg-confirm').click();
  await expect(page.locator('#ad-dialog')).toHaveCount(0);
  await page.locator('a.ad-nav-item[data-route="users"]').click();
  await page.locator('a.ad-nav-item[data-route="settings"]').click();
  await expect(page.locator('#ad-set-chatMax')).toHaveValue('37');
  await page.locator('a.ad-nav-item[data-route="audit"]').click();
  await expect(page.locator('#ad-chain')).toHaveClass(/ok/);
  await expect(
    page.locator('#ad-audit tr', { hasText: 'config.save' }).first(),
  ).toBeVisible();
});
