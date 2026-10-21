import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, hook, showCategory } from './fixtures';

// FINAL2 U10: Build video from an AI composition, and the scene camera.
test.use({ viewport: { width: 1920, height: 1080 } });

test('[F2-070] AI › Import a composition pack: Build video lists the media slots, an upload fills one, the rest become frames, and the video is added as new scenes', async ({
  page,
}) => {
  await page.goto('/');
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  const pack = readFileSync(
    'examples/creator-packs/composition-documentary-mini.json',
    'utf8',
  );
  await page.locator('#ai-import-source').fill(pack);
  const build = page.locator('[data-action="build-video"]');
  await expect(build).toBeVisible();
  await build.click();
  const dialog = page.locator('.composition-dialog');
  await expect(dialog.locator('.composition-slot')).not.toHaveCount(0);
  const archive = dialog.locator('.composition-slot[data-slot="archive"]');
  await expect(archive.locator('.composition-required')).toBeVisible();
  await expect(dialog.locator('.composition-checklist')).toContainText(
    'empty slot',
  );
  await archive
    .locator('input[type="file"]')
    .setInputFiles(
      path.resolve('tests/fixtures/media/image_testsrc_1200x800.jpg'),
    );
  await expect(archive.locator('.composition-state')).toHaveAttribute(
    'data-filled',
    'true',
  );
  await page.screenshot({ path: 'reports/final-ui/u10-build.png' });
  const before = (await hook(page)).project.compositions.length;
  await dialog.locator('#composition-add').click();
  await expect
    .poll(async () => (await hook(page)).project.compositions.length)
    .toBeGreaterThan(before);
  const state = await hook(page);
  expect(state.history.labels.at(-1)).toBe('Build video');
  const added = state.project.compositions.find(
    (c) => c.id === state.session.compositionId,
  )!;
  expect(added.name).not.toBe('Main composition');
});

test('[F2-071] Scene camera: the scene toolbar Camera button opens the right Camera section (FINAL3 C3: no keyframe buttons); Preview camera keeps layers selectable', async ({
  page,
  openFixtureProject,
}) => {
  await page.goto('/');
  await openFixtureProject('nle-example.json');
  const bar = page.locator('#context-toolbar');
  await expect(bar).toHaveAttribute('data-kind', 'scene');
  await bar.locator('[data-control="scene-camera"]').click();
  const panel = page.locator('#right-section');
  await expect(panel).toHaveAttribute('data-section', 'Camera');
  await expect(page.locator('[data-deep-panel="camera"]')).toHaveCount(0);
  await panel.locator('[data-action="camera-add"]').click();
  expect((await hook(page)).history.labels.at(-1)).toBe('Add camera');
  await expect(panel.locator('[data-camera-keyframe]')).toHaveCount(0);
  await panel.locator('[data-action="camera-preview"]').click();
  await expect(panel.locator('[data-action="camera-preview"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.screenshot({ path: 'reports/final-ui/u10-camera.png' });
  // Picking stays on while previewing: a click on a layer selects it.
  const box = (await page.locator('#artboard-shadow').boundingBox())!;
  await page.keyboard.press('Escape');
  // (The blue video picture near the top left.)
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBeGreaterThan(0);
  await expect(
    page.locator('.toast', { hasText: 'cannot be selected' }),
  ).toHaveCount(0);
});

test.describe('library panel width', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('[F2-072] from 1440 px library panels are 380 px wide (two cards of at least 165 px); the Scene panel keeps its width', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as { __AIVE_E2E_LIBRARY__?: string }).__AIVE_E2E_LIBRARY__ =
        'off';
    });
    await page.goto('/');
    const width = () =>
      page
        .locator('.editor-shell')
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue('--left-panel'),
        );
    await expect.poll(width).toBe('320px');
    await showCategory(page, 'Elements');
    await expect.poll(width).toBe('380px');
    await showCategory(page, 'Scene');
    await expect.poll(width).toBe('320px');
  });
});
