import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  menuAction,
  showCategory,
  settleBuild,
  addOwnMedia,
  HONEY_MEDIA,
  toScreen,
} from './fixtures';

// FX10: user libraries belong to the open project; a new project is fresh.
const PLAN = readFileSync('tests/fixtures/plans/honey-en.json', 'utf8');

async function start(page: Page) {
  await page.addInitScript(() => {
    (window as { __AIVE_E2E_SPEECH__?: boolean }).__AIVE_E2E_SPEECH__ = true;
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
}
async function newProject(page: Page) {
  await menuAction(page, '#new-project');
  await page.locator('#new-project-form button[type="submit"]').click();
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  await expect(page.locator('#new-project-form')).toBeHidden();
}

test('[FX10-002] a new project starts with no AI composition of the earlier project', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await start(page);
  await newProject(page);
  await addOwnMedia(page, HONEY_MEDIA);
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  await page.locator('#ai-import-source').fill(PLAN);
  await page.locator('[data-action="build-video"]').click();
  await settleBuild(page);
  await page.locator('.plan-build #plan-cancel').click();
  await expect(page.locator('.plan-build')).toHaveCount(0);
  await showCategory(page, 'AI');
  const card = page.locator('#library-ai .shelf-item', {
    hasText: 'Where honey comes from',
  });
  await expect(card.first()).toBeVisible();
  const firstProject = (await hook(page)).project.id;

  await newProject(page);
  expect((await hook(page)).project.id).not.toBe(firstProject);
  await showCategory(page, 'AI');
  await expect(
    page.locator('#library-ai .shelf-item', {
      hasText: 'Where honey comes from',
    }),
  ).toHaveCount(0);
  await expect(page.locator('#library-ai')).toContainText('No AI items yet');
});

test('[FX10-002] a template saved in one project is not listed in a new project', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
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
  await showCategory(page, 'MyTemplates');
  await expect(page.locator('#library-mine .shelf-item')).toHaveCount(1);

  await newProject(page);
  await showCategory(page, 'MyTemplates');
  await expect(page.locator('#library-mine .shelf-item')).toHaveCount(0);
});

test('[FX10-004] Import Templates from your Cloud copies only the chosen template from another project into the open one', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  const save = async (kind: string) => {
    const point = await toScreen(page, 80, 460);
    await page.mouse.click(point.x, point.y, { button: 'right' });
    await page
      .locator('#canvas-context-menu [data-action="save-to-mine"]')
      .click();
    await page
      .locator(`#canvas-context-menu [data-action="save-to-mine-${kind}"]`)
      .click();
  };
  await save('shape');
  await expect(
    page.locator('.toast:not(.toast-leaving)', { hasText: 'Saved to My' }),
  ).toHaveCount(1);
  await page.waitForTimeout(400);
  await save('sticker');
  await showCategory(page, 'MyTemplates');
  await expect(page.locator('#library-mine .shelf-item')).toHaveCount(2);
  await newProject(page);
  await showCategory(page, 'MyTemplates');
  await expect(page.locator('#library-mine .shelf-item')).toHaveCount(0);
  await page.locator('#mine-import-library').click();
  const dialog = page.locator('.import-dialog');
  await expect(dialog.locator('.import-row')).toHaveCount(2);
  const search = dialog.locator('[data-role="mine-import-search"]');
  await search.fill('no such template');
  await expect(dialog.locator('.import-row')).toHaveCount(0);
  await search.fill('');
  await expect(dialog.locator('.import-row')).toHaveCount(2);
  await dialog.locator('.import-row input').first().check();
  await dialog.locator('[data-role="mine-import-confirm"]').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#library-mine .shelf-item')).toHaveCount(1);
});

test('[FX10-004] Import AI templates from your AI libraries copies a chosen AI composition into a new project', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await start(page);
  await newProject(page);
  await addOwnMedia(page, HONEY_MEDIA);
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  await page.locator('#ai-import-source').fill(PLAN);
  await page.locator('[data-action="build-video"]').click();
  await settleBuild(page);
  await page.locator('.plan-build #plan-cancel').click();
  await expect(page.locator('.plan-build')).toHaveCount(0);
  await newProject(page);
  await showCategory(page, 'AI');
  const card = page.locator('#library-ai .shelf-item', {
    hasText: 'Where honey comes from',
  });
  await expect(card).toHaveCount(0);
  await page.locator('#library-ai #ai-import-library').click();
  const dialog = page.locator('.import-dialog');
  const row = dialog
    .locator('.import-row', { hasText: 'Where honey comes from' })
    .filter({ hasText: 'composition' });
  await expect(row).toHaveCount(1);
  await row.locator('input').check();
  await dialog.locator('[data-role="ai-import-confirm"]').click();
  await expect(dialog).toHaveCount(0);
  await expect(card.first()).toBeVisible();
  await expect(card.first()).toContainText('Not built');
});

