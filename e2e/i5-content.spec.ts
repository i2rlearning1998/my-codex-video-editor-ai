import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory } from './fixtures';

// I5: Starter Pack 1 additions: flowchart shapes and animated titles.
const panel = (page: Page, id: string) => page.locator(`#library-${id}`);
const scene = async (page: Page) => (await hook(page)).project.compositions[0]!;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[SHP-028] Elements › Shapes lists 14 flowchart shapes; one adds as a shape in one step', async ({
  page,
}) => {
  await showCategory(page, 'Elements');
  await panel(page, 'elements').locator('[data-tile="shapes"]').click();
  const flow = panel(page, 'elements').locator(
    '[data-section="flowchart"] .library-card',
  );
  await flow.first().scrollIntoViewIfNeeded();
  await expect(flow).toHaveCount(14);
  await expect(flow.locator('.browse-label')).toContainText([
    'Terminator',
    'Process',
    'Decision',
    'Data',
    'Document',
  ]);
  const steps = (await hook(page)).history.labels.length;
  await panel(page, 'elements')
    .locator('.library-card[data-item-id="shape-flow-decision"]')
    .click();
  expect((await hook(page)).history.labels).toHaveLength(steps + 1);
  const layer = (await scene(page)).layers.at(-1)!;
  expect(layer.type).toBe('shape');
  expect(layer.name).toBe('Decision');
});

test('[TXT-039] Text › Titles add animated titles: the entrance preset comes with the clip in one step, and the card previews it on hover', async ({
  page,
}) => {
  await showCategory(page, 'Text');
  const titles = panel(page, 'text').locator(
    '[data-section="titles"] .library-card',
  );
  await titles.first().scrollIntoViewIfNeeded();
  const pop = panel(page, 'text').locator(
    '[data-section="titles"] .library-card[data-item-id="text-title-pop"]',
  );
  await expect(pop).toBeVisible();
  // Hover plays the title's own entrance.
  await pop.hover();
  await expect(pop.locator('.browse-thumb')).toHaveClass(/title-preview/);
  await expect(pop.locator('.browse-thumb')).toHaveAttribute(
    'data-preview',
    'pop',
  );
  await pop.click();
  expect((await hook(page)).history.labels.at(-1)).toBe('Add text');
  const composition = await scene(page);
  const layer = composition.layers.at(-1)!;
  const clip = composition.tracks
    .flatMap((track) => track.clips)
    .find((item) => item.layerId === layer.id)!;
  expect((clip.metadata as { animation?: unknown }).animation).toEqual({
    in: { preset: 'pop', duration: 0.6 },
  });
  // One Undo removes the title and its animation together.
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+z');
  expect((await scene(page)).layers.some((item) => item.id === layer.id)).toBe(
    false,
  );
});
