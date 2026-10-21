import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory, openRight } from './fixtures';

// FIX1 F5: the left Audio category is libraries only; the Mixer is the right
// panel's Project audio with nothing selected; every slider + number row
// sits on one line with its thumb on the track.
const MEDIA = 'tests/fixtures/media/';

/** Every visible slider row in `root`: label, slider and number on one line. */
const sliderRows = (page: Page, root: string) =>
  page.evaluate((root) => {
    const out: string[] = [];
    const rows = [
      ...document.querySelectorAll<HTMLElement>(
        `${root} .number-field.has-slider`,
      ),
    ].filter((row) => row.checkVisibility() && row.offsetParent !== null);
    for (const row of rows) {
      const part = (selector: string) =>
        row.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
      const label = part(':scope > .number-field-label');
      const range = part('input[type="range"]');
      const input = part(':scope > .number-field-input');
      const box = row.getBoundingClientRect();
      if (!range || !input) {
        out.push(`${row.id || row.className}: missing parts`);
        continue;
      }
      const mid = (r: DOMRect) => r.top + r.height / 2;
      if (
        Math.abs(mid(range) - mid(input)) > 4 ||
        (label && Math.abs(mid(label) - mid(input)) > 4)
      )
        out.push(`${row.querySelector('input')?.id}: not one line`);
      if (range.height > 8)
        out.push(
          `${row.querySelector('input')?.id}: track ${range.height}px tall`,
        );
      if (range.width < 40)
        out.push(
          `${row.querySelector('input')?.id}: slider ${range.width}px wide`,
        );
      if (input.right > box.right + 1 || range.left < box.left - 1)
        out.push(`${row.querySelector('input')?.id}: overflows its row`);
      if (label && label.right > range.left + 1)
        out.push(`${row.querySelector('input')?.id}: label over slider`);
      if (range.right > input.left + 1)
        out.push(`${row.querySelector('input')?.id}: slider over number`);
    }
    return { count: rows.length, problems: out };
  }, root);

test('[FX1-012] the left Audio category is libraries only (Sound effects, Music, My audio) and the right panel shows Project audio with nothing selected', async ({
  page,
}) => {
  await page.goto('/');
  await showCategory(page, 'Media');
  await page
    .locator('#import-media-input')
    .setInputFiles(MEDIA + 'audio_tone_440hz_3s.wav');
  await expect(page.locator('#media-panel .shelf-item')).toHaveCount(1);
  await showCategory(page, 'Audio');
  const left = page.locator('#library-audio');
  await expect(left.locator('#mixer-master')).toHaveCount(0);
  await expect(left.locator('.audio-mixer')).toHaveCount(0);
  await expect(left.locator('[role="tab"]')).toHaveText([
    'Sound effects',
    'Music',
    'My audio',
  ]);
  await expect(left.locator('.sound-tile').first()).toBeVisible();
  await left.locator('[data-audio-tab="music"]').click();
  await expect(left.locator('.stock-message[data-state="key"]')).toContainText(
    'Freesound',
  );
  await left.locator('[data-audio-tab="mine"]').click();
  await expect(left.locator('.audio-mine-item')).toHaveCount(1);
  const lanes = (await hook(page)).project.compositions[0]!.tracks.length;
  await left.locator('[data-action="audio-mine-add"]').click();
  await expect
    .poll(async () => (await hook(page)).project.compositions[0]!.tracks.length)
    .toBe(lanes + 1);
  // Nothing selected: Project audio in the right panel.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBe(0);
  const audioRail = page.locator('#rail-right [data-section="Audio"]');
  await expect(audioRail).toHaveAttribute('title', 'Project audio');
  await audioRail.click();
  await expect(page.locator('#right-panel-title')).toHaveText('Project audio');
  const right = page.locator('#inspector-panel');
  const master = right.locator('#mixer-master');
  await expect(master).toBeVisible();
  await expect(right.locator('.audio-mixer-track')).not.toHaveCount(0);
  await master.fill('150');
  await master.press('Enter');
  await expect
    .poll(async () => (await hook(page)).project.settings.masterVolume)
    .toBe(1.5);
  // Nothing in the Mixer reaches past the panel.
  const panelRight = (await right.boundingBox())!;
  const widest = await right
    .locator('.audio-mixer *')
    .evaluateAll((els) =>
      Math.max(...els.map((el) => el.getBoundingClientRect().right)),
    );
  expect(widest).toBeLessThanOrEqual(panelRight.x + panelRight.width + 1);
  await page.screenshot({ path: 'reports/fix1/f5-project-audio.png' });
});

test('[FX1-013] slider rows (master and lane volume, clip volume, opacity, speed) keep label, slider and number on one line with a thin track', async ({
  page,
}) => {
  await page.goto('/');
  await showCategory(page, 'Media');
  await page
    .locator('#import-media-input')
    .setInputFiles([
      MEDIA + 'audio_tone_440hz_3s.wav',
      MEDIA + 'video_av_sync_flash_beep_720p.webm',
    ]);
  await expect(page.locator('#media-panel .shelf-item')).toHaveCount(2);
  await page
    .locator('#media-panel .media-item', { hasText: 'audio_tone' })
    .dblclick();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const audioRail = page.locator('#rail-right [data-section="Audio"]');
  await expect(audioRail).toHaveAttribute('title', 'Project audio');
  await audioRail.click();
  await expect(page.locator('#mixer-master')).toBeVisible();
  const project = await sliderRows(page, '#inspector-panel');
  expect(project.count).toBeGreaterThanOrEqual(2);
  expect(project.problems).toEqual([]);
  // A clip's Audio, Speed and Properties (opacity) rows.
  await page
    .locator('#media-panel .media-item', { hasText: 'video_av_sync' })
    .dblclick();
  for (const section of ['Audio', 'Speed', 'Properties', 'Fade']) {
    const button = page.locator(`#rail-right [data-section="${section}"]`);
    if (!(await button.isVisible())) continue;
    await openRight(page, section);
    const rows = await sliderRows(page, '#inspector-panel');
    expect(rows.problems, section).toEqual([]);
    if (section === 'Audio')
      await page
        .locator('#inspector-panel')
        .screenshot({ path: 'reports/fix1/f5-clip-audio.png' });
  }
});
