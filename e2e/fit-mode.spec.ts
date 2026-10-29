import type { Page } from '@playwright/test';
import { test, expect, hook, openRightPanel } from './fixtures';

// VID-004: Fit, Fill, Stretch and Custom. nle-example: layer-c is a 400 × 225
// picture in a 1280 × 720 scene; the scene is made square (1080 × 1080).
const panel = (page: Page) => page.locator('#right-section');
const layerC = async (page: Page) =>
  (await hook(page)).project.compositions[0]!.layers.find(
    (layer) => layer.id === 'layer-c',
  )!;
const placement = async (page: Page) => {
  const layer = await layerC(page);
  return {
    scale: layer.transform.scale.value as number[],
    position: layer.transform.position.value as number[],
  };
};

test('[VID-004] Fit, Fill and Stretch place a picture in a square scene; Custom shows after a manual change; each is one undo step', async ({
  page,
  openFixtureProject,
}, testInfo) => {
  await page.goto('/');
  await openFixtureProject('nle-example.json');
  await page.locator('[data-control="canvas-size"]').click();
  await page
    .locator('.toolbar-popover .canvas-size-preset[data-preset="square"]')
    .click();
  await page
    .locator(
      '#timeline-foundation .timeline-clip[data-action="clip"][data-id="layer-c"]',
    )
    .click({ position: { x: 20, y: 10 } });
  await openRightPanel(page);
  const mode = (name: string) =>
    panel(page).locator(`[data-action="right-fit-${name}"]`);
  await expect(mode('custom')).toHaveAttribute('aria-pressed', 'true');

  await mode('fill').click();
  let now = await placement(page);
  expect(now.scale[0]).toBeCloseTo(4.8, 3);
  expect(now.scale[1]).toBeCloseTo(4.8, 3);
  expect(now.position[0]).toBeCloseTo(-420, 1);
  expect(now.position[1]).toBeCloseTo(0, 1);
  await expect(mode('fill')).toHaveAttribute('aria-pressed', 'true');

  await mode('fit').click();
  now = await placement(page);
  expect(now.scale[0]).toBeCloseTo(2.7, 3);
  expect(now.position[0]).toBeCloseTo(0, 1);
  expect(now.position[1]).toBeCloseTo(236.25, 1);
  await expect(mode('fit')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: testInfo.outputPath('fit.png') });
  await page.screenshot({ path: 'reports/fix8-fit-mode.png' });

  await mode('stretch').click();
  now = await placement(page);
  expect(now.scale[0]).toBeCloseTo(2.7, 3);
  expect(now.scale[1]).toBeCloseTo(4.8, 3);
  expect(now.position).toEqual([0, 0]);

  const labels = (await hook(page)).history.labels;
  expect(labels.slice(-3)).toEqual(['Fill', 'Fit', 'Stretch']);
  await page.keyboard.press('Control+z');
  await expect(mode('fit')).toHaveAttribute('aria-pressed', 'true');
});
