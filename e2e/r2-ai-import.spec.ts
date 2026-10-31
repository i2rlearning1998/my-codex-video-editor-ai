import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory } from './fixtures';

// R2: one AI importer (AI › Import) for a code animation or a Creator Pack;
// AI items only in the AI category; no AI entries in the Media Import menu.
const PULSE = readFileSync('tests/fixtures/code/pulse-block.js', 'utf8');
const pack = (path: string) =>
  JSON.parse(readFileSync(path, 'utf8')) as {
    items: unknown[];
    pack: Record<string, unknown>;
  };
/** One pack with three kinds: a shape, a template and a preset. */
const MIXED = JSON.stringify({
  format: 'creator-pack',
  version: 1,
  pack: { ...pack('examples/creator-packs/shape.json').pack, id: 'mixed-pack' },
  items: [
    ...pack('examples/creator-packs/shape.json').items,
    ...pack('examples/creator-packs/template.json').items,
    ...pack('examples/creator-packs/move-preset.json').items,
  ],
});
const dialog = (page: Page) => page.locator('.ai-import-dialog');
const ai = (page: Page) => page.locator('#library-ai');

async function openImport(page: Page) {
  await showCategory(page, 'AI');
  await ai(page).locator('#ai-import').click();
  await expect(dialog(page)).toBeVisible();
}
const codeLayers = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions
    .find((c) => c.id === state.session.compositionId)!
    .layers.filter((l) => l.code);
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as { __AIVE_E2E_FREECODE__?: string }).__AIVE_E2E_FREECODE__ =
      'fake';
  });
});

test('[RA-004][RA-005] a single code animation is checked on its own, shows every controller to edit before adding, and lands in AI › Motion', async ({
  page,
}) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await openImport(page);
  // No Run checks gate: pasting is enough.
  await expect(dialog(page).locator('#creator-check')).toHaveCount(0);
  await dialog(page).locator('#ai-import-source').fill(PULSE);
  const row = dialog(page).locator('.ai-import-item');
  await expect(row).toHaveAttribute('data-status', 'ok');
  await expect(dialog(page).locator('#code-tier')).toHaveText('Tier B · Block');
  await expect(dialog(page).locator('#code-thumb')).toHaveAttribute(
    'data-ready',
    'true',
  );
  // All controllers, editable before adding.
  await expect(row.locator('.ai-import-params')).toHaveAttribute(
    'data-controls',
    '2',
  );
  await expect(row.locator('.code-param[data-param="color"]')).toBeVisible();
  const radius = dialog(page).locator('#code-param-radius');
  await radius.fill('150');
  await radius.press('Enter');
  await dialog(page).locator('#ai-import-scene').uncheck();
  const steps = (await hook(page)).history.labels.length;
  await dialog(page).locator('#ai-import-add').click();
  await expect(dialog(page)).toBeHidden();
  // Adding to My library is not an undo step and adds nothing to the scene.
  expect((await hook(page)).history.labels.length).toBe(steps);
  expect(await codeLayers(page)).toHaveLength(0);
  const card = ai(page).locator('.ai-group[data-kind="motion"] .ai-card');
  await expect(card).toHaveCount(1);
  await card.click();
  await expect.poll(async () => (await codeLayers(page)).length).toBe(1);
  expect((await codeLayers(page))[0]!.code!.params).toEqual({
    color: '#ff3366',
    radius: 150,
  });
});

test('[RA-004][RA-005] a Creator Pack is checked item by item and its items are grouped by kind in the AI category', async ({
  page,
}) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await openImport(page);
  await dialog(page).locator('#ai-import-source').fill(MIXED);
  await expect(dialog(page).locator('#ai-import-summary')).toHaveText(
    /passed the checks/,
    { timeout: 60_000 },
  );
  const rows = dialog(page).locator('.ai-import-item');
  await expect(rows).toHaveCount(3);
  for (const status of await rows.evaluateAll((items) =>
    items.map((item) => (item as HTMLElement).dataset.status),
  ))
    expect(status).toMatch(/ok|warning/);
  await dialog(page).locator('#ai-import-add').click();
  await dialog(page).locator('#creator-open-ai').click();
  for (const kind of ['shape', 'template', 'preset'])
    await expect(
      ai(page).locator(`.ai-group[data-kind="${kind}"] .ai-card`),
    ).toHaveCount(1);
  // AI items show nowhere else: Templates and Elements › Shapes.
  await showCategory(page, 'Templates');
  await expect(page.locator('#library-templates [data-creator]')).toHaveCount(
    0,
  );
  await expect(
    page.locator('#library-templates [data-section="creator"]'),
  ).toHaveCount(0);
  await showCategory(page, 'Elements');
  await page.locator('#library-elements [data-tile="shapes"]').click();
  await expect(page.locator('#library-elements [data-creator]')).toHaveCount(0);
});

test('[RA-006] the Media Import menu has only media entries', async ({
  page,
}) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await showCategory(page, 'Media');
  await page.locator('#import-menu').click();
  const menu = page.locator('.import-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('#import-media-item')).toBeVisible();
  for (const id of ['#import-code', '#import-creator', '#import-index'])
    await expect(menu.locator(id)).toHaveCount(0);
  await expect(menu).not.toContainText(/code|creator|AI/i);
});

test('[RA-007] code animations saved in Templates before move to AI › Motion; Templates lists no code animations', async ({
  page,
}) => {
  await page.addInitScript((source) => {
    if (localStorage.getItem('r2-seeded')) return;
    localStorage.setItem('r2-seeded', '1');
    localStorage.setItem(
      'aive.myTemplates',
      JSON.stringify([
        {
          kind: 'code',
          id: 'old-pulse',
          name: 'Old pulse',
          category: 'Shapes',
          createdAt: '2026-10-01T00:00:00.000Z',
          tier: 'B',
          source,
          meta: {
            id: 'pulse',
            name: 'Pulse',
            category: 'Shapes',
            duration: 2,
            params: [],
          },
          params: {},
        },
      ]),
    );
  }, PULSE);
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await showCategory(page, 'AI');
  const card = ai(page).locator('.ai-group[data-kind="motion"] .ai-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Old pulse');
  await showCategory(page, 'Templates');
  await expect(
    page.locator('#library-templates [data-section="code"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('#library-templates [data-code-template]'),
  ).toHaveCount(0);
  // The move happens once: after a reload it is still one card.
  await page.reload();
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await showCategory(page, 'AI');
  // FX10: the reloaded editor opens a new project; the animation is kept
  // once in the library and comes back by import, not as a second copy.
  await page.locator('#ai-import-library').click();
  await expect(
    page.locator('.import-dialog .import-row', { hasText: 'Old pulse' }),
  ).toHaveCount(1);
});
