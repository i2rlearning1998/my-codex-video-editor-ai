import { test, expect, hook, showCategory } from './fixtures';

// FIX7: tables are born inside the canvas, their box covers every row and
// the toolbar has row and column buttons.

const selected = async (page: import('@playwright/test').Page) => {
  const state = await hook(page);
  const scene = state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
  return scene.layers.find(
    (item) => item.id === state.session.selectedIds[0],
  )! as unknown as {
    properties: Record<string, { value: unknown } | undefined>;
  };
};
const rowsOf = async (page: import('@playwright/test').Page) => {
  const layer = await selected(page);
  const engine = JSON.parse(String(layer.properties.textEngine?.value ?? '{}'));
  return {
    rows: engine.table.rows.length as number,
    columns: engine.table.columnWidths.length as number,
  };
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[FIX7-008] an 8 × 8 table fits the canvas with type that fits its columns, and the toolbar adds and removes rows and columns', async ({
  page,
}) => {
  await showCategory(page, 'Elements');
  await page.locator('#library-elements [data-tile="tables"]').click();
  await page
    .locator('.table-picker-grid button[data-rows="8"][data-columns="8"]')
    .click();
  await expect.poll(async () => (await rowsOf(page)).rows).toBe(8);
  const layer = await selected(page);
  // Narrow columns get smaller type so "Column 8" never wraps.
  expect(Number(layer.properties.fontSize!.value)).toBeLessThan(28);
  expect(Number(layer.properties.width!.value)).toBeLessThanOrEqual(1280);
  const bar = page.locator('#context-toolbar');
  await bar.locator('[data-control="table-row-add"]').click();
  await expect.poll(async () => (await rowsOf(page)).rows).toBe(9);
  await bar.locator('[data-control="table-column-remove"]').click();
  await expect.poll(async () => (await rowsOf(page)).columns).toBe(7);
  await bar.locator('[data-control="table-row-remove"]').click();
  await bar.locator('[data-control="table-column-add"]').click();
  expect(await rowsOf(page)).toEqual({ rows: 8, columns: 8 });
});
