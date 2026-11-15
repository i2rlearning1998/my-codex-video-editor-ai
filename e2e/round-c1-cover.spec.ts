// ROUND-C1 F5 (rough use for F1): the project cover drawn on autosave is a
// real first-content picture for a scene without video, and drawing it
// never disturbs the stage.
import { test, expect, menuAction, hook } from './fixtures';

test('[RDC1-091] the cover of a scene without video is its own drawn picture (not black) in Projects; making it changes nothing on the stage', async ({
  page,
}) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => '__AIVE__' in window)).toBe(true);
  const time = (await hook(page)).session.time;
  await page.getByRole('button', { name: '+ Marker' }).click();
  await expect(page.locator('#save-status-text')).toHaveText(/Saved/);
  await menuAction(page, '#open-projects');
  const thumb = page.locator('.projects-dialog .project-thumb').first();
  await expect(thumb).toHaveJSProperty('tagName', 'IMG');
  const spread = await thumb.evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const x = c.getContext('2d')!;
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let min = 255,
      max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i]! + d[i + 1]! + d[i + 2]!;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    return max - min;
  });
  expect(spread).toBeGreaterThan(60);
  expect((await hook(page)).session.time).toBe(time);
});
