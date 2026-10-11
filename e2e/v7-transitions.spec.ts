import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  showCategory,
  showSceneStrip,
  seekKeep,
  settled,
} from './fixtures';

// V7 (Clipchamp clone spec 10.5): one place for transitions (the right
// Transition panel) and transitions between scenes.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});
const panel = (page: Page) => page.locator('#right-section');
const labels = async (page: Page) => (await hook(page)).history.labels;
const scenes = async (page: Page) => (await hook(page)).project.compositions;
const transitionInto = async (page: Page, index: number) => {
  const marker = (await scenes(page))[index]?.markers.find((item) =>
    item.label.startsWith('aive:scene-transition '),
  );
  return marker
    ? (JSON.parse(marker.label.slice('aive:scene-transition '.length)) as {
        type: string;
        duration: number;
      })
    : null;
};
async function secondScene(page: Page) {
  await showSceneStrip(page);
  await page.locator('#scene-strip-add').click();
  await page.locator('[data-action="strip-add-blank"]').click();
  await expect.poll(async () => (await scenes(page)).length).toBe(2);
  return (await scenes(page))[1]!.id;
}

test('[TR-017] one Transitions place: no left Transitions category (rail order Templates, Elements, Text, Media, Draw, Scene, Record & create, Audio); the right Transition panel has the groups, 28 drawn tiles and search', async ({
  page,
}) => {
  const rail = await page
    .locator('#rail-left [data-category]')
    .evaluateAll((items) =>
      items.map((item) => (item as HTMLElement).dataset.category),
    );
  expect(rail).not.toContain('Transitions');
  expect(rail.slice(0, 6)).toEqual([
    'Templates',
    'Elements',
    'Text',
    'Media',
    'Draw',
    'Scene',
  ]);
  // V7 (spec 11.4): Record & create, then Audio.
  expect(rail.slice(6)).toEqual(['Record', 'Audio']);
  await expect(page.locator('#library-transitions')).toHaveCount(0);
  // The right panel (opened here from a scene "+") holds every tile.
  const id = await secondScene(page);
  await page
    .locator(
      `#scene-strip [data-action="scene-transition-add"][data-scene-id="${id}"]`,
    )
    .click();
  await settled(page);
  await expect(panel(page).locator('.fx-tiles-group')).toHaveText([
    'Fades & blurs',
    'Tiles',
    'Wipes',
    'More',
  ]);
  await expect(panel(page).locator('.fx-tile')).toHaveCount(29);
  await expect
    .poll(() =>
      panel(page)
        .locator('.fx-tile[data-tile="crossfade"] img')
        .evaluate((image: HTMLImageElement) => image.src),
    )
    .toMatch(/^data:image\/png/);
  await panel(page).locator('.fx-tiles-search').fill('glitch');
  await expect(panel(page).locator('.fx-tile')).toHaveText([
    'Glitch',
    'Glitch reveal',
  ]);
});

test('[TR-018] "+" between two scenes adds Fade through black (one step, no scene shortened); its marker opens the right panel, a tile swaps it, None removes it; playback darkens across the cut; deleting a scene removes its transitions', async ({
  page,
}) => {
  const first = (await scenes(page))[0]!;
  const id = await secondScene(page);
  const lengths = (await scenes(page)).map((scene) => scene.duration);
  const add = page.locator(
    `#scene-strip [data-action="scene-transition-add"][data-scene-id="${id}"]`,
  );
  await expect(add).toHaveAttribute('title', 'Add transition');
  await add.click();
  expect((await labels(page)).at(-1)).toBe('Add transition');
  expect(await transitionInto(page, 1)).toEqual({
    type: 'fade-black',
    duration: 1,
  });
  expect((await scenes(page)).map((scene) => scene.duration)).toEqual(lengths);
  // The panel opened with Fade through black chosen.
  await settled(page);
  await expect(
    page.locator('#rail-right [data-section="Transitions"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    panel(page).locator('.fx-tile[data-tile="fade-black"]'),
  ).toHaveAttribute('aria-selected', 'true');
  // A tile swaps it, one step; Duration is under it.
  await panel(page).locator('.fx-tile[data-tile="fade-white"]').click();
  expect((await transitionInto(page, 1))!.type).toBe('fade-white');
  expect((await labels(page)).at(-1)).toBe('Change transition');
  await expect(panel(page).locator('#transition-duration')).toBeVisible();
  // None removes it; the "+" comes back; Undo restores it.
  await panel(page).locator('.fx-tile[data-tile="none"]').click();
  expect(await transitionInto(page, 1)).toBeNull();
  await expect(add).toBeVisible();
  await page.locator('#undo').click();
  expect((await transitionInto(page, 1))!.type).toBe('fade-white');
  // The marker reopens the panel.
  await page.locator('#composition-canvas').click({ position: { x: 4, y: 4 } });
  const marker = page.locator(
    `#scene-strip [data-action="scene-transition"][data-scene-id="${id}"]`,
  );
  await marker.click();
  await expect(marker).toHaveAttribute('aria-pressed', 'true');
  await panel(page).locator('.fx-tile[data-tile="fade-black"]').click();
  // Playback across the cut: the artboard goes dark around it.
  await page
    .locator(`#scene-strip .scene-strip-card[data-scene-id="${first.id}"]`)
    .click();
  await seekKeep(page, first.duration - 1);
  const dark = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const canvas = document.querySelector<HTMLCanvasElement>(
          '#composition-canvas',
        )!;
        let darkest = 255;
        const started = performance.now();
        const sample = () => {
          const context = canvas.getContext('2d')!;
          const pixel = context.getImageData(
            canvas.width / 2,
            canvas.height / 2,
            1,
            1,
          ).data;
          darkest = Math.min(darkest, (pixel[0]! + pixel[1]! + pixel[2]!) / 3);
          if (performance.now() - started < 2200) requestAnimationFrame(sample);
          else resolve(darkest);
        };
        (
          document.querySelector(
            '#timeline-foundation [data-action="play"]',
          ) as HTMLElement
        ).click();
        requestAnimationFrame(sample);
      }),
  );
  expect(dark).toBeLessThan(40);
  // (Playback has run into the empty second scene, which has no transport.)
  const play = page.locator('#timeline-foundation [data-action="play"]');
  if (await play.isEnabled()) await play.click();
  // Deleting the second scene removes its transition with it; with three
  // scenes, deleting the middle one removes the next one's transition too.
  await showCategory(page, 'Scene');
  const third = await (async () => {
    await page.locator('#scene-strip-add').click();
    await page.locator('[data-action="strip-add-blank"]').click();
    await expect.poll(async () => (await scenes(page)).length).toBe(3);
    return (await scenes(page)).at(-1)!.id;
  })();
  await page
    .locator(
      `#scene-strip [data-action="scene-transition-add"][data-scene-id="${third}"]`,
    )
    .click();
  expect(await transitionInto(page, 2)).not.toBeNull();
  await page
    .locator(`#scene-strip .scene-strip-card[data-scene-id="${id}"]`)
    .click({ button: 'right' });
  await page.locator('[data-action="strip-delete"]').click();
  await expect.poll(async () => (await scenes(page)).length).toBe(2);
  expect(await transitionInto(page, 1)).toBeNull();
  await expect(
    page.locator('#scene-strip [data-action="scene-transition"]'),
  ).toHaveCount(0);
});
