import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory } from './fixtures';

// J14: the timeline clip menu starts with a section for the kind of clip
// (each entry a registered command with its shortcut), then a divider and
// the earlier entries. Audio opens a submenu; Auto cut is planned; Edit
// duration is a popover, Rename is in place, More options opens the right
// panel. The menu works from the keyboard.
const MEDIA = 'tests/fixtures/media';
const WEBM = 'video_testsrc_720p_2s_vp9_opus.webm';
const JPG = 'image_testsrc_1200x800.jpg';

const scene = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
};
const labels = async (page: Page) => (await hook(page)).history.labels;
const menu = (page: Page) =>
  page.locator('#timeline-foundation .timeline-menu');
const entries = (page: Page) =>
  menu(page)
    .locator('[role^="menuitem"]')
    .evaluateAll((items) =>
      items.map((item) =>
        (item.firstChild?.textContent ?? item.textContent ?? '').trim(),
      ),
    );
async function addToScene(page: Page, name: string) {
  const item = page.locator(
    `.media-item:has(.media-card[data-name="${name}"])`,
  );
  await item.locator('.media-card').click({ button: 'right' });
  await page.locator('#media-menu [data-action="media-add"]').click();
  return (await hook(page)).session.selectedIds[0]!;
}
async function clipMenu(page: Page, layerId: string) {
  const clip = page.locator(
    `#timeline-foundation .timeline-clip[data-action="clip"][data-id="${layerId}"]`,
  );
  // The timeline re-renders its clips while a new video's filmstrip and
  // waveform arrive, so the element can be replaced mid-action; retry the
  // whole right-click until the menu is open.
  await expect(async () => {
    await clip.click({ button: 'right', position: { x: 20, y: 10 } });
    await expect(menu(page)).toBeVisible({ timeout: 1000 });
  }).toPass();
  return clip;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (
    await chooser
  ).setFiles([WEBM, JPG].map((name) => path.join(MEDIA, name)));
  await expect(page.locator('#media-import')).toBeHidden();
});

test('[TL-075] a video clip menu: its own section with shortcuts, then the earlier entries; Audio, Edit duration, Rename and More options work, by mouse and keyboard', async ({
  page,
}, testInfo) => {
  const video = await addToScene(page, WEBM);
  await clipMenu(page, video);
  const shown = await entries(page);
  expect(shown.slice(0, 11)).toEqual([
    'Duplicate',
    'Copy',
    'Paste',
    'Delete',
    'Split',
    'Freeze frame',
    'Edit duration',
    'Rename',
    'Audio ›',
    'Auto cut',
    'More options',
  ]);
  // The earlier entries follow a divider (none of them repeated); V2
  // (D-191): the lane's own actions follow a second one.
  await expect(menu(page).locator('.timeline-menu-divider')).toHaveCount(2);
  expect(shown).toContain('Cut');
  expect(shown.filter((item) => item === 'Duplicate')).toHaveLength(1);
  // Detach audio stays where it was (in the earlier entries) and is also in
  // the Audio submenu.
  expect(shown).toContain('Detach audio');
  // Shortcuts on the right; Auto cut is planned.
  const row = (command: string) =>
    menu(page).locator(`[data-command="${command}"]`);
  await expect(row('duplicate')).toHaveAttribute('aria-keyshortcuts', 'Ctrl+D');
  await expect(row('split')).toHaveAttribute('aria-keyshortcuts', 'S');
  await expect(row('freeze')).toHaveAttribute('aria-keyshortcuts', 'F');
  const autoCut = menu(page).locator('[data-action="auto-cut"]');
  await expect(autoCut).toBeDisabled();
  await expect(autoCut).toHaveAttribute('title', 'Planned: Wave 10 (AI-008)');
  await page.screenshot({ path: testInfo.outputPath('video-menu.png') });
  // Keyboard: Down moves, End goes to the last entry, Up comes back;
  // Right on Audio opens its submenu, Left returns.
  await expect(row('duplicate')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(row('copy')).toBeFocused();
  // Down skips disabled entries (Paste with nothing copied, Split at the
  // clip's start): every press moves on until Audio.
  const audioMenu = menu(page).locator('[data-action="audio-menu"]');
  for (
    let i = 0;
    i < 8 &&
    !(await audioMenu.evaluate((item) => item === document.activeElement));
    i++
  ) {
    const before = await page.evaluate(
      () => document.activeElement?.textContent,
    );
    await page.keyboard.press('ArrowDown');
    expect(
      await page.evaluate(() => document.activeElement?.textContent),
    ).not.toBe(before);
  }
  await expect(menu(page).locator('[data-action="audio-menu"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(row('clip-mute')).toBeVisible();
  await expect(row('detach-audio')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(row('duplicate')).toBeVisible();
  // Audio › Mute mutes the clip's lane, one step.
  await menu(page).locator('[data-action="audio-menu"]').click();
  await row('clip-mute').click();
  expect((await labels(page)).at(-1)).toBe('Mute');
  const lane = (await scene(page)).tracks.find((track) =>
    track.clips.some((clip) => clip.layerId === video),
  )!;
  expect(lane.muted).toBe(true);
  // Edit duration: a popover with the duration only.
  await clipMenu(page, video);
  await row('edit-duration').click();
  const popover = page.locator('.element-timing-popover');
  await expect(popover).toBeVisible();
  await expect(popover.locator('#element-timing-start')).toHaveCount(0);
  await popover.locator('#element-timing-duration').fill('1.5');
  await popover.locator('#element-timing-duration').press('Enter');
  expect((await labels(page)).at(-1)).toBe('Edit timing');
  const timed = (await scene(page)).tracks
    .flatMap((track) => track.clips)
    .find((clip) => clip.layerId === video)!;
  expect(timed.duration).toBe(1.5);
  await page.keyboard.press('Escape');
  // Rename: in place, one step; the clip and its layer take the name.
  await clipMenu(page, video);
  await row('rename-clip').click();
  const field = page.locator('.timeline-rename');
  await expect(field).toBeFocused();
  await field.fill('Intro shot');
  await field.press('Enter');
  expect((await labels(page)).at(-1)).toBe('Rename');
  const renamed = await scene(page);
  expect(renamed.layers.find((item) => item.id === video)!.name).toBe(
    'Intro shot',
  );
  expect(
    renamed.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.layerId === video)!.name,
  ).toBe('Intro shot');
  // More options opens the right panel.
  await clipMenu(page, video);
  await row('more-options').click();
  await expect
    .poll(() =>
      page
        .locator('.editor-shell')
        .evaluate((shell) => !shell.classList.contains('inspector-collapsed')),
    )
    .toBe(true);
  // F freezes the selected video clip (the timeline has focus).
  await page.keyboard.press('f');
  expect((await labels(page)).at(-1)).toBe('Freeze frame');
});

test('[TL-075] an image clip and a text clip have their own lists: no Freeze frame, Audio or Auto cut', async ({
  page,
}) => {
  const image = await addToScene(page, JPG);
  await clipMenu(page, image);
  expect((await entries(page)).slice(0, 8)).toEqual([
    'Duplicate',
    'Copy',
    'Paste',
    'Delete',
    'Split',
    'Edit duration',
    'Rename',
    'More options',
  ]);
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
  await clipMenu(page, 'example-headline');
  const text = await entries(page);
  expect(text.slice(0, 8)).toEqual([
    'Duplicate',
    'Copy',
    'Paste',
    'Delete',
    'Split',
    'Edit duration',
    'Rename',
    'More options',
  ]);
  expect(text).not.toContain('Auto cut');
});
