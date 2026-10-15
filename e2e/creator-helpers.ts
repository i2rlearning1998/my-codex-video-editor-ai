import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, hook, openRightPanel, showCategory } from './fixtures';

// Shared steps of the Creator Pack specs (Q2 onward).
export const MOVE = readFileSync(
  'examples/creator-packs/move-preset.json',
  'utf8',
);
export const MOVE_ID = 'move-pack--preset-move';
export const FADE_ID = 'fade-pack--preset-fade';
/** An inline pack with one opacity preset. */
export const FADE = JSON.stringify({
  format: 'creator-pack',
  version: 1,
  pack: {
    id: 'fade-pack',
    name: { en: 'Fade pack' },
    version: 1,
    author: 'ai',
    createdWith: 'codex',
  },
  items: [
    {
      id: 'preset-fade',
      name: { en: 'Fade to level' },
      tags: ['original'],
      type: 'preset',
      data: {
        appliesTo: ['any'],
        controls: [
          {
            name: 'level',
            label: { en: 'Level' },
            type: 'number',
            default: 0.5,
            min: 0,
            max: 1,
            step: 0.1,
          },
        ],
        tracks: [
          {
            property: 'opacity',
            keys: [
              { t: 0, v: 1 },
              { t: 1, v: '$level' },
            ],
          },
        ],
      },
    },
  ],
});
export const dialog = (page: Page) => page.locator('.creator-pack-dialog');
export const panel = (page: Page) => page.locator('#right-section');

/** Imports a pack through Media › Import › Import creator pack. */
export async function importPack(page: Page, text: string) {
  await showCategory(page, 'Media');
  await page.locator('#import-menu').click();
  await page.locator('#import-creator').click();
  await dialog(page).locator('#creator-source').fill(text);
  const check = dialog(page).locator('#creator-check');
  // Q4: checks run on their own; earlier builds had a Run checks button.
  if (await check.count()) {
    await expect(check).toBeEnabled();
    await check.click();
  }
  await expect(dialog(page).locator('#creator-summary')).toHaveText(
    /passed the checks/,
    { timeout: 60_000 },
  );
  await dialog(page).locator('#creator-add').click();
  await expect(dialog(page).locator('#creator-items')).toBeHidden();
}
export async function selectBadge(page: Page) {
  await showCategory(page, 'Scene');
  await page.locator('#scene-list [data-layer-id="example-badge"]').click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual(['example-badge']);
  await openRightPanel(page);
}
export interface Frame {
  time: number;
  value: unknown;
  easing?: unknown;
}
export const badge = async (page: Page) => {
  const project = (await hook(page)).project as unknown as {
    compositions: {
      layers: {
        id: string;
        transform: Record<string, { keyframes: Frame[]; animated: boolean }>;
        properties: Record<string, { value: unknown }>;
      }[];
      tracks: { clips: { layerId: string; startTime: number }[] }[];
    }[];
  };
  const composition = project.compositions[0]!;
  const layer = composition.layers.find((item) => item.id === 'example-badge')!;
  const start = composition.tracks
    .flatMap((track) => track.clips)
    .find((clip) => clip.layerId === 'example-badge')!.startTime;
  return { layer, start };
};
export const frames = async (page: Page, key = 'position') =>
  (await badge(page)).layer.transform[key]!.keyframes;
