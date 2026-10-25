import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  openRight,
  showCategory,
  toScreen,
} from './fixtures';

// FINAL2 U6: the font picker (catalog fonts mocked: no live network),
// direction and lists in the right panel, and tables.
test.use({ viewport: { width: 1920, height: 1080 } });

const FONT_BYTES = readFileSync(
  'public/fonts/noto-sans-devanagari/noto-sans-devanagari-devanagari-400-normal.woff2',
);
async function mockGoogleFonts(page: Page) {
  const cors = { 'access-control-allow-origin': '*' };
  await page.route('https://fonts.googleapis.com/css2**', (route) =>
    route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'text/css' },
      body: `@font-face { font-family: 'Hind'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/s/hind/test.woff2) format('woff2'); unicode-range: U+0900-097F, U+200C-200D, U+25CC; }`,
    }),
  );
  await page.route('https://fonts.gstatic.com/**', (route) =>
    route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'font/woff2' },
      body: FONT_BYTES,
    }),
  );
}
const selectedLayer = async (page: Page) => {
  const state = await hook(page);
  const scene = state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
  return scene.layers.find(
    (item) => item.id === state.session.selectedIds[0],
  )! as unknown as {
    id: string;
    transform: { position: { value: [number, number] } };
    properties: Record<string, { value: unknown } | undefined>;
  };
};
const engineOf = async (page: Page) =>
  JSON.parse(
    String((await selectedLayer(page)).properties.textEngine?.value ?? '{}') ||
      '{}',
  ) as {
    direction?: string;
    list?: { kind: string; levels?: number[] };
    table?: { rows: { text: string }[][]; header?: boolean };
  };

test('[F2-030] [F2-031][TXT-007] Font picker: Hindi filter, coverage check, offline and downloaded fonts, recently used; direction RTL and a numbered list', async ({
  page,
  context,
}) => {
  await mockGoogleFonts(page);
  await page.goto('/');
  await showCategory(page, 'Text');
  await page.locator('#add-text-box').click();
  await page.keyboard.insertText('नमस्ते दुनिया\nदूसरी पंक्ति');
  await page.keyboard.press('Escape');
  await page.locator('#toolbar-font').click();
  const panel = page.locator('[data-tool-panel="font"]');
  await expect(panel.locator('#font-search')).toBeVisible();
  // Inter has no Devanagari letters: the engine's coverage check says so.
  await panel.locator('[data-font="Inter"]').click();
  await expect(panel.locator('.font-coverage')).toHaveAttribute(
    'data-state',
    'missing',
  );
  // The Hindi filter lists only fonts with Devanagari.
  await panel.locator('[data-font-chip="devanagari"]').click();
  await expect(panel.locator('[data-font="Inter"]')).toHaveCount(0);
  await expect(panel.locator('[data-font="Hind"]')).toBeVisible();
  await panel.locator('[data-font="Noto Sans Devanagari"]').click();
  await expect(panel.locator('.font-coverage')).toHaveAttribute(
    'data-state',
    'ok',
  );
  // Offline, a font not yet saved on this device says so and keeps the font.
  await context.setOffline(true);
  await expect(panel.locator('.font-offline')).toBeVisible();
  await panel.locator('[data-font="Hind"]').click();
  await expect(
    panel.locator('[data-font="Hind"] .font-state[data-state="error"]'),
  ).toContainText('offline');
  expect((await selectedLayer(page)).properties.fontFamily?.value).toBe(
    'Noto Sans Devanagari',
  );
  // Online again: the font downloads, applies and covers the text.
  await context.setOffline(false);
  await panel.locator('[data-font="Hind"]').click();
  await expect
    .poll(async () => (await selectedLayer(page)).properties.fontFamily?.value)
    .toBe('Hind');
  await expect(panel.locator('.font-coverage')).toHaveAttribute(
    'data-state',
    'ok',
  );
  // Recently used (this browser) leads the list once the filter is off.
  await panel.locator('[data-font-chip="devanagari"]').click();
  await expect(
    panel.locator('[data-font-section="recent"] .font-option'),
  ).toHaveText([/Hind/, /Noto Sans Devanagari/, /Inter/]);
  await page.screenshot({ path: 'reports/final-ui/u6-fonts.png' });

  // Right panel: direction and a numbered list, one step each.
  await openRight(page, 'Properties');
  await page.locator('#right-text-direction [data-value="rtl"]').click();
  await expect.poll(async () => (await engineOf(page)).direction).toBe('rtl');
  await expect(page.locator('.text-structure-hint')).toHaveAttribute(
    'data-direction',
    'rtl',
  );
  await page.locator('#right-list-kind [data-value="numbered"]').click();
  await expect
    .poll(async () => (await engineOf(page)).list?.kind)
    .toBe('numbered');
  await page
    .locator('.text-list-levels li[data-line="1"] [data-action="indent"]')
    .click();
  await expect
    .poll(async () => (await engineOf(page)).list?.levels)
    .toEqual([1, 2]);
  expect((await hook(page)).history.labels.slice(-3)).toEqual([
    'Text direction',
    'List',
    'List level',
  ]);
});