test('[FX10-005] deleting an AI composition card leaves its feel theme card,, and Undo and Redo never change the AI list', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await start(page);
  await newProject(page);
  await addOwnMedia(page, HONEY_MEDIA);
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  await page.locator('#ai-import-source').fill(PLAN);
  await page.locator('[data-action="build-video"]').click();
  await settleBuild(page);
  await page.locator('.plan-build #plan-cancel').click();
  await expect(page.locator('.plan-build')).toHaveCount(0);
  const cards = page.locator('#library-ai .shelf-item');
  const feel = cards.filter({ hasText: 'Where honey' });
  await expect(feel).toHaveCount(2);
  const composition = cards.filter({ hasText: 'Built' }).first();
  await composition.locator('.shelf-more').first().click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  // The composition card goes; its feel theme card stays.
  await expect(feel).toHaveCount(1);
  await expect(cards.filter({ hasText: 'Built' })).toHaveCount(0);
  // The AI list is not part of the history: Undo and Redo leave it alone.
  await page.locator('#composition-canvas').focus();
  const list = async () =>
    cards.evaluateAll((items) =>
      items.map((item) => (item as HTMLElement).dataset.itemId),
    );
  const names = await list();
  await page.keyboard.press('Control+z');
  await expect.poll(list).toEqual(names);
  await page.keyboard.press('Control+y');
  await expect.poll(list).toEqual(names);
});

test('[FX10-014] the build dialog and Review & swap count the same missing files', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await start(page);
  await newProject(page);
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  await page.locator('#ai-import-source').fill(PLAN);
  await page.locator('[data-action="build-video"]').click();
  const dialog = page.locator('.plan-build');
  await dialog
    .locator('#plan-missing:not([hidden])')
    .waitFor({ timeout: 90_000 });
  const title = await dialog.locator('.plan-missing-title').innerText();
  const missing = Number(/(\d+)/.exec(title)![1]);
  expect(missing).toBeGreaterThan(0);
  await dialog.locator('#plan-continue').click();
  await expect(dialog.locator('#plan-summary')).toBeVisible({
    timeout: 90_000,
  });
  await dialog.locator('#plan-review').click();
  const status = page.locator('.plan-review #plan-review-status');
  await expect(status).toContainText(`${missing} missing`);
});

test('[FX10-015] building a video again asks first: Replace swaps the earlier scenes for the new ones, Keep both adds the new ones beside them, Cancel changes nothing', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await start(page);
  await newProject(page);
  await addOwnMedia(page, HONEY_MEDIA);
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  await page.locator('#ai-import-source').fill(PLAN);
  await page.locator('[data-action="build-video"]').click();
  await settleBuild(page);
  await page.locator('.plan-build #plan-cancel').click();
  await expect(page.locator('.plan-build')).toHaveCount(0);
  const sceneIds = async () =>
    (await hook(page)).project.compositions.map((c) => c.id);
  const first = await sceneIds();
  expect(first.length).toBeGreaterThanOrEqual(3);
  const card = page
    .locator('#library-ai .shelf-item', { hasText: 'Built' })
    .first();
  const buildAgain = async (choice: string) => {
    await card.locator('.shelf-more').first().click();
    await page.getByRole('menuitem', { name: 'Build again' }).click();
    const ask = page.locator('.modal-dialog', {
      hasText: 'This video is already built',
    });
    await expect(ask).toBeVisible();
    await ask.locator(`[data-choice="${choice}"]`).click();
    return ask;
  };
  // Cancel: nothing changes and no build opens.
  await buildAgain('cancel');
  await expect(page.locator('.plan-build')).toHaveCount(0);
  expect(await sceneIds()).toEqual(first);
  // Replace: the same number of scenes, none of the earlier ids.
  await buildAgain('replace');
  await settleBuild(page);
  await page.locator('.plan-build #plan-cancel').click();
  await expect(page.locator('.plan-build')).toHaveCount(0);
  const second = await sceneIds();
  expect(second.length).toBe(first.length);
  expect(second.some((id) => first.includes(id))).toBe(false);
  // Undo of the replacing step brings the earlier scenes back; the card reads Built.
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await sceneIds()).length)
    .toBe(first.length * 2);
  await expect(card).not.toContainText('Not built');
  // Keep both: the new build is added beside what is there.
  await buildAgain('keep');
  await settleBuild(page);
  await page.locator('.plan-build #plan-cancel').click();
  await expect(page.locator('.plan-build')).toHaveCount(0);
  expect((await sceneIds()).length).toBe(first.length * 3);
});
