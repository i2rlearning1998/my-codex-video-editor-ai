import type { Page } from '@playwright/test';
import { test, expect, hook } from './fixtures';

// T-ALL P5 (spec 8, 12, 13): the Layers outliner beside the lanes. Its
// collections are organisation only: the canvas and the layers never change.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  // The Layers panel starts closed (D-187); its header button opens it.
  await page.locator('.timeline-outliner [data-ol="collapse-panel"]').click();
  await expect(page.locator('.timeline-outliner')).not.toHaveClass(/collapsed/);
});

const outliner = (page: Page) => page.locator('.timeline-outliner');
const assetRows = (page: Page) =>
  outliner(page).locator('.outliner-row[data-row-kind="asset"]');

/** A checksum of every canvas pixel. */
async function canvasSum(page: Page) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.mouse.move(2, 2);
  return page
    .locator('#composition-canvas')
    .evaluate((canvas: HTMLCanvasElement) => {
      const data = canvas
        .getContext('2d')!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 1)
        sum = (sum + data[i]! * (i % 997)) % 2147483647;
      return sum;
    });
}
async function dragRow(page: Page, from: string, to: string) {
  const a = (await page.locator(from).boundingBox())!;
  const b = (await page.locator(to).boundingBox())!;
  await page.mouse.move(a.x + 60, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 60, a.y + a.height / 2 + 10, { steps: 3 });
  await page.mouse.move(b.x + 60, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
}

test('[LYR-016] collections nest, rename and move without changing the canvas or the layers', async ({
  page,
}) => {
  await expect(assetRows(page).first()).toBeVisible();
  // Readable rows: at least 32 px tall, the panel at least 160 px wide.
  const row = (await assetRows(page).first().boundingBox())!;
  expect(row.height).toBeGreaterThanOrEqual(32);
  expect((await outliner(page).boundingBox())!.width).toBeGreaterThanOrEqual(
    160,
  );
  const before = await hook(page);
  const layers = JSON.stringify(before.project.compositions[0]!.layers);
  const tracks = JSON.stringify(before.project.compositions[0]!.tracks);
  const pixels = await canvasSum(page);

  const add = outliner(page).locator('[data-ol="new-collection"]');
  await add.click();
  await add.click();
  const collections = outliner(page).locator(
    '.outliner-row[data-row-kind="collection"]',
  );
  await expect(collections).toHaveCount(2);
  // Rename by double-click.
  await collections.first().locator('.outliner-name').dblclick();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Titles');
  await page.keyboard.press('Enter');
  await expect(collections.first()).toContainText('Titles');
  // Nest the second collection inside the first, then drag an element in.
  const firstId = await collections.first().getAttribute('data-collection-id');
  const secondId = await collections.nth(1).getAttribute('data-collection-id');
  await dragRow(
    page,
    `.outliner-row[data-collection-id="${secondId}"]`,
    `.outliner-row[data-collection-id="${firstId}"]`,
  );
  const layerId = await assetRows(page).first().getAttribute('data-layer-id');
  await dragRow(
    page,
    `.outliner-row[data-layer-id="${layerId}"]`,
    `.outliner-row[data-collection-id="${secondId}"]`,
  );
  await expect
    .poll(async () => {
      const out = (await hook(page)).project.compositions[0]!.outliner;
      return [
        out?.collections.find((c) => c.id === secondId)?.parentId,
        out?.items[layerId!],
      ];
    })
    .toEqual([firstId, secondId]);
  const after = await hook(page);
  expect(JSON.stringify(after.project.compositions[0]!.layers)).toBe(layers);
  expect(JSON.stringify(after.project.compositions[0]!.tracks)).toBe(tracks);
  expect(await canvasSum(page)).toBe(pixels);
  // Every change is undoable.
  await page.keyboard.press('Control+Z');
  await expect
    .poll(
      async () =>
        (await hook(page)).project.compositions[0]!.outliner?.items[layerId!],
    )
    .toBeUndefined();
});

test('[LYR-017] selection follows both ways; a collapsed collection and the timeline reveal it; per-element eye and lock', async ({
  page,
}) => {
  const first = assetRows(page).first();
  const layerId = (await first.getAttribute('data-layer-id'))!;
  // Outliner -> canvas and timeline.
  await first.locator('.outliner-name').click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([layerId]);
  await expect(
    page.locator(`.timeline-clip[data-id="${layerId}"]`).first(),
  ).toHaveAttribute('aria-pressed', 'true');
  // Timeline -> outliner.
  const other = assetRows(page).nth(1);
  const otherId = (await other.getAttribute('data-layer-id'))!;
  await page
    .locator(`.timeline-clip[data-action="clip"][data-id="${otherId}"]`)
    .first()
    .click();
  await expect(other).toHaveAttribute('aria-selected', 'true');
  await expect(first).toHaveAttribute('aria-selected', 'false');
  // A collapsed collection opens when its element is selected elsewhere.
  await outliner(page).locator('[data-ol="new-collection"]').click();
  const collection = outliner(page).locator(
    '.outliner-row[data-row-kind="collection"]',
  );
  const id = await collection.getAttribute('data-collection-id');
  await dragRow(
    page,
    `.outliner-row[data-layer-id="${layerId}"]`,
    `.outliner-row[data-collection-id="${id}"]`,
  );
  await collection.locator('[data-ol="disclose"]').click();
  await expect(
    outliner(page).locator(`.outliner-row[data-layer-id="${layerId}"]`),
  ).toHaveCount(0);
  await page
    .locator(`.timeline-clip[data-action="clip"][data-id="${layerId}"]`)
    .first()
    .click();
  await expect(
    outliner(page).locator(`.outliner-row[data-layer-id="${layerId}"]`),
  ).toHaveAttribute('aria-selected', 'true');
  // Reveal: zoomed in and scrolled away, selecting from the outliner scrolls
  // the timeline to the clip.
  for (let i = 0; i < 8; i++)
    await page.getByRole('button', { name: 'Timeline zoom in' }).click();
  const scroll = page.locator('#timeline-foundation .timeline-scroll');
  await scroll.evaluate(
    (element) => (element.scrollLeft = element.scrollWidth),
  );
  await outliner(page)
    .locator(`.outliner-row[data-layer-id="${otherId}"] .outliner-name`)
    .click();
  await expect
    .poll(async () => {
      const view = (await scroll.boundingBox())!;
      const clip = (await page
        .locator(`.timeline-clip[data-action="clip"][data-id="${otherId}"]`)
        .first()
        .boundingBox())!;
      return clip.x + clip.width > view.x && clip.x < view.x + view.width;
    })
    .toBe(true);
  // Per-element eye and lock act on its lane.
  const row = outliner(page).locator(
    `.outliner-row[data-layer-id="${otherId}"]`,
  );
  await row.hover();
  await row.locator('[data-ol-action="track-lock"]').click();
  const lane = await row
    .locator('[data-ol-action="track-lock"]')
    .getAttribute('data-lane');
  await expect
    .poll(
      async () =>
        (await hook(page)).project.compositions[0]!.tracks.find(
          (t) => t.id === lane,
        )?.locked,
    )
    .toBe(true);
  await outliner(page)
    .locator(`.outliner-row[data-layer-id="${otherId}"]`)
    .hover();
  await outliner(page)
    .locator(
      `.outliner-row[data-layer-id="${otherId}"] [data-ol-action="track-enable"]`,
    )
    .click();
  await expect
    .poll(
      async () =>
        (await hook(page)).project.compositions[0]!.tracks.find(
          (t) => t.id === lane,
        )?.enabled,
    )
    .toBe(false);
});
