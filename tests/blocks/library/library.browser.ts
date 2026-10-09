import { test, expect } from '@playwright/test';
import { blockLibrary } from '../../../src/blocks/library';

for (const entry of blockLibrary) {
  test(
    entry.id + ': visible transparent pose, 3→1→3 and exact export parity',
    async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.goto('/blocks-gallery/');
      await page.locator('[data-library-id="' + entry.id + '"]').click();
      await expect(page.locator('#frame-status')).toContainText(
        'Rendered ' + entry.name,
      );
      await expect(page.locator('#code-status')).toHaveText('Worker frame OK.');
      const pixels = () =>
        page.locator('#preview').evaluate((node) => {
          const canvas = node as HTMLCanvasElement;
          return Array.from(
            canvas
              .getContext('2d')!
              .getImageData(0, 0, canvas.width, canvas.height).data,
          );
        });
      const pose = await pixels();
      expect(pose.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
      expect(pose.some((v, i) => i % 4 === 3 && v === 0)).toBe(true);
      const seek = async (t: number) => {
        await page.locator('#time').fill(String(t));
        await expect(page.locator('#frame-status')).toHaveText(
          `Rendered ${entry.name} at ${t.toFixed(2)} s`,
        );
      };
      await seek(3);
      const first = await pixels();
      await seek(1);
      await seek(3);
      expect(await pixels()).toEqual(first);
      await page.locator('#export-check').click();
      await expect(page.locator('#results')).toContainText(
        '"check": "export"',
        { timeout: 45000 },
      );
      const result = JSON.parse(
        (await page.locator('#results').textContent())!,
      );
      expect(result.block).toBe(entry.id);
      expect(result.rows).toHaveLength(5);
      expect(result.pass).toBe(true);
      expect(result.maxDifference).toBe(0);
      expect(result.tolerance).toBe(0);
      expect(errors).toEqual([]);
    },
  );
}