test('[F2-032] [F2-033][SHP-025] Elements › Tables: pick 3 × 4, one undo step; edit a cell on the canvas and in the inspector; rows and header row', async ({
  page,
}) => {
  await page.goto('/');
  await showCategory(page, 'Elements');
  await page.locator('#library-elements [data-tile="tables"]').click();
  await page
    .locator('.table-picker-grid button[data-rows="3"][data-columns="4"]')
    .click();
  await expect
    .poll(async () => (await engineOf(page)).table?.rows.length)
    .toBe(3);
  let table = (await engineOf(page)).table!;
  expect(table.rows[0]).toHaveLength(4);
  expect((await hook(page)).history.labels.at(-1)).toBe('Insert table');
  // Double-click the second row's second cell and type in place.
  const layer = await selectedLayer(page);
  const [x, y] = layer.transform.position.value;
  const width = Number(layer.properties.width!.value);
  const row = 28 * 1.2 + 16;
  const point = await toScreen(page, x + width * 0.375, y + row * 1.5);
  await page.mouse.dblclick(point.x, point.y);
  const cell = page.locator('.table-cell-editor');
  await expect(cell).toBeVisible();
  await page.keyboard.insertText('हिंदी');
  await page.keyboard.press('Tab');
  await page.keyboard.insertText('42');
  await page.keyboard.press('Enter');
  await expect(cell).toBeHidden();
  table = (await engineOf(page)).table!;
  expect(table.rows[1]!.map((item) => item.text)).toEqual([
    '',
    'हिंदी',
    '42',
    '',
  ]);
  // The inspector edits the same table.
  await openRight(page, 'Properties');
  const input = page.locator('.text-table-cell-input[data-cell="2-0"]');
  await input.fill('Total');
  await input.press('Enter');
  const rows = page.locator('#right-table-rows');
  await rows.fill('4');
  await rows.press('Enter');
  await page.locator('#right-table-header').click();
  await expect
    .poll(async () => (await engineOf(page)).table?.header)
    .toBe(false);
  table = (await engineOf(page)).table!;
  expect(table.rows).toHaveLength(4);
  expect(table.rows[2]![0]!.text).toBe('Total');
  // Every edit was one clean step (no error toast).
  await expect(page.getByText('Reentrant')).toHaveCount(0);
  await page.screenshot({ path: 'reports/final-ui/u6-table.png' });
  // Escape in a cell cancels.
  await page.mouse.dblclick(point.x, point.y);
  await page.keyboard.insertText('nope');
  await page.keyboard.press('Escape');
  await expect(cell).toBeHidden();
  expect((await engineOf(page)).table!.rows[1]![1]!.text).toBe('हिंदी');
});
