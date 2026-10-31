import { test, expect, showCategory } from './fixtures';

// FX11: layout fixes seen in the owner's recordings.
test('[FX11-004] with the timeline dragged to its limit the canvas keeps a usable size, and long action labels stay inside their buttons', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  // Panel buttons never overflow: text and icon sit inside the button.
  for (const [category, id] of [
    ['AI', '#ai-import-library'],
    ['MyTemplates', '#mine-import-library'],
  ] as const) {
    await showCategory(page, category);
    const fits = await page
      .locator(id)
      .evaluate((button) => button.scrollWidth <= button.clientWidth + 1);
    expect(fits, `${id} content overflows`).toBe(true);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  const box = (await page.locator('.panel-resizer.height').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 900, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await page.locator('#composition-canvas').boundingBox())!.height,
    )
    .toBeGreaterThanOrEqual(200);
});
