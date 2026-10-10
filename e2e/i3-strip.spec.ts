import type { Page } from '@playwright/test';
import { test, expect, hook } from './fixtures';

// I3: the scene strip under the canvas.
const strip = (page: Page) => page.locator('#scene-strip');
const cards = (page: Page) => page.locator('#scene-strip .scene-strip-card');
const names = async (page: Page) =>
  (await hook(page)).project.compositions.map((scene) => scene.name);
const labels = async (page: Page) => (await hook(page)).history.labels;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[PRJ-023] [PRJ-014] the scene strip shows each scene with a thumbnail, name and length; + adds a blank or a copy; a click opens a scene', async ({
  page,
}) => {
  // The old composition select is gone; the Scenes board stays.
  await expect(page.locator('#composition')).toHaveCount(0);
  await expect(page.locator('#scene-board-toggle')).toBeVisible();
  const box = (await strip(page).boundingBox())!;
  expect(box.height).toBe(72);
  await expect(cards(page)).toHaveCount(1);
  const first = cards(page).first();
  await expect(first.locator('.scene-strip-name')).toHaveText(
    'Main composition',
  );
  await expect(first.locator('.scene-strip-duration')).toHaveText('10 s');
  await expect(first).toHaveAttribute('aria-selected', 'true');
  // The thumbnail is drawn (not one flat colour).
  await expect
    .poll(() =>
      first.locator('img').evaluate(async (image: HTMLImageElement) => {
        if (!image.complete || !image.naturalWidth) return 0;
        const canvas = new OffscreenCanvas(
          image.naturalWidth,
          image.naturalHeight,
        );
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const data = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;
        const colours = new Set<string>();
        for (let i = 0; i < data.length; i += 16)
          colours.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
        return colours.size;
      }),
    )
    .toBeGreaterThan(5);
  // + › Duplicate current, then + › Blank: each one step, the new scene opens.
  await page.locator('#scene-strip-add').click();
  await expect(page.locator('#scene-strip-menu button')).toHaveText([
    'Blank scene',
    'Duplicate current scene',
    'From template…',
  ]);
  await page.locator('[data-action="strip-add-duplicate"]').click();
  expect((await labels(page)).at(-1)).toBe('Duplicate scene');
  await page.locator('#scene-strip-add').click();
  await page.locator('[data-action="strip-add-blank"]').click();
  expect((await labels(page)).at(-1)).toBe('Add scene');
  await expect(cards(page)).toHaveCount(3);
  const state = await hook(page);
  expect(state.session.compositionId).toBe(state.project.compositions[2]!.id);
  await expect(cards(page).nth(2)).toHaveAttribute('aria-selected', 'true');
  // A click opens another scene (no history).
  const steps = (await labels(page)).length;
  await cards(page).first().click();
  expect((await hook(page)).session.compositionId).toBe(
    state.project.compositions[0]!.id,
  );
  await expect(cards(page).first()).toHaveAttribute('aria-selected', 'true');
  expect((await labels(page)).length).toBe(steps);
  // From template opens the Templates panel.
  await page.locator('#scene-strip-add').click();
  await page.locator('[data-action="strip-add-template"]').click();
  await expect(page.locator('#library-templates')).toBeVisible();
});

