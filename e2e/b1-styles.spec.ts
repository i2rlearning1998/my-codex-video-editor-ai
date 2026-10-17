import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory } from './fixtures';
import { importPack } from './creator-helpers';

// B1: styles (a creative direction for the AI creator) in the AI category.
const read = (name: string) =>
  readFileSync(`examples/creator-packs/${name}`, 'utf8');
const ai = (page: Page) => page.locator('#library-ai');
const styleCard = (page: Page) =>
  ai(page).locator(
    '.shelf-item[data-item-id="style-pack-documentary--style-documentary"]',
  );
const layerCount = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (c) => c.id === state.session.compositionId,
  )!.layers.length;
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[B1-001] a style pack imports into AI › Styles as a card with its palette, icon and name; it is never placed; its "⋯" has Rename, Duplicate, Export, Move to folder, Details and Delete; Export imports again', async ({
  page,
}) => {
  await importPack(page, read('style-documentary.json'));
  await page.evaluate(() =>
    document.querySelectorAll('.toast').forEach((toast) => toast.remove()),
  );
  await showCategory(page, 'AI');
  await expect(ai(page).locator('.shelf-tab[data-tab="style"]')).toHaveText(
    'Styles',
  );
  const card = styleCard(page);
  await expect(card).toContainText('Calm documentary');
  await expect(card.locator('.shelf-thumb img')).toHaveAttribute(
    'src',
    /^data:image\/svg\+xml;base64,/,
  );
  // "+" uses the style; neither it nor a click adds anything to the scene.
  const before = await layerCount(page);
  await card.hover();
  await expect(card.locator('.shelf-plus')).toHaveAttribute(
    'title',
    'Use this style',
  );
  await card.locator('.shelf-card').click();
  expect(await layerCount(page)).toBe(before);
  await page.keyboard.press('Escape');
  // The menu.
  await card.hover();
  await card.locator('.shelf-more').click();
  const menu = page.locator('#ai-menu');
  for (const action of [
    'ai-rename',
    'ai-add',
    'ai-duplicate',
    'ai-export',
    'ai-folder',
    'ai-details',
    'ai-delete',
  ])
    await expect(menu.locator(`[data-action="${action}"]`)).toBeVisible();
  await expect(menu.locator('[data-action="ai-add"]')).toHaveText(
    /Use this style/,
  );
  await menu.locator('[data-action="ai-duplicate"]').click();
  await expect(
    ai(page).locator('.shelf-item', { hasText: 'Calm documentary copy' }),
  ).toHaveCount(1);
  // Export: a one-item Creator Pack that AI › Import accepts again.
  await card.hover();
  await card.locator('.shelf-more').click();
  const download = page.waitForEvent('download');
  await menu.locator('[data-action="ai-export"]').click();
  const file = await (await download).path();
  const pack = JSON.parse(readFileSync(file, 'utf8')) as {
    items: { type: string }[];
  };
  expect(pack.items[0]!.type).toBe('style');
  await ai(page).locator('#ai-import').click();
  await page.locator('#ai-import-file').setInputFiles(file);
  await expect(page.locator('#ai-import-summary')).toHaveText(
    /passed the checks/,
    { timeout: 60_000 },
  );
});

test('[B1-001] a style whose kit names an unknown preset is rejected with the reason', async ({
  page,
}) => {
  await showCategory(page, 'AI');
  await ai(page).locator('#ai-import').click();
  await page.locator('#ai-import-source').fill(read('bad-style-kit.json'));
  const row = page.locator('.ai-import-item');
  await expect(row).toHaveAttribute('data-status', 'rejected', {
    timeout: 60_000,
  });
  await expect(row).toContainText('Unknown kit preset boing-boing');
});

