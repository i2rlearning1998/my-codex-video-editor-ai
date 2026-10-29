import { existsSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { test, expect, menuAction } from './fixtures';

// DEV-012: the screenshot harness. Each test compares a stable screen with its
// saved baseline (e2e/visual.spec.ts-snapshots). A change in layout fails the
// test with a picture of the difference.
//   npm run visual           compares with the baselines
//   npm run visual:update    saves new baselines after a change you wanted
// Baselines are kept per operating system (fonts differ), so the first run on
// a new computer saves its own and then compares from the second run on.
const open = async (page: Page, query = '') => {
  await page.goto(`/${query}`);
  await expect(page.locator('#project-name')).toBeVisible();
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => document.fonts.ready);
  // Let the start-up fades finish.
  await page.waitForTimeout(1200);
  await page.mouse.move(0, 0);
};
// Things that change from run to run: the save time.
const volatile = (page: Page) => [page.locator('#save-status-text')];
/**
 * Compares with the saved baseline; on a computer that has none yet it saves
 * one (and passes), so the harness never fails just because it is new there.
 */
async function compare(
  target: Page | Locator,
  name: string,
  options: { mask: Locator[] },
) {
  const file = test.info().snapshotPath(name);
  if (!existsSync(file)) {
    await target.screenshot({ path: file, ...shot, mask: options.mask });
    test.info().annotations.push({
      type: 'baseline',
      description: `saved a new baseline: ${name}`,
    });
    return;
  }
  await expect(target).toHaveScreenshot(name, { ...shot, ...options });
}
const shot = {
  maxDiffPixelRatio: 0.001,
  animations: 'allow',
  threshold: 0.02,
  caret: 'hide',
} as const;

test('[DEV-012] the editor screen matches its baseline', async ({ page }) => {
  await open(page);
  await compare(page, 'editor.png', { mask: volatile(page) });
});

test('[DEV-012] the Projects dialog matches its baseline', async ({ page }) => {
  await open(page);
  await menuAction(page, '#open-projects');
  await expect(page.locator('.projects-dialog')).toBeVisible();
  await compare(page.locator('.projects-dialog'), 'projects-dialog.png', {
    mask: [page.locator('.projects-dialog .project-row-time')],
  });
});

test('[DEV-012] the editor with long accented text matches its baseline', async ({
  page,
}) => {
  await open(page, '?pseudo');
  await compare(page, 'editor-pseudo.png', { mask: volatile(page) });
});

test('[DEV-012] the editor mirrored for a right-to-left language matches its baseline', async ({
  page,
}) => {
  await open(page, '?dir=rtl');
  await compare(page, 'editor-rtl.png', { mask: volatile(page) });
});
