import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, showCategory, hook, menuAction } from './fixtures';

// FIX1 F7: the AI import dialog colours by severity, Build video keeps the
// ticked style and the composition in the AI library, shows the new scenes
// with a readable note, and replaces a single empty default scene.
const PACK = readFileSync(
  'examples/creator-packs/composition-documentary-mini.json',
  'utf8',
);
async function openImport(page: Page) {
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  await page.locator('#ai-import-source').fill(PACK);
  await expect(page.locator('[data-action="build-video"]')).toBeVisible();
}

test('[FX1-015] the import dialog shows OK green, warnings amber in plain words and information neutral (never red)', async ({
  page,
}) => {
  await page.goto('/');
  await openImport(page);
  const dialog = page.locator('.ai-import-dialog');
  const style = dialog.locator('.creator-item[data-status="warning"]');
  const composition = dialog.locator('.creator-item[data-type="composition"]');
  const color = (locator: ReturnType<Page['locator']>) =>
    locator.evaluate((el) => getComputedStyle(el).color);
  const danger = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--danger-text')
      .trim(),
  );
  const rgb = await page.evaluate((value) => {
    const probe = document.createElement('span');
    probe.style.color = value;
    document.body.append(probe);
    const out = getComputedStyle(probe).color;
    probe.remove();
    return out;
  }, danger);
  expect(await color(composition.locator('.creator-reasons'))).not.toBe(rgb);
  expect(await color(style.locator('.creator-reasons'))).not.toBe(rgb);
  await expect(style.locator('.creator-reasons')).toContainText(
    'that this editor does not have yet; it will be skipped',
  );
  await expect(style.locator('.creator-reasons')).not.toContainText('kit.');
  // The composition row uses the whole width (no empty thumbnail column).
  const name = (await composition.locator('strong').boundingBox())!;
  expect(name.height).toBeLessThan(30);
  await page.screenshot({ path: 'reports/fix1/f7-import.png' });
});

test('[FX1-016] Build video keeps the style and the composition in the AI panel, replaces a lone empty scene, opens the scene strip and says "Added 3 scenes" with Show scenes', async ({
  page,
}) => {
  await page.goto('/');
  // Start from a new, empty project (one empty default scene).
  await menuAction(page, '#new-project');
  await page.locator('#new-project-form button[type="submit"]').click();
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  await expect(page.locator('#new-project-form')).toBeHidden();
  await expect
    .poll(async () => {
      const { project } = await hook(page);
      return (
        project.compositions.length === 1 &&
        !project.compositions[0]!.layers.length
      );
    })
    .toBe(true);
  await openImport(page);
  await page.locator('[data-action="build-video"]').click();
  const dialog = page.locator('.composition-dialog');
  await expect(dialog.locator('.composition-slot')).not.toHaveCount(0);
  await dialog
    .locator('.composition-slot[data-slot="archive"] input[type="file"]')
    .setInputFiles(
      path.resolve('tests/fixtures/media/image_testsrc_1200x800.jpg'),
    );
  await dialog.locator('#composition-add').click();
  const toast = page.locator('.toast', { hasText: 'Added 3 scenes' });
  await expect(toast).toBeVisible();
  await expect(
    toast.getByRole('button', { name: 'Show scenes' }),
  ).toBeVisible();
  const { project } = await hook(page);
  expect(project.compositions.map((c) => c.name)).toEqual([
    'Cold open',
    'Chapter 1',
    'Close',
  ]);
  await expect(page.locator('#scene-strip-show')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.screenshot({ path: 'reports/fix1/f7-built.png' });
  await showCategory(page, 'AI');
  await expect(page.locator('#library-ai .shelf-item')).toHaveCount(2);
  await expect(page.locator('#library-ai .shelf-state')).toBeHidden();
});