test('[B1-002] New AI video: pick a style, fill the topic and the script with "use exactly", Copy brief puts them under LOCKED and the rest under FREE', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await importPack(page, read('style-documentary.json'));
  await page.evaluate(() =>
    document.querySelectorAll('.toast').forEach((toast) => toast.remove()),
  );
  await showCategory(page, 'AI');
  await ai(page).locator('#ai-new-video').click();
  const dialog = page.locator('.new-video-dialog');
  await expect(dialog).toBeVisible();
  await dialog
    .locator(
      '.brief-style[data-style-id="style-pack-documentary--style-documentary"]',
    )
    .click();
  await dialog.locator('#brief-topic').fill('How bees make honey');
  await dialog.locator('#brief-script-on').check();
  await dialog.locator('#brief-script').fill('Bees fly. Bees dance.');
  await dialog
    .locator('[data-name="script-mode"] [data-value="exact"]')
    .click();
  await dialog.locator('#brief-logo').fill('logo.png');
  await expect(dialog.locator('#brief-files')).toHaveText(
    'Attach these files in the Claude chat: logo.png (logo).',
  );
  await dialog.locator('#brief-form-copy').click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('=== BRIEF ===');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(
    text.startsWith('You are the creator for the AI-Native Video Editor.'),
  ).toBe(true);
  const locked = text.slice(
    text.indexOf('LOCKED'),
    text.indexOf('FREE (you decide)'),
  );
  expect(locked).toContain('Topic / title: How bees make honey');
  expect(locked).toContain(
    'Script (use exactly, word for word):\nBees fly. Bees dance.',
  );
  expect(locked).toContain('Style: Calm documentary');
  const free = text.slice(
    text.indexOf('FREE (you decide)'),
    text.indexOf('=== END BRIEF ==='),
  );
  expect(free).toContain('Language');
  expect(free).not.toContain('Topic');
  expect(free).not.toContain('Script');
  expect(text).toContain('=== STYLE ===');
});

test('[B1-003] Save as My brief: the brief appears in AI › Briefs and its "+" reopens the form prefilled; "Use this style" opens the form with the style chosen', async ({
  page,
}) => {
  await importPack(page, read('style-documentary.json'));
  await page.evaluate(() =>
    document.querySelectorAll('.toast').forEach((toast) => toast.remove()),
  );
  await showCategory(page, 'AI');
  // "Use this style" preselects the style.
  const card = styleCard(page);
  await card.hover();
  await card.locator('.shelf-plus').click();
  const dialog = page.locator('.new-video-dialog');
  await expect(
    dialog.locator('.brief-style[aria-checked="true"]'),
  ).toHaveAttribute(
    'data-style-id',
    'style-pack-documentary--style-documentary',
  );
  await dialog.locator('#brief-topic').fill('Bees');
  await dialog.locator('#brief-script-on').check();
  await dialog.locator('#brief-script').fill('Bees fly.');
  await dialog.locator('#brief-form-save').click();
  const prompt = page
    .locator('.modal-dialog')
    .filter({ has: page.locator('.modal-input') });
  await expect(prompt.locator('.modal-input')).toHaveValue('Bees');
  await prompt.locator('.modal-input').fill('Bee video');
  await prompt.locator('[data-role="confirm"]').click();
  await expect(page.locator('.toast').last()).toContainText('Bee video');
  await dialog.locator('.modal-close').click();
  await expect(dialog).toHaveCount(0);
  await ai(page).locator('.shelf-tab[data-tab="brief"]').click();
  const brief = ai(page).locator('.shelf-item', { hasText: 'Bee video' });
  await expect(brief).toHaveCount(1);
  await brief.hover();
  await brief.locator('.shelf-plus').click();
  await expect(dialog.locator('#brief-topic')).toHaveValue('Bees');
  await expect(dialog.locator('#brief-script-on')).toBeChecked();
  await expect(dialog.locator('#brief-script')).toHaveValue('Bees fly.');
  await expect(
    dialog.locator('.brief-style[aria-checked="true"]'),
  ).toHaveAttribute(
    'data-style-id',
    'style-pack-documentary--style-documentary',
  );
});
