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

test('[F2-071] Scene camera: a preset sets the camera with a badge; editing shows the scene still, Preview camera shows the move and turns picking off', async ({
  page,
  openFixtureProject,
}) => {
  await page.goto('/');
  await openFixtureProject('nle-example.json');
  const bar = page.locator('#context-toolbar');
  await expect(bar).toHaveAttribute('data-kind', 'scene');
  await bar.locator('[data-control="scene-camera"]').click();
  const panel = page.locator('[data-deep-panel="camera"]');
  await expect(panel).toBeVisible();
  const canvas = page.locator('#composition-canvas');
  const art = (await page.locator('#artboard-shadow').boundingBox())!;
  const shot = () => page.screenshot({ clip: art });
  const still = await shot();
  await panel.locator('[data-camera-preset="pan-left"]').click();
  await expect(page.locator('#camera-badge')).toHaveText('Camera: Pan left');
  const state = await hook(page);
  expect(
    (state.project.compositions[0] as { camera?: unknown }).camera,
  ).toBeTruthy();
  expect(state.history.labels.at(-1)).toBe('Camera preset');
  await expect(panel.locator('[data-camera-key="x"]')).not.toHaveValue('0');
  // Editing: un-moved.
  await expect.poll(async () => (await shot()).equals(still)).toBe(true);
  await panel.locator('#camera-preview').check();
  await expect.poll(async () => (await shot()).equals(still)).toBe(false);
  await page.screenshot({ path: 'reports/final-ui/u10-camera.png' });
  // Picking is off while previewing.
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.toast').last()).toContainText(
    'cannot be selected',
  );
  expect((await hook(page)).session.selectedIds).toEqual([]);
  // A typed zoom with a keyframe.
  await panel.locator('[data-camera-keyframe="zoom"]').click();
  await expect(panel.locator('[data-camera-keyframe="zoom"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await panel.locator('#camera-preview').uncheck();
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
