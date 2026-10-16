import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory, seekKeep } from './fixtures';

// X4 (CODE-TIERS-SPEC section 5): code animations as templates in My
// Templates (this browser; not the project, not an undo step).
const PULSE = readFileSync('tests/fixtures/code/pulse-block.js', 'utf8');
const dialog = (page: Page) => page.locator('.code-import-dialog');
const templates = (page: Page) => page.locator('#library-templates');
const codeCards = (page: Page) =>
  templates(page).locator('[data-section="code"] [data-code-template]');
const codeLayers = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions
    .find((c) => c.id === state.session.compositionId)!
    .layers.filter((l) => l.code);
};

async function importPulse(page: Page, _save = true) {
  await showCategory(page, 'Media');
  await showCategory(page, 'AI');
  await page.locator('#ai-import').click();
  await dialog(page).locator('#ai-import-source').fill(PULSE);
  await expect(dialog(page).locator('#code-thumb')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await dialog(page).locator('#ai-import-add').click();
  await expect(dialog(page)).toBeHidden();
}

test.describe('X4 code templates', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as { __AIVE_E2E_FREECODE__?: string }).__AIVE_E2E_FREECODE__ =
        'fake';
    });
    await page.goto('/');
    await expect
      .poll(async () => page.evaluate(() => '__AIVE__' in window))
      .toBe(true);
  });

  test('[CODE-008] Save as template keeps it in My Templates with a thumbnail and a hover preview; a click inserts it at the playhead on a new lane in one step', async ({
    page,
  }) => {
    await importPulse(page);
    const steps = (await hook(page)).history.labels.length;
    await showCategory(page, 'Templates');
    await expect(codeCards(page)).toHaveCount(1);
    const card = codeCards(page).first();
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('img').first()).toHaveAttribute(
      'src',
      /^data:image\/png/,
    );
    // Saving a template is not an undo step.
    expect((await hook(page)).history.labels.length).toBe(steps);
    // Hover plays a short preview.
    await card.hover();
    await expect
      .poll(async () =>
        Number(
          (await card.locator('.browse-thumb').getAttribute('data-playing')) ??
            0,
        ),
      )
      .toBeGreaterThan(2);
    await page.mouse.move(5, 5);
    await expect(card.locator('.code-hover')).toHaveCount(0);
    // A click inserts it at the playhead, on a new lane, in one step.
    await seekKeep(page, 3);
    const lanes = (await hook(page)).project.compositions[0]!.tracks.length;
    await card.click();
    await expect.poll(async () => (await codeLayers(page)).length).toBe(2);
    const state = await hook(page);
    expect(state.history.labels.at(-1)).toBe('Insert code template');
    expect(state.history.labels.length).toBe(steps + 1);
    expect(state.project.compositions[0]!.tracks.length).toBe(lanes + 1);
    const inserted = (await codeLayers(page)).find(
      (l) => l.id === state.session.selectedIds[0],
    )!;
    const clip = state.project.compositions[0]!.tracks.flatMap(
      (t) => t.clips,
    ).find((c) => c.layerId === inserted.id)!;
    expect(clip.startTime).toBe(3);
    // The project keeps its own copy of the source and the template's id.
    expect(inserted.code!.source).toBe(PULSE);
    expect(inserted.code!.templateId).toBeTruthy();
    expect(inserted.code!.params).toEqual({ color: '#ff3366', radius: 120 });
    // Unchecked, nothing is saved.
    await importPulse(page, false);
    await showCategory(page, 'Templates');
    await expect(codeCards(page)).toHaveCount(1);
  });

  test('[CODE-009] rename, duplicate, delete with Restore, export and import a template file', async ({
    page,
  }, testInfo) => {
    await importPulse(page);
    await showCategory(page, 'Templates');
    const menu = page.locator('#code-template-menu');
    const open = async (index: number) => {
      await codeCards(page).nth(index).click({ button: 'right' });
      await expect(menu).toBeVisible();
    };
    // Rename.
    await open(0);
    await menu.locator('[data-action="code-template-rename"]').click();
    await page.locator('.modal-dialog input').fill('Pink pulse');
    await page.locator('.modal-dialog input').press('Enter');
    await expect(codeCards(page).first()).toContainText('Pink pulse');
    // Duplicate.
    await open(0);
    await menu.locator('[data-action="code-template-duplicate"]').click();
    await expect(codeCards(page)).toHaveCount(2);
    await expect(codeCards(page).nth(1)).toContainText('Pink pulse copy');
    // Delete, then Restore from the toast.
    await open(1);
    await menu.locator('[data-action="code-template-delete"]').click();
    await expect(codeCards(page)).toHaveCount(1);
    await page
      .locator('.toast')
      .getByRole('button', { name: 'Restore' })
      .click();
    await expect(codeCards(page)).toHaveCount(2);
    // Export as a .json file.
    const downloading = page.waitForEvent('download');
    await open(0);
    await menu.locator('[data-action="code-template-export"]').click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('Pink-pulse.aive-template.json');
    const file = testInfo.outputPath('template.json');
    await download.saveAs(file);
    const exported = JSON.parse(readFileSync(file, 'utf8'));
    expect(exported.format).toBe('aive-code-template');
    expect(exported.template.source).toBe(PULSE);
    // Import it back: a third template.
    await templates(page).locator('[data-see-all="code"]').click();
    const chooser = page.waitForEvent('filechooser');
    await templates(page).locator('#code-template-import').click();
    await (await chooser).setFiles(file);
    await expect(
      page.locator('.toast', { hasText: 'Template "Pink pulse" imported' }),
    ).toBeVisible();
    await expect(templates(page).locator('[data-code-template]')).toHaveCount(
      3,
    );
    // A broken file is refused with a message.
    const broken = testInfo.outputPath('broken.json');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      broken,
      JSON.stringify({
        format: 'aive-code-template',
        version: 1,
        template: {},
      }),
    );
    const again = page.waitForEvent('filechooser');
    await templates(page).locator('#code-template-import').click();
    await (await again).setFiles(broken);
    await expect(
      page.locator('.toast', {
        hasText: 'The template in this file is damaged.',
      }),
    ).toBeVisible();
    await expect(templates(page).locator('[data-code-template]')).toHaveCount(
      3,
    );
  });

  test('[CODE-010] the Scene outliner shows code layers with a code icon; hide and lock act on them', async ({
    page,
  }) => {
    await importPulse(page, false);
    const layer = (await codeLayers(page))[0]!;
    await showCategory(page, 'Scene');
    const row = page.locator(
      `#scene-list .outliner-row[data-layer-id="${layer.id}"]`,
    );
    await expect(row.locator('.outliner-icon')).toHaveAttribute(
      'data-type',
      'code',
    );
    const lane = async () =>
      (await hook(page)).project.compositions[0]!.tracks.find((t) =>
        t.clips.some((c) => c.layerId === layer.id),
      )!;
    await row.hover();
    await row.locator('[data-ol="lock"]').click();
    expect((await lane()).locked).toBe(true);
    await row.hover();
    await row.locator('[data-ol="eye"]').click();
    expect((await lane()).enabled).toBe(false);
  });
});
