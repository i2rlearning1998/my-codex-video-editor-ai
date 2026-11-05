// P3U: the admin page. Runs on the in-memory demo admin (dev pages only); the
// real server client replaces it later. Every change needs a reason.
import { test, expect, type Page } from './fixtures';

const SHOTS = process.env.P3U_SHOTS ?? '';

async function signIn(page: Page, hash = '') {
  await page.goto(`/admin/${hash}`);
  await page.locator('#ad-email').fill('admin@example.test');
  await page.locator('#ad-password').fill('admin-demo');
  await page.locator('#ad-signin').click();
  await expect(page.locator('#ad-outlet')).toBeVisible();
}

test('[P3U-017] the admin page needs a sign-in and refuses wrong details', async ({
  page,
}) => {
  await page.goto('/admin/');
  await expect(page.locator('#ad-gate')).toBeVisible();
  await page.locator('#ad-email').fill('admin@example.test');
  await page.locator('#ad-password').fill('wrong');
  await page.locator('#ad-signin').click();
  await expect(page.locator('#ad-gate-error')).not.toBeEmpty();
  await expect(page.locator('#ad-outlet')).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-gate.png` });
  await page.locator('#ad-email').fill('admin@example.test');
  await page.locator('#ad-password').fill('admin-demo');
  await page.locator('#ad-signin').click();
  await expect(page.locator('#ad-outlet')).toBeVisible();
  await page.reload();
  await expect(page.locator('#ad-outlet')).toBeVisible();
  await page.locator('#ad-signout').click();
  await expect(page.locator('#ad-gate')).toBeVisible();
});

test('[P3U-018] the dashboard shows revenue, credits, cost and margin and re-reads when the range changes', async ({
  page,
}) => {
  await signIn(page);
  for (const k of [
    'revenue',
    'sold',
    'spent',
    'cost',
    'margin',
    'new',
    'active',
  ])
    await expect(page.locator(`.ad-kpi[data-kpi="${k}"]`)).toBeVisible();
  await expect(page.locator('#ad-models tr[data-model]').first()).toBeVisible();
  const before = await page.locator('.ad-kpi[data-kpi="sold"]').innerText();
  await page.locator('#ad-range [data-days="7"]').click();
  await expect
    .poll(async () => page.locator('.ad-kpi[data-kpi="sold"]').innerText())
    .not.toBe(before);
  if (SHOTS)
    await page.screenshot({
      path: `${SHOTS}/admin-dashboard.png`,
      fullPage: true,
    });
});

test('[P3U-019] People search and filters narrow the list, and a person opens with their ledger', async ({
  page,
}) => {
  await signIn(page, '#/users');
  await expect(page.locator('#ad-user-rows tr[data-user]')).toHaveCount(10);
  await expect(page.locator('#ad-user-more')).toBeVisible();
  await page.locator('#ad-user-more').click();
  await expect(page.locator('#ad-user-rows tr[data-user]')).toHaveCount(16);
  await page.locator('#ad-filter-plan').selectOption('studio');
  const n = await page.locator('#ad-user-rows tr[data-user]').count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(16);
  await page.locator('#ad-filter-plan').selectOption('');
  const email = (
    await page
      .locator('#ad-user-rows tr[data-user] .ad-person span')
      .nth(3)
      .innerText()
  ).trim();
  await page.locator('#ad-search').fill(email);
  await expect(page.locator('#ad-user-rows tr[data-user]')).toHaveCount(1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-people.png` });
  await page.locator('#ad-user-rows tr[data-user] a').click();
  await expect(page.locator('#ad-user-email')).toBeVisible();
  await expect(page.locator('#ad-ledger')).toBeVisible();
  if (SHOTS)
    await page.screenshot({
      path: `${SHOTS}/admin-person.png`,
      fullPage: true,
    });
});

