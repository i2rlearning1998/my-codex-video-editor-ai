import path from 'node:path';
import type { Page } from '@playwright/test';
import {
  expect,
  showCategory,
  showSceneStrip,
  seekKeep,
  settled,
} from './fixtures';
const MEDIA = 'tests/fixtures/media';
import { readFileSync } from 'node:fs';

/** A composition pack with many scenes of text and shape items (a stress case). */
export function bigCompositionPack(scenes = 40, perScene = 14): string {
  const base = JSON.parse(
    readFileSync(
      'examples/creator-packs/composition-documentary-mini.json',
      'utf8',
    ),
  ) as { items: { id: string; type: string; data: any }[] };
  const item = base.items.find((entry) => entry.type === 'composition')!;
  const spec = item.data.spec;
  spec.assets = [];
  spec.scenes = Array.from({ length: scenes }, (_, s) => ({
    id: `scene-${s}`,
    name: `Scene ${s + 1}`,
    duration: 4,
    items: Array.from({ length: perScene }, (_, i) =>
      i % 3 === 2
        ? {
            id: `s${s}-shape-${i}`,
            name: `Shape ${i}`,
            kind: 'text',
            start: 0,
            duration: 4,
            text: `Line ${s}.${i} of the long story`,
            width: 900,
            height: 80,
            transform: { x: 100 + (i % 5) * 40, y: 60 + i * 60 },
            fill: '#f4efe6',
          }
        : {
            id: `s${s}-text-${i}`,
            name: `Text ${i}`,
            kind: 'text',
            start: 0.2 * (i % 5),
            duration: 3.1,
            text: `Scene ${s} text ${i}: where does honey come from?`,
            width: 1200,
            height: 100,
            transform: { x: 80, y: 40 + i * 62 },
            fill: '#ffffff',
          },
    ),
    cameraMoves: [],
  }));
  item.data.slots = [];
  item.data.voiceOver = undefined;
  item.data.captions = undefined;
  return JSON.stringify({
    ...base,
    items: [item],
  });
}

/** Records the page's long tasks (over 50 ms) from now on. */
export async function watchLongTasks(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __long: number[] };
    w.__long = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.__long.push(entry.duration);
    }).observe({ entryTypes: ['longtask'] });
  });
}
export const longTasks = (page: Page) =>
  page.evaluate(() => (window as unknown as { __long: number[] }).__long ?? []);

/** Just the Composition Spec (a Tier A code animation) of the stress pack. */
export function bigCompositionSpec(scenes = 40, perScene = 14): string {
  const pack = JSON.parse(bigCompositionPack(scenes, perScene)) as {
    items: { data: { spec: unknown } }[];
  };
  return JSON.stringify(pack.items[0]!.data.spec);
}

export async function oneClip(page: Page, file: string) {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await showSceneStrip(page);
  await page.locator('#scene-strip-add').click();
  await page.locator('[data-action="strip-add-blank"]').click();
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles([path.join(MEDIA, file)]);
  await expect(page.locator('#media-import')).toBeHidden();
  await page
    .locator(`.media-item:has(.media-card[data-name="${file}"]) .media-card`)
    .click({ button: 'right' });
  await page.locator('#media-menu [data-action="media-add"]').click();
  await seekKeep(page, 0.5);
  await settled(page);
}
