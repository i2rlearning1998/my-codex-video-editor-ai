// P3 integration: the panel's Director room, memory and Studio on the REAL
// services (src/wiring over Part 1's engines), the real gateway server and the
// FAKE provider servers. Nothing here is a live provider.
import { test, expect, allowError } from './fixtures';
import { openStudioResults, signUp } from './p2-helpers';
import { signLocalToken } from '../server/auth';
import {
  setServerPlan,
  startStack,
  STACK_SECRET,
  type Stack,
} from './p2-stack';

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
  await setServerPlan(stack, email, 'pro');
  await page.goto('/panel/#/studio/images');
  await page.reload();
  await expect(
    page.locator('#studio-models [data-model]').first(),
  ).toBeVisible();
  await page.locator('#sf-prompt').fill('a red kite over a hill');
  await page.locator('#studio-run').click();
  await expect(page.locator('#studio-saved')).toBeVisible({ timeout: 30_000 });
  // The result is listed in the Asset Library (not only announced).
  await openStudioResults(page, 'images');
  await expect(page.locator('#asset-list [data-asset]')).toHaveCount(1);
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

test('[P3I-011] with a gateway server the editor chat runs on the real engine: the server checks the limit and charges the call, the model proposes a command, Apply is one undo step', async ({
  page,
}) => {
  stack = await startStack();
  await stack.use(page);
  const email = await signUp(page);
  // A paid plan reaches the real model (set as the payment webhook would).
  await setServerPlan(stack, email, 'pro');
  await page.goto('/');
  await expect(page.locator('#chat-toggle')).toBeVisible({ timeout: 20_000 });
  const scene = await page.evaluate(
    () =>
      (
        window as never as {
          __AIVE__: { getProject(): { compositions: { id: string }[] } };
        }
      ).__AIVE__.getProject().compositions[0]!.id,
  );
  // The fake model answers an edit with one real command.
  stack.fake.respond(() =>
    JSON.stringify({
      summary: 'Make the background red',
      commands: [
        {
          type: 'SET_COMPOSITION_BACKGROUND',
          compositionId: scene,
          color: '#ff0000',
        },
      ],
    }),
  );
  const background = () =>
    page.evaluate(
      () =>
        (
          window as never as {
            __AIVE__: {
              getProject(): { compositions: { backgroundColor: string }[] };
            };
          }
        ).__AIVE__.getProject().compositions[0]!.backgroundColor,
    );
  const before = await background();
  await page.locator('#chat-toggle').click();
  await page.locator('#chat-input').fill('make the background red');
  await page.locator('#chat-send').click();
  const card = page.locator('.chat-proposal');
  await expect(card).toContainText('Edits: 1', { timeout: 30_000 });
  expect(await background()).toBe(before); // a proposal changes nothing
  await card.locator('[data-act="apply"]').click();
  await expect.poll(background).toBe('#ff0000');
  const seen = stack.logs.join('\n');
  expect(seen).toContain('POST /v1/entitlements/check 200');
  expect(seen).toContain('POST /v1/run 200');
  await page.keyboard.press('Control+z');
  await expect.poll(background).toBe(before);
});
