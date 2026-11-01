// P2-R2 Part B: accounts on Supabase (a stand-in of its HTTP API in this
// process, e2e/cloud-fake.ts; a real project is BLOCKED by its keys) and
// per-person data on one browser.
import { test, expect, hook, menuAction } from './fixtures';
import { fakeCloud } from './cloud-fake';
import { PASSWORD, signUp } from './p2-helpers';

test('[P2R2-012] Supabase accounts: sign up, the editor opens for the session, log out, reset with the emailed code; email confirmation and the Google button', async ({
  page,
}) => {
  const cloud = await fakeCloud(page.context());
  await page.goto('/site/#/login');
  // Only Supabase signs this person in (no test auto-login on the editor).
  await page.evaluate(() => localStorage.setItem('aive.e2e.noAutoLogin', '1'));
  // No Google client id: no Google button.
  await expect(page.locator('#auth-google')).toHaveCount(0);
  await expect(
    page.locator('.auth-form .muted', { hasText: 'Local mode' }),
  ).toHaveCount(0);
  const email = await signUp(page, 'meera.cloud@example.com');
  expect([...cloud.users.values()].map((u) => u.email)).toContain(email);
  expect(cloud.requests).toContain('POST /auth/v1/signup');
  // The editor opens for the Supabase session.
  await page.locator('#open-editor').click();
  await expect(page.locator('#composition-canvas')).toBeVisible();
  // Log out: the editor is closed to the visitor again.
  await page.goto('/panel/');
  await page.locator('#sign-out').click();
  await expect(page).toHaveURL(/\/site\/$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/site\/#\/login/);
  // Reset with the emailed code.
  await page.locator('#auth-forgot').click();
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-note')).toHaveText(
    'If this email has an account, a code was sent to it.',
  );
  await page.locator('#auth-code').fill('000000');
  await page.locator('#auth-password').fill('a brand new one');
  await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-error')).toHaveText(
    'The code is wrong or has expired',
  );
  await page.locator('#auth-code').fill('123456');
  await page.locator('#auth-submit').click();
  await expect(page).toHaveURL(/\/panel\//);
  expect(
    [...cloud.users.values()].find((u) => u.email === email)?.password,
  ).toBe('a brand new one');
  // Email confirmation on: sign-up asks the person to confirm first.
  cloud.confirmEmail = true;
  await page.locator('#sign-out').click();
  await expect(page).toHaveURL(/\/site\/$/);
  await page.goto('/site/#/signup');
  await page.locator('#auth-email').fill('ravi.cloud@example.com');
  await page.locator('#auth-password').fill(PASSWORD);
  await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-error')).toHaveText(
    'Check your email to confirm the account, then log in',
  );
  // With a Google client id, the button shows.
  await page.addInitScript(
    () =>
      ((
        window as { __AIVE_GOOGLE_CLIENT_ID__?: string }
      ).__AIVE_GOOGLE_CLIENT_ID__ = 'e2e.apps.googleusercontent.com'),
  );
  await page.goto('/site/#/login');
  await page.reload();
  await expect(page.locator('#auth-google')).toHaveText('Continue with Google');
});

test("[P2R2-013] two people on one browser never see each other's projects; the first one keeps the work made before accounts", async ({
  page,
}) => {
  // Work made before accounts (the e2e person of earlier tests is not used here).
  await page.goto('/site/');
  await page.evaluate(() => localStorage.setItem('aive.e2e.noAutoLogin', '1'));
  await signUp(page, 'first.person@example.com');
  await page.goto('/?new=First%20film&aspect=16:9');
  await expect
    .poll(async () => (await hook(page)).project.metadata.name)
    .toBe('First film');
  const firstId = (await hook(page)).project.id;
  await page.goto('/panel/#/projects');
  await expect
    .poll(async () => {
      await page.reload();
      await page.locator('#project-list').waitFor();
      return page.locator(`[data-project="${firstId}"]`).count();
    })
    .toBe(1);
  await page.locator('#sign-out').click();
  // A second person signs up on the same browser.
  await signUp(page, 'second.person@example.com');
  await page.goto('/panel/#/projects');
  await page.locator('#project-list').waitFor();
  await expect(page.locator(`[data-project="${firstId}"]`)).toHaveCount(0);
  // Their editor opens their own work, not the first person's.
  await page.goto('/');
  await expect
    .poll(async () => (await hook(page)).project.id)
    .not.toBe(firstId);
  await menuAction(page, '#open-projects');
  await expect(page.locator('.projects-dialog')).toBeVisible();
  await expect(page.locator('.projects-dialog')).not.toContainText(
    'First film',
  );
  // A project id of the first person cannot be opened by the second.
  await page.goto(`/?open=${firstId}`);
  await expect
    .poll(async () => (await hook(page)).project.id)
    .not.toBe(firstId);
  // The first person still has it.
  await page.goto('/panel/');
  await page.locator('#sign-out').click();
  await page.goto('/site/#/login');
  await page.locator('#auth-email').fill('first.person@example.com');
  await page.locator('#auth-password').fill(PASSWORD);
  await page.locator('#auth-submit').click();
  await expect(page).toHaveURL(/\/panel\//);
  await page.goto('/panel/#/projects');
  await expect(page.locator(`[data-project="${firstId}"]`)).toHaveCount(1);
});
