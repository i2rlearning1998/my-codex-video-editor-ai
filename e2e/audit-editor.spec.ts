import path from 'node:path';
import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  showCategory,
  allowError,
  seekKeep,
} from './fixtures';

// AUDIT-EDITOR (Part A): rows that were Todo or Claimed but are built. Each
// test proves its row with the mouse and keyboard, as a user would; the
// read-only hook only checks the result (reports/AUDIT-EDITOR.md).
const MEDIA = 'tests/fixtures/media';

async function ready(page: Page) {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
}
const scene = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
};
const clipOf = (page: Page, layerId: string) =>
  page.locator(
    `#timeline-foundation .timeline-clip[data-action="clip"][data-id="${layerId}"]`,
  );
async function importMedia(page: Page, ...names: string[]) {
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles(names.map((name) => path.join(MEDIA, name)));
  await expect(page.locator('#media-import')).toBeHidden({ timeout: 30_000 });
}

test('[APP-004] Open project with an invalid file shows a clear error and changes nothing', async ({
  page,
}) => {
  await ready(page);
  const before = JSON.stringify((await hook(page)).project);
  await page.locator('#menu-trigger').click();
  await page.locator('#import').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"not": "a project"'),
  });
  await expect(page.locator('.toast').first()).toContainText('Open failed');
  expect(JSON.stringify((await hook(page)).project)).toBe(before);
});

test('[APP-011] Help offers Keyboard shortcuts, About and Copy debug report', async ({
  page,
}) => {
  await ready(page);
  await page.locator('#menu-trigger').click();
  const help = page.locator('#app-menu');
  await expect(help.locator('#open-shortcuts')).toBeVisible();
  await expect(help.locator('#about')).toBeVisible();
  await expect(
    help.getByRole('button', { name: 'Copy debug report' }),
  ).toBeVisible();
  await help.locator('#open-shortcuts').click();
  await expect(page.locator('#shortcut-sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('#menu-trigger').click();
  await help.locator('#about').click();
  await expect(page.locator('.modal-dialog')).toBeVisible();
});

test('[APP-012] the project name edits inline: Enter commits, Escape cancels', async ({
  page,
}) => {
  await ready(page);
  const name = page.locator('#project-name');
  const original = (await name.textContent())!;
  await name.click();
  await page.locator('#project-name-input').fill('Lesson one');
  await page.keyboard.press('Enter');
  await expect(name).toHaveText('Lesson one');
  await name.click();
  await page.locator('#project-name-input').fill('Not kept');
  await page.keyboard.press('Escape');
  await expect(name).toHaveText('Lesson one');
  expect((await hook(page)).project.metadata.name).toBe('Lesson one');
  expect(original).not.toBe('Lesson one');
});

test('[LAY-010] the full-screen button shows the stage full screen and says how to leave', async ({
  page,
}) => {
  await ready(page);
  const button = page.locator('#fullscreen-preview');
  await expect(button).toBeEnabled();
  await expect(button).not.toHaveAttribute('title', /later wave/);
  await button.click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(false);
});

test('[LAY-017] a modal traps Tab, closes on Escape and gives focus back to its trigger', async ({
  page,
}) => {
  await ready(page);
  // About: Escape closes it.
  await page.locator('#menu-trigger').click();
  await page.locator('#about').click();
  const dialog = page.locator('.modal-dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // Export (a persistent modal): Tab stays inside, the close button gives
  // focus back to the Export button.
  await page.locator('#export').click();
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(
        () => !!document.activeElement?.closest('.modal-dialog'),
      ),
    ).toBe(true);
  }
  await dialog.locator('.modal-close').click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id ?? ''))
    .toBe('export');
});

test('[KEY-004][KEY-010][KEY-014] Ctrl+A, Ctrl+G, Ctrl+Shift+G, Ctrl+D, Ctrl+C, Ctrl+V, Delete and Cmd act on the selection', async ({
  page,
}) => {
  await ready(page);
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const count = (await scene(page)).layers.length;
  await page.keyboard.press('Control+a');
  expect((await hook(page)).session.selectedIds.length).toBeGreaterThan(1);
  await page.keyboard.press('Control+g');
  await expect
    .poll(async () => (await hook(page)).history.labels.at(-1))
    .toBe('Group');
  await page.keyboard.press('Control+Shift+g');
  await expect
    .poll(async () => (await hook(page)).history.labels.at(-1))
    .toBe('Ungroup');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press('Control+d');
  await expect
    .poll(async () => (await scene(page)).layers.length)
    .toBe(count + 1);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect
    .poll(async () => (await scene(page)).layers.length)
    .toBe(count + 2);
  await page.keyboard.press('Delete');
  await expect
    .poll(async () => (await scene(page)).layers.length)
    .toBe(count + 1);
  // KEY-014: Cmd works like Ctrl.
  await page.keyboard.press('Meta+z');
  await expect
    .poll(async () => (await scene(page)).layers.length)
    .toBe(count + 2);
});

