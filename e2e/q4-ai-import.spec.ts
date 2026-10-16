import { readFileSync } from 'node:fs';
import { test, expect, hook, showCategory } from './fixtures';
import { MOVE, MOVE_ID, dialog } from './creator-helpers';

// Q4: checks run on their own, a result card opens the AI category, which
// lists what came from Creator Packs by kind with an AI chip.
const SHAPE = readFileSync('examples/creator-packs/shape.json', 'utf8');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[QT-014][QT-015][QT-012][QT-013] pasted packs are checked on their own; the result card opens the AI category, grouped by kind with AI chips', async ({
  page,
}) => {
  await showCategory(page, 'Media');
  await showCategory(page, 'AI');
  await page.locator('#ai-import').click();
  // No separate Run checks gate.
  await expect(dialog(page).locator('#creator-check')).toHaveCount(0);
  await dialog(page).locator('#ai-import-source').fill(SHAPE);
  const row = dialog(page).locator('.creator-item[data-item="shape-kite"]');
  await expect(row).toHaveAttribute('data-status', /ok|warning/, {
    timeout: 60_000,
  });
  await expect(row.locator('.creator-status')).toHaveText(/OK|Warning/);
  await expect(dialog(page).locator('#ai-import-add')).toBeEnabled();
  await dialog(page).locator('#ai-import-add').click();
  // The result card says what happened and opens the AI tab.
  const result = dialog(page).locator('#creator-result');
  await expect(result).toContainText('Added 1 items to My library.');
  await dialog(page).locator('#creator-open-ai').click();
  await expect(dialog(page)).toBeHidden();
  const ai = page.locator('#library-ai');
  await expect(ai).toBeVisible();
  await expect(page.locator('#rail-left [data-category="AI"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const shapes = ai.locator('.ai-group[data-kind="shape"]');
  await expect(shapes.locator('h3')).toHaveText('Shapes (1)');
  const card = shapes.locator('.ai-card[data-item="shape-pack--shape-kite"]');
  await expect(card.locator('.ai-chip')).toHaveText('AI');
  // A preset pack adds a Presets group.
  await showCategory(page, 'Media');
  await showCategory(page, 'AI');
  await page.locator('#ai-import').click();
  await dialog(page).locator('#ai-import-source').fill(MOVE);
  await expect(dialog(page).locator('#ai-import-add')).toBeEnabled({
    timeout: 60_000,
  });
  await dialog(page).locator('#ai-import-add').click();
  await dialog(page).locator('#creator-open-ai').click();
  await expect(
    ai.locator(
      `.ai-group[data-kind="preset"] .ai-card[data-item="${MOVE_ID}"]`,
    ),
  ).toBeVisible();
  // A click inserts the shape in one undo step.
  const steps = (await hook(page)).history.labels.length;
  await card.click();
  await expect
    .poll(async () => (await hook(page)).history.labels.length)
    .toBe(steps + 1);
  // R2: other library panels list no AI items.
  await showCategory(page, 'Elements');
  const elements = page.locator('#library-elements');
  await elements.locator('[data-tile="shapes"]').click();
  await expect(
    elements.locator('[data-item-id="shape-pack--shape-kite"]'),
  ).toHaveCount(0);
});
