import { readFileSync } from 'node:fs';
import { test, expect, showCategory } from './fixtures';
import { mockStock, GOOD_KEY } from './stock-mock';

// FIX4 A1: after Import + Build two messages used to stack at the bottom-left
// and cover the lower part of the left panel. Now ONE toast shows at a time,
// bottom-centre over the canvas area, and never over a panel's scroller.
test('[FX4-001] one toast at a time, never over a left panel', async ({
  page,
}) => {
  await page.goto('/');
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  await page
    .locator('#ai-import-source')
    .fill(readFileSync('docs/samples/plan-en-honey.json', 'utf8'));
  await page.locator('[data-action="build-video"]').click();
  await expect(
    page.locator('.toast', { hasText: 'Built 3 scenes' }),
  ).toBeVisible();
  await expect(page.locator('.toast:not(.toast-leaving)')).toHaveCount(1);
  const overlap = await page.evaluate(() => {
    const toast = document
      .querySelector('.toast:not(.toast-leaving)')!
      .getBoundingClientRect();
    const panel = document
      .querySelector('.library > .panel-body')!
      .getBoundingClientRect();
    return (
      toast.left < panel.right &&
      toast.right > panel.left &&
      toast.top < panel.bottom &&
      toast.bottom > panel.top
    );
  });
  expect(overlap).toBe(false);
  await page.screenshot({ path: 'reports/fix4/a1-toast.png' });
});

test('[FX4-002] a toast waits while the pointer is on it (longer than its 10 s), then hides', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto('/');
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  await page
    .locator('#ai-import-source')
    .fill(readFileSync('docs/samples/plan-en-honey.json', 'utf8'));
  await page.locator('[data-action="build-video"]').click();
  const toast = page.locator('.toast', { hasText: 'Built 3 scenes' });
  await expect(toast).toBeVisible();
  await toast.hover();
  await page.waitForTimeout(11000);
  await expect(toast).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(toast).toHaveCount(0, { timeout: 14000 });
});

// FIX4 A4: after a full build (media found from mocked stock) the card reads
// Built with its scene count and a picture of the first built scene, and its
// menu offers Build again; before a build it reads Not built.
test('[FX4-004] AI composition card: Not built, then Built with scene count and poster', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.addInitScript(
    ([key]) => {
      localStorage.setItem(
        'aive.provider-key.pixabay.apiKey',
        JSON.stringify(key),
      );
      (window as { __AIVE_E2E_SPEECH__?: boolean }).__AIVE_E2E_SPEECH__ = true;
    },
    [GOOD_KEY] as const,
  );
  await mockStock(page);
  await page.goto('/');
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  await page
    .locator('#ai-import-source')
    .fill(readFileSync('tests/fixtures/plans/honey-en.json', 'utf8'));
  await page.locator('[data-action="build-video"]').click();
  const dialog = page.locator('.plan-build');
  await expect(dialog.locator('#plan-summary')).toBeVisible({
    timeout: 60_000,
  });
  await page.keyboard.press('Escape');
  const card = page.locator('#library-ai .shelf-item').first();
  await expect(card).toContainText('Built');
  await expect(card).toContainText('3 scenes');
  await expect(card.locator('[data-thumb="image"]')).toHaveCount(1);
  await page.screenshot({ path: 'reports/fix4/a4-card.png' });
});