test('[PRJ-009] autosave keeps an edit across a reload', async ({ page }) => {
  await ready(page);
  await clipOf(page, 'example-badge').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('#save-status-text')).toHaveText(/Saved/);
  await page.reload();
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  expect(
    (await scene(page)).layers.some((layer) => layer.id === 'example-badge'),
  ).toBe(false);
});

test('[PRJ-011] a scene lasts as long as its content; an empty scene lasts 10 seconds', async ({
  page,
}) => {
  await ready(page);
  await page.locator('#scene-strip-show').click();
  await page.locator('#scene-strip-add').click();
  await page.locator('[data-action="strip-add-blank"]').click();
  await expect.poll(async () => (await scene(page)).layers.length).toBe(0);
  expect((await scene(page)).duration).toBe(10);
  await expect(
    page.locator('#timeline-foundation [data-timecode]'),
  ).toContainText('0:10');
});

test('[MED-017][MED-022] Details show size, length, codecs, frame rate and sound channels; a rotated phone video is upright', async ({
  page,
}) => {
  await ready(page);
  await importMedia(
    page,
    'video_testsrc_1080p_2s_h264_aac.mp4',
    'video_rotation90_metadata_portrait_no_audio.mp4',
  );
  await page
    .locator('.media-card[data-name="video_testsrc_1080p_2s_h264_aac.mp4"]')
    .click({ button: 'right' });
  await page.locator('#media-menu [data-action="media-details"]').click();
  const details = page.locator('.media-details');
  for (const text of [
    '1,920 × 1,080',
    '30 fps',
    'avc',
    'aac',
    'MB',
    '00:00:02',
  ])
    await expect(details).toContainText(text);
  await expect(details).toContainText(/channel|stereo|mono/i);
  await page.keyboard.press('Escape');
  const asset = (await hook(page)).project.assets.find(
    (item) => item.name === 'video_rotation90_metadata_portrait_no_audio.mp4',
  )!;
  const probe = (
    asset.metadata as { mediaProbe: { width: number; height: number } }
  ).mediaProbe;
  expect(probe.height).toBeGreaterThan(probe.width);
});

test('[MED-025] importing the same file again is detected and adds nothing', async ({
  page,
}) => {
  await ready(page);
  await importMedia(page, 'image_testsrc_1200x800.jpg');
  const count = (await hook(page)).project.assets.length;
  await importMedia(page, 'image_testsrc_1200x800.jpg');
  await expect(page.locator('.toast').last()).toContainText(
    'already in Project Media',
  );
  expect((await hook(page)).project.assets.length).toBe(count);
});

test('[LYR-003][LYR-005][INS-011] the Scene list multi-selects with Ctrl and Shift and renames by double-click and F2', async ({
  page,
}) => {
  await ready(page);
  await showCategory(page, 'Scene');
  const row = (id: string) =>
    page.locator(`#scene-list .outliner-row[data-layer-id="${id}"]`);
  await row('example-edition').click();
  await row('example-kicker').click({ modifiers: ['Control'] });
  expect([...(await hook(page)).session.selectedIds].sort()).toEqual([
    'example-edition',
    'example-kicker',
  ]);
  await row('example-edition').click();
  await row('example-subtitle').click({ modifiers: ['Shift'] });
  expect((await hook(page)).session.selectedIds.length).toBeGreaterThan(2);
  await row('example-edition').locator('.outliner-name').dblclick();
  await page.locator('.outliner-rename').fill('Issue number');
  await page.keyboard.press('Enter');
  await expect(row('example-edition').locator('.outliner-name')).toHaveText(
    'Issue number',
  );
  await row('example-kicker').click();
  await page.keyboard.press('F2');
  await page.locator('.outliner-rename').fill('Kicker line');
  await page.keyboard.press('Enter');
  const names = (await scene(page)).layers.map((layer) => layer.name);
  expect(names).toContain('Issue number');
  expect(names).toContain('Kicker line');
});

