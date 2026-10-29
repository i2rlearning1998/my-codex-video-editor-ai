import { test, expect } from './fixtures';

// FIX7: the sections of a left panel never overlap or shrink into each
// other at common widths, and the rail labels break only between words.
test('[FIX7-009] Audio and Scene panels keep their sections apart at 1366 and 1024 px', async ({
  page,
}) => {
  for (const [width, height] of [
    [1366, 768],
    [1024, 720],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect
      .poll(async () => page.evaluate(() => '__AIVE__' in window))
      .toBe(true);
    const open = async (name: string) => {
      const button = page.locator(`#rail-left [data-category="${name}"]`);
      if (await button.isVisible()) await button.click();
      else {
        await page.locator('#rail-more').click();
        await page.locator(`[data-more-category="${name}"]`).click();
      }
    };
    await open('Audio');
    const tabs = page.locator('#library-audio .shelf-tabs');
    const heading = page.locator('#library-audio .sound-pack-title').first();
    await expect(heading).toBeVisible();
    const t = (await tabs.boundingBox())!;
    const h = (await heading.boundingBox())!;
    expect(t.height).toBeGreaterThan(28);
    expect(t.y + t.height).toBeLessThanOrEqual(h.y + 1);
    await open('Scene');
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('#rail-left .icon-rail-label')]
        .filter((el) => el.offsetParent !== null)
        .map((el) => [el.textContent, el.scrollWidth <= el.clientWidth + 1]),
    );
    expect(labels.filter(([, fits]) => !fits)).toEqual([]);
  }
});
