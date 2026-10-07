import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
const ids = ['counter', 'particle-burst', 'data-pipeline', 'kinetic-letters'];
async function pixels(page: Page) {
  return page
    .locator('#preview')
    .evaluate((canvas: HTMLCanvasElement) =>
      Array.from(
        canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
          .data,
      ),
    );
}
for (const id of ids) {
  test(`[EXP-007] code-layer ${id} matches both Offscreen paths at five times`, async ({
    page,
  }) => {
    await page.goto('/blocks-gallery/');
    await page.locator('#block').selectOption(id);
    await page.locator('#export-check').click();
    await expect(page.locator('#results')).toContainText('"check": "export"', {
      timeout: 30000,
    });
    const result = JSON.parse((await page.locator('#results').textContent())!);
    expect(result.pass).toBe(true);
    expect(result.maxDifference).toBe(0);
    expect(result.rows).toHaveLength(5);
    for (const row of result.rows) {
      expect(row.directOffscreenMaxDifference).toBe(0);
      expect(row.workerMaxDifference).toBe(0);
    }
  });
  test(`[ANI-003] code-layer ${id} scrubs 3 to 1 to 3 without history`, async ({
    page,
  }) => {
    await page.goto('/blocks-gallery/');
    await page.locator('#block').selectOption(id);
    await page.locator('#time').fill('3');
    await expect(page.locator('#preview')).toHaveAttribute('data-time', '3');
    const first = await pixels(page);
    await page.locator('#time').fill('1');
    await expect(page.locator('#preview')).toHaveAttribute('data-time', '1');
    await page.locator('#time').fill('3');
    await expect(page.locator('#preview')).toHaveAttribute('data-time', '3');
    expect(await pixels(page)).toEqual(first);
  });
}
function code(body: string) {
  return `({id:'hostile',version:'1.0.0',name:'Probe',category:'Test',defaultDuration:4,params:[],render(ctx,t,size,params,seed){${body}}})`;
}
test('[FX-014] code-layer worker contains loops, rejects fetch, reports runtime errors and recovers', async ({
  page,
}) => {
  await page.goto('/blocks-gallery/');
  await page.locator('#source').fill(code('fetch("https://example.com");'));
  await page.locator('#compile').click();
  await expect(page.locator('#code-status')).toContainText('Validation error:');
  await page.locator('#source').fill(code('while(true) {}'));
  await page.locator('#compile').click();
  await expect(page.locator('#code-status')).toContainText(
    'worker terminated',
    { timeout: 15000 },
  );
  await expect(page.locator('#compile')).toBeEnabled();
  await page.locator('#source').fill(code('ctx.restore();'));
  await page.locator('#compile').click();
  await expect(page.locator('#code-status')).toContainText('Runtime error:');
  await page
    .locator('#source')
    .fill(code("ctx.fillStyle = '#ff0000'; ctx.fillRect(t, 20, 40, 40);"));
  await page.locator('#compile').click();
  await expect(page.locator('#code-status')).toHaveText('Worker frame OK.');
  await page.locator('#export-check').click();
  await expect(page.locator('#results')).toContainText('"pass": true');
  await page.locator('#block').selectOption('counter');
  await expect(page.locator('#frame-status')).toContainText(
    'Rendered Signal counter',
  );
});
