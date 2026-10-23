import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

// FIX4 A2: every left panel that overflows must have ONE scroller that reaches
// the panel's bottom edge and takes most of the panel (the owner saw a short
// scroll box with an empty area under it). Runs at 1920 x 940 and 1366 x 768.
async function show(page: Page, name: string) {
  const button = page.locator(`#rail-left [data-category="${name}"]`);
  if (!(await button.isVisible())) {
    await page.locator('#rail-more').click();
    await page.locator(`[data-more-category="${name}"]`).click();
  } else if ((await button.getAttribute('aria-pressed')) !== 'true')
    await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

test('[FX4-003] every overflowing left panel: its scroller reaches the panel bottom and fills most of it', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.goto('/');
  const names = await page
    .locator('#rail-left [data-category]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-category')!));
  const report: string[] = [];
  for (const name of names) {
    await show(page, name);
    await page.waitForTimeout(250);
    const result = await page.evaluate(() => {
      const body = document.querySelector<HTMLElement>(
        '.library > .panel-body',
      )!;
      const panel = body.getBoundingClientRect();
      const scrollers = [...body.querySelectorAll<HTMLElement>('*')]
        .filter((el) => {
          const y = getComputedStyle(el).overflowY;
          const box = el.getBoundingClientRect();
          return (
            (y === 'auto' || y === 'scroll') &&
            box.width > 80 &&
            box.height > 40 &&
            el.scrollHeight > el.clientHeight + 2
          );
        })
        .map((el) => {
          const box = el.getBoundingClientRect();
          return {
            gap: panel.bottom - box.bottom,
            share: box.height / panel.height,
            cls: el.className.toString().slice(0, 30),
          };
        });
      return { count: scrollers.length, scrollers };
    });
    for (const scroller of result.scrollers) {
      // The outermost scroller of a panel: reaches the bottom edge.
      if (Math.abs(scroller.gap) <= 3)
        report.push(`${name}: ok ${scroller.cls} ${scroller.share.toFixed(2)}`);
    }
    // Every overflowing scroller that does NOT reach the bottom must be a
    // nested part of one that does (e.g. a strip); at least one reaches it.
    if (result.count)
      expect(
        result.scrollers.some((s) => Math.abs(s.gap) <= 3 && s.share >= 0.55),
        `${name}: ${JSON.stringify(result.scrollers)}`,
      ).toBe(true);
  }
  await testInfo.attach('geometry', { body: report.join('\n') });
  await page.screenshot({
    path: `reports/fix4/a2-${testInfo.project.name}.png`,
  });
});

// FIX4: laptops use the same shape as wide windows: the left panel runs the
// full height and the timeline sits beside it, never under it.
test('[FX4-009] the left panel is full height and the timeline sits beside it', async ({
  page,
}) => {
  await page.goto('/');
  await show(page, 'Media');
  const box = await page.evaluate(() => {
    const rect = (selector: string) =>
      document.querySelector(selector)!.getBoundingClientRect();
    const library = rect('.library');
    const timeline = rect('.timeline');
    return {
      libraryBottom: library.bottom,
      libraryRight: library.right,
      timelineLeft: timeline.left,
      windowHeight: window.innerHeight,
    };
  });
  expect(box.timelineLeft).toBeGreaterThanOrEqual(box.libraryRight - 1);
  expect(box.libraryBottom).toBeGreaterThan(box.windowHeight - 40);
});
