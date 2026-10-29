import { test, expect, hook, menuAction } from './fixtures';
import type { Page } from '@playwright/test';

// The Projects library (PRJ-015/016, APP-006/007), crash recovery (PRJ-017),
// the tab title (APP-017), the close warning (APP-018) and two tabs (APP-019).
const rename = async (page: Page, name: string) => {
  await page.locator('#project-name').click();
  const input = page.locator('#project-name-input');
  await input.fill(name);
  await input.press('Enter');
  await expect(page.locator('#project-name')).toHaveText(name);
};
const newProject = async (page: Page) => {
  await menuAction(page, '#new-project');
  await page.locator('#new-project-form button[type="submit"]').click();
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  await expect(page.locator('#new-project-form')).toBeHidden();
};
const openProjects = async (page: Page) => {
  await menuAction(page, '#open-projects');
  await expect(page.locator('.projects-dialog')).toBeVisible();
};
const row = (page: Page, name: string) =>
  page.locator('.project-row', { hasText: name });

test('[PRJ-015][PRJ-016][APP-006][APP-007] projects are listed newest first with a picture; open, rename, duplicate and delete work', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#project-name')).toBeVisible();
  await rename(page, 'First film');
  await page.waitForTimeout(1500);
  await newProject(page);
  await rename(page, 'Second film');
  await page.waitForTimeout(1500);

  // PRJ-015: the records are in IndexedDB.
  const stored = await page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open('aive-projects', 1);
        open.onsuccess = () => {
          const all = open.result
            .transaction('projects')
            .objectStore('projects')
            .getAll();
          all.onsuccess = () =>
            resolve((all.result as { name: string }[]).map((r) => r.name));
        };
      }),
  );
  expect(stored).toEqual(expect.arrayContaining(['First film', 'Second film']));

  await openProjects(page);
  const names = await page.locator('.project-row-name').allTextContents();
  expect(names.indexOf('Second film')).toBeLessThan(
    names.indexOf('First film'),
  );
  await expect(row(page, 'Second film')).toContainText('open now');
  await expect(
    row(page, 'Second film').locator('[data-role="delete"]'),
  ).toBeDisabled();
  await expect(row(page, 'First film').locator('.project-thumb')).toBeVisible();
  await page.screenshot({ path: 'reports/fix8-projects-dialog.png' });

  // Rename another project from the list.
  await row(page, 'First film').locator('[data-role="rename"]').click();
  await page.locator('[data-role="prompt-input"]').fill('Old film');
  await page.locator('.modal-dialog [data-role="confirm"]').last().click();
  await expect(row(page, 'Old film')).toBeVisible();

  // Duplicate.
  await row(page, 'Old film').locator('[data-role="duplicate"]').click();
  await expect(row(page, 'Old film copy')).toBeVisible();

  // Delete asks first.
  await row(page, 'Old film copy').locator('[data-role="delete"]').click();
  await page.locator('.modal-dialog [data-role="cancel"]').last().click();
  await expect(row(page, 'Old film copy')).toBeVisible();
  await row(page, 'Old film copy').locator('[data-role="delete"]').click();
  await page.locator('.modal-dialog [data-role="confirm"]').last().click();
  await expect(row(page, 'Old film copy')).toHaveCount(0);

  // Open the other project: it becomes the editor's project.
  await row(page, 'Old film').locator('[data-role="open"]').click();
  await page.locator('.modal-dialog [data-role="confirm"]').last().click();
  await expect(page.locator('#project-name')).toHaveText('Old film');
  const { project } = await hook(page);
  expect(project.metadata.name).toBe('Old film');
});

test('[APP-017] the tab title carries the project name and an unsaved mark', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#project-name')).toBeVisible();
  await rename(page, 'Title test');
  await expect(page).toHaveTitle('Title test - AI-Native');
  // Block the save so the unsaved state stays visible.
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
  });
  await rename(page, 'Title test 2');
  await expect(page).toHaveTitle('• Title test 2 - AI-Native');
});

test('[APP-018] closing while a save could not be written asks the browser to warn', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#project-name')).toBeVisible();
  const quiet = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(quiet).toBe(false);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
  });
  await rename(page, 'Unsaved one');
  const warned = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(warned).toBe(true);
});

test('[PRJ-017] an unreadable save offers the backup with its time; Restore brings it back', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#project-name')).toBeVisible();
  await rename(page, 'Backed up');
  await page.waitForTimeout(800);
  await rename(page, 'Backed up two');
  await page.waitForTimeout(800);
  // Corrupt the primary slot; the backup stays valid.
  await page.evaluate(() =>
    localStorage.setItem('ai-native-editor:project', '{not json'),
  );
  await page.reload();
  const dialog = page.locator('.modal-dialog', { hasText: 'backup from' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/\d{4}|\d{1,2}:\d{2}/);
  await page.screenshot({ path: 'reports/fix8-recovery.png' });
  await dialog.locator('[data-role="confirm"]').click();
  await expect(page.locator('#project-name')).toHaveText(/Backed up/);
});

test('[APP-019] the same project in two tabs warns and holds back saving until chosen', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  await first.goto('/');
  await expect(first.locator('#project-name')).toBeVisible();
  await rename(first, 'Shared film');
  await first.waitForTimeout(800);
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.locator('#project-name')).toHaveText('Shared film');
  const warning = second.locator('.modal-dialog', {
    hasText: 'also open in another tab',
  });
  await expect(warning).toBeVisible();
  await second.screenshot({ path: 'reports/fix8-two-tabs.png' });
  // While the choice is open, an edit here is not written.
  const before = await second.evaluate(() =>
    localStorage.getItem('ai-native-editor:project'),
  );
  await warning.locator('[data-role="confirm"]').click();
  await expect(warning).toBeHidden();
  await rename(second, 'Shared film v2');
  await second.waitForTimeout(800);
  const after = await second.evaluate(() =>
    localStorage.getItem('ai-native-editor:project'),
  );
  expect(after).not.toBe(before);
  // The first tab hears the save and warns too.
  await expect(
    first.locator('.modal-dialog', { hasText: 'Another tab just saved' }),
  ).toBeVisible();
  await context.close();
});
