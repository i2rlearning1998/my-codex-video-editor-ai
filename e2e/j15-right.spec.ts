import type { Page } from '@playwright/test';
import { test, expect, hook, openRightPanel } from './fixtures';

// J15: the right panel: a labelled icon rail in the selection's order, a
// header with the title, a count badge and collapse; sections per type with
// filter and effect lists, the speed slider and the animate grids; a
// picture's own controls under Advanced.
// nle-example: layer-a and layer-b are videos (clip-a 0..2 s, clip-b
// 3..5 s on Video 1); layer-c is an image (clip-c on Video 2).
const rail = (page: Page) => page.locator('#rail-right');
const tab = (page: Page, name: string) =>
  rail(page).locator(`[data-section="${name}"]`);
const panel = (page: Page) => page.locator('#right-section');
const labels = async (page: Page) => (await hook(page)).history.labels;
const clip = async (page: Page, id: string) =>
  (await hook(page)).project.compositions[0]!.tracks.flatMap(
    (track) => track.clips,
  ).find((item) => item.id === id)!;
const shown = (page: Page) =>
  rail(page)
    .locator('button[data-section]:not([hidden])')
    .evaluateAll((items) =>
      items.map(
        (item) => item.querySelector('.icon-rail-label')?.textContent ?? '',
      ),
    );
async function select(page: Page, id: string) {
  await page
    .locator(
      `#timeline-foundation .timeline-clip[data-action="clip"][data-id="${id}"]`,
    )
    .click({ position: { x: 20, y: 10 } });
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([id]);
  // V7 (spec 10.1): a selection never opens the panel; its rail does.
  await openRightPanel(page);
}

test.beforeEach(async ({ page, openFixtureProject }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await openFixtureProject('nle-example.json');
});

test('[LAY-046] the right panel has a header with the title, a count badge and collapse; the rail shows each type its sections in order', async ({
  page,
}, testInfo) => {
  const title = page.locator('#right-panel-title');
  const count = page.locator('#right-panel-count');
  // U5: nothing selected has no Canvas panel.
  await expect(title).toHaveText('Nothing selected');
  await expect(count).toBeHidden();
  await select(page, 'layer-a');
  await expect(title).toHaveText('Video');
  await expect(count).toHaveText('1');
  // V4 (spec 5, D-192): Clipchamp's order with our Properties first.
  expect(await shown(page)).toEqual([
    'Video',
    'Fade',
    'Filters',
    'Effects',
    'Adjust colors',
    'Speed',
    'Sound',
    'Animate',
    'Auto Caption',
  ]);
  await select(page, 'layer-c');
  await expect(title).toHaveText('Image');
  expect(await shown(page)).toEqual([
    'Image',
    'Fade',
    'Filters',
    'Effects',
    'Adjust colors',
    'Animate',
  ]);
  // The first tab holds the picture's own controls (it is already the open
  // section: clicking it again would collapse the panel). U5: Animate is
  // its own tab, not a section there.
  await expect(tab(page, 'Properties')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel(page).locator('[data-action="right-crop"]')).toBeVisible();
  await expect(
    panel(page).locator('[data-accordion="image-animate"]'),
  ).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('right-panel.png') });
  // Collapse closes the panel.
  await page.locator('#right-panel-collapse').click();
  await expect
    .poll(() =>
      page
        .locator('.editor-shell')
        .evaluate((shell) => shell.classList.contains('inspector-collapsed')),
    )
    .toBe(true);
});

test('[LAY-047] Speed has a slider from 0.1x to 16x with ticks; Effects and Filters list their items; Animate presets are grids; the clip rail has no Transitions tab', async ({
  page,
}) => {
  await select(page, 'layer-b');
  // Speed: the slider and its ticks; End goes to 16x (one step, on release).
  await tab(page, 'Speed').click();
  const slider = panel(page).locator('#right-speed-slider');
  await expect(slider).toHaveAttribute('aria-valuetext', '1×');
  await expect(panel(page).locator('.right-speed-ticks span')).toHaveText([
    '0.1×',
    '1×',
    '2×',
    '4×',
    '16×',
  ]);
  // clip-b (2 s long) has room after it; 0.5x makes it 4 s.
  await slider.focus();
  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuetext', '0.1×');
  await slider.evaluate((input: HTMLInputElement) => {
    input.value = String(
      Math.round(((Math.log10(2) + 1) / (Math.log10(16) + 1)) * 1000),
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect((await labels(page)).at(-1)).toBe('Change speed');
  expect((await clip(page, 'clip-b')).speed).toBe(2);
  // Effects: the FX library's effects for a video (T-ALL P6, D-189).
  // V4: tiles (spec 5).
  await tab(page, 'Effects').click();
  await expect(
    panel(page).locator('.fx-tile[data-tile="effect.blur"]'),
  ).toHaveAttribute('aria-selected', 'false');
  // Animate presets are thumbnail grids in the Animate tab (U5): In ›
  // Fade, one step.
  await tab(page, 'Animate').click();
  await panel(page).locator('[data-preset="fade"]').click();
  expect((await labels(page)).at(-1)).toBe('Set animation');
  expect(
    ((await clip(page, 'clip-b')).metadata as { animation?: { in?: unknown } })
      .animation?.in,
  ).toMatchObject({ preset: 'fade' });
  await expect(panel(page).locator('[data-preset="fade"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // V4 (spec 5): a clip's rail has no Transitions tab; a transition is
  // picked from the cut's marker (spec 6, TR-013).
  await expect(tab(page, 'Transitions')).toBeHidden();
});
