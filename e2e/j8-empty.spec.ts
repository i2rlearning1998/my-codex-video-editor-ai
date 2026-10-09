import type { Page } from '@playwright/test';
import { test, expect, hook, showSceneStrip } from './fixtures';

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
  await showSceneStrip(page);
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

test('[TL-065] an empty scene shows the drop lane; with one lane the ghost lanes Add text and Add audio add or open the right thing', async ({
  page,
}) => {
  // T-ALL P2 (D-184, spec 2): the J8/T3 hint rows are replaced by the
  // empty drop lane and, with one lane, the ghost lanes.
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  // The example has several lanes: no ghost lanes.
  await expect(page.locator('.timeline-ghost-lane')).toHaveCount(0);
  await blankScene(page);
  await expect(page.locator('.timeline-empty-drop')).toBeVisible();
  await expect(hints(page)).toHaveCount(0);
  // One lane (a rectangle): Add text above, Add audio below.
  await page.locator('#rail-left [data-category="Elements"]').click();
  await page.locator('[data-shape="rectangle"]').first().click();
  const ghosts = page.locator('.timeline-ghost-lane');
  await expect(ghosts).toHaveText([/Add text/, /Add audio/]);
  // Add text: a text box, ready to type.
  await ghosts.filter({ hasText: 'Add text' }).click();
  const layers = (await scene(page)).layers;
  expect(layers.some((layer) => layer.type === 'text')).toBe(true);
  await expect(page.locator('.text-editor')).toBeVisible();
  await page.keyboard.press('Escape');
  // Two lanes now: the ghost lanes go.
  await expect(ghosts).toHaveCount(0);
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+z');
  // Add audio: the Audio panel.
  await ghosts.filter({ hasText: 'Add audio' }).click();
  await expect(
    page.locator('#rail-left [data-category="Audio"]'),
  ).toHaveAttribute('aria-pressed', 'true');
});
