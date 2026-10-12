import { test, expect } from './fixtures';
const ids = [
  'particles',
  'three-scene',
  'pixi-field',
  'lottie-mark',
  'aurora',
  'shader',
  'typography',
  'svg-infographic',
  'chart',
  'parallax',
];
for (const id of ids)
  test.describe(id, () => {
    test('[EXP-007] Free code: visible 1080p thumbnail and two deterministic bakes', async ({
      page,
    }, testInfo) => {
      test.setTimeout(180000);
      await page.goto('/freecode-gallery/');
      await expect(page.locator('#status')).toContainText('Valid ·', {
        timeout: 15000,
      });
      await page.locator('#sample').selectOption(id);
      await expect(page.locator('#validate')).toBeEnabled();
      await page.locator('#resolution').selectOption('1080');
      await expect(page.locator('#status')).toContainText('Valid ·', {
        timeout: 15000,
      });
      await expect(page.locator('#validate')).toBeEnabled();
      const thumbnail = await page
        .locator('#canvas')
        .evaluate((c: HTMLCanvasElement) => {
          const d = c
            .getContext('2d')!
            .getImageData(0, 0, c.width, c.height).data;
          let visible = 0,
            transparent = 0;
          for (let i = 3; i < d.length; i += 4) {
            if (d[i]! > 0) visible++;
            else transparent++;
          }
          return { width: c.width, height: c.height, visible, transparent };
        });
      expect(thumbnail.width).toBe(1920);
      expect(thumbnail.height).toBe(1080);
      expect(thumbnail.visible).toBeGreaterThan(500);
      expect(thumbnail.transparent).toBeGreaterThan(1000);
      await page
        .locator('#canvas')
        .screenshot({ path: testInfo.outputPath(id + '.png') });
      const box = await page.locator('#stage').boundingBox();
      expect(box!.width).toBeLessThanOrEqual(1600);
      await page.locator('#benchmark').click();
      await expect(page.locator('#status')).toContainText(
        'Benchmark complete',
        {
          timeout: 160000,
        },
      );
      const raw = (await page.locator('#proof-data').textContent())!;
      const results = JSON.parse(raw) as {
        height: number;
        frames: number;
        maxChannelDifference: number;
        visible: boolean;
        framePeakMs: number;
        twoBakeMs: number;
      }[];
      expect(results.map((r) => r.height)).toEqual([720, 1080]);
      for (const r of results) {
        expect(r.frames).toBe(96);
        expect(r.visible).toBe(true);
        expect(r.maxChannelDifference).toBe(0);
        expect(r.framePeakMs).toBeLessThan(5000);
        expect(r.twoBakeMs).toBeLessThan(120000);
      }
      await testInfo.attach(id + '-measured.json', {
        body: raw,
        contentType: 'application/json',
      });
      await expect(page.locator('h1')).toHaveText('Motion laboratory');
    });
  });
for (const attack of [
  'fetch',
  'WebSocket',
  'parent',
  'storage',
  'loop',
  'allocation',
  'import',
  'timeout',
])
  test.describe(attack, () => {
    test('[DEV-001] Free code fails safely and host remains usable', async ({
      page,
    }) => {
      await page.goto('/freecode-gallery/');
      await expect(page.locator('#validate')).toBeEnabled({ timeout: 15000 });
      await page.locator('#hostile').selectOption(attack);
      await page.locator('#attack').click();
      await expect(page.locator('#status')).toContainText(
        /Safely (rejected|stopped)/,
        { timeout: 10000 },
      );
      await expect(page.locator('h1')).toHaveText('Motion laboratory');
      await page.locator('#sample').selectOption('chart');
      await expect(page.locator('#status')).toContainText('Valid ·', {
        timeout: 15000,
      });
    });
  });
test('[EXP-007] Free code bakes PNG cache, scrubs and applies exposed parameters', async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  await page.goto('/freecode-gallery/');
  await expect(page.locator('#validate')).toBeEnabled({ timeout: 15000 });
  await page.locator('#sample').selectOption('chart');
  await expect(page.locator('#validate')).toBeEnabled();
  await page.locator('#param-title').fill('QUARTERLY GROWTH');
  await page.locator('#param-title').press('Tab');
  await page.locator('#validate').click();
  await expect(page.locator('#status')).toContainText('Valid ·');
  await page.locator('#bake').click();
  await expect(page.locator('#status')).toContainText('Bake complete', {
    timeout: 100000,
  });
  const report = (await page.locator('#proof-data').textContent())!;
  await testInfo.attach('png-bake.json', {
    body: report,
    contentType: 'application/json',
  });
  await page.locator('#scrub').focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#scrub')).toHaveValue('1');
  await page.locator('#play').click();
  await expect.poll(() => page.locator('#scrub').inputValue()).not.toBe('1');
  await page.locator('#play').click();
  await page.locator('#cancel').click();
  await expect(page.locator('iframe')).toHaveCount(0);
});
