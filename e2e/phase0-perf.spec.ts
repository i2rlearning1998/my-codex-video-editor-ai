import path from 'node:path';
import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  showCategory,
  showSceneStrip,
  seekKeep,
  settled,
  openRight,
} from './fixtures';

// PHASE 0 E2: effects, masks and chroma key, measured in the browser (the
// renderer's own time per draw, from the read-only test hook).
const MEDIA = 'tests/fixtures/media';
const JPG = 'image_testsrc_1200x800.jpg';
const WEBM = 'video_testsrc_720p_2s_vp9_opus.webm';
const panel = (page: Page) => page.locator('#right-section');
const tile = (page: Page, key: string) =>
  panel(page).locator(`.fx-tile[data-tile="${key}"]`);
const renderMs = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __AIVE__: { getCanvas(): { renderMs: number[] } };
        }
      ).__AIVE__.getCanvas().renderMs,
  );
const median = (list: number[]) =>
  [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)] ?? 0;

import { oneClip } from './phase0-helpers';
/** Draws the scene again n times (a tiny seek each) and returns the times. */
async function paused(page: Page, n = 12) {
  for (let i = 0; i < n; i++) {
    await seekKeep(page, 0.5 + (i + 1) * 0.067);
    await settled(page);
  }
  return (await renderMs(page)).slice(-n);
}
async function playing(page: Page) {
  await page.locator('[data-action="play"]').click();
  await page.waitForTimeout(1200);
  const times = (await renderMs(page)).slice(-30);
  await page.locator('[data-action="play"]').click();
  return times;
}

const results: Record<string, unknown>[] = [];
for (const [label, file] of [
  ['image', JPG],
  ['video', WEBM],
] as const)
  for (const size of ['1920x1080'] as const)
    test(`[FX5-013] ${label} at ${size}: paused and playing frame time with a mask, chroma key, blur, glow and blur+glow`, async ({
      page,
    }) => {
      test.setTimeout(300_000);
      await oneClip(page, file);
      const row: Record<string, unknown> = { label, size };
      row.plain = { paused: median(await paused(page)) };
      await openRight(page, 'Effects');
      const masks = panel(page).locator('[data-accordion="layer-masks"]');
      await masks.locator('[data-action="mask-add-rect"]').click();
      row.mask = {
        paused: median(await paused(page)),
        playing: median(await playing(page)),
      };
      await openRight(page, 'Effects');
      const chroma = panel(page).locator('[data-accordion="layer-chroma"]');
      await chroma.locator('[data-action="chroma-enable"]').click();
      row.maskChroma = {
        paused: median(await paused(page)),
        playing: median(await playing(page)),
      };
      await openRight(page, 'Effects');
      await tile(page, 'effect.blur').click();
      row.blur = {
        paused: median(await paused(page)),
        playing: median(await playing(page)),
      };
      await tile(page, 'effect.glow').click();
      row.blurGlow = {
        paused: median(await paused(page)),
        playing: median(await playing(page)),
      };
      console.log('PERF', JSON.stringify(row));
      results.push(row);
      expect(hook).toBeTruthy();
    });
