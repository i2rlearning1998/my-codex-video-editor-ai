import { test, expect, hook } from './fixtures';

// T-ALL P3 (spec 4-6): paging while playing zoomed in, centred lanes, a
// preview that never collapses.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[TL-091] playing zoomed in pages the view so the playhead never leaves it', async ({
  page,
}) => {
  for (let i = 0; i < 8; i++)
    await page.getByRole('button', { name: 'Timeline zoom in' }).click();
  await expect
    .poll(async () => (await hook(page)).session.timelinePxPerSecond)
    .toBeGreaterThan(300);
  const scroll = page.locator('#timeline-foundation .timeline-scroll');
  // First frame returns the view to the first page.
  await page
    .locator('#timeline-foundation [data-action="first-frame"]')
    .click();
  expect(await scroll.evaluate((element) => element.scrollLeft)).toBe(0);
  await page.locator('#timeline-foundation [data-action="play"]').click();
  await expect
    .poll(() => scroll.evaluate((element) => element.scrollLeft), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  // While playing, the playhead stays inside the visible lanes.
  for (let i = 0; i < 5; i++) {
    const view = (await scroll.boundingBox())!;
    const head = (await page
      .locator('#timeline-foundation .timeline-playhead')
      .boundingBox())!;
    expect(head.x).toBeGreaterThanOrEqual(view.x - 8);
    expect(head.x).toBeLessThanOrEqual(view.x + view.width);
    await page.waitForTimeout(150);
  }
  await page.locator('#timeline-foundation [data-action="play"]').click();
});

test('[TL-092] lanes sit vertically centred when the panel is taller; the preview keeps a minimum height', async ({
  page,
}) => {
  const ruler = (await page.locator('.timeline-ruler-bar').boundingBox())!;
  const scroll = (await page
    .locator('#timeline-foundation .timeline-scroll')
    .boundingBox())!;
  const lanes = page.locator('#timeline-foundation .timeline-nle-row');
  const top = (await lanes.first().boundingBox())!;
  const bottom = (await lanes.last().boundingBox())!;
  const above = top.y - (ruler.y + ruler.height);
  const below = scroll.y + scroll.height - (bottom.y + bottom.height);
  if (above > 1) expect(Math.abs(above - below)).toBeLessThan(3);
  else expect(below).toBeLessThanOrEqual(1);
  // Dragging the Player bar up as far as it goes keeps the preview usable.
  const grip = (await page
    .locator('#timeline-foundation .timeline-controls')
    .boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2 + 200, grip.y + 4);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 200, 10, { steps: 6 });
  await page.mouse.up();
  const stage = (await page.locator('#canvas-stage').boundingBox())!;
  expect(stage.height).toBeGreaterThanOrEqual(200);
});
