import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, showCategory } from './fixtures';

// P1-3D: a .glb model imported in AI › Import becomes a Tier C code animation
// (GLTFLoader is in the vendored THREE bundle). Real sandboxed runtime, real WebGL.
const dialog = (page: Page) => page.locator('.ai-import-dialog');

async function openImport(page: Page) {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  await expect(dialog(page)).toBeVisible();
}

test('[P13D-001] a .glb model becomes a Tier C animation whose thumbnail shows the model', async ({
  page,
}) => {
  await openImport(page);
  await dialog(page)
    .locator('#ai-import-file')
    .setInputFiles('tests/fixtures/models/cube.glb');
  await expect(dialog(page).locator('#code-tier')).toHaveText(
    'Tier C · Full mode',
    { timeout: 60_000 },
  );
  await expect(dialog(page).locator('.ai-import-item')).toHaveAttribute(
    'data-status',
    /^(ok|warning)$/,
  );
  const thumb = dialog(page).locator('#code-thumb');
  await expect(thumb).toHaveAttribute('data-ready', 'true', {
    timeout: 120_000,
  });
  // Pixels: the cube (orange, lit) is drawn on a transparent background.
  const stats = await thumb.evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let drawn = 0,
      orange = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 200) {
        drawn++;
        if (d[i] > d[i + 2] + 40) orange++;
      }
    }
    return { drawn, orange, total: d.length / 4 };
  });
  expect(stats.drawn).toBeGreaterThan(stats.total * 0.03);
  expect(stats.drawn).toBeLessThan(stats.total * 0.9);
  expect(stats.orange).toBeGreaterThan(stats.drawn * 0.5);
  // Controllers for the model.
  await expect(dialog(page).locator('.code-param')).toHaveCount(5);
});

test('[P13D-002] a file that is not a .glb gets a plain sentence and nothing is added', async ({
  page,
}) => {
  await openImport(page);
  await dialog(page)
    .locator('#ai-import-file')
    .setInputFiles({
      name: 'broken.glb',
      mimeType: 'model/gltf-binary',
      buffer: Buffer.from(readFileSync('package.json')),
    });
  await expect(dialog(page).locator('#ai-import-file-name')).toContainText(
    'not a .glb model',
  );
  await expect(dialog(page).locator('#ai-import-add')).toBeDisabled();
});
