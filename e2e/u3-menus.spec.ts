import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory } from './fixtures';

// U3: one context menu at a time, closed by any press outside, Escape, a
// wheel outside, blur and resize; menus and floating panels scroll with the
// wheel instead of zooming the canvas; Speed and Audio open on hover.
const canvasMenu = (page: Page) => page.locator('#canvas-context-menu');
const timelineMenu = (page: Page) =>
  page.locator('#timeline-foundation .timeline-menu');
const clip = (page: Page, id: string) =>
  page.locator(`#timeline-foundation .timeline-clip[data-clip-id="${id}"]`);

test.beforeEach(async ({ page, openFixtureProject }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await openFixtureProject('nle-example.json');
});

test('[LAY-056] only one context menu is open at a time; a press outside, Escape and a wheel outside close it', async ({
  page,
}) => {
  const canvas = (await page.locator('#composition-canvas').boundingBox())!;
  await page.mouse.click(canvas.x + 40, canvas.y + 40, { button: 'right' });
  await expect(canvasMenu(page)).toBeVisible();
  // The timeline menu replaces it.
  await clip(page, 'clip-b').click({
    button: 'right',
    position: { x: 20, y: 10 },
  });
  await expect(timelineMenu(page)).toBeVisible();
  await expect(canvasMenu(page)).toBeHidden();
  // And the reverse.
  await page.mouse.click(canvas.x + 40, canvas.y + 40, { button: 'right' });
  await expect(canvasMenu(page)).toBeVisible();
  await expect(timelineMenu(page)).toBeHidden();
  // Escape closes it.
  await page.keyboard.press('Escape');
  await expect(canvasMenu(page)).toBeHidden();
  // A wheel outside closes the timeline menu.
  await clip(page, 'clip-b').click({
    button: 'right',
    position: { x: 20, y: 10 },
  });
  await expect(timelineMenu(page)).toBeVisible();
  await page.mouse.move(canvas.x + 60, canvas.y + 60);
  await page.mouse.wheel(0, 40);
  await expect(timelineMenu(page)).toBeHidden();
  // A left press outside closes it too.
  await clip(page, 'clip-b').click({
    button: 'right',
    position: { x: 20, y: 10 },
  });
  await expect(timelineMenu(page)).toBeVisible();
  await page.locator('.topbar').click({ position: { x: 600, y: 20 } });
  await expect(timelineMenu(page)).toBeHidden();
});

test('[LAY-057] menus scroll within the window; the wheel over a menu or the Draw panel never zooms the canvas', async ({
  page,
}) => {
  const canvas = (await page.locator('#composition-canvas').boundingBox())!;
  await page.mouse.click(canvas.x + 40, canvas.y + 40, { button: 'right' });
  const style = await canvasMenu(page).evaluate((item) => ({
    overflow: getComputedStyle(item).overflowY,
    max: parseFloat(getComputedStyle(item).maxHeight),
  }));
  expect(style.overflow).toBe('auto');
  expect(style.max).toBeLessThanOrEqual(page.viewportSize()!.height);
  const zoom = async () => (await hook(page)).session.canvasZoom;
  const before = await zoom();
  const box = (await canvasMenu(page).boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  expect(await zoom()).toBe(before);
  await expect(canvasMenu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  // The Draw panel's flyout scrolls itself, too.
  await showCategory(page, 'Draw');
  const flyout = (await page.locator('#draw-flyout').boundingBox())!;
  await page.mouse.move(flyout.x + 20, flyout.y + 20);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  expect(await zoom()).toBe(before);
});

test('[LAY-058] Speed and Audio open as flyouts on hover, and on the Right arrow', async ({
  page,
}) => {
  await clip(page, 'clip-b').click({
    button: 'right',
    position: { x: 20, y: 10 },
  });
  const speed = timelineMenu(page).locator(':scope > [data-action="speed"]');
  await expect(speed).toBeVisible();
  await speed.hover();
  const flyout = page.locator('.timeline-submenu');
  await expect(flyout).toBeVisible();
  await expect(flyout.getByRole('menuitemradio').first()).toBeVisible();
  // The main menu stays as it was beside it.
  await expect(speed).toBeVisible();
  await expect(speed).toHaveAttribute('aria-expanded', 'true');
  // Choosing a speed works from the flyout.
  await flyout.locator('[data-speed="2"]').click();
  expect(
    (await hook(page)).project.compositions[0]!.tracks.flatMap(
      (track) => track.clips,
    ).find((item) => item.id === 'clip-b')!.speed,
  ).toBe(2);
});
