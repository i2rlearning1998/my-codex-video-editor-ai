// P2-R2 Part D: the editor reports exports; the server counts and enforces
// the plan's limits; a limit hit loses nothing; upgrading allows it again.
import type { Page } from '@playwright/test';
import { allowError, test, expect } from './fixtures';
import { setPlan, signUp } from './p2-helpers';
import { startStack, type Stack } from './p2-stack';

let stack: Stack | null = null;
test.afterEach(async () => {
  await stack?.close();
  stack = null;
});
const month = () => new Date().toISOString().slice(0, 7);
const dialog = (page: Page) => page.locator('.modal-dialog');
const usageRow = (page: Page, label: string) =>
  page.locator('#usage-table tr', { hasText: label }).locator('td').nth(1);
async function openExport(page: Page) {
  await page.locator('#export').click();
  await expect(dialog(page).locator('#export-form')).toBeVisible();
  await expect(dialog(page).locator('#export-format')).not.toHaveText(
    /Checking/,
  );
  const more = dialog(page).locator('#export-more');
  if ((await more.getAttribute('open')) === null)
    await more.locator('summary').click();
  await dialog(page).locator('#export-end').fill('0.5');
  await dialog(page).locator('#export-end').press('Tab');
}
test('[P2R2-025] [P2R2-026] the editor reports each export; the fourth on Free is stopped with the owner sentence and Upgrade, the project kept; after upgrading it exports again', async ({
  page,
}) => {
  test.setTimeout(240_000);
  stack = await startStack(['ANTHROPIC_API_KEY']);
  await stack.use(page);
  const email = await signUp(page);
  await page.goto('/panel/#/credits');
  await expect(usageRow(page, 'Exports')).toHaveText('0 / 3');
  // A real export is counted on the server.
  await page.goto('/');
  await openExport(page);
  const saving = page.waitForEvent('download', { timeout: 120_000 });
  await dialog(page).locator('#export-start-button').click();
  await saving;
  await page.goto('/panel/#/credits');
  await expect(usageRow(page, 'Exports')).toHaveText('1 / 3');
  // Two more this month (as if exported earlier).
  // The server's id for this person (its profile, found by email).
  const profiles = (
    stack.store as unknown as {
      data: { profiles: Record<string, { email?: string }> };
    }
  ).data.profiles;
  const id = Object.keys(profiles).find(
    (k) => profiles[k]!.email === email.toLowerCase(),
  )!;
  expect(await stack.store.profile(id)).toBeTruthy();
  await stack.store.addExport(id, month(), 'webm');
  await stack.store.addExport(id, month(), 'webm');
  await page.reload();
  await expect(usageRow(page, 'Exports')).toHaveText('3 / 3');
  // The fourth is stopped with the owner's sentence and Upgrade.
  await page.goto('/');
  const gateway = stack.url;
  allowError(
    page,
    (m) => m.includes('403') && m.includes(gateway),
    'The gateway refuses the fourth export on purpose (the plan limit).',
  );
  await openExport(page);
  await dialog(page).locator('#export-start-button').click();
  await expect(dialog(page).locator('#export-status')).toContainText(
    'Your plan allows 3 exports a month.',
  );
  await expect(dialog(page).locator('#export-status')).toContainText(
    'your project is saved',
  );
  await expect(stack.store.exportsCount(id, month())).resolves.toBe(3);
  // The project was saved before the check: nothing lost.
  await expect(page.locator('#save-status-dot')).not.toHaveClass(/unsaved/);
  // Upgrade (test-mode mock payment), then the export goes through.
  await dialog(page).locator('#export-upgrade').click();
  await expect(page).toHaveURL(/\/panel\/#\/credits/);
  await setPlan(page, 'creator');
  await expect(usageRow(page, 'Exports')).toHaveText('3 / no limit');
  await page.goto('/');
  await openExport(page);
  const again = page.waitForEvent('download', { timeout: 120_000 });
  await dialog(page).locator('#export-start-button').click();
  await again;
  await expect.poll(() => stack!.store.exportsCount(id, month())).toBe(4);
});

test('[P2R2-027] project, storage and voice-clone limits are checked on the server with real usage; nothing is made when one is hit, and upgrading allows it', async ({
  page,
}) => {
  test.setTimeout(180_000);
  stack = await startStack(['ANTHROPIC_API_KEY'], (c) => {
    const free = c.plans.find((p) => p.id === 'free')!;
    free.limits.projects = 1;
    free.limits.storageMb = 1;
    free.limits.voiceClones = 0;
  });
  await stack.use(page);
  await signUp(page);
  const gateway = stack.url;
  allowError(
    page,
    (m) => m.includes('403') && m.includes(gateway),
    'The gateway refuses over-limit actions on purpose.',
  );
  // Projects: the first is made, the second is stopped.
  await page.goto('/panel/#/projects');
  await page.locator('#new-blank').click();
  await page.locator('#blank-name').fill('First');
  await page.locator('#blank-form [type="submit"]').click();
  await expect(page).toHaveURL(/\/\?|\/$/);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as { __AIVE__?: unknown }).__AIVE__ !== undefined,
      ),
    )
    .toBe(true);
  await page.goto('/panel/#/projects');
  await expect(
    page.locator('#project-list [data-project]').first(),
  ).toBeVisible();
  await page.locator('#new-blank').click();
  await page.locator('#blank-name').fill('Second');
  await page.locator('#blank-form [type="submit"]').click();
  await expect(page.locator('#project-limit')).toContainText(
    'Your plan allows 1 projects.',
  );
  await expect(page.locator('#project-limit a')).toHaveAttribute(
    'href',
    '#/credits',
  );
  await expect(page).toHaveURL(/\/panel\//);
  // Storage: a voice result (2 MB) would pass the 1 MB plan: refused
  // before any credits move; a cloned voice is over the 0 clones limit.
  const credits = async () =>
    Number(
      (await page.locator('#credits-pill').textContent())!.replace(/\D+/g, ''),
    );
  await page.goto('/panel/#/studio/voice');
  const start = await credits();
  await page.locator('#f-text').fill('Namaste');
  await page.locator('[data-field="mode"] input[value="tts"]').check();
  await page.locator('#studio-run').click();
  await expect(page.locator('#studio-error')).toContainText(
    'Your plan has 1 MB of storage.',
  );
  await expect(page.locator('#studio-error a')).toHaveText('Upgrade');
  await page.locator('[data-field="mode"] input[value="clone"]').check();
  await page.locator('#studio-consent').check();
  await page.locator('#studio-run').click();
  await expect(page.locator('#studio-error')).toContainText(
    'Your plan allows 0 cloned voices.',
  );
  expect(await credits()).toBe(start);
  // Upgrade: the second project is allowed.
  await setPlan(page, 'creator');
  await page.goto('/panel/#/projects');
  await page.locator('#new-blank').click();
  await page.locator('#blank-name').fill('Second');
  await page.locator('#blank-form [type="submit"]').click();
  await expect(page).not.toHaveURL(/\/panel\//);
  // And the voice clone and its storage are allowed now.
  await page.goto('/panel/#/studio/voice');
  await page.locator('#f-text').fill('Namaste');
  await page.locator('[data-field="mode"] input[value="clone"]').check();
  await page.locator('#studio-consent').check();
  await page.locator('#studio-run').click();
  await expect(page.locator('#studio-result audio')).toBeVisible();
});