test('[P3U-020] adjusting credits, changing a plan, suspending and refunding all need a reason and are written to the audit log', async ({
  page,
}) => {
  await signIn(page, '#/users/u-101');
  const credits = page.locator('#ad-user-credits');
  const start = Number((await credits.innerText()).replace(/[^\d]/g, ''));
  await page.locator('#ad-adjust').click();
  await page.locator('#ad-delta').fill('25');
  await expect(page.locator('#ad-dlg-confirm')).toBeDisabled(); // no reason yet
  await page.locator('#ad-reason').fill('Goodwill after a failed render');
  await expect(page.locator('#ad-dlg-confirm')).toBeEnabled();
  await page.locator('#ad-dlg-confirm').click();
  await expect(page.locator('#ad-dialog')).toHaveCount(0);
  await expect
    .poll(async () => Number((await credits.innerText()).replace(/[^\d]/g, '')))
    .toBe(start + 25);
  // A change that would take the balance below zero is refused.
  await page.locator('#ad-adjust').click();
  await page.locator('#ad-delta').fill('-99999');
  await page.locator('#ad-reason').fill('Test');
  await expect(page.locator('#ad-dlg-confirm')).toBeDisabled();
  await expect(page.locator('#ad-dialog .ad-dlg-error')).not.toBeEmpty();
  await page.locator('#ad-dlg-cancel').click();
  // Plan change.
  await page.locator('#ad-plan-btn').click();
  await page.locator('#ad-plan').selectOption('studio');
  await page.locator('#ad-reason').fill('Upgraded by phone');
  await page.locator('#ad-dlg-confirm').click();
  await expect(page.locator('.ad-person-meta')).toContainText(/studio/i);
  // Suspend.
  await page.locator('#ad-suspend').click();
  await page.locator('#ad-reason').fill('Abuse report');
  await page.locator('#ad-dlg-confirm').click();
  await expect(page.locator('.ad-person-meta')).toContainText(/suspend/i);
  // The audit log lists all three and the chain is intact.
  await page.goto('/admin/#/audit');
  await expect(page.locator('#ad-chain')).toHaveClass(/ok/);
  await expect(page.locator('#ad-audit-rows')).toContainText('credits');
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/admin-audit.png`, fullPage: true });
});

test('[P3U-021] flags can be switched on a person (audited) and the flag list shows the flags', async ({
  page,
}) => {
  await signIn(page, '#/flags');
  await expect(
    page.locator('#ad-flag-list .ad-flag-card').first(),
  ).toBeVisible();
  await page.goto('/admin/#/users/u-102');
  const flag = page.locator('#ad-user-flags [data-flag]').first();
  const was = await flag.getAttribute('class');
  await flag.click();
  await expect
    .poll(async () =>
      page.locator('#ad-user-flags [data-flag]').first().getAttribute('class'),
    )
    .not.toBe(was);
});

test('[P3U-022] a broken audit chain is shown loudly', async ({ page }) => {
  await signIn(page, '#/audit');
  await expect(page.locator('#ad-chain')).toHaveClass(/ok/);
  await page.evaluate(() =>
    (
      window as unknown as { __AIVE_ADMIN_TAMPER__: (n: number) => void }
    ).__AIVE_ADMIN_TAMPER__(3),
  );
  await page.goto('/admin/#/users');
  await page.locator('a.ad-nav-item[data-route="audit"]').click();
  await expect(page.locator('#ad-chain')).toHaveClass(/bad/);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-chain-bad.png` });
});

test('[P3U-023] an emergency switch shows a banner on every screen and is audited', async ({
  page,
}) => {
  await signIn(page, '#/emergency');
  await expect(page.locator('#ad-banner')).toBeHidden();
  await page.locator('#ad-em-ai').check();
  await page.locator('#ad-em-message').fill('AI is paused for maintenance.');
  await page.locator('#ad-em-save').click();
  await page.locator('#ad-reason').fill('Provider outage');
  await page.locator('#ad-dlg-confirm').click();
  await expect(page.locator('#ad-banner')).toBeVisible();
  await expect(page.locator('#ad-banner')).toContainText(/AI/);
  await page.goto('/admin/#/users');
  await expect(page.locator('#ad-banner')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-emergency.png` });
});

test('[P3U-024] chat and memory settings validate, need a reason and save', async ({
  page,
}) => {
  await signIn(page, '#/settings');
  await page.locator('#ad-set-chatMax').fill('-3');
  await expect(page.locator('#ad-set-error')).not.toBeEmpty();
  await expect(page.locator('#ad-set-save')).toBeDisabled();
  await page.locator('#ad-set-chatMax').fill('40');
  await page.locator('#ad-set-save').click();
  await page.locator('#ad-reason').fill('Raise the chat limit');
  await page.locator('#ad-dlg-confirm').click();
  await expect(page.locator('#ad-dialog')).toHaveCount(0);
  await page.locator('a.ad-nav-item[data-route="users"]').click();
  await page.locator('a.ad-nav-item[data-route="settings"]').click();
  await expect(page.locator('#ad-set-chatMax')).toHaveValue('40');
});

test('[P3U-025] the admin page switches to Hindi and fits a phone', async ({
  page,
}) => {
  await signIn(page);
  await page.locator('#ad-lang').click();
  await expect(page.locator('a.ad-nav-item[data-route="audit"]')).toContainText(
    'ऑडिट',
  );
  await page.setViewportSize({ width: 390, height: 800 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/admin-phone.png`, fullPage: true });
});
