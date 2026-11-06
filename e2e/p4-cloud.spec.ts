import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  menuAction,
  showCategory,
  toScreen,
} from './fixtures';

// P4 Part 2: the editor's Cloud switch and the leave dialog use the person's
// real cloud and plan space; the import dialogs list what the cloud holds.
async function open(page: Page) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
}
async function saveShape(page: Page) {
  const point = await toScreen(page, 80, 460);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await page
    .locator('#canvas-context-menu [data-action="save-to-mine"]')
    .click();
  await page
    .locator('#canvas-context-menu [data-action="save-to-mine-shape"]')
    .click();
  await expect(
    page.locator('.toast:not(.toast-leaving)', {
      hasText: 'Saved to My Templates',
    }),
  ).toHaveCount(1);
}
const cloud = (page: Page) =>
  page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('aive.localCloud') ?? '{}');
    return {
      projects: (store.projects ?? []).length as number,
      library: (store.library ?? []) as {
        id: string;
        kind: string;
        projectId: string;
        name: string;
        document: string;
      }[],
    };
  });

test('[P4C-002] turning the Cloud switch on sends the project and My Templates to the cloud, and a later template follows', async ({
  page,
}) => {
  await open(page);
  await saveShape(page);
  await page.locator('#cloud-sync').click();
  const panel = page.locator('.cloud-dialog');
  await panel.locator('[data-role="cloud-master"]').click();
  await expect(page.locator('#cloud-sync')).toHaveAttribute(
    'data-state',
    'synced',
  );
  await expect.poll(async () => (await cloud(page)).projects).toBe(1);
  const first = await cloud(page);
  expect(first.library.map((r) => r.kind)).toEqual(['templates']);
  await page.keyboard.press('Escape');
  await saveShape(page);
  await expect
    .poll(async () => (await cloud(page)).library.length, { timeout: 15_000 })
    .toBe(2);
});

test('[P4C-003] when the plan has no cloud space left, Save to cloud sends nothing, says so in one sentence and keeps the editor open', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'aive.limits.e2e-user',
      JSON.stringify({ exportsPerMonth: null, storageMb: 0, message: '' }),
    );
  });
  await open(page);
  await page.goBack().catch(() => undefined);
  const dialog = page.locator('.modal-dialog', {
    hasText: 'Save to your cloud?',
  });
  await dialog.locator('[data-role="cloud-exit-save"]').click();
  await expect(
    page.locator('.toast', { hasText: 'Your cloud space is full' }),
  ).toBeVisible();
  expect(page.url()).toContain('127.0.0.1');
  await expect(page.locator('#cloud-sync')).toBeVisible();
  expect((await cloud(page)).projects).toBe(0);
});

test('[P4C-004] Import Templates from your Cloud lists a template saved from another computer, marked "From your cloud", and imports it', async ({
  page,
}) => {
  await open(page);
  await saveShape(page);
  await page.locator('#cloud-sync').click();
  await page.locator('.cloud-dialog [data-role="cloud-master"]').click();
  await expect.poll(async () => (await cloud(page)).library.length).toBe(1);
  // "Another computer" saved the same kind of item from a project this browser does not know.
  await page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('aive.localCloud')!);
    const row = store.library[0];
    const doc = JSON.parse(row.document);
    store.library.push({
      ...row,
      id: 'remote-project:templates:r1',
      projectId: 'remote-project',
      name: 'Remote badge',
      document: JSON.stringify({ ...doc, id: 'r1', name: 'Remote badge' }),
    });
    localStorage.setItem('aive.localCloud', JSON.stringify(store));
  });
  await page.keyboard.press('Escape');
  await menuAction(page, '#new-project');
  await page.locator('#new-project-form button[type="submit"]').click();
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  await expect(page.locator('#new-project-form')).toBeHidden();
  await showCategory(page, 'MyTemplates');
  await expect(page.locator('#library-mine .shelf-item')).toHaveCount(0);
  await page.locator('#mine-import-library').click();
  const dialog = page.locator('.import-dialog');
  const row = dialog.locator('.import-row', { hasText: 'Remote badge' });
  await expect(row).toContainText('From your cloud');
  await row.locator('input').check();
  await dialog.locator('[data-role="mine-import-confirm"]').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#library-mine .shelf-item')).toHaveCount(1);
});

test('[P4C-005] Settings in the editor has no "Your own keys" or "Offline voice & captions" tab for a person', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('aive.developer', '0'));
  await open(page);
  await menuAction(page, '#open-settings');
  const tabs = page.locator('.settings-tabs [data-settings-tab]');
  await expect(tabs).toHaveCount(2);
  await expect(page.locator('[data-settings-tab="keys"]')).toHaveCount(0);
  await expect(page.locator('[data-settings-tab="offline"]')).toHaveCount(0);
});

test('[P4C-006] a template saved in the editor shows in the panel Asset Library under that project, and Back from the editor never leaves a stale Projects list', async ({
  page,
}) => {
  await open(page);
  await saveShape(page);
  const id = (await hook(page)).project.id;
  await page.goBack().catch(() => undefined);
  await page.locator('.modal-dialog [data-role="cloud-exit-leave"]').click();
  await expect.poll(() => page.url()).toBe('about:blank');
  await page.goto(`/panel/#/assets/p/${id}/templates`);
  await expect(page.locator('#asset-list [data-asset^="ed:"]')).toHaveCount(1);
  await page.goto('/panel/#/projects');
  await expect(
    page.locator(`#project-list [data-project="${id}"]`),
  ).toBeVisible();
});
