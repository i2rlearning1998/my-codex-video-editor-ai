import type { Page } from '@playwright/test';
import { test, expect, hook } from './fixtures';

// J8: a shimmer skeleton while the editor loads, and hint rows on an empty
// timeline.
const scene = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
};
const hints = (page: Page) =>
  page.locator('#timeline-foundation .timeline-hint');
async function blankScene(page: Page) {
  await page.locator('#scene-strip-add').click();
  await page.locator('[data-action="strip-add-blank"]').click();
  await expect.poll(async () => (await scene(page)).layers.length).toBe(0);
}

test('[TL-064] a shimmer skeleton of the editor shows until the app has loaded, then goes', async ({
  page,
}) => {
  // Hold the app's script so the page shows what it shows while loading.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/src/main.ts', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'commit' });
  const skeleton = page.locator('.boot-skeleton');
  await expect(skeleton).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'true');
  await expect(skeleton.locator('.boot-row')).toHaveCount(3);
  expect(
    await skeleton
      .locator('.boot-row')
      .first()
      .evaluate((row) => getComputedStyle(row).animationName),
  ).toBe('boot-shimmer');
  release();
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await expect(skeleton).toHaveCount(0);
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy');
  await expect(page.locator('#timeline-foundation')).toBeVisible();
});

test('[TL-065] an empty scene shows + Add text, + Add video and + Add audio rows that add or open the right thing', async ({
  page,
}) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  // The example has clips: no hints.
  await expect(hints(page)).toHaveCount(0);
  await blankScene(page);
  await expect(hints(page)).toHaveText([
    '+ Add text',
    '+ Add video',
    '+ Add audio',
  ]);
  // + Add text: a text box, ready to type; the hints go.
  await hints(page).filter({ hasText: 'Add text' }).click();
  const layers = (await scene(page)).layers;
  expect(layers).toHaveLength(1);
  expect(layers[0]!.type).toBe('text');
  await expect(page.locator('.text-editor')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(hints(page)).toHaveCount(0);
  // + Add video: the Media panel with the file picker.
  await blankScene(page);
  const chooser = page.waitForEvent('filechooser');
  await hints(page).filter({ hasText: 'Add video' }).click();
  await chooser;
  await expect(
    page.locator('#rail-left [data-category="Media"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  // + Add audio: the Audio panel.
  await hints(page).filter({ hasText: 'Add audio' }).click();
  await expect(
    page.locator('#rail-left [data-category="Audio"]'),
  ).toHaveAttribute('aria-pressed', 'true');
});
