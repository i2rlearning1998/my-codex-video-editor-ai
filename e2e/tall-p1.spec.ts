import type { Page } from '@playwright/test';
import { test, expect, hook, menuAction } from './fixtures';

// T-ALL P1 (spec 7): first load, panels and layout.
const box = async (page: Page, selector: string) =>
  (await page.locator(selector).boundingBox())!;

test('[LAY-060] the first load opens Media with an illustrated empty state; a new project canvas is white', async ({
  browser,
}) => {
  // A context without the e2e fixture's start category.
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1072 },
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await expect(
    page.locator('#rail-left [data-category="Media"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.locator('#media-state [data-media-illustration]'),
  ).toBeVisible();
  await menuAction(page, '#new-project');
  await page.locator('#new-project-form button[type="submit"]').click();
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  await expect(page.locator('#new-project-form')).toBeHidden();
  const state = await hook(page);
  expect(state.project.compositions[0]!.backgroundColor).toBe('#ffffff');
  await context.close();
});

test('[LAY-061] no panel toggles in the top bar; the right panel opens from its rail; collapse buttons sit in the panels', async ({
  page,
}) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await expect(page.locator('.topbar [data-panel]')).toHaveCount(0);
  await expect(page.locator('.library [data-panel="left"]')).toBeVisible();
  await expect(page.locator('.inspector #right-panel-collapse')).toBeHidden();
  const shell = page.locator('.editor-shell');
  const canvas = await box(page, '#composition-canvas');
  await expect(page.locator('.inspector')).toBeHidden();
  // V7 (spec 10.1): a selection leaves the panel closed; the rail opens it.
  await page.locator('#scene-list [data-layer-id="example-headline"]').click();
  await expect(page.locator('.inspector')).toBeHidden();
  await page.locator('#rail-right [data-section="Properties"]').click();
  await expect(page.locator('.inspector')).toBeVisible();
  await expect(page.locator('#right-panel-collapse')).toBeVisible();
  // The canvas does not move when the panel appears.
  expect(await box(page, '#composition-canvas')).toEqual(canvas);
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.inspector')).toBeHidden();
  // Collapsed from its header, it stays closed on the next selection.
  await page.locator('#scene-list [data-layer-id="example-headline"]').click();
  await page.locator('#rail-right [data-section="Properties"]').click();
  await page.locator('#right-panel-collapse').click();
  await expect(shell).toHaveClass(/inspector-collapsed/);
  await page.locator('#scene-list [data-layer-id="example-subtitle"]').click();
  await expect(shell).toHaveClass(/inspector-collapsed/);
  // The left panel collapses from its own header and reopens from the rail.
  await page.locator('.library [data-panel="left"]').click();
  await expect(shell).toHaveClass(/library-collapsed/);
  await page.locator('#rail-left [data-category="Scene"]').click();
  await expect(shell).not.toHaveClass(/library-collapsed/);
});

test('[LAY-062] the left rail and panel run the full height; the timeline sits beside the panel', async ({
  page,
}) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  const rail = await box(page, '#rail-left');
  const library = await box(page, '.library');
  const timeline = await box(page, '.timeline');
  const viewport = page.viewportSize()!;
  // V1 (D-190): cards sit 8 px inside the window edge.
  expect(rail.y + rail.height).toBeGreaterThan(viewport.height - 10);
  expect(library.y + library.height).toBeGreaterThan(viewport.height - 10);
  expect(timeline.x).toBeGreaterThanOrEqual(library.x + library.width - 1);
});
