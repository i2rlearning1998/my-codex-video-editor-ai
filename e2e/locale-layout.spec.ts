import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

// LOC-008 / LOC-010: layout tests with long accented text and a mirrored UI.
// The test modes (?pseudo, ?dir=rtl) exist only in development builds.
const ready = async (page: Page, query: string) => {
  await page.goto(`/?${query}`);
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
};

/** Buttons whose label is cut off without an ellipsis, or that overflow the page. */
const clipped = (page: Page) =>
  page.evaluate(() => {
    const bad: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1)
      bad.push('page scrolls sideways');
    for (const element of document.querySelectorAll<HTMLElement>(
      'button, [role="tab"], [role="menuitem"], label, h1, h2, h3',
    )) {
      const box = element.getBoundingClientRect();
      if (box.width <= 2 || box.height <= 2 || !element.offsetParent) continue;
      const style = getComputedStyle(element);
      const cut = element.scrollWidth > element.clientWidth + 1;
      const hidden = style.overflowX !== 'visible';
      if (cut && hidden && style.textOverflow !== 'ellipsis')
        bad.push(
          `${element.id || element.className || element.tagName}: ${(element.textContent ?? '').trim().slice(0, 30)}`,
        );
      if (box.right > window.innerWidth + 1 || box.left < -1)
        bad.push(`off screen: ${element.id || element.className}`);
    }
    return bad;
  });

test('[LOC-008] with long accented text (+40%) the layout holds: nothing is cut off or pushed off screen', async ({
  page,
}) => {
  await ready(page, 'pseudo');
  const text = await page.locator('#app').innerText();
  expect(text).toMatch(/[áéíóúñçšž]/);
  expect(await clipped(page)).toEqual([]);
  await page.screenshot({ path: 'reports/fix8-pseudo-locale.png' });
});

test('[LOC-010] in a right-to-left language the interface mirrors, while the canvas and timeline stay left to right', async ({
  page,
}) => {
  await ready(page, 'dir=rtl');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const place = (selector: string) =>
    page.locator(selector).first().boundingBox();
  const left = await place('#library-panel, .library-panel, #left-panel');
  const stage = await place('#canvas-stage');
  expect(left && stage).toBeTruthy();
  // The media library moves to the right of the canvas.
  expect(left!.x).toBeGreaterThan(stage!.x);
  const directions = await page.evaluate(() =>
    ['#canvas-stage', '#timeline-foundation'].map(
      (selector) =>
        getComputedStyle(document.querySelector(selector)!).direction,
    ),
  );
  expect(directions).toEqual(['ltr', 'ltr']);
  expect(await clipped(page)).toEqual([]);
  await page.screenshot({ path: 'reports/fix8-rtl.png' });
});

test('[LOC-010] a normal session is left to right', async ({ page }) => {
  await ready(page, '');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});