test('[PRJ-023] cards drag to reorder with an insertion line; double-click renames; the menu renames, duplicates, moves, saves and deletes', async ({
  page,
}) => {
  for (let i = 0; i < 2; i++) {
    await page.locator('#scene-strip-add').click();
    await page.locator('[data-action="strip-add-blank"]').click();
  }
  expect(await names(page)).toEqual(['Main composition', 'Scene 2', 'Scene 3']);
  // Double-click renames in place.
  await cards(page).nth(1).dblclick();
  const input = page.locator('.scene-strip-name-input');
  await input.fill('Intro');
  await input.press('Enter');
  expect(await names(page)).toEqual(['Main composition', 'Intro', 'Scene 3']);
  expect((await labels(page)).at(-1)).toBe('Rename scene');
  // Drag the last card before the first: the line shows, the order changes.
  const source = cards(page).nth(2),
    target = cards(page).first();
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent('dragstart', { dataTransfer: transfer });
  const box = (await target.boundingBox())!;
  await page.locator('.scene-strip-list').dispatchEvent('dragover', {
    dataTransfer: transfer,
    clientX: box.x + 4,
    clientY: box.y + box.height / 2,
  });
  await expect(page.locator('.scene-strip-insert')).toBeVisible();
  await page.locator('.scene-strip-list').dispatchEvent('drop', {
    dataTransfer: transfer,
    clientX: box.x + 4,
    clientY: box.y + box.height / 2,
  });
  expect(await names(page)).toEqual(['Scene 3', 'Main composition', 'Intro']);
  expect((await labels(page)).at(-1)).toBe('Reorder scenes');
  // Right-click menu.
  await cards(page).first().click({ button: 'right' });
  const menu = page.locator('#scene-strip-menu');
  await expect(menu.locator('button')).toHaveText([
    'Rename scene',
    'Duplicate scene',
    'Delete scene',
    'Save as template',
    'Move left',
    'Move right',
  ]);
  await expect(menu.locator('[data-action="strip-move-left"]')).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await menu.locator('[data-action="strip-move-right"]').click();
  expect(await names(page)).toEqual(['Main composition', 'Scene 3', 'Intro']);
  await cards(page).nth(1).click({ button: 'right' });
  await menu.locator('[data-action="strip-duplicate"]').click();
  expect(await names(page)).toHaveLength(4);
  await cards(page).nth(1).click({ button: 'right' });
  await menu.locator('[data-action="strip-delete"]').click();
  expect(await names(page)).toHaveLength(3);
  expect((await labels(page)).at(-1)).toBe('Delete scene');
  // Save as template from the strip (not an undo step).
  const steps = (await labels(page)).length;
  await cards(page).first().click({ button: 'right' });
  await menu.locator('[data-action="strip-save-template"]').click();
  await page.locator('#save-template-name').fill('Strip saved');
  await page.locator('[data-action="save-template-confirm"]').click();
  await expect(
    page.locator('.toast', { hasText: 'Strip saved' }),
  ).toBeVisible();
  expect((await labels(page)).length).toBe(steps);
  // Undo restores the deleted scene.
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+z');
  expect(await names(page)).toHaveLength(4);
});

test('[PRJ-023] the chevron collapses the strip; below 1024 px it is a "Scene n of m" button with a list', async ({
  page,
}) => {
  await page.locator('#scene-strip-add').click();
  await page.locator('[data-action="strip-add-blank"]').click();
  await page.locator('#scene-strip-toggle').click();
  await expect(strip(page)).toHaveClass(/collapsed/);
  await expect(page.locator('.scene-strip-list')).toBeHidden();
  expect((await strip(page).boundingBox())!.height).toBeLessThan(40);
  await page.locator('#scene-strip-toggle').click();
  await expect(page.locator('.scene-strip-list')).toBeVisible();
  // Narrow window.
  await page.setViewportSize({ width: 900, height: 900 });
  const compact = page.locator('#scene-strip-compact');
  await expect(compact).toBeVisible();
  await expect(compact).toHaveText('Scene 2 of 2');
  await expect(page.locator('.scene-strip-list')).toBeHidden();
  await compact.click();
  await page.locator('.scene-strip-popover [role="option"]').first().click();
  const state = await hook(page);
  expect(state.session.compositionId).toBe(state.project.compositions[0]!.id);
  await expect(compact).toHaveText('Scene 1 of 2');
  // Names stay readable in the light theme.
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  const colour = await cards(page)
    .first()
    .evaluate((card) => {
      const name = card.querySelector('.scene-strip-name')!;
      return [
        getComputedStyle(name).color,
        getComputedStyle(card.closest('.scene-strip')!).backgroundColor,
      ];
    });
  expect(colour[0]).not.toBe(colour[1]);
});