test('[TL-033] a clip can be disabled without deleting it, and enabled again', async ({
  page,
}) => {
  await ready(page);
  const clip = clipOf(page, 'example-badge');
  const enabled = async () =>
    (await scene(page)).tracks
      .flatMap((track) => track.clips)
      .find((item) => item.layerId === 'example-badge')!.enabled;
  for (const expected of [false, true]) {
    await clip.click({ button: 'right', position: { x: 20, y: 10 } });
    const menu = page.locator('#timeline-foundation .timeline-menu');
    await menu.locator('[data-action="clip-menu"]').click();
    await menu.locator('[data-action="toggle-enabled"]').click();
    await expect.poll(enabled).toBe(expected);
  }
  expect(
    (await scene(page)).layers.some((layer) => layer.id === 'example-badge'),
  ).toBe(true);
});

test('[TL-036][PB-003][PB-004][PB-008] M adds a marker; frame buttons and keys step; jumps go to the ends; the timeline, timecode and frame field agree', async ({
  page,
}) => {
  await ready(page);
  const bar = page.locator('#timeline-foundation');
  const time = async () => (await hook(page)).session.time;
  await bar.locator('[aria-label="Next frame"]').click();
  await expect.poll(time).toBeCloseTo(1 / 30, 5);
  await bar.locator('[aria-label="Previous frame"]').click();
  await expect.poll(time).toBe(0);
  await bar.locator('[aria-label="Last frame (End)"]').click();
  await expect.poll(time).toBeCloseTo(10, 3);
  await bar.locator('[aria-label="First frame (Home)"]').click();
  await expect.poll(time).toBe(0);
  await page.locator('#timeline-foundation .timeline-scroll').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(time).toBeCloseTo(2 / 30, 5);
  await page.keyboard.press('m');
  await expect
    .poll(async () => (await scene(page)).markers?.length ?? 0)
    .toBe(1);
  expect((await scene(page)).markers![0]!.time).toBeCloseTo(2 / 30, 5);
  await seekKeep(page, 1.5);
  await expect(page.locator('#frame-current')).toHaveValue('45');
  await expect(bar.locator('[data-timecode]')).toContainText('0:01');
});

test('[TL-045] clip labels truncate inside their clip at the smallest zoom', async ({
  page,
}) => {
  await ready(page);
  const out = page.locator('[aria-label="Timeline zoom out"]');
  for (let i = 0; i < 12; i++) await out.click();
  const overflow = await page
    .locator('#timeline-foundation .timeline-clip[data-action="clip"]')
    .evaluateAll((clips) =>
      clips.map((clip) => {
        const box = clip.getBoundingClientRect();
        return [...clip.querySelectorAll('*')].every((child) => {
          const inner = child.getBoundingClientRect();
          return (
            inner.width === 0 ||
            (inner.left >= box.left - 1 && inner.right <= box.right + 1)
          );
        });
      }),
    );
  expect(overflow.length).toBeGreaterThan(0);
  expect(overflow.every(Boolean)).toBe(true);
  void allowError;
});

test('[TR-018][CLR-001][FX-004] the scene bar Transition adds the transition into the next scene; Edit image opens Adjust colors and Filters (no stale planned state)', async ({
  page,
  openFixtureProject,
}) => {
  await ready(page);
  await openFixtureProject('two-scenes.json');
  const bar = page.locator('#context-toolbar');
  await expect(bar).toHaveAttribute('data-kind', 'scene');
  const transition = bar.locator('[data-control="transition"]');
  await expect(transition).not.toHaveAttribute('aria-disabled', 'true');
  await transition.click();
  await expect
    .poll(async () => (await hook(page)).history.labels.at(-1))
    .toBe('Add transition');
  await expect(
    page.locator('#rail-right [data-section="Transitions"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  // A picture's Edit image panel.
  await importMedia(page, 'image_testsrc_1200x800.jpg');
  await page
    .locator('.media-card[data-name="image_testsrc_1200x800.jpg"]')
    .click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBe(1);
  await bar.locator('[data-control="edit-image"]').click();
  const adjust = page.locator('[data-action="edit-adjust"]');
  await expect(adjust).toBeEnabled();
  await expect(adjust).not.toHaveAttribute('aria-disabled', 'true');
  await adjust.click();
  await expect(
    page.locator('#rail-right [data-section="Adjust"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  const filters = page.locator('[data-action="edit-filters"]');
  if (!(await filters.isVisible()))
    await bar.locator('[data-control="edit-image"]').click();
  await filters.click();
  await expect(
    page.locator('#rail-right [data-section="Filters"]'),
  ).toHaveAttribute('aria-pressed', 'true');
});
